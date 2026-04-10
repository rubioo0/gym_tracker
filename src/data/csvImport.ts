import Papa from 'papaparse'
import type {
  ExerciseTemplate,
  ProgramMode,
  ProgramTemplate,
  ProgressionFrequencyUnit,
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
  durationWeeks?: number
}

const DEFAULT_MODE: ProgramMode = 'main'
const DEFAULT_TRACK: TrackType = 'upper'
const DEFAULT_DURATION_WEEKS = 8
const BASELINE_DURATION_WEEKS = 8
const BASELINE_SESSION_COUNT = 12
const SESSIONS_PER_WEEK = BASELINE_SESSION_COUNT / BASELINE_DURATION_WEEKS

interface ParsedLoadConfig {
  plannedWeight?: number
  plannedWeightPerSide?: number
  weightUnit?: string
  isBodyweightLoad?: boolean
  plannedLoadLabel?: string
}

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

function formatNumber(value: number): string {
  return Number(value.toFixed(2)).toString()
}

function normalizeDurationWeeks(durationWeeks: number | undefined): number {
  if (!Number.isFinite(durationWeeks)) {
    return DEFAULT_DURATION_WEEKS
  }

  return Math.max(1, Math.round(durationWeeks as number))
}

function estimateProgramSessionCount(durationWeeks: number): number {
  return Math.max(1, Math.round(durationWeeks * SESSIONS_PER_WEEK))
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
    const mod10 = count % 10
    const mod100 = count % 100

    if (mod10 === 1 && mod100 !== 11) {
      return `${count} підхід`
    }

    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
      return `${count} підходи`
    }

    return `${count} підходів`
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

  if (normalized.includes('kg') || normalized.includes('кг')) {
    return 'kg'
  }

  if (/\d/.test(baseConfig)) {
    return 'kg'
  }

  return undefined
}

function normalizeWeightUnit(rawUnit: string | undefined): string {
  if (!rawUnit) {
    return 'kg'
  }

  const normalized = rawUnit.toLowerCase()
  if (normalized.includes('lb')) {
    return 'lbs'
  }

  return 'kg'
}

function buildWeightLabel(
  total: number,
  unit: string,
  perSide?: number,
): string {
  const totalLabel = `${formatNumber(total)} ${unit}`
  if (typeof perSide === 'number') {
    return `${totalLabel} (${formatNumber(perSide)})`
  }

  return totalLabel
}

