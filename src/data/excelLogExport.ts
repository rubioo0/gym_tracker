import * as XLSX from 'xlsx'
import type { WorkoutLog } from '../domain/types'

const SHEET_NAME = 'Workout Logs'

const COLUMNS = [
  'logId',
  'runId',
  'templateId',
  'sessionId',
  'sessionName',
  'track',
  'completedAt',
  'successful',
  'sessionNote',
  'exerciseId',
  'exerciseName',
  'completed',
  'skipped',
  'plannedWeight',
  'actualWeight',
  'weightUnit',
  'difficulty',
  'exerciseNote',
] as const

interface ExcelLogRow {
  logId: string
  runId: string
  templateId: string
  sessionId: string
  sessionName: string
  track: string
  completedAt: string
  successful: boolean
  sessionNote: string
  exerciseId: string
  exerciseName: string
  completed: boolean
  skipped: boolean
  plannedWeight: number | string
  actualWeight: number | string
  weightUnit: string
  difficulty: string
  exerciseNote: string
}

function workoutLogToRows(log: WorkoutLog): ExcelLogRow[] {
  if (log.exerciseLogs.length === 0) {
    return [
      {
        logId: log.id,
        runId: log.runId,
        templateId: log.templateId,
        sessionId: log.sessionId,
        sessionName: log.sessionName,
        track: log.track,
        completedAt: log.completedAt,
        successful: log.successful,
        sessionNote: log.sessionNote ?? '',
        exerciseId: '',
        exerciseName: '',
        completed: false,
        skipped: false,
        plannedWeight: '',
        actualWeight: '',
        weightUnit: '',
        difficulty: '',
        exerciseNote: '',
      },
    ]
  }

  return log.exerciseLogs.map((exerciseLog) => ({
    logId: log.id,
    runId: log.runId,
    templateId: log.templateId,
    sessionId: log.sessionId,
    sessionName: log.sessionName,
    track: log.track,
    completedAt: log.completedAt,
    successful: log.successful,
    sessionNote: log.sessionNote ?? '',
    exerciseId: exerciseLog.exerciseId,
    exerciseName: exerciseLog.exerciseName,
    completed: exerciseLog.completed,
    skipped: exerciseLog.skipped,
    plannedWeight: exerciseLog.plannedWeight ?? '',
    actualWeight: exerciseLog.actualWeight ?? '',
    weightUnit: exerciseLog.weightUnit ?? '',
    difficulty: exerciseLog.difficulty ?? '',
    exerciseNote: exerciseLog.note ?? '',
  }))
}

export function exportWorkoutLogsToExcel(logs: WorkoutLog[]): ArrayBuffer {
  const rows: ExcelLogRow[] = logs.flatMap(workoutLogToRows)

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

export function buildExcelLogFileName(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `training-os-logs-${timestamp}.xlsx`
}
