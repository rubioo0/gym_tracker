#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import Papa from 'papaparse'

const EZGIF_BASE_URL = 'https://ezgif.com'
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const scriptPath = fileURLToPath(import.meta.url)
const scriptDir = path.dirname(scriptPath)
const trainingOsRoot = path.resolve(scriptDir, '..')
const defaultPublicGifDir = path.join(trainingOsRoot, 'public', 'GIF')

const defaultOptions = {
  start: 0,
  end: 5,
  fps: 10,
  size: 'original',
  crop: 'none',
  ar: 'no',
  method: 'ezgif',
  loop: 0,
  concurrency: 1,
  delayMs: 0,
  timeoutMs: 120000,
  retries: 1,
  limit: null,
  dryRun: false,
  overwrite: false,
  encoding: 'utf-8',
  csvLinkMode: 'ezgif',
  publicBaseUrl: '',
  publicGifPrefix: 'GIF',
}

function printUsage() {
  console.log(`CSV to GIF converter via EZGIF

Usage:
  node scripts/ezgif-from-csv.mjs --input <csv-path> [options]

Required:
  --input <path>              CSV file path (exercise links in column 9)

Optional:
  --output-csv <path>         Output CSV path (default: <input>.gif.csv)
  --output-dir <path>         Local GIF directory (default: ./public/GIF)
  --manifest <path>           JSON report path (default: <output-csv>.manifest.json)
  --report-csv <path>         CSV report path (default: <output-csv>.report.csv)
  --csv-link-mode <value>     CSV reference target: ezgif | public-base (default: ezgif)
  --public-base-url <url>     Base URL for public-base mode (ex: https://rubioo0.github.io/gym_tracker/)
  --public-gif-prefix <path>  URL prefix under public-base (default: GIF)
  --start <number>            GIF start second (default: 0)
  --end <number>              GIF end second (default: 5)
  --fps <number>              GIF fps (default: 10)
  --size <value>              EZGIF size option (default: original)
  --crop <value>              EZGIF crop option (default: none)
  --ar <value>                EZGIF aspect-ratio option (default: no)
  --method <value>            EZGIF method (default: ezgif)
  --loop <number>             GIF loop count (default: 0)
  --concurrency <number>      Parallel jobs (default: 1)
  --delay-ms <number>         Delay before each job (default: 0)
  --timeout-ms <number>       Request timeout (default: 120000)
  --retries <number>          Retries for network steps (default: 1)
  --limit <number>            Process only first N matching rows
  --encoding <name>           Input CSV encoding (default: utf-8)
  --overwrite                 Replace existing local GIF files
  --dry-run                   Parse and plan only (no network, no file output)
  --help                      Show this help

Examples:
  node scripts/ezgif-from-csv.mjs --input ../Book 2(РУКИ (2)).csv
  node scripts/ezgif-from-csv.mjs --input ../Book 2(РУКИ (2)).csv --limit 3 --dry-run
  node scripts/ezgif-from-csv.mjs --input ../Book 2(РУКИ (2)).csv --output-csv ../Book 2(РУКИ (2))-gif.csv --output-dir ./public/GIF --csv-link-mode public-base --public-base-url https://rubioo0.github.io/gym_tracker/
`)
}

function parseArgs(argv) {
  const args = {}

  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) {
      continue
    }

    const [rawKey, inlineValue] = token.split('=', 2)
    const key = rawKey.slice(2)

    if (key === 'help' || key === 'dry-run' || key === 'overwrite') {
      args[key] = true
      continue
    }

    let value = inlineValue
    if (value === undefined) {
      value = argv[index + 1]
      index += 1
    }

    args[key] = value
  }

  return args
}

function parseNumberOption(value, optionName, fallback, { min, allowFloat = true } = {}) {
  if (value === undefined || value === null || value === '') {
    return fallback
  }

  const parsed = allowFloat ? Number(value) : Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric value for --${optionName}: ${value}`)
  }

  if (typeof min === 'number' && parsed < min) {
    throw new Error(`Option --${optionName} must be >= ${min}`)
  }

  return parsed
}

function isExerciseRow(row) {
  return /^\d+$/.test(String(row[0] ?? '').trim())
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value ?? '').trim())
}

function ensureColumnCount(row, count) {
  const nextRow = [...row]
  while (nextRow.length < count) {
    nextRow.push('')
  }
  return nextRow
}

function normalizeCell(value) {
  if (typeof value !== 'string') {
    return ''
  }

  return value.replace(/\r/g, '')
}

function sanitizeSlug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

function shortHash(value) {
  return crypto.createHash('sha1').update(value).digest('hex').slice(0, 8)
}

function normalizeGifUrl(value) {
  const rawValue = String(value ?? '').trim()
  if (rawValue.length === 0) {
    return null
  }

  if (rawValue.startsWith('https://') || rawValue.startsWith('http://')) {
    return rawValue
  }

  if (rawValue.startsWith('//')) {
    return `https:${rawValue}`
  }

  if (rawValue.startsWith('/')) {
    return `${EZGIF_BASE_URL}${rawValue}`
  }

  if (/^[a-z0-9.-]+\.[a-z]{2,}\//i.test(rawValue)) {
    return `https://${rawValue}`
  }

  return null
}

