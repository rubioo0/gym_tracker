import type {
  AppState,
  ExerciseTemplate,
  ExerciseLog,
  FocusRun,
  ProgressionRule,
  PlannedExercise,
  PlannedSession,
  ProgramTemplate,
  WorkoutLog,
  SessionTemplate,
  TrackType,
} from './types'

interface ProgressionCounters {
  completedSessionCount: number
  successfulSessionCount: number
}

interface PlannedExerciseOptions {
  latestCompletedActualWeight?: number
}

const FIXED_PROGRAM_WEEKS = 8
const FIXED_PROGRAM_SESSIONS = 16
const SESSIONS_PER_WEEK = FIXED_PROGRAM_SESSIONS / FIXED_PROGRAM_WEEKS

export function makeId(): string {
  return crypto.randomUUID()
}

export function getTemplateById(
  templates: ProgramTemplate[],
  templateId: string,
): ProgramTemplate | undefined {
  return templates.find((template) => template.id === templateId)
}

export function getSessionByIndex(
  template: ProgramTemplate,
  sessionIndex: number,
): SessionTemplate {
  const normalizedIndex =
    ((sessionIndex % template.sessions.length) + template.sessions.length) %
    template.sessions.length
  return template.sessions[normalizedIndex]
}

export function getProgressionSteps(
  completedSessionCount: number,
  frequency: number,
): number {
  if (frequency <= 0) {
    return 0
  }
  return Math.floor(completedSessionCount / frequency)
}

function getEffectiveFrequencySessions(rule: ProgressionRule): number {
  if (rule.frequency <= 0) {
    return 0
  }

  if (rule.frequencyUnit === 'week') {
    return Math.max(1, Math.round(rule.frequency * SESSIONS_PER_WEEK))
  }

  return rule.frequency
}

function getNextHintCount(
  rule: ProgressionRule,
  sessionsUntilNext: number,
): number {
  if (rule.frequencyUnit === 'week') {
    return Math.max(1, Math.ceil(sessionsUntilNext / SESSIONS_PER_WEEK))
  }

  return sessionsUntilNext
}

function getRemainingProgressionStepCount(
  completedSessionCount: number,
  effectiveFrequencySessions: number,
  hasLatestCompletedActualWeight: boolean,
): number {
  if (effectiveFrequencySessions <= 0) {
    return 0
  }

  const sessionsLeft = Math.max(0, FIXED_PROGRAM_SESSIONS - completedSessionCount)
  if (sessionsLeft <= 1) {
    return 0
  }

  const rawSteps = Math.floor((sessionsLeft - 1) / effectiveFrequencySessions)

  // When rebasing from a just-logged actual load, keep one full cadence window
  // before counting max progression steps for the remaining program horizon.
  if (hasLatestCompletedActualWeight) {
    return Math.max(0, rawSteps - 1)
  }

  return rawSteps
}

function clamp(value: number, minValue?: number, maxValue?: number): number {
  let output = value
  if (typeof minValue === 'number') {
    output = Math.max(minValue, output)
  }
  if (typeof maxValue === 'number') {
    output = Math.min(maxValue, output)
  }
  return output
}

function formatNumber(value: number): string {
  return Number(value.toFixed(2)).toString()
}

function normalizeWeightUnitForProgression(
  unit: string | undefined,
): 'kg' | 'lbs' | undefined {
  if (!unit) {
    return undefined
  }

  const normalized = unit.toLowerCase()
  if (normalized.includes('lb')) {
    return 'lbs'
  }

  if (normalized.includes('kg') || normalized.includes('кг')) {
    return 'kg'
  }

  return undefined
}

function normalizeExerciseNameForMatching(value: string | undefined): string {
  if (!value) {
    return ''
  }

  return value
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9а-яіїєґ]/gi, '')
}

function isSameExercise(
  exercise: ExerciseTemplate,
  candidate: ExerciseLog,
): boolean {
  if (candidate.exerciseId === exercise.id) {
    return true
  }

  const targetName = normalizeExerciseNameForMatching(exercise.name)
  const candidateName = normalizeExerciseNameForMatching(candidate.exerciseName)
  return targetName.length > 0 && targetName === candidateName
}

function buildPlannedLoadLabel(
  exercise: ExerciseTemplate,
  plannedWeight: number,
  plannedWeightPerSide?: number,
): string {
  const unit = exercise.weightUnit ?? 'kg'

  if (exercise.isBodyweightLoad) {
    return `body + ${formatNumber(plannedWeight)} ${unit}`
  }

  const totalLabel = `${formatNumber(plannedWeight)} ${unit}`.trim()
  if (typeof plannedWeightPerSide === 'number') {
    return `${totalLabel} (${formatNumber(plannedWeightPerSide)})`
  }

  return totalLabel
}

