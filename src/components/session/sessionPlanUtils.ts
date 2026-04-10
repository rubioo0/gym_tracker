import type { PlannedExercise } from '../../domain/types'

export type ExerciseCategory =
  | 'pull'
  | 'push'
  | 'legs'
  | 'core'
  | 'cardio'
  | 'other'

const CATEGORY_KEYWORDS: Record<ExerciseCategory, string[]> = {
  pull: ['pull', 'row', 'curl', 'chin', 'lat', 'rear delt'],
  push: ['press', 'dip', 'triceps', 'push', 'extension'],
  legs: ['leg', 'calf', 'squat', 'lunge', 'hip'],
  core: ['plank', 'core', 'ab', 'sit-up', 'twist'],
  cardio: ['run', 'bike', 'swim', 'walk', 'treadmill'],
  other: [],
}

export function getExerciseCategory(name: string): ExerciseCategory {
  const normalized = name.toLowerCase()

  const category = (Object.keys(CATEGORY_KEYWORDS) as ExerciseCategory[]).find(
    (candidate) =>
      candidate !== 'other' &&
      CATEGORY_KEYWORDS[candidate].some((keyword) => normalized.includes(keyword)),
  )

  return category ?? 'other'
}

export function getExerciseCategoryLabel(category: ExerciseCategory): string {
  switch (category) {
    case 'pull':
      return 'Pull'
    case 'push':
      return 'Push'
    case 'legs':
      return 'Legs'
    case 'core':
      return 'Core'
    case 'cardio':
      return 'Cardio'
    default:
      return 'General'
  }
}

export function formatPlannedWeight(exercise: PlannedExercise): string {
  if (exercise.plannedLoadLabel) {
    return exercise.plannedLoadLabel
  }

  if (typeof exercise.plannedWeight !== 'number') {
    return '-'
  }

  return `${exercise.plannedWeight} ${exercise.weightUnit ?? ''}`.trim()
}

function cleanPathSegment(value: string): string {
  return value.replace(/^\//, '').split('/')[0]
}

export function getEmbeddableVideoUrl(
  rawUrl: string | undefined,
): string | undefined {
  if (!rawUrl) {
    return undefined
  }

  try {
    const url = new URL(rawUrl)
    const host = url.hostname.toLowerCase()

    if (host.includes('youtube.com') || host.includes('youtu.be')) {
      if (host.includes('youtu.be')) {
        const shortId = cleanPathSegment(url.pathname)
        return shortId ? `https://www.youtube.com/embed/${shortId}` : undefined
      }

      const watchId = url.searchParams.get('v')
      if (watchId) {
        return `https://www.youtube.com/embed/${watchId}`
      }

      const pathSegments = url.pathname.split('/').filter(Boolean)
      if (pathSegments[0] === 'embed' || pathSegments[0] === 'shorts') {
        const embedId = pathSegments[1]
        return embedId ? `https://www.youtube.com/embed/${embedId}` : undefined
      }
    }

    if (host.includes('vimeo.com')) {
      const match = url.pathname.match(/\/(\d+)/)
      if (match?.[1]) {
        return `https://player.vimeo.com/video/${match[1]}`
      }
    }

    return undefined
  } catch {
    return undefined
  }
}
