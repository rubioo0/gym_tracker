import {
  buildBaselineAnchorsForRun,
  buildPlannedSession,
  getTemplateById,
  makeId,
} from './logic'
import type {
  AppState,
  FocusRun,
  LogSessionInput,
  ProgramTemplate,
  RunStatus,
  WorkoutLog,
} from './types'

export type AppAction =
  | { type: 'hydrate'; payload: AppState }
  | { type: 'replaceTemplates'; templates: ProgramTemplate[] }
  | { type: 'deleteTemplate'; templateId: string }
  | { type: 'deleteTemplates'; templateIds: string[] }
  | { type: 'startRun'; templateId: string; now: string }
  | { type: 'pauseRun'; runId: string; reason?: string }
  | { type: 'resumeRun'; runId: string }
  | { type: 'switchRun'; runId: string }
  | { type: 'restartRun'; runId: string; now: string }
  | { type: 'completeRun'; runId: string }
  | { type: 'archiveRun'; runId: string }
  | { type: 'deleteRun'; runId: string }
  | { type: 'deleteRuns'; runIds: string[] }
  | { type: 'setSelectedRun'; runId: string | null }
  | { type: 'setShowProgressionInsights'; show: boolean }
  | { type: 'logSession'; payload: LogSessionInput }
  | { type: 'importLogs'; logs: WorkoutLog[] }
  | { type: 'clearAllData'; templates: ProgramTemplate[] }
  | { type: 'updateProgramTemplate'; template: ProgramTemplate }
  | { type: 'addProgramTemplate'; template: ProgramTemplate }
  | { type: 'setExerciseWeightOverride'; payload: { runId: string; exerciseName: string; weight: number; unit: string } }

function canTransition(from: RunStatus, to: RunStatus): boolean {
  if (from === to) {
    return true
  }

  if (from === 'active') {
    return to === 'paused' || to === 'completed' || to === 'archived'
  }

  if (from === 'paused') {
    return to === 'active' || to === 'completed' || to === 'archived'
  }

  if (from === 'completed') {
    return to === 'archived'
  }

  return false
}

function setRunStatus(
  runs: FocusRun[],
  runId: string,
  status: RunStatus,
  patch?: Partial<FocusRun>,
): FocusRun[] {
  return runs.map((run) => {
    if (run.id !== runId) {
      return run
    }

    if (!canTransition(run.status, status)) {
      return run
    }

    return {
      ...run,
      status,
      ...patch,
    }
  })
}

function pauseActiveRunsOnTrack(
  runs: FocusRun[],
  track: FocusRun['track'],
  exceptRunId: string,
): FocusRun[] {
  return runs.map((run) => {
    if (run.id === exceptRunId) {
      return run
    }

    if (run.track === track && run.status === 'active') {
      return {
        ...run,
        status: 'paused',
        pauseReason: run.pauseReason ?? 'Switched to another program',
      }
    }

    return run
  })
}

function createRunFromTemplate(template: ProgramTemplate, now: string): FocusRun {
  return {
    id: makeId(),
    templateId: template.id,
    templateName: template.name,
    mode: template.mode,
    track: template.track,
    focusTarget: template.focusTarget,
    status: 'active',
    startedAt: now,
    completedSessionCount: 0,
    successfulSessionCount: 0,
    nextSessionIndex: 0,
  }
}

function synchronizeRunTemplateSnapshot(
  run: FocusRun,
  templates: ProgramTemplate[],
): FocusRun {
  const template = templates.find((candidate) => candidate.id === run.templateId)
  if (!template) {
    return run
  }

  return {
    ...run,
    templateName: template.name,
  }
}

function removeRunsAndLogs(state: AppState, runIds: Set<string>) {
  if (runIds.size === 0) {
    return {
      focusRuns: state.focusRuns,
      workoutLogs: state.workoutLogs,
      selectedRunId: state.selectedRunId,
    }
  }

  return {
    focusRuns: state.focusRuns.filter((run) => !runIds.has(run.id)),
    workoutLogs: state.workoutLogs.filter((log) => !runIds.has(log.runId)),
    selectedRunId:
      state.selectedRunId && runIds.has(state.selectedRunId)
        ? null
        : state.selectedRunId,
  }
}