function parseRepsRange(reps: string): { start: number; end: number } | null {
  const value = reps.trim()
  const rangeMatch = value.match(/^(\d+)\s*-\s*(\d+)$/)
  if (rangeMatch) {
    const start = Number(rangeMatch[1])
    const end = Number(rangeMatch[2])
    return { start, end }
  }

  const singleMatch = value.match(/^(\d+)$/)
  if (singleMatch) {
    const count = Number(singleMatch[1])
    return { start: count, end: count }
  }

  return null
}

function getSessionsUntilNext(
  completedSessionCount: number,
  frequency: number,
): number {
  if (frequency <= 0) {
    return 0
  }

  const remainder = completedSessionCount % frequency
  return remainder === 0 ? frequency : frequency - remainder
}

function normalizeProgressionCounters(
  countersOrCompleted: number | ProgressionCounters,
): ProgressionCounters {
  if (typeof countersOrCompleted === 'number') {
    return {
      completedSessionCount: countersOrCompleted,
      successfulSessionCount: countersOrCompleted,
    }
  }

  return countersOrCompleted
}

function getProgressionSessionCount(
  rule: ProgressionRule,
  counters: ProgressionCounters,
): number {
  if (rule.basis === 'successfulTrackSessions') {
    return counters.successfulSessionCount
  }

  return counters.completedSessionCount
}

function getFrequencyUnitLabel(rule: ProgressionRule, count: number): string {
  const base = rule.frequencyUnit === 'week' ? 'week' : 'session'
  return count === 1 ? base : `${base}s`
}

function buildMaxWeightExplanation(
  baseWeight: number,
  unit: string,
  amount: number,
  frequency: number,
  frequencyUnit: 'week' | 'session',
  steps: number,
  maxWeight: number,
  completedSessionCount: number,
): string {
  const frequencyLabel = frequency === 1 ? frequencyUnit : `${frequencyUnit}s`
  const sessionsLeft = Math.max(0, FIXED_PROGRAM_SESSIONS - completedSessionCount)
  return `${formatNumber(baseWeight)} ${unit} + (${steps} x ${formatNumber(amount)} ${unit}) every ${frequency} ${frequencyLabel}; sessions done ${completedSessionCount}, sessions left ${sessionsLeft} = ${formatNumber(maxWeight)} ${unit}`
}

function shouldUsePerSideLoadSchema(exercise: ExerciseTemplate): boolean {
  if (exercise.isBodyweightLoad) {
    return false
  }

  return typeof exercise.plannedWeightPerSide === 'number'
}

