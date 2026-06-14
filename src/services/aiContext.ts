import type { AppState, FocusRun, ProgramTemplate, WorkoutLog } from '../domain/types'
import { buildPlannedSession, getTemplateById } from '../domain/logic'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatTrack(track: string): string {
  const map: Record<string, string> = { upper: 'верх', lower: 'низ', custom: 'custom' }
  return map[track] ?? track
}

function formatMode(mode: string): string {
  const map: Record<string, string> = {
    main: 'основна',
    travel: 'подорож',
    maintenance: 'підтримка',
    backup: 'запасна',
  }
  return map[mode] ?? mode
}

function buildActiveRunSection(
  run: FocusRun,
  template: ProgramTemplate,
  workoutLogs: WorkoutLog[],
): string {
  const lines: string[] = []
  lines.push(
    `### Програма: "${run.templateName}" (${formatTrack(run.track)}, ${formatMode(run.mode)}) [runId: ${run.id}]`,
  )
  lines.push(
    `- Прогрес: ${run.completedSessionCount}/16 сесій (${run.successfulSessionCount} успішних)`,
  )
  lines.push(`- Розпочато: ${formatDate(run.startedAt)}`)
  if (run.notes) lines.push(`- Нотатка: ${run.notes}`)

  const runLogs = workoutLogs.filter((l) => l.runId === run.id)
  const planned = buildPlannedSession(run, template, runLogs)

  lines.push(`\n**Наступна сесія: ${planned.session.name}**`)
  for (const ex of planned.exercises) {
    let line = `- ${ex.name}: ${ex.sets} × ${ex.reps}`
    if (ex.plannedWeight) {
      line += ` @ ${ex.plannedWeight}${ex.weightUnit ?? 'kg'}`
    } else if (ex.isBodyweightLoad) {
      line += ` (власна вага)`
    }
    if (ex.progressionCycleStatus) {
      const cs = ex.progressionCycleStatus
      const cycleTag = cs.isHeldBeyondPlannedWindow
        ? ` [цикл ${cs.displayNumerator}/${cs.displayDenominator} — УТРИМАННЯ]`
        : ` [цикл ${cs.displayNumerator}/${cs.displayDenominator}]`
      line += cycleTag
    }
    if (ex.progressionNote) line += ` | ${ex.progressionNote}`
    const override = run.weightOverrides?.[ex.name]
    if (override) line += ` *(вагу змінено: ${override.weight}${override.unit})*`
    const setsOv = run.setsOverrides?.[ex.name]
    if (setsOv) line += ` *(підходи змінено: ${setsOv})*`
    const repsOv = run.repsOverrides?.[ex.name]
    if (repsOv) line += ` *(повтори змінено: ${repsOv})*`
    lines.push(line)
  }

  return lines.join('\n')
}

function buildRecentWorkoutsSection(workoutLogs: WorkoutLog[]): string {
  if (workoutLogs.length === 0) return ''

  const recent = [...workoutLogs]
    .sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1))
    .slice(0, 15)

  const lines: string[] = ['## Останні тренування (до 15)']

  for (const log of recent) {
    const date = formatDate(log.completedAt)
    const status = log.successful ? 'успішно' : 'невдало'
    lines.push(`\n### ${date} — ${log.sessionName} (${status})`)

    for (const el of log.exerciseLogs) {
      if (el.skipped) continue
      let entry = `- ${el.exerciseName}`
      if (el.actualWeight != null) {
        entry += `: ${el.actualWeight}${el.weightUnit ?? 'kg'}`
      } else if (el.plannedWeight != null) {
        entry += `: ${el.plannedWeight}${el.weightUnit ?? 'kg'} (план)`
      }
      if (el.difficulty) {
        const diffMap: Record<string, string> = { easy: 'легко', okay: 'нормально', hard: 'важко' }
        entry += ` [${diffMap[el.difficulty] ?? el.difficulty}]`
      }
      if (el.note) entry += ` — "${el.note}"`
      lines.push(entry)
    }

    if (log.sessionNote) lines.push(`  *Нотатка: ${log.sessionNote}*`)
  }

  return lines.join('\n')
}

function buildHeldExercisesSection(state: AppState): string {
  const held: string[] = []

  for (const run of state.focusRuns.filter((r) => r.status === 'active')) {
    const template = getTemplateById(state.programTemplates, run.templateId)
    if (!template) continue
    const runLogs = state.workoutLogs.filter((l) => l.runId === run.id)
    const planned = buildPlannedSession(run, template, runLogs)

    for (const ex of planned.exercises) {
      const cs = ex.progressionCycleStatus
      if (!cs?.isHeldBeyondPlannedWindow) continue
      const w = ex.plannedWeight != null ? `${ex.plannedWeight}${ex.weightUnit ?? 'kg'}` : '?'
      held.push(
        `- ${ex.name} (${run.templateName}): ${w} — ${cs.displayNumerator}/${cs.displayDenominator} сесій на цій вазі`,
      )
    }
  }

  if (held.length === 0) return ''
  return ['## Застряглі вправи (утримання ваги понад план)', ...held].join('\n')
}

export function buildFitnessSystemPrompt(state: AppState): string {
  const today = new Date().toLocaleDateString('uk-UA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const activeRuns = state.focusRuns.filter((r) => r.status === 'active')

  const sections: string[] = [
    `Ти — персональний фітнес-асистент. Відповідай ТІЛЬКИ українською мовою. Будь конкретним і практичним.`,
    `Сьогодні: ${today}.`,
    '',
  ]

  if (activeRuns.length === 0) {
    sections.push('## Активні програми\nНаразі немає активних програм тренувань.')
  } else {
    sections.push('## Активні програми тренувань')
    for (const run of activeRuns) {
      const template = getTemplateById(state.programTemplates, run.templateId)
      if (!template) continue
      sections.push('')
      sections.push(buildActiveRunSection(run, template, state.workoutLogs))
    }
  }

  const recentSection = buildRecentWorkoutsSection(state.workoutLogs)
  if (recentSection) {
    sections.push('')
    sections.push(recentSection)
  }

  const heldSection = buildHeldExercisesSection(state)
  if (heldSection) {
    sections.push('')
    sections.push(heldSection)
  }

  sections.push('')
  sections.push(
    '---\nСпирайся виключно на наведені дані. Якщо даних недостатньо — скажи про це. ' +
      'Давай конкретні, практичні поради. Не вигадуй інформацію, якої немає вище.',
  )

  return sections.join('\n')
}
