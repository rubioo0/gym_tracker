import Papa from 'papaparse'
import { describe, expect, it } from 'vitest'
import type { ProgramTemplate } from '../domain/types'
import { exportProgramTemplateToCsv } from './csvExport'

function makeTemplate(): ProgramTemplate {
  return {
    id: 'manual-upper-1',
    name: 'Manual Upper',
    mode: 'main',
    track: 'upper',
    focusTarget: 'biceps',
    sessions: [
      {
        id: 'manual-upper-1-session-1',
        name: 'Upper A',
        order: 1,
        track: 'upper',
        exercises: [
          {
            id: 'manual-upper-1-ex-1',
            name: 'Barbell Curl',
            sets: '4 sets',
            reps: '12',
            plannedWeight: 20,
            weightUnit: 'kg',
            progressionRule: {
              type: 'weight',
              amount: 2.5,
              frequency: 2,
              frequencyUnit: 'session',
              basis: 'successfulTrackSessions',
              maxValue: 35,
            },
            reference: {
              videoUrl: 'https://example.com/curl.mp4',
            },
          },
        ],
      },
      {
        id: 'manual-upper-1-session-2',
        name: 'Upper B',
        order: 2,
        track: 'upper',
        exercises: [
          {
            id: 'manual-upper-1-ex-2',
            name: 'Hammer Curl',
            sets: '3 sets',
            reps: '10',
          },
        ],
      },
    ],
  }
}

describe('csv export', () => {
  it('exports metadata and first session rows in import-compatible CSV format', () => {
    const template = makeTemplate()
    const result = exportProgramTemplateToCsv(template)
    const parsed = Papa.parse<string[]>(result.csvText, {
      header: false,
      skipEmptyLines: true,
    })

    expect(result.fileName).toBe('Manual Upper.csv')
    expect(result.exportedExerciseCount).toBe(1)
    expect(result.skippedSessionCount).toBe(1)

    expect(parsed.data[0]).toEqual(['training-os-metadata', 'export-version', '1'])
    expect(parsed.data[1]).toEqual(['training-os-metadata', 'template-id', 'manual-upper-1'])
    expect(parsed.data[2]).toEqual([
      'training-os-metadata',
      'exported-session-id',
      'manual-upper-1-session-1',
    ])

    const firstExerciseRow = parsed.data.find((row) => row[0] === '1')
    expect(firstExerciseRow).toBeDefined()
    expect(firstExerciseRow?.[1]).toBe('Barbell Curl')
    expect(firstExerciseRow?.[4]).toBe('20 kg')
    expect(firstExerciseRow?.[8]).toBe('https://example.com/curl.mp4')

    expect(result.csvText).not.toContain('Hammer Curl')
  })

  it('reuses CSV source note as download file name when available', () => {
    const template = makeTemplate()
    template.note = 'CSV import source: Book 2(РУКИ (2)).csv'

    const result = exportProgramTemplateToCsv(template)

    expect(result.fileName).toBe('Book 2(РУКИ (2)).csv')
  })
})
