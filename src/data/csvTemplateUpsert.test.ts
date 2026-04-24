import { describe, expect, it } from 'vitest'
import { upsertProgramTemplateFromCsv } from './csvTemplateUpsert'
import { exportProgramTemplateToCsv } from './csvExport'
import type { ProgramTemplate } from '../domain/types'

const BASE_CSV = `1,Barbell Curl,4 sets,12,25 kg,+2.5 every 2 sessions,https://example.com/curl
2,Hammer Curl,3 sets,10,12.5 kg,+1 every 1 session,https://example.com/hammer
3,Reverse Curl,3 sets,12,10 kg,+1 every 2 sessions,https://example.com/reverse`

const UPDATED_CSV = `1,Barbell Curl,4 sets,12,27.5 kg,+2.5 every 2 sessions,https://example.com/curl
2,Reverse Curl,3 sets,10,12 kg,+1 every 1 session,https://example.com/reverse
4,Preacher Curl,3 sets,12,14 kg,+1 every 2 sessions,https://example.com/preacher`

const RENAMED_BY_NUMBER_CSV = `1,EZ Bar Curl,4 sets,12,25 kg,+2.5 every 2 sessions,https://example.com/curl
2,Hammer Curl,3 sets,10,12.5 kg,+1 every 1 session,https://example.com/hammer
3,Reverse Curl,3 sets,12,10 kg,+1 every 2 sessions,https://example.com/reverse`

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

    expect(result.status).toBe('success')
    if (result.status !== 'success') {
      throw new Error('Expected success result')
    }

    expect(result.operation).toBe('created')
    expect(result.nextTemplates).toHaveLength(1)
    expect(result.template.sessions[0].exercises).toHaveLength(3)
    expect(result.diff.addedExercises).toBe(3)
    expect(result.diff.preservedExerciseIds).toBe(0)
    expect(result.diff.preservedSessions).toBe(0)
    expect(result.warnings).toEqual([])
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

    if (created.status !== 'success') {
      throw new Error('Expected success result')
    }

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

    expect(updated.status).toBe('success')
    if (updated.status !== 'success') {
      throw new Error('Expected success result')
    }

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
    expect(updated.diff.preservedSessions).toBe(0)
  })

  it('preserves non-imported sessions when updating multi-session templates', () => {
    const multiSessionTemplate: ProgramTemplate = {
      id: 'manual-upper-1',
      name: 'Manual Upper',
      mode: 'main',
      track: 'upper',
      focusTarget: 'biceps',
      note: 'CSV import source: Book 2.csv',
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
              id: 'manual-upper-1-ex-99',
              name: 'Face Pull',
              sets: '3 sets',
              reps: '15',
            },
          ],
        },
      ],
    }

    const updated = upsertProgramTemplateFromCsv({
      templates: [multiSessionTemplate],
      csvText: BASE_CSV,
      fileName: 'Book 2.csv',
    })

    expect(updated.status).toBe('success')
    if (updated.status !== 'success') {
      throw new Error('Expected success result')
    }

    expect(updated.operation).toBe('updated')
    expect(updated.template.sessions).toHaveLength(2)
    expect(updated.template.sessions[1].id).toBe('manual-upper-1-session-2')
    expect(updated.template.sessions[1].exercises[0].id).toBe('manual-upper-1-ex-99')
    expect(updated.diff.preservedSessions).toBe(1)
    expect(updated.warnings[0]).toContain('exported session metadata')
  })

  it('updates existing template by exported template id metadata even if file name changes', () => {
    const manualTemplate: ProgramTemplate = {
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
            },
          ],
        },
      ],
    }

    const exported = exportProgramTemplateToCsv(manualTemplate)
    const updatedCsv = exported.csvText.replace('20 kg', '22 kg')

    const updated = upsertProgramTemplateFromCsv({
      templates: [manualTemplate],
      csvText: updatedCsv,
      fileName: 'renamed-manual-upper.csv',
    })

    expect(updated.status).toBe('success')
    if (updated.status !== 'success') {
      throw new Error('Expected success result')
    }

    expect(updated.operation).toBe('updated')
    expect(updated.template.id).toBe(manualTemplate.id)
    expect(updated.template.sessions[0].exercises[0].id).toBe('manual-upper-1-ex-1')
    expect(updated.template.sessions[0].exercises[0].plannedWeight).toBe(22)
    expect(updated.diff.preservedExerciseIds).toBe(1)
    expect(updated.diff.updatedExercises).toBe(1)
  })

  it('preserves exercise id when name changes but exercise number is stable', () => {
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

    if (created.status !== 'success') {
      throw new Error('Expected success result')
    }

    const firstExerciseId = created.template.sessions[0].exercises[0].id

    const updated = upsertProgramTemplateFromCsv({
      templates: created.nextTemplates,
      csvText: RENAMED_BY_NUMBER_CSV,
      fileName: 'Book 2.csv',
    })

    expect(updated.status).toBe('success')
    if (updated.status !== 'success') {
      throw new Error('Expected success result')
    }

    const renamedExercise = updated.template.sessions[0].exercises.find(
      (exercise) => exercise.name === 'EZ Bar Curl',
    )

    expect(renamedExercise?.id).toBe(firstExerciseId)
    expect(updated.diff.preservedExerciseIds).toBe(3)
    expect(updated.diff.addedExercises).toBe(0)
    expect(updated.diff.removedExercises).toBe(0)
    expect(updated.diff.updatedExercises).toBe(1)
  })

  it('hard overwrite replaces target session exercises and keeps history-compatible sessions', () => {
    const existingTemplate: ProgramTemplate = {
      id: 'manual-upper-1',
      name: 'Manual Upper',
      mode: 'main',
      track: 'upper',
      focusTarget: 'biceps',
      note: 'CSV import source: Book 2.csv',
      sessions: [
        {
          id: 'manual-upper-1-session-1',
          name: 'Upper A',
          order: 1,
          track: 'upper',
          exercises: [
            {
              id: 'manual-upper-1-ex-legacy',
              name: 'Legacy Curl',
              sets: '4 sets',
              reps: '12',
              plannedWeight: 20,
              weightUnit: 'kg',
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
              id: 'manual-upper-1-ex-99',
              name: 'Face Pull',
              sets: '3 sets',
              reps: '15',
            },
          ],
        },
      ],
    }

    const result = upsertProgramTemplateFromCsv({
      templates: [existingTemplate],
      csvText: BASE_CSV,
      fileName: 'Book 2.csv',
      hardOverwrite: true,
    })

    expect(result.status).toBe('success')
    if (result.status !== 'success') {
      throw new Error('Expected success result')
    }

    expect(result.operation).toBe('updated')
    expect(result.template.sessions).toHaveLength(2)
    expect(result.template.sessions[1].id).toBe('manual-upper-1-session-2')
    expect(result.template.sessions[0].exercises).toHaveLength(3)
    expect(result.template.sessions[0].exercises[0].id).toBe('manual-upper-1-ex-1')
    expect(result.template.sessions[0].exercises[1].id).toBe('manual-upper-1-ex-2')
    expect(result.diff.preservedExerciseIds).toBe(0)
    expect(result.diff.addedExercises).toBe(3)
    expect(result.diff.removedExercises).toBe(1)
    expect(result.diff.updatedExercises).toBe(3)
    expect(result.warnings.some((warning) => warning.includes('Hard overwrite mode'))).toBe(
      true,
    )
  })

  it('preserves existing program identity when updating an imported template', () => {
    const existingTemplate: ProgramTemplate = {
      id: 'manual-lower-1',
      name: 'Manual Lower',
      mode: 'maintenance',
      track: 'lower',
      focusTarget: 'legs',
      note: 'CSV import source: Book 2.csv',
      sessions: [
        {
          id: 'manual-lower-1-session-1',
          name: 'Lower A',
          order: 1,
          track: 'lower',
          exercises: [
            {
              id: 'manual-lower-1-ex-1',
              name: 'Squat',
              sets: '4 sets',
              reps: '8',
              plannedWeight: 80,
              weightUnit: 'kg',
            },
          ],
        },
      ],
    }

    const result = upsertProgramTemplateFromCsv({
      templates: [existingTemplate],
      csvText: BASE_CSV,
      fileName: 'Book 2.csv',
      programName: 'Updated Hands',
      mode: 'main',
      track: 'upper',
      focusTarget: 'arms',
      durationWeeks: 8,
      hardOverwrite: true,
    })

    expect(result.status).toBe('success')
    if (result.status !== 'success') {
      throw new Error('Expected success result')
    }

    expect(result.operation).toBe('updated')
    expect(result.template.id).toBe(existingTemplate.id)
    expect(result.template.mode).toBe('maintenance')
    expect(result.template.track).toBe('lower')
    expect(result.template.focusTarget).toBe('legs')
    expect(result.template.name).toBe('Manual Lower')
  })

  it('returns conflict when template-id and source-file-name resolve to different templates', () => {
    const templateById: ProgramTemplate = {
      id: 'template-a',
      name: 'Template A',
      mode: 'main',
      track: 'upper',
      focusTarget: 'arms',
      note: 'CSV import source: A.csv',
      sessions: [
        {
          id: 'template-a-session-1',
          name: 'A',
          order: 1,
          track: 'upper',
          exercises: [],
        },
      ],
    }

    const templateByFileName: ProgramTemplate = {
      id: 'template-b',
      name: 'Template B',
      mode: 'main',
      track: 'upper',
      focusTarget: 'arms',
      note: 'CSV import source: B.csv',
      sessions: [
        {
          id: 'template-b-session-1',
          name: 'B',
          order: 1,
          track: 'upper',
          exercises: [],
        },
      ],
    }

    const conflictCsv = `training-os-metadata,template-id,template-a
training-os-metadata,source-file-name,B.csv
1,Barbell Curl,4 sets,12,25 kg,+2.5 every 2 sessions,https://example.com/curl`

    const result = upsertProgramTemplateFromCsv({
      templates: [templateById, templateByFileName],
      csvText: conflictCsv,
      fileName: 'uploaded.csv',
    })

    expect(result.status).toBe('conflict')
    if (result.status !== 'conflict') {
      throw new Error('Expected conflict result')
    }

    expect(result.reason).toBe('template-identity-mismatch')
    expect(result.details.resolvedTemplateIdByTemplateId).toBe('template-a')
    expect(result.details.resolvedTemplateIdBySourceFileName).toBe('template-b')
  })

  it('returns conflict when source file name matches multiple templates without enough identity metadata', () => {
    const upperTemplate: ProgramTemplate = {
      id: 'template-upper',
      name: 'Upper Arms',
      mode: 'main',
      track: 'upper',
      focusTarget: 'arms',
      note: 'CSV import source: Shared.csv',
      sessions: [
        {
          id: 'template-upper-session-1',
          name: 'Upper',
          order: 1,
          track: 'upper',
          exercises: [],
        },
      ],
    }

    const lowerTemplate: ProgramTemplate = {
      id: 'template-lower',
      name: 'Lower Legs',
      mode: 'main',
      track: 'lower',
      focusTarget: 'legs',
      note: 'CSV import source: Shared.csv',
      sessions: [
        {
          id: 'template-lower-session-1',
          name: 'Lower',
          order: 1,
          track: 'lower',
          exercises: [],
        },
      ],
    }

    const result = upsertProgramTemplateFromCsv({
      templates: [upperTemplate, lowerTemplate],
      csvText: BASE_CSV,
      fileName: 'Shared.csv',
    })

    expect(result.status).toBe('conflict')
    if (result.status !== 'conflict') {
      throw new Error('Expected conflict result')
    }

    expect(result.reason).toBe('ambiguous-source-file-name')
    expect(result.details.resolvedTemplateIdBySourceFileName).toContain('template-upper')
    expect(result.details.resolvedTemplateIdBySourceFileName).toContain('template-lower')
  })

  it('is idempotent when importing the same CSV update repeatedly', () => {
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

    if (created.status !== 'success') {
      throw new Error('Expected success result')
    }

    const firstUpdate = upsertProgramTemplateFromCsv({
      templates: created.nextTemplates,
      csvText: BASE_CSV,
      fileName: 'Book 2.csv',
    })

    expect(firstUpdate.status).toBe('success')
    if (firstUpdate.status !== 'success') {
      throw new Error('Expected success result')
    }

    expect(firstUpdate.operation).toBe('updated')
    expect(firstUpdate.diff.preservedExerciseIds).toBe(3)
    expect(firstUpdate.diff.addedExercises).toBe(0)
    expect(firstUpdate.diff.removedExercises).toBe(0)
    expect(firstUpdate.diff.updatedExercises).toBe(0)
  })
})
