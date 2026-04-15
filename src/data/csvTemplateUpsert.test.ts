import { describe, expect, it } from 'vitest'
import { upsertProgramTemplateFromCsv } from './csvTemplateUpsert'

const BASE_CSV = `1,Barbell Curl,4 sets,12,25 kg,+2.5 every 2 sessions,https://example.com/curl
2,Hammer Curl,3 sets,10,12.5 kg,+1 every 1 session,https://example.com/hammer
3,Reverse Curl,3 sets,12,10 kg,+1 every 2 sessions,https://example.com/reverse`

const UPDATED_CSV = `1,Barbell Curl,4 sets,12,27.5 kg,+2.5 every 2 sessions,https://example.com/curl
2,Reverse Curl,3 sets,10,12 kg,+1 every 1 session,https://example.com/reverse
4,Preacher Curl,3 sets,12,14 kg,+1 every 2 sessions,https://example.com/preacher`

describe('csv template upsert', () => {
  it('creates a template when source filename is new', () => {
    const result = upsertProgramTemplateFromCsv({
      templates: [],
      csvText: BASE_CSV,
      fileName: 'Book 2.csv',
      programName: 'Book 2',
      mode: 'main',
      track: 'upper',
      focusTarget: 'biceps',
      durationWeeks: 8,
    })

    expect(result.operation).toBe('created')
    expect(result.nextTemplates).toHaveLength(1)
    expect(result.template.sessions[0].exercises).toHaveLength(3)
    expect(result.diff.addedExercises).toBe(3)
    expect(result.diff.preservedExerciseIds).toBe(0)
  })

  it('updates existing template by filename and preserves matched exercise IDs', () => {
    const created = upsertProgramTemplateFromCsv({
      templates: [],
      csvText: BASE_CSV,
      fileName: 'Book 2.csv',
      programName: 'Book 2',
      mode: 'main',
      track: 'upper',
      focusTarget: 'biceps',
      durationWeeks: 8,
    })

    const existingTemplate = created.template
    const existingExerciseIdByName = new Map(
      existingTemplate.sessions[0].exercises.map((exercise) => [exercise.name, exercise.id]),
    )

    const updated = upsertProgramTemplateFromCsv({
      templates: created.nextTemplates,
      csvText: UPDATED_CSV,
      fileName: 'Book 2.csv',
      programName: 'Book 2 Updated',
      mode: 'main',
      track: 'upper',
      focusTarget: 'biceps',
      durationWeeks: 8,
    })

    expect(updated.operation).toBe('updated')
    expect(updated.nextTemplates).toHaveLength(1)
    expect(updated.template.id).toBe(existingTemplate.id)

    const updatedExerciseIdByName = new Map(
      updated.template.sessions[0].exercises.map((exercise) => [exercise.name, exercise.id]),
    )

    expect(updatedExerciseIdByName.get('Barbell Curl')).toBe(
      existingExerciseIdByName.get('Barbell Curl'),
    )
    expect(updatedExerciseIdByName.get('Reverse Curl')).toBe(
      existingExerciseIdByName.get('Reverse Curl'),
    )
    expect(updatedExerciseIdByName.get('Preacher Curl')).toBe(
      `${existingTemplate.id}-ex-4`,
    )

    expect(updated.diff.preservedExerciseIds).toBe(2)
    expect(updated.diff.addedExercises).toBe(1)
    expect(updated.diff.removedExercises).toBe(1)
    expect(updated.diff.updatedExercises).toBe(2)
  })
})