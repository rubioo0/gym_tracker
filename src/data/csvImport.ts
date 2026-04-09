import Papa from 'papaparse'
import type {
  ExerciseTemplate,
  ProgramMode,
  ProgramTemplate,
  ProgressionRule,
  TrackType,
} from '../domain/types'

interface CsvImportOptions {
  fileName?: string
  programId?: string
  programName?: string
  mode?: ProgramMode
  track?: TrackType
  focusTarget?: string
}

const DEFAULT_MODE: ProgramMode = 'main'
const DEFAULT_TRACK: TrackType = 'upper'

function normalizeCell(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }

  return value.replace(/\r/g, '').trim()
}

function isEmptyOrDash(value: string): boolean {
  return value === '' || value === '-'
}

function extractNumbers(value: string): number[] {
  const normalized = value.replace(/,/g, '.')
  const matches = normalized.match(/-?\d+(?:\.\d+)?/g)
  if (!matches) {
    return []
  }

  return matches
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item))
}

function extractInteger(value: string): number | undefined {
  const values = extractNumbers(value)
  const first = values[0]
  if (typeof first !== 'number') {
    return undefined
  }

  return Math.trunc(first)
}

function makeSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function makeProgramId(programName: string): string {
  const slug = makeSlug(programName) || 'imported-program'
  return `imported-${slug}-${Date.now()}`
}

function normalizeSets(rawSets: string): string {
  if (isEmptyOrDash(rawSets)) {
    return '3 підходи'
  }

  const count = extractInteger(rawSets)
  if (typeof count === 'number' && count > 0) {
    return `${count} підходи`
  }

  return rawSets
}

function normalizeReps(rawReps: string): string {
  if (isEmptyOrDash(rawReps)) {
    return '10'
  }

  const range = rawReps.match(/(\d+)\s*[-–]\s*(\d+)/)
  if (range) {
    return `${range[1]}-${range[2]}`
  }

  const count = extractInteger(rawReps)
  if (typeof count === 'number' && count > 0) {
    return `${count}`
  }

  return rawReps
}

function normalizeExerciseName(name: string, index: number): string {
  const normalized = name.replace(/\?/g, '').replace(/\s+/g, '').trim()
  if (normalized.length === 0) {
    return `Exercise ${index}`
  }

  return name
}

function parseWeightUnit(baseConfig: string): string | undefined {
  const normalized = baseConfig.toLowerCase()
  if (normalized.includes('lbs') || normalized.includes('lb')) {
    return 'lbs'
  }

  if (normalized.includes('kg')) {
    return 'kg'
  }

  if (/\d/.test(baseConfig)) {
    return 'kg'
  }

  return undefined
}

function parseProgressionRule(
  progressionRaw: string,
  maxValueRaw: string,
  fallbackType: 'weight' | 'reps',
): ProgressionRule | undefined {
  if (isEmptyOrDash(progressionRaw)) {
    return undefined
  }

  const amountMatch = progressionRaw.match(/\+\s*(\d+(?:[.,]\d+)?)/)
  if (!amountMatch) {
    return undefined
  }

  const amount = Number(amountMatch[1].replace(',', '.'))
  if (!Number.isFinite(amount)) {
    return undefined
  }

  const allNumbers = extractNumbers(progressionRaw)
  const frequencyCandidate = allNumbers
    .slice(1)
    .find((value) => Number.isInteger(value) && value > 0)
  const frequency =
    typeof frequencyCandidate === 'number' && frequencyCandidate > 0
      ? frequencyCandidate
      : 1

  const maxValue = extractNumbers(maxValueRaw)[0]

  return {
    type: fallbackType,
    amount,
    frequency,
    basis: 'successfulTrackSessions',
    maxValue: typeof maxValue === 'number' ? maxValue : undefined,
    note: progressionRaw,
  }
}

