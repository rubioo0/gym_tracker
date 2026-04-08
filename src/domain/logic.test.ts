import { describe, expect, it } from 'vitest'
import {
  getPlannedExercise,
  getSuggestedTrack,
  getSessionByIndex,
} from './logic'
import type { FocusRun, ProgramTemplate } from './types'

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
