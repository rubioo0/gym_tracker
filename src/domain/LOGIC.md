# GEM3 Progression Logic — Source of Truth

This document describes how weight/rep progression is calculated. Treat it as the authoritative reference when reading or writing business logic in `logic.ts`.

---

## Constants

| Constant | Value | Meaning |
|---|---|---|
| `FIXED_PROGRAM_WEEKS` | 8 | Program duration in weeks |
| `FIXED_PROGRAM_SESSIONS` | 16 | Total sessions in a program run |
| `SESSIONS_PER_WEEK` | 2 | 16 sessions / 8 weeks |
| `PROGRESSION_WEIGHT_TOLERANCE` | 0.01 | Tolerance (kg/lbs) when comparing actual vs planned weight to decide if an anchor should be created |
| `PROGRESSION_CYCLE_WEIGHT_TOLERANCE` | 0.01 | Tolerance when checking consecutive "held" sessions in `countHeldCycleExtensions` |

---

## ProgressionRule Fields

```ts
interface ProgressionRule {
  type: 'weight' | 'reps'   // what increases
  amount: number             // how much per progression step
  amountPerSide?: number     // for dumbbell-style per-side load (overrides amount/2)
  frequency: number          // how often (raw number, unit depends on frequencyUnit)
  frequencyUnit?: 'session' | 'week'  // default = 'session'
  basis: 'trackSessions' | 'successfulTrackSessions'
  maxValue?: number          // progression is capped at this weight/reps
  minValue?: number
  note?: string              // display-only override for the progression hint
}
```

### `frequencyUnit` semantics

`getEffectiveFrequencySessions(rule)` converts the rule into a **session count per window**:

- `frequencyUnit = 'session'` (or undefined): window = `rule.frequency` sessions
- `frequencyUnit = 'week'`: window = `Math.round(rule.frequency × SESSIONS_PER_WEEK)`

Example: `frequency: 2, frequencyUnit: 'week'` → window = `round(2 × 2) = 4` sessions.

### `basis` semantics

- `'trackSessions'`: count **all** completed non-skipped sessions (default)
- `'successfulTrackSessions'`: count only sessions where `runLog.successful = true`

---

## Anchor Context Resolution (`resolveProgressionAnchorContext`)

The "anchor" defines the starting point for progression calculation. Priority order:

1. **`baselineAnchor`** (from `run.baselineAnchors[exerciseId]`) — used when the user performed a weight different from what the template projected. `anchorSession = anchor.resetAtSessionIndex + 1`.
2. **`latestActual`** — used when there is at least one completed log. `anchorWeight = exercise.plannedWeight` (template value), `anchorSession = 0`.
3. **`template`** — no prior logs. `anchorWeight = exercise.plannedWeight`, `anchorSession = progressionSessionCount`.

The anchor sets:
- `anchorWeight`: the weight that serves as the base for all further increments
- `anchorSession`: the session index at which progression resets (sessions before this are ignored)
- `valueSource`: one of `'template' | 'latestActual' | 'baselineAnchor'`

---

## Weight Calculation (`getPlannedExercise`)

```
sessionsSinceAnchor = max(0, progressionSessionCount - anchorSession)
steps               = floor(sessionsSinceAnchor / effectiveFrequencySessions)
plannedWeight       = clamp(anchorWeight + steps × rule.amount, minValue, ∞)
```

Example: `anchorWeight=35`, `amount=5`, window=4, `progressionSessionCount=9`, `anchorSession=5`:
- `sessionsSinceAnchor = 4`, `steps = 1`, `plannedWeight = 35+5 = 40`

---

## Progression Cycle Status (`buildProgressionCycleStatus`)

This produces the `X/Y (held)` display on the exercise card.

### Normal case (no held extension)

```
sessionsSinceAnchor        = max(0, targetSessionIndex - anchorSession)
completedInCurrentWindow   = (sessionsSinceAnchor % windowSize) + 1
displayNumerator           = min(completedInCurrentWindow, windowSize)
displayDenominator         = windowSize
isHeldBeyondPlannedWindow  = false
```

`targetSessionIndex` is the **next** session index (= number of logs so far).

### Held detection (`countHeldCycleExtensions`)

Only runs for `rule.type = 'weight'`. Walks logs from newest to oldest counting consecutive sessions where the performed weight equals `currentPlannedWeight` (within `PROGRESSION_CYCLE_WEIGHT_TOLERANCE`). Breaks on first non-matching weight, skipped entry, or unit mismatch.

Returns `{ heldExtensions, consecutiveTargetCount }`:
- If `consecutiveTargetCount ≤ windowSize`: `heldExtensions = 0` (normal progress within window)
- Else: `heldExtensions = max(1, ceil((consecutiveTargetCount - windowSize) / windowSize))`

### Held display (when `heldExtensions > 0`)

```
displayNumerator  = consecutiveTargetCount   ← total consecutive sessions at held weight
displayDenominator = windowSize × (heldExtensions + 1)
isHeldBeyondPlannedWindow = true
```

**Why `consecutiveTargetCount` and not modulo?**
When the anchor resets the cycle counter (e.g., `sessionsSinceAnchor` drops back to 0 after the user failed to progress), the modulo would show "1/N" even though the user has been at the same weight for many sessions. Using `consecutiveTargetCount` reflects reality: the user has been at this weight for N sessions total.

### Worked example (the reported bug)

Setup: `plannedWeight=35`, `amount=5`, `frequency=2 week` (window=4), 9 logs all at 35 lbs, anchor at `resetAtSessionIndex=8` (so `anchorSession=9`, `targetSessionIndex=9`).

```
sessionsSinceAnchor = 0
completedInWindow   = (0 % 4) + 1 = 1
OLD displayNumerator = 1   ← bug: shows "1/12 (held)"
consecutiveTargetCount = 9
heldExtensions = ceil((9-4)/4) = 2
displayDenominator = 4×3 = 12
NEW displayNumerator = 9   ← fix: shows "9/12 (held)"
```

---

## Baseline Anchor Creation (`buildBaselineAnchorsForRun`)

Called by the reducer after every `logSession`. Processes logs in chronological order.

For each exercise, for each log in order:
1. Check if `|actualWeight - plannedWeight| > PROGRESSION_WEIGHT_TOLERANCE` (using the values FROM THE LOG ENTRY, not the template-projected weight).
2. If yes, write an anchor: `{ weight: actualWeight, resetAtSessionIndex: currentCompletedCount (or successfulCount for 'successfulTrackSessions' basis) }`.
3. A later log can OVERWRITE the anchor if it also deviates.

An anchor is NOT created when:
- The exercise log is incomplete or skipped.
- There is a weight unit mismatch between template and log.
- `actualWeight` and `plannedWeight` are both present and within `PROGRESSION_WEIGHT_TOLERANCE`.

---

## Data Invariants

- `workoutLogs` are always filtered by `runId` before being passed to cycle/history calculations.
- `isSameExercise(template, log)` matches first by `exerciseId === exercise.id`, then by normalized name. Name normalization strips whitespace and non-alphanumeric characters (preserving Ukrainian Cyrillic).
- `getRecentExerciseHistory` returns entries sorted **newest first** (descending `completedAt`).
- The default limit for `getRecentExerciseHistory` in `buildPlannedSession` is **3** (for card performance). The modal passes **no limit** to show full history.