function parseLoadConfig(rawBaseConfig: string): ParsedLoadConfig {
  if (isEmptyOrDash(rawBaseConfig)) {
    return {}
  }

  const normalized = rawBaseConfig.toLowerCase().replace(/\s+/g, ' ').trim()

  if (
    normalized === 'body' ||
    normalized === 'bodyweight' ||
    normalized === 'bw' ||
    normalized.includes('вага тіла')
  ) {
    return {
      isBodyweightLoad: true,
      plannedLoadLabel: 'body',
    }
  }

  const bodyPlusMatch = normalized.match(
    /^body(?:weight)?\s*\+\s*(-?\d+(?:[.,]\d+)?)\s*(kg|kgs?|кг|lb|lbs)?$/i,
  )
  if (bodyPlusMatch) {
    const amount = Number(bodyPlusMatch[1].replace(',', '.'))
    if (!Number.isFinite(amount)) {
      return {
        plannedLoadLabel: rawBaseConfig,
      }
    }

    const unit = normalizeWeightUnit(bodyPlusMatch[2])
    return {
      plannedWeight: amount,
      weightUnit: unit,
      isBodyweightLoad: true,
      plannedLoadLabel: `body + ${formatNumber(amount)} ${unit}`,
    }
  }

  const splitPerSideMatch = normalized.match(
    /^(-?\d+(?:[.,]\d+)?)\s*(kg|kgs?|кг|lb|lbs)?\s*\(\s*(-?\d+(?:[.,]\d+)?)\s*\)$/i,
  )
  if (splitPerSideMatch) {
    const total = Number(splitPerSideMatch[1].replace(',', '.'))
    const perSide = Number(splitPerSideMatch[3].replace(',', '.'))
    if (!Number.isFinite(total) || !Number.isFinite(perSide)) {
      return {
        plannedLoadLabel: rawBaseConfig,
      }
    }

    const unit = normalizeWeightUnit(splitPerSideMatch[2] ?? parseWeightUnit(rawBaseConfig))
    return {
      plannedWeight: total,
      plannedWeightPerSide: perSide,
      weightUnit: unit,
      plannedLoadLabel: buildWeightLabel(total, unit, perSide),
    }
  }

  const weightOnlyMatch = normalized.match(
    /^(-?\d+(?:[.,]\d+)?)\s*(kg|kgs?|кг|lb|lbs)?$/i,
  )
  if (weightOnlyMatch) {
    const amount = Number(weightOnlyMatch[1].replace(',', '.'))
    if (!Number.isFinite(amount)) {
      return {
        plannedLoadLabel: rawBaseConfig,
      }
    }

    const unit = normalizeWeightUnit(weightOnlyMatch[2] ?? parseWeightUnit(rawBaseConfig))
    return {
      plannedWeight: amount,
      weightUnit: unit,
      plannedLoadLabel: buildWeightLabel(amount, unit),
    }
  }

  const numberWithUnitMatch = rawBaseConfig.match(
    /(-?\d+(?:[.,]\d+)?)\s*(kg|kgs?|кг|lb|lbs)/i,
  )
  if (numberWithUnitMatch) {
    const amount = Number(numberWithUnitMatch[1].replace(',', '.'))
    if (Number.isFinite(amount)) {
      const unit = normalizeWeightUnit(numberWithUnitMatch[2])
      return {
        plannedWeight: amount,
        weightUnit: unit,
        plannedLoadLabel: buildWeightLabel(amount, unit),
      }
    }
  }

  const numericFallback = extractNumbers(rawBaseConfig)[0]
  if (typeof numericFallback === 'number') {
    const unit = parseWeightUnit(rawBaseConfig) ?? 'kg'
    return {
      plannedWeight: numericFallback,
      weightUnit: unit,
      plannedLoadLabel: buildWeightLabel(numericFallback, unit),
    }
  }

  return {
    plannedLoadLabel: rawBaseConfig,
  }
}

function parseProgressionFrequency(
  progressionRaw: string,
): { frequency: number; frequencyUnit: ProgressionFrequencyUnit } {
  const pipeMatch = progressionRaw.match(/\|\s*(\d+)\s*([a-zA-Zа-яА-ЯіІїЇєЄґҐ]*)/)
  if (pipeMatch) {
    const parsedFrequency = Number(pipeMatch[1])
    const token = (pipeMatch[2] ?? '').toLowerCase()
    const frequencyUnit: ProgressionFrequencyUnit =
      token.includes('week') || token.includes('wk') || token.startsWith('тиж')
        ? 'week'
        : 'session'

    if (Number.isInteger(parsedFrequency) && parsedFrequency > 0) {
      return {
        frequency: parsedFrequency,
        frequencyUnit,
      }
    }
  }

  const allNumbers = extractNumbers(progressionRaw)
  const frequencyCandidate = allNumbers
    .slice(1)
    .find((value) => Number.isInteger(value) && value > 0)

  const frequency =
    typeof frequencyCandidate === 'number' && frequencyCandidate > 0
      ? frequencyCandidate
      : 1

  const normalized = progressionRaw.toLowerCase()
  const frequencyUnit: ProgressionFrequencyUnit =
    normalized.includes('week') || normalized.includes('wk') || normalized.includes('тиж')
      ? 'week'
      : 'session'

  return {
    frequency,
    frequencyUnit,
  }
}

function parseProgressionType(
  progressionRaw: string,
  fallbackType: 'weight' | 'reps',
): 'weight' | 'reps' {
  const normalized = progressionRaw.toLowerCase()

  if (
    normalized.includes('rep') ||
    normalized.includes('повтор') ||
    normalized.includes('раз')
  ) {
    return 'reps'
  }

  if (
    normalized.includes('kg') ||
    normalized.includes('кг') ||
    normalized.includes('lb')
  ) {
    return 'weight'
  }

  return fallbackType
}

