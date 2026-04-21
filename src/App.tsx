import { useEffect, useMemo, useReducer, useState } from 'react'
import type { ChangeEvent } from 'react'
import {
  clearAppState,
  exportAppStateJson,
  importStateFromJson,
  loadAppState,
  saveAppState,
} from './data/storage'
import { seededProgramTemplates } from './data/seed'
import { upsertProgramTemplateFromCsv } from './data/csvTemplateUpsert'
import { exportProgramTemplateToCsv } from './data/csvExport'
import { extractCsvImportMetadata } from './data/csvImport'
import {
  buildPlannedSession,
  getActiveRuns,
  getSuggestedRun,
  getTemplateById,
} from './domain/logic'
import { appReducer } from './domain/reducer'
import { SessionPlanPanel } from './components/session/SessionPlanPanel'
import type {
  ExerciseDifficulty,
  FocusRun,
  LogActivityInput,
  LogExerciseInput,
  ProgramMode,
  ProgramTemplate,
  RunStatus,
  TrackType,
} from './domain/types'
import './App.css'

type AppTab = 'home' | 'runs' | 'session' | 'log' | 'history' | 'data'

const tabs: { id: AppTab; label: string }[] = [
  { id: 'home', label: 'Головна' },
  { id: 'runs', label: 'Програми / Тренування' },
  { id: 'session', label: 'План сесії' },
  { id: 'log', label: 'Завершити / Логування' },
  { id: 'history', label: 'Історія' },
  { id: 'data', label: 'Дані' },
]

const statusOrder: RunStatus[] = ['active', 'paused', 'completed', 'archived']

const statusLabel: Record<RunStatus, string> = {
  active: 'Активне',
  paused: 'На паузі',
  completed: 'Завершено',
  archived: 'Архівовано',
}

const LBS_PER_KG = 2.2046226218
const KG_PER_LB = 0.45359237

function normalizeWeightUnit(unit?: string): 'kg' | 'lbs' {
  const normalized = unit?.toLowerCase() ?? ''
  if (normalized.includes('lb')) {
    return 'lbs'
  }

  if (normalized.includes('kg') || normalized.includes('кг')) {
    return 'kg'
  }

  return 'lbs'
}

function formatWeightInLbs(value: number, unit?: string): string {
  const normalizedUnit = normalizeWeightUnit(unit)
  const lbsValue = normalizedUnit === 'lbs' ? value : value * LBS_PER_KG
  return `${Number(lbsValue.toFixed(2)).toString()} lbs`
}

function convertToDisplayedLbs(value: number, unit?: string): number {
  const normalizedUnit = normalizeWeightUnit(unit)
  const lbsValue = normalizedUnit === 'lbs' ? value : value * LBS_PER_KG
  return Number(lbsValue.toFixed(2))
}

