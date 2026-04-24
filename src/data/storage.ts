import { seededProgramTemplates } from './seed'
import type { AppState, FocusRun, ProgramTemplate, WorkoutLog } from '../domain/types'

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
        if (!exercise.progressionRule || exercise.progressionRule.frequencyUnit !== 'week') {
          return exercise
        }

        return {
          ...exercise,
          progressionRule: {
            ...exercise.progressionRule,
            frequencyUnit: 'session',
          },
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

    return {
      ...run,
      templateName: template?.name ?? run.templateName,
      mode: template?.mode ?? run.mode,
      track: template?.track ?? run.track,
      focusTarget: template?.focusTarget ?? run.focusTarget,
      completedSessionCount,
      successfulSessionCount,
      nextSessionIndex,
    }
  })
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
  return JSON.stringify(
    {
      backupVersion: 2,
      exportedAt: new Date().toISOString(),
      storageVersion: STORAGE_VERSION,
      state,
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
    programTemplates: state.programTemplates,
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