function parseProgressionPerSideAmount(progressionRaw: string): number | undefined {
  const perSideMatch = progressionRaw.match(
    /\+\s*\d+(?:[.,]\d+)?[^|\r\n]*\(\s*(-?\d+(?:[.,]\d+)?)\s*\)/,
  )

  if (!perSideMatch) {
    return undefined
  }

  const parsed = Number(perSideMatch[1].replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : undefined
}

function estimateProgressionSteps(
  frequency: number,
  frequencyUnit: ProgressionFrequencyUnit,
  durationWeeks: number,
  durationSessionCount: number,
): number {
  if (frequency <= 0) {
    return 0
  }

  if (frequencyUnit === 'week') {
    return Math.floor(durationWeeks / frequency)
  }

  return Math.floor(durationSessionCount / frequency)
}

function pickReferenceCell(row: string[]): string {
  // New format places reference in column 7. Legacy imports may still keep it in column 9.
  const candidates = [row[6], row[7], row[8]]

  for (const candidate of candidates) {
    const normalized = normalizeCell(candidate ?? '')
    if (/^https?:\/\//i.test(normalized)) {
      return normalized
    }
  }

  return normalizeCell(candidates[0] ?? '')
}

function parseProgressionRule(
  progressionRaw: string,
  fallbackType: 'weight' | 'reps',
  plannedWeight: number | undefined,
  durationWeeks: number,
  durationSessionCount: number,
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

  const amountPerSide = parseProgressionPerSideAmount(progressionRaw)

  const { frequency, frequencyUnit } = parseProgressionFrequency(progressionRaw)

  const normalizedProgression = progressionRaw.replace(/\s+/g, ' ').trim()

  const type = parseProgressionType(normalizedProgression, fallbackType)

  let maxValue: number | undefined
  if (type === 'weight' && typeof plannedWeight === 'number') {
    const steps = estimateProgressionSteps(
      frequency,
      frequencyUnit,
      durationWeeks,
      durationSessionCount,
    )
    maxValue = Number((plannedWeight + steps * amount).toFixed(2))
  }

  return {
    type,
    amount,
    amountPerSide,
    frequency,
    frequencyUnit,
    basis: 'successfulTrackSessions',
    maxValue,
    note: normalizedProgression,
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
  durationWeeks: number,
  durationSessionCount: number,
): ExerciseTemplate {
  const exerciseNumber = normalizeCell(row[0] ?? '') || `${index}`
  const rawName = normalizeCell(row[1] ?? '')
  const rawSets = normalizeCell(row[2] ?? '')
  const rawReps = normalizeCell(row[3] ?? '')
  const rawBaseConfig = normalizeCell(row[4] ?? '')
  const rawProgression = normalizeCell(row[5] ?? '')
  const rawReference = pickReferenceCell(row)

  const parsedLoad = parseLoadConfig(rawBaseConfig)

  const fallbackType: 'weight' | 'reps' =
    typeof parsedLoad.plannedWeight === 'number' ? 'weight' : 'reps'

  const progressionRule = parseProgressionRule(
    rawProgression,
    fallbackType,
    parsedLoad.plannedWeight,
    durationWeeks,
    durationSessionCount,
  )

  const noteParts: string[] = []
  if (
    !isEmptyOrDash(rawBaseConfig) &&
    typeof parsedLoad.plannedWeight !== 'number' &&
    !parsedLoad.plannedLoadLabel
  ) {
    noteParts.push(`Base: ${rawBaseConfig}`)
  }

  return {
    id: `${programId}-ex-${exerciseNumber}`,
    name: normalizeExerciseName(rawName, index),
    sets: normalizeSets(rawSets),
    reps: normalizeReps(rawReps),
    plannedWeight: parsedLoad.plannedWeight,
    plannedWeightPerSide: parsedLoad.plannedWeightPerSide,
    weightUnit: parsedLoad.weightUnit,
    isBodyweightLoad: parsedLoad.isBodyweightLoad,
    plannedLoadLabel: parsedLoad.plannedLoadLabel,
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
  const durationWeeks = normalizeDurationWeeks(options.durationWeeks)
  const durationSessionCount = estimateProgramSessionCount(durationWeeks)

  const exercises = exerciseRows.map((row, index) =>
    buildExercise(row, index + 1, programId, durationWeeks, durationSessionCount),
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
