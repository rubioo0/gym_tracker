import { describe, expect, it } from 'vitest'
import { exportAppStateJson, importStateFromJson, exportCleanAppStateJson } from './storage'

describe('storage normalization', () => {
  it('merges duplicate active or paused runs for same template and rebinds logs', () => {
    const raw = JSON.stringify({
      programTemplates: [
        {
          id: 'template-1',
          name: 'Biceps',
          mode: 'main',
          track: 'upper',
          focusTarget: 'biceps',
          sessions: [
            {
              id: 'session-1',
              name: 'Session 1',
              order: 1,
              track: 'upper',
              exercises: [],
            },
            {
              id: 'session-2',
              name: 'Session 2',
              order: 2,
              track: 'upper',
              exercises: [],
            },
          ],
        },
      ],
      focusRuns: [
        {
          id: 'run-paused',
          templateId: 'template-1',
          templateName: 'Biceps old',
          mode: 'main',
          track: 'upper',
          focusTarget: 'biceps',
          status: 'paused',
          startedAt: '2026-04-10T08:00:00.000Z',
          completedSessionCount: 1,
          successfulSessionCount: 1,
          nextSessionIndex: 1,
        },
        {
          id: 'run-active',
          templateId: 'template-1',
          templateName: 'Biceps new',
          mode: 'main',
          track: 'upper',
          focusTarget: 'biceps',
          status: 'active',
          startedAt: '2026-04-18T08:00:00.000Z',
          completedSessionCount: 2,
          successfulSessionCount: 1,
          nextSessionIndex: 0,
        },
      ],
      workoutLogs: [
        {
          id: 'log-1',
          runId: 'run-paused',
          templateId: 'template-1',
          sessionId: 'session-1',
          sessionName: 'Session 1',
          track: 'upper',
          completedAt: '2026-04-10T10:00:00.000Z',
          successful: true,
          exerciseLogs: [],
          optionalActivities: [],
        },
        {
          id: 'log-2',
          runId: 'run-active',
          templateId: 'template-1',
          sessionId: 'session-2',
          sessionName: 'Session 2',
          track: 'upper',
          completedAt: '2026-04-18T10:00:00.000Z',
          successful: false,
          exerciseLogs: [],
          optionalActivities: [],
        },
      ],
      lastCompletedTrack: 'upper',
      selectedRunId: 'run-paused',
    })

    const imported = importStateFromJson(raw)
    expect(imported).not.toBeNull()
    if (!imported) {
      throw new Error('Expected non-null import state')
    }

    expect(imported.focusRuns).toHaveLength(1)
    expect(imported.focusRuns[0].id).toBe('run-active')
    expect(imported.focusRuns[0].templateName).toBe('Biceps')
    expect(imported.focusRuns[0].completedSessionCount).toBe(2)
    expect(imported.focusRuns[0].successfulSessionCount).toBe(1)
    expect(imported.focusRuns[0].nextSessionIndex).toBe(0)
    expect(imported.workoutLogs.every((log) => log.runId === 'run-active')).toBe(true)
    expect(imported.selectedRunId).toBe('run-active')
  })

  it('strips progression maxValue from imported templates', () => {
    const raw = JSON.stringify({
      programTemplates: [
        {
          id: 'template-1',
          name: 'Biceps',
          mode: 'main',
          track: 'upper',
          focusTarget: 'biceps',
          sessions: [
            {
              id: 'session-1',
              name: 'Session 1',
              order: 1,
              track: 'upper',
              exercises: [
                {
                  id: 'exercise-1',
                  name: 'Curl',
                  sets: '4',
                  reps: '10',
                  plannedWeight: 20,
                  progressionRule: {
                    type: 'weight',
                    amount: 2.5,
                    frequency: 2,
                    basis: 'successfulTrackSessions',
                    maxValue: 35,
                  },
                },
              ],
            },
          ],
        },
      ],
      focusRuns: [],
      workoutLogs: [],
      lastCompletedTrack: null,
      selectedRunId: null,
    })

    const imported = importStateFromJson(raw)
    expect(imported).not.toBeNull()
    expect(imported?.programTemplates[0].sessions[0].exercises[0].progressionRule?.maxValue).toBeUndefined()
  })

  it('preserves week frequency units on import', () => {
    const raw = JSON.stringify({
      programTemplates: [
        {
          id: 'template-1',
          name: 'Biceps',
          mode: 'main',
          track: 'upper',
          focusTarget: 'biceps',
          sessions: [
            {
              id: 'session-1',
              name: 'Session 1',
              order: 1,
              track: 'upper',
              exercises: [
                {
                  id: 'exercise-1',
                  name: 'Curl',
                  sets: '4',
                  reps: '10',
                  plannedWeight: 20,
                  progressionRule: {
                    type: 'weight',
                    amount: 2.5,
                    frequency: 1,
                    frequencyUnit: 'week',
                    basis: 'successfulTrackSessions',
                  },
                },
              ],
            },
          ],
        },
      ],
      focusRuns: [],
      workoutLogs: [],
      lastCompletedTrack: null,
      selectedRunId: null,
    })

    const imported = importStateFromJson(raw)
    expect(imported).not.toBeNull()
    expect(imported?.programTemplates[0].sessions[0].exercises[0].progressionRule?.frequencyUnit).toBe('week')
  })
})

