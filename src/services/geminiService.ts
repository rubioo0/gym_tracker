import { GoogleGenerativeAI } from '@google/generative-ai'
import type { Part, Tool } from '@google/generative-ai'
import type { ProgramTemplate } from '../domain/types'

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
  name: 'adjust_exercise_params'
  args: {
    exerciseName: string
    runId: string
    weight?: number
    unit?: 'kg' | 'lbs'
    sets?: string
    reps?: string
  }
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
        name: 'adjust_exercise_params',
        description:
          'Змінює параметри вправи (вагу, кількість підходів або повторів) в активному рані. ' +
          'Використовуй ТІЛЬКИ коли користувач явно просить змінити параметри — не для загальних порад.',
        parameters: {
          type: 'object',
          properties: {
            exerciseName: {
              type: 'string',
              description: 'Точна назва вправи як вона вказана в програмі',
            },
            runId: {
              type: 'string',
              description: 'ID активного рану (є в системному промпті поряд з назвою програми)',
            },
            weight: {
              type: 'number',
              description: 'Нова планова вага (якщо потрібно змінити)',
            },
            unit: {
              type: 'string',
              description: 'Одиниця виміру: kg або lbs',
              enum: ['kg', 'lbs'],
            },
            sets: {
              type: 'string',
              description: 'Кількість підходів (якщо потрібно змінити), наприклад "4"',
            },
            reps: {
              type: 'string',
              description: 'Кількість повторів (якщо потрібно змінити), наприклад "8-12"',
            },
          },
          required: ['exerciseName', 'runId'],
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

export interface GenerateProgramPrefs {
  goals: string
  sessionsPerWeek: number
  level: 'beginner' | 'intermediate' | 'advanced'
  focus: 'upper' | 'lower' | 'full' | 'custom'
  equipment: 'barbell' | 'dumbbell' | 'bodyweight'
}

function ensureIds(items: Record<string, unknown>[]): (Record<string, unknown> & { id: string })[] {
  return items.map((item) => ({
    ...item,
    id: (typeof item.id === 'string' && item.id.trim()) ? item.id : crypto.randomUUID(),
  }))
}

export async function generateProgramTemplate(
  apiKey: string,
  model: string,
  prefs: GenerateProgramPrefs,
): Promise<ProgramTemplate> {
  const client = new GoogleGenerativeAI(apiKey)
  const genModel = client.getGenerativeModel({ model })

  const levelLabel = { beginner: 'початківець', intermediate: 'середній рівень', advanced: 'просунутий' }[prefs.level]
  const focusLabel = { upper: 'верх тіла', lower: 'низ тіла', full: 'все тіло', custom: 'custom' }[prefs.focus]
  const equipLabel = { barbell: 'штанга + гантелі', dumbbell: 'тільки гантелі', bodyweight: 'власна вага без обладнання' }[prefs.equipment]

  const prompt = `Ти — персональний тренер. Створи тренувальну програму за наступними даними:
Мета: ${prefs.goals}
Тренувань на тиждень: ${prefs.sessionsPerWeek}
Рівень: ${levelLabel}
Напрямок: ${focusLabel}
Обладнання: ${equipLabel}

Поверни ТІЛЬКИ валідний JSON без будь-яких пояснень, markdown огорток чи коментарів.
JSON повинен відповідати наступному TypeScript інтерфейсу:

interface ExerciseTemplate {
  id: string          // унікальний uuid
  name: string        // назва вправи
  sets: string        // кількість підходів, наприклад "3"
  reps: string        // кількість повторів, наприклад "10" або "8-12"
  plannedWeight?: number  // початкова вага в кг (якщо є)
  weightUnit?: string     // "kg" або "lbs"
  isBodyweightLoad?: boolean  // true якщо власна вага
}

interface SessionTemplate {
  id: string          // унікальний uuid
  name: string        // назва сесії
  order: number       // порядковий номер починаючи з 1
  track: "upper" | "lower" | "custom"
  exercises: ExerciseTemplate[]
}

interface ProgramTemplate {
  id: string          // унікальний uuid
  name: string        // назва програми
  mode: "main" | "travel" | "maintenance" | "backup"
  track: "upper" | "lower" | "custom"
  focusTarget: string // коротко про що програма, наприклад "гіпертрофія грудних"
  sessions: SessionTemplate[]
}

Вимоги:
- Рівно ${prefs.sessionsPerWeek} сесій
- Кожна сесія має мінімум 4 вправи
- Назви вправ українською мовою
- mode = "main", track відповідно до напрямку
- id для кожного об'єкта — унікальний рядок
- Відповідь: ТІЛЬКИ JSON, без будь-якого тексту навколо`

  try {
    const result = await genModel.generateContent(prompt)
    let raw = result.response.text().trim()

    // strip markdown code fences if model added them anyway
    if (raw.startsWith('```')) {
      raw = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim()
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw) as unknown
    } catch {
      throw new Error('Gemini повернув невалідний JSON. Спробуй ще раз.')
    }

    const obj = parsed as Record<string, unknown>
    if (!obj.name || typeof obj.name !== 'string' || !obj.name.trim()) {
      throw new Error('Згенерована програма не має назви.')
    }
    const rawSessions = Array.isArray(obj.sessions) ? (obj.sessions as Record<string, unknown>[]) : []
    if (rawSessions.length === 0) {
      throw new Error('Gemini не згенерував жодної сесії.')
    }

    const sessions = ensureIds(rawSessions).map((s, idx) => {
      const rawExercises = Array.isArray(s.exercises) ? (s.exercises as Record<string, unknown>[]) : []
      return {
        id: s.id,
        name: typeof s.name === 'string' ? s.name : `Сесія ${idx + 1}`,
        order: typeof s.order === 'number' ? s.order : idx + 1,
        track: (['upper', 'lower', 'custom'].includes(s.track as string) ? s.track : 'custom') as 'upper' | 'lower' | 'custom',
        exercises: ensureIds(rawExercises).map((e, ei) => ({
          id: e.id,
          name: typeof e.name === 'string' && e.name.trim() ? e.name : `Вправа ${ei + 1}`,
          sets: typeof e.sets === 'string' ? e.sets : typeof e.sets === 'number' ? String(e.sets) : '3',
          reps: typeof e.reps === 'string' ? e.reps : typeof e.reps === 'number' ? String(e.reps) : '10',
          plannedWeight: typeof e.plannedWeight === 'number' ? e.plannedWeight : undefined,
          weightUnit: typeof e.weightUnit === 'string' ? e.weightUnit : 'kg',
          isBodyweightLoad: e.isBodyweightLoad === true ? true : undefined,
        })),
      }
    })

    const template: ProgramTemplate = {
      id: (typeof obj.id === 'string' && obj.id.trim()) ? obj.id : crypto.randomUUID(),
      name: obj.name.trim(),
      mode: (['main', 'travel', 'maintenance', 'backup'].includes(obj.mode as string) ? obj.mode : 'main') as 'main' | 'travel' | 'maintenance' | 'backup',
      track: (['upper', 'lower', 'custom'].includes(obj.track as string) ? obj.track : 'custom') as 'upper' | 'lower' | 'custom',
      focusTarget: typeof obj.focusTarget === 'string' ? obj.focusTarget : prefs.goals.slice(0, 60),
      sessions,
    }
    return template
  } catch (err) {
    if (err instanceof Error && err.message.includes('Gemini')) throw err
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
    // Gemini API requires history to start with a 'user' message — trim leading model turns
    const recentHistory = history.slice(-20)
    const firstUserIdx = recentHistory.findIndex((m) => m.role === 'user')
    const trimmedHistory = firstUserIdx >= 0 ? recentHistory.slice(firstUserIdx) : []
    const geminiHistory = trimmedHistory.map((m) => ({
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
            name: call.name as 'adjust_exercise_params',
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