function convertFromDisplayedLbs(value: number, unit?: string): number {
  const normalizedUnit = normalizeWeightUnit(unit)
  const storedValue = normalizedUnit === 'lbs' ? value : value * KG_PER_LB
  return Number(storedValue.toFixed(2))
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatModeLabel(templates: ProgramTemplate[]): string {
  if (templates.length === 0) {
    return 'На паузі'
  }

  const modes = Array.from(new Set(templates.map((template) => template.mode)))
  if (modes.length === 1) {
    const mode = modes[0]
    return mode.charAt(0).toUpperCase() + mode.slice(1)
  }

  return 'Змішана'
}

function createPreviewRun(template: ProgramTemplate): FocusRun {
  return {
    id: `preview-${template.id}`,
    templateId: template.id,
    templateName: template.name,
    mode: template.mode,
    track: template.track,
    focusTarget: template.focusTarget,
    status: 'paused',
    startedAt: '1970-01-01T00:00:00.000Z',
    completedSessionCount: 0,
    successfulSessionCount: 0,
    nextSessionIndex: 0,
  }
}

function App() {
  const [state, dispatch] = useReducer(appReducer, undefined, loadAppState)
  const [activeTab, setActiveTab] = useState<AppTab>('home')
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null)
  const [importText, setImportText] = useState('')
  const [dataMessage, setDataMessage] = useState('')
  const [csvRawText, setCsvRawText] = useState('')
  const [csvFileName, setCsvFileName] = useState('')
  const [csvProgramName, setCsvProgramName] = useState('Imported CSV Program')
  const [csvTrack, setCsvTrack] = useState<TrackType>('upper')
  const [csvMode, setCsvMode] = useState<ProgramMode>('main')
  const [csvFocusTarget, setCsvFocusTarget] = useState('biceps')
  const [csvDurationWeeks, setCsvDurationWeeks] = useState(8)
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([])
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([])

  const [exerciseInputs, setExerciseInputs] = useState<LogExerciseInput[]>([])
  const [activityInputs, setActivityInputs] = useState<LogActivityInput[]>([])
  const [sessionNote, setSessionNote] = useState('')
  const [sessionSuccessful, setSessionSuccessful] = useState(true)

  useEffect(() => {
    saveAppState(state)
  }, [state])

  const activeRuns = useMemo(() => getActiveRuns(state), [state])

  const suggestedRun = useMemo(() => getSuggestedRun(state), [state])

  const selectedRun = useMemo(() => {
    const manuallySelectedRun = state.selectedRunId
      ? activeRuns.find((run) => run.id === state.selectedRunId)
      : null

    return manuallySelectedRun ?? suggestedRun
  }, [activeRuns, state.selectedRunId, suggestedRun])

  const selectedTemplate = useMemo(() => {
    if (!selectedRun) {
      return null
    }

    return getTemplateById(state.programTemplates, selectedRun.templateId) ?? null
  }, [selectedRun, state.programTemplates])

  const plannedSession = useMemo(() => {
    if (!selectedRun || !selectedTemplate) {
      return null
    }

    return buildPlannedSession(selectedRun, selectedTemplate, state.workoutLogs)
  }, [selectedRun, selectedTemplate, state.workoutLogs])

  const previewTemplate = useMemo(() => {
    if (!previewTemplateId) {
      return null
    }

    return getTemplateById(state.programTemplates, previewTemplateId) ?? null
  }, [previewTemplateId, state.programTemplates])

  const previewRun = useMemo(() => {
    if (!previewTemplate) {
      return null
    }

    const existingRun = state.focusRuns
      .filter(
        (run) => run.templateId === previewTemplate.id && run.status !== 'archived',
      )
      .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))[0]

    return existingRun ?? createPreviewRun(previewTemplate)
  }, [previewTemplate, state.focusRuns])

  const sessionTabPlannedSession = useMemo(() => {
    if (!previewTemplate || !previewRun) {
      return plannedSession
    }

    return buildPlannedSession(previewRun, previewTemplate, state.workoutLogs)
  }, [plannedSession, previewRun, previewTemplate, state.workoutLogs])

  const planKey = plannedSession
    ? `${plannedSession.run.id}:${plannedSession.session.id}`
    : null

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!plannedSession || !planKey) {
      setExerciseInputs([])
      setActivityInputs([])
      setSessionNote('')
      return
    }

    setExerciseInputs(
      plannedSession.exercises.map((exercise) => ({
        exerciseId: exercise.id,
        completed: true,
        skipped: false,
        actualWeight:
          typeof exercise.plannedWeight === 'number'
            ? convertToDisplayedLbs(exercise.plannedWeight, exercise.weightUnit)
            : undefined,
      })),
    )

    setActivityInputs(
      (plannedSession.session.optionalActivities ?? []).map((activity) => ({
        activityId: activity.id,
        completed: false,
      })),
    )

    setSessionNote('')
    setSessionSuccessful(true)
  }, [planKey, plannedSession])
  /* eslint-enable react-hooks/set-state-in-effect */

  const activeTemplates = activeRuns
    .map((run) => getTemplateById(state.programTemplates, run.templateId))
    .filter((template): template is ProgramTemplate => Boolean(template))

  const modeLabel = formatModeLabel(activeTemplates)

  const runsByStatus = statusOrder.reduce<Record<RunStatus, typeof state.focusRuns>>(
    (acc, status) => {
      acc[status] = state.focusRuns
        .filter((run) => run.status === status)
        .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
      return acc
    },
    {
      active: [],
      paused: [],
      completed: [],
      archived: [],
    },
  )

  const templatesByMode = useMemo(() => {
    const grouped: Record<string, ProgramTemplate[]> = {
      main: [],
      travel: [],
      maintenance: [],
      backup: [],
    }

    state.programTemplates.forEach((template) => {
      grouped[template.mode].push(template)
    })

    return grouped
  }, [state.programTemplates])

  const selectedTemplateSet = useMemo(
    () => new Set(selectedTemplateIds),
    [selectedTemplateIds],
  )

  const selectedRunSet = useMemo(() => new Set(selectedRunIds), [selectedRunIds])

  const selectedRunCount = useMemo(
    () => state.focusRuns.filter((run) => selectedRunSet.has(run.id)).length,
    [state.focusRuns, selectedRunSet],
  )

  const lastWorkout = state.workoutLogs[0] ?? null

  const hasManualRunOverride = Boolean(
    state.selectedRunId && suggestedRun && state.selectedRunId !== suggestedRun.id,
  )

  function handleTabChange(tab: AppTab): void {
    setPreviewTemplateId(null)
    setActiveTab(tab)
  }

  function handleOpenTemplatePlan(templateId: string): void {
    setPreviewTemplateId(templateId)
    setActiveTab('session')
  }

  function handlePause(runId: string): void {
    const reason = window.prompt('Pause reason (optional):') ?? undefined
    dispatch({ type: 'pauseRun', runId, reason })
  }

  function updateExerciseInput(
    exerciseId: string,
    patch: Partial<LogExerciseInput>,
  ): void {
    setExerciseInputs((previous) =>
      previous.map((exerciseInput) =>
        exerciseInput.exerciseId === exerciseId
          ? { ...exerciseInput, ...patch }
          : exerciseInput,
      ),
    )
  }

  function updateActivityInput(
    activityId: string,
    patch: Partial<LogActivityInput>,
  ): void {
    setActivityInputs((previous) =>
      previous.map((activityInput) =>
        activityInput.activityId === activityId
          ? { ...activityInput, ...patch }
          : activityInput,
      ),
    )
  }

  function handleSubmitLog(): void {
    if (!plannedSession) {
      return
    }

    const normalizedExerciseInputs = exerciseInputs.map((exerciseInput) => {
      if (typeof exerciseInput.actualWeight !== 'number') {
        return exerciseInput
      }

      const matchingExercise = plannedSession.exercises.find(
        (exercise) => exercise.id === exerciseInput.exerciseId,
      )

      return {
        ...exerciseInput,
        actualWeight: convertFromDisplayedLbs(
          exerciseInput.actualWeight,
          matchingExercise?.weightUnit,
        ),
      }
    })

    dispatch({
      type: 'logSession',
      payload: {
        runId: plannedSession.run.id,
        completedAt: new Date().toISOString(),
        successful: sessionSuccessful,
        exerciseInputs: normalizedExerciseInputs,
        activityInputs,
        sessionNote,
      },
    })

    setPreviewTemplateId(null)
    setActiveTab('home')
  }

  function handleResetAllData(): void {
    const approved = window.confirm(
      'This will remove all runs and logs and load seeded templates. Continue?',
    )
    if (!approved) {
      return
    }

    clearAppState()
    dispatch({
      type: 'clearAllData',
      templates: seededProgramTemplates,
    })
    setDataMessage('State reset to seeded templates.')
  }

  function handleDeleteTemplate(templateId: string, templateName: string): void {
    const approved = window.confirm(
      `Delete program "${templateName}"? This cannot be undone.`,
    )
    if (!approved) {
      return
    }

    dispatch({
      type: 'deleteTemplates',
      templateIds: [templateId],
    })
    setSelectedTemplateIds((previous) =>
      previous.filter((selectedId) => selectedId !== templateId),
    )
    setDataMessage(`Deleted program "${templateName}".`)
  }

  function handleBulkDeleteTemplates(): void {
    const selectedTemplates = state.programTemplates.filter((template) =>
      selectedTemplateSet.has(template.id),
    )

    if (selectedTemplates.length === 0) {
      return
    }

    const approved = window.confirm(
      `Delete ${selectedTemplates.length} selected program(s)? This cannot be undone.`,
    )
    if (!approved) {
      return
    }

    dispatch({
      type: 'deleteTemplates',
      templateIds: selectedTemplates.map((template) => template.id),
    })
    setSelectedTemplateIds([])
    setDataMessage(`Deleted ${selectedTemplates.length} selected program(s).`)
  }

  function handleDeleteRun(runId: string, templateName: string): void {
    const relatedLogCount = state.workoutLogs.filter((log) => log.runId === runId).length
    const confirmMessage =
      relatedLogCount > 0
        ? `Delete run "${templateName}" and ${relatedLogCount} related log(s)? This cannot be undone.`
        : `Delete run "${templateName}"? This cannot be undone.`

    const approved = window.confirm(confirmMessage)
    if (!approved) {
      return
    }

    dispatch({ type: 'deleteRun', runId })
    setSelectedRunIds((previous) =>
      previous.filter((selectedId) => selectedId !== runId),
    )
    setDataMessage(`Deleted run "${templateName}".`)
  }

  function handleBulkDeleteRuns(): void {
    const selectedRuns = state.focusRuns.filter((run) => selectedRunSet.has(run.id))

    if (selectedRuns.length === 0) {
      return
    }

    const selectedRunIdSet = new Set(selectedRuns.map((run) => run.id))
    const relatedLogCount = state.workoutLogs.filter((log) =>
      selectedRunIdSet.has(log.runId),
    ).length

    const confirmMessage =
      relatedLogCount > 0
        ? `Delete ${selectedRuns.length} selected run(s) and ${relatedLogCount} related log(s)? This cannot be undone.`
        : `Delete ${selectedRuns.length} selected run(s)? This cannot be undone.`

    const approved = window.confirm(confirmMessage)
    if (!approved) {
      return
    }

    dispatch({
      type: 'deleteRuns',
      runIds: selectedRuns.map((run) => run.id),
    })
    setSelectedRunIds([])
    setDataMessage(`Deleted ${selectedRuns.length} selected run(s).`)
  }

  function handleExportState(): void {
    const text = exportAppStateJson(state)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const fileName = `training-os-backup-${timestamp}.json`
    const backupBlob = new Blob([text], { type: 'application/json;charset=utf-8' })
    const backupUrl = URL.createObjectURL(backupBlob)
    const link = document.createElement('a')
    link.href = backupUrl
    link.download = fileName
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(backupUrl), 0)

    setDataMessage(`Backup downloaded: ${fileName}`)
  }

  function handleExportCsvTemplate(template: ProgramTemplate): void {
    try {
      const result = exportProgramTemplateToCsv(template)
      const excelFriendlyCsvText =
        result.csvText.startsWith('\uFEFF') ? result.csvText : `\uFEFF${result.csvText}`
      const csvBlob = new Blob([excelFriendlyCsvText], {
        type: 'text/csv;charset=utf-8',
      })
      const csvUrl = URL.createObjectURL(csvBlob)
      const link = document.createElement('a')
      link.href = csvUrl
      link.download = result.fileName
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(csvUrl), 0)

      setDataMessage(
        result.skippedSessionCount > 0
          ? `CSV exported: ${result.fileName} (${result.exportedExerciseCount} exercises from the first session).`
          : `CSV exported: ${result.fileName}`,
      )
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown CSV export error.'
      setDataMessage(`CSV export failed: ${message}`)
    }
  }

  function handleImportState(): void {
    const imported = importStateFromJson(importText)
    if (!imported) {
      setDataMessage('Import failed: invalid JSON payload.')
      return
    }

    dispatch({ type: 'hydrate', payload: imported })
    setPreviewTemplateId(null)
    setDataMessage('State imported successfully.')
  }

  async function handleImportStateFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) {
      return
    }

    try {
      const text = await file.text()
      const imported = importStateFromJson(text)
      if (!imported) {
        setDataMessage('Import failed: invalid JSON payload in file.')
        return
      }

      dispatch({ type: 'hydrate', payload: imported })
      setImportText(text)
      setPreviewTemplateId(null)
      setDataMessage(`Imported backup file: ${file.name}`)
    } catch {
      setDataMessage('Failed to read backup file.')
    }
  }

  async function handleCsvFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) {
      return
    }

    try {
      const text = await file.text()
      const metadata = extractCsvImportMetadata(text)
      const effectiveFileName = metadata.sourceFileName?.trim() || file.name

      setCsvRawText(text)
      setCsvFileName(effectiveFileName)

      if (metadata.programName) {
        setCsvProgramName(metadata.programName)
      }

      if (metadata.mode) {
        setCsvMode(metadata.mode)
      }

      if (metadata.track) {
        setCsvTrack(metadata.track)
      }

      if (metadata.focusTarget) {
        setCsvFocusTarget(metadata.focusTarget)
      }

      if (typeof metadata.durationWeeks === 'number') {
        setCsvDurationWeeks(metadata.durationWeeks)
      }

      if (!metadata.programName && csvProgramName === 'Imported CSV Program') {
        setCsvProgramName(file.name.replace(/\.[^/.]+$/, ''))
      }

      setDataMessage(
        metadata.templateId
          ? `Loaded CSV: ${file.name} (program metadata detected).`
          : `Loaded CSV: ${file.name}`,
      )
    } catch {
      setDataMessage('Failed to read CSV file.')
    }
  }

  function handleImportCsvTemplate(): void {
    if (!csvRawText.trim()) {
      setDataMessage('Select a CSV file first.')
      return
    }

    try {
      const result = upsertProgramTemplateFromCsv({
        templates: state.programTemplates,
        csvText: csvRawText,
        fileName: csvFileName || undefined,
        programName: csvProgramName,
        mode: csvMode,
        track: csvTrack,
        focusTarget: csvFocusTarget,
        durationWeeks: csvDurationWeeks,
      })

      if (result.status === 'conflict') {
        const details = result.details
        const conflictParts: string[] = []

        if (details.templateId && details.resolvedTemplateIdByTemplateId) {
          conflictParts.push(
            `template-id "${details.templateId}" -> "${details.resolvedTemplateIdByTemplateId}"`,
          )
        }

        if (
          details.metadataSourceFileName &&
          details.resolvedTemplateIdBySourceFileName
        ) {
          conflictParts.push(
            `source-file-name "${details.metadataSourceFileName}" -> "${details.resolvedTemplateIdBySourceFileName}"`,
          )
        }

        const conflictDetails =
          conflictParts.length > 0 ? ` (${conflictParts.join('; ')})` : ''

        setDataMessage(`CSV import blocked: ${result.message}${conflictDetails}`)
        return
      }

      dispatch({
        type: 'replaceTemplates',
        templates: result.nextTemplates,
      })

      const warningSuffix =
        result.warnings.length > 0 ? ` Warnings: ${result.warnings.join(' ')}` : ''

      if (result.operation === 'updated') {
        setDataMessage(
          `Updated "${result.template.name}" from ${csvFileName}: ${result.diff.updatedExercises} changed, ${result.diff.addedExercises} added, ${result.diff.removedExercises} removed, ${result.diff.preservedExerciseIds} progression IDs preserved, ${result.diff.preservedSessions} non-imported sessions preserved.${warningSuffix}`,
        )
      } else {
        setDataMessage(
          `Imported "${result.template.name}" with ${result.diff.totalExercises} exercises.${warningSuffix}`,
        )
      }

      setActiveTab('runs')
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown CSV import error.'
      setDataMessage(`CSV import failed: ${message}`)
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>Training Control Panel</h1>
          <p className="subtitle">
            Session-based logic. Fast pre-workout plan view. Quick post-workout log.
          </p>
        </div>

        <div className="header-kpis">
          <div className="kpi">
            <span>Current Mode</span>
            <strong>{modeLabel}</strong>
          </div>
          <div className="kpi">
            <span>Active Tracks</span>
            <strong>{activeRuns.length}</strong>
          </div>
          <div className="kpi">
            <span>History Logs</span>
            <strong>{state.workoutLogs.length}</strong>
          </div>
        </div>
      </header>

      <nav className="tabs" aria-label="Main views">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={tab.id === activeTab ? 'tab tab-active' : 'tab'}
            onClick={() => handleTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'home' && (
        <section className="panel-grid">
          <article className="card card-primary">
            <h2>Next Session</h2>
            {plannedSession ? (
              <>
                <p className="next-session-title">{plannedSession.session.name}</p>
                <p>
                  Track: <strong>{plannedSession.run.track}</strong> | Focus:{' '}
                  <strong>{plannedSession.run.focusTarget}</strong>
                </p>
                <p>
                  Completed sessions in run:{' '}
                  <strong>{plannedSession.run.completedSessionCount}</strong>
                </p>
                <p>
                  Exercises today: <strong>{plannedSession.exercises.length}</strong>
                </p>
                <div className="action-row">
                  <button type="button" onClick={() => handleTabChange('session')}>
                    View Plan
                  </button>
                  <button type="button" onClick={() => handleTabChange('session')}>
                    Start Session
                  </button>
                  <button type="button" onClick={() => handleTabChange('log')}>
                    Finish / Log Session
                  </button>
                  <button type="button" onClick={() => handleTabChange('runs')}>
                    Пауза / Перейти на програму
                  </button>
                </div>
              </>
            ) : (
              <p>Немає активного тренування. Розпочніть з Програм / Тренувань.</p>
            )}
          </article>

          <article className="card">
            <h2>Остання завершена сесія</h2>
            {lastWorkout ? (
              <>
                <p className="next-session-title">{lastWorkout.sessionName}</p>
                <p>
                  {formatDateTime(lastWorkout.completedAt)} | Track: {lastWorkout.track}
                </p>
                <p>
                  Завершені вправи:{' '}
                  {
                    lastWorkout.exerciseLogs.filter(
                      (exerciseLog) => exerciseLog.completed && !exerciseLog.skipped,
                    ).length
                  }
                </p>
                {lastWorkout.sessionNote ? (
                  <p className="note">Note: {lastWorkout.sessionNote}</p>
                ) : null}
              </>
            ) : (
              <p>No logged sessions yet.</p>
            )}
          </article>

        </section>
      )}

      {activeTab === 'runs' && (
        <section className="panel-grid">
          <article className="card card-wide">
            <h2>Шаблони програм</h2>
            <div className="action-row">
              <button
                type="button"
                className="btn-danger"
                onClick={handleBulkDeleteTemplates}
                disabled={selectedTemplateIds.length === 0}
              >
                Delete selected ({selectedTemplateIds.length})
              </button>
              <button
                type="button"
                onClick={() => setSelectedTemplateIds([])}
                disabled={selectedTemplateIds.length === 0}
              >
                Clear selection
              </button>
            </div>

            {Object.entries(templatesByMode).map(([mode, templates]) => {
              const modeTemplateIds = new Set(templates.map((template) => template.id))
              const allModeSelected =
                templates.length > 0 &&
                templates.every((template) => selectedTemplateSet.has(template.id))
              const hasModeSelection = templates.some((template) =>
                selectedTemplateSet.has(template.id),
              )

              return (
                <div key={mode} className="template-group">
                  <div className="template-group-header">
                    <h3>{mode.toUpperCase()}</h3>
                    {templates.length > 0 ? (
                      <div className="action-row">
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedTemplateIds((previous) => {
                              const next = new Set(previous)
                              templates.forEach((template) => next.add(template.id))
                              return Array.from(next)
                            })
                          }
                          disabled={allModeSelected}
                        >
                          Select all
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedTemplateIds((previous) =>
                              previous.filter((selectedId) => !modeTemplateIds.has(selectedId)),
                            )
                          }
                          disabled={!hasModeSelection}
                        >
                          Clear
                        </button>
                      </div>
                    ) : null}
                  </div>

                  {templates.length === 0 ? (
                    <p className="muted">Немає шаблонів у цьому режимі.</p>
                  ) : (
                    <ul className="list-plain">
                      {templates.map((template) => (
                        <li key={template.id} className="item-row">
                          <div>
                            <label className="item-select-label">
                              <input
                                type="checkbox"
                                checked={selectedTemplateSet.has(template.id)}
                                onChange={(event) =>
                                  setSelectedTemplateIds((previous) => {
                                    if (event.target.checked) {
                                      return previous.includes(template.id)
                                        ? previous
                                        : [...previous, template.id]
                                    }

                                    return previous.filter(
                                      (selectedId) => selectedId !== template.id,
                                    )
                                  })
                                }
                              />
                              <strong>{template.name}</strong>
                            </label>
                            <div className="muted">
                              Напрямок: {template.track} | Фокус: {template.focusTarget} | Сесії:{' '}
                              {template.sessions.length}
                            </div>
                          </div>
                          <div className="action-row">
                            <button
                              type="button"
                              onClick={() =>
                                dispatch({
                                  type: 'startRun',
                                  templateId: template.id,
                                  now: new Date().toISOString(),
                                })
                              }
                            >
                              Розпочати тренування
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenTemplatePlan(template.id)}
                            >
                              View Plan
                            </button>
                            <button
                              type="button"
                              onClick={() => handleExportCsvTemplate(template)}
                            >
                              Export CSV
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTemplate(template.id, template.name)}
                              className="btn-danger"
                            >
                              Delete
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </article>

          <article className="card card-wide">
            <h2>Тренування фокусу</h2>
            <div className="action-row">
              <button
                type="button"
                className="btn-danger"
                onClick={handleBulkDeleteRuns}
                disabled={selectedRunCount === 0}
              >
                Delete selected ({selectedRunCount})
              </button>
              <button
                type="button"
                onClick={() => setSelectedRunIds([])}
                disabled={selectedRunCount === 0}
              >
                Clear selection
              </button>
            </div>

            {statusOrder.map((status) => {
              const statusRuns = runsByStatus[status]
              const statusRunIds = new Set(statusRuns.map((run) => run.id))
              const allStatusSelected =
                statusRuns.length > 0 &&
                statusRuns.every((run) => selectedRunSet.has(run.id))
              const hasStatusSelection = statusRuns.some((run) =>
                selectedRunSet.has(run.id),
              )

              return (
                <div key={status} className="template-group">
                  <div className="template-group-header">
                    <h3>
                      {statusLabel[status]} ({statusRuns.length})
                    </h3>
                    {statusRuns.length > 0 ? (
                      <div className="action-row">
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedRunIds((previous) => {
                              const next = new Set(previous)
                              statusRuns.forEach((run) => next.add(run.id))
                              return Array.from(next)
                            })
                          }
                          disabled={allStatusSelected}
                        >
                          Select all
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedRunIds((previous) =>
                              previous.filter((selectedId) => !statusRunIds.has(selectedId)),
                            )
                          }
                          disabled={!hasStatusSelection}
                        >
                          Clear
                        </button>
                      </div>
                    ) : null}
                  </div>

                  {statusRuns.length === 0 ? (
                    <p className="muted">Немає тренувань у цьому статусі.</p>
                  ) : (
                    <ul className="list-plain">
                      {statusRuns.map((run) => (
                        <li key={run.id} className="item-row item-row-stack">
                          <div>
                            <label className="item-select-label">
                              <input
                                type="checkbox"
                                checked={selectedRunSet.has(run.id)}
                                onChange={(event) =>
                                  setSelectedRunIds((previous) => {
                                    if (event.target.checked) {
                                      return previous.includes(run.id)
                                        ? previous
                                        : [...previous, run.id]
                                    }

                                    return previous.filter(
                                      (selectedId) => selectedId !== run.id,
                                    )
                                  })
                                }
                              />
                              <strong>{run.templateName}</strong>
                            </label>
                            <div className="muted">
                              Напрямок: {run.track} | Фокус: {run.focusTarget} | Розпочато:{' '}
                              {formatDateTime(run.startedAt)}
                            </div>
                            <div className="muted">
                              Завершені сесії: {run.completedSessionCount} | Наступна позиція:{' '}
                              {run.nextSessionIndex + 1}
                            </div>
                            {run.pauseReason ? (
                              <div className="note">Pause reason: {run.pauseReason}</div>
                            ) : null}
                          </div>

                          <div className="action-row">
                            <button
                              type="button"
                              onClick={() => dispatch({ type: 'setSelectedRun', runId: run.id })}
                            >
                              Select
                            </button>

                            {run.status === 'active' ? (
                              <>
                                <button type="button" onClick={() => handlePause(run.id)}>
                                  Pause
                                </button>
                                <button
                                  type="button"
                                  onClick={() => dispatch({ type: 'completeRun', runId: run.id })}
                                >
                                  Complete
                                </button>
                              </>
                            ) : null}

                            {run.status === 'paused' ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => dispatch({ type: 'resumeRun', runId: run.id })}
                                >
                                  Resume
                                </button>
                                <button
                                  type="button"
                                  onClick={() => dispatch({ type: 'switchRun', runId: run.id })}
                                >
                                  Switch To This
                                </button>
                              </>
                            ) : null}

                            {(run.status === 'active' || run.status === 'paused') && (
                              <button
                                type="button"
                                onClick={() =>
                                  dispatch({
                                    type: 'restartRun',
                                    runId: run.id,
                                    now: new Date().toISOString(),
                                  })
                                }
                              >
                                Restart
                              </button>
                            )}

                            {run.status !== 'archived' ? (
                              <button
                                type="button"
                                onClick={() => dispatch({ type: 'archiveRun', runId: run.id })}
                              >
                                Archive
                              </button>
                            ) : null}

                            <button
                              type="button"
                              className="btn-danger"
                              onClick={() => handleDeleteRun(run.id, run.templateName)}
                            >
                              Delete
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </article>
        </section>
      )}

      {activeTab === 'session' && (
        <section className="panel-grid">
          <article className="card card-wide">
            <SessionPlanPanel
              plannedSession={sessionTabPlannedSession}
              activeRuns={previewTemplate ? [] : activeRuns}
              selectedRun={previewTemplate ? null : selectedRun}
              hasManualRunOverride={previewTemplate ? false : hasManualRunOverride}
              previewTemplateName={previewTemplate?.name ?? null}
              onSelectRun={(runId) => {
                setPreviewTemplateId(null)
                dispatch({ type: 'setSelectedRun', runId })
              }}
              onResetToSuggestedRun={() => {
                setPreviewTemplateId(null)
                dispatch({ type: 'setSelectedRun', runId: null })
              }}
            />
          </article>
        </section>
      )}

      {activeTab === 'log' && (
        <section className="panel-grid">
          <article className="card card-wide">
            <h2>Finish / Log Session</h2>
            {plannedSession ? (
              <>
                <p className="next-session-title">{plannedSession.session.name}</p>
                <p className="muted">
                  Log quickly after training. Defaults are prefilled to reduce taps.
                </p>

                <div className="log-desktop-table">
                  <table className="plan-table">
                    <thead>
                      <tr>
                        <th>Exercise</th>
                        <th>Completed</th>
                        <th>Skipped</th>
                        <th>Actual weight (lbs)</th>
                        <th>Difficulty</th>
                        <th>Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plannedSession.exercises.map((exercise) => {
                        const exerciseInput =
                          exerciseInputs.find((item) => item.exerciseId === exercise.id) ??
                          null

                        return (
                          <tr key={exercise.id}>
                            <td>{exercise.name}</td>
                            <td>
                              <input
                                type="checkbox"
                                checked={exerciseInput?.completed ?? false}
                                onChange={(event) =>
                                  updateExerciseInput(exercise.id, {
                                    completed: event.target.checked,
                                    skipped: event.target.checked
                                      ? false
                                      : exerciseInput?.skipped ?? false,
                                  })
                                }
                              />
                            </td>
                            <td>
                              <input
                                type="checkbox"
                                checked={exerciseInput?.skipped ?? false}
                                onChange={(event) =>
                                  updateExerciseInput(exercise.id, {
                                    skipped: event.target.checked,
                                    completed: event.target.checked ? false : true,
                                  })
                                }
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                value={exerciseInput?.actualWeight ?? ''}
                                onChange={(event) =>
                                  updateExerciseInput(exercise.id, {
                                    actualWeight:
                                      event.target.value === ''
                                        ? undefined
                                        : Number(event.target.value),
                                  })
                                }
                              />
                            </td>
                            <td>
                              <select
                                value={exerciseInput?.difficulty ?? ''}
                                onChange={(event) =>
                                  updateExerciseInput(exercise.id, {
                                    difficulty:
                                      event.target.value === ''
                                        ? undefined
                                        : (event.target.value as ExerciseDifficulty),
                                  })
                                }
                              >
                                <option value="">-</option>
                                <option value="easy">easy</option>
                                <option value="okay">okay</option>
                                <option value="hard">hard</option>
                              </select>
                            </td>
                            <td>
                              <input
                                type="text"
                                value={exerciseInput?.note ?? ''}
                                onChange={(event) =>
                                  updateExerciseInput(exercise.id, {
                                    note: event.target.value,
                                  })
                                }
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="log-mobile-cards" aria-label="Exercise log cards">
                  {plannedSession.exercises.map((exercise) => {
                    const exerciseInput =
                      exerciseInputs.find((item) => item.exerciseId === exercise.id) ?? null

                    return (
                      <article key={exercise.id} className="log-exercise-card">
                        <h3>{exercise.name}</h3>
                        <p className="muted">
                          Sets: {exercise.sets} | Reps: {exercise.reps}
                        </p>

                        <div className="log-checkbox-grid">
                          <label className="log-checkbox-field">
                            Completed
                            <input
                              type="checkbox"
                              checked={exerciseInput?.completed ?? false}
                              onChange={(event) =>
                                updateExerciseInput(exercise.id, {
                                  completed: event.target.checked,
                                  skipped: event.target.checked
                                    ? false
                                    : exerciseInput?.skipped ?? false,
                                })
                              }
                            />
                          </label>

                          <label className="log-checkbox-field">
                            Skipped
                            <input
                              type="checkbox"
                              checked={exerciseInput?.skipped ?? false}
                              onChange={(event) =>
                                updateExerciseInput(exercise.id, {
                                  skipped: event.target.checked,
                                  completed: event.target.checked ? false : true,
                                })
                              }
                            />
                          </label>
                        </div>

                        <div className="log-input-grid">
                          <label className="stacked-field">
                            Actual weight (lbs)
                            <input
                              type="number"
                              value={exerciseInput?.actualWeight ?? ''}
                              onChange={(event) =>
                                updateExerciseInput(exercise.id, {
                                  actualWeight:
                                    event.target.value === ''
                                      ? undefined
                                      : Number(event.target.value),
                                })
                              }
                            />
                          </label>

                          <label className="stacked-field">
                            Difficulty
                            <select
                              value={exerciseInput?.difficulty ?? ''}
                              onChange={(event) =>
                                updateExerciseInput(exercise.id, {
                                  difficulty:
                                    event.target.value === ''
                                      ? undefined
                                      : (event.target.value as ExerciseDifficulty),
                                })
                              }
                            >
                              <option value="">-</option>
                              <option value="easy">easy</option>
                              <option value="okay">okay</option>
                              <option value="hard">hard</option>
                            </select>
                          </label>

                          <label className="stacked-field">
                            Note
                            <input
                              type="text"
                              value={exerciseInput?.note ?? ''}
                              onChange={(event) =>
                                updateExerciseInput(exercise.id, {
                                  note: event.target.value,
                                })
                              }
                            />
                          </label>
                        </div>
                      </article>
                    )
                  })}
                </div>

                {(plannedSession.session.optionalActivities?.length ?? 0) > 0 ? (
                  <div className="activities">
                    <h3>Optional Activities</h3>
                    <ul className="list-plain">
                      {plannedSession.session.optionalActivities?.map((activity) => {
                        const activityInput =
                          activityInputs.find((item) => item.activityId === activity.id) ??
                          null

                        return (
                          <li key={activity.id} className="item-row">
                            <strong>{activity.name}</strong>
                            <label>
                              done
                              <input
                                type="checkbox"
                                checked={activityInput?.completed ?? false}
                                onChange={(event) =>
                                  updateActivityInput(activity.id, {
                                    completed: event.target.checked,
                                  })
                                }
                              />
                            </label>
                            <input
                              type="text"
                              placeholder={activity.defaultDuration ?? 'duration'}
                              value={activityInput?.duration ?? ''}
                              onChange={(event) =>
                                updateActivityInput(activity.id, {
                                  duration: event.target.value,
                                })
                              }
                            />
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ) : null}

                <label className="stacked-field">
                  Session note
                  <textarea
                    value={sessionNote}
                    onChange={(event) => setSessionNote(event.target.value)}
                    rows={3}
                    placeholder="Optional summary note"
                  />
                </label>

                <label className="inline-field">
                  <span>Session counts for progression</span>
                  <select
                    value={sessionSuccessful ? 'yes' : 'no'}
                    onChange={(event) =>
                      setSessionSuccessful(event.target.value === 'yes')
                    }
                  >
                    <option value="yes">Yes (successful)</option>
                    <option value="no">No (logged but no progression)</option>
                  </select>
                </label>

                <div className="action-row">
                  <button type="button" onClick={handleSubmitLog}>
                    Save Session Log
                  </button>
                </div>
              </>
            ) : (
              <p>No active planned session to log.</p>
            )}
          </article>
        </section>
      )}

      {activeTab === 'history' && (
        <section className="panel-grid">
          <article className="card card-wide">
            <h2>History</h2>
            {state.workoutLogs.length === 0 ? (
              <p>No logs yet.</p>
            ) : (
              <ul className="list-plain">
                {state.workoutLogs.map((log) => (
                  <li key={log.id} className="item-row item-row-stack">
                    <div>
                      <strong>{log.sessionName}</strong>
                      <div className="muted">
                        {formatDateTime(log.completedAt)} | Track: {log.track}
                      </div>
                      <div className="muted">
                        Completed:{' '}
                        {
                          log.exerciseLogs.filter(
                            (exerciseLog) => exerciseLog.completed && !exerciseLog.skipped,
                          ).length
                        }
                        /{log.exerciseLogs.length}
                      </div>
                      {log.sessionNote ? <div className="note">{log.sessionNote}</div> : null}
                    </div>

                    <div className="history-exercises">
                      {log.exerciseLogs.map((exerciseLog) => (
                        <div key={exerciseLog.exerciseId} className="history-row">
                          <span>{exerciseLog.exerciseName}</span>
                          <span>
                            {exerciseLog.skipped
                              ? 'skipped'
                              : exerciseLog.actualWeight !== undefined
                                ? formatWeightInLbs(
                                    exerciseLog.actualWeight,
                                    exerciseLog.weightUnit,
                                  )
                                : 'done'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </article>
        </section>
      )}

      {activeTab === 'data' && (
        <section className="panel-grid">
          <article className="card card-wide">
            <h2>Import / Data Management</h2>
            <p className="muted">
              Use one-tap JSON backup files to keep your training data safe between app
              updates.
            </p>

            <div className="template-group">
              <h3>State Backup</h3>
              <div className="action-row">
                <button type="button" onClick={handleExportState}>
                  Download Backup JSON
                </button>
                <label className="stacked-field inline-file-field">
                  Import Backup JSON File
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={handleImportStateFileChange}
                  />
                </label>
              </div>
            </div>

            <div className="template-group">
              <h3>CSV Program Import / Update</h3>
              <p className="muted">
                Choose your template CSV (for example Book 2(...).csv), set basic
                metadata, then import. Uploading the same filename updates the
                existing imported program instead of creating a duplicate.
              </p>

              <label className="stacked-field">
                CSV file
                <input type="file" accept=".csv,text/csv" onChange={handleCsvFileChange} />
              </label>

              {csvFileName ? <p className="muted">Loaded file: {csvFileName}</p> : null}

              <div className="action-row">
                <label className="inline-field">
                  Program name
                  <input
                    type="text"
                    value={csvProgramName}
                    onChange={(event) => setCsvProgramName(event.target.value)}
                  />
                </label>

                <label className="inline-field">
                  Mode
                  <select
                    value={csvMode}
                    onChange={(event) => setCsvMode(event.target.value as ProgramMode)}
                  >
                    <option value="main">main</option>
                    <option value="travel">travel</option>
                    <option value="maintenance">maintenance</option>
                    <option value="backup">backup</option>
                  </select>
                </label>

                <label className="inline-field">
                  Track
                  <select
                    value={csvTrack}
                    onChange={(event) => setCsvTrack(event.target.value as TrackType)}
                  >
                    <option value="upper">upper</option>
                    <option value="lower">lower</option>
                    <option value="custom">custom</option>
                  </select>
                </label>

                <label className="inline-field">
                  Focus target
                  <input
                    type="text"
                    value={csvFocusTarget}
                    onChange={(event) => setCsvFocusTarget(event.target.value)}
                  />
                </label>

                <label className="inline-field">
                  Duration (weeks)
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={csvDurationWeeks}
                    onChange={(event) => {
                      const nextValue = Number(event.target.value)
                      setCsvDurationWeeks(
                        Number.isFinite(nextValue) && nextValue > 0
                          ? Math.round(nextValue)
                          : 8,
                      )
                    }}
                  />
                </label>
              </div>

              <div className="action-row">
                <button type="button" onClick={handleImportCsvTemplate}>
                  Import / Update CSV Template
                </button>
              </div>
            </div>

            <div className="action-row">
              <button
                type="button"
                onClick={() =>
                  dispatch({
                    type: 'replaceTemplates',
                    templates: seededProgramTemplates,
                  })
                }
              >
                Replace Templates From Seed
              </button>
              <button type="button" onClick={handleResetAllData}>
                Reset All Data
              </button>
              <button type="button" onClick={handleImportState}>
                Import JSON From Box
              </button>
            </div>

            <label className="stacked-field">
              State JSON (legacy/manual import)
              <textarea
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                rows={16}
              />
            </label>

            {dataMessage ? <p className="note">{dataMessage}</p> : null}
          </article>
        </section>
      )}
    </main>
  )
}

export default App