export function getPlannedExercise(
  exercise: ExerciseTemplate,
  countersOrCompleted: number | ProgressionCounters,
  options?: PlannedExerciseOptions,
): PlannedExercise {
  const planned: PlannedExercise = {
    id: exercise.id,
    name: exercise.name,
    sets: exercise.sets,
    reps: exercise.reps,
    plannedWeight: exercise.plannedWeight,
    plannedWeightPerSide: exercise.plannedWeightPerSide,
    weightUnit: exercise.weightUnit,
    isBodyweightLoad: exercise.isBodyweightLoad,
    plannedLoadLabel: exercise.plannedLoadLabel,
    note: exercise.note,
    reference: exercise.reference,
  }

  if (!exercise.progressionRule) {
    return planned
  }

  const rule = exercise.progressionRule
  const counters = normalizeProgressionCounters(countersOrCompleted)
  const progressionSessionCount = getProgressionSessionCount(rule, counters)
  const effectiveFrequencySessions = getEffectiveFrequencySessions(rule)
  const steps = getProgressionSteps(progressionSessionCount, effectiveFrequencySessions)
  const hasLatestCompletedActualWeight =
    typeof options?.latestCompletedActualWeight === 'number' &&
    Number.isFinite(options.latestCompletedActualWeight)

  const shouldAdvanceFromLatestCompletedActual =
    hasLatestCompletedActualWeight &&
    effectiveFrequencySessions > 0 &&
    progressionSessionCount > 0 &&
    (progressionSessionCount + 1) % effectiveFrequencySessions === 0

  const effectiveWeightSteps = hasLatestCompletedActualWeight
    ? shouldAdvanceFromLatestCompletedActual
      ? 1
      : 0
    : steps

  const basePlannedWeight = hasLatestCompletedActualWeight
    ? (options?.latestCompletedActualWeight as number)
    : exercise.plannedWeight

  const usesPerSideLoadSchema = shouldUsePerSideLoadSchema(exercise)

  const basePlannedWeightPerSide =
    usesPerSideLoadSchema && hasLatestCompletedActualWeight
      ? Number(((options?.latestCompletedActualWeight as number) / 2).toFixed(2))
      : usesPerSideLoadSchema
        ? exercise.plannedWeightPerSide
        : undefined

  planned.progressionNote =
    rule.note ??
    `${rule.type} +${rule.amount} every ${rule.frequency} ${getFrequencyUnitLabel(rule, rule.frequency)} (${rule.basis === 'successfulTrackSessions' ? 'successful' : 'completed'})`

  if (rule.type === 'weight' && typeof basePlannedWeight === 'number') {
    const progressedWeight = clamp(
      basePlannedWeight + effectiveWeightSteps * rule.amount,
      rule.minValue,
      rule.maxValue,
    )

    let progressedPerSide: number | undefined
    if (typeof basePlannedWeightPerSide === 'number') {
      if (typeof rule.amountPerSide === 'number') {
        progressedPerSide = Number(
          (basePlannedWeightPerSide +
            effectiveWeightSteps * rule.amountPerSide).toFixed(2),
        )
      } else {
        progressedPerSide = Number((progressedWeight / 2).toFixed(2))
      }
    }

    planned.plannedWeight = Number(progressedWeight.toFixed(2))
    planned.plannedWeightPerSide = progressedPerSide
    planned.plannedLoadLabel = buildPlannedLoadLabel(
      exercise,
      planned.plannedWeight,
      progressedPerSide,
    )
    const maxSteps = getRemainingProgressionStepCount(
      progressionSessionCount,
      effectiveFrequencySessions,
      hasLatestCompletedActualWeight,
    )
    const unitLabel = exercise.weightUnit ?? 'kg'
    const maxProgressedWeight = clamp(
      basePlannedWeight + maxSteps * rule.amount,
      rule.minValue,
      rule.maxValue,
    )

    planned.maxPlannedWeight = Number(maxProgressedWeight.toFixed(2))
    if (typeof basePlannedWeightPerSide === 'number') {
      if (typeof rule.amountPerSide === 'number') {
        planned.maxPlannedWeightPerSide = Number(
          (basePlannedWeightPerSide + maxSteps * rule.amountPerSide).toFixed(2),
        )
      } else {
        planned.maxPlannedWeightPerSide = Number((maxProgressedWeight / 2).toFixed(2))
      }
    }

    planned.maxWeightExplanation = buildMaxWeightExplanation(
      basePlannedWeight,
      unitLabel,
      rule.amount,
      rule.frequency,
      rule.frequencyUnit === 'week' ? 'week' : 'session',
      maxSteps,
      maxProgressedWeight,
      progressionSessionCount,
    )

    planned.nextTargetHint =
      effectiveFrequencySessions > 0
        ? (() => {
            const sessionsUntilNext = getSessionsUntilNext(
              progressionSessionCount,
              effectiveFrequencySessions,
            )
            const hintCount = getNextHintCount(rule, sessionsUntilNext)
            return `Next increase in ${hintCount} ${getFrequencyUnitLabel(rule, hintCount)}`
          })()
        : undefined
    return planned
  }

  if (rule.type === 'reps') {
    const parsed = parseRepsRange(exercise.reps)
    if (parsed) {
      const start = parsed.start + steps * rule.amount
      const end = parsed.end + steps * rule.amount
      planned.reps = start === end ? `${start}` : `${start}-${end}`
      planned.nextTargetHint =
        effectiveFrequencySessions > 0
          ? (() => {
              const sessionsUntilNext = getSessionsUntilNext(
                progressionSessionCount,
                effectiveFrequencySessions,
              )
              const hintCount = getNextHintCount(rule, sessionsUntilNext)
              return `Next increase in ${hintCount} ${getFrequencyUnitLabel(rule, hintCount)}`
            })()
          : undefined
    }
  }

  return planned
}

