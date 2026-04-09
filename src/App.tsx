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
import { importProgramTemplateFromCsv } from './data/csvImport'
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

function App() {
  const [state, dispatch] = useReducer(appReducer, undefined, loadAppState)
  const [activeTab, setActiveTab] = useState<AppTab>('home')
  const [importText, setImportText] = useState('')
  const [dataMessage, setDataMessage] = useState('')
  const [csvRawText, setCsvRawText] = useState('')
  const [csvFileName, setCsvFileName] = useState('')
  const [csvProgramName, setCsvProgramName] = useState('Imported CSV Program')
  const [csvTrack, setCsvTrack] = useState<TrackType>('upper')
  const [csvMode, setCsvMode] = useState<ProgramMode>('main')
  const [csvFocusTarget, setCsvFocusTarget] = useState('biceps')

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

    return buildPlannedSession(selectedRun, selectedTemplate)
  }, [selectedRun, selectedTemplate])

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
        actualWeight: exercise.plannedWeight,
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

  const lastWorkout = state.workoutLogs[0] ?? null

  const upcomingProgression = plannedSession?.exercises.find(
    (exercise) => exercise.progressionNote,
  )

  const hasManualRunOverride = Boolean(
    state.selectedRunId && suggestedRun && state.selectedRunId !== suggestedRun.id,
  )

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

    dispatch({
      type: 'logSession',
      payload: {
        runId: plannedSession.run.id,
        completedAt: new Date().toISOString(),
        successful: sessionSuccessful,
        exerciseInputs,
        activityInputs,
        sessionNote,
      },
    })

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
      type: 'deleteTemplate',
      templateId,
    })
    setDataMessage(`Deleted program "${templateName}".`)
  }

  function handleExportState(): void {
    const text = exportAppStateJson(state)
    setImportText(text)
    setDataMessage('Export generated below.')
  }

  function handleImportState(): void {
    const imported = importStateFromJson(importText)
    if (!imported) {
      setDataMessage('Import failed: invalid JSON payload.')
      return
    }

    dispatch({ type: 'hydrate', payload: imported })
    setDataMessage('State imported successfully.')
  }

  async function handleCsvFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    try {
      const text = await file.text()
      setCsvRawText(text)
      setCsvFileName(file.name)

      if (csvProgramName === 'Imported CSV Program') {
        setCsvProgramName(file.name.replace(/\.[^/.]+$/, ''))
      }

      setDataMessage(`Loaded CSV: ${file.name}`)
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
      const importedTemplate = importProgramTemplateFromCsv(csvRawText, {
        fileName: csvFileName || undefined,
        programName: csvProgramName,
        mode: csvMode,
        track: csvTrack,
        focusTarget: csvFocusTarget,
      })

      const nextTemplates = [
        ...state.programTemplates,
        importedTemplate,
      ]

      dispatch({
        type: 'replaceTemplates',
        templates: nextTemplates,
      })

      setDataMessage(
        `Imported "${importedTemplate.name}" with ${importedTemplate.sessions[0].exercises.length} exercises.`,
      )
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
            onClick={() => setActiveTab(tab.id)}
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
                  <button type="button" onClick={() => setActiveTab('session')}>
                    View Plan
                  </button>
                  <button type="button" onClick={() => setActiveTab('session')}>
                    Start Session
                  </button>
                  <button type="button" onClick={() => setActiveTab('log')}>
                    Finish / Log Session
                  </button>
                  <button type="button" onClick={() => setActiveTab('runs')}>
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

          <article className="card">
            <h2>Progression Incoming</h2>
            {upcomingProgression ? (
              <>
                <p className="next-session-title">{upcomingProgression.name}</p>
                <p>{upcomingProgression.progressionNote}</p>
                {upcomingProgression.nextTargetHint ? (
                  <p>{upcomingProgression.nextTargetHint}</p>
                ) : null}
              </>
            ) : (
              <p>No progression rule in the selected next session.</p>
            )}
          </article>
        </section>
      )}

      {activeTab === 'runs' && (
        <section className="panel-grid">
          <article className="card card-wide">
            <h2>Шаблони програм</h2>
            {Object.entries(templatesByMode).map(([mode, templates]) => (
              <div key={mode} className="template-group">
                <h3>{mode.toUpperCase()}</h3>
                {templates.length === 0 ? (
                  <p className="muted">Немає шаблонів у цьому режимі.</p>
                ) : (
                  <ul className="list-plain">
                    {templates.map((template) => (
                      <li key={template.id} className="item-row">
                        <div>
                          <strong>{template.name}</strong>
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
            ))}
          </article>

          <article className="card card-wide">
            <h2>Тренування фокусу</h2>
            {statusOrder.map((status) => (
              <div key={status} className="template-group">
                <h3>
                  {statusLabel[status]} ({runsByStatus[status].length})
                </h3>

                {runsByStatus[status].length === 0 ? (
                  <p className="muted">Немає тренувань у цьому статусі.</p>
                ) : (
                  <ul className="list-plain">
                    {runsByStatus[status].map((run) => (
                      <li key={run.id} className="item-row item-row-stack">
                        <div>
                          <strong>{run.templateName}</strong>
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
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </article>
        </section>
      )}

      {activeTab === 'session' && (
        <section className="panel-grid">
          <article className="card card-wide">
            <SessionPlanPanel
              plannedSession={plannedSession}
              activeRuns={activeRuns}
              selectedRun={selectedRun}
              hasManualRunOverride={hasManualRunOverride}
              onSelectRun={(runId) => dispatch({ type: 'setSelectedRun', runId })}
              onResetToSuggestedRun={() =>
                dispatch({ type: 'setSelectedRun', runId: null })
              }
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

                <table className="plan-table">
                  <thead>
                    <tr>
                      <th>Exercise</th>
                      <th>Completed</th>
                      <th>Skipped</th>
                      <th>Actual weight</th>
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
                                ? `${exerciseLog.actualWeight} ${exerciseLog.weightUnit ?? ''}`
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
              You can import program templates from CSV now, and still use JSON state
              import/export for full backups.
            </p>

            <div className="template-group">
              <h3>CSV Program Import</h3>
              <p className="muted">
                Choose your template CSV (for example Book 2(...).csv), set basic
                metadata, then import.
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
              </div>

              <div className="action-row">
                <button type="button" onClick={handleImportCsvTemplate}>
                  Import CSV As Template
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
              <button type="button" onClick={handleExportState}>
                Export State JSON
              </button>
              <button type="button" onClick={handleImportState}>
                Import JSON From Box
              </button>
            </div>

            <label className="stacked-field">
              State JSON
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

      <footer className="footer-note">
        Core logic decisions: global upper/lower alternation by last completed track,
        progression based on successful run sessions, manual-seed import in MVP.
      </footer>
    </main>
  )
}

export default App
