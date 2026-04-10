import { describe, expect, it } from 'vitest'
import type { PlannedExercise } from '../../domain/types'
import {
  formatPlannedWeightDetails,
  formatPlannedWeightOverview,
} from './sessionPlanUtils'

function makeExercise(overrides: Partial<PlannedExercise>): PlannedExercise {
  return {
    id: 'ex-1',
    name: 'Demo Exercise',
    sets: '3',
    reps: '10',
    ...overrides,
  }
}

describe('sessionPlanUtils planned weight formatters', () => {
  it('shows only effective load in overview for bodyweight-assisted exercises', () => {
    const exercise = makeExercise({
      isBodyweightLoad: true,
      plannedWeight: 7.5,
      weightUnit: 'kg',
      plannedLoadLabel: 'body + 7.5 kg',
    })

    expect(formatPlannedWeightOverview(exercise)).toBe('7.5 kg')
  })

  it('shows full load details for bodyweight-assisted exercises in details view', () => {
    const exercise = makeExercise({
      isBodyweightLoad: true,
      plannedWeight: 7.5,
      weightUnit: 'kg',
      plannedLoadLabel: 'body + 7.5 kg',
    })

    expect(formatPlannedWeightDetails(exercise)).toBe('body + 7.5 kg')
  })

  it('shows per-hand phrase for split hand loads', () => {
    const exercise = makeExercise({
      plannedWeight: 10,
      plannedWeightPerSide: 5,
      weightUnit: 'kg',
      plannedLoadLabel: '10 kg (5)',
    })

    expect(formatPlannedWeightOverview(exercise)).toBe('5 kg на кожну руку')
    expect(formatPlannedWeightDetails(exercise)).toBe('5 kg на кожну руку')
  })
})
