import { useEffect, useState } from 'react'
import { makeId } from '../domain/logic'
import type {
  ExerciseTemplate,
  ProgramMode,
  ProgramTemplate,
  SessionTemplate,
  TrackType,
} from '../domain/types'
import './PlanEditorModal.css'

interface EditorExercise {
  id: string
  name: string
  sets: string
  reps: string
  plannedWeight: string
  plannedWeightPerSide: string
  weightUnit: string
  isBodyweightLoad: boolean
  progressionType: '' | 'weight' | 'reps'
  progressionAmount: string
  progressionAmountPerSide: string
  progressionFrequency: string
  progressionFrequencyUnit: 'session' | 'week'
  progressionBasis: 'trackSessions' | 'successfulTrackSessions'
  progressionMaxValue: string
  techniqueNote: string
  videoUrl: string
  imageUrl: string
}

interface EditorSession {
  id: string
  name: string
  order: number
  track: TrackType
  note: string
  exercises: EditorExercise[]
}

function toEditorExercise(e: ExerciseTemplate): EditorExercise {
  const rule = e.progressionRule
  return {
    id: e.id,
    name: e.name,
    sets: e.sets,
    reps: e.reps,
    plannedWeight: e.plannedWeight !== undefined ? String(e.plannedWeight) : '',
    plannedWeightPerSide: e.plannedWeightPerSide !== undefined ? String(e.plannedWeightPerSide) : '',
    weightUnit: e.weightUnit ?? 'kg',
    isBodyweightLoad: e.isBodyweightLoad ?? false,
    progressionType: rule?.type ?? '',
    progressionAmount: rule?.amount !== undefined ? String(rule.amount) : '',
    progressionAmountPerSide: rule?.amountPerSide !== undefined ? String(rule.amountPerSide) : '',
    progressionFrequency: rule?.frequency !== undefined ? String(rule.frequency) : '',
    progressionFrequencyUnit: rule?.frequencyUnit ?? 'session',
    progressionBasis: rule?.basis ?? 'trackSessions',
    progressionMaxValue: rule?.maxValue !== undefined ? String(rule.maxValue) : '',
    techniqueNote: e.reference?.techniqueNote ?? '',
    videoUrl: e.reference?.videoUrl ?? '',
    imageUrl: e.reference?.imageUrl ?? '',
  }
}

function fromEditorExercise(e: EditorExercise): ExerciseTemplate {
  const plannedWeight = e.plannedWeight !== '' ? parseFloat(e.plannedWeight) : undefined
  const plannedWeightPerSide = e.plannedWeightPerSide !== '' ? parseFloat(e.plannedWeightPerSide) : undefined
  const progressionAmount = e.progressionAmount !== '' ? parseFloat(e.progressionAmount) : undefined
  const progressionAmountPerSide = e.progressionAmountPerSide !== '' ? parseFloat(e.progressionAmountPerSide) : undefined
  const progressionFrequency = e.progressionFrequency !== '' ? parseFloat(e.progressionFrequency) : undefined
  const progressionMaxValue = e.progressionMaxValue !== '' ? parseFloat(e.progressionMaxValue) : undefined

  const hasRule = e.progressionType === 'weight' || e.progressionType === 'reps'

  const reference =
    e.techniqueNote || e.videoUrl || e.imageUrl
      ? {
          techniqueNote: e.techniqueNote || undefined,
          videoUrl: e.videoUrl || undefined,
          imageUrl: e.imageUrl || undefined,
        }
      : undefined

  return {
    id: e.id,
    name: e.name.trim(),
    sets: e.sets.trim() || '3',
    reps: e.reps.trim() || '10',
    plannedWeight: Number.isFinite(plannedWeight) ? plannedWeight : undefined,
    plannedWeightPerSide: Number.isFinite(plannedWeightPerSide) ? plannedWeightPerSide : undefined,
    weightUnit: e.weightUnit || 'kg',
    isBodyweightLoad: e.isBodyweightLoad || undefined,
    progressionRule:
      hasRule && progressionAmount !== undefined && progressionFrequency !== undefined
        ? {
            type: e.progressionType as 'weight' | 'reps',
            amount: progressionAmount,
            amountPerSide: Number.isFinite(progressionAmountPerSide) ? progressionAmountPerSide : undefined,
            frequency: progressionFrequency,
            frequencyUnit: e.progressionFrequencyUnit,
            basis: e.progressionBasis,
            maxValue: Number.isFinite(progressionMaxValue) ? progressionMaxValue : undefined,
          }
        : undefined,
    reference,
  }
}

function toEditorSession(s: SessionTemplate): EditorSession {
  return {
    id: s.id,
    name: s.name,
    order: s.order,
    track: s.track,
    note: s.note ?? '',
    exercises: s.exercises.map(toEditorExercise),
  }
}

