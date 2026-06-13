import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { AppState } from '../domain/types'
import { buildFitnessSystemPrompt } from '../services/aiContext'
import {
  AVAILABLE_MODELS,
  DEFAULT_MODEL,
  GeminiService,
  loadAISettings,
  saveAISettings,
} from '../services/geminiService'
import './AIAssistant.css'

interface ChatMessage {
  role: 'user' | 'model'
  text: string
}

const SUGGESTED_PROMPTS = [
  'Що мені тренувати сьогодні?',
  'Як іде мій прогрес?',
  'Чому я застряг на цій вазі?',
  'Дай пораду по техніці',
  'Чи варто збільшити вагу?',
]

interface AIAssistantProps {
  appState: AppState
}

export function AIAssistant({ appState }: AIAssistantProps) {
  const [open, setOpen] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Settings form state
  const [settingsKey, setSettingsKey] = useState('')
  const [settingsModel, setSettingsModel] = useState(DEFAULT_MODEL)
  const [settingsSaved, setSettingsSaved] = useState(false)

  const serviceRef = useRef<GeminiService | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const settings = loadAISettings()
  const hasApiKey = settings.apiKey.length > 0

  useEffect(() => {
    if (open) {
      const s = loadAISettings()
      setSettingsKey(s.apiKey)
      setSettingsModel(s.model)

      if (!s.apiKey) {
        setShowSettings(true)
        return
      }

      const systemPrompt = buildFitnessSystemPrompt(appState)
      serviceRef.current = new GeminiService(s.apiKey, systemPrompt, s.model)

      setMessages([
        {
          role: 'model',
          text:
            'Привіт! Я твій персональний фітнес-асистент. Я вже в курсі твоїх активних програм, ' +
            'останніх тренувань і поточного прогресу. Запитуй!',
        },
      ])
    } else {
      serviceRef.current = null
      setMessages([])
      setError(null)
      setShowSettings(false)
      setSettingsSaved(false)
    }
  }, [open]) // appState intentionally excluded — context is snapshot at open time

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  function handleSaveSettings() {
    saveAISettings({ apiKey: settingsKey.trim(), model: settingsModel })
    setSettingsSaved(true)
    setTimeout(() => setSettingsSaved(false), 2500)

    if (settingsKey.trim()) {
      const systemPrompt = buildFitnessSystemPrompt(appState)
      serviceRef.current = new GeminiService(settingsKey.trim(), systemPrompt, settingsModel)
      setShowSettings(false)
      setMessages([
        {
          role: 'model',
          text: 'Ключ збережено! Я готовий допомагати. Запитуй про тренування.',
        },
      ])
    }
  }

  async function handleSend(text?: string) {
    const msgText = (text ?? input).trim()
    if (!msgText || loading) return
    if (!serviceRef.current) {
      setError('API ключ не налаштовано. Відкрий налаштування ШІ.')
      return
    }

    setInput('')
    setError(null)
    setMessages((prev) => [...prev, { role: 'user', text: msgText }])
    setLoading(true)

    try {
      const reply = await serviceRef.current.sendMessage(msgText)
      setMessages((prev) => [...prev, { role: 'model', text: reply }])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Невідома помилка')
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  const showSuggestions = !loading && messages.length <= 1 && !showSettings

  return (
    <>
      {/* FAB */}
      <button
        className={`ai-fab${!hasApiKey ? ' ai-fab--setup' : ''}`}
        onClick={() => setOpen(true)}
        aria-label="Відкрити AI тренера"
        title={hasApiKey ? 'AI Тренер' : 'Налаштувати AI Тренера'}
      >
        <span className="ai-fab-icon">🤖</span>
        {!hasApiKey && <span className="ai-fab-badge">⚙</span>}
      </button>

      {/* Panel */}
      {open && (
        <div className="ai-panel" role="dialog" aria-label="AI Тренер">
          {/* Header */}
          <div className="ai-panel-header">
            <span className="ai-panel-title">🤖 AI Тренер</span>
            <div className="ai-panel-actions">
              <button
                className={`ai-icon-btn${showSettings ? ' ai-icon-btn--active' : ''}`}
                onClick={() => setShowSettings((v) => !v)}
                title="Налаштування"
                aria-label="Налаштування AI"
              >
                ⚙
              </button>
              <button
                className="ai-icon-btn"
                onClick={() => setOpen(false)}
                title="Закрити"
                aria-label="Закрити AI панель"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Settings sub-panel */}
          {showSettings && (
            <div className="ai-settings">
              <h3 className="ai-settings-title">Налаштування Gemini AI</h3>

              <label className="ai-settings-label">
                API ключ
                <input
                  type="password"
                  className="ai-settings-input"
                  value={settingsKey}
                  onChange={(e) => setSettingsKey(e.target.value)}
                  placeholder="Вставте ключ з aistudio.google.com"
                  autoComplete="off"
                />
              </label>

              <label className="ai-settings-label">
                Модель
                <select
                  className="ai-settings-input"
                  value={settingsModel}
                  onChange={(e) => setSettingsModel(e.target.value)}
                >
                  {AVAILABLE_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>

              <button className="ai-save-btn" onClick={handleSaveSettings}>
                {settingsSaved ? 'Збережено ✓' : 'Зберегти'}
              </button>

              <p className="ai-settings-hint">
                Ключ зберігається тільки у браузері. Отримай безкоштовний ключ на{' '}
                <span className="ai-settings-link">aistudio.google.com</span>
              </p>
            </div>
          )}

          {/* Messages */}
          {!showSettings && (
            <div className="ai-messages">
              {messages.map((msg, i) => (
                <div key={i} className={`ai-bubble ai-bubble--${msg.role}`}>
                  <p className="ai-bubble-text">{msg.text}</p>
                </div>
              ))}

              {loading && (
                <div className="ai-bubble ai-bubble--model">
                  <span className="ai-typing">
                    <span />
                    <span />
                    <span />
                  </span>
                </div>
              )}

              {error && <div className="ai-error">{error}</div>}

              {showSuggestions && (
                <div className="ai-suggestions">
                  {SUGGESTED_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      className="ai-suggestion-chip"
                      onClick={() => void handleSend(prompt)}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Input footer */}
          {!showSettings && (
            <div className="ai-input-row">
              <textarea
                ref={inputRef}
                className="ai-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Запитай про тренування…"
                rows={1}
                disabled={loading}
              />
              <button
                className="ai-send-btn"
                onClick={() => void handleSend()}
                disabled={loading || !input.trim()}
                aria-label="Надіслати"
              >
                ↑
              </button>
            </div>
          )}
        </div>
      )}
    </>
  )
}
