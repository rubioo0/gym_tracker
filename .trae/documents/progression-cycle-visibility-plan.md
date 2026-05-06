# Progression Cycle Visibility Plan

## Summary
- Goal: make progression values trustworthy and understandable in both Session Plan and Calendar by exposing (1) value source, (2) recent actual history, and (3) cycle position like `2/2` and extended holds like `2/4`.
- UX target: fast gym usage, low cognitive load, minimal extra taps.
- Chosen behavior:
  - Show feature in **Session exercise card + exercise details modal**.
  - Show **last 3 relevant logs** for that exercise (current run only).
  - Cycle behavior uses **extended denominator** when weight is held beyond planned increase point.
  - Cycle counting follows progression rule basis (`trackSessions` vs `successfulTrackSessions`).
  - Add a **global persisted toggle**, default **off**.

## Current State Analysis
- Source of plan value:
  - `App.tsx` builds `plannedSession` via `buildPlannedSession(...)`.
  - `buildPlannedSession` computes each exercise using `projectPlannedExerciseForSessionIndex(...)` at run occurrence index.
- Source of calendar value:
  - `App.tsx` builds `programCalendar` via `buildProgramCalendar(...)`.
  - `buildProgramCalendar` computes each exercise with the same projection function per session index.
- Progression core:
  - `getPlannedExercise` and `projectPlannedExerciseForSessionIndex` in `src/domain/logic.ts`.
  - Progression counters come from `getExerciseProgressionCounters`.
  - Baseline deviation anchors come from `run.baselineAnchors`.
- Existing UI:
  - Session cards: `src/components/session/SessionExerciseCardList.tsx`.
  - Exercise details modal: `src/components/session/SessionExerciseDetailsModal.tsx`.
  - Calendar rows: `src/components/calendar/ProgramCalendarView.tsx`.
- Current data contracts:
  - `PlannedExercise` and `CalendarSessionExercise` in `src/domain/types.ts` do not carry cycle diagnostics/history metadata yet.

## Proposed Changes

### 1) Add explicit progression diagnostics model
- File: `src/domain/types.ts`
- What:
  - Add a reusable type (e.g. `ProgressionCycleStatus`) with fields:
    - `basis: 'trackSessions' | 'successfulTrackSessions'`
    - `effectiveFrequencySessions: number`
    - `sessionsSinceAnchor: number`
    - `completedInCurrentValueWindow: number`
    - `plannedWindowSize: number`
    - `displayNumerator: number`
    - `displayDenominator: number`
    - `isHeldBeyondPlannedWindow: boolean`
    - `anchorWeight?: number`
    - `currentPlannedWeight?: number`
  - Add `progressionCycleStatus?: ProgressionCycleStatus` to:
    - `PlannedExercise`
    - `CalendarSessionExercise` (for consistency and future debug visibility/export).
  - Add compact history item type and field:
    - `recentExerciseHistory?: Array<{ completedAt: string; actualWeight?: number; plannedWeight?: number; weightUnit?: string; successful: boolean; skipped: boolean }>`
    - Keep max 3 entries in `PlannedExercise`.
- Why:
  - Creates one source of truth for cycle math and display.
- How:
  - Extend interfaces only; no behavior change yet.

### 2) Compute cycle status in domain logic (single algorithm)
- File: `src/domain/logic.ts`
- What:
  - Add helper that computes cycle diagnostics for an exercise at a target session index:
    - Inputs: exercise rule, counters, anchor options, target session index.
    - Outputs: `ProgressionCycleStatus`.
  - Integrate helper into:
    - `projectPlannedExerciseForSessionIndex` (set `planned.progressionCycleStatus`).
    - `buildPlannedSession` (preserve status on planned exercise).
    - `buildProgramCalendar` (populate per-session exercise status for parity/future use).
- Why:
  - Eliminates duplicate interpretation and keeps plan/calendar aligned.
- How (exact cycle semantics):
  - Determine progression count by basis:
    - `successfulTrackSessions` uses successful counter.
    - otherwise completed counter.
  - Determine anchor session same way existing projection does.
  - Compute:
    - `sessionsSinceAnchor = max(0, targetProgressCount - anchorSession)`.
    - `plannedWindowSize = effectiveFrequencySessions`.
    - `completedInCurrentValueWindow = (sessionsSinceAnchor % plannedWindowSize) + 1`.
  - Extended denominator logic:
    - Determine expected increase checkpoints at multiples of `plannedWindowSize`.
    - If actual/planned stayed same through one or more checkpoints, increase denominator by `plannedWindowSize` per extra hold cycle.
    - Display:
      - normal cycle: `2/2`
      - held one full extra window: `2/4`
      - held two extra windows: `2/6`
  - Keep backward compatibility:
    - If no rule or invalid frequency, omit `progressionCycleStatus`.

