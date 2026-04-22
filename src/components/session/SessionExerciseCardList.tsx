import { useState } from 'react'
import type { PlannedExercise } from '../../domain/types'
import {
  formatPlannedMaxWeightOverview,
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
  const [infoExerciseId, setInfoExerciseId] = useState<string | null>(null)

  return (
    <ol className="exercise-card-list" aria-label="Planned exercises">
      {exercises.map((exercise, index) => {
        const isActive = selectedExerciseId === exercise.id
        const isInfoOpen = infoExerciseId === exercise.id
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
                <span className="exercise-chip">
                  <strong>Max</strong>
                  {formatPlannedMaxWeightOverview(exercise)}
                </span>
              </div>
            </button>

            {exercise.maxWeightExplanation ? (
              <div className="exercise-card-info-wrap">
                <button
                  type="button"
                  className="exercise-card-info-button"
                  aria-expanded={isInfoOpen}
                  aria-controls={`exercise-info-${exercise.id}`}
                  onClick={() => {
                    setInfoExerciseId((current) =>
                      current === exercise.id ? null : exercise.id,
                    )
                  }}
                >
                  i
                </button>
                <span className="exercise-card-info-label">How max is calculated</span>
              </div>
            ) : null}

            {isInfoOpen && exercise.maxWeightExplanation ? (
              <p id={`exercise-info-${exercise.id}`} className="exercise-card-info-panel">
                {exercise.maxWeightExplanation}
              </p>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
