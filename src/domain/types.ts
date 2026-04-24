export type TrackType = 'upper' | 'lower' | 'custom'

export type ProgramMode = 'main' | 'travel' | 'maintenance' | 'backup'

export type RunStatus = 'active' | 'paused' | 'completed' | 'archived'

export type ProgressionType = 'weight' | 'reps'

export type ProgressionBasis = 'trackSessions' | 'successfulTrackSessions'

export type ProgressionFrequencyUnit = 'session' | 'week'

export type ExerciseDifficulty = 'easy' | 'okay' | 'hard'

export interface ExerciseReference {
  imageUrl?: string
  videoUrl?: string
  techniqueNote?: string
}

export interface ProgressionRule {
  type: ProgressionType
  amount: number
  amountPerSide?: number
  frequency: number
  frequencyUnit?: ProgressionFrequencyUnit
  basis: ProgressionBasis
  maxValue?: number
  minValue?: number
  note?: string
}

export interface ExerciseTemplate {
  id: string
  name: string
  sets: string
  reps: string
  plannedWeight?: number
  plannedWeightPerSide?: number
  weightUnit?: string
  isBodyweightLoad?: boolean
  plannedLoadLabel?: string
  progressionRule?: ProgressionRule
  note?: string
  reference?: ExerciseReference
}

export interface OptionalActivityTemplate {
  id: string
  name: string
  defaultDuration?: string
  note?: string
}

export interface SessionTemplate {
  id: string
  name: string
  order: number
  track: TrackType
  exercises: ExerciseTemplate[]
  optionalActivities?: OptionalActivityTemplate[]
  note?: string
}

export interface ProgramTemplate {
  id: string
  name: string
  mode: ProgramMode
  track: TrackType
  focusTarget: string
  sessions: SessionTemplate[]
  note?: string
}

export interface FocusRun {
  id: string
  templateId: string
  templateName: string
  mode: ProgramMode
  track: TrackType
  focusTarget: string
  status: RunStatus
  startedAt: string
  completedSessionCount: number
  successfulSessionCount: number
  nextSessionIndex: number
  notes?: string
  pauseReason?: string
}

export interface ExerciseLog {
  exerciseId: string
  exerciseName: string
  completed: boolean
  skipped: boolean
  plannedWeight?: number
  actualWeight?: number
  weightUnit?: string
  note?: string
  difficulty?: ExerciseDifficulty
}

export interface OptionalActivityLog {
  activityId: string
  name: string
  duration?: string
  completed: boolean
  note?: string
}

export interface WorkoutLog {
  id: string
  runId: string
  templateId: string
  sessionId: string
  sessionName: string
  track: TrackType
  completedAt: string
  successful: boolean
  exerciseLogs: ExerciseLog[]
  optionalActivities: OptionalActivityLog[]
  sessionNote?: string
}

export interface PlannedExercise {
  id: string
  name: string
  sets: string
  reps: string
  basePlannedWeight?: number
  basePlannedWeightPerSide?: number
  plannedWeight?: number
  plannedWeightPerSide?: number
  weightUnit?: string
  isBodyweightLoad?: boolean
  plannedLoadLabel?: string
  progressionNote?: string
  nextTargetHint?: string
  sessionDoneCount?: number
  sessionLeftCount?: number
  maxPlannedWeight?: number
  maxPlannedWeightPerSide?: number
  maxWeightExplanation?: string
  note?: string
  reference?: ExerciseReference
}

export interface PlannedSession {
  run: FocusRun
  template: ProgramTemplate
  session: SessionTemplate
  exercises: PlannedExercise[]
}

export interface CalendarSessionExercise {
  id: string
  name: string
  sets: string
  reps: string
  plannedWeight?: number
  plannedWeightPerSide?: number
  weightUnit?: string
  actualWeight?: number
  completed?: boolean
  skipped?: boolean
}

export interface CalendarSession {
  sessionIndex: number
  sessionId: string
  sessionName: string
  track: TrackType
  loggedDate?: string
  projectedDate?: string
  exercises: CalendarSessionExercise[]
  isCompleted: boolean
}

export interface ProgramCalendar {
  runId: string
  templateId: string
  startDate: string
  estimatedEndDate: string
  avgDaysBetweenSessions: number
  sessions: CalendarSession[]
}

export interface AppState {
  programTemplates: ProgramTemplate[]
  focusRuns: FocusRun[]
  workoutLogs: WorkoutLog[]
  lastCompletedTrack: TrackType | null
  selectedRunId: string | null
}

export interface LogExerciseInput {
  exerciseId: string
  completed: boolean
  skipped: boolean
  actualWeight?: number
  note?: string
  difficulty?: ExerciseDifficulty
}

export interface LogActivityInput {
  activityId: string
  completed: boolean
  duration?: string
  note?: string
}

export interface LogSessionInput {
  runId: string
  completedAt: string
  successful?: boolean
  exerciseInputs: LogExerciseInput[]
  activityInputs: LogActivityInput[]
  sessionNote?: string
}
