import type { PlannedExercise } from '../../domain/types'
import {
  formatPlannedWeightOverview,
  getExerciseCategory,
  getExerciseCategoryLabel,
} from './sessionPlanUtils'

interface SessionExerciseCardListProps {
  exercises: PlannedExercise[]
  selectedExerciseId: string | null
  onOpenExercise: (
    exerciseId: string,
    trigger: HTMLButtonElement,
  ) => void
}

export function SessionExerciseCardList({
  exercises,
  selectedExerciseId,
  onOpenExercise,
}: SessionExerciseCardListProps) {
  return (
    <ol className="exercise-card-list" aria-label="Planned exercises">
      {exercises.map((exercise, index) => {
        const isActive = selectedExerciseId === exercise.id
        const category = getExerciseCategory(exercise.name)
        const categoryLabel = getExerciseCategoryLabel(category)

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
            </button>
          </li>
        )
      })}
    </ol>
  )
}
