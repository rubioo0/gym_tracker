import { describe, expect, it } from 'vitest'
import { seededProgramTemplates } from '../data/seed'
import { createInitialState, importStateFromJson } from '../data/storage'
import { buildPlannedSession, getTemplateById } from './logic'
import { appReducer } from './reducer'
import type { ProgramTemplate, WorkoutLog } from './types'

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

  it('reuses existing non-archived run when starting the same template again', () => {
    const state = createInitialState(seededProgramTemplates)
    const started = appReducer(state, {
      type: 'startRun',
      templateId: 'main-upper-biceps',
      now: '2026-04-08T10:00:00.000Z',
    })

    const startedAgain = appReducer(started, {
      type: 'startRun',
      templateId: 'main-upper-biceps',
      now: '2026-04-09T10:00:00.000Z',
    })

    expect(startedAgain.focusRuns).toHaveLength(1)
    expect(startedAgain.focusRuns[0].id).toBe(started.focusRuns[0].id)
    expect(startedAgain.focusRuns[0].status).toBe('active')
  })

  it('updates progression insights visibility flag', () => {
    const state = createInitialState(seededProgramTemplates)
    const next = appReducer(state, {
      type: 'setShowProgressionInsights',
      show: true,
    })

    expect(next.showProgressionInsights).toBe(true)
  })

  it('keeps active run snapshot stable when templates are replaced', () => {
    const started = appReducer(createInitialState(seededProgramTemplates), {
      type: 'startRun',
      templateId: 'main-upper-biceps',
      now: '2026-04-08T10:00:00.000Z',
    })

    const updatedTemplates: ProgramTemplate[] = started.programTemplates.map((template) =>
      template.id === 'main-upper-biceps'
        ? {
            ...template,
            name: 'Hands Updated',
            mode: 'travel',
            track: 'lower',
            focusTarget: 'hands',
          }
        : template,
    )

    const replaced = appReducer(started, {
      type: 'replaceTemplates',
      templates: updatedTemplates,
    })

    expect(getTemplateById(replaced.programTemplates, 'main-upper-biceps')?.track).toBe('lower')
    expect(replaced.focusRuns[0].track).toBe('upper')
    expect(replaced.focusRuns[0].mode).toBe('main')
    expect(replaced.focusRuns[0].focusTarget).toBe('biceps')
    expect(replaced.focusRuns[0].templateName).toBe('Hands Updated')
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

  it('rebuilds baseline anchors on log import', () => {
    const templates: ProgramTemplate[] = [
      {
        id: 'anchor-template',
        name: 'Anchor Template',
        mode: 'main',
        track: 'upper',
        focusTarget: 'biceps',
        sessions: [
          {
            id: 'anchor-session',
            name: 'Anchor Session',
            order: 1,
            track: 'upper',
            exercises: [
              {
                id: 'anchor-exercise',
                name: 'Curl',
                sets: '4 sets',
                reps: '10',
                plannedWeight: 10,
                weightUnit: 'kg',
                progressionRule: {
                  type: 'weight',
                  amount: 5,
                  frequency: 2,
                  basis: 'trackSessions',
                },
              },
            ],
          },
        ],
      },
    ]

    const started = appReducer(createInitialState(templates), {
      type: 'startRun',
      templateId: 'anchor-template',
      now: '2026-04-08T10:00:00.000Z',
    })

    const run = started.focusRuns[0]
    const logs: WorkoutLog[] = [
      {
        id: 'log-1',
        runId: run.id,
        templateId: 'anchor-template',
        sessionId: 'anchor-session',
        sessionName: 'Anchor Session',
        track: 'upper',
        completedAt: '2026-04-08T11:00:00.000Z',
        successful: true,
        exerciseLogs: [
          {
            exerciseId: 'anchor-exercise',
            exerciseName: 'Curl',
            completed: true,
            skipped: false,
            plannedWeight: 10,
            actualWeight: 15,
            weightUnit: 'kg',
          },
        ],
        optionalActivities: [],
      },
    ]

    const imported = appReducer(started, {
      type: 'importLogs',
      logs,
    })

    const updatedRun = imported.focusRuns.find((candidate) => candidate.id === run.id)
    expect(updatedRun?.baselineAnchors?.['anchor-exercise']).toMatchObject({
      weight: 15,
      resetAtSessionIndex: 0,
    })
  })

  it('does not create an anchor when mismatch log is not completed', () => {
    const templates: ProgramTemplate[] = [
      {
        id: 'non-completed-template',
        name: 'Non Completed',
        mode: 'main',
        track: 'upper',
        focusTarget: 'arms',
        sessions: [
          {
            id: 'non-completed-session',
            name: 'Session',
            order: 1,
            track: 'upper',
            exercises: [
              {
                id: 'non-completed-exercise',
                name: 'Curl',
                sets: '3 sets',
                reps: '10',
                plannedWeight: 10,
                weightUnit: 'kg',
                progressionRule: {
                  type: 'weight',
                  amount: 5,
                  frequency: 2,
                  basis: 'successfulTrackSessions',
                },
              },
            ],
          },
        ],
      },
    ]

    const started = appReducer(createInitialState(templates), {
      type: 'startRun',
      templateId: 'non-completed-template',
      now: '2026-04-08T10:00:00.000Z',
    })
    const run = started.focusRuns[0]

    const logged = appReducer(started, {
      type: 'logSession',
      payload: {
        runId: run.id,
        completedAt: '2026-04-08T11:00:00.000Z',
        successful: true,
        exerciseInputs: [
          {
            exerciseId: 'non-completed-exercise',
            completed: false,
            skipped: false,
            actualWeight: 20,
          },
        ],
        activityInputs: [],
      },
    })

    const updatedRun = logged.focusRuns.find((candidate) => candidate.id === run.id)
    expect(updatedRun?.baselineAnchors).toBeUndefined()
  })

  it('keeps linear progression stable across successful sessions without oscillation', () => {
    const templates: ProgramTemplate[] = [
      {
        id: 'linear-template',
        name: 'Linear',
        mode: 'main',
        track: 'upper',
        focusTarget: 'arms',
        sessions: [
          {
            id: 'linear-session',
            name: 'Session',
            order: 1,
            track: 'upper',
            exercises: [
              {
                id: 'linear-exercise',
                name: 'Curl',
                sets: '3 sets',
                reps: '10',
                plannedWeight: 10,
                weightUnit: 'kg',
                progressionRule: {
                  type: 'weight',
                  amount: 5,
                  frequency: 2,
                  basis: 'successfulTrackSessions',
                },
              },
            ],
          },
        ],
      },
    ]

    let state = appReducer(createInitialState(templates), {
      type: 'startRun',
      templateId: 'linear-template',
      now: '2026-04-08T10:00:00.000Z',
    })

    const seenPlannedWeights: number[] = []
    for (let index = 0; index < 6; index++) {
      const run = state.focusRuns[0]
      const template = getTemplateById(state.programTemplates, run.templateId)
      if (!template) {
        throw new Error('template missing in test')
      }

      const planned = buildPlannedSession(run, template, state.workoutLogs)
      const currentWeight = planned.exercises[0].plannedWeight
      if (typeof currentWeight !== 'number') {
        throw new Error('planned weight missing in test')
      }

      seenPlannedWeights.push(currentWeight)

      state = appReducer(state, {
        type: 'logSession',
        payload: {
          runId: run.id,
          completedAt: `2026-04-${String(index + 8).padStart(2, '0')}T11:00:00.000Z`,
          successful: true,
          exerciseInputs: [
            {
              exerciseId: 'linear-exercise',
              completed: true,
              skipped: false,
              actualWeight: currentWeight,
            },
          ],
          activityInputs: [],
        },
      })
    }

    expect(seenPlannedWeights).toEqual([10, 10, 15, 15, 20, 20])

    const run = state.focusRuns[0]
    const template = getTemplateById(state.programTemplates, run.templateId)
    if (!template) {
      throw new Error('template missing in test')
    }
    const nextPlanned = buildPlannedSession(run, template, state.workoutLogs)
    expect(nextPlanned.exercises[0].plannedWeight).toBe(25)
  })

  it('keeps next progression identical between imported hydration and importLogs rebuild', () => {
    const rawState = {
      programTemplates: [
        {
          id: 'parity-template',
          name: 'Parity',
          mode: 'main' as const,
          track: 'upper' as const,
          focusTarget: 'arms',
          sessions: [
            {
              id: 'parity-session',
              name: 'Session',
              order: 1,
              track: 'upper' as const,
              exercises: [
                {
                  id: 'parity-exercise',
                  name: 'Curl',
                  sets: '3 sets',
                  reps: '10',
                  plannedWeight: 10,
                  weightUnit: 'kg',
                  progressionRule: {
                    type: 'weight' as const,
                    amount: 5,
                    frequency: 2,
                    basis: 'successfulTrackSessions' as const,
                  },
                },
              ],
            },
          ],
        },
      ],
      focusRuns: [
        {
          id: 'parity-run',
          templateId: 'parity-template',
          templateName: 'Parity',
          mode: 'main' as const,
          track: 'upper' as const,
          focusTarget: 'arms',
          status: 'active' as const,
          startedAt: '2026-04-08T08:00:00.000Z',
          completedSessionCount: 0,
          successfulSessionCount: 0,
          nextSessionIndex: 0,
        },
      ],
      workoutLogs: [
        {
          id: 'parity-log-1',
          runId: 'parity-run',
          templateId: 'parity-template',
          sessionId: 'parity-session',
          sessionName: 'Session',
          track: 'upper' as const,
          completedAt: '2026-04-08T11:00:00.000Z',
          successful: true,
          exerciseLogs: [
            {
              exerciseId: 'parity-exercise',
              exerciseName: 'Curl',
              completed: true,
              skipped: false,
              plannedWeight: 10,
              actualWeight: 10,
              weightUnit: 'kg',
            },
          ],
          optionalActivities: [],
        },
        {
          id: 'parity-log-2',
          runId: 'parity-run',
          templateId: 'parity-template',
          sessionId: 'parity-session',
          sessionName: 'Session',
          track: 'upper' as const,
          completedAt: '2026-04-10T11:00:00.000Z',
          successful: true,
          exerciseLogs: [
            {
              exerciseId: 'parity-exercise',
              exerciseName: 'Curl',
              completed: true,
              skipped: false,
              plannedWeight: 10,
              actualWeight: 15,
              weightUnit: 'kg',
            },
          ],
          optionalActivities: [],
        },
      ],
      lastCompletedTrack: null,
      selectedRunId: null,
      showProgressionInsights: false,
    }

    const imported = importStateFromJson(JSON.stringify({ state: rawState }))
    if (!imported) {
      throw new Error('import failed in parity test')
    }

    const rebuilt = appReducer(imported, {
      type: 'importLogs',
      logs: imported.workoutLogs,
    })

    const importedRun = imported.focusRuns.find((run) => run.id === 'parity-run')
    const rebuiltRun = rebuilt.focusRuns.find((run) => run.id === 'parity-run')
    const importedTemplate = getTemplateById(imported.programTemplates, 'parity-template')
    const rebuiltTemplate = getTemplateById(rebuilt.programTemplates, 'parity-template')
    if (!importedRun || !rebuiltRun || !importedTemplate || !rebuiltTemplate) {
      throw new Error('missing data in parity test')
    }

    const importedPlanned = buildPlannedSession(
      importedRun,
      importedTemplate,
      imported.workoutLogs,
    )
    const rebuiltPlanned = buildPlannedSession(
      rebuiltRun,
      rebuiltTemplate,
      rebuilt.workoutLogs,
    )

    expect(rebuiltRun.baselineAnchors).toEqual(importedRun.baselineAnchors)
    expect(rebuiltPlanned.exercises.map((exercise) => exercise.plannedWeight)).toEqual(
      importedPlanned.exercises.map((exercise) => exercise.plannedWeight),
    )
  })

  it('uses logged actual bodyweight load for next planned progression', () => {
    const templates: ProgramTemplate[] = [
      {
        id: 'bodyweight-dips',
        name: 'Bodyweight Dips',
        mode: 'main',
        track: 'upper',
        focusTarget: 'triceps',
        sessions: [
          {
            id: 'bodyweight-dips-s1',
            name: 'Bodyweight Dips Session',
            order: 1,
            track: 'upper',
            exercises: [
              {
                id: 'bodyweight-dips-ex1',
                name: 'Бруси',
                sets: '4 sets',
                reps: '12',
                plannedWeight: 6,
                weightUnit: 'kg',
                isBodyweightLoad: true,
                progressionRule: {
                  type: 'weight',
                  amount: 1,
                  frequency: 1,
                  frequencyUnit: 'week',
                  basis: 'successfulTrackSessions',
                },
              },
            ],
          },
        ],
      },
    ]

    const started = appReducer(createInitialState(templates), {
      type: 'startRun',
      templateId: 'bodyweight-dips',
      now: '2026-04-08T10:00:00.000Z',
    })

    const run = started.focusRuns[0]
    const logged = appReducer(started, {
      type: 'logSession',
      payload: {
        runId: run.id,
        completedAt: '2026-04-08T11:00:00.000Z',
        successful: true,
        exerciseInputs: [
          {
            exerciseId: 'bodyweight-dips-ex1',
            completed: true,
            skipped: false,
            actualWeight: 0,
          },
        ],
        activityInputs: [],
      },
    })

    const nextRun = logged.focusRuns.find((candidate) => candidate.id === run.id)
    const template = getTemplateById(logged.programTemplates, 'bodyweight-dips')
    if (!nextRun || !template) {
      throw new Error('run or template missing in test')
    }

    const nextPlanned = buildPlannedSession(nextRun, template, logged.workoutLogs)
    expect(nextPlanned.exercises[0].plannedWeight).toBe(0)
    expect(nextPlanned.exercises[0].plannedWeightPerSide).toBeUndefined()
    expect(nextPlanned.exercises[0].plannedLoadLabel).toBe('body + 0 kg')
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

  it('deletes template and removes related runs/logs', () => {
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
        })),
        activityInputs: [],
      },
    })

    const selected = appReducer(logged, {
      type: 'setSelectedRun',
      runId: run.id,
    })

    const deleted = appReducer(selected, {
      type: 'deleteTemplate',
      templateId: run.templateId,
    })

    expect(
      deleted.programTemplates.find((candidate) => candidate.id === run.templateId),
    ).toBeUndefined()
    expect(deleted.focusRuns.find((candidate) => candidate.id === run.id)).toBeUndefined()
    expect(deleted.workoutLogs.some((log) => log.runId === run.id)).toBe(false)
    expect(deleted.selectedRunId).toBeNull()
  })

  it('bulk deletes templates and linked runs', () => {
    const startedUpper = appReducer(createInitialState(seededProgramTemplates), {
      type: 'startRun',
      templateId: 'main-upper-biceps',
      now: '2026-04-08T10:00:00.000Z',
    })

    const startedBoth = appReducer(startedUpper, {
      type: 'startRun',
      templateId: 'main-lower-calves',
      now: '2026-04-09T10:00:00.000Z',
    })

    const deleted = appReducer(startedBoth, {
      type: 'deleteTemplates',
      templateIds: ['main-upper-biceps', 'main-lower-calves'],
    })

    expect(
      deleted.programTemplates.find((template) => template.id === 'main-upper-biceps'),
    ).toBeUndefined()
    expect(
      deleted.programTemplates.find((template) => template.id === 'main-lower-calves'),
    ).toBeUndefined()
    expect(deleted.focusRuns.length).toBe(0)
    expect(deleted.selectedRunId).toBeNull()
  })

  it('deletes run from focus runs and removes linked logs', () => {
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
        })),
        activityInputs: [],
      },
    })

    const selected = appReducer(logged, {
      type: 'setSelectedRun',
      runId: run.id,
    })

    const deleted = appReducer(selected, {
      type: 'deleteRun',
      runId: run.id,
    })

    expect(deleted.focusRuns.find((candidate) => candidate.id === run.id)).toBeUndefined()
    expect(deleted.workoutLogs.some((log) => log.runId === run.id)).toBe(false)
    expect(deleted.selectedRunId).toBeNull()
    expect(deleted.programTemplates.length).toBe(selected.programTemplates.length)
  })

  it('bulk deletes selected runs and related logs', () => {
    const startedUpper = appReducer(createInitialState(seededProgramTemplates), {
      type: 'startRun',
      templateId: 'main-upper-biceps',
      now: '2026-04-08T10:00:00.000Z',
    })

    const startedBoth = appReducer(startedUpper, {
      type: 'startRun',
      templateId: 'main-lower-calves',
      now: '2026-04-09T10:00:00.000Z',
    })

    const runsToDelete = startedBoth.focusRuns.slice(0, 2)

    const deleted = appReducer(startedBoth, {
      type: 'deleteRuns',
      runIds: runsToDelete.map((run) => run.id),
    })

    expect(deleted.focusRuns.length).toBe(0)
    expect(deleted.workoutLogs.length).toBe(0)
    expect(deleted.selectedRunId).toBeNull()
    expect(deleted.programTemplates.length).toBe(startedBoth.programTemplates.length)
  })
})