function parseExerciseReference(rawReference: string): ExerciseTemplate['reference'] {
  if (!/^https?:\/\//i.test(rawReference)) {
    return undefined
  }

  const isImageReference =
    /\.(gif|png|jpe?g|webp|avif|bmp|svg)(?:[?#].*)?$/i.test(rawReference)

  if (isImageReference) {
    return { imageUrl: rawReference }
  }

  return { videoUrl: rawReference }
}

function parseCsvRows(csvText: string): string[][] {
  const parsed = Papa.parse<string[]>(csvText, {
    header: false,
    skipEmptyLines: true,
  })

  const fatalError = parsed.errors.find((error) => error.code !== 'TooFewFields')
  if (fatalError) {
    throw new Error(
      `CSV parse error near row ${fatalError.row ?? 'unknown'}: ${fatalError.message}`,
    )
  }

  return parsed.data.map((row) => row.map((cell) => normalizeCell(cell)))
}

function buildExercise(
  row: string[],
  index: number,
  programId: string,
): ExerciseTemplate {
  const exerciseNumber = normalizeCell(row[0] ?? '') || `${index}`
  const rawName = normalizeCell(row[1] ?? '')
  const rawSets = normalizeCell(row[2] ?? '')
  const rawReps = normalizeCell(row[3] ?? '')
  const rawBaseConfig = normalizeCell(row[4] ?? '')
  const rawProgression = normalizeCell(row[5] ?? '')
  const rawMaxValue = normalizeCell(row[6] ?? '')
  const rawRest = normalizeCell(row[7] ?? '')
  const rawReference = normalizeCell(row[8] ?? '')

  const plannedWeight = extractNumbers(rawBaseConfig)[0]
  const fallbackType: 'weight' | 'reps' =
    typeof plannedWeight === 'number' ? 'weight' : 'reps'

  const progressionRule = parseProgressionRule(
    rawProgression,
    rawMaxValue,
    fallbackType,
  )

  const noteParts: string[] = []
  if (!isEmptyOrDash(rawBaseConfig) && typeof plannedWeight !== 'number') {
    noteParts.push(`Base: ${rawBaseConfig}`)
  }
  if (!isEmptyOrDash(rawMaxValue) && !progressionRule?.maxValue) {
    noteParts.push(`Cap: ${rawMaxValue}`)
  }
  if (!isEmptyOrDash(rawRest)) {
    noteParts.push(`Rest: ${rawRest}`)
  }

  return {
    id: `${programId}-ex-${exerciseNumber}`,
    name: normalizeExerciseName(rawName, index),
    sets: normalizeSets(rawSets),
    reps: normalizeReps(rawReps),
    plannedWeight: typeof plannedWeight === 'number' ? plannedWeight : undefined,
    weightUnit:
      typeof plannedWeight === 'number' ? parseWeightUnit(rawBaseConfig) : undefined,
    progressionRule,
    note: noteParts.length > 0 ? noteParts.join(' | ') : undefined,
    reference: parseExerciseReference(rawReference),
  }
}

export function importProgramTemplateFromCsv(
  csvText: string,
  options: CsvImportOptions = {},
): ProgramTemplate {
  const rows = parseCsvRows(csvText)

  const exerciseRows = rows.filter((row) => /^\d+$/.test(normalizeCell(row[0] ?? '')))
  if (exerciseRows.length === 0) {
    throw new Error('No exercise rows found. The first CSV column should contain exercise numbers.')
  }

  const programName =
    options.programName?.trim() ||
    options.fileName?.replace(/\.[^/.]+$/, '').trim() ||
    'Imported CSV Program'

  const programId = options.programId?.trim() || makeProgramId(programName)
  const mode = options.mode ?? DEFAULT_MODE
  const track = options.track ?? DEFAULT_TRACK
  const focusTarget = options.focusTarget?.trim() || 'imported-focus'

  const exercises = exerciseRows.map((row, index) =>
    buildExercise(row, index + 1, programId),
  )

  return {
    id: programId,
    name: programName,
    mode,
    track,
    focusTarget,
    sessions: [
      {
        id: `${programId}-session-1`,
        name: `${track.toUpperCase()} Imported Session`,
        order: 1,
        track,
        exercises,
        note: options.fileName
          ? `Imported from ${options.fileName}`
          : 'Imported from CSV',
      },
    ],
    note: options.fileName
      ? `CSV import source: ${options.fileName}`
      : 'CSV import',
  }
}