function extractGifUrlFromHtml(html) {
  const scopedImgMatch = html.match(
    /<p\s+class="outfile">\s*<img\s+[^>]*src=["']([^"']+?\.gif(?:\?[^"']*)?)["']/i,
  )
  if (scopedImgMatch?.[1]) {
    return normalizeGifUrl(scopedImgMatch[1])
  }

  const genericImgMatch = html.match(
    /<img\s+[^>]*src=["']([^"']+?\.gif(?:\?[^"']*)?)["']/i,
  )
  if (genericImgMatch?.[1]) {
    return normalizeGifUrl(genericImgMatch[1])
  }

  const genericMatch = html.match(
    /(https?:\/\/[^"'\s<>]+?\.gif(?:\?[^"'\s<>]*)?|\/\/[^"'\s<>]+?\.gif(?:\?[^"'\s<>]*)?|\/tmp\/[^"'\s<>]+?\.gif(?:\?[^"'\s<>]*)?)/i,
  )

  return genericMatch?.[1] ? normalizeGifUrl(genericMatch[1]) : null
}

function extractJobFileFromLocation(locationValue) {
  const location = normalizeGifUrl(locationValue)
  if (!location) {
    return null
  }

  const url = new URL(location)
  const match = url.pathname.match(/\/video-to-gif\/([^/]+)\.html$/i)
  if (!match?.[1]) {
    return null
  }

  return decodeURIComponent(match[1])
}

function createAbortSignal(timeoutMs) {
  return AbortSignal.timeout(timeoutMs)
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, options)
  const text = await response.text()
  return { response, text }
}

async function runWithRetries(action, retries) {
  let attempt = 0
  let lastError = null

  while (attempt <= retries) {
    try {
      return await action(attempt)
    } catch (error) {
      lastError = error
      if (attempt >= retries) {
        break
      }

      const backoffMs = 350 * (attempt + 1)
      await sleep(backoffMs)
    }

    attempt += 1
  }

  throw lastError
}

