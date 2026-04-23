import { useState } from 'react'
import type { ProgramCalendar } from '../../domain/types'
import './ProgramCalendarView.css'

interface ProgramCalendarViewProps {
  calendar: ProgramCalendar | null
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  })
}

function formatWeight(weight?: number, unit?: string): string {
  if (typeof weight !== 'number') {
    return '-'
  }
  return `${weight.toFixed(1)} ${unit ?? 'kg'}`.trim()
}

function formatPerSideWeight(weight?: number, unit?: string): string {
  if (typeof weight !== 'number') {
    return '-'
  }
  return `${weight.toFixed(1)}/side ${unit ?? 'kg'}`.trim()
}

export function ProgramCalendarView({ calendar }: ProgramCalendarViewProps) {
  const [expandedSessions, setExpandedSessions] = useState<Set<number>>(new Set())

  if (!calendar) {
    return (
      <section className="panel-grid">
        <article className="card card-wide">
          <h2>Календар</h2>
          <p className="muted">No active run. Select a run from the Programs tab.</p>
        </article>
      </section>
    )
  }

  const toggleSession = (sessionIndex: number) => {
    const newExpanded = new Set(expandedSessions)
    if (newExpanded.has(sessionIndex)) {
      newExpanded.delete(sessionIndex)
    } else {
      newExpanded.add(sessionIndex)
    }
    setExpandedSessions(newExpanded)
  }

  return (
    <section className="panel-grid">
      <article className="card card-wide">
        <h2>Календар Прогресу</h2>

        <div className="calendar-header">
          <div className="calendar-header-stat">
            <strong>Початок:</strong> {formatDate(calendar.startDate)}
          </div>
          <div className="calendar-header-stat">
            <strong>Прогнозований кінець:</strong> {formatDate(calendar.estimatedEndDate)}
          </div>
          <div className="calendar-header-stat">
            <strong>Середня перерва:</strong> {calendar.avgDaysBetweenSessions.toFixed(1)} днів
          </div>
        </div>

        <div className="calendar-sessions">
          {calendar.sessions.map((session) => (
            <div
              key={session.sessionIndex}
              className={`calendar-session ${session.isCompleted ? 'completed' : 'projected'}`}
            >
              <button
                type="button"
                className="session-header"
                onClick={() => toggleSession(session.sessionIndex)}
              >
                <span className="session-number">
                  Session {session.sessionIndex + 1}
                </span>
                <span className="session-name">{session.sessionName}</span>
                <span className={`session-track session-track-${session.track}`}>
                  {session.track}
                </span>
                {session.isCompleted ? (
                  <span className="session-status">✓ {formatDate(session.loggedDate!)}</span>
                ) : (
                  <span className="session-status projected">→ {formatDate(session.projectedDate!)}</span>
                )}
              </button>

              {expandedSessions.has(session.sessionIndex) && (
                <div className="session-exercises">
                  {session.exercises.map((exercise) => (
                    <div key={exercise.id} className="exercise-row">
                      <div className="exercise-name">{exercise.name}</div>
                      <div className="exercise-details">
                        <div className="exercise-meta">
                          {exercise.sets} × {exercise.reps}
                        </div>
                        <div className="exercise-weight">
                          {exercise.plannedWeightPerSide !== undefined ? (
                            <span className="per-side">
                              {formatPerSideWeight(exercise.plannedWeightPerSide, exercise.weightUnit)}
                            </span>
                          ) : (
                            <span className="total">
                              {formatWeight(exercise.plannedWeight, exercise.weightUnit)}
                            </span>
                          )}
                        </div>
                        {exercise.completed && exercise.actualWeight !== undefined && (
                          <div className="exercise-actual">
                            Logged: {formatWeight(exercise.actualWeight, exercise.weightUnit)}
                          </div>
                        )}
                        {exercise.skipped && (
                          <div className="exercise-skipped">Skipped</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </article>
    </section>
  )
}
