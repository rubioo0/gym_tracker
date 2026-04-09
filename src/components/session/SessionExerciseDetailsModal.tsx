import { useEffect, useId, useRef } from 'react'
import type { PlannedExercise } from '../../domain/types'
import { formatPlannedWeight, getEmbeddableVideoUrl } from './sessionPlanUtils'
import { useExerciseGifUrl } from '../../hooks/useExerciseGifUrl'

interface SessionExerciseDetailsModalProps {
  exercise: PlannedExercise | null
  exerciseOrder: number | null
  onClose: () => void
}

export function SessionExerciseDetailsModal({
  exercise,
  exerciseOrder,
  onClose,
}: SessionExerciseDetailsModalProps) {
  const titleId = useId()
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)

  // Call hooks at top level, before early returns
  const imageUrl = exercise?.reference?.imageUrl
  const videoUrl = exercise?.reference?.videoUrl
  const embeddableVideoUrl = getEmbeddableVideoUrl(videoUrl)
  const { gifUrl, isLoading, error } = useExerciseGifUrl(exercise?.id, videoUrl)

  useEffect(() => {
    if (!exercise) {
      return undefined
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }

      event.preventDefault()
      onClose()
    }

    window.addEventListener('keydown', handleEscape)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleEscape)
    }
  }, [exercise, onClose])

  if (!exercise) {
    return null
  }

  return (
    <div className="exercise-modal-backdrop" onClick={onClose}>
      <section
        className="exercise-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="exercise-modal-top">
          <div>
            <p className="exercise-modal-order">
              Exercise {exerciseOrder ? `#${exerciseOrder}` : '-'}
            </p>
            <h3 id={titleId} className="exercise-modal-title">
              {exercise.name}
            </h3>
          </div>

          <button
            type="button"
            className="exercise-modal-close"
            onClick={onClose}
            ref={closeButtonRef}
          >
            Close
          </button>
        </header>

        <div className="exercise-modal-layout">
          <div className="exercise-visual">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={`${exercise.name} reference`}
                className="exercise-visual-media"
              />
            ) : gifUrl ? (
              <img
                src={gifUrl}
                alt={`${exercise.name} GIF reference`}
                className="exercise-visual-media"
              />
            ) : isLoading ? (
              <div className="exercise-visual-loading">
                <div className="spinner" />
                <strong>Converting to GIF...</strong>
                <p>This may take 10-30 seconds</p>
              </div>
            ) : error ? (
              <div className="exercise-visual-placeholder">
                <strong>{exercise.name}</strong>
                <p>{error}</p>
              </div>
            ) : embeddableVideoUrl ? (
              <iframe
                src={embeddableVideoUrl}
                title={`${exercise.name} reference video`}
                className="exercise-visual-media"
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <div className="exercise-visual-placeholder">
                <strong>{exercise.name}</strong>
                <p>No image available. Use references below for technique guidance.</p>
              </div>
            )}
          </div>

          <div className="exercise-details-stack">
            <div className="exercise-details-grid">
              <div className="exercise-detail-item">
                <span>Sets</span>
                <strong>{exercise.sets}</strong>
              </div>
              <div className="exercise-detail-item">
                <span>Reps</span>
                <strong>{exercise.reps}</strong>
              </div>
              <div className="exercise-detail-item">
                <span>Planned Weight</span>
                <strong>{formatPlannedWeight(exercise)}</strong>
              </div>
              <div className="exercise-detail-item">
                <span>Progression</span>
                <strong>{exercise.progressionNote ?? '-'}</strong>
              </div>
            </div>

            {exercise.nextTargetHint ? (
              <p className="note">{exercise.nextTargetHint}</p>
            ) : null}

            {exercise.note ? (
              <section className="exercise-section">
                <h4>Exercise Note</h4>
                <p>{exercise.note}</p>
              </section>
            ) : null}

            <section className="exercise-section">
              <h4>References</h4>
              {videoUrl || imageUrl ? (
                <div className="exercise-links">
                  {videoUrl ? (
                    <a href={videoUrl} target="_blank" rel="noreferrer">
                      Video Reference
                    </a>
                  ) : null}
                  {imageUrl ? (
                    <a href={imageUrl} target="_blank" rel="noreferrer">
                      Image Reference
                    </a>
                  ) : null}
                </div>
              ) : (
                <p className="muted">No external references attached.</p>
              )}

              {exercise.reference?.techniqueNote ? (
                <p className="muted">Technique: {exercise.reference.techniqueNote}</p>
              ) : null}
            </section>
          </div>
        </div>
      </section>
    </div>
  )
}
