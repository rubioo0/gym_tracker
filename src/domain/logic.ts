import type {
  AppState,
  ExerciseTemplate,
  FocusRun,
  ProgressionRule,
  PlannedExercise,
  PlannedSession,
  ProgramTemplate,
  SessionTemplate,
  TrackType,
} from './types'

interface ProgressionCounters {
  completedSessionCount: number
  successfulSessionCount: number
}

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

export function getPlannedExercise(
  exercise: ExerciseTemplate,
  countersOrCompleted: number | ProgressionCounters,
): PlannedExercise {
  const planned: PlannedExercise = {
    id: exercise.id,
    name: exercise.name,
    sets: exercise.sets,
    reps: exercise.reps,
    plannedWeight: exercise.plannedWeight,
    weightUnit: exercise.weightUnit,
    note: exercise.note,
    reference: exercise.reference,
  }

  if (!exercise.progressionRule) {
    return planned
  }

  const rule = exercise.progressionRule
  const counters = normalizeProgressionCounters(countersOrCompleted)
  const progressionSessionCount = getProgressionSessionCount(rule, counters)
  const steps = getProgressionSteps(progressionSessionCount, rule.frequency)
  planned.progressionNote =
    rule.note ??
    `${rule.type} +${rule.amount} every ${rule.frequency} ${rule.basis === 'successfulTrackSessions' ? 'successful' : 'completed'} sessions`

  if (rule.type === 'weight' && typeof exercise.plannedWeight === 'number') {
    const progressedWeight = clamp(
      exercise.plannedWeight + steps * rule.amount,
      rule.minValue,
      rule.maxValue,
    )
    planned.plannedWeight = Number(progressedWeight.toFixed(2))
    planned.nextTargetHint =
      rule.frequency > 0
        ? `Next increase in ${getSessionsUntilNext(progressionSessionCount, rule.frequency)} session(s)`
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
        rule.frequency > 0
          ? `Next increase in ${getSessionsUntilNext(progressionSessionCount, rule.frequency)} session(s)`
          : undefined
    }
  }

  return planned
}

export function buildPlannedSession(
  run: FocusRun,
  template: ProgramTemplate,
): PlannedSession {
  const session = getSessionByIndex(template, run.nextSessionIndex)
  return {
    run,
    template,
    session,
    exercises: session.exercises.map((exercise) =>
      getPlannedExercise(exercise, {
        completedSessionCount: run.completedSessionCount,
        successfulSessionCount: run.successfulSessionCount,
      }),
    ),
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
