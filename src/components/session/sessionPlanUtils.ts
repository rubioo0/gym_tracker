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

function formatWeightNumber(value: number): string {
  return Number(value.toFixed(2)).toString()
}

const LBS_PER_KG = 2.2046226218
const KG_PER_LB = 0.45359237

function normalizeWeightUnitForConversion(unit?: string): 'kg' | 'lbs' {
  const normalized = unit?.toLowerCase() ?? ''
  if (normalized.includes('lb')) {
    return 'lbs'
  }

  if (normalized.includes('kg') || normalized.includes('кг')) {
    return 'kg'
  }

  return 'kg'
}

function formatConvertedNumber(value: number): string {
  return value.toFixed(1)
}

function formatOverviewWeightNumber(value: number, unit?: string): string {
  const normalizedUnit = normalizeWeightUnitForConversion(unit)
  if (normalizedUnit === 'lbs') {
    return Number(value.toFixed(1)).toString()
  }

  return formatWeightNumber(value)
}

function formatWeightValue(value: number, unit?: string): string {
  return `${formatOverviewWeightNumber(value, unit)} ${unit ?? 'kg'}`.trim()
}

function formatPerHandValue(value: number, unit?: string): string {
  return `${formatOverviewWeightNumber(value, unit)} ${unit ?? 'kg'} на кожну руку`
}

function formatDualWeightValue(value: number, unit?: string): string {
  const normalizedUnit = normalizeWeightUnitForConversion(unit)
  const lbsValue = normalizedUnit === 'lbs' ? value : value * LBS_PER_KG
  const kgValue = normalizedUnit === 'lbs' ? value * KG_PER_LB : value

  return `${formatConvertedNumber(lbsValue)} lbs (${formatConvertedNumber(kgValue)} kg)`
}

function getDisplayPlannedWeight(exercise: PlannedExercise): number | undefined {
  return exercise.basePlannedWeight ?? exercise.plannedWeight
}

function getDisplayPlannedWeightPerSide(exercise: PlannedExercise): number | undefined {
  return exercise.basePlannedWeightPerSide ?? exercise.plannedWeightPerSide
}

export function formatPlannedWeightOverview(exercise: PlannedExercise): string {
  if (exercise.isBodyweightLoad) {
    if (typeof exercise.plannedWeight === 'number') {
      // Overview intentionally shows the extra load only for bodyweight exercises.
      return formatWeightValue(exercise.plannedWeight, exercise.weightUnit)
    }

    return 'body'
  }

  const displayPlannedWeightPerSide = getDisplayPlannedWeightPerSide(exercise)
  if (typeof displayPlannedWeightPerSide === 'number') {
    return formatPerHandValue(displayPlannedWeightPerSide, exercise.weightUnit)
  }

  const displayPlannedWeight = getDisplayPlannedWeight(exercise)
  if (typeof displayPlannedWeight === 'number') {
    // Overview should show only the effective working load.
    return formatWeightValue(displayPlannedWeight, exercise.weightUnit)
  }

  if (exercise.plannedLoadLabel) {
    return exercise.plannedLoadLabel
  }

  return '-'
}

export function formatPlannedMaxWeightOverview(exercise: PlannedExercise): string {
  if (typeof exercise.maxPlannedWeightPerSide === 'number') {
    return formatPerHandValue(exercise.maxPlannedWeightPerSide, exercise.weightUnit)
  }

  if (typeof exercise.maxPlannedWeight === 'number') {
    return formatWeightValue(exercise.maxPlannedWeight, exercise.weightUnit)
  }

  return '-'
}

export function formatPlannedWeightDetails(exercise: PlannedExercise): string {
  if (exercise.isBodyweightLoad) {
    if (typeof exercise.plannedWeight === 'number') {
      return `body + ${formatDualWeightValue(exercise.plannedWeight, exercise.weightUnit)}`
    }

    return 'body'
  }

  const displayPlannedWeightPerSide = getDisplayPlannedWeightPerSide(exercise)
  if (typeof displayPlannedWeightPerSide === 'number') {
    const totalWeight =
      typeof getDisplayPlannedWeight(exercise) === 'number'
        ? formatDualWeightValue(getDisplayPlannedWeight(exercise) as number, exercise.weightUnit)
        : formatDualWeightValue(displayPlannedWeightPerSide * 2, exercise.weightUnit)

    return `${formatDualWeightValue(displayPlannedWeightPerSide, exercise.weightUnit)} на кожну руку (total: ${totalWeight})`
  }

  const displayPlannedWeight = getDisplayPlannedWeight(exercise)
  if (typeof displayPlannedWeight !== 'number') {
    if (exercise.plannedLoadLabel) {
      return exercise.plannedLoadLabel
    }

    return '-'
  }

  return formatDualWeightValue(displayPlannedWeight, exercise.weightUnit)
}

// Backward compatibility for any existing imports.
export function formatPlannedWeight(exercise: PlannedExercise): string {
  return formatPlannedWeightDetails(exercise)
}

function cleanPathSegment(value: string): string {
  return value.replace(/^\//, '').split('/')[0]
}

const DIRECT_PLAYABLE_VIDEO_PATH_PATTERN = /\.(mp4|webm|ogg|ogv|mov|m4v)$/i

export function isDirectPlayableVideoUrl(rawUrl: string | undefined): boolean {
  if (!rawUrl) {
    return false
  }

  try {
    const url = new URL(rawUrl)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false
    }

    return DIRECT_PLAYABLE_VIDEO_PATH_PATTERN.test(url.pathname)
  } catch {
    return false
  }
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
