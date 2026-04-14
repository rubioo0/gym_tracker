/**
 * EZGIF Client - Browser Frontend
 * Communicates with backend proxy server.
 * Backend handles all direct EZGIF API calls (avoids CORS issues)
 */

interface EzgifOptions {
  start?: number // start time in seconds (default: 0)
  end?: number // end time in seconds (default: 5)
  fps?: number // frames per second (default: 10)
  size?: 'original' | 'half' | 'quarter' // output size (default: 'original')
  loop?: number // loop count (default: 0 = no loop)
  timeoutMs?: number // request timeout (default: 120000 = 2 minutes)
  retries?: number // retry attempts on failure (default: 2)
}

const DEFAULT_OPTIONS: Required<EzgifOptions> = {
  start: 0,
  end: 5,
  fps: 10,
  size: 'original',
  loop: 0,
  timeoutMs: 120000,
  retries: 2,
}

const DEV_PROXY_BASE_URL = 'http://localhost:3001'
const configuredProxyBaseUrl = String(import.meta.env.VITE_GIF_PROXY_BASE_URL ?? '').trim()

const PROXY_BASE_URL =
  configuredProxyBaseUrl || (import.meta.env.DEV ? DEV_PROXY_BASE_URL : '')

export function isGifProxyConfigured(): boolean {
  return PROXY_BASE_URL.length > 0
}

/**
 * Run a function with retry logic and exponential backoff
 */
async function runWithRetries<T>(
  fn: () => Promise<T | null>,
  retries: number,
  signal?: AbortSignal,
): Promise<T | null> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) {
      return null
    }

    try {
      const result = await fn()
      if (result !== null) {
        return result
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }

    // Exponential backoff: 1s, 2s, 4s, etc.
    if (attempt < retries) {
      const delayMs = 1000 * Math.pow(2, attempt)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }

  if (lastError) {
    console.error('[ezgifClient] All retries exhausted:', lastError)
  }
  return null
}

/**
 * Main function: Convert MP4 video to GIF via backend proxy
 * Sends request to backend server, which handles EZGIF API calls
 *
 * @param videoUrl - Direct HTTP/HTTPS URL to MP4 video
 * @param options - Conversion options (start, end, fps, etc.)
 * @param signal - AbortSignal to cancel ongoing operation
 * @returns Promise resolving to GIF URL (https://s1.ezgif.com/tmp/...) or null if failed
 */
export async function convertVideoToGifUrl(
  videoUrl: string,
  options?: Partial<EzgifOptions>,
  signal?: AbortSignal,
): Promise<string | null> {
  if (!isGifProxyConfigured()) {
    // On static-only deployments (e.g., GitHub Pages), no backend proxy exists.
    return null
  }

  const mergedOptions = { ...DEFAULT_OPTIONS, ...options }

  try {
    // Create AbortController with timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), mergedOptions.timeoutMs)

    // If user signal is provided, abort when either timeout or user signal fires
    if (signal) {
      signal.addEventListener('abort', () => controller.abort())
    }

    try {
      const response = await runWithRetries(
        () =>
          fetch(`${PROXY_BASE_URL}/api/convert-video-to-gif`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              videoUrl,
              start: mergedOptions.start,
              end: mergedOptions.end,
              fps: mergedOptions.fps,
              size: mergedOptions.size,
              loop: mergedOptions.loop,
            }),
            signal: controller.signal,
          }).then(async (res) => {
            if (!res.ok) {
              const error = await res.json().catch(() => ({ error: 'Unknown error' }))
              throw new Error(error.error || `HTTP ${res.status}`)
            }
            return res.json()
          }),
        mergedOptions.retries,
        controller.signal,
      )

      clearTimeout(timeoutId)

      if (!response) {
        console.error('[ezgifClient] Backend returned null response')
        return null
      }

      if (!response.success) {
        console.error('[ezgifClient] Backend error:', response.error)
        return null
      }

      if (!response.gifUrl) {
        console.error('[ezgifClient] Backend returned success but no gifUrl')
        return null
      }

      console.log('[ezgifClient] Conversion successful:', response.gifUrl)
      return response.gifUrl
    } finally {
      clearTimeout(timeoutId)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[ezgifClient] Conversion error:', message)
    return null
  }
}
