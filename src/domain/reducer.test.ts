import { describe, expect, it } from 'vitest'
import { seededProgramTemplates } from '../data/seed'
import { createInitialState } from '../data/storage'
import { buildPlannedSession, getTemplateById } from './logic'
import { appReducer } from './reducer'

describe('app reducer', () => {
  it('starts run and marks it active', () => {
    const state = createInitialState(seededProgramTemplates)
    const next = appReducer(state, {
      type: 'startRun',
      templateId: 'main-upper-biceps',
      now: '2026-04-08T10:00:00.000Z',
    })

    expect(next.focusRuns.length).toBe(1)
    expect(next.focusRuns[0].status).toBe('active')
    expect(next.focusRuns[0].templateId).toBe('main-upper-biceps')
  })

  it('logs session and advances pointer/count', () => {
    const started = appReducer(createInitialState(seededProgramTemplates), {
      type: 'startRun',
      templateId: 'main-upper-biceps',
      now: '2026-04-08T10:00:00.000Z',
    })

    const run = started.focusRuns[0]
    const template = getTemplateById(started.programTemplates, run.templateId)
    if (!template) {
      throw new Error('template missing in test')
    }

    const planned = buildPlannedSession(run, template)

    const logged = appReducer(started, {
      type: 'logSession',
      payload: {
        runId: run.id,
        completedAt: '2026-04-08T11:00:00.000Z',
        exerciseInputs: planned.exercises.map((exercise) => ({
          exerciseId: exercise.id,
          completed: true,
          skipped: false,
          actualWeight: exercise.plannedWeight,
        })),
        activityInputs: [],
      },
    })

    expect(logged.workoutLogs.length).toBe(1)
    expect(logged.focusRuns[0].completedSessionCount).toBe(1)
    expect(logged.focusRuns[0].successfulSessionCount).toBe(1)
    expect(logged.focusRuns[0].nextSessionIndex).toBe(1)
    expect(logged.lastCompletedTrack).toBe('upper')
    expect(logged.selectedRunId).toBeNull()
  })

  it('supports logging without counting progression success', () => {
    const started = appReducer(createInitialState(seededProgramTemplates), {
      type: 'startRun',
      templateId: 'main-upper-biceps',
      now: '2026-04-08T10:00:00.000Z',
    })

    const run = started.focusRuns[0]
    const template = getTemplateById(started.programTemplates, run.templateId)
    if (!template) {
      throw new Error('template missing in test')
    }

    const planned = buildPlannedSession(run, template)

    const logged = appReducer(started, {
      type: 'logSession',
      payload: {
        runId: run.id,
        completedAt: '2026-04-08T11:00:00.000Z',
        successful: false,
        exerciseInputs: planned.exercises.map((exercise) => ({
          exerciseId: exercise.id,
          completed: false,
          skipped: true,
        })),
        activityInputs: [],
      },
    })

    expect(logged.focusRuns[0].completedSessionCount).toBe(1)
    expect(logged.focusRuns[0].successfulSessionCount).toBe(0)
    expect(logged.workoutLogs[0].successful).toBe(false)
  })

  it('pauses and resumes run preserving progress', () => {
    const started = appReducer(createInitialState(seededProgramTemplates), {
      type: 'startRun',
      templateId: 'main-lower-calves',
      now: '2026-04-08T10:00:00.000Z',
    })

    const run = started.focusRuns[0]

    const paused = appReducer(started, {
      type: 'pauseRun',
      runId: run.id,
      reason: 'travel',
    })

    expect(paused.focusRuns[0].status).toBe('paused')
    expect(paused.focusRuns[0].pauseReason).toBe('travel')

    const resumed = appReducer(paused, {
      type: 'resumeRun',
      runId: run.id,
    })

    expect(resumed.focusRuns[0].status).toBe('active')
    expect(resumed.focusRuns[0].completedSessionCount).toBe(0)
    expect(resumed.focusRuns[0].nextSessionIndex).toBe(0)
  })

  it('restarts run by archiving previous and creating new run', () => {
    const started = appReducer(createInitialState(seededProgramTemplates), {
      type: 'startRun',
      templateId: 'main-upper-biceps',
      now: '2026-04-08T10:00:00.000Z',
    })

    const originalRun = started.focusRuns[0]

    const restarted = appReducer(started, {
      type: 'restartRun',
      runId: originalRun.id,
      now: '2026-05-01T08:00:00.000Z',
    })

    expect(restarted.focusRuns.length).toBe(2)

    const archived = restarted.focusRuns.find((run) => run.id === originalRun.id)
    const fresh = restarted.focusRuns.find((run) => run.id !== originalRun.id)

    expect(archived?.status).toBe('archived')
    expect(fresh?.status).toBe('active')
    expect(fresh?.completedSessionCount).toBe(0)
    expect(fresh?.nextSessionIndex).toBe(0)
  })

  it('deletes template from program templates list', () => {
    const state = createInitialState(seededProgramTemplates)
    const initialCount = state.programTemplates.length

    const templateToDelete = state.programTemplates[0]

    const deleted = appReducer(state, {
      type: 'deleteTemplate',
      templateId: templateToDelete.id,
    })

    expect(deleted.programTemplates.length).toBe(initialCount - 1)
    expect(deleted.programTemplates.find((t) => t.id === templateToDelete.id)).toBeUndefined()
  })
})
