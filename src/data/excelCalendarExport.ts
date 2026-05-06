import * as XLSX from 'xlsx'
import type { ProgramCalendar } from '../domain/types'

const SHEET_NAME = 'Program Calendar'

const COLUMNS = [
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
] as const

interface ExcelCalendarRow {
  runId: string
  templateId: string
  startDate: string
  estimatedEndDate: string
  avgDaysBetweenSessions: number
  sessionIndex: number
  sessionNumber: number
  sessionId: string
  sessionName: string
  sessionTrack: string
  sessionIsCompleted: boolean
  sessionLoggedDate: string
  sessionProjectedDate: string
  exerciseId: string
  exerciseName: string
  sets: string
  reps: string
  plannedWeight: number | string
  plannedWeightPerSide: number | string
  weightUnit: string
  actualWeight: number | string
  exerciseCompleted: boolean
  exerciseSkipped: boolean
}

function sessionToRows(
  calendar: ProgramCalendar,
  session: ProgramCalendar['sessions'][number],
): ExcelCalendarRow[] {
  const base = {
    runId: calendar.runId,
    templateId: calendar.templateId,
    startDate: calendar.startDate,
    estimatedEndDate: calendar.estimatedEndDate,
    avgDaysBetweenSessions: calendar.avgDaysBetweenSessions,
    sessionIndex: session.sessionIndex,
    sessionNumber: session.sessionIndex + 1,
    sessionId: session.sessionId,
    sessionName: session.sessionName,
    sessionTrack: session.track,
    sessionIsCompleted: session.isCompleted,
    sessionLoggedDate: session.loggedDate ?? '',
    sessionProjectedDate: session.projectedDate ?? '',
  }

  if (session.exercises.length === 0) {
    return [
      {
        ...base,
        exerciseId: '',
        exerciseName: '',
        sets: '',
        reps: '',
        plannedWeight: '',
        plannedWeightPerSide: '',
        weightUnit: '',
        actualWeight: '',
        exerciseCompleted: false,
        exerciseSkipped: false,
      },
    ]
  }

  return session.exercises.map((exercise) => ({
    ...base,
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    sets: exercise.sets,
    reps: exercise.reps,
    plannedWeight: exercise.plannedWeight ?? '',
    plannedWeightPerSide: exercise.plannedWeightPerSide ?? '',
    weightUnit: exercise.weightUnit ?? '',
    actualWeight: exercise.actualWeight ?? '',
    exerciseCompleted: exercise.completed ?? false,
    exerciseSkipped: exercise.skipped ?? false,
  }))
}

export function exportProgramCalendarToExcel(
  calendar: ProgramCalendar,
): ArrayBuffer {
  const rows: ExcelCalendarRow[] = calendar.sessions.flatMap((session) =>
    sessionToRows(calendar, session),
  )

  const worksheet = XLSX.utils.json_to_sheet(rows, {
    header: [...COLUMNS],
  })

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, SHEET_NAME)

  return XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
  }) as ArrayBuffer
}

export function buildExcelCalendarFileName(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `training-os-calendar-${timestamp}.xlsx`
}
