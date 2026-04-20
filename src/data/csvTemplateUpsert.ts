import { extractCsvImportMetadata, importProgramTemplateFromCsv } from './csvImport'
import type {
  ExerciseTemplate,
  ProgramMode,
  ProgramTemplate,
  SessionTemplate,
  TrackType,
} from '../domain/types'

const CSV_SOURCE_NOTE_PREFIX = 'CSV import source:'

interface CsvTemplateUpsertOptions {
  templates: ProgramTemplate[]
  csvText: string
  fileName?: string
  programName?: string
  mode?: ProgramMode
  track?: TrackType
  focusTarget?: string
  durationWeeks?: number
}

export interface CsvTemplateDiff {
  preservedExerciseIds: number
  addedExercises: number
  removedExercises: number
  updatedExercises: number
  totalExercises: number
  preservedSessions: number
}

interface CsvTemplateUpsertSuccessResult {
  status: 'success'
  operation: 'created' | 'updated'
  template: ProgramTemplate
  nextTemplates: ProgramTemplate[]
  diff: CsvTemplateDiff
  warnings: string[]
}

interface CsvTemplateIdentityConflictDetails {
  templateId?: string
  metadataSourceFileName?: string
  providedFileName?: string
  resolvedTemplateIdByTemplateId?: string
  resolvedTemplateIdBySourceFileName?: string
}

interface CsvTemplateUpsertConflictResult {
  status: 'conflict'
  reason: 'template-identity-mismatch'
  message: string
  details: CsvTemplateIdentityConflictDetails
}

export type CsvTemplateUpsertResult =
  | CsvTemplateUpsertSuccessResult
  | CsvTemplateUpsertConflictResult

interface ExerciseMergeResult {
  exercises: ExerciseTemplate[]
  preservedExerciseIds: number
  addedExercises: number
  removedExercises: number
  updatedExercises: number
}

interface SessionResolutionResult {
  sessionIndex: number
  session: SessionTemplate
  warnings: string[]
}

function normalizeFileName(fileName: string): string {
  return fileName.trim().toLowerCase()
}

function extractCsvImportSourceFileName(template: ProgramTemplate): string | undefined {
  const note = template.note?.trim()
  if (!note) {
    return undefined
  }

  const normalizedPrefix = CSV_SOURCE_NOTE_PREFIX.toLowerCase()
  if (!note.toLowerCase().startsWith(normalizedPrefix)) {
    return undefined
  }

  const fileName = note.slice(CSV_SOURCE_NOTE_PREFIX.length).trim()
  return fileName.length > 0 ? fileName : undefined
}

export function findImportedTemplateByFileName(
  templates: ProgramTemplate[],
  fileName: string,
): ProgramTemplate | undefined {
  const normalizedTarget = normalizeFileName(fileName)
  if (!normalizedTarget) {
    return undefined
  }

  for (let index = templates.length - 1; index >= 0; index -= 1) {
    const template = templates[index]
    const sourceFileName = extractCsvImportSourceFileName(template)
    if (!sourceFileName) {
      continue
    }

    if (normalizeFileName(sourceFileName) === normalizedTarget) {
      return template
    }
  }

  return undefined
}

function extractExerciseNumber(exerciseId: string, templateId: string): string | undefined {
  const prefix = `${templateId}-ex-`
  if (!exerciseId.startsWith(prefix)) {
    const fallbackMatch = exerciseId.match(/(?:^|-)ex-(\d+)$/)
    return fallbackMatch?.[1]
  }

  const suffix = exerciseId.slice(prefix.length).trim()
  if (!/^\d+$/.test(suffix)) {
    return undefined
  }

  return suffix.length > 0 ? suffix : undefined
}

function normalizeExerciseNameForMatch(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}

function buildExerciseSnapshot(exercise: ExerciseTemplate): string {
  return JSON.stringify({
    name: exercise.name,
    sets: exercise.sets,
    reps: exercise.reps,
    plannedWeight: exercise.plannedWeight,
    plannedWeightPerSide: exercise.plannedWeightPerSide,
    weightUnit: exercise.weightUnit,
    isBodyweightLoad: exercise.isBodyweightLoad,
    plannedLoadLabel: exercise.plannedLoadLabel,
    progressionRule: exercise.progressionRule,
    note: exercise.note,
    reference: exercise.reference,
  })
}

