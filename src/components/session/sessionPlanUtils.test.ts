import { describe, expect, it } from 'vitest'
import type { PlannedExercise } from '../../domain/types'
import {
  formatExerciseHistoryEntry,
  formatPlannedMaxWeightOverview,
  formatPlannedWeightDetails,
  formatPlannedWeightOverview,
  formatProgressionCycle,
  formatProgressionSource,
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

    expect(formatPlannedWeightOverview(exercise)).toBe('7.5 kg')
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

    expect(formatPlannedWeightOverview(exercise)).toBe('5 kg на кожну руку')
    expect(formatPlannedWeightDetails(exercise)).toBe(
      '11.0 lbs (5.0 kg) на кожну руку (total: 22.0 lbs (10.0 kg))',
    )
  })

  it('keeps bodyweight format even if per-side value exists accidentally', () => {
    const exercise = makeExercise({
      isBodyweightLoad: true,
      plannedWeight: 1,
      plannedWeightPerSide: 0.5,
      weightUnit: 'kg',
      plannedLoadLabel: 'body + 1 kg',
    })

    expect(formatPlannedWeightOverview(exercise)).toBe('1 kg')
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

  it('rounds lbs overview values to one decimal place', () => {
    const exercise = makeExercise({
      plannedWeight: 44.1,
      plannedWeightPerSide: 22.05,
      weightUnit: 'lbs',
      plannedLoadLabel: '44.1 lbs (22.05)',
    })

    expect(formatPlannedWeightOverview(exercise)).toBe('22.1 lbs на кожну руку')
    expect(formatPlannedWeightDetails(exercise)).toBe(
      '22.1 lbs (10.0 kg) на кожну руку (total: 44.1 lbs (20.0 kg))',
    )
  })

  it('formats max overview from max planned fields', () => {
    const exercise = makeExercise({
      maxPlannedWeight: 95,
      weightUnit: 'lbs',
    })

    expect(formatPlannedMaxWeightOverview(exercise)).toBe('95 lbs')
  })

  it('keeps fallback labels in original units for overview', () => {
    const exercise = makeExercise({
      plannedLoadLabel: 'body + 7.5 kg',
    })

    expect(formatPlannedWeightOverview(exercise)).toBe('body + 7.5 kg')
    expect(formatPlannedWeightDetails(exercise)).toBe('body + 7.5 kg')
  })

  it('prefers effective progressed weights over base values', () => {
    const exercise = makeExercise({
      plannedWeight: 30,
      basePlannedWeight: 20,
      plannedWeightPerSide: 15,
      basePlannedWeightPerSide: 10,
      weightUnit: 'kg',
    })

    expect(formatPlannedWeightOverview(exercise)).toBe('15 kg на кожну руку')
    expect(formatPlannedWeightDetails(exercise)).toBe(
      '33.1 lbs (15.0 kg) на кожну руку (total: 66.1 lbs (30.0 kg))',
    )
  })

  it('formats progression cycle and source labels', () => {
    const exercise = makeExercise({
      progressionValueSource: 'baselineAnchor',
      progressionCycleStatus: {
        basis: 'successfulTrackSessions',
        effectiveFrequencySessions: 2,
        sessionsSinceAnchor: 5,
        completedInCurrentValueWindow: 2,
        plannedWindowSize: 2,
        displayNumerator: 2,
        displayDenominator: 4,
        isHeldBeyondPlannedWindow: true,
      },
    })

    expect(formatProgressionCycle(exercise)).toBe('2/4 (held)')
    expect(formatProgressionSource(exercise)).toBe('anchored progression')
  })

  it('formats short history entry labels', () => {
    const label = formatExerciseHistoryEntry({
      completedAt: '2026-04-09T08:00:00.000Z',
      actualWeight: 17,
      plannedWeight: 17,
      weightUnit: 'lbs',
      successful: true,
      skipped: false,
    })
    expect(label).toContain('17 lbs')
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
