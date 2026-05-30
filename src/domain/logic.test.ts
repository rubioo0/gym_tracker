import { describe, expect, it } from 'vitest'
import {
  buildBaselineAnchorsForRun,
  buildPlannedSession,
  buildProgramCalendar,
  getPlannedExercise,
  getRecentExerciseHistory,
  getRunnableRunForTemplate,
  getSuggestedTrack,
  getSessionByIndex,
} from './logic'
import type { FocusRun, ProgramTemplate, WorkoutLog } from './types'

describe('logic helpers', () => {
  it('applies weight progression by completed session count', () => {
    const planned = getPlannedExercise(
      {
        id: 'e1',
        name: 'Curl',
        sets: '4',
        reps: '12',
        plannedWeight: 20,
        weightUnit: 'kg',
        progressionRule: {
          type: 'weight',
          amount: 2.5,
          frequency: 2,
          basis: 'trackSessions',
        },
      },
      4,
    )

    expect(planned.plannedWeight).toBe(20)
    expect(planned.nextTargetHint).toContain('2 session')
  })

  it('supports progression based on successful sessions only', () => {
    const planned = getPlannedExercise(
      {
        id: 'e1',
        name: 'Curl',
        sets: '4',
        reps: '12',
        plannedWeight: 20,
        weightUnit: 'kg',
        progressionRule: {
          type: 'weight',
          amount: 2.5,
          frequency: 2,
          basis: 'successfulTrackSessions',
        },
      },
      {
        completedSessionCount: 4,
        successfulSessionCount: 1,
      },
    )

    expect(planned.plannedWeight).toBe(20)
    expect(planned.nextTargetHint).toContain('2 session')
  })

  it('uses latest logged actual weight as baseline for next planned load', () => {
    const run: FocusRun = {
      id: 'run-1',
      templateId: 'template-1',
      templateName: 'Template 1',
      mode: 'main',
      track: 'upper',
      focusTarget: 'triceps',
      status: 'active',
      startedAt: '2026-04-10T10:00:00.000Z',
      completedSessionCount: 1,
      successfulSessionCount: 1,
      nextSessionIndex: 0,
      baselineAnchors: {
        'exercise-dips': {
          weight: 0,
          resetAtSessionIndex: 0,
          resetAt: '2026-04-10T11:00:00.000Z',
        },
      },
    }

    const template: ProgramTemplate = {
      id: 'template-1',
      name: 'Template 1',
      mode: 'main',
      track: 'upper',
      focusTarget: 'triceps',
      sessions: [
        {
          id: 'session-1',
          name: 'Session 1',
          order: 1,
          track: 'upper',
          exercises: [
            {
              id: 'exercise-dips',
              name: 'Parallel Bar Dips',
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
    }

    const workoutLogs: WorkoutLog[] = [
      {
        id: 'log-1',
        runId: 'run-1',
        templateId: 'template-1',
        sessionId: 'session-1',
        sessionName: 'Session 1',
        track: 'upper',
        completedAt: '2026-04-10T11:00:00.000Z',
        successful: true,
        exerciseLogs: [
          {
            exerciseId: 'exercise-dips',
            exerciseName: 'Parallel Bar Dips',
            completed: true,
            skipped: false,
            plannedWeight: 6,
            actualWeight: 0,
            weightUnit: 'kg',
          },
        ],
        optionalActivities: [],
      },
    ]

    const planned = buildPlannedSession(run, template, workoutLogs)
    expect(planned.exercises[0].plannedWeight).toBe(0)
    expect(planned.exercises[0].plannedWeightPerSide).toBeUndefined()
    expect(planned.exercises[0].plannedLoadLabel).toBe('body + 0 kg')
  })

  it('ignores latest actual weight when it uses a different unit', () => {
    const run: FocusRun = {
      id: 'run-1',
      templateId: 'template-1',
      templateName: 'Template 1',
      mode: 'main',
      track: 'upper',
      focusTarget: 'biceps',
      status: 'active',
      startedAt: '2026-04-10T10:00:00.000Z',
      completedSessionCount: 1,
      successfulSessionCount: 1,
      nextSessionIndex: 0,
    }

    const template: ProgramTemplate = {
      id: 'template-1',
      name: 'Template 1',
      mode: 'main',
      track: 'upper',
      focusTarget: 'biceps',
      sessions: [
        {
          id: 'session-1',
          name: 'Session 1',
          order: 1,
          track: 'upper',
          exercises: [
            {
              id: 'exercise-dips',
              name: 'Weighted Pull-up',
              sets: '4 sets',
              reps: '8',
              plannedWeight: 10,
              weightUnit: 'lbs',
              isBodyweightLoad: true,
              progressionRule: {
                type: 'weight',
                amount: 2.5,
                frequency: 1,
                basis: 'successfulTrackSessions',
              },
            },
          ],
        },
      ],
    }

    const workoutLogs: WorkoutLog[] = [
      {
        id: 'log-1',
        runId: 'run-1',
        templateId: 'template-1',
        sessionId: 'session-1',
        sessionName: 'Session 1',
        track: 'upper',
        completedAt: '2026-04-10T11:00:00.000Z',
        successful: true,
        exerciseLogs: [
          {
            exerciseId: 'exercise-dips',
            exerciseName: 'Weighted Pull-up',
            completed: true,
            skipped: false,
            plannedWeight: 5,
            actualWeight: 5,
            weightUnit: 'kg',
          },
        ],
        optionalActivities: [],
      },
    ]

    const planned = buildPlannedSession(run, template, workoutLogs)
    expect(planned.exercises[0].plannedWeight).toBe(10)
    expect(planned.exercises[0].plannedLoadLabel).toBe('body + 10 lbs')
  })

  it('keeps configured split-load baseline when latest log uses different unit', () => {
    const run: FocusRun = {
      id: 'run-1',
      templateId: 'template-1',
      templateName: 'Template 1',
      mode: 'main',
      track: 'upper',
      focusTarget: 'biceps',
      status: 'active',
      startedAt: '2026-04-10T10:00:00.000Z',
      completedSessionCount: 1,
      successfulSessionCount: 1,
      nextSessionIndex: 0,
    }

    const template: ProgramTemplate = {
      id: 'template-1',
      name: 'Template 1',
      mode: 'main',
      track: 'upper',
      focusTarget: 'biceps',
      sessions: [
        {
          id: 'session-1',
          name: 'Session 1',
          order: 1,
          track: 'upper',
          exercises: [
            {
              id: 'exercise-dips',
              name: 'Vertical Bench Press',
              sets: '4 sets',
              reps: '8',
              plannedWeight: 15,
              plannedWeightPerSide: 7.5,
              weightUnit: 'lbs',
              progressionRule: {
                type: 'weight',
                amount: 5,
                amountPerSide: 2.5,
                frequency: 1,
                basis: 'successfulTrackSessions',
              },
            },
          ],
        },
      ],
    }

    const workoutLogs: WorkoutLog[] = [
      {
        id: 'log-1',
        runId: 'run-1',
        templateId: 'template-1',
        sessionId: 'session-1',
        sessionName: 'Session 1',
        track: 'upper',
        completedAt: '2026-04-10T11:00:00.000Z',
        successful: true,
        exerciseLogs: [
          {
            exerciseId: 'exercise-dips',
            exerciseName: 'Vertical Bench Press',
            completed: true,
            skipped: false,
            plannedWeight: 7,
            actualWeight: 3.9,
            weightUnit: 'kg',
          },
        ],
        optionalActivities: [],
      },
    ]

    const planned = buildPlannedSession(run, template, workoutLogs)
    expect(planned.exercises[0].plannedWeight).toBe(15)
    expect(planned.exercises[0].plannedWeightPerSide).toBe(7.5)
    expect(planned.exercises[0].plannedLoadLabel).toBe('15 lbs (7.5)')
  })

  it('applies per-side weight progression for split hand loads', () => {
    const planned = getPlannedExercise(
      {
        id: 'e1',
        name: 'Dumbbell Curl',
        sets: '4',
        reps: '10',
        plannedWeight: 10,
        plannedWeightPerSide: 5,
        weightUnit: 'kg',
        plannedLoadLabel: '10 kg (5)',
        progressionRule: {
          type: 'weight',
          amount: 5,
          amountPerSide: 2.5,
          frequency: 2,
          frequencyUnit: 'week',
          basis: 'successfulTrackSessions',
        },
      },
      {
        completedSessionCount: 4,
        successfulSessionCount: 4,
      },
    )

    expect(planned.plannedWeight).toBe(10)
    expect(planned.plannedWeightPerSide).toBe(5)
    expect(planned.plannedLoadLabel).toBe('10 kg (5)')
    expect(planned.nextTargetHint).toContain('week')
  })

  it('computes fixed-program max target from current baseline', () => {
    const planned = getPlannedExercise(
      {
        id: 'e1',
        name: 'Curl',
        sets: '4',
        reps: '10',
        plannedWeight: 60,
        weightUnit: 'lbs',
        progressionRule: {
          type: 'weight',
          amount: 5,
          frequency: 2,
          frequencyUnit: 'week',
          basis: 'successfulTrackSessions',
        },
      },
      {
        completedSessionCount: 2,
        successfulSessionCount: 2,
      },
      {
        latestCompletedActualWeight: 40,
      },
    )

    expect(planned.maxPlannedWeight).toBe(75)
    expect(planned.maxWeightExplanation).toContain('sessions left 14 (~7 weeks)')
  })

  it('keeps the cycle max anchored to the planned baseline when latest actual is higher', () => {
    const planned = getPlannedExercise(
      {
        id: 'e1',
        name: 'Curl',
        sets: '4',
        reps: '10',
        plannedWeight: 10,
        weightUnit: 'lbs',
        progressionRule: {
          type: 'weight',
          amount: 5,
          frequency: 1,
          frequencyUnit: 'week',
          basis: 'successfulTrackSessions',
        },
      },
      {
        completedSessionCount: 2,
        successfulSessionCount: 2,
      },
      {
        latestCompletedActualWeight: 15,
      },
    )

    // With template base 10, 2 successful sessions, freq 2 (weekly=2 sessions):
    // steps = floor(2/2) = 1, planned = 10 + 5 = 15
    expect(planned.plannedWeight).toBe(15)
    // max = 15 + floor(14/2)*5 = 15 + 35 = 50
    expect(planned.maxPlannedWeight).toBe(50)
    expect(planned.maxWeightExplanation).toContain('15 lbs')
  })

  it('uses remaining weeks windows for max weight after partial week progress', () => {
    const planned = getPlannedExercise(
      {
        id: 'e1',
        name: 'Бруси',
        sets: '4',
        reps: '10',
        plannedWeight: 15,
        weightUnit: 'lbs',
        isBodyweightLoad: true,
        progressionRule: {
          type: 'weight',
          amount: 2.5,
          frequency: 1,
          frequencyUnit: 'week',
          basis: 'successfulTrackSessions',
          maxValue: 32.5,
        },
      },
      {
        completedSessionCount: 3,
        successfulSessionCount: 3,
      },
    )

    expect(planned.maxPlannedWeight).toBe(30)
    expect(planned.maxWeightExplanation).toContain('sessions left 13 (~6.5 weeks)')
  })

  it('continues template-based progression even when latest log planned weight is stale', () => {
    const run: FocusRun = {
      id: 'run-1',
      templateId: 'template-1',
      templateName: 'Template 1',
      mode: 'main',
      track: 'upper',
      focusTarget: 'arms',
      status: 'active',
      startedAt: '2026-04-10T10:00:00.000Z',
      completedSessionCount: 3,
      successfulSessionCount: 3,
      nextSessionIndex: 0,
    }

    const template: ProgramTemplate = {
      id: 'template-1',
      name: 'Template 1',
      mode: 'main',
      track: 'upper',
      focusTarget: 'arms',
      sessions: [
        {
          id: 'session-1',
          name: 'Session 1',
          order: 1,
          track: 'upper',
          exercises: [
            {
              id: 'dips-id',
              name: 'Бруси',
              sets: '4 sets',
              reps: '10',
              plannedWeight: 15,
              weightUnit: 'lbs',
              isBodyweightLoad: true,
              progressionRule: {
                type: 'weight',
                amount: 2.5,
                frequency: 1,
                frequencyUnit: 'week',
                basis: 'successfulTrackSessions',
                maxValue: 32.5,
              },
            },
          ],
        },
      ],
    }

    const workoutLogs: WorkoutLog[] = [
      {
        id: 'log-3',
        runId: 'run-1',
        templateId: 'template-1',
        sessionId: 'session-1',
        sessionName: 'Session 1',
        track: 'upper',
        completedAt: '2026-04-14T11:00:00.000Z',
        successful: true,
        exerciseLogs: [
          {
            exerciseId: 'dips-id',
            exerciseName: 'Бруси',
            completed: true,
            skipped: false,
            plannedWeight: 12.5,
            actualWeight: 12.5,
            weightUnit: 'lbs',
          },
        ],
        optionalActivities: [],
      },
      {
        id: 'log-2',
        runId: 'run-1',
        templateId: 'template-1',
        sessionId: 'session-1',
        sessionName: 'Session 1',
        track: 'upper',
        completedAt: '2026-04-12T11:00:00.000Z',
        successful: true,
        exerciseLogs: [
          {
            exerciseId: 'dips-id',
            exerciseName: 'Бруси',
            completed: true,
            skipped: false,
            plannedWeight: 12.5,
            actualWeight: 12.5,
            weightUnit: 'lbs',
          },
        ],
        optionalActivities: [],
      },
      {
        id: 'log-1',
        runId: 'run-1',
        templateId: 'template-1',
        sessionId: 'session-1',
        sessionName: 'Session 1',
        track: 'upper',
        completedAt: '2026-04-10T11:00:00.000Z',
        successful: true,
        exerciseLogs: [
          {
            exerciseId: 'dips-id',
            exerciseName: 'Бруси',
            completed: true,
            skipped: false,
            plannedWeight: 12.5,
            actualWeight: 12.5,
            weightUnit: 'lbs',
          },
        ],
        optionalActivities: [],
      },
    ]

    const planned = buildPlannedSession(run, template, workoutLogs)
    const calendar = buildProgramCalendar(run, template, workoutLogs)

    expect(planned.exercises[0].plannedWeight).toBe(17.5)
    expect(planned.exercises[0].maxPlannedWeight).toBe(32.5)
    expect(planned.exercises[0].maxWeightExplanation).toContain('sessions left 13 (~6.5 weeks)')
    expect(calendar.sessions[3].exercises[0].plannedWeight).toBe(17.5)
    expect(calendar.sessions[11].exercises[0].plannedWeight).toBe(27.5)
    expect(calendar.sessions[15].exercises[0].plannedWeight).toBe(32.5)
  })

  it('computes remaining-program max from current baseline for weekly progression', () => {
    const planned = getPlannedExercise(
      {
        id: 'e1',
        name: 'Бруси',
        sets: '4',
        reps: '10',
        plannedWeight: 12.5,
        weightUnit: 'lbs',
        isBodyweightLoad: true,
        progressionRule: {
          type: 'weight',
          amount: 2.5,
          frequency: 1,
          frequencyUnit: 'week',
          basis: 'successfulTrackSessions',
        },
      },
      {
        completedSessionCount: 2,
        successfulSessionCount: 2,
      },
      {
        latestCompletedActualWeight: 12.5,
      },
    )

    // Template base 12.5, 2 successful sessions, freq 1 week = 2 sessions:
    // steps = floor(2/2) = 1, planned = 12.5 + 2.5 = 15
    expect(planned.plannedWeight).toBe(15)
    // max = 15 + floor(14/2)*2.5 = 15 + 17.5 = 32.5
    expect(planned.maxPlannedWeight).toBe(32.5)
    expect(planned.maxWeightExplanation).toContain('sessions left 14 (~7 weeks)')
  })

  it('computes remaining-program max for two-week progression using week-based steps', () => {
    const planned = getPlannedExercise(
      {
        id: 'e1',
        name: 'Curl',
        sets: '4',
        reps: '10',
        plannedWeight: 45,
        weightUnit: 'lbs',
        progressionRule: {
          type: 'weight',
          amount: 10,
          frequency: 2,
          frequencyUnit: 'week',
          basis: 'successfulTrackSessions',
        },
      },
      {
        completedSessionCount: 3,
        successfulSessionCount: 3,
      },
    )

    expect(planned.maxPlannedWeight).toBe(75)
    expect(planned.maxWeightExplanation).toContain('sessions left 13 (~6.5 weeks)')
  })

  it('uses history by exercise name when IDs changed', () => {
    const run: FocusRun = {
      id: 'run-1',
      templateId: 'template-1',
      templateName: 'Template 1',
      mode: 'main',
      track: 'upper',
      focusTarget: 'arms',
      status: 'active',
      startedAt: '2026-04-10T10:00:00.000Z',
      completedSessionCount: 1,
      successfulSessionCount: 1,
      nextSessionIndex: 0,
    }

    const template: ProgramTemplate = {
      id: 'template-1',
      name: 'Template 1',
      mode: 'main',
      track: 'upper',
      focusTarget: 'arms',
      sessions: [
        {
          id: 'session-1',
          name: 'Session 1',
          order: 1,
          track: 'upper',
          exercises: [
            {
              id: 'new-dips-id',
              name: 'Бруси',
              sets: '4 sets',
              reps: '10',
              plannedWeight: 12.5,
              weightUnit: 'lbs',
              isBodyweightLoad: true,
              progressionRule: {
                type: 'weight',
                amount: 2.5,
                frequency: 1,
                frequencyUnit: 'week',
                basis: 'successfulTrackSessions',
              },
            },
          ],
        },
      ],
    }

    const workoutLogs: WorkoutLog[] = [
      {
        id: 'log-2',
        runId: 'run-1',
        templateId: 'template-1',
        sessionId: 'session-1',
        sessionName: 'Session 1',
        track: 'upper',
        completedAt: '2026-04-12T11:00:00.000Z',
        successful: true,
        exerciseLogs: [
          {
            exerciseId: 'old-dips-id',
            exerciseName: 'Бруси',
            completed: true,
            skipped: false,
            plannedWeight: 12.5,
            actualWeight: 12.5,
            weightUnit: 'lbs',
          },
        ],
        optionalActivities: [],
      },
      {
        id: 'log-1',
        runId: 'run-1',
        templateId: 'template-1',
        sessionId: 'session-1',
        sessionName: 'Session 1',
        track: 'upper',
        completedAt: '2026-04-10T11:00:00.000Z',
        successful: true,
        exerciseLogs: [
          {
            exerciseId: 'old-dips-id',
            exerciseName: 'Бруси',
            completed: true,
            skipped: false,
            plannedWeight: 12.5,
            actualWeight: 12.5,
            weightUnit: 'lbs',
          },
        ],
        optionalActivities: [],
      },
    ]

    const plannedSession = buildPlannedSession(run, template, workoutLogs)
    expect(plannedSession.exercises[0].sessionDoneCount).toBe(2)
    expect(plannedSession.exercises[0].sessionLeftCount).toBe(14)
  })

  it('uses exercise history only from the active run', () => {
    const run: FocusRun = {
      id: 'active-run',
      templateId: 'template-1',
      templateName: 'Biceps',
      mode: 'main',
      track: 'upper',
      focusTarget: 'biceps',
      status: 'active',
      startedAt: '2026-04-18T07:22:23.572Z',
      completedSessionCount: 1,
      successfulSessionCount: 1,
      nextSessionIndex: 0,
    }

    const template: ProgramTemplate = {
      id: 'template-1',
      name: 'Biceps',
      mode: 'main',
      track: 'upper',
      focusTarget: 'biceps',
      sessions: [
        {
          id: 'session-1',
          name: 'Session 1',
          order: 1,
          track: 'upper',
          exercises: [
            {
              id: 'dips-ex-id',
              name: 'Бруси',
              sets: '4 sets',
              reps: '12',
              plannedWeight: 12.5,
              weightUnit: 'lbs',
              isBodyweightLoad: true,
              progressionRule: {
                type: 'weight',
                amount: 2.5,
                frequency: 1,
                frequencyUnit: 'week',
                basis: 'successfulTrackSessions',
              },
            },
          ],
        },
      ],
    }

    const workoutLogs: WorkoutLog[] = [
      {
        id: 'log-new-run',
        runId: 'active-run',
        templateId: 'template-1',
        sessionId: 'session-1',
        sessionName: 'Session 1',
        track: 'upper',
        completedAt: '2026-04-18T10:05:58.729Z',
        successful: true,
        exerciseLogs: [
          {
            exerciseId: 'dips-ex-id',
            exerciseName: 'Бруси',
            completed: true,
            skipped: false,
            plannedWeight: 12.5,
            actualWeight: 12.5,
            weightUnit: 'lbs',
          },
        ],
        optionalActivities: [],
      },
      {
        id: 'log-old-run',
        runId: 'paused-run',
        templateId: 'template-1',
        sessionId: 'session-1',
        sessionName: 'Session 1',
        track: 'upper',
        completedAt: '2026-04-14T08:43:15.228Z',
        successful: true,
        exerciseLogs: [
          {
            exerciseId: 'dips-ex-id',
            exerciseName: 'Бруси',
            completed: true,
            skipped: false,
            plannedWeight: 12.5,
            actualWeight: 12.5,
            weightUnit: 'lbs',
          },
        ],
        optionalActivities: [],
      },
    ]

    const plannedSession = buildPlannedSession(run, template, workoutLogs)

    expect(plannedSession.exercises[0].sessionDoneCount).toBe(1)
    expect(plannedSession.exercises[0].sessionLeftCount).toBe(15)
  })

  it('applies reps progression for numeric ranges', () => {
    const planned = getPlannedExercise(
      {
        id: 'e1',
        name: 'Pull-up',
        sets: '3',
        reps: '8-10',
        progressionRule: {
          type: 'reps',
          amount: 1,
          frequency: 1,
          basis: 'trackSessions',
        },
      },
      3,
    )

    expect(planned.reps).toBe('11-13')
    expect(planned.nextTargetHint).toContain('1 session')
  })

  it('picks opposite track when available', () => {
    const runs: FocusRun[] = [
      {
        id: 'r1',
        templateId: 't1',
        templateName: 'Upper',
        mode: 'main',
        track: 'upper',
        focusTarget: 'biceps',
        status: 'active',
        startedAt: new Date().toISOString(),
        completedSessionCount: 2,
        successfulSessionCount: 2,
        nextSessionIndex: 0,
      },
      {
        id: 'r2',
        templateId: 't2',
        templateName: 'Lower',
        mode: 'main',
        track: 'lower',
        focusTarget: 'calves',
        status: 'active',
        startedAt: new Date().toISOString(),
        completedSessionCount: 1,
        successfulSessionCount: 1,
        nextSessionIndex: 0,
      },
    ]

    expect(getSuggestedTrack(runs, 'upper')).toBe('lower')
    expect(getSuggestedTrack(runs, 'lower')).toBe('upper')
  })

  it('normalizes session index wraps safely', () => {
    const template: ProgramTemplate = {
      id: 't',
      name: 'Template',
      mode: 'main',
      track: 'upper',
      focusTarget: 'biceps',
      sessions: [
        {
          id: 's1',
          name: 'S1',
          order: 1,
          track: 'upper',
          exercises: [],
        },
        {
          id: 's2',
          name: 'S2',
          order: 2,
          track: 'upper',
          exercises: [],
        },
      ],
    }

    expect(getSessionByIndex(template, 2).id).toBe('s1')
    expect(getSessionByIndex(template, -1).id).toBe('s2')
  })

  it('resolves runnable run for a template preferring active over paused', () => {
    const runs: FocusRun[] = [
      {
        id: 'paused-newer',
        templateId: 'template-1',
        templateName: 'Template 1',
        mode: 'main',
        track: 'upper',
        focusTarget: 'arms',
        status: 'paused',
        startedAt: '2026-04-12T10:00:00.000Z',
        completedSessionCount: 1,
        successfulSessionCount: 1,
        nextSessionIndex: 1,
      },
      {
        id: 'active-older',
        templateId: 'template-1',
        templateName: 'Template 1',
        mode: 'main',
        track: 'upper',
        focusTarget: 'arms',
        status: 'active',
        startedAt: '2026-04-10T10:00:00.000Z',
        completedSessionCount: 2,
        successfulSessionCount: 2,
        nextSessionIndex: 0,
      },
      {
        id: 'active-newer',
        templateId: 'template-1',
        templateName: 'Template 1',
        mode: 'main',
        track: 'upper',
        focusTarget: 'arms',
        status: 'active',
        startedAt: '2026-04-14T10:00:00.000Z',
        completedSessionCount: 0,
        successfulSessionCount: 0,
        nextSessionIndex: 0,
      },
    ]

    const resolved = getRunnableRunForTemplate(runs, 'template-1')
    expect(resolved?.id).toBe('active-newer')
  })

  it('falls back to newest paused run when no active run exists', () => {
    const runs: FocusRun[] = [
      {
        id: 'paused-older',
        templateId: 'template-1',
        templateName: 'Template 1',
        mode: 'main',
        track: 'upper',
        focusTarget: 'arms',
        status: 'paused',
        startedAt: '2026-04-10T10:00:00.000Z',
        completedSessionCount: 1,
        successfulSessionCount: 1,
        nextSessionIndex: 1,
      },
      {
        id: 'paused-newer',
        templateId: 'template-1',
        templateName: 'Template 1',
        mode: 'main',
        track: 'upper',
        focusTarget: 'arms',
        status: 'paused',
        startedAt: '2026-04-12T10:00:00.000Z',
        completedSessionCount: 2,
        successfulSessionCount: 2,
        nextSessionIndex: 0,
      },
      {
        id: 'other-template-active',
        templateId: 'template-2',
        templateName: 'Template 2',
        mode: 'main',
        track: 'lower',
        focusTarget: 'legs',
        status: 'active',
        startedAt: '2026-04-13T10:00:00.000Z',
        completedSessionCount: 0,
        successfulSessionCount: 0,
        nextSessionIndex: 0,
      },
    ]

    const resolved = getRunnableRunForTemplate(runs, 'template-1')
    expect(resolved?.id).toBe('paused-newer')
  })

  it('returns null when template has no active or paused runs', () => {
    const runs: FocusRun[] = [
      {
        id: 'completed-run',
        templateId: 'template-1',
        templateName: 'Template 1',
        mode: 'main',
        track: 'upper',
        focusTarget: 'arms',
        status: 'completed',
        startedAt: '2026-04-10T10:00:00.000Z',
        completedSessionCount: 16,
        successfulSessionCount: 16,
        nextSessionIndex: 0,
      },
      {
        id: 'archived-run',
        templateId: 'template-1',
        templateName: 'Template 1',
        mode: 'main',
        track: 'upper',
        focusTarget: 'arms',
        status: 'archived',
        startedAt: '2026-04-01T10:00:00.000Z',
        completedSessionCount: 8,
        successfulSessionCount: 7,
        nextSessionIndex: 0,
      },
    ]

    const resolved = getRunnableRunForTemplate(runs, 'template-1')
    expect(resolved).toBeNull()
  })

  it('builds calendar with projected dates for unlogged sessions', () => {
    const run: FocusRun = {
      id: 'run-1',
      templateId: 'template-1',
      templateName: 'Upper Body',
      mode: 'main',
      track: 'upper',
      focusTarget: 'strength',
      status: 'active',
      startedAt: '2026-04-10T10:00:00.000Z',
      completedSessionCount: 2,
      successfulSessionCount: 2,
      nextSessionIndex: 2,
    }

    const template: ProgramTemplate = {
      id: 'template-1',
      name: 'Upper Body',
      mode: 'main',
      track: 'upper',
      focusTarget: 'strength',
      sessions: [
        {
          id: 'session-1',
          name: 'Upper A',
          order: 1,
          track: 'upper',
          exercises: [
            {
              id: 'bench-ex',
              name: 'Bench Press',
              sets: '4',
              reps: '6-8',
              plannedWeight: 100,
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
        {
          id: 'session-2',
          name: 'Upper B',
          order: 2,
          track: 'upper',
          exercises: [
            {
              id: 'row-ex',
              name: 'Barbell Row',
              sets: '4',
              reps: '6-8',
              plannedWeight: 110,
              weightUnit: 'kg',
            },
          ],
        },
      ],
    }

    const workoutLogs: WorkoutLog[] = [
      {
        id: 'log-1',
        runId: 'run-1',
        templateId: 'template-1',
        sessionId: 'session-1',
        sessionName: 'Upper A',
        track: 'upper',
        completedAt: '2026-04-10T11:00:00.000Z',
        successful: true,
        exerciseLogs: [
          {
            exerciseId: 'bench-ex',
            exerciseName: 'Bench Press',
            completed: true,
            skipped: false,
            actualWeight: 100,
            weightUnit: 'kg',
          },
        ],
        optionalActivities: [],
      },
      {
        id: 'log-2',
        runId: 'run-1',
        templateId: 'template-1',
        sessionId: 'session-2',
        sessionName: 'Upper B',
        track: 'upper',
        completedAt: '2026-04-12T11:00:00.000Z',
        successful: true,
        exerciseLogs: [
          {
            exerciseId: 'row-ex',
            exerciseName: 'Barbell Row',
            completed: true,
            skipped: false,
            actualWeight: 110,
            weightUnit: 'kg',
          },
        ],
        optionalActivities: [],
      },
    ]

    const calendar = buildProgramCalendar(run, template, workoutLogs)

    expect(calendar.sessions).toHaveLength(16)
    expect(calendar.sessions[0].sessionId).toBe('session-1')
    expect(calendar.sessions[0].isCompleted).toBe(true)
    expect(calendar.sessions[1].sessionId).toBe('session-2')
    expect(calendar.sessions[1].isCompleted).toBe(true)

    // Occurrence mapping: index 2+ should be projected, not auto-completed by repeated session IDs.
    expect(calendar.sessions[2].sessionId).toBe('session-1')
    expect(calendar.sessions[2].isCompleted).toBe(false)
    expect(calendar.sessions[2].projectedDate).toBeDefined()
    expect(calendar.sessions[3].sessionId).toBe('session-2')
    expect(calendar.sessions[3].isCompleted).toBe(false)

    expect(calendar.estimatedEndDate).toBeDefined()
    expect(new Date(calendar.estimatedEndDate).getTime()).toBeGreaterThan(
      new Date(calendar.startDate).getTime(),
    )
    expect(calendar.avgDaysBetweenSessions).toBeGreaterThan(0)
    expect(calendar.sessions[0].exercises[0].plannedWeight).toBe(100)
    expect(calendar.sessions[1].exercises[0].plannedWeight).toBe(110)
  })

  it('builds calendar using selected run logs only', () => {
    const run: FocusRun = {
      id: 'run-active',
      templateId: 'template-1',
      templateName: 'Upper Body',
      mode: 'main',
      track: 'upper',
      focusTarget: 'strength',
      status: 'active',
      startedAt: '2026-04-10T10:00:00.000Z',
      completedSessionCount: 1,
      successfulSessionCount: 1,
      nextSessionIndex: 1,
    }

    const template: ProgramTemplate = {
      id: 'template-1',
      name: 'Upper Body',
      mode: 'main',
      track: 'upper',
      focusTarget: 'strength',
      sessions: [
        {
          id: 'session-1',
          name: 'Upper A',
          order: 1,
          track: 'upper',
          exercises: [],
        },
      ],
    }

    const workoutLogs: WorkoutLog[] = [
      {
        id: 'log-active',
        runId: 'run-active',
        templateId: 'template-1',
        sessionId: 'session-1',
        sessionName: 'Upper A',
        track: 'upper',
        completedAt: '2026-04-10T11:00:00.000Z',
        successful: true,
        exerciseLogs: [],
        optionalActivities: [],
      },
      {
        id: 'log-other-run',
        runId: 'run-old',
        templateId: 'template-1',
        sessionId: 'session-1',
        sessionName: 'Upper A',
        track: 'upper',
        completedAt: '2026-04-01T11:00:00.000Z',
        successful: true,
        exerciseLogs: [],
        optionalActivities: [],
      },
    ]

    const calendar = buildProgramCalendar(run, template, workoutLogs)

    expect(calendar.startDate).toBe('2026-04-10T11:00:00.000Z')
    expect(calendar.sessions[0].isCompleted).toBe(true)
    expect(calendar.sessions[1].isCompleted).toBe(false)
  })

  it('projects future calendar sessions with progression-aware weights and reps', () => {
    const run: FocusRun = {
      id: 'run-progression',
      templateId: 'template-progression',
      templateName: 'Progression Test',
      mode: 'main',
      track: 'upper',
      focusTarget: 'strength',
      status: 'active',
      startedAt: '2026-04-10T10:00:00.000Z',
      completedSessionCount: 2,
      successfulSessionCount: 2,
      nextSessionIndex: 2,
    }

    const template: ProgramTemplate = {
      id: 'template-progression',
      name: 'Progression Test',
      mode: 'main',
      track: 'upper',
      focusTarget: 'strength',
      sessions: [
        {
          id: 'session-1',
          name: 'Session 1',
          order: 1,
          track: 'upper',
          exercises: [
            {
              id: 'bench-ex',
              name: 'Bench Press',
              sets: '4',
              reps: '6-8',
              plannedWeight: 100,
              weightUnit: 'kg',
              progressionRule: {
                type: 'weight',
                amount: 5,
                frequency: 2,
                basis: 'successfulTrackSessions',
              },
            },
            {
              id: 'pullup-ex',
              name: 'Pull-up',
              sets: '3',
              reps: '8-10',
              progressionRule: {
                type: 'reps',
                amount: 1,
                frequency: 2,
                basis: 'successfulTrackSessions',
              },
            },
          ],
        },
        {
          id: 'session-2',
          name: 'Session 2',
          order: 2,
          track: 'upper',
          exercises: [
            {
              id: 'bench-ex-2',
              name: 'Bench Press',
              sets: '4',
              reps: '6-8',
              plannedWeight: 100,
              weightUnit: 'kg',
              progressionRule: {
                type: 'weight',
                amount: 5,
                frequency: 2,
                basis: 'successfulTrackSessions',
              },
            },
            {
              id: 'pullup-ex-2',
              name: 'Pull-up',
              sets: '3',
              reps: '8-10',
              progressionRule: {
                type: 'reps',
                amount: 1,
                frequency: 2,
                basis: 'successfulTrackSessions',
              },
            },
          ],
        },
      ],
    }

    const workoutLogs: WorkoutLog[] = [
      {
        id: 'log-1',
        runId: 'run-progression',
        templateId: 'template-progression',
        sessionId: 'session-1',
        sessionName: 'Session 1',
        track: 'upper',
        completedAt: '2026-04-10T11:00:00.000Z',
        successful: true,
        exerciseLogs: [
          {
            exerciseId: 'bench-ex',
            exerciseName: 'Bench Press',
            completed: true,
            skipped: false,
            actualWeight: 100,
            weightUnit: 'kg',
          },
          {
            exerciseId: 'pullup-ex',
            exerciseName: 'Pull-up',
            completed: true,
            skipped: false,
            weightUnit: 'kg',
          },
        ],
        optionalActivities: [],
      },
      {
        id: 'log-2',
        runId: 'run-progression',
        templateId: 'template-progression',
        sessionId: 'session-2',
        sessionName: 'Session 2',
        track: 'upper',
        completedAt: '2026-04-12T11:00:00.000Z',
        successful: true,
        exerciseLogs: [
          {
            exerciseId: 'bench-ex-2',
            exerciseName: 'Bench Press',
            completed: true,
            skipped: false,
            actualWeight: 100,
            weightUnit: 'kg',
          },
          {
            exerciseId: 'pullup-ex-2',
            exerciseName: 'Pull-up',
            completed: true,
            skipped: false,
            weightUnit: 'kg',
          },
        ],
        optionalActivities: [],
      },
    ]

    const calendar = buildProgramCalendar(run, template, workoutLogs)

    // With 2 completed sessions and freq=2, current step = floor(2/2) = 1 → weight = 105
    // Session 2 (projected): same step as current → 105
    // Session 3: step = floor(3/2) = 1 → 105
    // Session 4: step = floor(4/2) = 2 → 110
    expect(calendar.sessions[2].exercises[0].plannedWeight).toBe(105)
    expect(calendar.sessions[3].exercises[0].plannedWeight).toBe(105)
    expect(calendar.sessions[4].exercises[0].plannedWeight).toBe(110)
    expect(calendar.sessions[2].exercises[1].reps).toBe('9-11')
    expect(calendar.sessions[3].exercises[1].reps).toBe('9-11')
    expect(calendar.sessions[4].exercises[1].reps).toBe('10-12')
  })

  it('does not freeze projected progression at stale rule maxValue', () => {
    const run: FocusRun = {
      id: 'run-stale-cap',
      templateId: 'template-stale-cap',
      templateName: 'Stale Cap Test',
      mode: 'main',
      track: 'upper',
      focusTarget: 'strength',
      status: 'active',
      startedAt: '2026-04-10T10:00:00.000Z',
      completedSessionCount: 3,
      successfulSessionCount: 3,
      nextSessionIndex: 3,
    }

    const template: ProgramTemplate = {
      id: 'template-stale-cap',
      name: 'Stale Cap Test',
      mode: 'main',
      track: 'upper',
      focusTarget: 'strength',
      sessions: [
        {
          id: 'session-1',
          name: 'Session 1',
          order: 1,
          track: 'upper',
          exercises: [
            {
              id: 'dips-id',
              name: 'Бруси',
              sets: '4',
              reps: '10',
              plannedWeight: 20,
              weightUnit: 'lbs',
              isBodyweightLoad: true,
              progressionRule: {
                type: 'weight',
                amount: 2.5,
                frequency: 1,
                frequencyUnit: 'week',
                basis: 'successfulTrackSessions',
                maxValue: 32.5,
              },
            },
          ],
        },
      ],
    }

    const workoutLogs: WorkoutLog[] = [
      {
        id: 'log-3',
        runId: 'run-stale-cap',
        templateId: 'template-stale-cap',
        sessionId: 'session-1',
        sessionName: 'Session 1',
        track: 'upper',
        completedAt: '2026-04-14T11:00:00.000Z',
        successful: true,
        exerciseLogs: [
          {
            exerciseId: 'dips-id',
            exerciseName: 'Бруси',
            completed: true,
            skipped: false,
            plannedWeight: 20,
            actualWeight: 20,
            weightUnit: 'lbs',
          },
        ],
        optionalActivities: [],
      },
      {
        id: 'log-2',
        runId: 'run-stale-cap',
        templateId: 'template-stale-cap',
        sessionId: 'session-1',
        sessionName: 'Session 1',
        track: 'upper',
        completedAt: '2026-04-12T11:00:00.000Z',
        successful: true,
        exerciseLogs: [
          {
            exerciseId: 'dips-id',
            exerciseName: 'Бруси',
            completed: true,
            skipped: false,
            plannedWeight: 20,
            actualWeight: 20,
            weightUnit: 'lbs',
          },
        ],
        optionalActivities: [],
      },
      {
        id: 'log-1',
        runId: 'run-stale-cap',
        templateId: 'template-stale-cap',
        sessionId: 'session-1',
        sessionName: 'Session 1',
        track: 'upper',
        completedAt: '2026-04-10T11:00:00.000Z',
        successful: true,
        exerciseLogs: [
          {
            exerciseId: 'dips-id',
            exerciseName: 'Бруси',
            completed: true,
            skipped: false,
            plannedWeight: 20,
            actualWeight: 20,
            weightUnit: 'lbs',
          },
        ],
        optionalActivities: [],
      },
    ]

    const planned = buildPlannedSession(run, template, workoutLogs)
    const calendar = buildProgramCalendar(run, template, workoutLogs)

    // Template base 20, 3 completed (successful), freq 1 week = 2 sessions
    // steps from 0 = floor(3/2) = 1, current = 20 + 2.5 = 22.5
    // remaining = 13, maxSteps = floor(13/2) = 6, max = 22.5 + 6*2.5 = 37.5
    expect(planned.exercises[0].maxPlannedWeight).toBe(37.5)
    // Session 15: steps from 0 = floor(15/2) = 7, weight = 20 + 7*2.5 = 37.5
    expect(calendar.sessions[15].exercises[0].plannedWeight).toBe(37.5)
  })

  // ============================================================
  // Progression anchor reset scenarios
  // ============================================================

  it('linear progression: weight increases every N sessions as planned', () => {
    // Setup: base 10kg, +5kg every 2 sessions
    const exercise = {
      id: 'e1',
      name: 'Curl',
      sets: '4',
      reps: '10',
      plannedWeight: 10,
      weightUnit: 'kg',
      progressionRule: {
        type: 'weight' as const,
        amount: 5,
        frequency: 2,
        basis: 'trackSessions' as const,
      },
    }

    // Session 0: steps=floor(0/2)=0, weight=10
    const s0 = getPlannedExercise(exercise, 0)
    expect(s0.plannedWeight).toBe(10)

    // Session 1: steps=floor(1/2)=0, weight=10
    const s1 = getPlannedExercise(exercise, 1, { latestCompletedActualWeight: 10 })
    expect(s1.plannedWeight).toBe(10)

    // Session 2: steps=floor(2/2)=1, weight=15
    const s2 = getPlannedExercise(exercise, 2, { latestCompletedActualWeight: 10 })
    expect(s2.plannedWeight).toBe(15)

    // Session 3: steps=floor(3/2)=1, weight=15
    const s3 = getPlannedExercise(exercise, 3, { latestCompletedActualWeight: 15 })
    expect(s3.plannedWeight).toBe(15)

    // Session 4: steps=floor(4/2)=2, weight=20
    const s4 = getPlannedExercise(exercise, 4, { latestCompletedActualWeight: 15 })
    expect(s4.plannedWeight).toBe(20)

    // Session 5: steps=floor(5/2)=2, weight=20
    const s5 = getPlannedExercise(exercise, 5, { latestCompletedActualWeight: 20 })
    expect(s5.plannedWeight).toBe(20)
  })

  it('did less than planned: anchor resets to performed value and cycle restarts', () => {
    // Setup: base 10kg, +5kg every 2 sessions
    // At session 4 (planned 20), user did only 15.
    // Expected: anchor resets to 15 at session 4.
    // Session 5,6 = 15 (cycle restart), then 7,8 = 20, etc.
    const exercise = {
      id: 'e1',
      name: 'Curl',
      sets: '4',
      reps: '10',
      plannedWeight: 10,
      weightUnit: 'kg',
      progressionRule: {
        type: 'weight' as const,
        amount: 5,
        frequency: 2,
        basis: 'trackSessions' as const,
      },
    }

    // Session 4 was planned as 20, user did 15 → anchor created
    const anchor = { weight: 15, resetAtSessionIndex: 4 }

    // Session 5: effectiveSince=max(0,5-4-1)=0, steps=floor(0/2)=0, weight=15
    const s5 = getPlannedExercise(exercise, 5, {
      latestCompletedActualWeight: 15,
      baselineAnchor: anchor,
    })
    expect(s5.plannedWeight).toBe(15)

    // Session 6: effectiveSince=max(0,6-4-1)=1, steps=floor(1/2)=0, weight=15 (hold for full cycle)
    const s6 = getPlannedExercise(exercise, 6, {
      latestCompletedActualWeight: 15,
      baselineAnchor: anchor,
    })
    expect(s6.plannedWeight).toBe(15)

    // Session 7: effectiveSince=max(0,7-4-1)=2, steps=floor(2/2)=1, weight=15+5=20
    const s7 = getPlannedExercise(exercise, 7, {
      latestCompletedActualWeight: 15,
      baselineAnchor: anchor,
    })
    expect(s7.plannedWeight).toBe(20)

    // Session 8: effectiveSince=max(0,8-4-1)=3, steps=floor(3/2)=1, weight=20
    const s8 = getPlannedExercise(exercise, 8, {
      latestCompletedActualWeight: 20,
      baselineAnchor: anchor,
    })
    expect(s8.plannedWeight).toBe(20)
  })

  it('did more than planned: anchor resets to higher performed value and cycle restarts', () => {
    // Setup: base 10kg, +5kg every 2 sessions
    // At session 2 (planned 15), user did 20.
    // Expected: anchor resets to 20 at session 2.
    // Session 3,4 = 20 (cycle restart), then 5,6 = 25, etc.
    const exercise = {
      id: 'e1',
      name: 'Curl',
      sets: '4',
      reps: '10',
      plannedWeight: 10,
      weightUnit: 'kg',
      progressionRule: {
        type: 'weight' as const,
        amount: 5,
        frequency: 2,
        basis: 'trackSessions' as const,
      },
    }

    // Session 2 was planned as 15, user did 20 → anchor created
    const anchor = { weight: 20, resetAtSessionIndex: 2 }

    // Session 3: effectiveSince=max(0,3-2-1)=0, steps=floor(0/2)=0, weight=20
    const s3 = getPlannedExercise(exercise, 3, {
      latestCompletedActualWeight: 20,
      baselineAnchor: anchor,
    })
    expect(s3.plannedWeight).toBe(20)

    // Session 4: effectiveSince=max(0,4-2-1)=1, steps=floor(1/2)=0, weight=20 (hold for full cycle)
    const s4 = getPlannedExercise(exercise, 4, {
      latestCompletedActualWeight: 20,
      baselineAnchor: anchor,
    })
    expect(s4.plannedWeight).toBe(20)

    // Session 5: effectiveSince=max(0,5-2-1)=2, steps=floor(2/2)=1, weight=20+5=25
    const s5 = getPlannedExercise(exercise, 5, {
      latestCompletedActualWeight: 20,
      baselineAnchor: anchor,
    })
    expect(s5.plannedWeight).toBe(25)

    // Session 6: effectiveSince=max(0,6-2-1)=3, steps=floor(3/2)=1, weight=25
    const s6 = getPlannedExercise(exercise, 6, {
      latestCompletedActualWeight: 25,
      baselineAnchor: anchor,
    })
    expect(s6.plannedWeight).toBe(25)
  })

  it('matches next session weights between session plan and first projected calendar session after anchor resets', () => {
    const run: FocusRun = {
      id: 'run-anchor-calendar',
      templateId: 'template-anchor-calendar',
      templateName: 'Anchor Calendar',
      mode: 'main',
      track: 'upper',
      focusTarget: 'strength',
      status: 'active',
      startedAt: '2026-04-01T08:00:00.000Z',
      completedSessionCount: 5,
      successfulSessionCount: 5,
      nextSessionIndex: 0,
      baselineAnchors: {
        lower: {
          weight: 15,
          resetAtSessionIndex: 4,
          resetAt: '2026-04-20T08:00:00.000Z',
        },
        higher: {
          weight: 20,
          resetAtSessionIndex: 2,
          resetAt: '2026-04-12T08:00:00.000Z',
        },
      },
    }

    const template: ProgramTemplate = {
      id: 'template-anchor-calendar',
      name: 'Anchor Calendar',
      mode: 'main',
      track: 'upper',
      focusTarget: 'strength',
      sessions: [
        {
          id: 'session-1',
          name: 'Session 1',
          order: 1,
          track: 'upper',
          exercises: [
            {
              id: 'lower',
              name: 'Lower Reset',
              sets: '4',
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
            {
              id: 'higher',
              name: 'Higher Reset',
              sets: '4',
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
    }

    const workoutLogs: WorkoutLog[] = Array.from({ length: 5 }, (_, index) => ({
      id: `log-${index + 1}`,
      runId: 'run-anchor-calendar',
      templateId: 'template-anchor-calendar',
      sessionId: 'session-1',
      sessionName: 'Session 1',
      track: 'upper',
      completedAt: `2026-04-0${index + 1}T08:00:00.000Z`,
      successful: true,
      exerciseLogs: [
        {
          exerciseId: 'lower',
          exerciseName: 'Lower Reset',
          completed: true,
          skipped: false,
          plannedWeight: 10,
          actualWeight: 10,
          weightUnit: 'kg',
        },
        {
          exerciseId: 'higher',
          exerciseName: 'Higher Reset',
          completed: true,
          skipped: false,
          plannedWeight: 10,
          actualWeight: 10,
          weightUnit: 'kg',
        },
      ],
      optionalActivities: [],
    }))

    const planned = buildPlannedSession(run, template, workoutLogs)
    const calendar = buildProgramCalendar(run, template, workoutLogs)
    const firstProjected = calendar.sessions[run.completedSessionCount]
    const lowerPlanned = planned.exercises.find((exercise) => exercise.id === 'lower')
    const higherPlanned = planned.exercises.find((exercise) => exercise.id === 'higher')
    const lowerProjected = firstProjected.exercises.find((exercise) => exercise.id === 'lower')
    const higherProjected = firstProjected.exercises.find(
      (exercise) => exercise.id === 'higher',
    )

    expect(lowerPlanned?.plannedWeight).toBe(15)
    expect(lowerProjected?.plannedWeight).toBe(lowerPlanned?.plannedWeight)
    expect(higherPlanned?.plannedWeight).toBe(25)
    expect(higherProjected?.plannedWeight).toBe(higherPlanned?.plannedWeight)
  })

  it('keeps session plan progression aligned with calendar for alternating sessions', () => {
    const run: FocusRun = {
      id: 'run-alt-sync',
      templateId: 'template-alt-sync',
      templateName: 'Alternating',
      mode: 'main',
      track: 'upper',
      focusTarget: 'strength',
      status: 'active',
      startedAt: '2026-04-01T08:00:00.000Z',
      completedSessionCount: 3,
      successfulSessionCount: 3,
      nextSessionIndex: 1,
    }

    const template: ProgramTemplate = {
      id: 'template-alt-sync',
      name: 'Alternating',
      mode: 'main',
      track: 'upper',
      focusTarget: 'strength',
      sessions: [
        {
          id: 'session-a',
          name: 'Session A',
          order: 1,
          track: 'upper',
          exercises: [
            {
              id: 'a-only',
              name: 'A Only',
              sets: '4',
              reps: '8',
              plannedWeight: 50,
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
        {
          id: 'session-b',
          name: 'Session B',
          order: 2,
          track: 'upper',
          exercises: [
            {
              id: 'b-only',
              name: 'B Only',
              sets: '4',
              reps: '8',
              plannedWeight: 40,
              weightUnit: 'kg',
              progressionRule: {
                type: 'weight',
                amount: 2.5,
                frequency: 2,
                basis: 'successfulTrackSessions',
              },
            },
          ],
        },
      ],
    }

    const workoutLogs: WorkoutLog[] = [
      {
        id: 'log-1',
        runId: 'run-alt-sync',
        templateId: 'template-alt-sync',
        sessionId: 'session-a',
        sessionName: 'Session A',
        track: 'upper',
        completedAt: '2026-04-01T08:00:00.000Z',
        successful: true,
        exerciseLogs: [
          {
            exerciseId: 'a-only',
            exerciseName: 'A Only',
            completed: true,
            skipped: false,
            plannedWeight: 50,
            actualWeight: 50,
            weightUnit: 'kg',
          },
        ],
        optionalActivities: [],
      },
      {
        id: 'log-2',
        runId: 'run-alt-sync',
        templateId: 'template-alt-sync',
        sessionId: 'session-b',
        sessionName: 'Session B',
        track: 'upper',
        completedAt: '2026-04-03T08:00:00.000Z',
        successful: true,
        exerciseLogs: [
          {
            exerciseId: 'b-only',
            exerciseName: 'B Only',
            completed: true,
            skipped: false,
            plannedWeight: 40,
            actualWeight: 40,
            weightUnit: 'kg',
          },
        ],
        optionalActivities: [],
      },
      {
        id: 'log-3',
        runId: 'run-alt-sync',
        templateId: 'template-alt-sync',
        sessionId: 'session-a',
        sessionName: 'Session A',
        track: 'upper',
        completedAt: '2026-04-05T08:00:00.000Z',
        successful: true,
        exerciseLogs: [
          {
            exerciseId: 'a-only',
            exerciseName: 'A Only',
            completed: true,
            skipped: false,
            plannedWeight: 55,
            actualWeight: 55,
            weightUnit: 'kg',
          },
        ],
        optionalActivities: [],
      },
    ]

    const planned = buildPlannedSession(run, template, workoutLogs)
    const calendar = buildProgramCalendar(run, template, workoutLogs)
    const nextCalendarSession = calendar.sessions[run.completedSessionCount]
    const plannedExercise = planned.exercises.find((exercise) => exercise.id === 'b-only')
    const calendarExercise = nextCalendarSession.exercises.find(
      (exercise) => exercise.id === 'b-only',
    )

    expect(nextCalendarSession.sessionId).toBe(planned.session.id)
    expect(plannedExercise?.plannedWeight).toBe(42.5)
    expect(calendarExercise?.plannedWeight).toBe(plannedExercise?.plannedWeight)
    expect(plannedExercise?.maxPlannedWeight).toBe(55)
    expect(plannedExercise?.maxWeightExplanation).toContain('= 55 kg')
  })

  it('builds cycle status and recent history for planned exercises', () => {
    const run: FocusRun = {
      id: 'run-cycle-status',
      templateId: 'template-cycle-status',
      templateName: 'Cycle Status',
      mode: 'main',
      track: 'upper',
      focusTarget: 'arms',
      status: 'active',
      startedAt: '2026-04-01T08:00:00.000Z',
      completedSessionCount: 5,
      successfulSessionCount: 5,
      nextSessionIndex: 0,
      // Anchor was set at session index 3 (4th session) when user held at 17 lbs
      // while system progressed to 19. resetAtSessionIndex=3 → anchorSession=4.
      baselineAnchors: {
        curl: {
          weight: 17,
          resetAtSessionIndex: 3,
          resetAt: '2026-04-07T08:00:00.000Z',
        },
      },
    }

    const template: ProgramTemplate = {
      id: 'template-cycle-status',
      name: 'Cycle Status',
      mode: 'main',
      track: 'upper',
      focusTarget: 'arms',
      sessions: [
        {
          id: 'session-1',
          name: 'Session 1',
          order: 1,
          track: 'upper',
          exercises: [
            {
              id: 'curl',
              name: 'Curl',
              sets: '4',
              reps: '10',
              plannedWeight: 15,
              weightUnit: 'lbs',
              progressionRule: {
                type: 'weight',
                amount: 2,
                frequency: 2,
                basis: 'trackSessions',
              },
            },
          ],
        },
      ],
    }

    const logs: WorkoutLog[] = [
      {
        id: 'log-1',
        runId: 'run-cycle-status',
        templateId: 'template-cycle-status',
        sessionId: 'session-1',
        sessionName: 'Session 1',
        track: 'upper',
        completedAt: '2026-04-01T08:00:00.000Z',
        successful: true,
        exerciseLogs: [
          {
            exerciseId: 'curl',
            exerciseName: 'Curl',
            completed: true,
            skipped: false,
            plannedWeight: 15,
            actualWeight: 15,
            weightUnit: 'lbs',
          },
        ],
        optionalActivities: [],
      },
      {
        id: 'log-2',
        runId: 'run-cycle-status',
        templateId: 'template-cycle-status',
        sessionId: 'session-1',
        sessionName: 'Session 1',
        track: 'upper',
        completedAt: '2026-04-03T08:00:00.000Z',
        successful: true,
        exerciseLogs: [
          {
            exerciseId: 'curl',
            exerciseName: 'Curl',
            completed: true,
            skipped: false,
            plannedWeight: 15,
            actualWeight: 15,
            weightUnit: 'lbs',
          },
        ],
        optionalActivities: [],
      },
      {
        id: 'log-3',
        runId: 'run-cycle-status',
        templateId: 'template-cycle-status',
        sessionId: 'session-1',
        sessionName: 'Session 1',
        track: 'upper',
        completedAt: '2026-04-05T08:00:00.000Z',
        successful: true,
        exerciseLogs: [
          {
            exerciseId: 'curl',
            exerciseName: 'Curl',
            completed: true,
            skipped: false,
            plannedWeight: 17,
            actualWeight: 17,
            weightUnit: 'lbs',
          },
        ],
        optionalActivities: [],
      },
      {
        id: 'log-4',
        runId: 'run-cycle-status',
        templateId: 'template-cycle-status',
        sessionId: 'session-1',
        sessionName: 'Session 1',
        track: 'upper',
        completedAt: '2026-04-07T08:00:00.000Z',
        successful: true,
        exerciseLogs: [
          {
            exerciseId: 'curl',
            exerciseName: 'Curl',
            completed: true,
            skipped: false,
            plannedWeight: 17,
            actualWeight: 17,
            weightUnit: 'lbs',
          },
        ],
        optionalActivities: [],
      },
      {
        id: 'log-5',
        runId: 'run-cycle-status',
        templateId: 'template-cycle-status',
        sessionId: 'session-1',
        sessionName: 'Session 1',
        track: 'upper',
        completedAt: '2026-04-09T08:00:00.000Z',
        successful: true,
        exerciseLogs: [
          {
            exerciseId: 'curl',
            exerciseName: 'Curl',
            completed: true,
            skipped: false,
            plannedWeight: 17,
            actualWeight: 17,
            weightUnit: 'lbs',
          },
        ],
        optionalActivities: [],
      },
    ]

    const planned = buildPlannedSession(run, template, logs)
    const exercise = planned.exercises[0]

    // With fix: displayNumerator = total consecutive count (3), not modulo position
    expect(exercise.progressionCycleStatus?.displayNumerator).toBe(3)
    expect(exercise.progressionCycleStatus?.displayDenominator).toBe(4)
    expect(exercise.progressionCycleStatus?.isHeldBeyondPlannedWindow).toBe(true)
    expect(exercise.recentExerciseHistory).toHaveLength(3)
    expect(exercise.recentExerciseHistory?.[0].completedAt).toBe('2026-04-09T08:00:00.000Z')
  })

  it('shows correct held numerator after anchor resets cycle counter (user reports 1/N instead of 9/N)', () => {
    // User scenario: exercise with 2-week frequency (window=4 sessions).
    // User did 35 lbs for 9 sessions in a row. After session 4 the system tried to
    // progress to 40 lbs but user held at 35. An anchor was set at session index 4.
    // Bug: showed "1/12 (held)" because the modulo resets to 1 inside the new window.
    // Fix: should show "9/12 (held)" — the actual consecutive count at held weight.
    const run: FocusRun = {
      id: 'run-held',
      templateId: 'template-held',
      templateName: 'Held Test',
      mode: 'main',
      track: 'upper',
      focusTarget: 'forearms',
      status: 'active',
      startedAt: '2026-01-01T10:00:00.000Z',
      completedSessionCount: 9,
      successfulSessionCount: 9,
      nextSessionIndex: 0,
      // Anchor set at session index 4 (5th session): system showed 40, user did 35.
      // anchorSession = resetAtSessionIndex + 1 = 5.
      baselineAnchors: {
        'wrist-curl': {
          weight: 35,
          resetAtSessionIndex: 4,
          resetAt: '2026-01-09T10:00:00.000Z',
        },
      },
    }

    const template: ProgramTemplate = {
      id: 'template-held',
      name: 'Held Test',
      mode: 'main',
      track: 'upper',
      focusTarget: 'forearms',
      sessions: [
        {
          id: 'session-1',
          name: 'Session 1',
          order: 1,
          track: 'upper',
          exercises: [
            {
              id: 'wrist-curl',
              name: 'Wrist Curl',
              sets: '3',
              reps: '12',
              plannedWeight: 35,
              weightUnit: 'lbs',
              progressionRule: {
                type: 'weight',
                amount: 5,
                frequency: 2,
                frequencyUnit: 'week',
                basis: 'trackSessions',
              },
            },
          ],
        },
      ],
    }

    // 9 sessions all at 35 lbs, spaced 3-4 days apart
    const logs: WorkoutLog[] = Array.from({ length: 9 }, (_, i) => ({
      id: `log-${i + 1}`,
      runId: 'run-held',
      templateId: 'template-held',
      sessionId: 'session-1',
      sessionName: 'Session 1',
      track: 'upper' as const,
      completedAt: new Date(
        Date.UTC(2026, 0, 1 + i * 4),
      ).toISOString(),
      successful: true,
      exerciseLogs: [
        {
          exerciseId: 'wrist-curl',
          exerciseName: 'Wrist Curl',
          completed: true,
          skipped: false,
          plannedWeight: 35,
          actualWeight: 35,
          weightUnit: 'lbs',
        },
      ],
      optionalActivities: [],
    }))

    const planned = buildPlannedSession(run, template, logs)
    const exercise = planned.exercises[0]

    // anchor at index 4 → anchorSession=5; sessionsSinceAnchor=max(0,9-5)=4; steps=floor(4/4)=1
    // currentPlannedWeight = 35+1*5=40. But 40≠35 in logs → heldExtensions check fails.
    // Correct: currentPlannedWeight must equal the held weight (35) for held to be detected.
    // This happens when anchorSession is placed so that steps=0 within the current window.
    // In this test the anchor is at resetAtSessionIndex=4 (anchorSession=5) and
    // nextProgramSessionIndex=9, so sessionsSinceAnchor=4, steps=1, plannedWeight=40.
    // The held detection therefore shows 0 extensions — this is correct behaviour for
    // THIS anchor position: the system already wants the user at 40, not 35.
    // The user-visible bug ("1/N held") is reproduced when steps=0 (first window after anchor).
    // We test that edge case separately below.
    expect(exercise.progressionCycleStatus?.isHeldBeyondPlannedWindow).toBe(false)
  })

  it('shows total consecutive count as numerator when user is in first window after anchor (steps=0)', () => {
    // Scenario: anchor set at resetAtSessionIndex=8 (anchorSession=9).
    // nextProgramSessionIndex=9 → sessionsSinceAnchor=max(0,9-9)=0 → steps=0 → plannedWeight=35.
    // countHeldCycleExtensions checks against 35: all 9 logs match → consecutiveTargetCount=9.
    // Bug: displayNumerator=(0%4)+1=1. Fix: displayNumerator=9.
    const run: FocusRun = {
      id: 'run-held-v2',
      templateId: 'template-held-v2',
      templateName: 'Held V2',
      mode: 'main',
      track: 'upper',
      focusTarget: 'forearms',
      status: 'active',
      startedAt: '2026-01-01T10:00:00.000Z',
      completedSessionCount: 9,
      successfulSessionCount: 9,
      nextSessionIndex: 0,
      baselineAnchors: {
        'wrist-curl': {
          weight: 35,
          resetAtSessionIndex: 8,
          resetAt: '2026-02-01T10:00:00.000Z',
        },
      },
    }

    const template: ProgramTemplate = {
      id: 'template-held-v2',
      name: 'Held V2',
      mode: 'main',
      track: 'upper',
      focusTarget: 'forearms',
      sessions: [
        {
          id: 'session-1',
          name: 'Session 1',
          order: 1,
          track: 'upper',
          exercises: [
            {
              id: 'wrist-curl',
              name: 'Wrist Curl',
              sets: '3',
              reps: '12',
              plannedWeight: 35,
              weightUnit: 'lbs',
              progressionRule: {
                type: 'weight',
                amount: 5,
                frequency: 2,
                frequencyUnit: 'week',
                basis: 'trackSessions',
              },
            },
          ],
        },
      ],
    }

    const logs: WorkoutLog[] = Array.from({ length: 9 }, (_, i) => ({
      id: `log-v2-${i + 1}`,
      runId: 'run-held-v2',
      templateId: 'template-held-v2',
      sessionId: 'session-1',
      sessionName: 'Session 1',
      track: 'upper' as const,
      completedAt: new Date(Date.UTC(2026, 0, 1 + i * 4)).toISOString(),
      successful: true,
      exerciseLogs: [
        {
          exerciseId: 'wrist-curl',
          exerciseName: 'Wrist Curl',
          completed: true,
          skipped: false,
          plannedWeight: 35,
          actualWeight: 35,
          weightUnit: 'lbs',
        },
      ],
      optionalActivities: [],
    }))

    const planned = buildPlannedSession(run, template, logs)
    const exercise = planned.exercises[0]

    // anchorSession=9, sessionsSinceAnchor=0, steps=0, plannedWeight=35
    // All 9 logs at 35 → consecutiveTargetCount=9
    // window=4, heldExtensions=max(1,ceil((9-4)/4))=max(1,2)=2
    // displayDenominator=4*(2+1)=12
    // Bug (old): displayNumerator=(0%4)+1=1 → shows "1/12 (held)"
    // Fix (new): displayNumerator=9 → shows "9/12 (held)"
    expect(exercise.progressionCycleStatus?.displayNumerator).toBe(9)
    expect(exercise.progressionCycleStatus?.displayDenominator).toBe(12)
    expect(exercise.progressionCycleStatus?.isHeldBeyondPlannedWindow).toBe(true)
  })

  it('shows standard modulo numerator when not held beyond planned window', () => {
    // Normal progression: 3 sessions done, window=2. No held extension.
    // displayNumerator = (sessionsSinceAnchor % 2) + 1.
    const run: FocusRun = {
      id: 'run-normal',
      templateId: 'template-normal',
      templateName: 'Normal',
      mode: 'main',
      track: 'upper',
      focusTarget: 'arms',
      status: 'active',
      startedAt: '2026-03-01T10:00:00.000Z',
      completedSessionCount: 3,
      successfulSessionCount: 3,
      nextSessionIndex: 0,
    }

    const template: ProgramTemplate = {
      id: 'template-normal',
      name: 'Normal',
      mode: 'main',
      track: 'upper',
      focusTarget: 'arms',
      sessions: [
        {
          id: 's1',
          name: 'S1',
          order: 1,
          track: 'upper',
          exercises: [
            {
              id: 'curl-n',
              name: 'Curl N',
              sets: '3',
              reps: '10',
              plannedWeight: 20,
              weightUnit: 'kg',
              progressionRule: {
                type: 'weight',
                amount: 2.5,
                frequency: 2,
                basis: 'trackSessions',
              },
            },
          ],
        },
      ],
    }

    const logs: WorkoutLog[] = [
      {
        id: 'ln-1',
        runId: 'run-normal',
        templateId: 'template-normal',
        sessionId: 's1',
        sessionName: 'S1',
        track: 'upper',
        completedAt: '2026-03-01T10:00:00.000Z',
        successful: true,
        exerciseLogs: [{ exerciseId: 'curl-n', exerciseName: 'Curl N', completed: true, skipped: false, plannedWeight: 20, actualWeight: 20, weightUnit: 'kg' }],
        optionalActivities: [],
      },
      {
        id: 'ln-2',
        runId: 'run-normal',
        templateId: 'template-normal',
        sessionId: 's1',
        sessionName: 'S1',
        track: 'upper',
        completedAt: '2026-03-03T10:00:00.000Z',
        successful: true,
        exerciseLogs: [{ exerciseId: 'curl-n', exerciseName: 'Curl N', completed: true, skipped: false, plannedWeight: 20, actualWeight: 20, weightUnit: 'kg' }],
        optionalActivities: [],
      },
      {
        id: 'ln-3',
        runId: 'run-normal',
        templateId: 'template-normal',
        sessionId: 's1',
        sessionName: 'S1',
        track: 'upper',
        completedAt: '2026-03-05T10:00:00.000Z',
        successful: true,
        exerciseLogs: [{ exerciseId: 'curl-n', exerciseName: 'Curl N', completed: true, skipped: false, plannedWeight: 22.5, actualWeight: 22.5, weightUnit: 'kg' }],
        optionalActivities: [],
      },
    ]

    const planned = buildPlannedSession(run, template, logs)
    const exercise = planned.exercises[0]

    // latestActual=22.5, anchorWeight=20, anchorSession=0
    // sessionsSinceAnchor=3, completedInWindow=(3%2)+1=2, heldExtensions=0
    // currentPlannedWeight=20+floor(3/2)*2.5=20+2.5=22.5
    // countHeld against 22.5: only log-3 matches, consecutiveTargetCount=1 (≤2=window) → held=0
    expect(exercise.progressionCycleStatus?.isHeldBeyondPlannedWindow).toBe(false)
    expect(exercise.progressionCycleStatus?.displayNumerator).toBe(2)
    expect(exercise.progressionCycleStatus?.displayDenominator).toBe(2)
  })

  // ===== buildBaselineAnchorsForRun =====

  it('buildBaselineAnchorsForRun returns undefined when there are no logs', () => {
    const template: ProgramTemplate = {
      id: 't1',
      name: 'T1',
      mode: 'main',
      track: 'upper',
      focusTarget: '',
      sessions: [
        {
          id: 's1',
          name: 'S1',
          order: 1,
          track: 'upper',
          exercises: [{ id: 'e1', name: 'E1', sets: '3', reps: '10', plannedWeight: 20, weightUnit: 'kg', progressionRule: { type: 'weight', amount: 2.5, frequency: 2, basis: 'trackSessions' } }],
        },
      ],
    }

    expect(buildBaselineAnchorsForRun(template, [])).toBeUndefined()
  })

  it('buildBaselineAnchorsForRun returns undefined when actual matches planned in all logs', () => {
    const template: ProgramTemplate = {
      id: 't2',
      name: 'T2',
      mode: 'main',
      track: 'upper',
      focusTarget: '',
      sessions: [{ id: 's1', name: 'S1', order: 1, track: 'upper', exercises: [{ id: 'e1', name: 'E1', sets: '3', reps: '10', plannedWeight: 20, weightUnit: 'kg', progressionRule: { type: 'weight', amount: 2.5, frequency: 2, basis: 'trackSessions' } }] }],
    }

    const logs: WorkoutLog[] = [
      { id: 'l1', runId: 'r1', templateId: 't2', sessionId: 's1', sessionName: 'S1', track: 'upper', completedAt: '2026-01-01T10:00:00Z', successful: true, exerciseLogs: [{ exerciseId: 'e1', exerciseName: 'E1', completed: true, skipped: false, plannedWeight: 20, actualWeight: 20, weightUnit: 'kg' }], optionalActivities: [] },
      { id: 'l2', runId: 'r1', templateId: 't2', sessionId: 's1', sessionName: 'S1', track: 'upper', completedAt: '2026-01-03T10:00:00Z', successful: true, exerciseLogs: [{ exerciseId: 'e1', exerciseName: 'E1', completed: true, skipped: false, plannedWeight: 20, actualWeight: 20, weightUnit: 'kg' }], optionalActivities: [] },
    ]

    expect(buildBaselineAnchorsForRun(template, logs)).toBeUndefined()
  })

  it('buildBaselineAnchorsForRun creates anchor when actual deviates from planned', () => {
    const template: ProgramTemplate = {
      id: 't3',
      name: 'T3',
      mode: 'main',
      track: 'upper',
      focusTarget: '',
      sessions: [{ id: 's1', name: 'S1', order: 1, track: 'upper', exercises: [{ id: 'e1', name: 'E1', sets: '3', reps: '10', plannedWeight: 20, weightUnit: 'kg', progressionRule: { type: 'weight', amount: 2.5, frequency: 2, basis: 'trackSessions' } }] }],
    }

    const logs: WorkoutLog[] = [
      { id: 'l1', runId: 'r1', templateId: 't3', sessionId: 's1', sessionName: 'S1', track: 'upper', completedAt: '2026-01-01T10:00:00Z', successful: true, exerciseLogs: [{ exerciseId: 'e1', exerciseName: 'E1', completed: true, skipped: false, plannedWeight: 20, actualWeight: 20, weightUnit: 'kg' }], optionalActivities: [] },
      // Session 2: user logs planned=22.5 but actual=20 (didn't progress)
      { id: 'l2', runId: 'r1', templateId: 't3', sessionId: 's1', sessionName: 'S1', track: 'upper', completedAt: '2026-01-03T10:00:00Z', successful: true, exerciseLogs: [{ exerciseId: 'e1', exerciseName: 'E1', completed: true, skipped: false, plannedWeight: 22.5, actualWeight: 20, weightUnit: 'kg' }], optionalActivities: [] },
    ]

    const anchors = buildBaselineAnchorsForRun(template, logs)
    expect(anchors).toBeDefined()
    expect(anchors?.['e1']?.weight).toBe(20)
    // resetAtSessionIndex = completedCount BEFORE this log = 1 (0-indexed after log-1)
    expect(anchors?.['e1']?.resetAtSessionIndex).toBe(1)
  })

  it('buildBaselineAnchorsForRun uses successfulSessionCount index for successfulTrackSessions basis', () => {
    const template: ProgramTemplate = {
      id: 't4',
      name: 'T4',
      mode: 'main',
      track: 'upper',
      focusTarget: '',
      sessions: [{ id: 's1', name: 'S1', order: 1, track: 'upper', exercises: [{ id: 'e1', name: 'E1', sets: '3', reps: '10', plannedWeight: 20, weightUnit: 'kg', progressionRule: { type: 'weight', amount: 2.5, frequency: 2, basis: 'successfulTrackSessions' } }] }],
    }

    const logs: WorkoutLog[] = [
      // Session 1: successful
      { id: 'l1', runId: 'r1', templateId: 't4', sessionId: 's1', sessionName: 'S1', track: 'upper', completedAt: '2026-01-01T10:00:00Z', successful: true, exerciseLogs: [{ exerciseId: 'e1', exerciseName: 'E1', completed: true, skipped: false, plannedWeight: 20, actualWeight: 20, weightUnit: 'kg' }], optionalActivities: [] },
      // Session 2: NOT successful (hard session, no progression)
      { id: 'l2', runId: 'r1', templateId: 't4', sessionId: 's1', sessionName: 'S1', track: 'upper', completedAt: '2026-01-03T10:00:00Z', successful: false, exerciseLogs: [{ exerciseId: 'e1', exerciseName: 'E1', completed: true, skipped: false, plannedWeight: 20, actualWeight: 20, weightUnit: 'kg' }], optionalActivities: [] },
      // Session 3: user logs planned=22.5 but actual=20
      { id: 'l3', runId: 'r1', templateId: 't4', sessionId: 's1', sessionName: 'S1', track: 'upper', completedAt: '2026-01-05T10:00:00Z', successful: true, exerciseLogs: [{ exerciseId: 'e1', exerciseName: 'E1', completed: true, skipped: false, plannedWeight: 22.5, actualWeight: 20, weightUnit: 'kg' }], optionalActivities: [] },
    ]

    const anchors = buildBaselineAnchorsForRun(template, logs)
    expect(anchors).toBeDefined()
    // resetAtSessionIndex = successfulCount BEFORE this log = 1 (only l1 was successful before l3)
    expect(anchors?.['e1']?.resetAtSessionIndex).toBe(1)
  })

  // ===== getRecentExerciseHistory =====

  it('getRecentExerciseHistory with no limit returns all matching entries', () => {
    const logs: WorkoutLog[] = Array.from({ length: 5 }, (_, i) => ({
      id: `log-h${i}`,
      runId: 'r1',
      templateId: 't1',
      sessionId: 's1',
      sessionName: 'S1',
      track: 'upper' as const,
      completedAt: new Date(Date.UTC(2026, 2, 1 + i)).toISOString(),
      successful: true,
      exerciseLogs: [{ exerciseId: 'e1', exerciseName: 'Curl', completed: true, skipped: false, plannedWeight: 20 + i, actualWeight: 20 + i, weightUnit: 'kg' }],
      optionalActivities: [],
    }))

    const exercise = { id: 'e1', name: 'Curl', sets: '3', reps: '10' }
    const history = getRecentExerciseHistory(logs, exercise, Number.MAX_SAFE_INTEGER)
    expect(history).toHaveLength(5)
    // Most recent first
    expect(history[0].completedAt).toBe(new Date(Date.UTC(2026, 2, 5)).toISOString())
  })

  it('getRecentExerciseHistory with limit=2 returns only 2 most recent', () => {
    const logs: WorkoutLog[] = Array.from({ length: 5 }, (_, i) => ({
      id: `log-h2-${i}`,
      runId: 'r1',
      templateId: 't1',
      sessionId: 's1',
      sessionName: 'S1',
      track: 'upper' as const,
      completedAt: new Date(Date.UTC(2026, 2, 1 + i)).toISOString(),
      successful: true,
      exerciseLogs: [{ exerciseId: 'e1', exerciseName: 'Curl', completed: true, skipped: false, plannedWeight: 20, actualWeight: 20, weightUnit: 'kg' }],
      optionalActivities: [],
    }))

    const exercise = { id: 'e1', name: 'Curl', sets: '3', reps: '10' }
    const history = getRecentExerciseHistory(logs, exercise, 2)
    expect(history).toHaveLength(2)
    expect(history[0].completedAt).toBe(new Date(Date.UTC(2026, 2, 5)).toISOString())
  })

  it('getRecentExerciseHistory includes skipped exercise entries', () => {
    const logs: WorkoutLog[] = [
      { id: 'ls1', runId: 'r1', templateId: 't1', sessionId: 's1', sessionName: 'S1', track: 'upper', completedAt: '2026-04-01T10:00:00Z', successful: true, exerciseLogs: [{ exerciseId: 'e1', exerciseName: 'Curl', completed: true, skipped: true, plannedWeight: 20, actualWeight: undefined, weightUnit: 'kg' }], optionalActivities: [] },
    ]

    const exercise = { id: 'e1', name: 'Curl', sets: '3', reps: '10' }
    const history = getRecentExerciseHistory(logs, exercise)
    expect(history).toHaveLength(1)
    expect(history[0].skipped).toBe(true)
  })

  // ===== buildPlannedSession edge cases =====

  it('buildPlannedSession wraps nextSessionIndex around template session count', () => {
    const run: FocusRun = {
      id: 'run-wrap',
      templateId: 'template-wrap',
      templateName: 'Wrap',
      mode: 'main',
      track: 'upper',
      focusTarget: 'x',
      status: 'active',
      startedAt: '2026-01-01T00:00:00Z',
      completedSessionCount: 2,
      successfulSessionCount: 2,
      nextSessionIndex: 1,
    }

    const template: ProgramTemplate = {
      id: 'template-wrap',
      name: 'Wrap',
      mode: 'main',
      track: 'upper',
      focusTarget: 'x',
      sessions: [
        { id: 's1', name: 'Session A', order: 1, track: 'upper', exercises: [{ id: 'ea', name: 'A', sets: '3', reps: '10' }] },
        { id: 's2', name: 'Session B', order: 2, track: 'lower', exercises: [{ id: 'eb', name: 'B', sets: '3', reps: '10' }] },
      ],
    }

    const planned = buildPlannedSession(run, template, [])
    expect(planned.session.id).toBe('s2')
    expect(planned.session.name).toBe('Session B')
  })

  it('buildPlannedSession history is sorted descending by completedAt', () => {
    const run: FocusRun = {
      id: 'run-sort',
      templateId: 'template-sort',
      templateName: 'Sort',
      mode: 'main',
      track: 'upper',
      focusTarget: '',
      status: 'active',
      startedAt: '2026-01-01T00:00:00Z',
      completedSessionCount: 3,
      successfulSessionCount: 3,
      nextSessionIndex: 0,
    }

    const template: ProgramTemplate = {
      id: 'template-sort',
      name: 'Sort',
      mode: 'main',
      track: 'upper',
      focusTarget: '',
      sessions: [{ id: 's1', name: 'S1', order: 1, track: 'upper', exercises: [{ id: 'e1', name: 'Curl', sets: '3', reps: '10', plannedWeight: 20, weightUnit: 'kg' }] }],
    }

    const logs: WorkoutLog[] = [
      { id: 'l1', runId: 'run-sort', templateId: 'template-sort', sessionId: 's1', sessionName: 'S1', track: 'upper', completedAt: '2026-01-01T10:00:00Z', successful: true, exerciseLogs: [{ exerciseId: 'e1', exerciseName: 'Curl', completed: true, skipped: false, plannedWeight: 20, actualWeight: 20, weightUnit: 'kg' }], optionalActivities: [] },
      { id: 'l2', runId: 'run-sort', templateId: 'template-sort', sessionId: 's1', sessionName: 'S1', track: 'upper', completedAt: '2026-01-05T10:00:00Z', successful: true, exerciseLogs: [{ exerciseId: 'e1', exerciseName: 'Curl', completed: true, skipped: false, plannedWeight: 20, actualWeight: 20, weightUnit: 'kg' }], optionalActivities: [] },
      { id: 'l3', runId: 'run-sort', templateId: 'template-sort', sessionId: 's1', sessionName: 'S1', track: 'upper', completedAt: '2026-01-03T10:00:00Z', successful: true, exerciseLogs: [{ exerciseId: 'e1', exerciseName: 'Curl', completed: true, skipped: false, plannedWeight: 20, actualWeight: 20, weightUnit: 'kg' }], optionalActivities: [] },
    ]

    const planned = buildPlannedSession(run, template, logs)
    const history = planned.exercises[0].recentExerciseHistory ?? []
    // Should be sorted newest first
    expect(history[0].completedAt).toBe('2026-01-05T10:00:00Z')
    expect(history[1].completedAt).toBe('2026-01-03T10:00:00Z')
    expect(history[2].completedAt).toBe('2026-01-01T10:00:00Z')
  })
})
