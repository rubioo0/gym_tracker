import { describe, expect, it } from 'vitest'
import type { PlannedExercise } from '../../domain/types'
import {
  formatPlannedWeightDetails,
  formatPlannedWeightOverview,
  getEmbeddableVideoUrl,
  isDirectPlayableVideoUrl,
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

    expect(formatPlannedWeightOverview(exercise)).toBe('16.53 lbs')
  })

  it('shows full load details for bodyweight-assisted exercises in details view', () => {
    const exercise = makeExercise({
      isBodyweightLoad: true,
      plannedWeight: 7.5,
      weightUnit: 'kg',
      plannedLoadLabel: 'body + 7.5 kg',
    })

    expect(formatPlannedWeightDetails(exercise)).toBe('body + 16.5 lbs (7.5 kg)')
  })

  it('shows per-hand phrase for split hand loads', () => {
    const exercise = makeExercise({
      plannedWeight: 10,
      plannedWeightPerSide: 5,
      weightUnit: 'kg',
      plannedLoadLabel: '10 kg (5)',
    })

    expect(formatPlannedWeightOverview(exercise)).toBe('11.02 lbs на кожну руку')
    expect(formatPlannedWeightDetails(exercise)).toBe('11.0 lbs (5.0 kg) на кожну руку')
  })

  it('keeps bodyweight format even if per-side value exists accidentally', () => {
    const exercise = makeExercise({
      isBodyweightLoad: true,
      plannedWeight: 1,
      plannedWeightPerSide: 0.5,
      weightUnit: 'kg',
      plannedLoadLabel: 'body + 1 kg',
    })

    expect(formatPlannedWeightOverview(exercise)).toBe('2.2 lbs')
    expect(formatPlannedWeightDetails(exercise)).toBe('body + 2.2 lbs (1.0 kg)')
  })

  it('keeps lbs as primary and adds converted kg in details view', () => {
    const exercise = makeExercise({
      plannedWeight: 45,
      weightUnit: 'lbs',
      plannedLoadLabel: '45 lbs',
    })

    expect(formatPlannedWeightOverview(exercise)).toBe('45 lbs')
    expect(formatPlannedWeightDetails(exercise)).toBe('45.0 lbs (20.4 kg)')
  })
})

describe('sessionPlanUtils video helpers', () => {
  it('converts YouTube watch URLs into embed URLs', () => {
    expect(getEmbeddableVideoUrl('https://www.youtube.com/watch?v=abc123XYZ')).toBe(
      'https://www.youtube.com/embed/abc123XYZ',
    )
  })

  it('converts Vimeo URLs into embed URLs', () => {
    expect(getEmbeddableVideoUrl('https://vimeo.com/123456789')).toBe(
      'https://player.vimeo.com/video/123456789',
    )
  })

  it('does not treat direct mp4 links as embeddable iframe URLs', () => {
    expect(getEmbeddableVideoUrl('https://cdn.example.com/demo/exercise.mp4')).toBeUndefined()
  })

  it('detects direct playable video files with query params', () => {
    expect(
      isDirectPlayableVideoUrl('https://cdn.example.com/demo/exercise.webm?token=abc123'),
    ).toBe(true)
  })

  it('rejects non-video pages and invalid URLs for direct playback', () => {
    expect(isDirectPlayableVideoUrl('https://www.youtube.com/watch?v=abc123XYZ')).toBe(false)
    expect(isDirectPlayableVideoUrl('not-a-url')).toBe(false)
  })
})