function deleteTemplatesById(state: AppState, templateIds: string[]): AppState {
  if (templateIds.length === 0) {
    return state
  }

  const templateIdSet = new Set(templateIds)
  const nextTemplates = state.programTemplates.filter(
    (template) => !templateIdSet.has(template.id),
  )

  if (nextTemplates.length === state.programTemplates.length) {
    return state
  }

  const runIdsToDelete = new Set(
    state.focusRuns
      .filter((run) => templateIdSet.has(run.templateId))
      .map((run) => run.id),
  )

  return {
    ...state,
    programTemplates: nextTemplates,
    ...removeRunsAndLogs(state, runIdsToDelete),
  }
}

function deleteRunsById(state: AppState, runIds: string[]): AppState {
  if (runIds.length === 0) {
    return state
  }

  const runIdSet = new Set(runIds)
  const hasAnyRun = state.focusRuns.some((run) => runIdSet.has(run.id))
  if (!hasAnyRun) {
    return state
  }

  return {
    ...state,
    ...removeRunsAndLogs(state, runIdSet),
  }
}

function logSession(state: AppState, payload: LogSessionInput): AppState {
  const run = state.focusRuns.find((candidate) => candidate.id === payload.runId)
  if (!run || run.status !== 'active') {
    return state
  }

  const template = getTemplateById(state.programTemplates, run.templateId)
  if (!template) {
    return state
  }

  const plannedSession = buildPlannedSession(run, template, state.workoutLogs)

  const inputByExerciseId = new Map(
    payload.exerciseInputs.map((input) => [input.exerciseId, input]),
  )

  const exerciseLogs = plannedSession.exercises.map((exercise) => {
    const exerciseInput = inputByExerciseId.get(exercise.id)
    return {
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      completed: exerciseInput?.completed ?? true,
      skipped: exerciseInput?.skipped ?? false,
      plannedWeight: exercise.plannedWeight,
      actualWeight: exerciseInput?.actualWeight,
      weightUnit: exercise.weightUnit,
      note: exerciseInput?.note,
      difficulty: exerciseInput?.difficulty,
    }
  })

  const inputByActivityId = new Map(
    payload.activityInputs.map((input) => [input.activityId, input]),
  )

  const activityLogs =
    plannedSession.session.optionalActivities?.map((activity) => {
      const input = inputByActivityId.get(activity.id)
      return {
        activityId: activity.id,
        name: activity.name,
        completed: input?.completed ?? false,
        duration: input?.duration,
        note: input?.note,
      }
    }) ?? []

  const workoutLog: WorkoutLog = {
    id: makeId(),
    runId: run.id,
    templateId: template.id,
    sessionId: plannedSession.session.id,
    sessionName: plannedSession.session.name,
    track: run.track,
    completedAt: payload.completedAt,
    successful: payload.successful ?? true,
    exerciseLogs,
    optionalActivities: activityLogs,
    sessionNote: payload.sessionNote,
  }

  const nextWorkoutLogs = [workoutLog, ...state.workoutLogs]
  const runLogs = nextWorkoutLogs.filter((log) => log.runId === run.id)
  const newBaselineAnchors = buildBaselineAnchorsForRun(template, runLogs)

  const sessionCount = template.sessions.length
  const nextRuns = state.focusRuns.map((candidate) => {
    if (candidate.id !== run.id) {
      return candidate
    }

    return {
      ...candidate,
      completedSessionCount: candidate.completedSessionCount + 1,
      successfulSessionCount:
        candidate.successfulSessionCount + (payload.successful ?? true ? 1 : 0),
      nextSessionIndex: (candidate.nextSessionIndex + 1) % sessionCount,
      baselineAnchors: newBaselineAnchors,
    }
  })

  return {
    ...state,
    focusRuns: nextRuns,
    workoutLogs: nextWorkoutLogs,
    lastCompletedTrack: run.track,
    // Clear manual override so next suggestion follows alternation logic.
    selectedRunId: null,
  }
}