function newEditorExercise(): EditorExercise {
  return {
    id: makeId(),
    name: '',
    sets: '3',
    reps: '10',
    plannedWeight: '',
    plannedWeightPerSide: '',
    weightUnit: 'kg',
    isBodyweightLoad: false,
    progressionType: '',
    progressionAmount: '',
    progressionAmountPerSide: '',
    progressionFrequency: '',
    progressionFrequencyUnit: 'session',
    progressionBasis: 'trackSessions',
    progressionMaxValue: '',
    techniqueNote: '',
    videoUrl: '',
    imageUrl: '',
  }
}

function newEditorSession(order: number): EditorSession {
  return {
    id: makeId(),
    name: `Session ${order}`,
    order,
    track: 'upper',
    note: '',
    exercises: [newEditorExercise()],
  }
}

interface PlanEditorModalProps {
  template: ProgramTemplate | null
  onSave: (template: ProgramTemplate) => void
  onClose: () => void
}

export function PlanEditorModal({ template, onSave, onClose }: PlanEditorModalProps) {
  const [name, setName] = useState('')
  const [mode, setMode] = useState<ProgramMode>('main')
  const [track, setTrack] = useState<TrackType>('upper')
  const [focusTarget, setFocusTarget] = useState('')
  const [sessions, setSessions] = useState<EditorSession[]>([])
  const [errors, setErrors] = useState<string[]>([])

  useEffect(() => {
    if (!template) return
    setName(template.name)
    setMode(template.mode)
    setTrack(template.track)
    setFocusTarget(template.focusTarget)
    setSessions(template.sessions.map(toEditorSession))
    setErrors([])
  }, [template])

  if (!template) return null

  function updateSession(idx: number, patch: Partial<EditorSession>) {
    setSessions((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }

  function updateExercise(sIdx: number, eIdx: number, patch: Partial<EditorExercise>) {
    setSessions((prev) =>
      prev.map((s, i) =>
        i === sIdx
          ? { ...s, exercises: s.exercises.map((e, j) => (j === eIdx ? { ...e, ...patch } : e)) }
          : s,
      ),
    )
  }

  function moveSession(idx: number, dir: -1 | 1) {
    setSessions((prev) => {
      const next = [...prev]
      const target = idx + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next.map((s, i) => ({ ...s, order: i + 1 }))
    })
  }

  function removeSession(idx: number) {
    setSessions((prev) => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i + 1 })))
  }

  function addSession() {
    setSessions((prev) => [...prev, newEditorSession(prev.length + 1)])
  }

  function moveExercise(sIdx: number, eIdx: number, dir: -1 | 1) {
    setSessions((prev) =>
      prev.map((s, i) => {
        if (i !== sIdx) return s
        const exs = [...s.exercises]
        const target = eIdx + dir
        if (target < 0 || target >= exs.length) return s
        ;[exs[eIdx], exs[target]] = [exs[target], exs[eIdx]]
        return { ...s, exercises: exs }
      }),
    )
  }

  function removeExercise(sIdx: number, eIdx: number) {
    setSessions((prev) =>
      prev.map((s, i) =>
        i === sIdx ? { ...s, exercises: s.exercises.filter((_, j) => j !== eIdx) } : s,
      ),
    )
  }

  function addExercise(sIdx: number) {
    setSessions((prev) =>
      prev.map((s, i) =>
        i === sIdx ? { ...s, exercises: [...s.exercises, newEditorExercise()] } : s,
      ),
    )
  }

  function validate(): string[] {
    const errs: string[] = []
    if (!name.trim()) errs.push('Program name is required.')
    sessions.forEach((s, si) => {
      s.exercises.forEach((e, ei) => {
        if (!e.name.trim()) errs.push(`Session ${si + 1}, exercise ${ei + 1}: name is required.`)
      })
    })
    return errs
  }

  function handleSave() {
    if (!template) return
    const errs = validate()
    if (errs.length > 0) {
      setErrors(errs)
      return
    }
    const saved: ProgramTemplate = {
      ...template,
      id: template.id,
      name: name.trim(),
      mode,
      track,
      focusTarget: focusTarget.trim(),
      sessions: sessions.map((s) => ({
        id: s.id,
        name: s.name.trim() || `Session ${s.order}`,
        order: s.order,
        track: s.track,
        note: s.note.trim() || undefined,
        exercises: s.exercises.map(fromEditorExercise),
      })),
    }
    onSave(saved)
  }

  return (
    <div className="plan-editor-backdrop" role="dialog" aria-modal="true" aria-label="Edit Plan">
      <div className="plan-editor-sheet">
        <header className="plan-editor-header">
          <button type="button" className="plan-editor-header-btn" onClick={onClose}>
            Cancel
          </button>
          <span className="plan-editor-header-title">Edit Plan</span>
          <button type="button" className="plan-editor-header-btn plan-editor-save-btn" onClick={handleSave}>
            Save
          </button>
        </header>

        {errors.length > 0 && (
          <div className="plan-editor-errors">
            {errors.map((err) => (
              <p key={err} className="plan-editor-error-msg">{err}</p>
            ))}
          </div>
        )}

        <section className="plan-editor-section">
          <h3 className="plan-editor-section-title">Program</h3>
          <label className="plan-editor-field">
            <span>Name</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="plan-editor-field">
            <span>Mode</span>
            <select value={mode} onChange={(e) => setMode(e.target.value as ProgramMode)}>
              <option value="main">Main</option>
              <option value="travel">Travel</option>
              <option value="maintenance">Maintenance</option>
              <option value="backup">Backup</option>
            </select>
          </label>
          <label className="plan-editor-field">
            <span>Track</span>
            <select value={track} onChange={(e) => setTrack(e.target.value as TrackType)}>
              <option value="upper">Upper</option>
              <option value="lower">Lower</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <label className="plan-editor-field">
            <span>Focus target</span>
            <input type="text" value={focusTarget} onChange={(e) => setFocusTarget(e.target.value)} />
          </label>
        </section>

        <section className="plan-editor-section">
          <h3 className="plan-editor-section-title">Sessions</h3>

          {sessions.map((session, sIdx) => (
            <details key={session.id} className="plan-editor-session" open>
              <summary className="plan-editor-session-summary">
                <span className="plan-editor-session-name">{session.name || `Session ${sIdx + 1}`}</span>
                <span className="plan-editor-session-count">{session.exercises.length} exercises</span>
                <span className="plan-editor-reorder-btns">
                  <button type="button" disabled={sIdx === 0} onClick={() => moveSession(sIdx, -1)} aria-label="Move session up">↑</button>
                  <button type="button" disabled={sIdx === sessions.length - 1} onClick={() => moveSession(sIdx, 1)} aria-label="Move session down">↓</button>
                  <button type="button" className="plan-editor-remove-btn" onClick={() => removeSession(sIdx)} aria-label="Remove session">✕</button>
                </span>
              </summary>

              <div className="plan-editor-session-body">
                <label className="plan-editor-field">
                  <span>Session name</span>
                  <input type="text" value={session.name} onChange={(e) => updateSession(sIdx, { name: e.target.value })} />
                </label>
                <label className="plan-editor-field">
                  <span>Track</span>
                  <select value={session.track} onChange={(e) => updateSession(sIdx, { track: e.target.value as TrackType })}>
                    <option value="upper">Upper</option>
                    <option value="lower">Lower</option>
                    <option value="custom">Custom</option>
                  </select>
                </label>
                <label className="plan-editor-field">
                  <span>Note</span>
                  <textarea rows={2} value={session.note} onChange={(e) => updateSession(sIdx, { note: e.target.value })} />
                </label>

                {session.exercises.map((exercise, eIdx) => (
                  <details key={exercise.id} className="plan-editor-exercise">
                    <summary className="plan-editor-exercise-summary">
                      <span>{exercise.name || `Exercise ${eIdx + 1}`}</span>
                      <span className="plan-editor-reorder-btns">
                        <button type="button" disabled={eIdx === 0} onClick={() => moveExercise(sIdx, eIdx, -1)} aria-label="Move exercise up">↑</button>
                        <button type="button" disabled={eIdx === session.exercises.length - 1} onClick={() => moveExercise(sIdx, eIdx, 1)} aria-label="Move exercise down">↓</button>
                        <button type="button" className="plan-editor-remove-btn" onClick={() => removeExercise(sIdx, eIdx)} aria-label="Remove exercise">✕</button>
                      </span>
                    </summary>

                    <div className="plan-editor-exercise-body">
                      <label className="plan-editor-field">
                        <span>Exercise name *</span>
                        <input type="text" value={exercise.name} onChange={(e) => updateExercise(sIdx, eIdx, { name: e.target.value })} />
                      </label>
                      <div className="plan-editor-row">
                        <label className="plan-editor-field">
                          <span>Sets</span>
                          <input type="text" value={exercise.sets} onChange={(e) => updateExercise(sIdx, eIdx, { sets: e.target.value })} />
                        </label>
                        <label className="plan-editor-field">
                          <span>Reps</span>
                          <input type="text" value={exercise.reps} onChange={(e) => updateExercise(sIdx, eIdx, { reps: e.target.value })} />
                        </label>
                      </div>
                      <div className="plan-editor-row">
                        <label className="plan-editor-field">
                          <span>Planned weight</span>
                          <input type="number" step="0.5" min="0" value={exercise.plannedWeight} onChange={(e) => updateExercise(sIdx, eIdx, { plannedWeight: e.target.value })} />
                        </label>
                        <label className="plan-editor-field">
                          <span>Weight unit</span>
                          <select value={exercise.weightUnit} onChange={(e) => updateExercise(sIdx, eIdx, { weightUnit: e.target.value })}>
                            <option value="kg">kg</option>
                            <option value="lbs">lbs</option>
                          </select>
                        </label>
                      </div>
                      <div className="plan-editor-row">
                        <label className="plan-editor-field">
                          <span>Per-side weight</span>
                          <input type="number" step="0.5" min="0" value={exercise.plannedWeightPerSide} placeholder="optional" onChange={(e) => updateExercise(sIdx, eIdx, { plannedWeightPerSide: e.target.value })} />
                        </label>
                        <label className="plan-editor-field plan-editor-field-inline">
                          <input type="checkbox" checked={exercise.isBodyweightLoad} onChange={(e) => updateExercise(sIdx, eIdx, { isBodyweightLoad: e.target.checked })} />
                          <span>Bodyweight +</span>
                        </label>
                      </div>

                      <fieldset className="plan-editor-fieldset">
                        <legend>Progression</legend>
                        <label className="plan-editor-field">
                          <span>Type</span>
                          <select value={exercise.progressionType} onChange={(e) => updateExercise(sIdx, eIdx, { progressionType: e.target.value as '' | 'weight' | 'reps' })}>
                            <option value="">None</option>
                            <option value="weight">Weight (+kg/lbs)</option>
                            <option value="reps">Reps (+reps)</option>
                          </select>
                        </label>
                        {exercise.progressionType !== '' && (
                          <>
                            <div className="plan-editor-row">
                              <label className="plan-editor-field">
                                <span>Amount per step</span>
                                <input type="number" step="0.5" min="0" value={exercise.progressionAmount} onChange={(e) => updateExercise(sIdx, eIdx, { progressionAmount: e.target.value })} />
                              </label>
                              {exercise.progressionType === 'weight' && (
                                <label className="plan-editor-field">
                                  <span>Per-side amount</span>
                                  <input type="number" step="0.25" min="0" value={exercise.progressionAmountPerSide} placeholder="optional" onChange={(e) => updateExercise(sIdx, eIdx, { progressionAmountPerSide: e.target.value })} />
                                </label>
                              )}
                            </div>
                            <div className="plan-editor-row">
                              <label className="plan-editor-field">
                                <span>Every</span>
                                <input type="number" step="1" min="1" value={exercise.progressionFrequency} onChange={(e) => updateExercise(sIdx, eIdx, { progressionFrequency: e.target.value })} />
                              </label>
                              <label className="plan-editor-field">
                                <span>Unit</span>
                                <select value={exercise.progressionFrequencyUnit} onChange={(e) => updateExercise(sIdx, eIdx, { progressionFrequencyUnit: e.target.value as 'session' | 'week' })}>
                                  <option value="session">Sessions</option>
                                  <option value="week">Weeks</option>
                                </select>
                              </label>
                            </div>
                            <div className="plan-editor-row">
                              <label className="plan-editor-field">
                                <span>Basis</span>
                                <select value={exercise.progressionBasis} onChange={(e) => updateExercise(sIdx, eIdx, { progressionBasis: e.target.value as 'trackSessions' | 'successfulTrackSessions' })}>
                                  <option value="trackSessions">All completed</option>
                                  <option value="successfulTrackSessions">Successful only</option>
                                </select>
                              </label>
                              <label className="plan-editor-field">
                                <span>Max value</span>
                                <input type="number" step="0.5" min="0" value={exercise.progressionMaxValue} placeholder="optional" onChange={(e) => updateExercise(sIdx, eIdx, { progressionMaxValue: e.target.value })} />
                              </label>
                            </div>
                          </>
                        )}
                      </fieldset>

                      <label className="plan-editor-field">
                        <span>Technique note</span>
                        <textarea rows={2} value={exercise.techniqueNote} onChange={(e) => updateExercise(sIdx, eIdx, { techniqueNote: e.target.value })} />
                      </label>
                      <label className="plan-editor-field">
                        <span>Video URL</span>
                        <input type="url" value={exercise.videoUrl} onChange={(e) => updateExercise(sIdx, eIdx, { videoUrl: e.target.value })} />
                      </label>
                      <label className="plan-editor-field">
                        <span>Image URL</span>
                        <input type="url" value={exercise.imageUrl} onChange={(e) => updateExercise(sIdx, eIdx, { imageUrl: e.target.value })} />
                      </label>
                    </div>
                  </details>
                ))}

                <button type="button" className="plan-editor-add-btn" onClick={() => addExercise(sIdx)}>
                  + Add exercise
                </button>
              </div>
            </details>
          ))}

          <button type="button" className="plan-editor-add-btn plan-editor-add-session-btn" onClick={addSession}>
            + Add session
          </button>
        </section>
      </div>
    </div>
  )
}
