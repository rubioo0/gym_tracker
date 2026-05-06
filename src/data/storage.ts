import { seededProgramTemplates } from './seed'
import type {
  AppState,
  BaselineAnchor,
  ExerciseLog,
  ExerciseTemplate,
  FocusRun,
  ProgramTemplate,
  WorkoutLog,
} from '../domain/types'

const STORAGE_KEY = 'training-os-app-state'
const STORAGE_VERSION = 1

interface VersionedState {
  version: number
  state: AppState
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeTemplateProgressionUnits(
  templates: ProgramTemplate[],
): ProgramTemplate[] {
  return templates.map((template) => ({
    ...template,
    sessions: template.sessions.map((session) => ({
      ...session,
      exercises: session.exercises.map((exercise) => {
        if (!exercise.progressionRule) {
          return exercise
        }

        return {
          ...exercise,
          progressionRule: {
            ...exercise.progressionRule,
            maxValue: undefined,
          },
        }
      }),
    })),
  }))
}

function stripProgressionRuleMaxValues(
  templates: ProgramTemplate[],
): ProgramTemplate[] {
  return templates.map((template) => ({
    ...template,
    sessions: template.sessions.map((session) => ({
      ...session,
      exercises: session.exercises.map((exercise) => {
        if (!exercise.progressionRule) {
          return exercise
        }

        const { maxValue: _maxValue, ...progressionRule } = exercise.progressionRule
        return {
          ...exercise,
          progressionRule,
        }
      }),
    })),
  }))
}

function pickCanonicalRun(runs: FocusRun[]): FocusRun {
  const activeRuns = runs.filter((run) => run.status === 'active')
  const candidates = activeRuns.length > 0 ? activeRuns : runs

  return [...candidates].sort((a, b) => {
    const dateA = new Date(a.startedAt).getTime()
    const dateB = new Date(b.startedAt).getTime()
    return dateB - dateA
  })[0]
}

function normalizeRunCounters(
  runs: FocusRun[],
  logs: WorkoutLog[],
  templates: ProgramTemplate[],
): FocusRun[] {
  const templateById = new Map(templates.map((template) => [template.id, template]))

  return runs.map((run) => {
    const runLogs = logs.filter((log) => log.runId === run.id)
    const completedSessionCount = runLogs.length
    const successfulSessionCount = runLogs.filter((log) => log.successful).length
    const template = templateById.get(run.templateId)
    const sessionCount = template?.sessions.length ?? 0
    const nextSessionIndex =
      sessionCount > 0 ? completedSessionCount % sessionCount : run.nextSessionIndex
    const baselineAnchors = buildBaselineAnchorsForRun(template, runLogs)

    return {
      ...run,
      templateName: template?.name ?? run.templateName,
      mode: template?.mode ?? run.mode,
      track: template?.track ?? run.track,
      focusTarget: template?.focusTarget ?? run.focusTarget,
      completedSessionCount,
      successfulSessionCount,
      nextSessionIndex,
      baselineAnchors,
    }
  })
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

function isSameExercise(exercise: ExerciseTemplate, candidate: ExerciseLog): boolean {
  if (candidate.exerciseId === exercise.id) {
    return true
  }

  const targetName = normalizeExerciseNameForMatching(exercise.name)
  const candidateName = normalizeExerciseNameForMatching(candidate.exerciseName)
  return targetName.length > 0 && targetName === candidateName
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

function hasWeightUnitMismatch(
  templateUnit: string | undefined,
  logUnit: string | undefined,
): boolean {
  const normalizedTemplate = normalizeWeightUnitForProgression(templateUnit)
  const normalizedLog = normalizeWeightUnitForProgression(logUnit)
  return Boolean(
    normalizedTemplate && normalizedLog && normalizedTemplate !== normalizedLog,
  )
}

function buildBaselineAnchorsForRun(
  template: ProgramTemplate | undefined,
  runLogs: WorkoutLog[],
): Record<string, BaselineAnchor> | undefined {
  if (!template || runLogs.length === 0) {
    return undefined
  }

  const exercises = template.sessions.flatMap((session) => session.exercises)
  if (exercises.length === 0) {
    return undefined
  }

  const sortedLogs = [...runLogs].sort((a, b) => {
    const timeA = new Date(a.completedAt).getTime()
    const timeB = new Date(b.completedAt).getTime()
    const safeA = Number.isNaN(timeA) ? 0 : timeA
    const safeB = Number.isNaN(timeB) ? 0 : timeB
    return safeA - safeB
  })

  const anchors: Record<string, BaselineAnchor> = {}

  sortedLogs.forEach((log, logIndex) => {
    for (const exercise of exercises) {
      const match = log.exerciseLogs.find((candidate) =>
        isSameExercise(exercise, candidate),
      )

      if (!match || match.skipped) {
        continue
      }

      if (hasWeightUnitMismatch(exercise.weightUnit, match.weightUnit)) {
        continue
      }

      const actualWeight = match.actualWeight
      const plannedWeight = match.plannedWeight
      if (
        typeof actualWeight !== 'number' ||
        !Number.isFinite(actualWeight) ||
        typeof plannedWeight !== 'number' ||
        !Number.isFinite(plannedWeight)
      ) {
        continue
      }

      if (Math.abs(actualWeight - plannedWeight) <= 0.01) {
        continue
      }

      anchors[exercise.id] = {
        weight: actualWeight,
        resetAtSessionIndex: logIndex,
        resetAt: log.completedAt,
      }
    }
  })

  return Object.keys(anchors).length > 0 ? anchors : undefined
}

function mergeDuplicateTemplateRuns(
  runs: FocusRun[],
  logs: WorkoutLog[],
  selectedRunId: string | null,
): { focusRuns: FocusRun[]; workoutLogs: WorkoutLog[]; selectedRunId: string | null } {
  const duplicateGroups = new Map<string, FocusRun[]>()

  runs.forEach((run) => {
    if (run.status === 'archived' || run.status === 'completed') {
      return
    }

    const bucket = duplicateGroups.get(run.templateId) ?? []
    bucket.push(run)
    duplicateGroups.set(run.templateId, bucket)
  })

  let mergedRuns = [...runs]
  let mergedLogs = [...logs]
  let nextSelectedRunId = selectedRunId

  duplicateGroups.forEach((groupRuns) => {
    if (groupRuns.length <= 1) {
      return
    }

    const canonicalRun = pickCanonicalRun(groupRuns)
    const duplicateIds = new Set(
      groupRuns.filter((run) => run.id !== canonicalRun.id).map((run) => run.id),
    )

    if (duplicateIds.size === 0) {
      return
    }

    mergedLogs = mergedLogs.map((log) =>
      duplicateIds.has(log.runId)
        ? {
            ...log,
            runId: canonicalRun.id,
          }
        : log,
    )

    mergedRuns = mergedRuns.filter((run) => !duplicateIds.has(run.id))

    if (nextSelectedRunId && duplicateIds.has(nextSelectedRunId)) {
      nextSelectedRunId = canonicalRun.id
    }
  })

  return {
    focusRuns: mergedRuns,
    workoutLogs: mergedLogs,
    selectedRunId: nextSelectedRunId,
  }
}

function normalizeState(state: Partial<AppState>): AppState {
  const templates = Array.isArray(state.programTemplates)
    ? normalizeTemplateProgressionUnits(state.programTemplates)
    : seededProgramTemplates

  const focusRuns = Array.isArray(state.focusRuns)
    ? state.focusRuns.map((run) => ({
        ...run,
        completedSessionCount:
          typeof run.completedSessionCount === 'number'
            ? run.completedSessionCount
            : 0,
        successfulSessionCount:
          typeof run.successfulSessionCount === 'number'
            ? run.successfulSessionCount
            : typeof run.completedSessionCount === 'number'
              ? run.completedSessionCount
              : 0,
      }))
    : []

  const workoutLogs = Array.isArray(state.workoutLogs)
    ? state.workoutLogs.map((log) => ({
        ...log,
        successful: typeof log.successful === 'boolean' ? log.successful : true,
      }))
    : []

  const merged = mergeDuplicateTemplateRuns(
    focusRuns,
    workoutLogs,
    state.selectedRunId ?? null,
  )

  const normalizedRuns = normalizeRunCounters(
    merged.focusRuns,
    merged.workoutLogs,
    templates,
  )

  return {
    programTemplates: templates,
    focusRuns: normalizedRuns,
    workoutLogs: merged.workoutLogs,
    lastCompletedTrack: state.lastCompletedTrack ?? null,
    selectedRunId: merged.selectedRunId,
  }
}

export function createInitialState(
  templates: ProgramTemplate[] = seededProgramTemplates,
): AppState {
  return {
    programTemplates: templates,
    focusRuns: [],
    workoutLogs: [],
    lastCompletedTrack: null,
    selectedRunId: null,
  }
}

export function loadAppState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return createInitialState()
    }

    const parsed = JSON.parse(raw) as VersionedState
    if (parsed.version !== STORAGE_VERSION || !parsed.state) {
      return createInitialState()
    }

    return normalizeState(parsed.state)
  } catch {
    return createInitialState()
  }
}

