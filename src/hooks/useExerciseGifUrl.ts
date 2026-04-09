import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { convertVideoToGifUrl } from '../utils/ezgifClient'

interface CachedGifData {
  gifUrl: string
  timestamp: number
  originalUrl: string
}

/**
 * Custom hook for managing GIF conversion and caching
 *
 * Detects .mp4 video URLs, converts them to GIFs via EZGIF on first card open,
 * and caches the result in localStorage for instant loading on future opens.
 *
 * @param exerciseId - Unique exercise identifier
 * @param videoUrl - Original video URL (typically .mp4)
 * @returns { gifUrl, isLoading, error }
 */
export function useExerciseGifUrl(
  exerciseId: string | undefined,
  videoUrl: string | undefined,
): {
  gifUrl: string | null
  isLoading: boolean
  error: string | null
} {
  const cacheKey = useMemo(() => (exerciseId ? `exerciseGifUrl:${exerciseId}` : null), [exerciseId])

  // Initialize from cache or from defaults
  const initialState = useMemo(() => {
    if (!cacheKey) {
      return { gifUrl: null, shouldConvert: false }
    }

    try {
      const cached = localStorage.getItem(cacheKey)
      if (cached) {
        const data: CachedGifData = JSON.parse(cached)
        return { gifUrl: data.gifUrl, shouldConvert: false }
      }
    } catch (err) {
      console.warn('[useExerciseGifUrl] localStorage read failed:', err)
    }

    return { gifUrl: null, shouldConvert: !!videoUrl?.toLowerCase().endsWith('.mp4') }
  }, [cacheKey, videoUrl])

  const [gifUrl, setGifUrl] = useState<string | null>(initialState.gifUrl)
  const [isLoading, setIsLoading] = useState(initialState.shouldConvert)
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const convertAndCache = useCallback(async () => {
    if (!videoUrl || !cacheKey) {
      return
    }

    setIsLoading(true)
    setError(null)
    abortControllerRef.current = new AbortController()

    try {
      const result = await convertVideoToGifUrl(videoUrl, undefined, abortControllerRef.current.signal)

      if (abortControllerRef.current.signal.aborted) {
        // User closed modal or component unmounted
        return
      }

      if (result) {
        // Cache successful conversion
        const cacheData: CachedGifData = {
          gifUrl: result,
          timestamp: Date.now(),
          originalUrl: videoUrl,
        }
        try {
          localStorage.setItem(cacheKey, JSON.stringify(cacheData))
        } catch (err) {
          // localStorage might be full or unavailable, but we still have the GIF URL
          console.warn('[useExerciseGifUrl] localStorage write failed:', err)
        }

        setGifUrl(result)
        setIsLoading(false)
      } else {
        // Conversion failed
        setError('GIF conversion failed. Check video link.')
        setIsLoading(false)
      }
    } catch (err) {
      if (!abortControllerRef.current.signal.aborted) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        setError(`Conversion error: ${message}`)
        setIsLoading(false)
      }
    }
  }, [videoUrl, cacheKey])

  useEffect(() => {
    // Only trigger conversion if:
    // 1. We have exercise ID and video URL
    // 2. It's an .mp4 file
    // 3. It's not already cached (gifUrl is null means not cached)
    if (!exerciseId || !videoUrl || !videoUrl.toLowerCase().endsWith('.mp4') || gifUrl) {
      return
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    convertAndCache()

    // Cleanup on unmount or when dependencies change
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [exerciseId, videoUrl, gifUrl, convertAndCache])

  return { gifUrl, isLoading, error }
}
