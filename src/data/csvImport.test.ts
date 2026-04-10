import { describe, expect, it } from 'vitest'
import { importProgramTemplateFromCsv } from './csvImport'

describe('csv import', () => {
  it('imports numbered rows into one template', () => {
    const csv = `meta,,,,,,,,\nheader,,,,,,,,\n1,Barbell Curl,4 sets,12,25 kg,+2.5 every 2 sessions,100,,https://example.com/curl\n2,Hammer Curl,3 sets,10,12.5 kg,+1 every 1 session,35,,https://example.com/hammer`

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
  })

  it('parses multiline quoted progression fields', () => {
    const csv = `meta,,,,,,,,\nheader,,,,,,,,\n1,Exercise One,4 sets,12,20 kg,"- hold\n+ 2.5 every 2 sessions",50,,https://example.com/x`

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
    expect(exercise.progressionRule?.maxValue).toBe(50)
  })

  it('stores GIF links as image references', () => {
    const csv = `1,Incline Treadmill Walk,3,12,-,-,-,-,https://cdn.example.com/walk.gif`

    const template = importProgramTemplateFromCsv(csv, {
      programId: 'test-gif-reference',
      programName: 'GIF Reference Import',
      mode: 'main',
      track: 'upper',
      focusTarget: 'biceps',
    })

    const exercise = template.sessions[0].exercises[0]
    expect(exercise.reference?.imageUrl).toBe('https://cdn.example.com/walk.gif')
    expect(exercise.reference?.videoUrl).toBeUndefined()
  })

  it('parses explicit progression format with week frequency', () => {
    const csv = `1,Dumbbell Curl,4 sets,12,body + 10 kg,+5kg (2.5) | 2week,50 kg,,https://example.com/curl`

    const template = importProgramTemplateFromCsv(csv, {
      programId: 'test-progression-format',
      programName: 'Progression Format Import',
      mode: 'main',
      track: 'upper',
      focusTarget: 'biceps',
    })

    const exercise = template.sessions[0].exercises[0]
    expect(exercise.progressionRule?.amount).toBe(5)
    expect(exercise.progressionRule?.frequency).toBe(2)
    expect(exercise.progressionRule?.frequencyUnit).toBe('week')
    expect(exercise.progressionRule?.note).toContain('(2.5)')
    expect(exercise.progressionRule?.maxValue).toBe(50)
  })

  it('parses supported load formats from Навантаження column', () => {
    const csv = `1,Body Move,3,12,body,+1kg | 1week,-,-,-\n2,Assisted Body,3,12,body + 7.5 kg,+2kg | 2week,-,-,-\n3,Barbell Lift,5,5,55 kg,+2kg | 1week,120 kg,-,-\n4,No Load Drill,4,10,-,-,-,-,-`

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
})