export function saveAppState(state: AppState): void {
  const payload: VersionedState = {
    version: STORAGE_VERSION,
    state,
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
}

export function clearAppState(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export function exportAppStateJson(state: AppState): string {
  const exportedState: AppState = {
    ...state,
    programTemplates: stripProgressionRuleMaxValues(state.programTemplates),
  }

  return JSON.stringify(
    {
      backupVersion: 2,
      exportedAt: new Date().toISOString(),
      storageVersion: STORAGE_VERSION,
      state: exportedState,
    },
    null,
    2,
  )
}

export function exportCleanAppStateJson(state: AppState): string {
  const activeAndPausedRuns = state.focusRuns.filter(
    (run) => run.status === 'active' || run.status === 'paused',
  )
  const activeAndPausedRunIds = new Set(activeAndPausedRuns.map((run) => run.id))

  const filteredLogs = state.workoutLogs.filter((log) =>
    activeAndPausedRunIds.has(log.runId),
  )

  const cleanState: AppState = {
    programTemplates: stripProgressionRuleMaxValues(state.programTemplates),
    focusRuns: activeAndPausedRuns,
    workoutLogs: filteredLogs,
    lastCompletedTrack: state.lastCompletedTrack,
    selectedRunId:
      state.selectedRunId && activeAndPausedRunIds.has(state.selectedRunId)
        ? state.selectedRunId
        : null,
  }

  return JSON.stringify(
    {
      backupVersion: 2,
      exportedAt: new Date().toISOString(),
      storageVersion: STORAGE_VERSION,
      state: cleanState,
      filterNote: 'This is a clean backup: only active/paused runs and their logs are included. Archived/completed runs are excluded.',
    },
    null,
    2,
  )
}

function hasProgramTemplates(value: unknown): value is { programTemplates: ProgramTemplate[] } {
  if (!value || typeof value !== 'object') {
    return false
  }

  return Array.isArray((value as { programTemplates?: unknown }).programTemplates)
}

function extractImportState(parsed: unknown): Partial<AppState> | null {
  if (hasProgramTemplates(parsed)) {
    return parsed as Partial<AppState>
  }

  if (!isRecord(parsed)) {
    return null
  }

  if (hasProgramTemplates(parsed.state)) {
    return parsed.state as Partial<AppState>
  }

  if (isRecord(parsed.state) && hasProgramTemplates(parsed.state.state)) {
    return parsed.state.state as Partial<AppState>
  }

  return null
}

export function importStateFromJson(raw: string): AppState | null {
  try {
    const parsed = JSON.parse(raw)
    const extractedState = extractImportState(parsed)
    if (!extractedState) {
      return null
    }

    return normalizeState(extractedState)
  } catch {
    return null
  }
}