describe('export clean state', () => {
  it('filters out archived and completed runs and their logs', () => {
    const state = {
      programTemplates: [
        {
          id: 'template-1',
          name: 'Biceps',
          mode: 'main' as const,
          track: 'upper' as const,
          focusTarget: 'biceps',
          sessions: [],
        },
      ],
      focusRuns: [
        {
          id: 'run-active',
          templateId: 'template-1',
          templateName: 'Biceps',
          mode: 'main' as const,
          track: 'upper' as const,
          focusTarget: 'biceps',
          status: 'active' as const,
          startedAt: '2026-04-18T08:00:00.000Z',
          completedSessionCount: 2,
          successfulSessionCount: 1,
          nextSessionIndex: 0,
        },
        {
          id: 'run-paused',
          templateId: 'template-1',
          templateName: 'Biceps',
          mode: 'main' as const,
          track: 'upper' as const,
          focusTarget: 'biceps',
          status: 'paused' as const,
          startedAt: '2026-04-10T08:00:00.000Z',
          completedSessionCount: 1,
          successfulSessionCount: 1,
          nextSessionIndex: 1,
        },
        {
          id: 'run-completed',
          templateId: 'template-1',
          templateName: 'Biceps',
          mode: 'main' as const,
          track: 'upper' as const,
          focusTarget: 'biceps',
          status: 'completed' as const,
          startedAt: '2026-03-10T08:00:00.000Z',
          completedSessionCount: 16,
          successfulSessionCount: 16,
          nextSessionIndex: 16,
        },
        {
          id: 'run-archived',
          templateId: 'template-1',
          templateName: 'Biceps',
          mode: 'main' as const,
          track: 'upper' as const,
          focusTarget: 'biceps',
          status: 'archived' as const,
          startedAt: '2026-02-10T08:00:00.000Z',
          completedSessionCount: 10,
          successfulSessionCount: 9,
          nextSessionIndex: 10,
        },
      ],
      workoutLogs: [
        {
          id: 'log-active',
          runId: 'run-active',
          templateId: 'template-1',
          sessionId: 'session-1',
          sessionName: 'Session 1',
          track: 'upper' as const,
          completedAt: '2026-04-18T10:00:00.000Z',
          successful: true,
          exerciseLogs: [],
          optionalActivities: [],
        },
        {
          id: 'log-paused',
          runId: 'run-paused',
          templateId: 'template-1',
          sessionId: 'session-2',
          sessionName: 'Session 2',
          track: 'upper' as const,
          completedAt: '2026-04-10T10:00:00.000Z',
          successful: true,
          exerciseLogs: [],
          optionalActivities: [],
        },
        {
          id: 'log-completed',
          runId: 'run-completed',
          templateId: 'template-1',
          sessionId: 'session-3',
          sessionName: 'Session 3',
          track: 'upper' as const,
          completedAt: '2026-03-15T10:00:00.000Z',
          successful: true,
          exerciseLogs: [],
          optionalActivities: [],
        },
        {
          id: 'log-archived',
          runId: 'run-archived',
          templateId: 'template-1',
          sessionId: 'session-4',
          sessionName: 'Session 4',
          track: 'upper' as const,
          completedAt: '2026-02-15T10:00:00.000Z',
          successful: true,
          exerciseLogs: [],
          optionalActivities: [],
        },
      ],
      lastCompletedTrack: 'upper' as const,
      selectedRunId: 'run-active',
    }

    const exported = exportCleanAppStateJson(state)
    const parsed = JSON.parse(exported)

    expect(parsed.state.focusRuns).toHaveLength(2)
    expect(parsed.state.focusRuns.map((r: any) => r.id)).toEqual([
      'run-active',
      'run-paused',
    ])
    expect(parsed.state.workoutLogs).toHaveLength(2)
    expect(
      parsed.state.workoutLogs.map((l: any) => l.id).sort(),
    ).toEqual(['log-active', 'log-paused'].sort())
    expect(parsed.state.selectedRunId).toBe('run-active')
    expect(parsed.filterNote).toBeDefined()
  })

  it('clears selectedRunId if it was archived or completed', () => {
    const state = {
      programTemplates: [
        {
          id: 'template-1',
          name: 'Biceps',
          mode: 'main' as const,
          track: 'upper' as const,
          focusTarget: 'biceps',
          sessions: [],
        },
      ],
      focusRuns: [
        {
          id: 'run-active',
          templateId: 'template-1',
          templateName: 'Biceps',
          mode: 'main' as const,
          track: 'upper' as const,
          focusTarget: 'biceps',
          status: 'active' as const,
          startedAt: '2026-04-18T08:00:00.000Z',
          completedSessionCount: 2,
          successfulSessionCount: 1,
          nextSessionIndex: 0,
        },
        {
          id: 'run-completed',
          templateId: 'template-1',
          templateName: 'Biceps',
          mode: 'main' as const,
          track: 'upper' as const,
          focusTarget: 'biceps',
          status: 'completed' as const,
          startedAt: '2026-03-10T08:00:00.000Z',
          completedSessionCount: 16,
          successfulSessionCount: 16,
          nextSessionIndex: 16,
        },
      ],
      workoutLogs: [
        {
          id: 'log-active',
          runId: 'run-active',
          templateId: 'template-1',
          sessionId: 'session-1',
          sessionName: 'Session 1',
          track: 'upper' as const,
          completedAt: '2026-04-18T10:00:00.000Z',
          successful: true,
          exerciseLogs: [],
          optionalActivities: [],
        },
      ],
      lastCompletedTrack: 'upper' as const,
      selectedRunId: 'run-completed',
    }

    const exported = exportCleanAppStateJson(state)
    const parsed = JSON.parse(exported)

    expect(parsed.state.selectedRunId).toBeNull()
  })

  it('omits progression maxValue from exported app state backups', () => {
    const state = {
      programTemplates: [
        {
          id: 'template-1',
          name: 'Biceps',
          mode: 'main' as const,
          track: 'upper' as const,
          focusTarget: 'biceps',
          sessions: [
            {
              id: 'session-1',
              name: 'Session 1',
              order: 1,
              track: 'upper' as const,
              exercises: [
                {
                  id: 'exercise-1',
                  name: 'Curl',
                  sets: '4',
                  reps: '10',
                  plannedWeight: 20,
                  progressionRule: {
                    type: 'weight' as const,
                    amount: 2.5,
                    frequency: 2,
                    basis: 'successfulTrackSessions' as const,
                    maxValue: 35,
                  },
                },
              ],
            },
          ],
        },
      ],
      focusRuns: [],
      workoutLogs: [],
      lastCompletedTrack: null,
      selectedRunId: null,
    }

    const exported = JSON.parse(exportAppStateJson(state as any))
    expect(exported.state.programTemplates[0].sessions[0].exercises[0].progressionRule.maxValue).toBeUndefined()
  })
})