function mergeExercisesByIdentity(
  existingTemplateId: string,
  importedTemplateId: string,
  existingExercises: ExerciseTemplate[],
  importedExercises: ExerciseTemplate[],
): ExerciseMergeResult {
  if (existingExercises.length === 0) {
    return {
      exercises: importedExercises,
      preservedExerciseIds: 0,
      addedExercises: importedExercises.length,
      removedExercises: 0,
      updatedExercises: 0,
    }
  }

  if (importedExercises.length === 0) {
    return {
      exercises: importedExercises,
      preservedExerciseIds: 0,
      addedExercises: 0,
      removedExercises: existingExercises.length,
      updatedExercises: 0,
    }
  }

  const existingByNumber = new Map<string, ExerciseTemplate[]>()
  const existingByName = new Map<string, ExerciseTemplate[]>()

  existingExercises.forEach((exercise) => {
    const exerciseNumber = extractExerciseNumber(exercise.id, existingTemplateId)
    if (exerciseNumber) {
      const numberBucket = existingByNumber.get(exerciseNumber) ?? []
      numberBucket.push(exercise)
      existingByNumber.set(exerciseNumber, numberBucket)
    }

    const normalizedName = normalizeExerciseNameForMatch(exercise.name)
    const nameBucket = existingByName.get(normalizedName) ?? []
    nameBucket.push(exercise)
    existingByName.set(normalizedName, nameBucket)
  })

  const usedExistingExerciseIds = new Set<string>()
  let preservedExerciseIds = 0
  let addedExercises = 0
  let updatedExercises = 0

  const mergedExercises = importedExercises.map((importedExercise) => {
    const normalizedImportedName = normalizeExerciseNameForMatch(importedExercise.name)
    const importedExerciseNumber = extractExerciseNumber(
      importedExercise.id,
      importedTemplateId,
    )

    let matchedExisting: ExerciseTemplate | undefined

    if (importedExerciseNumber) {
      const candidatesByNumber = existingByNumber.get(importedExerciseNumber) ?? []
      matchedExisting = candidatesByNumber.find(
        (candidate) =>
          !usedExistingExerciseIds.has(candidate.id) &&
          normalizeExerciseNameForMatch(candidate.name) === normalizedImportedName,
      )
    }

    if (!matchedExisting) {
      const candidatesByName = existingByName.get(normalizedImportedName) ?? []
      matchedExisting = candidatesByName.find(
        (candidate) => !usedExistingExerciseIds.has(candidate.id),
      )
    }

    if (!matchedExisting && importedExerciseNumber) {
      const candidatesByNumber = existingByNumber.get(importedExerciseNumber) ?? []
      matchedExisting = candidatesByNumber.find(
        (candidate) => !usedExistingExerciseIds.has(candidate.id),
      )
    }

    if (!matchedExisting) {
      addedExercises += 1
      return importedExercise
    }

    usedExistingExerciseIds.add(matchedExisting.id)
    preservedExerciseIds += 1

    const mergedExercise: ExerciseTemplate = {
      ...importedExercise,
      id: matchedExisting.id,
    }

    if (buildExerciseSnapshot(matchedExisting) !== buildExerciseSnapshot(mergedExercise)) {
      updatedExercises += 1
    }

    return mergedExercise
  })

  const removedExercises = existingExercises.filter(
    (exercise) => !usedExistingExerciseIds.has(exercise.id),
  ).length

  return {
    exercises: mergedExercises,
    preservedExerciseIds,
    addedExercises,
    removedExercises,
    updatedExercises,
  }
}

function resolveTargetSession(
  existingTemplate: ProgramTemplate,
  exportedSessionId: string | undefined,
): SessionResolutionResult {
  const warnings: string[] = []

  if (existingTemplate.sessions.length === 0) {
    throw new Error(
      `Template "${existingTemplate.name}" has no sessions available for CSV update.`,
    )
  }

  if (exportedSessionId) {
    const matchedSessionIndex = existingTemplate.sessions.findIndex(
      (session) => session.id === exportedSessionId,
    )

    if (matchedSessionIndex >= 0) {
      return {
        sessionIndex: matchedSessionIndex,
        session: existingTemplate.sessions[matchedSessionIndex],
        warnings,
      }
    }

    warnings.push(
      `CSV references session "${exportedSessionId}" that was not found. Updated the first session instead.`,
    )
  }

  if (existingTemplate.sessions.length > 1 && !exportedSessionId) {
    warnings.push(
      'CSV did not include exported session metadata. Updated the first session and preserved remaining sessions.',
    )
  }

  return {
    sessionIndex: 0,
    session: existingTemplate.sessions[0],
    warnings,
  }
}

function createTemplateIdentityConflict(
  templateId: string,
  metadataSourceFileName: string,
  providedFileName: string | undefined,
  existingTemplateById: ProgramTemplate,
  existingTemplateByMetadataFileName: ProgramTemplate,
): CsvTemplateUpsertConflictResult {
  return {
    status: 'conflict',
    reason: 'template-identity-mismatch',
    message:
      'CSV metadata points to different templates by template-id and source file name. Resolve the mismatch before updating.',
    details: {
      templateId,
      metadataSourceFileName,
      providedFileName,
      resolvedTemplateIdByTemplateId: existingTemplateById.id,
      resolvedTemplateIdBySourceFileName: existingTemplateByMetadataFileName.id,
    },
  }
}