### 3) Build recent exercise history (last 3 relevant logs)
- File: `src/domain/logic.ts`
- What:
  - Add helper to collect last 3 matching logs for an exercise in the selected run:
    - reuse `isSameExercise(...)` matching.
    - sort by `completedAt` descending.
    - include skipped/successful flags and actual/planned weights.
  - Attach result to `plannedExercise.recentExerciseHistory`.
- Why:
  - Gives fast confidence check without introducing dense table UI.
- How:
  - Populate only for Session Plan data (`buildPlannedSession`), not mandatory on calendar rows.

### 4) Add global persisted toggle for temporary feature
- Files:
  - `src/domain/types.ts` (state shape)
  - `src/domain/reducer.ts` (action + reducer handling)
  - `src/data/storage.ts` + tests (hydrate defaults/backward compatibility)
  - `src/App.tsx` (control wiring)
- What:
  - Add state flag, e.g. `showProgressionInsights: boolean`, default `false`.
  - Add reducer action `setShowProgressionInsights`.
  - Add UI toggle in Session Plan header area.
  - Persist via existing storage serialization.
- Why:
  - Temporary feature should be user-controllable, default off for existing users.
- How:
  - Ensure legacy saved state without this field hydrates to `false`.

### 5) Surface concise insights in Session Plan card + modal
- Files:
  - `src/components/session/SessionExerciseCardList.tsx`
  - `src/components/session/SessionExerciseDetailsModal.tsx`
  - `src/components/session/sessionPlanUtils.ts` (formatters)
  - `src/App.css` (styles)
- What:
  - Card (when toggle enabled):
    - show compact line: `Cycle: 2/2` or `Cycle: 2/4 (held)`.
    - show compact source hint: `Source: latest actual` or `Source: anchored progression`.
    - show short history chips/list for up to 3 entries (weight + date, skipped marker).
  - Modal (when toggle enabled):
    - richer section:
      - `Current value window: 2/4`
      - basis, frequency, sessions since anchor
      - last 3 entries with actual vs planned
    - keep existing max explanation and next target hint.
- Why:
  - Meets “easy recheck” requirement without overcomplicated table.
- How:
  - Keep card compact; detailed content in modal.
  - Reuse existing formatting conventions (`lbs/kg`, per-side/bodyweight labels).

### 6) Keep calendar trustworthy without heavy new UI
- Files:
  - `src/components/calendar/ProgramCalendarView.tsx`
  - `src/components/calendar/ProgramCalendarView.css` (optional small label only)
- What:
  - No large table in calendar rows.
  - Optionally add tiny badge in expanded exercise row: `C 2/2` from `progressionCycleStatus` (only if toggle on globally and only where status exists).
- Why:
  - Avoid UI overload while keeping parity and confidence.
- How:
  - If badge is visually noisy, keep cycle UI only in Session Plan+modal per selected scope.

### 7) Tests and acceptance coverage
- Files:
  - `src/domain/logic.test.ts`
  - `src/domain/reducer.test.ts`
  - `src/data/storage.test.ts`
  - (if formatter helpers added) `src/components/session/sessionPlanUtils.test.ts`
- What to test:
  - Cycle numerator/denominator normal path (`2/2`).
  - Extended denominator hold path (`2/4`, `2/6`).
  - Basis behavior differs for successful-only rules.
  - Anchor reset scenarios still correct.
  - Last 3 history entries sorted/filtered by run.
  - Toggle defaults to false for old state and persists when enabled.
- Why:
  - This feature is logic-heavy and user trust-sensitive.

## Assumptions & Decisions
- Decision locked: scope is Session Plan card + modal primarily; calendar remains lightweight.
- Decision locked: feature is temporary and globally toggled.
- Decision locked: cycle extends denominator when value is held past planned increase checkpoints.
- Assumption: cycle counts are most trustworthy when driven by same basis as progression rule.
- Assumption: “relevant logs” means same run and same matched exercise identity/name normalization.

## Verification Steps
- Manual:
  - Start with toggle OFF: no extra cycle/history UI visible.
  - Toggle ON: card shows cycle + short history; modal shows detailed diagnostics.
  - Log sessions with:
    - normal progression (expect `1/2` -> `2/2` then increase),
    - held value beyond checkpoint (expect `2/4`),
    - successful=false with successful-based rule (counter should not advance).
  - Confirm plan and calendar planned value remain aligned.
- Automated:
  - Run targeted tests for `logic`, `reducer`, `storage`, and session utils.
  - Ensure no new diagnostics for edited files.

