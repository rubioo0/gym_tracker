import type { PlannedExercise } from '../../domain/types'
import {
  formatExerciseHistoryEntry,
  formatPlannedWeightOverview,
  formatProgressionCycle,
  formatProgressionSource,
  getExerciseCategory,
  getExerciseCategoryLabel,
} from './sessionPlanUtils'

interface SessionExerciseCardListProps {
  exercises: PlannedExercise[]
  selectedExerciseId: string | null
  showProgressionInsights: boolean
  onOpenExercise: (
    exerciseId: string,
    trigger: HTMLButtonElement,
  ) => void
}

export function SessionExerciseCardList({
  exercises,
  selectedExerciseId,
  showProgressionInsights,
  onOpenExercise,
}: SessionExerciseCardListProps) {
  return (
    <ol className="exercise-card-list" aria-label="Planned exercises">
      {exercises.map((exercise, index) => {
        const isActive = selectedExerciseId === exercise.id
        const category = getExerciseCategory(exercise.name)
        const categoryLabel = getExerciseCategoryLabel(category)
        const progressionCycle = formatProgressionCycle(exercise)
        const progressionSource = formatProgressionSource(exercise)
        const recentHistory = exercise.recentExerciseHistory ?? []

        return (
          <li key={exercise.id} className="exercise-card-item">
            <button
              type="button"
              className={[
                'exercise-card',
                `exercise-card-${category}`,
                isActive ? 'exercise-card-active' : '',
              ].join(' ')}
              aria-pressed={isActive}
              onClick={(event) => onOpenExercise(exercise.id, event.currentTarget)}
            >
              <div className="exercise-card-header">
                <span className="exercise-card-order">#{index + 1}</span>
                <span className="exercise-type-badge">{categoryLabel}</span>
              </div>

              <h3 className="exercise-card-title">{exercise.name}</h3>

              <div className="exercise-card-metrics">
                <span className="exercise-chip">
                  <strong>Sets</strong>
                  {exercise.sets}
                </span>
                <span className="exercise-chip">
                  <strong>Reps</strong>
                  {exercise.reps}
                </span>
                <span className="exercise-chip">
                  <strong>Weight</strong>
                  {formatPlannedWeightOverview(exercise)}
                </span>
              </div>

              {showProgressionInsights ? (
                <div className="exercise-card-insights">
                  {progressionCycle ? (
                    <p className="exercise-card-insight-row">
                      <strong>Cycle</strong> {progressionCycle}
                    </p>
                  ) : null}
                  {progressionSource ? (
                    <p className="exercise-card-insight-row">
                      <strong>Source</strong> {progressionSource}
                    </p>
                  ) : null}
                  {recentHistory.length > 0 ? (
                    <div className="exercise-card-history">
                      {recentHistory.slice(0, 3).map((entry) => (
                        <span key={`${exercise.id}-${entry.completedAt}`} className="exercise-history-chip">
                          {formatExerciseHistoryEntry(entry)}
                        </span>
                      ))}
                      {recentHistory.length > 3 ? (
                        <span className="exercise-history-more">
                          +{recentHistory.length - 3} more
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </button>
          </li>
        )
      })}
    </ol>
  )
}
