/**
 * Backend Proxy Server for EZGIF API
 * Handles CORS restrictions by proxying requests to EZGIF from server-side
 * Runs on port 3001 while Vite dev server runs on 5175
 */

import express, { Request, Response } from 'express'
import cors from 'cors'
import crypto from 'crypto'

const app = express()
const PORT = 3001

app.use(cors())
app.use(express.json())

const EZGIF_BASE_URL = 'https://ezgif.com'

// Simple in-memory cache for uploaded videos
const videoCache = new Map<string, Buffer>()

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36'

interface ConversionRequest {
  videoUrl: string
  start?: number
  end?: number
  fps?: number
  size?: 'original' | 'half' | 'quarter'
  loop?: number
}

interface ConversionResponse {
  success: boolean
  gifUrl?: string
  error?: string
}

/**
 * Extract GIF URL from EZGIF HTML response
 */
function extractGifUrlFromHtml(html: string): string | null {
  // Look for src="//s*.ezgif.com/tmp/..." or src='//s*.ezgif.com/tmp/...'
  const match = html.match(/src=["']?(\/\/s\d+\.ezgif\.com\/tmp\/[^"'\s>]+\.gif)/i)
  if (match && match[1]) {
    const gifUrl = match[1].startsWith('//') ? `https:${match[1]}` : match[1]
    console.log(`[EZGIF Proxy] Extracted GIF URL: ${gifUrl}`)
    return gifUrl
  }
  
  console.log('[EZGIF Proxy] GIF URL not found in response. Response length:', html.length)
  if (html.length < 2000) {
    console.log('[EZGIF Proxy] Response HTML:', html)
  }
  
  return null
}

/**
 * Extract full EZGIF source filename from redirect location.
 * Example: /video-to-gif/ezgif-7c3ac2fd30c3f450.mp4.html -> ezgif-7c3ac2fd30c3f450.mp4
 */
function extractJobFileFromLocation(locationValue: string): string | null {
  try {
    const locationUrl = new URL(locationValue, EZGIF_BASE_URL)

    const videoToGifMatch = locationUrl.pathname.match(/\/video-to-gif\/([^/]+)\.html$/i)
    if (videoToGifMatch?.[1]) {
      return decodeURIComponent(videoToGifMatch[1])
    }

    const cropVideoMatch = locationUrl.pathname.match(/\/crop-video\/([^/]+)\.html$/i)
    if (cropVideoMatch?.[1]) {
      return decodeURIComponent(cropVideoMatch[1])
    }

    return null
  } catch {
    return null
  }
}

function isExpectedJobFileName(jobFile: string): boolean {
  return /^ezgif-[a-z0-9]+\.[a-z0-9]{2,5}$/i.test(jobFile)
}

function normalizeFitwillVideoUrl(videoUrl: string): string {
  try {
    const parsed = new URL(videoUrl)
    if (parsed.hostname !== 'fitwill.app') {
      return videoUrl
    }

    const match = parsed.pathname.match(/^\/(?:[a-z]{2}\/)?exercise\/(\d+)\/([^/?#]+\.mp4)$/i)
    if (!match) {
      return videoUrl
    }

    const [, exerciseId, fileName] = match
    return `${parsed.protocol}//${parsed.host}/videos/${exerciseId}/${fileName}`
  } catch {
    return videoUrl
  }
}

function extractJobFileFromRedirect(response: Response, sourceLabel: string): string {
  const location = response.headers.get('location')
  if (!location) {
    throw new Error(`${sourceLabel}: redirect received but no Location header`)
  }

  console.log(`[EZGIF Proxy] Redirect location: ${location}`)

  if (location.includes('err=')) {
    const errorMatch = location.match(/err=([^&?]+)/)
    const errorCode = errorMatch ? errorMatch[1] : 'unknown'
    throw new Error(`EZGIF error (${errorCode}): ${location}`)
  }

  const jobFile = extractJobFileFromLocation(location)
  if (jobFile && isExpectedJobFileName(jobFile)) {
    console.log(`[EZGIF Proxy] Resolved job filename: ${jobFile}`)
    return jobFile
  }

  if (jobFile) {
    throw new Error(`Unexpected EZGIF job filename format: ${jobFile}`)
  }

  throw new Error(`Could not extract job filename from redirect: ${location}`)
}

function getUploadFileName(videoUrl: string): string {
  try {
    const parsed = new URL(videoUrl)
    const fileName = parsed.pathname.split('/').filter(Boolean).pop() || 'video.mp4'
    if (/\.[a-z0-9]{2,5}$/i.test(fileName)) {
      return fileName
    }
    return `${fileName}.mp4`
  } catch {
    return 'video.mp4'
  }
}

/**
 * Download video from URL to buffer
 */
async function downloadVideo(videoUrl: string): Promise<Buffer> {
  console.log(`[EZGIF Proxy] Downloading video from: ${videoUrl}`)
  
  const response = await fetch(videoUrl, {
    headers: {
      'User-Agent': DEFAULT_USER_AGENT,
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to download video: HTTP ${response.status}`)
  }

  if (!response.body) {
    throw new Error('No response body from video server')
  }

  // Convert response body to buffer
  const chunks: Uint8Array[] = []
  const reader = response.body.getReader()
  
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  return Buffer.concat(chunks.map(chunk => Buffer.from(chunk)))
}

/**
 * Create EZGIF job using the proper multipart/form-data workflow
 * Follows the exact specification: empty new-image field + new-image-url
 * If the video URL is not accessible to EZGIF, we download it and serve it locally
 */
async function createEzgifJob(videoUrl: string, localVideoUrl?: string): Promise<string> {
  // Use local URL if the video was downloaded and cached
  const urlToSend = localVideoUrl || videoUrl
  
  console.log(`[EZGIF Proxy] Creating EZGIF job with URL: ${urlToSend}`)
  
  // Construct multipart/form-data manually with proper format
  // Must include: empty new-image field + new-image-url (per EZGIF spec)
  const boundary = 'WebKitFormBoundary' + Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  
  const parts: Buffer[] = []
  
  // First part: new-image file field (EMPTY - this is critical!)
  parts.push(Buffer.from(`--${boundary}\r\n`))
  parts.push(Buffer.from(`Content-Disposition: form-data; name="new-image"; filename=""\r\n`))
  parts.push(Buffer.from(`Content-Type: application/octet-stream\r\n\r\n`))
  // NOTE: NO file content - field is intentionally empty
  parts.push(Buffer.from(`\r\n`))
  
  // Second part: new-image-url field with the video URL
  parts.push(Buffer.from(`--${boundary}\r\n`))
  parts.push(Buffer.from(`Content-Disposition: form-data; name="new-image-url"\r\n\r\n`))
  parts.push(Buffer.from(urlToSend))
  parts.push(Buffer.from(`\r\n`))
  
  // Closing boundary
  parts.push(Buffer.from(`--${boundary}--\r\n`))
  
  const multipartBody = Buffer.concat(parts)
  
  console.log(`[EZGIF Proxy] Sending multipart request (${multipartBody.length} bytes) to create job`)

  const response = await fetch(`${EZGIF_BASE_URL}/video-to-gif`, {
    method: 'POST',
    body: multipartBody,
    redirect: 'manual',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'User-Agent': DEFAULT_USER_AGENT,
      'Origin': 'https://ezgif.com',
      'Referer': 'https://ezgif.com/video-to-gif',
      'Accept': '*/*',
    },
  })

  console.log(`[EZGIF Proxy] Job creation response status: ${response.status}`)

  if (response.status >= 300 && response.status < 400) {
    return extractJobFileFromRedirect(response, 'URL upload')
  }

  throw new Error(`Expected redirect from EZGIF, got ${response.status}`)
}

async function createEzgifJobFromFile(videoBuffer: Buffer, sourceVideoUrl: string): Promise<string> {
  const fileName = getUploadFileName(sourceVideoUrl)
  const form = new FormData()
  form.append('new-image', new Blob([videoBuffer], { type: 'video/mp4' }), fileName)

  console.log(`[EZGIF Proxy] Creating EZGIF job with file upload: ${fileName} (${videoBuffer.length} bytes)`)

  const response = await fetch(`${EZGIF_BASE_URL}/video-to-gif`, {
    method: 'POST',
    body: form,
    redirect: 'manual',
    headers: {
      'User-Agent': DEFAULT_USER_AGENT,
      'Origin': 'https://ezgif.com',
      'Referer': 'https://ezgif.com/video-to-gif',
      'Accept': '*/*',
    },
  })

  console.log(`[EZGIF Proxy] File upload response status: ${response.status}`)

  if (response.status >= 300 && response.status < 400) {
    return extractJobFileFromRedirect(response, 'File upload')
  }

  throw new Error(`Expected redirect from EZGIF after file upload, got ${response.status}`)
}

/**
 * Convert video to GIF using EZGIF AJAX method
 * Follows the exact flow from HAR: POST to /video-to-gif/{filename}?ajax=true with form-data body
 */
async function convertVideoWithAjax(
  jobFile: string,
  start: number = 0,
  end: number = 5,
  fps: number = 10,
  size: string = 'original',
  loop: number = 0,
): Promise<string | null> {
  // Construct form-data body with all required EZGIF parameters
  const formData = new URLSearchParams({
    file: jobFile,
    start: start.toString(),
    end: end.toString(),
    size: size,
    fps: fps.toString(),
    fpsr: fps.toString(), // FPS ratio - required by EZGIF
    'detected-fps': '30', // Default source FPS
    method: 'ezgif',
    loop: loop.toString(),
    crop: 'none',
    ar: 'no',
    ajax: 'true',
  })

  const encodedJobFile = encodeURIComponent(jobFile)
  const convertUrl = `${EZGIF_BASE_URL}/video-to-gif/${encodedJobFile}?ajax=true`
  console.log(`[EZGIF Proxy] AJAX conversion to: ${convertUrl}`)

  const response = await fetch(convertUrl, {
    method: 'POST',
    body: formData,
    headers: {
      'User-Agent': DEFAULT_USER_AGENT,
      'Origin': 'https://ezgif.com',
      'Referer': `https://ezgif.com/video-to-gif/${encodedJobFile}.html`,
      'X-Requested-With': 'XMLHttpRequest',
    },
  })

  console.log(`[EZGIF Proxy] AJAX response status: ${response.status}`)

  if (!response.ok) {
    console.log(`[EZGIF Proxy] AJAX request failed: ${response.status}`)
    return null
  }

  const html = await response.text()
  return extractGifUrlFromHtml(html)
}

/**
 * Convert video to GIF using standard form method (fallback)
 * Posts to /video-to-gif/{filename} with form-data
 */
async function convertVideoWithForm(
  jobFile: string,
  start: number = 0,
  end: number = 5,
  fps: number = 10,
  size: string = 'original',
  loop: number = 0,
): Promise<string | null> {
  const formData = new URLSearchParams({
    file: jobFile,
    start: start.toString(),
    end: end.toString(),
    size: size,
    fps: fps.toString(),
    fpsr: fps.toString(),
    'detected-fps': '30',
    method: 'ezgif',
    loop: loop.toString(),
    crop: 'none',
    ar: 'no',
  })

  const encodedJobFile = encodeURIComponent(jobFile)
  const convertUrl = `${EZGIF_BASE_URL}/video-to-gif/${encodedJobFile}`
  console.log(`[EZGIF Proxy] Form conversion to: ${convertUrl}`)

  const response = await fetch(convertUrl, {
    method: 'POST',
    body: formData,
    headers: {
      'User-Agent': DEFAULT_USER_AGENT,
      'Origin': 'https://ezgif.com',
      'Referer': `https://ezgif.com/video-to-gif/${encodedJobFile}.html`,
    },
  })

  console.log(`[EZGIF Proxy] Form response status: ${response.status}`)

  if (!response.ok) {
    console.log(`[EZGIF Proxy] Form conversion failed: ${response.status}`)
    return null
  }

  const html = await response.text()
  return extractGifUrlFromHtml(html)
}

/**
 * Main conversion endpoint
 * POST /api/convert-video-to-gif
 */
app.post('/api/convert-video-to-gif', async (req: Request, res: Response) => {
  try {
    const { videoUrl, start = 0, end = 5, fps = 10, size = 'original', loop = 0 } = req.body as ConversionRequest

    if (!videoUrl) {
      return res.status(400).json({
        success: false,
        error: 'videoUrl is required',
      } as ConversionResponse)
    }

    console.log(`[EZGIF Proxy] Starting conversion for: ${videoUrl}`)

    const normalizedVideoUrl = normalizeFitwillVideoUrl(videoUrl)
    if (normalizedVideoUrl !== videoUrl) {
      console.log(`[EZGIF Proxy] Rewrote Fitwill URL to direct video URL: ${normalizedVideoUrl}`)
    }

    // Step 1: Create EZGIF job using the proper multipart workflow
    console.log('[EZGIF Proxy] Creating EZGIF job...')
    let jobFile: string | null = null
    let lastJobCreationError = ''

    for (const candidateUrl of [normalizedVideoUrl, videoUrl]) {
      if (jobFile || !candidateUrl) {
        continue
      }

      try {
        jobFile = await createEzgifJob(candidateUrl)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        lastJobCreationError = message
        console.error(`[EZGIF Proxy] Failed to create job with URL ${candidateUrl}: ${message}`)
      }
    }

    if (!jobFile) {
      console.log('[EZGIF Proxy] URL upload failed, trying downloaded file upload fallback...')
      try {
        const downloadSource = normalizedVideoUrl || videoUrl
        const videoBuffer = await downloadVideo(downloadSource)
        jobFile = await createEzgifJobFromFile(videoBuffer, downloadSource)
      } catch (fallbackError) {
        const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : 'Unknown error'
        console.error(`[EZGIF Proxy] File upload fallback failed: ${fallbackMessage}`)
        const errorMessage = lastJobCreationError || fallbackMessage

        return res.status(500).json({
          success: false,
          error: `Failed to create EZGIF job: ${errorMessage}`,
        } as ConversionResponse)
      }
    }

    // Step 2: Try AJAX conversion first
    console.log('[EZGIF Proxy] Attempting AJAX conversion...')
    let gifUrl = await convertVideoWithAjax(jobFile, start, end, fps, size, loop)

    // Step 3: Fallback to form-based conversion if AJAX didn't work
    if (!gifUrl) {
      console.log('[EZGIF Proxy] AJAX failed, trying form method...')
      gifUrl = await convertVideoWithForm(jobFile, start, end, fps, size, loop)
    }

    if (!gifUrl) {
      return res.status(500).json({
        success: false,
        error: 'Failed to extract GIF URL from EZGIF response',
      } as ConversionResponse)
    }

    console.log(`[EZGIF Proxy] Conversion successful: ${gifUrl}`)

    return res.json({
      success: true,
      gifUrl,
    } as ConversionResponse)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[EZGIF Proxy] Conversion error: ${message}`)

    return res.status(500).json({
      success: false,
      error: message,
    } as ConversionResponse)
  }
})

/**
 * Health check endpoint
 */
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' })
})

/**
 * Temporary video serving endpoint
 * Allows EZGIF to download videos we've cached locally
 */
app.get('/api/temp-video/:id', (req: Request, res: Response) => {
  const { id } = req.params
  const videoBuffer = videoCache.get(id)
  
  if (!videoBuffer) {
    return res.status(404).json({ error: 'Video not found' })
  }
  
  res.set('Content-Type', 'video/mp4')
  res.set('Content-Length', videoBuffer.length.toString())
  res.send(videoBuffer)
  
  // Clean up after some time to avoid memory issues
  setTimeout(() => {
    videoCache.delete(id)
  }, 5 * 60 * 1000) // 5 minutes
})

app.listen(PORT, () => {
  console.log(`[EZGIF Proxy] Server running on http://localhost:${PORT}`)
  console.log('[EZGIF Proxy] Use POST /api/convert-video-to-gif to convert videos')
})