export function upsertProgramTemplateFromCsv(
  options: CsvTemplateUpsertOptions,
): CsvTemplateUpsertResult {
  const csvMetadata = extractCsvImportMetadata(options.csvText)
  const targetTemplateId = csvMetadata.templateId?.trim()
  const providedFileName = options.fileName?.trim()
  const metadataSourceFileName = csvMetadata.sourceFileName?.trim()
  const exportedSessionId = csvMetadata.exportedSessionId?.trim()
  const targetFileName = metadataSourceFileName || providedFileName

  const existingTemplateById = targetTemplateId
    ? options.templates.find((template) => template.id === targetTemplateId)
    : undefined

  const existingTemplateByMetadataFileName = metadataSourceFileName
    ? findImportedTemplateByFileName(options.templates, metadataSourceFileName)
    : undefined

  if (
    targetTemplateId &&
    metadataSourceFileName &&
    existingTemplateById &&
    existingTemplateByMetadataFileName &&
    existingTemplateById.id !== existingTemplateByMetadataFileName.id
  ) {
    return createTemplateIdentityConflict(
      targetTemplateId,
      metadataSourceFileName,
      providedFileName,
      existingTemplateById,
      existingTemplateByMetadataFileName,
    )
  }

  const existingTemplateByProvidedFileName =
    !metadataSourceFileName && providedFileName
      ? findImportedTemplateByFileName(options.templates, providedFileName)
      : undefined

  const existingTemplate =
    existingTemplateById ??
    existingTemplateByMetadataFileName ??
    existingTemplateByProvidedFileName

  const resolvedProgramName = options.programName?.trim() || csvMetadata.programName
  const resolvedMode = options.mode ?? csvMetadata.mode
  const resolvedTrack = options.track ?? csvMetadata.track
  const resolvedFocusTarget = options.focusTarget?.trim() || csvMetadata.focusTarget
  const resolvedDurationWeeks = options.durationWeeks ?? csvMetadata.durationWeeks

  const importedTemplate = importProgramTemplateFromCsv(options.csvText, {
    fileName: targetFileName,
    programId: existingTemplate?.id,
    programName: resolvedProgramName,
    mode: resolvedMode,
    track: resolvedTrack,
    focusTarget: resolvedFocusTarget,
    durationWeeks: resolvedDurationWeeks,
  })

  if (!existingTemplate) {
    const totalExercises = importedTemplate.sessions[0]?.exercises.length ?? 0
    return {
      status: 'success',
      operation: 'created',
      template: importedTemplate,
      nextTemplates: [...options.templates, importedTemplate],
      diff: {
        preservedExerciseIds: 0,
        addedExercises: totalExercises,
        removedExercises: 0,
        updatedExercises: 0,
        totalExercises,
        preservedSessions: 0,
      },
      warnings: [],
    }
  }

  const importedSession = importedTemplate.sessions[0]
  if (!importedSession) {
    throw new Error('CSV import did not produce a valid session payload.')
  }

  const sessionResolution = resolveTargetSession(existingTemplate, exportedSessionId)
  const mergeResult = mergeExercisesByIdentity(
    existingTemplate.id,
    importedTemplate.id,
    sessionResolution.session.exercises,
    importedSession.exercises,
  )

  const mergedTargetSession: SessionTemplate = {
    ...sessionResolution.session,
    exercises: mergeResult.exercises,
  }

  const mergedSessions = existingTemplate.sessions.map((session, index) =>
    index === sessionResolution.sessionIndex ? mergedTargetSession : session,
  )

  const mergedTemplate: ProgramTemplate = {
    ...existingTemplate,
    ...importedTemplate,
    id: existingTemplate.id,
    sessions: mergedSessions,
  }

  const nextTemplates = options.templates.map((template) =>
    template.id === existingTemplate.id ? mergedTemplate : template,
  )

  return {
    status: 'success',
    operation: 'updated',
    template: mergedTemplate,
    nextTemplates,
    diff: {
      preservedExerciseIds: mergeResult.preservedExerciseIds,
      addedExercises: mergeResult.addedExercises,
      removedExercises: mergeResult.removedExercises,
      updatedExercises: mergeResult.updatedExercises,
      totalExercises: mergeResult.exercises.length,
      preservedSessions: Math.max(0, mergedSessions.length - 1),
    },
    warnings: sessionResolution.warnings,
  }
}
