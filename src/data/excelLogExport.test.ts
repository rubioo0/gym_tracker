import { describe, expect, it } from 'vitest'
import { exportWorkoutLogsToExcel } from './excelLogExport'
import { importWorkoutLogsFromExcel } from './excelLogImport'
import type { WorkoutLog } from '../domain/types'

function makeLog(overrides: Partial<WorkoutLog> = {}): WorkoutLog {
  return {
    id: 'log-1',
    runId: 'run-1',
    templateId: 'template-1',
    sessionId: 'session-1',
    sessionName: 'Upper A',
    track: 'upper',
    completedAt: '2026-04-20T10:00:00.000Z',
    successful: true,
    exerciseLogs: [
      {
        exerciseId: 'ex-1',
        exerciseName: 'Bench Press',
        completed: true,
        skipped: false,
        plannedWeight: 60,
        actualWeight: 62.5,
        weightUnit: 'kg',
        difficulty: 'okay',
        note: 'felt good',
      },
      {
        exerciseId: 'ex-2',
        exerciseName: 'Pull Up',
        completed: true,
        skipped: false,
        plannedWeight: undefined,
        actualWeight: undefined,
        weightUnit: undefined,
        difficulty: 'hard',
      },
    ],
    optionalActivities: [],
    sessionNote: 'Great session',
    ...overrides,
  }
}

describe('Excel log export/import roundtrip', () => {
  it('roundtrips a single workout log', () => {
    const original = [makeLog()]
    const buffer = exportWorkoutLogsToExcel(original)
    const imported = importWorkoutLogsFromExcel(buffer)

    expect(imported).not.toBeNull()
    expect(imported).toHaveLength(1)

    const log = imported![0]
    expect(log.id).toBe('log-1')
    expect(log.runId).toBe('run-1')
    expect(log.templateId).toBe('template-1')
    expect(log.sessionId).toBe('session-1')
    expect(log.sessionName).toBe('Upper A')
    expect(log.track).toBe('upper')
    expect(log.completedAt).toBe('2026-04-20T10:00:00.000Z')
    expect(log.successful).toBe(true)
    expect(log.sessionNote).toBe('Great session')

    expect(log.exerciseLogs).toHaveLength(2)

    const ex1 = log.exerciseLogs[0]
    expect(ex1.exerciseId).toBe('ex-1')
    expect(ex1.exerciseName).toBe('Bench Press')
    expect(ex1.completed).toBe(true)
    expect(ex1.skipped).toBe(false)
    expect(ex1.plannedWeight).toBe(60)
    expect(ex1.actualWeight).toBe(62.5)
    expect(ex1.weightUnit).toBe('kg')
    expect(ex1.difficulty).toBe('okay')
    expect(ex1.note).toBe('felt good')

    const ex2 = log.exerciseLogs[1]
    expect(ex2.exerciseId).toBe('ex-2')
    expect(ex2.exerciseName).toBe('Pull Up')
    expect(ex2.completed).toBe(true)
    expect(ex2.skipped).toBe(false)
    expect(ex2.plannedWeight).toBeUndefined()
    expect(ex2.actualWeight).toBeUndefined()
    expect(ex2.difficulty).toBe('hard')
  })

  it('roundtrips multiple workout logs', () => {
    const original = [
      makeLog({ id: 'log-1', sessionName: 'Upper A' }),
      makeLog({
        id: 'log-2',
        runId: 'run-2',
        sessionName: 'Lower B',
        track: 'lower',
        successful: false,
        sessionNote: undefined,
      }),
    ]

    const buffer = exportWorkoutLogsToExcel(original)
    const imported = importWorkoutLogsFromExcel(buffer)

    expect(imported).not.toBeNull()
    expect(imported).toHaveLength(2)
    expect(imported![0].id).toBe('log-1')
    expect(imported![0].sessionName).toBe('Upper A')
    expect(imported![1].id).toBe('log-2')
    expect(imported![1].sessionName).toBe('Lower B')
    expect(imported![1].track).toBe('lower')
    expect(imported![1].successful).toBe(false)
    expect(imported![1].sessionNote).toBeUndefined()
  })

  it('roundtrips a log with no exercises', () => {
    const original = [
      makeLog({
        id: 'log-empty',
        exerciseLogs: [],
      }),
    ]

    const buffer = exportWorkoutLogsToExcel(original)
    const imported = importWorkoutLogsFromExcel(buffer)

    expect(imported).not.toBeNull()
    expect(imported).toHaveLength(1)
    expect(imported![0].id).toBe('log-empty')
    expect(imported![0].exerciseLogs).toHaveLength(0)
  })

  it('returns null for empty buffer', () => {
    const emptyBuffer = new ArrayBuffer(0)
    const result = importWorkoutLogsFromExcel(emptyBuffer)
    expect(result).toBeNull()
  })

  it('returns null for invalid data', () => {
    const garbage = new TextEncoder().encode('not an excel file')
    const result = importWorkoutLogsFromExcel(garbage.buffer)
    expect(result).toBeNull()
  })

  it('preserves skipped exercise state', () => {
    const original = [
      makeLog({
        exerciseLogs: [
          {
            exerciseId: 'ex-skip',
            exerciseName: 'Skipped Exercise',
            completed: false,
            skipped: true,
            plannedWeight: 40,
            actualWeight: undefined,
            weightUnit: 'kg',
          },
        ],
      }),
    ]

    const buffer = exportWorkoutLogsToExcel(original)
    const imported = importWorkoutLogsFromExcel(buffer)

    expect(imported).not.toBeNull()
    const ex = imported![0].exerciseLogs[0]
    expect(ex.completed).toBe(false)
    expect(ex.skipped).toBe(true)
    expect(ex.actualWeight).toBeUndefined()
  })
})
