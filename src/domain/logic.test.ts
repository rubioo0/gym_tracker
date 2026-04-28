import { describe, expect, it } from 'vitest'
import {
  buildPlannedSession,
  buildProgramCalendar,
  getPlannedExercise,
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

  it('uses imported planned weight as baseline when latest log planned weight is stale', () => {
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

    expect(planned.exercises[0].plannedWeight).toBe(15)
    expect(planned.exercises[0].maxPlannedWeight).toBe(30)
    expect(planned.exercises[0].maxWeightExplanation).toContain('sessions left 13 (~6.5 weeks)')
    expect(calendar.sessions[3].exercises[0].plannedWeight).toBe(15)
    expect(calendar.sessions[11].exercises[0].plannedWeight).toBe(25)
    expect(calendar.sessions[15].exercises[0].plannedWeight).toBe(30)
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

    // Session 5: sessionsSince=5-4=1, steps=floor(1/2)=0, weight=15
    const s5 = getPlannedExercise(exercise, 5, {
      latestCompletedActualWeight: 15,
      baselineAnchor: anchor,
    })
    expect(s5.plannedWeight).toBe(15)

    // Session 6: sessionsSince=6-4=2, steps=floor(2/2)=1, weight=15+5=20
    const s6 = getPlannedExercise(exercise, 6, {
      latestCompletedActualWeight: 15,
      baselineAnchor: anchor,
    })
    expect(s6.plannedWeight).toBe(20)

    // Session 7: sessionsSince=7-4=3, steps=floor(3/2)=1, weight=20
    const s7 = getPlannedExercise(exercise, 7, {
      latestCompletedActualWeight: 20,
      baselineAnchor: anchor,
    })
    expect(s7.plannedWeight).toBe(20)

    // Session 8: sessionsSince=8-4=4, steps=floor(4/2)=2, weight=15+10=25
    const s8 = getPlannedExercise(exercise, 8, {
      latestCompletedActualWeight: 20,
      baselineAnchor: anchor,
    })
    expect(s8.plannedWeight).toBe(25)
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

    // Session 3: sessionsSince=3-2=1, steps=floor(1/2)=0, weight=20
    const s3 = getPlannedExercise(exercise, 3, {
      latestCompletedActualWeight: 20,
      baselineAnchor: anchor,
    })
    expect(s3.plannedWeight).toBe(20)

    // Session 4: sessionsSince=4-2=2, steps=floor(2/2)=1, weight=20+5=25
    const s4 = getPlannedExercise(exercise, 4, {
      latestCompletedActualWeight: 20,
      baselineAnchor: anchor,
    })
    expect(s4.plannedWeight).toBe(25)

    // Session 5: sessionsSince=5-2=3, steps=floor(3/2)=1, weight=25
    const s5 = getPlannedExercise(exercise, 5, {
      latestCompletedActualWeight: 25,
      baselineAnchor: anchor,
    })
    expect(s5.plannedWeight).toBe(25)

    // Session 6: sessionsSince=6-2=4, steps=floor(4/2)=2, weight=20+10=30
    const s6 = getPlannedExercise(exercise, 6, {
      latestCompletedActualWeight: 25,
      baselineAnchor: anchor,
    })
    expect(s6.plannedWeight).toBe(30)
  })
})
