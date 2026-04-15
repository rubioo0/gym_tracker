import { extractCsvImportMetadata, importProgramTemplateFromCsv } from './csvImport'
import type {
  ExerciseTemplate,
  ProgramMode,
  ProgramTemplate,
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
}

export interface CsvTemplateUpsertResult {
  operation: 'created' | 'updated'
  template: ProgramTemplate
  nextTemplates: ProgramTemplate[]
  diff: CsvTemplateDiff
}

interface ExerciseMergeResult {
  exercises: ExerciseTemplate[]
  preservedExerciseIds: number
  addedExercises: number
  removedExercises: number
  updatedExercises: number
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
    return undefined
  }

  const suffix = exerciseId.slice(prefix.length).trim()
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
  existingTemplate: ProgramTemplate,
  importedTemplate: ProgramTemplate,
): ExerciseMergeResult {
  const existingExercises = existingTemplate.sessions[0]?.exercises ?? []
  const importedExercises = importedTemplate.sessions[0]?.exercises ?? []

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

  const existingByNumber = new Map<string, ExerciseTemplate>()
  const existingByName = new Map<string, ExerciseTemplate[]>()

  existingExercises.forEach((exercise) => {
    const exerciseNumber = extractExerciseNumber(exercise.id, existingTemplate.id)
    if (exerciseNumber) {
      existingByNumber.set(exerciseNumber, exercise)
    }

    const normalizedName = normalizeExerciseNameForMatch(exercise.name)
    const bucket = existingByName.get(normalizedName) ?? []
    bucket.push(exercise)
    existingByName.set(normalizedName, bucket)
  })

  const usedExistingExerciseIds = new Set<string>()
  let preservedExerciseIds = 0
  let addedExercises = 0
  let updatedExercises = 0

  const mergedExercises = importedExercises.map((importedExercise) => {
    const normalizedImportedName = normalizeExerciseNameForMatch(importedExercise.name)
    const importedExerciseNumber = extractExerciseNumber(
      importedExercise.id,
      importedTemplate.id,
    )

    let matchedExisting: ExerciseTemplate | undefined

    if (importedExerciseNumber) {
      const candidateByNumber = existingByNumber.get(importedExerciseNumber)
      if (
        candidateByNumber &&
        !usedExistingExerciseIds.has(candidateByNumber.id) &&
        normalizeExerciseNameForMatch(candidateByNumber.name) === normalizedImportedName
      ) {
        matchedExisting = candidateByNumber
      }
    }

    if (!matchedExisting) {
      const candidatesByName = existingByName.get(normalizedImportedName) ?? []
      matchedExisting = candidatesByName.find(
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

export function upsertProgramTemplateFromCsv(
  options: CsvTemplateUpsertOptions,
): CsvTemplateUpsertResult {
  const csvMetadata = extractCsvImportMetadata(options.csvText)
  const targetTemplateId = csvMetadata.templateId?.trim()
  const providedFileName = options.fileName?.trim()
  const metadataSourceFileName = csvMetadata.sourceFileName?.trim()
  const targetFileName = providedFileName || metadataSourceFileName

  const existingTemplateById = targetTemplateId
    ? options.templates.find((template) => template.id === targetTemplateId)
    : undefined

  const existingTemplateByFileName = targetFileName
    ? findImportedTemplateByFileName(options.templates, targetFileName)
    : undefined

  const existingTemplate = existingTemplateById ?? existingTemplateByFileName

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
      operation: 'created',
      template: importedTemplate,
      nextTemplates: [...options.templates, importedTemplate],
      diff: {
        preservedExerciseIds: 0,
        addedExercises: totalExercises,
        removedExercises: 0,
        updatedExercises: 0,
        totalExercises,
      },
    }
  }

  const mergeResult = mergeExercisesByIdentity(existingTemplate, importedTemplate)
  const existingSessionId = existingTemplate.sessions[0]?.id

  const mergedTemplate: ProgramTemplate = {
    ...importedTemplate,
    id: existingTemplate.id,
    sessions: importedTemplate.sessions.map((session, index) => {
      if (index !== 0) {
        return session
      }

      return {
        ...session,
        id: existingSessionId ?? session.id,
        exercises: mergeResult.exercises,
      }
    }),
  }

  const nextTemplates = options.templates.map((template) =>
    template.id === existingTemplate.id ? mergedTemplate : template,
  )

  return {
    operation: 'updated',
    template: mergedTemplate,
    nextTemplates,
    diff: {
      preservedExerciseIds: mergeResult.preservedExerciseIds,
      addedExercises: mergeResult.addedExercises,
      removedExercises: mergeResult.removedExercises,
      updatedExercises: mergeResult.updatedExercises,
      totalExercises: mergeResult.exercises.length,
    },
  }
}