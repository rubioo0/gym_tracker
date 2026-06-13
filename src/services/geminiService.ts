import { GoogleGenerativeAI } from '@google/generative-ai'
import type { Part, Tool } from '@google/generative-ai'

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

export interface StoredChatMessage {
  role: 'user' | 'model'
  text: string
}

export type AIFunctionCall = {
  name: 'adjust_exercise_weight'
  args: { exerciseName: string; weight: number; unit: 'kg' | 'lbs'; runId: string }
}

export type AIResponse =
  | { kind: 'text'; text: string }
  | { kind: 'functionCall'; call: AIFunctionCall; leadText: string }

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

const EXERCISE_TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'adjust_exercise_weight',
        description:
          'Змінює планову вагу для конкретної вправи в активному рані. Використовуй ТІЛЬКИ коли користувач явно просить змінити вагу — не для порад.',
        parameters: {
          type: 'object',
          properties: {
            exerciseName: {
              type: 'string',
              description: 'Точна назва вправи як вона вказана в програмі',
            },
            weight: {
              type: 'number',
              description: 'Нова планова вага (число)',
            },
            unit: {
              type: 'string',
              description: 'Одиниця виміру: kg або lbs',
              enum: ['kg', 'lbs'],
            },
            runId: {
              type: 'string',
              description: 'ID активного рану (є в системному промпті поряд з назвою програми)',
            },
          },
          required: ['exerciseName', 'weight', 'unit', 'runId'],
        },
      },
    ],
  },
] as unknown as Tool[]

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
    return new Error('Сервіс Gemini тимчасово перевантажений. Спробуй іншу модель у налаштуваннях.')
  }
  if (lower.includes('fetch') || lower.includes('network') || lower.includes('failed to fetch')) {
    return new Error("Немає з'єднання з Gemini API. Перевір інтернет.")
  }
  return new Error(`Помилка Gemini: ${msg}`)
}

export async function analyzeProgressPhotos(
  apiKey: string,
  model: string,
  photo1: { dataUrl: string; date: string },
  photo2: { dataUrl: string; date: string },
): Promise<string> {
  try {
    const client = new GoogleGenerativeAI(apiKey)
    const genModel = client.getGenerativeModel({ model })

    function toInlineData(dataUrl: string) {
      const comma = dataUrl.indexOf(',')
      const header = comma >= 0 ? dataUrl.slice(0, comma) : ''
      const data = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
      const mimeType = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg'
      return { inlineData: { mimeType, data } }
    }

    const prompt =
      `Ти — персональний фітнес-тренер. Порівняй ці два фото тіла.\n` +
      `Перше фото: ${photo1.date}\n` +
      `Друге фото: ${photo2.date}\n\n` +
      `Проаналізуй:\n` +
      `1. Видимі позитивні зміни у фізичній формі\n` +
      `2. Зони, де є прогрес\n` +
      `3. Конкретні рекомендації для подальших тренувань\n` +
      `4. Поради як краще робити наступні фото для точнішого порівняння (кут, освітлення, поза)\n\n` +
      `Відповідай тільки українською мовою. Будь конкретним і мотивуючим.`

    const result = await genModel.generateContent([
      toInlineData(photo1.dataUrl) as unknown as Part,
      toInlineData(photo2.dataUrl) as unknown as Part,
      prompt,
    ])
    return result.response.text()
  } catch (err) {
    throw mapError(err)
  }
}

export class GeminiService {
  private readonly chat

  constructor(
    apiKey: string,
    systemPrompt: string,
    model = DEFAULT_MODEL,
    history: StoredChatMessage[] = [],
  ) {
    const client = new GoogleGenerativeAI(apiKey)
    const genModel = client.getGenerativeModel({
      model,
      systemInstruction: systemPrompt,
      tools: EXERCISE_TOOLS,
    })
    const geminiHistory = history.slice(-20).map((m) => ({
      role: m.role,
      parts: [{ text: m.text }],
    }))
    this.chat = genModel.startChat({ history: geminiHistory })
  }

  async sendMessage(text: string): Promise<AIResponse> {
    try {
      const result = await this.chat.sendMessage(text)
      const response = result.response
      const calls = response.functionCalls()
      if (calls && calls.length > 0) {
        const call = calls[0]
        let leadText = ''
        try {
          leadText = response.text()
        } catch {
          // no text part when only function call is returned
        }
        return {
          kind: 'functionCall',
          call: {
            name: call.name as 'adjust_exercise_weight',
            args: call.args as unknown as AIFunctionCall['args'],
          },
          leadText,
        }
      }
      return { kind: 'text', text: response.text() }
    } catch (err) {
      throw mapError(err)
    }
  }

  async sendFunctionResult(name: string, result: Record<string, unknown>): Promise<string> {
    try {
      const response = await this.chat.sendMessage([
        { functionResponse: { name, response: result } },
      ])
      return response.response.text()
    } catch (err) {
      throw mapError(err)
    }
  }
}
