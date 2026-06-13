import { useState } from 'react'
import type { ProgramTemplate } from '../../domain/types'
import { generateProgramTemplate } from '../../services/geminiService'
import type { GenerateProgramPrefs } from '../../services/geminiService'
import './AIGeneratorPanel.css'

interface AIGeneratorPanelProps {
  apiKey: string
  model: string
  onGenerated: (template: ProgramTemplate) => void
}

export function AIGeneratorPanel({ apiKey, model, onGenerated }: AIGeneratorPanelProps) {
  const [goals, setGoals] = useState('')
  const [sessionsPerWeek, setSessionsPerWeek] = useState(3)
  const [level, setLevel] = useState<GenerateProgramPrefs['level']>('intermediate')
  const [focus, setFocus] = useState<GenerateProgramPrefs['focus']>('full')
  const [equipment, setEquipment] = useState<GenerateProgramPrefs['equipment']>('barbell')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerate() {
    if (!apiKey) {
      setError('API ключ Gemini не налаштовано. Відкрий AI Тренер (🤖) → Налаштування.')
      return
    }
    if (!goals.trim()) {
      setError('Опиши свою мету.')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const template = await generateProgramTemplate(apiKey, model, {
        goals: goals.trim(),
        sessionsPerWeek,
        level,
        focus,
        equipment,
      })
      onGenerated(template)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка генерації програми')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="aigen-root">
      <h2 className="aigen-title">🤖 Згенерувати програму з AI</h2>
      <p className="aigen-hint">
        Опиши свою мету — Gemini створить програму тренувань, яку ти зможеш переглянути та відредагувати перед збереженням.
      </p>

      {!apiKey && (
        <p className="aigen-warn">
          Для генерації потрібен Gemini API ключ. Налаштуй його у вікні AI Тренера (🤖).
        </p>
      )}

      <label className="aigen-field">
        <span className="aigen-label">Опиши свою мету</span>
        <textarea
          className="aigen-textarea"
          value={goals}
          onChange={(e) => setGoals(e.target.value)}
          placeholder="Наприклад: хочу набрати м'язову масу, особливо груди та спина. Займаюсь 3 місяці."
          rows={3}
          disabled={loading}
        />
      </label>

      <div className="aigen-row">
        <label className="aigen-field">
          <span className="aigen-label">Тренувань на тиждень</span>
          <select
            className="aigen-select"
            value={sessionsPerWeek}
            onChange={(e) => setSessionsPerWeek(Number(e.target.value))}
            disabled={loading}
          >
            {[2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>

        <label className="aigen-field">
          <span className="aigen-label">Рівень</span>
          <select
            className="aigen-select"
            value={level}
            onChange={(e) => setLevel(e.target.value as GenerateProgramPrefs['level'])}
            disabled={loading}
          >
            <option value="beginner">Початківець</option>
            <option value="intermediate">Середній</option>
            <option value="advanced">Просунутий</option>
          </select>
        </label>
      </div>

      <div className="aigen-row">
        <label className="aigen-field">
          <span className="aigen-label">Напрямок</span>
          <select
            className="aigen-select"
            value={focus}
            onChange={(e) => setFocus(e.target.value as GenerateProgramPrefs['focus'])}
            disabled={loading}
          >
            <option value="upper">Верх тіла</option>
            <option value="lower">Низ тіла</option>
            <option value="full">Все тіло</option>
            <option value="custom">Custom</option>
          </select>
        </label>

        <label className="aigen-field">
          <span className="aigen-label">Обладнання</span>
          <select
            className="aigen-select"
            value={equipment}
            onChange={(e) => setEquipment(e.target.value as GenerateProgramPrefs['equipment'])}
            disabled={loading}
          >
            <option value="barbell">Штанга + гантелі</option>
            <option value="dumbbell">Тільки гантелі</option>
            <option value="bodyweight">Власна вага</option>
          </select>
        </label>
      </div>

      {error && <p className="aigen-error">{error}</p>}

      <button
        className="aigen-btn"
        onClick={() => void handleGenerate()}
        disabled={loading || !apiKey}
      >
        {loading ? '⏳ Генерую…' : '🤖 Згенерувати програму'}
      </button>

      {loading && (
        <p className="aigen-hint aigen-hint--loading">
          Gemini створює програму… Це може зайняти 10–20 секунд.
        </p>
      )}
    </div>
  )
}
