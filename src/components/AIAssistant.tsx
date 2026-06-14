import { Component, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import type { AppAction } from '../domain/reducer'
import type { AppState } from '../domain/types'
import { buildFitnessSystemPrompt } from '../services/aiContext'
import {
  AVAILABLE_MODELS,
  DEFAULT_MODEL,
  GeminiService,
  loadAISettings,
  saveAISettings,
} from '../services/geminiService'
import type { AIFunctionCall } from '../services/geminiService'
import './AIAssistant.css'

interface ChatMessage {
  role: 'user' | 'model'
  text: string
}

const HISTORY_KEY = 'gem3_chat_history'
const HISTORY_LIMIT = 30

function loadChatHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) return parsed as ChatMessage[]
      // Non-array stored value — clear it so the next open is clean
      localStorage.removeItem(HISTORY_KEY)
    }
  } catch {
    try { localStorage.removeItem(HISTORY_KEY) } catch { /* ignore */ }
  }
  return []
}

function saveChatHistory(msgs: ChatMessage[]): void {
  try {
    const trimmed = msgs.slice(-HISTORY_LIMIT)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed))
  } catch {
    // ignore storage errors
  }
}

class AIErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError(_: Error) {
    return { hasError: true }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="ai-error">
          Помилка відображення повідомлень. Очисти історію і спробуй знову.
        </div>
      )
    }
    return this.props.children
  }
}

function SafeMarkdown({ text }: { text: string }) {
  if (!text) return null
  return (
    <AIErrorBoundary>
      <ReactMarkdown>{text}</ReactMarkdown>
    </AIErrorBoundary>
  )
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
  onDispatch: (action: AppAction) => void
}