async function createEzgifJob(videoUrl, options) {
  const form = new URLSearchParams()
  form.set('new-image-url', videoUrl)

  const response = await fetch(`${EZGIF_BASE_URL}/video-to-gif`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body: form,
    redirect: 'manual',
    signal: createAbortSignal(options.timeoutMs),
  })

  const directLocation = response.headers.get('location')
  const locationCandidate =
    directLocation || (response.redirected ? response.url : null)

  let jobFile = locationCandidate
    ? extractJobFileFromLocation(locationCandidate)
    : null

  if (!jobFile) {
    const html = await response.text()
    const inlineMatch = html.match(/\/video-to-gif\/([^"'\s<>]+?\.mp4)\.html/i)
    if (inlineMatch?.[1]) {
      jobFile = inlineMatch[1]
    }
  }

  if (!jobFile) {
    throw new Error(`Upload did not return a usable EZGIF job for URL: ${videoUrl}`)
  }

  return {
    jobFile,
    pageUrl: `${EZGIF_BASE_URL}/video-to-gif/${encodeURIComponent(jobFile)}.html`,
  }
}

function buildConvertForm(jobFile, options, { includeAjax, includeSubmit }) {
  const form = new FormData()
  form.append('file', jobFile)
  form.append('start', String(options.start))
  form.append('end', String(options.end))
  form.append('size', String(options.size))
  form.append('crop', String(options.crop))
  form.append('ar', String(options.ar))
  form.append('fps', String(options.fps))
  form.append('fpsr', String(options.fps))
  form.append('detected-fps', '30')
  form.append('method', String(options.method))
  form.append('loop', String(options.loop))

  if (includeAjax) {
    form.append('ajax', 'true')
  }

  if (includeSubmit) {
    form.append('video-to-gif', 'Convert to GIF!')
  }

  return form
}

async function convertWithAjax(jobFile, pageUrl, options) {
  const endpoint = `${EZGIF_BASE_URL}/video-to-gif/${encodeURIComponent(jobFile)}?ajax=true`
  const form = buildConvertForm(jobFile, options, {
    includeAjax: true,
    includeSubmit: false,
  })

  const { response, text } = await fetchText(endpoint, {
    method: 'POST',
    headers: {
      Origin: EZGIF_BASE_URL,
      Referer: pageUrl,
      'User-Agent': USER_AGENT,
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: form,
    redirect: 'manual',
    signal: createAbortSignal(options.timeoutMs),
  })

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location')
    if (location?.includes('err=expired')) {
      return null
    }

    return null
  }

  if (!response.ok || text.trim().length === 0) {
    return null
  }

  return extractGifUrlFromHtml(text)
}

async function convertWithStandardForm(jobFile, pageUrl, options) {
  const endpoint = `${EZGIF_BASE_URL}/video-to-gif/${encodeURIComponent(jobFile)}`
  const form = buildConvertForm(jobFile, options, {
    includeAjax: false,
    includeSubmit: true,
  })

  const { response, text } = await fetchText(endpoint, {
    method: 'POST',
    headers: {
      Origin: EZGIF_BASE_URL,
      Referer: pageUrl,
      'User-Agent': USER_AGENT,
    },
    body: form,
    redirect: 'follow',
    signal: createAbortSignal(options.timeoutMs),
  })

  if (!response.ok) {
    throw new Error(`Standard conversion failed with status ${response.status}`)
  }

  const gifUrl = extractGifUrlFromHtml(text)
  if (!gifUrl) {
    throw new Error('Could not extract GIF URL from conversion page')
  }

  return gifUrl
}

async function convertVideoToGif(videoUrl, options) {
  const upload = await runWithRetries(
    () => createEzgifJob(videoUrl, options),
    options.retries,
  )

  const ajaxGifUrl = await runWithRetries(
    () => convertWithAjax(upload.jobFile, upload.pageUrl, options),
    options.retries,
  )

  if (ajaxGifUrl) {
    return {
      gifUrl: ajaxGifUrl,
      method: 'ajax',
      jobFile: upload.jobFile,
    }
  }

  const fallbackGifUrl = await runWithRetries(
    () => convertWithStandardForm(upload.jobFile, upload.pageUrl, options),
    options.retries,
  )

  return {
    gifUrl: fallbackGifUrl,
    method: 'form-fallback',
    jobFile: upload.jobFile,
  }
}

function makeLocalGifFileName(job) {
  const exerciseDigits = String(job.exerciseNumber ?? '')
    .replace(/\D+/g, '')
    .slice(0, 6)
  const exerciseToken =
    exerciseDigits.length > 0
      ? exerciseDigits.padStart(3, '0')
      : String(job.rowNumber).padStart(3, '0')

  const nameSlug = sanitizeSlug(job.exerciseName || '') || 'exercise'
  const hash = shortHash(job.sourceUrl)

  return `${exerciseToken}-${nameSlug}-${hash}.gif`
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function downloadGif(gifUrl, targetFilePath, options) {
  if (!options.overwrite && (await fileExists(targetFilePath))) {
    return 'existing'
  }

  const response = await fetch(gifUrl, {
    method: 'GET',
    headers: {
      'User-Agent': USER_AGENT,
    },
    redirect: 'follow',
    signal: createAbortSignal(options.timeoutMs),
  })

  if (!response.ok) {
    throw new Error(`GIF download failed with status ${response.status}`)
  }

  const bytes = Buffer.from(await response.arrayBuffer())
  await fs.mkdir(path.dirname(targetFilePath), { recursive: true })
  await fs.writeFile(targetFilePath, bytes)
  return 'downloaded'
}

async function runJobsWithConcurrency(jobs, options, worker) {
  if (jobs.length === 0) {
    return []
  }

  const results = new Array(jobs.length)
  let nextIndex = 0
  let completed = 0

  async function runWorker(workerId) {
    while (true) {
      const currentIndex = nextIndex
      nextIndex += 1

      if (currentIndex >= jobs.length) {
        return
      }

      const job = jobs[currentIndex]
      console.log(
        `[${currentIndex + 1}/${jobs.length}] worker ${workerId} row ${job.rowNumber}: ${job.exerciseName || 'Exercise'}...`,
      )

      if (options.delayMs > 0) {
        await sleep(options.delayMs)
      }

      results[currentIndex] = await worker(job)
      completed += 1

      const state = results[currentIndex].status
      console.log(
        `[${completed}/${jobs.length}] row ${job.rowNumber} finished with status: ${state}`,
      )
    }
  }

  const workerCount = Math.max(
    1,
    Math.min(options.concurrency, jobs.length),
  )

  await Promise.all(
    Array.from({ length: workerCount }, (_, index) => runWorker(index + 1)),
  )

  return results
}

function buildOutputPaths(inputPath, args) {
  const resolvedInput = path.resolve(inputPath)
  const defaultOutputCsv = path.resolve(
    path.dirname(resolvedInput),
    `${path.basename(resolvedInput, path.extname(resolvedInput))}.gif.csv`,
  )

  const outputCsvPath = path.resolve(args['output-csv'] ?? defaultOutputCsv)
  const outputDirPath = path.resolve(args['output-dir'] ?? defaultPublicGifDir)
  const manifestPath = path.resolve(args.manifest ?? `${outputCsvPath}.manifest.json`)
  const reportCsvPath = path.resolve(args['report-csv'] ?? `${outputCsvPath}.report.csv`)

  return {
    outputCsvPath,
    outputDirPath,
    manifestPath,
    reportCsvPath,
  }
}

function ensureTrailingSlash(value) {
  return value.endsWith('/') ? value : `${value}/`
}

function normalizePublicPrefix(value) {
  const normalized = String(value ?? '').trim().replace(/^\/+|\/+$/g, '')
  return normalized.length > 0 ? normalized : 'GIF'
}

function buildCsvReference(gifUrl, localGifFileName, options) {
  if (options.csvLinkMode === 'public-base') {
    if (!localGifFileName) {
      throw new Error('Missing local GIF filename for public-base mode')
    }

    const baseUrl = ensureTrailingSlash(options.publicBaseUrl)
    const prefix = normalizePublicPrefix(options.publicGifPrefix)
    return new URL(`${prefix}/${localGifFileName}`, baseUrl).toString()
  }

  return gifUrl
}

function summarizeResults(results, skippedRows) {
  const summary = {
    totalExerciseRows: results.length + skippedRows.length,
    toConvert: results.length,
    skipped: skippedRows.length,
    converted: 0,
    reusedLocal: 0,
    failed: 0,
  }

  for (const result of results) {
    if (result.status === 'converted') {
      summary.converted += 1
      continue
    }

    if (result.status === 'reused-local') {
      summary.reusedLocal += 1
      continue
    }

    if (result.status === 'failed') {
      summary.failed += 1
    }
  }

  return summary
}

async function main() {
  const args = parseArgs(process.argv)

  if (args.help) {
    printUsage()
    return
  }

  const inputPath = args.input
  if (!inputPath) {
    printUsage()
    throw new Error('Missing required option --input')
  }

  const options = {
    ...defaultOptions,
    start: parseNumberOption(args.start, 'start', defaultOptions.start, {
      min: 0,
      allowFloat: true,
    }),
    end: parseNumberOption(args.end, 'end', defaultOptions.end, {
      min: 0,
      allowFloat: true,
    }),
    fps: parseNumberOption(args.fps, 'fps', defaultOptions.fps, {
      min: 1,
      allowFloat: false,
    }),
    loop: parseNumberOption(args.loop, 'loop', defaultOptions.loop, {
      min: 0,
      allowFloat: false,
    }),
    concurrency: parseNumberOption(
      args.concurrency,
      'concurrency',
      defaultOptions.concurrency,
      { min: 1, allowFloat: false },
    ),
    delayMs: parseNumberOption(args['delay-ms'], 'delay-ms', defaultOptions.delayMs, {
      min: 0,
      allowFloat: false,
    }),
    timeoutMs: parseNumberOption(
      args['timeout-ms'],
      'timeout-ms',
      defaultOptions.timeoutMs,
      { min: 1000, allowFloat: false },
    ),
    retries: parseNumberOption(args.retries, 'retries', defaultOptions.retries, {
      min: 0,
      allowFloat: false,
    }),
    limit:
      args.limit === undefined
        ? defaultOptions.limit
        : parseNumberOption(args.limit, 'limit', 1, {
            min: 1,
            allowFloat: false,
          }),
    size: String(args.size ?? defaultOptions.size),
    crop: String(args.crop ?? defaultOptions.crop),
    ar: String(args.ar ?? defaultOptions.ar),
    method: String(args.method ?? defaultOptions.method),
    dryRun: Boolean(args['dry-run']),
    overwrite: Boolean(args.overwrite),
    encoding: String(args.encoding ?? defaultOptions.encoding),
    csvLinkMode: String(args['csv-link-mode'] ?? defaultOptions.csvLinkMode),
    publicBaseUrl: String(args['public-base-url'] ?? defaultOptions.publicBaseUrl).trim(),
    publicGifPrefix: String(args['public-gif-prefix'] ?? defaultOptions.publicGifPrefix),
  }

  const allowedCsvLinkModes = new Set(['ezgif', 'public-base'])
  if (!allowedCsvLinkModes.has(options.csvLinkMode)) {
    throw new Error(
      `Invalid --csv-link-mode: ${options.csvLinkMode}. Use ezgif or public-base.`,
    )
  }

  if (options.csvLinkMode === 'public-base' && !isHttpUrl(options.publicBaseUrl)) {
    throw new Error('Option --public-base-url must be absolute http(s) URL in public-base mode')
  }

  if (options.end < options.start) {
    throw new Error('Option --end must be greater than or equal to --start')
  }

  const { outputCsvPath, outputDirPath, manifestPath, reportCsvPath } = buildOutputPaths(
    inputPath,
    args,
  )

  console.log('Starting CSV to GIF conversion tool')
  console.log(`Input CSV: ${path.resolve(inputPath)}`)
  console.log(`Output CSV: ${outputCsvPath}`)
  console.log(`Output GIF dir: ${outputDirPath}`)
  console.log(`CSV link mode: ${options.csvLinkMode}`)
  if (options.csvLinkMode === 'public-base') {
    console.log(`Public base URL: ${options.publicBaseUrl}`)
    console.log(`Public GIF prefix: ${normalizePublicPrefix(options.publicGifPrefix)}`)
  }
  console.log(`Dry run: ${options.dryRun ? 'yes' : 'no'}`)

  const rawBytes = await fs.readFile(path.resolve(inputPath))
  const decoder = new TextDecoder(options.encoding)
  const csvText = decoder.decode(rawBytes)

  const parsed = Papa.parse(csvText, {
    header: false,
    skipEmptyLines: false,
  })

  const fatalError = parsed.errors.find((error) => error.code !== 'TooFewFields')
  if (fatalError) {
    throw new Error(
      `CSV parse error at row ${fatalError.row ?? 'unknown'}: ${fatalError.message}`,
    )
  }

  const rows = parsed.data.map((row) =>
    ensureColumnCount(
      Array.isArray(row)
        ? row.map((cell) => normalizeCell(cell))
        : [],
      9,
    ),
  )

  const jobs = []
  const skippedRows = []

  rows.forEach((row, index) => {
    if (!isExerciseRow(row)) {
      return
    }

    const sourceUrl = String(row[8] ?? '').trim()
    if (!isHttpUrl(sourceUrl)) {
      skippedRows.push({
        rowNumber: index + 1,
        exerciseNumber: row[0],
        exerciseName: row[1],
        sourceUrl,
        status: 'skipped-no-http-reference',
      })
      return
    }

    jobs.push({
      rowIndex: index,
      rowNumber: index + 1,
      exerciseNumber: String(row[0] ?? '').trim(),
      exerciseName: String(row[1] ?? '').trim(),
      sourceUrl,
    })
  })

  const effectiveJobs =
    typeof options.limit === 'number' ? jobs.slice(0, options.limit) : jobs

  if (typeof options.limit === 'number' && jobs.length > options.limit) {
    for (const job of jobs.slice(options.limit)) {
      skippedRows.push({
        rowNumber: job.rowNumber,
        exerciseNumber: job.exerciseNumber,
        exerciseName: job.exerciseName,
        sourceUrl: job.sourceUrl,
        status: 'skipped-limit',
      })
    }
  }

  if (effectiveJobs.length === 0) {
    console.log('No HTTP links found in exercise rows. Nothing to convert.')
  }

  await fs.mkdir(path.dirname(manifestPath), { recursive: true })
  await fs.mkdir(path.dirname(reportCsvPath), { recursive: true })

  const conversionResults = options.dryRun
    ? effectiveJobs.map((job) => ({
        ...job,
        status: 'dry-run-planned',
        gifUrl: null,
        csvReferenceUrl: null,
        localGifFileName: null,
        localGifPath: null,
        downloadState: null,
        conversionMethod: null,
        error: null,
      }))
    : await runJobsWithConcurrency(effectiveJobs, options, async (job) => {
        try {
          const localGifFileName = makeLocalGifFileName(job)
          const localGifPath = path.join(outputDirPath, localGifFileName)
          const localGifPathRelative = path
            .relative(path.dirname(outputCsvPath), localGifPath)
            .replace(/\\/g, '/')

          if (
            options.csvLinkMode === 'public-base' &&
            !options.overwrite &&
            (await fileExists(localGifPath))
          ) {
            return {
              ...job,
              status: 'reused-local',
              gifUrl: null,
              csvReferenceUrl: buildCsvReference(null, localGifFileName, options),
              localGifFileName,
              localGifPath,
              localGifPathRelative,
              downloadState: 'existing',
              conversionMethod: null,
              jobFile: null,
              error: null,
            }
          }

          const conversion = await convertVideoToGif(job.sourceUrl, options)
          const downloadState = await downloadGif(conversion.gifUrl, localGifPath, options)
          const csvReferenceUrl = buildCsvReference(
            conversion.gifUrl,
            localGifFileName,
            options,
          )

          return {
            ...job,
            status: 'converted',
            gifUrl: conversion.gifUrl,
            csvReferenceUrl,
            localGifFileName,
            localGifPath,
            localGifPathRelative,
            downloadState,
            conversionMethod: conversion.method,
            jobFile: conversion.jobFile,
            error: null,
          }
        } catch (error) {
          return {
            ...job,
            status: 'failed',
            gifUrl: null,
            csvReferenceUrl: null,
            localGifFileName: null,
            localGifPath: null,
            localGifPathRelative: null,
            downloadState: null,
            conversionMethod: null,
            error: error instanceof Error ? error.message : String(error),
          }
        }
      })

  if (!options.dryRun) {
    for (const result of conversionResults) {
      const hasReadyReference =
        (result.status === 'converted' || result.status === 'reused-local') &&
        Boolean(result.csvReferenceUrl)

      if (!hasReadyReference) {
        continue
      }

      rows[result.rowIndex][8] = result.csvReferenceUrl
    }

    const outputCsv = Papa.unparse(rows, {
      newline: '\n',
    })

    await fs.mkdir(path.dirname(outputCsvPath), { recursive: true })
    await fs.writeFile(outputCsvPath, outputCsv, 'utf8')
  }

  const summary = summarizeResults(conversionResults, skippedRows)
  const manifest = {
    generatedAt: new Date().toISOString(),
    inputCsvPath: path.resolve(inputPath),
    outputCsvPath,
    outputDirPath,
    options,
    summary,
    skippedRows,
    results: conversionResults,
  }

  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')

  const reportRows = [
    ...conversionResults.map((item) => ({
      rowNumber: item.rowNumber,
      exerciseNumber: item.exerciseNumber,
      exerciseName: item.exerciseName,
      sourceUrl: item.sourceUrl,
      status: item.status,
      gifUrl: item.gifUrl ?? '',
      csvReferenceUrl: item.csvReferenceUrl ?? '',
      localGifPath: item.localGifPath ?? '',
      localGifPathRelative: item.localGifPathRelative ?? '',
      downloadState: item.downloadState ?? '',
      conversionMethod: item.conversionMethod ?? '',
      error: item.error ?? '',
    })),
    ...skippedRows.map((item) => ({
      rowNumber: item.rowNumber,
      exerciseNumber: item.exerciseNumber,
      exerciseName: item.exerciseName,
      sourceUrl: item.sourceUrl,
      status: item.status,
      gifUrl: '',
      csvReferenceUrl: '',
      localGifPath: '',
      localGifPathRelative: '',
      downloadState: '',
      conversionMethod: '',
      error: '',
    })),
  ].sort((left, right) => Number(left.rowNumber) - Number(right.rowNumber))

  const reportCsv = Papa.unparse(reportRows, {
    newline: '\n',
  })
  await fs.writeFile(reportCsvPath, reportCsv, 'utf8')

  console.log('Completed CSV to GIF processing')
  console.log(`Converted: ${summary.converted}`)
  console.log(`Reused local GIFs: ${summary.reusedLocal}`)
  console.log(`Failed: ${summary.failed}`)
  console.log(`Skipped (no HTTP reference): ${summary.skipped}`)
  console.log(`Manifest: ${manifestPath}`)
  console.log(`Report CSV: ${reportCsvPath}`)

  if (!options.dryRun) {
    console.log(`Updated CSV: ${outputCsvPath}`)
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Error: ${message}`)
  process.exitCode = 1
})
