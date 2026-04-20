import { seededProgramTemplates } from './seed'
import type { AppState, ProgramTemplate } from '../domain/types'

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

function normalizeState(state: Partial<AppState>): AppState {
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

  return {
    programTemplates: Array.isArray(state.programTemplates)
      ? normalizeTemplateProgressionUnits(state.programTemplates)
      : seededProgramTemplates,
    focusRuns,
    workoutLogs,
    lastCompletedTrack: state.lastCompletedTrack ?? null,
    selectedRunId: state.selectedRunId ?? null,
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