function getLatestCompletedActualWeight(
  runLogs: WorkoutLog[],
  exercise: ExerciseTemplate,
  targetWeightUnit: string | undefined,
): number | undefined {
  const normalizedTargetWeightUnit = normalizeWeightUnitForProgression(targetWeightUnit)

  for (const runLog of runLogs) {
    const exerciseLog = runLog.exerciseLogs.find(
      (candidate: ExerciseLog) => isSameExercise(exercise, candidate),
    )

    if (!exerciseLog || !exerciseLog.completed || exerciseLog.skipped) {
      continue
    }

    if (
      typeof exerciseLog.actualWeight === 'number' &&
      Number.isFinite(exerciseLog.actualWeight)
    ) {
      const normalizedLogWeightUnit = normalizeWeightUnitForProgression(
        exerciseLog.weightUnit,
      )

      if (!normalizedTargetWeightUnit || !normalizedLogWeightUnit) {
        return exerciseLog.actualWeight
      }

      if (normalizedLogWeightUnit !== normalizedTargetWeightUnit) {
        // Historical logs with a different unit are ignored as progression baselines.
        continue
      }

      return Number(exerciseLog.actualWeight.toFixed(2))
    }
  }

  return undefined
}

function getExerciseProgressionCounters(
  runLogs: WorkoutLog[],
  exercise: ExerciseTemplate,
): ProgressionCounters {
  let completedSessionCount = 0
  let successfulSessionCount = 0

  for (const runLog of runLogs) {
    const exerciseLog = runLog.exerciseLogs.find((candidate) =>
      isSameExercise(exercise, candidate),
    )

    if (!exerciseLog || !exerciseLog.completed || exerciseLog.skipped) {
      continue
    }

    completedSessionCount += 1
    if (runLog.successful) {
      successfulSessionCount += 1
    }
  }

  return {
    completedSessionCount,
    successfulSessionCount,
  }
}

export function buildPlannedSession(
  run: FocusRun,
  template: ProgramTemplate,
  workoutLogs: WorkoutLog[] = [],
): PlannedSession {
  const session = getSessionByIndex(template, run.nextSessionIndex)
  const templateLogs = workoutLogs
    .filter((workoutLog) => workoutLog.templateId === run.templateId)
    .sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1))

  return {
    run,
    template,
    session,
    exercises: session.exercises.map((exercise) => {
      const exerciseCounters = getExerciseProgressionCounters(templateLogs, exercise)
      const latestCompletedActualWeight = getLatestCompletedActualWeight(
        templateLogs,
        exercise,
        exercise.weightUnit,
      )

      const plannedExercise = getPlannedExercise(
        exercise,
        exerciseCounters,
        {
          latestCompletedActualWeight,
        },
      )

      plannedExercise.sessionDoneCount = exerciseCounters.completedSessionCount
      plannedExercise.sessionLeftCount = Math.max(
        0,
        FIXED_PROGRAM_SESSIONS - exerciseCounters.completedSessionCount,
      )

      return plannedExercise
    }),
  }
}

export function getActiveRuns(state: AppState): FocusRun[] {
  return state.focusRuns.filter((run) => run.status === 'active')
}

export function getLastLogForRun(state: AppState, runId: string) {
  const logs = state.workoutLogs
    .filter((log) => log.runId === runId)
    .sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1))
  return logs[0]
}

export function getOppositeTrack(track: TrackType): TrackType {
  if (track === 'upper') {
    return 'lower'
  }
  if (track === 'lower') {
    return 'upper'
  }
  return 'custom'
}

export function getSuggestedTrack(activeRuns: FocusRun[], lastTrack: TrackType | null) {
  const activeTracks = new Set(activeRuns.map((run) => run.track))
  if (lastTrack) {
    const opposite = getOppositeTrack(lastTrack)
    if (activeTracks.has(opposite)) {
      return opposite
    }
  }

  if (activeTracks.has('upper')) {
    return 'upper'
  }
  if (activeTracks.has('lower')) {
    return 'lower'
  }
  return activeRuns[0]?.track ?? null
}

export function getSuggestedRun(state: AppState): FocusRun | null {
  const activeRuns = getActiveRuns(state)
  if (activeRuns.length === 0) {
    return null
  }

  if (state.selectedRunId) {
    const selectedActiveRun = activeRuns.find(
      (run) => run.id === state.selectedRunId,
    )
    if (selectedActiveRun) {
      return selectedActiveRun
    }
  }

  const suggestedTrack = getSuggestedTrack(activeRuns, state.lastCompletedTrack)
  if (!suggestedTrack) {
    return activeRuns[0]
  }

  return (
    activeRuns.find((run) => run.track === suggestedTrack) ?? activeRuns[0] ?? null
  )
}
