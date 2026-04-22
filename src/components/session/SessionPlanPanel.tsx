import { useMemo, useRef, useState } from 'react'
import type { FocusRun, PlannedExercise, PlannedSession } from '../../domain/types'
import { SessionExerciseCardList } from './SessionExerciseCardList'
import { SessionExerciseDetailsModal } from './SessionExerciseDetailsModal'

interface SessionPlanPanelProps {
  plannedSession: PlannedSession | null
  activeRuns: FocusRun[]
  selectedRun: FocusRun | null
  hasManualRunOverride: boolean
  previewTemplateName?: string | null
  onSelectRun: (runId: string) => void
  onResetToSuggestedRun: () => void
}

export function SessionPlanPanel({
  plannedSession,
  activeRuns,
  selectedRun,
  hasManualRunOverride,
  previewTemplateName,
  onSelectRun,
  onResetToSuggestedRun,
}: SessionPlanPanelProps) {
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null)
  const [detailsExerciseId, setDetailsExerciseId] = useState<string | null>(null)
  const lastTriggerRef = useRef<HTMLElement | null>(null)
  const exercises = plannedSession?.exercises ?? []
  const sessionsDone = plannedSession?.run.completedSessionCount ?? 0
  const sessionsLeft = Math.max(0, 16 - sessionsDone)

  function hasExerciseId(exerciseId: string | null): exerciseId is string {
    return Boolean(
      exerciseId && exercises.some((exercise) => exercise.id === exerciseId),
    )
  }

  const effectiveSelectedExerciseId = hasExerciseId(selectedExerciseId)
    ? selectedExerciseId
    : exercises[0]?.id ?? null

  const effectiveDetailsExerciseId = hasExerciseId(detailsExerciseId)
    ? detailsExerciseId
    : null

  const detailsExercise = useMemo<PlannedExercise | null>(() => {
    if (!plannedSession || !effectiveDetailsExerciseId) {
      return null
    }

    return (
      plannedSession.exercises.find(
        (exercise) => exercise.id === effectiveDetailsExerciseId,
      ) ?? null
    )
  }, [effectiveDetailsExerciseId, plannedSession])

  const selectedExerciseOrder = useMemo(() => {
    if (!plannedSession || !effectiveSelectedExerciseId) {
      return null
    }

    const index = plannedSession.exercises.findIndex(
      (exercise) => exercise.id === effectiveSelectedExerciseId,
    )

    return index >= 0 ? index + 1 : null
  }, [effectiveSelectedExerciseId, plannedSession])

  const detailsExerciseOrder = useMemo(() => {
    if (!plannedSession || !detailsExercise) {
      return null
    }

    const index = plannedSession.exercises.findIndex(
      (exercise) => exercise.id === detailsExercise.id,
    )

    return index >= 0 ? index + 1 : null
  }, [detailsExercise, plannedSession])

  function handleOpenExercise(exerciseId: string, trigger: HTMLElement): void {
    lastTriggerRef.current = trigger
    setSelectedExerciseId(exerciseId)
    setDetailsExerciseId(exerciseId)
  }

  function handleCloseDetailsModal(): void {
    setDetailsExerciseId(null)
    lastTriggerRef.current?.focus()
  }

  return (
    <>
      <h2>Session Plan</h2>
      {previewTemplateName ? <p className="note">Template preview: {previewTemplateName}</p> : null}
      {activeRuns.length > 0 ? (
        <div className="action-row">
          <label className="inline-field">
            Active run:
            <select
              value={selectedRun?.id ?? ''}
              onChange={(event) => onSelectRun(event.target.value)}
            >
              {activeRuns.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.templateName} ({run.track})
                </option>
              ))}
            </select>
          </label>

          {hasManualRunOverride ? (
            <button type="button" onClick={onResetToSuggestedRun}>
              Use Suggested Alternation
            </button>
          ) : null}
        </div>
      ) : null}

      {plannedSession ? (
        <>
          <p className="next-session-title">{plannedSession.session.name}</p>
          <p className="muted">
            Focus: {plannedSession.run.focusTarget} | Track: {plannedSession.run.track}
          </p>

          <div className="session-plan-meta">
            <span className="session-meta-pill">
              Exercises: <strong>{plannedSession.exercises.length}</strong>
            </span>
            <span className="session-meta-pill">
              Active: <strong>{selectedExerciseOrder ? `#${selectedExerciseOrder}` : '-'}</strong>
            </span>
          </div>

          {plannedSession.session.note ? (
            <p className="note">{plannedSession.session.note}</p>
          ) : null}

          <SessionExerciseCardList
            exercises={plannedSession.exercises}
            selectedExerciseId={effectiveSelectedExerciseId}
            sessionsDone={sessionsDone}
            sessionsLeft={sessionsLeft}
            onOpenExercise={handleOpenExercise}
          />

          {(plannedSession.session.optionalActivities?.length ?? 0) > 0 ? (
            <div className="activities">
              <h3>Optional Activities</h3>
              <ul className="list-plain">
                {plannedSession.session.optionalActivities?.map((activity) => (
                  <li key={activity.id} className="item-row">
                    <div>
                      <strong>{activity.name}</strong>
                      {activity.defaultDuration ? (
                        <div className="muted">Duration: {activity.defaultDuration}</div>
                      ) : null}
                      {activity.note ? <div className="muted">{activity.note}</div> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : (
        <p>No active run selected.</p>
      )}

      <SessionExerciseDetailsModal
        exercise={detailsExercise}
        exerciseOrder={detailsExerciseOrder}
        onClose={handleCloseDetailsModal}
      />
    </>
  )
}
