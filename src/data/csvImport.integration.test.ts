import { test, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { importProgramTemplateFromCsv } from './csvImport'

// This file is a local user CSV that is not committed to the repo.
// The test is skipped automatically when the file does not exist (e.g. in CI).
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const csvPath = path.join(repoRoot, 'Book 2(РУКИ (2)).csv')
const fileExists = fs.existsSync(csvPath)

test.skipIf(!fileExists)('imports Book 2 CSV correctly', () => {
  const csvContent = fs.readFileSync(csvPath, 'utf-8')

  const template = importProgramTemplateFromCsv(csvContent, {
    programName: 'Book 2 - Upper',
    mode: 'main',
    track: 'upper',
    focusTarget: 'biceps',
  })

  // Verify template structure
  expect(template.name).toBe('Book 2 - Upper')
  expect(template.mode).toBe('main')
  expect(template.track).toBe('upper')
  expect(template.focusTarget).toBe('biceps')

  // Verify sessions
  expect(template.sessions).toHaveLength(1)
  const session = template.sessions[0]
  expect(session).toBeDefined()

  // Verify exercises
  expect(session.exercises).toHaveLength(14)

  // Verify first exercise
  const ex1 = session.exercises[0]
  expect(ex1.name).toBeTruthy()
  expect(ex1.sets).toBe('5 підходів')
  expect(ex1.reps).toBe('1')

  // Verify exercise with progression
  const exWithProg = session.exercises.find(ex => ex.progressionRule)
  expect(exWithProg).toBeDefined()
  expect(exWithProg?.progressionRule?.amount).toBeGreaterThan(0)
  expect(exWithProg?.progressionRule?.frequency).toBeGreaterThan(0)
  expect(exWithProg?.progressionRule?.basis).toBe('successfulTrackSessions')
})
