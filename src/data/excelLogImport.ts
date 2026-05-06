import * as XLSX from 'xlsx'
import type {
  ExerciseDifficulty,
  ExerciseLog,
  TrackType,
  WorkoutLog,
} from '../domain/types'

const REQUIRED_COLUMNS = [
  'logId',
  'runId',
  'templateId',
  'sessionId',
  'sessionName',
  'track',
  'completedAt',
  'successful',
] as const

function normalizeCell(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }

  return String(value).trim()
}

function parseBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value
  }

  const normalized = normalizeCell(value).toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'yes'
}

function parseOptionalNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  const normalized = normalizeCell(value)
  if (normalized === '') {
    return undefined
  }

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseTrack(value: unknown): TrackType {
  const normalized = normalizeCell(value).toLowerCase()
  if (normalized === 'upper' || normalized === 'lower' || normalized === 'custom') {
    return normalized
  }

  return 'upper'
}

function parseDifficulty(value: unknown): ExerciseDifficulty | undefined {
  const normalized = normalizeCell(value).toLowerCase()
  if (normalized === 'easy' || normalized === 'okay' || normalized === 'hard') {
    return normalized
  }

  return undefined
}

interface RawRow {
  logId?: unknown
  runId?: unknown
  templateId?: unknown
  sessionId?: unknown
  sessionName?: unknown
  track?: unknown
  completedAt?: unknown
  successful?: unknown
  sessionNote?: unknown
  exerciseId?: unknown
  exerciseName?: unknown
  completed?: unknown
  skipped?: unknown
  plannedWeight?: unknown
  actualWeight?: unknown
  weightUnit?: unknown
  difficulty?: unknown
  exerciseNote?: unknown
}

function buildExerciseLog(row: RawRow): ExerciseLog | null {
  const exerciseId = normalizeCell(row.exerciseId)
  if (!exerciseId) {
    return null
  }

  return {
    exerciseId,
    exerciseName: normalizeCell(row.exerciseName) || exerciseId,
    completed: parseBoolean(row.completed),
    skipped: parseBoolean(row.skipped),
    plannedWeight: parseOptionalNumber(row.plannedWeight),
    actualWeight: parseOptionalNumber(row.actualWeight),
    weightUnit: normalizeCell(row.weightUnit) || undefined,
    difficulty: parseDifficulty(row.difficulty),
    note: normalizeCell(row.exerciseNote) || undefined,
  }
}

export function importWorkoutLogsFromExcel(buffer: ArrayBuffer): WorkoutLog[] | null {
  try {
    const workbook = XLSX.read(buffer, { type: 'array' })
    const firstSheetName = workbook.SheetNames[0]
    if (!firstSheetName) {
      return null
    }

    const worksheet = workbook.Sheets[firstSheetName]
    if (!worksheet) {
      return null
    }

    const rows = XLSX.utils.sheet_to_json<RawRow>(worksheet)
    if (rows.length === 0) {
      return null
    }

    // Validate that required columns exist in the first row
    const firstRow = rows[0]
    const missingColumns = REQUIRED_COLUMNS.filter(
      (column) => !(column in firstRow),
    )
    if (missingColumns.length > 0) {
      return null
    }

    // Group rows by logId to reconstruct WorkoutLog objects
    const logGroups = new Map<string, { sessionRow: RawRow; exerciseRows: RawRow[] }>()
    const logOrder: string[] = []

    for (const row of rows) {
      const logId = normalizeCell(row.logId)
      if (!logId) {
        continue
      }

      const existing = logGroups.get(logId)
      if (existing) {
        existing.exerciseRows.push(row)
      } else {
        logOrder.push(logId)
        logGroups.set(logId, {
          sessionRow: row,
          exerciseRows: [row],
        })
      }
    }

    const workoutLogs: WorkoutLog[] = []

    for (const logId of logOrder) {
      const group = logGroups.get(logId)
      if (!group) {
        continue
      }

      const { sessionRow, exerciseRows } = group

      const exerciseLogs: ExerciseLog[] = []
      for (const exerciseRow of exerciseRows) {
        const exerciseLog = buildExerciseLog(exerciseRow)
        if (exerciseLog) {
          exerciseLogs.push(exerciseLog)
        }
      }

      const sessionNote = normalizeCell(sessionRow.sessionNote) || undefined

      const workoutLog: WorkoutLog = {
        id: logId,
        runId: normalizeCell(sessionRow.runId),
        templateId: normalizeCell(sessionRow.templateId),
        sessionId: normalizeCell(sessionRow.sessionId),
        sessionName: normalizeCell(sessionRow.sessionName) || 'Imported Session',
        track: parseTrack(sessionRow.track),
        completedAt: normalizeCell(sessionRow.completedAt),
        successful: parseBoolean(sessionRow.successful),
        exerciseLogs,
        optionalActivities: [],
        sessionNote,
      }

      workoutLogs.push(workoutLog)
    }

    return workoutLogs.length > 0 ? workoutLogs : null
  } catch {
    return null
  }
}
