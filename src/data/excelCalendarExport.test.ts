import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { exportProgramCalendarToExcel } from './excelCalendarExport'
import type { ProgramCalendar } from '../domain/types'

const sampleCalendar: ProgramCalendar = {
  runId: 'run-1',
  templateId: 'template-1',
  startDate: '2026-04-01T00:00:00.000Z',
  estimatedEndDate: '2026-05-01T00:00:00.000Z',
  avgDaysBetweenSessions: 3.5,
  sessions: [
    {
      sessionIndex: 0,
      sessionId: 'session-1',
      sessionName: 'Upper A',
      track: 'upper',
      loggedDate: '2026-04-01T00:00:00.000Z',
      projectedDate: undefined,
      exercises: [
        {
          id: 'ex-1',
          name: 'Bench Press',
          sets: '3',
          reps: '8',
          plannedWeight: 60,
          plannedWeightPerSide: undefined,
          weightUnit: 'kg',
          actualWeight: 62.5,
          completed: true,
          skipped: false,
        },
      ],
      isCompleted: true,
    },
    {
      sessionIndex: 1,
      sessionId: 'session-2',
      sessionName: 'Upper B',
      track: 'upper',
      loggedDate: undefined,
      projectedDate: '2026-04-04T00:00:00.000Z',
      exercises: [
        {
          id: 'ex-2',
          name: 'Row',
          sets: '3',
          reps: '10',
          plannedWeight: 50,
          plannedWeightPerSide: 25,
          weightUnit: 'kg',
          actualWeight: undefined,
          completed: false,
          skipped: false,
        },
      ],
      isCompleted: false,
    },
  ],
}

describe('Excel calendar export', () => {
  it('writes calendar rows with expected headers', () => {
    const buffer = exportProgramCalendarToExcel(sampleCalendar)
    const workbook = XLSX.read(buffer, { type: 'array' })
    const sheetName = workbook.SheetNames[0]
    expect(sheetName).toBeTruthy()

    const worksheet = workbook.Sheets[sheetName!]
    expect(worksheet).toBeTruthy()

    const matrix = XLSX.utils.sheet_to_json<(string | number | boolean)[]>(
      worksheet,
      { header: 1, defval: '' },
    )

    const header = matrix[0] as string[]
    expect(header).toEqual([
      'runId',
      'templateId',
      'startDate',
      'estimatedEndDate',
      'avgDaysBetweenSessions',
      'sessionIndex',
      'sessionNumber',
      'sessionId',
      'sessionName',
      'sessionTrack',
      'sessionIsCompleted',
      'sessionLoggedDate',
      'sessionProjectedDate',
      'exerciseId',
      'exerciseName',
      'sets',
      'reps',
      'plannedWeight',
      'plannedWeightPerSide',
      'weightUnit',
      'actualWeight',
      'exerciseCompleted',
      'exerciseSkipped',
    ])

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      defval: '',
    })

    expect(rows).toHaveLength(2)

    const first = rows[0]
    expect(first.runId).toBe('run-1')
    expect(first.templateId).toBe('template-1')
    expect(first.startDate).toBe('2026-04-01T00:00:00.000Z')
    expect(first.estimatedEndDate).toBe('2026-05-01T00:00:00.000Z')
    expect(first.avgDaysBetweenSessions).toBe(3.5)
    expect(first.sessionIndex).toBe(0)
    expect(first.sessionNumber).toBe(1)
    expect(first.sessionId).toBe('session-1')
    expect(first.sessionName).toBe('Upper A')
    expect(first.sessionTrack).toBe('upper')
    expect(first.sessionIsCompleted).toBe(true)
    expect(first.sessionLoggedDate).toBe('2026-04-01T00:00:00.000Z')
    expect(first.sessionProjectedDate).toBe('')
    expect(first.exerciseId).toBe('ex-1')
    expect(first.exerciseName).toBe('Bench Press')
    expect(first.sets).toBe('3')
    expect(first.reps).toBe('8')
    expect(first.plannedWeight).toBe(60)
    expect(first.plannedWeightPerSide).toBe('')
    expect(first.weightUnit).toBe('kg')
    expect(first.actualWeight).toBe(62.5)
    expect(first.exerciseCompleted).toBe(true)
    expect(first.exerciseSkipped).toBe(false)

    const second = rows[1]
    expect(second.sessionIndex).toBe(1)
    expect(second.sessionIsCompleted).toBe(false)
    expect(second.sessionLoggedDate).toBe('')
    expect(second.sessionProjectedDate).toBe('2026-04-04T00:00:00.000Z')
    expect(second.exerciseId).toBe('ex-2')
    expect(second.plannedWeightPerSide).toBe(25)
  })
})