function normalizeLogOrder(logs: WorkoutLog[]): WorkoutLog[] {
  return [...logs].sort((a, b) => {
    const timeA = new Date(a.completedAt).getTime()
    const timeB = new Date(b.completedAt).getTime()
    const safeA = Number.isNaN(timeA) ? 0 : timeA
    const safeB = Number.isNaN(timeB) ? 0 : timeB
    return safeB - safeA
  })
}

function getLatestCompletedTrack(logs: WorkoutLog[]): AppState['lastCompletedTrack'] {
  let latestTrack: AppState['lastCompletedTrack'] = null
  let latestTimestamp = Number.NEGATIVE_INFINITY

  for (const log of logs) {
    const completedAt = new Date(log.completedAt).getTime()
    if (Number.isNaN(completedAt)) {
      continue
    }

    if (completedAt > latestTimestamp) {
      latestTimestamp = completedAt
      latestTrack = log.track
    }
  }

  return latestTrack
}

function recalculateRunsFromLogs(
  runs: FocusRun[],
  templates: ProgramTemplate[],
  logs: WorkoutLog[],
): FocusRun[] {
  const logsByRunId = new Map<string, WorkoutLog[]>()
  for (const log of logs) {
    const bucket = logsByRunId.get(log.runId)
    if (bucket) {
      bucket.push(log)
    } else {
      logsByRunId.set(log.runId, [log])
    }
  }

  return runs.map((run) => {
    const runLogs = logsByRunId.get(run.id) ?? []
    const completedSessionCount = runLogs.length
    const successfulSessionCount = runLogs.filter((log) => log.successful).length
    const template = templates.find((candidate) => candidate.id === run.templateId)
    const sessionCount = template?.sessions.length ?? 0
    const nextSessionIndex =
      sessionCount > 0 ? completedSessionCount % sessionCount : run.nextSessionIndex
    const baselineAnchors = buildBaselineAnchorsForRun(template, runLogs)

    return {
      ...run,
      completedSessionCount,
      successfulSessionCount,
      nextSessionIndex,
      baselineAnchors,
    }
  })
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'hydrate': {
      return action.payload
    }

    case 'replaceTemplates': {
      const synchronizedRuns = state.focusRuns.map((run) =>
        synchronizeRunTemplateSnapshot(run, action.templates),
      )

      return {
        ...state,
        programTemplates: action.templates,
        focusRuns: synchronizedRuns,
      }
    }

    case 'deleteTemplate': {
      return deleteTemplatesById(state, [action.templateId])
    }

    case 'deleteTemplates': {
      return deleteTemplatesById(state, action.templateIds)
    }

    case 'startRun': {
      const template = getTemplateById(state.programTemplates, action.templateId)
      if (!template) {
        return state
      }

      const existingRun = state.focusRuns.find(
        (run) => run.templateId === template.id && run.status !== 'archived' && run.status !== 'completed',
      )

      if (existingRun) {
        const pausedRuns = pauseActiveRunsOnTrack(
          state.focusRuns,
          existingRun.track,
          existingRun.id,
        )

        return {
          ...state,
          focusRuns: setRunStatus(pausedRuns, existingRun.id, 'active', {
            pauseReason: undefined,
          }),
          selectedRunId: existingRun.id,
        }
      }

      const newRun = createRunFromTemplate(template, action.now)
      const pausedRuns = pauseActiveRunsOnTrack(state.focusRuns, newRun.track, newRun.id)
      return {
        ...state,
        focusRuns: [...pausedRuns, newRun],
        selectedRunId: newRun.id,
      }
    }

    case 'pauseRun': {
      return {
        ...state,
        focusRuns: setRunStatus(state.focusRuns, action.runId, 'paused', {
          pauseReason: action.reason,
        }),
        selectedRunId:
          state.selectedRunId === action.runId ? null : state.selectedRunId,
      }
    }

    case 'resumeRun': {
      const targetRun = state.focusRuns.find((run) => run.id === action.runId)
      if (!targetRun || targetRun.status !== 'paused') {
        return state
      }

      const pausedOthers = pauseActiveRunsOnTrack(
        state.focusRuns,
        targetRun.track,
        targetRun.id,
      )

      return {
        ...state,
        focusRuns: setRunStatus(pausedOthers, targetRun.id, 'active', {
          pauseReason: undefined,
        }),
        selectedRunId: targetRun.id,
      }
    }

    case 'switchRun': {
      const targetRun = state.focusRuns.find((run) => run.id === action.runId)
      if (!targetRun) {
        return state
      }

      if (targetRun.status === 'archived' || targetRun.status === 'completed') {
        return state
      }

      const pausedOthers = pauseActiveRunsOnTrack(
        state.focusRuns,
        targetRun.track,
        targetRun.id,
      )

      return {
        ...state,
        focusRuns: setRunStatus(pausedOthers, targetRun.id, 'active', {
          pauseReason: undefined,
        }),
        selectedRunId: targetRun.id,
      }
    }

    case 'restartRun': {
      const oldRun = state.focusRuns.find((run) => run.id === action.runId)
      if (!oldRun) {
        return state
      }

      const template = getTemplateById(state.programTemplates, oldRun.templateId)
      if (!template) {
        return state
      }

      const archivedOldRuns = setRunStatus(state.focusRuns, oldRun.id, 'archived', {
        notes: oldRun.notes
          ? `${oldRun.notes}\nRestarted on ${action.now}`
          : `Restarted on ${action.now}`,
      })

      const newRun = createRunFromTemplate(template, action.now)
      const pausedRuns = pauseActiveRunsOnTrack(
        archivedOldRuns,
        newRun.track,
        newRun.id,
      )

      return {
        ...state,
        focusRuns: [...pausedRuns, newRun],
        selectedRunId: newRun.id,
      }
    }

    case 'completeRun': {
      return {
        ...state,
        focusRuns: setRunStatus(state.focusRuns, action.runId, 'completed'),
        selectedRunId:
          state.selectedRunId === action.runId ? null : state.selectedRunId,
      }
    }

    case 'archiveRun': {
      return {
        ...state,
        focusRuns: setRunStatus(state.focusRuns, action.runId, 'archived'),
        selectedRunId:
          state.selectedRunId === action.runId ? null : state.selectedRunId,
      }
    }

    case 'deleteRun': {
      return deleteRunsById(state, [action.runId])
    }

    case 'deleteRuns': {
      return deleteRunsById(state, action.runIds)
    }

    case 'setSelectedRun': {
      return {
        ...state,
        selectedRunId: action.runId,
      }
    }

    case 'setShowProgressionInsights': {
      return {
        ...state,
        showProgressionInsights: action.show,
      }
    }

    case 'logSession': {
      return logSession(state, action.payload)
    }

    case 'importLogs': {
      const normalizedLogs = normalizeLogOrder(action.logs)
      const recalculatedRuns = recalculateRunsFromLogs(
        state.focusRuns,
        state.programTemplates,
        normalizedLogs,
      )

      return {
        ...state,
        focusRuns: recalculatedRuns,
        workoutLogs: normalizedLogs,
        lastCompletedTrack: getLatestCompletedTrack(normalizedLogs),
      }
    }

    case 'clearAllData': {
      return {
        programTemplates: action.templates,
        focusRuns: [],
        workoutLogs: [],
        lastCompletedTrack: null,
        selectedRunId: null,
        showProgressionInsights: false,
      }
    }

    case 'updateProgramTemplate': {
      if (!state.programTemplates.some((t) => t.id === action.template.id)) {
        return state
      }
      const nextTemplates = state.programTemplates.map((t) =>
        t.id === action.template.id ? action.template : t,
      )
      return {
        ...state,
        programTemplates: nextTemplates,
        focusRuns: state.focusRuns.map((run) =>
          synchronizeRunTemplateSnapshot(run, nextTemplates),
        ),
      }
    }

    case 'addProgramTemplate': {
      return {
        ...state,
        programTemplates: [...state.programTemplates, action.template],
      }
    }

    case 'setExerciseWeightOverride': {
      const { runId, exerciseName, weight, unit } = action.payload
      return {
        ...state,
        focusRuns: state.focusRuns.map((r) =>
          r.id === runId
            ? { ...r, weightOverrides: { ...r.weightOverrides, [exerciseName]: { weight, unit } } }
            : r,
        ),
      }
    }

    default:
      return state
  }
}
