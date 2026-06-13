import { GoogleGenerativeAI } from '@google/generative-ai'

const STORAGE_KEY = 'gem3_ai_settings'

export const AVAILABLE_MODELS = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (рекомендовано)' },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite (швидший)' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (запасний)' },
] as const

export const DEFAULT_MODEL = 'gemini-2.5-flash'

export interface AISettings {
  apiKey: string
  model: string
}

export function loadAISettings(): AISettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AISettings>
      return {
        apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
        model: typeof parsed.model === 'string' ? parsed.model : DEFAULT_MODEL,
      }
    }
  } catch {
    // ignore parse errors
  }
  return { apiKey: '', model: DEFAULT_MODEL }
}

export function saveAISettings(settings: AISettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

function mapError(err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err)
  const lower = msg.toLowerCase()

  if (lower.includes('api_key') || lower.includes('api key') || lower.includes('401') || lower.includes('403')) {
    return new Error('Невірний API ключ. Перевір налаштування ШІ.')
  }
  if (lower.includes('429') || lower.includes('quota') || lower.includes('rate')) {
    return new Error('Перевищено ліміт запитів Gemini. Спробуй через хвилину.')
  }
  if (lower.includes('503') || lower.includes('overloaded') || lower.includes('unavailable')) {
    return new Error('Сервіс Gemini тимчасово перевантажений. Спробуй інші модель у налаштуваннях.')
  }
  if (lower.includes('fetch') || lower.includes('network') || lower.includes('failed to fetch')) {
    return new Error('Немає з\'єднання з Gemini API. Перевір інтернет.')
  }
  return new Error(`Помилка Gemini: ${msg}`)
}

export class GeminiService {
  // type inferred from startChat return value
  private readonly chat

  constructor(apiKey: string, systemPrompt: string, model = DEFAULT_MODEL) {
    const client = new GoogleGenerativeAI(apiKey)
    const genModel = client.getGenerativeModel({
      model,
      systemInstruction: systemPrompt,
    })
    this.chat = genModel.startChat({ history: [] })
  }

  async sendMessage(text: string): Promise<string> {
    try {
      const result = await this.chat.sendMessage(text)
      return result.response.text()
    } catch (err) {
      throw mapError(err)
    }
  }
}
