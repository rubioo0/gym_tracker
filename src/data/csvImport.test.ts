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
})
