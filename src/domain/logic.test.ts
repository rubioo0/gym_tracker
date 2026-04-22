import { describe, expect, it } from 'vitest'
import {
  buildPlannedSession,
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

    expect(planned.plannedWeight).toBe(25)
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
    expect(planned.nextTargetHint).toContain('1 session')
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
    expect(planned.exercises[0].plannedWeight).toBe(1)
    expect(planned.exercises[0].plannedWeightPerSide).toBeUndefined()
    expect(planned.exercises[0].plannedLoadLabel).toBe('body + 1 kg')
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
    expect(planned.exercises[0].plannedWeight).toBe(12.5)
    expect(planned.exercises[0].plannedLoadLabel).toBe('body + 12.5 lbs')
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
    expect(planned.exercises[0].plannedWeight).toBe(20)
    expect(planned.exercises[0].plannedWeightPerSide).toBe(10)
    expect(planned.exercises[0].plannedLoadLabel).toBe('20 lbs (10)')
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

    expect(planned.plannedWeight).toBe(15)
    expect(planned.plannedWeightPerSide).toBe(7.5)
    expect(planned.plannedLoadLabel).toBe('15 kg (7.5)')
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

    expect(planned.maxPlannedWeight).toBe(50)
    expect(planned.maxWeightExplanation).toContain('sessions done 2, sessions left 14')
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

    expect(planned.plannedWeight).toBe(12.5)
    expect(planned.maxPlannedWeight).toBe(25)
    expect(planned.maxWeightExplanation).toContain('sessions done 2, sessions left 14')
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
})
