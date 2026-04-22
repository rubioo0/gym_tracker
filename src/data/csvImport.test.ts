import { describe, expect, it } from 'vitest'
import { extractCsvImportMetadata, importProgramTemplateFromCsv } from './csvImport'

describe('csv import', () => {
  it('imports numbered rows into one template', () => {
    const csv = `meta,,,,,,\nheader,,,,,,\n1,Barbell Curl,4 sets,12,25 kg,+2.5 every 2 sessions,https://example.com/curl\n2,Hammer Curl,3 sets,10,12.5 kg,+1 every 1 session,https://example.com/hammer`

    const template = importProgramTemplateFromCsv(csv, {
      programId: 'test-import',
      programName: 'Arms Import',
      mode: 'main',
      track: 'upper',
      focusTarget: 'biceps',
    })

    expect(template.id).toBe('test-import')
    expect(template.sessions.length).toBe(1)
    expect(template.sessions[0].exercises.length).toBe(2)
    expect(template.sessions[0].exercises[0].name).toBe('Barbell Curl')
    expect(template.sessions[0].exercises[0].plannedWeight).toBe(25)
    expect(template.sessions[0].exercises[0].progressionRule?.basis).toBe(
      'successfulTrackSessions',
    )
    expect(template.sessions[0].exercises[0].progressionRule?.frequency).toBe(2)
    expect(template.sessions[0].exercises[0].progressionRule?.maxValue).toBe(45)
  })

  it('parses multiline quoted progression fields', () => {
    const csv = `meta,,,,,,\nheader,,,,,,\n1,Exercise One,4 sets,12,20 kg,"- hold\n+ 2.5 every 2 sessions",https://example.com/x`

    const template = importProgramTemplateFromCsv(csv, {
      programId: 'test-multiline',
      programName: 'Multiline Import',
      mode: 'main',
      track: 'upper',
      focusTarget: 'biceps',
    })

    const exercise = template.sessions[0].exercises[0]
    expect(exercise.progressionRule?.amount).toBe(2.5)
    expect(exercise.progressionRule?.frequency).toBe(2)
    expect(exercise.progressionRule?.maxValue).toBe(40)
  })

  it('stores image links as image references', () => {
    const csv = `1,Incline Treadmill Walk,3,12,-,-,-,-,https://cdn.example.com/walk.gif`

    const template = importProgramTemplateFromCsv(csv, {
      programId: 'test-image-reference',
      programName: 'Image Reference Import',
      mode: 'main',
      track: 'upper',
      focusTarget: 'biceps',
    })

    const exercise = template.sessions[0].exercises[0]
    expect(exercise.reference?.imageUrl).toBe('https://cdn.example.com/walk.gif')
    expect(exercise.reference?.videoUrl).toBeUndefined()
  })

  it('parses explicit progression format with week frequency unit', () => {
    const csv = `1,Dumbbell Curl,4 sets,12,body + 10 kg,+5kg (2.5) | 2week,https://example.com/curl`

    const template = importProgramTemplateFromCsv(csv, {
      programId: 'test-progression-format',
      programName: 'Progression Format Import',
      mode: 'main',
      track: 'upper',
      focusTarget: 'biceps',
    })

    const exercise = template.sessions[0].exercises[0]
    expect(exercise.progressionRule?.amount).toBe(5)
    expect(exercise.progressionRule?.amountPerSide).toBe(2.5)
    expect(exercise.progressionRule?.frequency).toBe(2)
    expect(exercise.progressionRule?.frequencyUnit).toBe('week')
    expect(exercise.progressionRule?.note).toContain('(2.5)')
    expect(exercise.progressionRule?.maxValue).toBe(30)
  })

  it('parses supported load formats from Навантаження column', () => {
    const csv = `1,Body Move,3,12,body,+1kg | 1week,-\n2,Assisted Body,3,12,body + 7.5 kg,+2kg | 2week,-\n3,Barbell Lift,5,5,55 kg,+2kg | 1week,-\n4,No Load Drill,4,10,-,-,-`

    const template = importProgramTemplateFromCsv(csv, {
      programId: 'test-load-formats',
      programName: 'Load Formats Import',
      mode: 'main',
      track: 'upper',
      focusTarget: 'mixed',
    })

    const [body, bodyPlus, weighted, noLoad] = template.sessions[0].exercises

    expect(body.plannedWeight).toBeUndefined()
    expect(body.plannedLoadLabel).toBe('body')

    expect(bodyPlus.plannedWeight).toBe(7.5)
    expect(bodyPlus.weightUnit).toBe('kg')
    expect(bodyPlus.plannedLoadLabel).toBe('body + 7.5 kg')

    expect(weighted.plannedWeight).toBe(55)
    expect(weighted.weightUnit).toBe('kg')
    expect(weighted.plannedLoadLabel).toBe('55 kg')

    expect(noLoad.plannedWeight).toBeUndefined()
    expect(noLoad.plannedLoadLabel).toBeUndefined()
  })

  it('parses split two-hand base load format', () => {
    const csv = `1,Dumbbell Press,4,10,10 kg (5),+5kg (2.5) | 2week,-`

    const template = importProgramTemplateFromCsv(csv, {
      programId: 'test-two-hand-load',
      programName: 'Two Hand Load Import',
      mode: 'main',
      track: 'upper',
      focusTarget: 'chest',
    })

    const exercise = template.sessions[0].exercises[0]

    expect(exercise.plannedWeight).toBe(10)
    expect(exercise.plannedWeightPerSide).toBe(5)
    expect(exercise.weightUnit).toBe('kg')
    expect(exercise.plannedLoadLabel).toBe('10 kg (5)')
    expect(exercise.progressionRule?.amount).toBe(5)
    expect(exercise.progressionRule?.amountPerSide).toBe(2.5)
    expect(exercise.progressionRule?.maxValue).toBe(30)
  })

  it('uses fixed 8-week duration for automatic max value', () => {
    const csv = `1,Weighted Dip,3,8,10 kg,+5kg | 1week,-`

    const shortTemplate = importProgramTemplateFromCsv(csv, {
      programId: 'test-duration-4',
      programName: 'Duration 4 Import',
      mode: 'main',
      track: 'upper',
      focusTarget: 'chest',
      durationWeeks: 4,
    })

    const defaultTemplate = importProgramTemplateFromCsv(csv, {
      programId: 'test-duration-8',
      programName: 'Duration 8 Import',
      mode: 'main',
      track: 'upper',
      focusTarget: 'chest',
      durationWeeks: 8,
    })

    expect(shortTemplate.sessions[0].exercises[0].progressionRule?.maxValue).toBe(45)
    expect(defaultTemplate.sessions[0].exercises[0].progressionRule?.maxValue).toBe(45)
  })

  it('extracts export metadata for round-trip template updates', () => {
    const csv = `\uFEFFtraining-os-metadata,template-id,manual-upper-1
training-os-metadata,exported-session-id,manual-upper-1-session-1
training-os-metadata,source-file-name,Manual Upper.csv
training-os-metadata,program-name,Manual Upper
training-os-metadata,mode,maintenance
training-os-metadata,track,custom
training-os-metadata,focus-target,shoulders
training-os-metadata,duration-weeks,10
1,Barbell Curl,4 sets,12,20 kg,+2.5kg | 2session,-,-,https://example.com/curl.mp4`

    const metadata = extractCsvImportMetadata(csv)

    expect(metadata.templateId).toBe('manual-upper-1')
    expect(metadata.exportedSessionId).toBe('manual-upper-1-session-1')
    expect(metadata.sourceFileName).toBe('Manual Upper.csv')
    expect(metadata.programName).toBe('Manual Upper')
    expect(metadata.mode).toBe('maintenance')
    expect(metadata.track).toBe('custom')
    expect(metadata.focusTarget).toBe('shoulders')
    expect(metadata.durationWeeks).toBe(10)
  })
})
