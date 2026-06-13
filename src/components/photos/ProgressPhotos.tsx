import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import { deletePhoto, loadAllPhotos, savePhoto } from '../../services/photoStorage'
import type { ProgressPhoto } from '../../services/photoStorage'
import { analyzeProgressPhotos } from '../../services/geminiService'
import './ProgressPhotos.css'

interface ProgressPhotosProps {
  apiKey: string
  model: string
}

function resizeImage(file: File, maxSize = 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1)
      canvas.width = Math.round(img.width * ratio)
      canvas.height = Math.round(img.height * ratio)
      const ctx = canvas.getContext('2d')
      if (!ctx) { resolve(canvas.toDataURL('image/jpeg', 0.85)); return }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Не вдалось прочитати зображення')) }
    img.src = url
  })
}

function formatPhotoDate(iso: string): string {
  return new Date(iso).toLocaleDateString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function ProgressPhotos({ apiKey, model }: ProgressPhotosProps) {
  const [photos, setPhotos] = useState<ProgressPhoto[]>([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [analysis, setAnalysis] = useState<string | null>(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadAllPhotos()
      .then(setPhotos)
      .catch(() => setError('Не вдалось завантажити фото'))
      .finally(() => setInitialLoading(false))
  }, [])

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setUploading(true)
    setError(null)
    try {
      const dataUrl = await resizeImage(file)
      const photo: ProgressPhoto = {
        id: crypto.randomUUID(),
        takenAt: new Date().toISOString(),
        dataUrl,
      }
      await savePhoto(photo)
      setPhotos((prev) => [photo, ...prev])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не вдалось зберегти фото')
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await deletePhoto(id)
      setPhotos((prev) => prev.filter((p) => p.id !== id))
      setSelected((prev) => prev.filter((s) => s !== id))
      setAnalysis(null)
    } catch {
      setError('Не вдалось видалити фото')
    }
  }

  function toggleSelect(id: string) {
    setAnalysis(null)
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((s) => s !== id)
      if (prev.length < 2) return [...prev, id]
      return [prev[1], id]
    })
  }

  async function handleAnalyze() {
    if (!apiKey) {
      setError('API ключ Gemini не налаштовано. Відкрий AI Тренер (🤖) → Налаштування.')
      return
    }
    const [id1, id2] = selected
    const p1 = photos.find((p) => p.id === id1)
    const p2 = photos.find((p) => p.id === id2)
    if (!p1 || !p2) return

    setAnalysisLoading(true)
    setError(null)
    setAnalysis(null)
    try {
      const result = await analyzeProgressPhotos(apiKey, model,
        { dataUrl: p1.dataUrl, date: formatPhotoDate(p1.takenAt) },
        { dataUrl: p2.dataUrl, date: formatPhotoDate(p2.takenAt) },
      )
      setAnalysis(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка аналізу')
    } finally {
      setAnalysisLoading(false)
    }
  }

  return (
    <div className="pp-root">
      <div className="pp-header">
        <h2 className="pp-title">Фото прогресу</h2>
        <button
          className="pp-add-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? 'Зберігаю…' : '+ Додати фото'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="pp-file-input"
          onChange={(e) => void handleFileChange(e)}
        />
      </div>

      {!apiKey && (
        <p className="pp-hint pp-hint--warn">
          Для AI-аналізу налаштуй Gemini API ключ у вікні AI Тренера (🤖).
        </p>
      )}

      {selected.length === 2 && (
        <div className="pp-compare-bar">
          <span className="pp-compare-label">2 фото обрано для порівняння</span>
          <button
            className="pp-compare-btn"
            onClick={() => void handleAnalyze()}
            disabled={analysisLoading || !apiKey}
          >
            {analysisLoading ? '⏳ Аналізую…' : '🤖 Порівняти з AI'}
          </button>
        </div>
      )}

      {error && <p className="pp-error">{error}</p>}

      {analysis && (
        <div className="pp-analysis">
          <div className="pp-analysis-header">
            <span>Аналіз прогресу</span>
            <button className="pp-analysis-close" onClick={() => setAnalysis(null)}>✕</button>
          </div>
          <div className="pp-analysis-body">
            <ReactMarkdown>{analysis}</ReactMarkdown>
          </div>
        </div>
      )}

      {initialLoading ? (
        <p className="pp-hint">Завантаження…</p>
      ) : photos.length === 0 ? (
        <div className="pp-empty">
          <p className="pp-empty-text">Ще немає фото. Додай перше фото щоб почати відстежувати прогрес!</p>
          <p className="pp-hint">
            Рекомендація: знімай у схожому освітленні, однакова поза (анфас / збоку), раз на 2–4 тижні.
          </p>
        </div>
      ) : (
        <>
          <div className="pp-grid">
            {photos.map((photo) => {
              const selIdx = selected.indexOf(photo.id)
              const isSelected = selIdx >= 0
              return (
                <div
                  key={photo.id}
                  className={`pp-card${isSelected ? ' pp-card--selected' : ''}`}
                  onClick={() => toggleSelect(photo.id)}
                >
                  <img
                    className="pp-thumb"
                    src={photo.dataUrl}
                    alt={`Прогрес ${formatPhotoDate(photo.takenAt)}`}
                  />
                  <div className="pp-card-footer">
                    <span className="pp-card-date">{formatPhotoDate(photo.takenAt)}</span>
                    {isSelected && (
                      <span className="pp-card-badge">{selIdx + 1}</span>
                    )}
                  </div>
                  <button
                    className="pp-card-delete"
                    onClick={(e) => { e.stopPropagation(); void handleDelete(photo.id) }}
                    title="Видалити"
                    aria-label="Видалити фото"
                  >
                    ✕
                  </button>
                </div>
              )
            })}
          </div>
          {photos.length >= 2 && selected.length < 2 && (
            <p className="pp-hint pp-select-hint">
              Натисни на 2 фото щоб порівняти їх через AI
            </p>
          )}
          {photos.length === 1 && (
            <p className="pp-hint">Додай ще одне фото для AI-порівняння</p>
          )}
        </>
      )}
    </div>
  )
}
