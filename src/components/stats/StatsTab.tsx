import { useMemo } from 'react'
import type { FocusRun, ProgramTemplate, WorkoutLog } from '../../domain/types'
import './StatsTab.css'

interface StatsTabProps {
  workoutLogs: WorkoutLog[]
  focusRuns: FocusRun[]
  programTemplates: ProgramTemplate[]
}

const PROGRAM_TOTAL_SESSIONS = 16

const statusLabelMap: Record<string, string> = {
  active: 'Активне',
  paused: 'На паузі',
  completed: 'Завершено',
  archived: 'Архівовано',
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('uk-UA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function getISOWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

export function StatsTab({ workoutLogs, focusRuns, programTemplates }: StatsTabProps) {
  // ── Section 1: Summary KPIs ──────────────────────────────────────────────
  const totalWorkouts = workoutLogs.length

  const overallSuccessRate = useMemo(() => {
    if (workoutLogs.length === 0) return 0
    return Math.round((workoutLogs.filter((l) => l.successful).length / workoutLogs.length) * 100)
  }, [workoutLogs])

  const activePrograms = useMemo(
    () => focusRuns.filter((r) => r.status === 'active').length,
    [focusRuns],
  )

  const totalExercisesCompleted = useMemo(
    () =>
      workoutLogs.reduce(
        (sum, log) => sum + log.exerciseLogs.filter((e) => e.completed && !e.skipped).length,
        0,
      ),
    [workoutLogs],
  )

  // ── Section 2: Training Consistency ─────────────────────────────────────
  const { currentStreakWeeks, avgWorkoutsPerWeek, monthlyActivity } = useMemo(() => {
    if (workoutLogs.length === 0) {
      const emptyMonths = buildEmptyMonths()
      return { currentStreakWeeks: 0, avgWorkoutsPerWeek: 0, monthlyActivity: emptyMonths }
    }

    const weekSet = new Set<string>()
    workoutLogs.forEach((log) => weekSet.add(getISOWeekKey(new Date(log.completedAt))))

    const today = new Date()
    const todayDow = today.getDay() || 7
    let streakWeeks = 0
    let cursor = new Date(
      Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() - (todayDow - 1)),
    )

    // Current week may be empty (still in progress) — skip it and start from last week
    if (!weekSet.has(getISOWeekKey(cursor))) {
      cursor.setUTCDate(cursor.getUTCDate() - 7)
    }
    while (weekSet.has(getISOWeekKey(cursor))) {
      streakWeeks++
      cursor.setUTCDate(cursor.getUTCDate() - 7)
    }

    // Avg workouts/week over last 12 weeks
    const twelveWeeksAgo = new Date(today)
    twelveWeeksAgo.setDate(today.getDate() - 84)
    const recentCount = workoutLogs.filter((l) => new Date(l.completedAt) >= twelveWeeksAgo).length
    const avgWorkoutsPerWeek = Math.round((recentCount / 12) * 10) / 10

    // Monthly activity: last 6 months
    const monthlyMap = new Map<string, number>()
    const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 5, 1)
    workoutLogs.forEach((log) => {
      const d = new Date(log.completedAt)
      if (d >= sixMonthsAgo) {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + 1)
      }
    })

    const monthlyActivity = buildEmptyMonths(today).map((m) => ({
      ...m,
      count: monthlyMap.get(m.key) ?? 0,
    }))

    return { currentStreakWeeks: streakWeeks, avgWorkoutsPerWeek, monthlyActivity }
  }, [workoutLogs])

  // ── Section 3: Per-Run Progress ──────────────────────────────────────────
  const runProgressData = useMemo(() => {
    return focusRuns
      .filter((r) => r.status !== 'archived')
      .map((run) => {
        const template = programTemplates.find((t) => t.id === run.templateId)
        const totalSessions = template ? template.sessions.length * 2 : PROGRAM_TOTAL_SESSIONS
        const completionPct = Math.min(
          100,
          Math.round((run.completedSessionCount / totalSessions) * 100),
        )
        const successRate =
          run.completedSessionCount > 0
            ? Math.round((run.successfulSessionCount / run.completedSessionCount) * 100)
            : 0
        const daysActive = Math.ceil(
          (Date.now() - new Date(run.startedAt).getTime()) / (1000 * 60 * 60 * 24),
        )
        return { run, completionPct, successRate, daysActive, totalSessions }
      })
      .sort((a, b) => {
        const order: Record<string, number> = { active: 0, paused: 1, completed: 2 }
        return (order[a.run.status] ?? 3) - (order[b.run.status] ?? 3)
      })
  }, [focusRuns, programTemplates])

  // ── Section 4: Exercise Personal Records ────────────────────────────────
  const exercisePRs = useMemo(() => {
    const prMap = new Map<
      string,
      { exerciseId: string; exerciseName: string; maxWeight: number; weightUnit: string; achievedAt: string }
    >()

    workoutLogs.forEach((log) => {
      log.exerciseLogs.forEach((el) => {
        if (!el.completed || el.skipped) return
        if (typeof el.actualWeight !== 'number' || el.actualWeight <= 0) return
        const existing = prMap.get(el.exerciseId)
        if (!existing || el.actualWeight > existing.maxWeight) {
          prMap.set(el.exerciseId, {
            exerciseId: el.exerciseId,
            exerciseName: el.exerciseName,
            maxWeight: el.actualWeight,
            weightUnit: el.weightUnit ?? 'kg',
            achievedAt: log.completedAt,
          })
        }
      })
    })

    return Array.from(prMap.values()).sort((a, b) => b.maxWeight - a.maxWeight)
  }, [workoutLogs])

  // ── Section 5: Exercise Progression (baseline → current) ────────────────
  const exerciseProgressions = useMemo(() => {
    const currentMaxMap = new Map<string, { weight: number; unit: string; name: string }>()
    workoutLogs.forEach((log) => {
      log.exerciseLogs.forEach((el) => {
        if (!el.completed || el.skipped) return
        if (typeof el.actualWeight !== 'number' || el.actualWeight <= 0) return
        const existing = currentMaxMap.get(el.exerciseId)
        if (!existing || el.actualWeight > existing.weight) {
          currentMaxMap.set(el.exerciseId, {
            weight: el.actualWeight,
            unit: el.weightUnit ?? 'kg',
            name: el.exerciseName,
          })
        }
      })
    })

    const raw: Array<{
      exerciseId: string
      exerciseName: string
      baselineWeight: number
      currentMaxWeight: number
      weightUnit: string
      gainKg: number
      gainPct: number
      runName: string
    }> = []

    focusRuns.forEach((run) => {
      if (!run.baselineAnchors) return
      Object.entries(run.baselineAnchors).forEach(([exerciseId, anchor]) => {
        const current = currentMaxMap.get(exerciseId)
        if (!current || anchor.weight <= 0) return
        const gainKg = Math.round((current.weight - anchor.weight) * 10) / 10
        const gainPct = Math.round((gainKg / anchor.weight) * 100)
        raw.push({
          exerciseId,
          exerciseName: current.name,
          baselineWeight: anchor.weight,
          currentMaxWeight: current.weight,
          weightUnit: current.unit,
          gainKg,
          gainPct,
          runName: run.templateName,
        })
      })
    })

    // Deduplicate: keep highest gainPct per exerciseId
    const deduped = new Map<string, (typeof raw)[0]>()
    raw.forEach((p) => {
      const ex = deduped.get(p.exerciseId)
      if (!ex || p.gainPct > ex.gainPct) deduped.set(p.exerciseId, p)
    })

    return Array.from(deduped.values()).sort((a, b) => b.gainPct - a.gainPct)
  }, [focusRuns, workoutLogs])

  const maxMonthCount = Math.max(...monthlyActivity.map((m) => m.count), 1)

  return (
    <section className="panel-grid">
      {/* 1 — Summary KPIs */}
      <article className="card card-wide">
        <h2 className="stats-section-title">Зведена статистика</h2>
        <div className="stats-kpi-row">
          <div className="kpi">
            <span>Всього тренувань</span>
            <strong>{totalWorkouts}</strong>
          </div>
          <div className="kpi">
            <span>Успішність</span>
            <strong>{overallSuccessRate}%</strong>
          </div>
          <div className="kpi">
            <span>Активних програм</span>
            <strong>{activePrograms}</strong>
          </div>
          <div className="kpi">
            <span>Завершено вправ</span>
            <strong>{totalExercisesCompleted}</strong>
          </div>
        </div>
      </article>

      {/* 2 — Training Consistency */}
      <article className="card">
        <h2 className="stats-section-title">Регулярність</h2>
        <div className="kpi">
          <span>Поточна серія (тиж.)</span>
          <strong>{currentStreakWeeks}</strong>
        </div>
        <div className="kpi" style={{ marginTop: '0.65rem' }}>
          <span>Сер. тренувань / тиж.</span>
          <strong>{avgWorkoutsPerWeek}</strong>
        </div>
      </article>

      {/* 2b — Monthly activity bar chart */}
      <article className="card" style={{ gridColumn: 'span 2' }}>
        <h2 className="stats-section-title">Активність (місяці)</h2>
        {totalWorkouts === 0 ? (
          <p className="muted">Немає даних.</p>
        ) : (
          <div className="stats-bar-chart">
            {monthlyActivity.map(({ label, key, count }) => (
              <div key={key} className="stats-bar-col">
                <div className="stats-bar-track">
                  <div
                    className="stats-bar-fill"
                    style={{ height: `${Math.round((count / maxMonthCount) * 100)}%` }}
                    title={`${count} тренувань`}
                  />
                </div>
                <span className="stats-bar-label">{count}</span>
                <span className="stats-bar-month">{label}</span>
              </div>
            ))}
          </div>
        )}
      </article>

      {/* 3 — Per-Run Progress */}
      <article className="card card-wide">
        <h2 className="stats-section-title">Прогрес по програмах</h2>
        {runProgressData.length === 0 ? (
          <p className="muted">Немає активних програм.</p>
        ) : (
          <ul className="list-plain">
            {runProgressData.map(({ run, completionPct, successRate, daysActive }) => (
              <li key={run.id} className="item-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.4rem' }}>
                <div className="stats-run-header">
                  <strong>{run.templateName}</strong>
                  <span className={`session-meta-pill stats-status-${run.status}`}>
                    {statusLabelMap[run.status]}
                  </span>
                </div>
                <div className="stats-progress-bar-wrap">
                  <div className="stats-progress-bar">
                    <div className="stats-progress-fill" style={{ width: `${completionPct}%` }} />
                  </div>
                  <span className="muted" style={{ fontSize: '0.82rem', minWidth: '2.5rem', textAlign: 'right' }}>
                    {completionPct}%
                  </span>
                </div>
                <div className="stats-run-meta muted">
                  {run.completedSessionCount} сес. завершено &bull; Успішність: {successRate}% &bull;{' '}
                  {daysActive} дн. активно
                </div>
              </li>
            ))}
          </ul>
        )}
      </article>

      {/* 4 — Exercise Personal Records */}
      <article className="card card-wide">
        <h2 className="stats-section-title">Особисті рекорди (макс. вага)</h2>
        {exercisePRs.length === 0 ? (
          <p className="muted">Немає даних про рекорди.</p>
        ) : (
          <div className="stats-pr-grid">
            {exercisePRs.map((pr) => (
              <div key={pr.exerciseId} className="kpi">
                <span>{pr.exerciseName}</span>
                <strong>
                  {pr.maxWeight} {pr.weightUnit}
                </strong>
                <span className="muted" style={{ fontSize: '0.75rem' }}>
                  {formatDateShort(pr.achievedAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </article>

      {/* 5 — Exercise Progression */}
      <article className="card card-wide">
        <h2 className="stats-section-title">Прогресія вправ (базовий → поточний)</h2>
        {exerciseProgressions.length === 0 ? (
          <p className="muted">Немає базових значень для порівняння.</p>
        ) : (
          <ul className="list-plain">
            {exerciseProgressions.map((prog) => (
              <li key={prog.exerciseId} className="item-row">
                <div>
                  <strong>{prog.exerciseName}</strong>
                  <div className="muted" style={{ fontSize: '0.8rem' }}>
                    {prog.runName}
                  </div>
                </div>
                <div className="stats-progression-values">
                  <span className="muted">
                    {prog.baselineWeight} {prog.weightUnit}
                  </span>
                  <span className="stats-arrow">→</span>
                  <strong>
                    {prog.currentMaxWeight} {prog.weightUnit}
                  </strong>
                  <span
                    className={
                      prog.gainKg > 0
                        ? 'stats-gain-positive'
                        : prog.gainKg < 0
                          ? 'stats-gain-negative'
                          : 'stats-gain-neutral'
                    }
                  >
                    {prog.gainKg > 0 ? '+' : ''}
                    {prog.gainKg} {prog.weightUnit} ({prog.gainPct}%)
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </article>
    </section>
  )
}

function buildEmptyMonths(today = new Date()): Array<{ label: string; key: string; count: number }> {
  const months: Array<{ label: string; key: string; count: number }> = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleString('uk-UA', { month: 'short', year: '2-digit' })
    months.push({ label, key, count: 0 })
  }
  return months
}
