import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { importProgramTemplateFromCsv } from './csvImport'

// Resolve the example CSV relative to the repo root regardless of CWD
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const csvPath = path.join(repoRoot, 'IMPORT_TEMPLATE_EXAMPLE.csv')

describe('Import Example CSV Template', () => {
  it('imports example CSV with all metadata', () => {
    const csvContent = fs.readFileSync(csvPath, 'utf-8')

    const template = importProgramTemplateFromCsv(csvContent, {
      programName: 'Chest Focus Program',
      mode: 'main',
      track: 'upper',
      focusTarget: 'chest',
    })

    expect(template).toBeDefined()
    expect(template.name).toBe('Chest Focus Program')
    expect(template.mode).toBe('main')
    expect(template.track).toBe('upper')
    expect(template.focusTarget).toBe('chest')
    expect(template.sessions).toHaveLength(1)
  })

  it('imports all 8 exercises from example CSV', () => {
    const csvContent = fs.readFileSync(csvPath, 'utf-8')

    const template = importProgramTemplateFromCsv(csvContent)
    const session = template.sessions[0]

    expect(session.exercises).toHaveLength(8)
    expect(session.exercises[0].name).toContain('Barbell Bench')
    expect(session.exercises[0].sets).toBe('4 підходи')
    expect(session.exercises[0].reps).toBe('8')
    expect(session.exercises[0].plannedWeight).toBe(80)

    const withProgression = session.exercises.find(ex => ex.progressionRule)
    expect(withProgression).toBeDefined()
    expect(withProgression?.progressionRule?.amount).toBeGreaterThan(0)
  })
})