export function AIAssistant({ appState, onDispatch }: AIAssistantProps) {
  const [open, setOpen] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingCall, setPendingCall] = useState<AIFunctionCall | null>(null)

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

      try {
        const history = loadChatHistory()
        const systemPrompt = buildFitnessSystemPrompt(appState)
        serviceRef.current = new GeminiService(s.apiKey, systemPrompt, s.model, history)

        if (history.length > 0) {
          setMessages(history)
        } else {
          setMessages([
            {
              role: 'model',
              text:
                'Привіт! Я твій персональний фітнес-асистент. Я вже в курсі твоїх активних програм, ' +
                'останніх тренувань і поточного прогресу. Запитуй!',
            },
          ])
        }
      } catch (err) {
        // useEffect errors bypass React error boundaries — catch here to prevent blank screen
        setError(err instanceof Error ? err.message : 'Помилка ініціалізації AI чату')
      }
    } else {
      serviceRef.current = null
      setMessages([])
      setError(null)
      setShowSettings(false)
      setSettingsSaved(false)
      setPendingCall(null)
    }
  }, [open]) // appState intentionally excluded — context is snapshot at open time

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading, pendingCall])

  function handleSaveSettings() {
    saveAISettings({ apiKey: settingsKey.trim(), model: settingsModel })
    setSettingsSaved(true)
    setTimeout(() => setSettingsSaved(false), 2500)

    if (settingsKey.trim()) {
      const history = loadChatHistory()
      const systemPrompt = buildFitnessSystemPrompt(appState)
      serviceRef.current = new GeminiService(settingsKey.trim(), systemPrompt, settingsModel, history)
      setShowSettings(false)
      if (history.length > 0) {
        setMessages(history)
      } else {
        const greeting: ChatMessage = {
          role: 'model',
          text: 'Ключ збережено! Я готовий допомагати. Запитуй про тренування.',
        }
        setMessages([greeting])
        saveChatHistory([greeting])
      }
    }
  }

  function handleClearHistory() {
    localStorage.removeItem(HISTORY_KEY)
    setMessages([])
    setPendingCall(null)
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
    const userMsg: ChatMessage = { role: 'user', text: msgText }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)
    saveChatHistory(nextMessages)
    setLoading(true)

    try {
      const response = await serviceRef.current.sendMessage(msgText)
      if (response.kind === 'functionCall') {
        let withLead = nextMessages
        if (response.leadText) {
          const leadMsg: ChatMessage = { role: 'model', text: response.leadText }
          withLead = [...nextMessages, leadMsg]
          setMessages(withLead)
          saveChatHistory(withLead)
        }
        setPendingCall(response.call)
      } else {
        const reply: ChatMessage = { role: 'model', text: response.text }
        const updated = [...nextMessages, reply]
        setMessages(updated)
        saveChatHistory(updated)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Невідома помилка')
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirmApply() {
    if (!pendingCall || !serviceRef.current) return
    const { exerciseName, runId, weight, unit, sets, reps } = pendingCall.args
    onDispatch({
      type: 'setExerciseParamOverride',
      payload: { runId, exerciseName, weight, unit, sets, reps },
    })
    setPendingCall(null)
    setLoading(true)
    try {
      const parts: string[] = []
      if (weight != null) parts.push(`вагу → ${weight}${unit ?? 'kg'}`)
      if (sets) parts.push(`підходи → ${sets}`)
      if (reps) parts.push(`повтори → ${reps}`)
      const text = await serviceRef.current.sendFunctionResult('adjust_exercise_params', {
        success: true,
        message: `${exerciseName}: ${parts.join(', ')} змінено`,
      })
      const reply: ChatMessage = { role: 'model', text }
      const updated = [...messages, reply]
      setMessages(updated)
      saveChatHistory(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Невідома помилка')
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirmCancel() {
    if (!pendingCall || !serviceRef.current) return
    setPendingCall(null)
    setLoading(true)
    try {
      const text = await serviceRef.current.sendFunctionResult('adjust_exercise_params', {
        success: false,
        reason: 'Користувач скасував зміну',
      })
      const reply: ChatMessage = { role: 'model', text }
      const updated = [...messages, reply]
      setMessages(updated)
      saveChatHistory(updated)
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

              <button className="ai-clear-btn" onClick={handleClearHistory}>
                Очистити історію переписки
              </button>
            </div>
          )}

          {/* Messages */}
          {!showSettings && (
            <AIErrorBoundary>
            <div className="ai-messages">
              {messages.map((msg, i) => (
                <div key={i} className={`ai-bubble ai-bubble--${msg.role}`}>
                  {msg.role === 'model' ? (
                    <div className="ai-bubble-text">
                      <SafeMarkdown text={msg.text} />
                    </div>
                  ) : (
                    <p className="ai-bubble-text">{msg.text}</p>
                  )}
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
            </AIErrorBoundary>
          )}

          {/* Confirmation card for AI weight changes */}
          {!showSettings && pendingCall && (
            <div className="ai-confirm-card">
              <p className="ai-confirm-text">
                AI хоче змінити <strong>{pendingCall.args.exerciseName}</strong>:
                {pendingCall.args.weight != null && (
                  <><br />Вага: <strong>{pendingCall.args.weight} {pendingCall.args.unit ?? 'kg'}</strong></>
                )}
                {pendingCall.args.sets && (
                  <><br />Підходи: <strong>{pendingCall.args.sets}</strong></>
                )}
                {pendingCall.args.reps && (
                  <><br />Повтори: <strong>{pendingCall.args.reps}</strong></>
                )}
              </p>
              <div className="ai-confirm-actions">
                <button
                  className="ai-confirm-btn ai-confirm-btn--apply"
                  onClick={() => void handleConfirmApply()}
                >
                  ✓ Застосувати
                </button>
                <button
                  className="ai-confirm-btn ai-confirm-btn--cancel"
                  onClick={() => void handleConfirmCancel()}
                >
                  ✕ Скасувати
                </button>
              </div>
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
                disabled={loading || !!pendingCall}
              />
              <button
                className="ai-send-btn"
                onClick={() => void handleSend()}
                disabled={loading || !input.trim() || !!pendingCall}
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
