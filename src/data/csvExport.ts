import Papa from 'papaparse'
import type {
  ExerciseTemplate,
  ProgramTemplate,
  ProgressionFrequencyUnit,
  ProgressionRule,
} from '../domain/types'
import { CSV_METADATA_ROW_PREFIX } from './csvImport'

const CSV_SOURCE_NOTE_PREFIX = 'CSV import source:'

const CSV_HEADER_ROW = [
  'Exercise #',
  'Exercise Name',
  'Sets',
  'Reps',
  'Base Config / Planned Weight',
  'Progression Rule',
  'Max Value',
  'Rest',
  'Video Reference',
]

export interface ProgramTemplateCsvExportResult {
  csvText: string
  fileName: string
  exportedSessionId: string
  exportedExerciseCount: number
  skippedSessionCount: number
}

function formatNumber(value: number): string {
  return Number(value.toFixed(2)).toString()
}

function sanitizeFileName(fileName: string): string {
  const withoutReservedChars = fileName.replace(/[<>:"/\\|?*]/g, '-')
  const withoutControlChars = Array.from(withoutReservedChars)
    .map((char) => (char.charCodeAt(0) < 32 ? '-' : char))
    .join('')

  const sanitized = withoutControlChars.replace(/\s+/g, ' ').trim()

  if (!sanitized) {
    return 'exported-program.csv'
  }

  if (sanitized.toLowerCase().endsWith('.csv')) {
    return sanitized
  }

  return `${sanitized}.csv`
}

function extractCsvSourceFileName(template: ProgramTemplate): string | undefined {
  const note = template.note?.trim()
  if (!note) {
    return undefined
  }

  if (!note.toLowerCase().startsWith(CSV_SOURCE_NOTE_PREFIX.toLowerCase())) {
    return undefined
  }

  const fileName = note.slice(CSV_SOURCE_NOTE_PREFIX.length).trim()
  return fileName.length > 0 ? fileName : undefined
}

function getProgressionFrequencyUnitLabel(
  unit: ProgressionFrequencyUnit | undefined,
): string {
  return unit === 'week' ? 'week' : 'session'
}

function buildProgressionRuleCell(
  exercise: ExerciseTemplate,
  progressionRule: ProgressionRule,
): string {
  const explicitNote = progressionRule.note?.trim()
  if (explicitNote) {
    return explicitNote
  }

  if (progressionRule.type === 'reps') {
    return `+${formatNumber(progressionRule.amount)} reps | ${progressionRule.frequency}${getProgressionFrequencyUnitLabel(progressionRule.frequencyUnit)}`
  }

  const usesLbs = (exercise.weightUnit ?? '').toLowerCase().includes('lb')
  const unitLabel = usesLbs ? ' lb' : ' kg'
  const perSide =
    typeof progressionRule.amountPerSide === 'number'
      ? ` (${formatNumber(progressionRule.amountPerSide)})`
      : ''

  return `+${formatNumber(progressionRule.amount)}${unitLabel}${perSide} | ${progressionRule.frequency}${getProgressionFrequencyUnitLabel(progressionRule.frequencyUnit)}`
}

function buildBaseConfigCell(exercise: ExerciseTemplate): string {
  const explicitLabel = exercise.plannedLoadLabel?.trim()
  if (explicitLabel) {
    return explicitLabel
  }

  if (exercise.isBodyweightLoad) {
    if (typeof exercise.plannedWeight === 'number') {
      const unit = exercise.weightUnit ?? 'kg'
      return `body + ${formatNumber(exercise.plannedWeight)} ${unit}`
    }

    return 'body'
  }

  if (typeof exercise.plannedWeight !== 'number') {
    return '-'
  }

  const unit = exercise.weightUnit ?? 'kg'
  if (typeof exercise.plannedWeightPerSide === 'number') {
    return `${formatNumber(exercise.plannedWeight)} ${unit} (${formatNumber(exercise.plannedWeightPerSide)})`
  }

  return `${formatNumber(exercise.plannedWeight)} ${unit}`
}

function buildReferenceCell(exercise: ExerciseTemplate): string {
  return exercise.reference?.imageUrl ?? exercise.reference?.videoUrl ?? '-'
}

function buildExerciseRow(exercise: ExerciseTemplate, order: number): string[] {
  return [
    `${order}`,
    exercise.name,
    exercise.sets,
    exercise.reps,
    buildBaseConfigCell(exercise),
    exercise.progressionRule
      ? buildProgressionRuleCell(exercise, exercise.progressionRule)
      : '-',
    typeof exercise.progressionRule?.maxValue === 'number'
      ? formatNumber(exercise.progressionRule.maxValue)
      : '-',
    '-',
    buildReferenceCell(exercise),
  ]
}

function buildMetadataRows(
  template: ProgramTemplate,
  sourceFileName: string,
  exportedSessionId: string,
): string[][] {
  return [
    [CSV_METADATA_ROW_PREFIX, 'export-version', '1'],
    [CSV_METADATA_ROW_PREFIX, 'template-id', template.id],
    [CSV_METADATA_ROW_PREFIX, 'exported-session-id', exportedSessionId],
    [CSV_METADATA_ROW_PREFIX, 'program-name', template.name],
    [CSV_METADATA_ROW_PREFIX, 'mode', template.mode],
    [CSV_METADATA_ROW_PREFIX, 'track', template.track],
    [CSV_METADATA_ROW_PREFIX, 'focus-target', template.focusTarget],
    [CSV_METADATA_ROW_PREFIX, 'source-file-name', sourceFileName],
  ]
}

export function exportProgramTemplateToCsv(
  template: ProgramTemplate,
): ProgramTemplateCsvExportResult {
  const firstSession = template.sessions[0]
  if (!firstSession) {
    throw new Error(`Program "${template.name}" has no sessions to export.`)
  }

  const sourceFileName = sanitizeFileName(
    extractCsvSourceFileName(template) ?? `${template.name}.csv`,
  )

  const rows: string[][] = [
    ...buildMetadataRows(template, sourceFileName, firstSession.id),
    CSV_HEADER_ROW,
    ...firstSession.exercises.map((exercise, index) => buildExerciseRow(exercise, index + 1)),
  ]

  return {
    csvText: Papa.unparse(rows, {
      newline: '\n',
    }),
    fileName: sourceFileName,
    exportedSessionId: firstSession.id,
    exportedExerciseCount: firstSession.exercises.length,
    skippedSessionCount: Math.max(0, template.sessions.length - 1),
  }
}
