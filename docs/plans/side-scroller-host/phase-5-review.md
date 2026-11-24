# P5 — Archaeologist Review

| Field | Value |
|---|---|
| Phase | P5 |
| Parent | [Implementation plan](README.md) |
| Depends on | [P1](phase-1-dungeon-level.md) (rooms), [P2](phase-2-note-loop.md) (cleared rooms) |
| Blocks | [P7](phase-7-village.md) (Library review desk), [P8](phase-8-journal.md) (due-room list) |
| Requirements | R-16, R-22 |
| Exit gate | [G5](#exit-gate-g5) |
| Status | Done — G5 passed 2026-11-24 |

## Objective

Add the engine's missing study phase to the host: review cleared rooms, rate recall
0–5, show what is due and when, and make an interrupted review resumable. This is the
first phase of the post-P4 plan and the prerequisite for a Library review desk in P7.

P4 left fishing as the only retrieval practice. P5 makes the note loop close: clear a
room, review it later, and see the schedule move.

## Non-goals

- New review rules, SM-2 changes, or reward policy.
- A calendar, notifications, or background reminders.
- Anki import/export.
- Editing the note from the review screen. Review shows the existing note and prompt.
- Engine changes of any kind. If a command is missing, follow
  [ENGINE-BOUNDARY.md](ENGINE-BOUNDARY.md) §4.

## Inputs and references

| What | Where |
|---|---|
| Command payloads | [`src/application/contracts/commands.ts`](../../../src/application/contracts/commands.ts) `review/pass-complete`, `review/session-save`, `review/session-discard`, `review/session-resume` |
| Facade dispatch | [`src/creatorEngine.ts`](../../../src/creatorEngine.ts) `dispatchReview` |
| Command layer | [`src/application/reviewCommands.ts`](../../../src/application/reviewCommands.ts) |
| Scheduling | [`src/core/review/spacedRepetition.ts`](../../../src/core/review/spacedRepetition.ts) `isReviewOverdue`, `daysUntilReview`, `daysSinceReviewDue`, `QUALITY_LABELS` |
| Due/room facts | [`src/core/review/reviewDomain.ts`](../../../src/core/review/reviewDomain.ts) `isReviewableRoom`, `generateSelfCheckPrompts` |
| Pass progress | [`src/core/review/reviewPasses.ts`](../../../src/core/review/reviewPasses.ts) `deriveReviewPassProgress` |
| Interrupted sessions | [`src/core/review/interruptedReviewSession.ts`](../../../src/core/review/interruptedReviewSession.ts) |
| Existing tests to mirror | [`tests/phase16/reviewCommands.test.ts`](../../../tests/phase16/reviewCommands.test.ts) |
| Boundary rules | [ENGINE-BOUNDARY.md](ENGINE-BOUNDARY.md) |

## Frozen interfaces

```ts
import type { EngineState, ReviewCommand } from '@/index';
import type { review } from '@/index';

export interface ReviewCandidateView {
  roomId: string;
  topic: string;
  /** ISO-8601, or null when the room has never been reviewed. */
  nextReviewIso: string | null;
  overdueDays: number;
  /** A neutral label: "Due today", "Due in 3 days", "Overdue by 2 days". */
  dueLabel: string;
}

export interface ReviewView {
  subjectId: string;
  subjectName: string;
  candidates: ReviewCandidateView[];
  reviewableCount: number;
  nextPassNumber: number;
  hasInterrupted: boolean;
  interruptedRoomId: string | null;
}

/** Pure; no DOM, no engine calls. */
export function projectReview(state: EngineState, nowIso: string): ReviewView | null;

export type ReviewDispatchOutcome =
  | { ok: true; value: unknown }
  | { ok: false; error: { code: string; message: string } };

export interface ReviewPanelCallbacks {
  onPassComplete(rating: review.QualityRating): Promise<void>;
  onSaveForLater(rating: review.QualityRating | null): Promise<void>;
  onDiscard(): Promise<void>;
  onClose(): void;
}

export function mountReviewPanel(
  root: HTMLElement,
  view: {
    room: { roomId: string; topic: string };
    prompt: string | null;
    passNumber: number;
    existingRating: review.QualityRating | null;
  },
  callbacks: ReviewPanelCallbacks,
): {
  setPending(value: boolean): void;
  showError(message: string): void;
  showResult(message: string): void;
  close(): void;
};
```

The panel owns no machine and no commands. `main.ts` dispatches; the panel shows what
came back.

## Work breakdown

### P5-T1 — Review the boundary and confirm the review surface

- [x] Re-read [ENGINE-BOUNDARY.md](ENGINE-BOUNDARY.md) and record any new type-only
      imports as candidates.
- [x] Explore task reports: `ReviewCommandErrorCode` values, whether
      `dispatchReview` requires `activeSubjectId`, and which outcomes carry the reward,
      pass progress, or interrupted-session marker.
- [x] Confirm `review/pass-complete` needs an active subject. Record the host rule:
      entering from a cleared room already has one; entering from the village calls
      `activateSubject(subjectId)` first and `returnToVillage()` after.
- [x] Confirm `review/session-resume` writes nothing and is safe on boot.

### P5-T2 — Pure review projection

- [x] `src/review/projection.ts` builds `ReviewView` from `EngineState` and `nowIso`.
- [x] Candidates are cleared rooms with a note (reuse the engine's reviewable rule, not a
      second definition).
- [x] `dueLabel` uses `daysUntilReview` / `daysSinceReviewDue`, never a home-made date
      comparison.
- [x] A subject with no cleared rooms returns an empty candidate list, not `null`; `null`
      means no active subject.
- [x] `hasInterrupted` reads the durable marker through the engine's own helper, not a
      guessed `extraFields` key.
- [x] No DOM and no engine calls; tests use fixtures.

### P5-T3 — Entry points

- [x] In the dungeon, a cleared room with a note shows a second prompt: `R review` while
      `E` still opens the composer.
- [x] `R` opens the review panel for the room under the player. If the room is not
      cleared, explain why and do not dispatch.
- [x] Add a global `R` shortcut from the surface: open the review queue for the
      last-studied subject, activating it if needed.
- [x] The HUD shows the count of due rooms for the active subject.
- [x] Do not open review while the note composer or a fishing dialog is open.

### P5-T4 — Review panel

- [x] Show the room topic, the existing note's self-check prompt (or a clear "no prompt"
      state), the pass number, and six rating buttons labelled by `QUALITY_LABELS`.
- [x] Keyboard: `0`–`5` set the rating, `Enter` submits, `S` saves for later, `D` discards
      (with confirmation), `Escape` closes without writing.
- [x] Focus moves into the panel and returns to `#game` on close.
- [x] Show pass progress and the next due date after a pass.
- [x] Learner prompt text is a text node; it is never logged or announced verbatim.

### P5-T5 — Commands and outcomes

- [x] Pass complete: `engine.dispatchReview({ type: 'review/pass-complete', payload: { roomId, qualityRating } })`.
- [x] Render `progression.awarded`, `duplicate`, `xpGained`, `rankChanged`, and
      `passProgress` from the outcome.
- [x] Save for later: `review/session-save` with the chosen rating or `null`; render
      `session.savedAt`-based copy and leave the review open or close it explicitly.
- [x] Discard: `review/session-discard`; render `discarded` and `keptForOtherRoom`.
- [x] Resume: `review/session-resume` on entering a room with a marker; restore the
      saved rating and pass number.
- [x] Distinguish `{ ok: false }` refusals (shown verbatim) from rejected promises
      ("Not saved" and the panel stays open).
- [x] Guard one in-flight review command at a time; disable rating controls while pending.

### P5-T6 — Reload and recovery

- [x] A saved review marker survives a reload and is offered again.
- [x] A reload during a pending pass-complete shows the boot recovery notice if the
      engine state is inconsistent; do not invent a second marker.
- [x] Reuse the P2 failing-storage harness for a rejected pass-complete: no XP, no
      pass-count change, panel error visible.
- [x] Do not auto-complete a review on reload.

### P5-T7 — Tests

- [x] Projection tests: never-reviewed, due today, overdue, future due, no cleared rooms,
      interrupted marker, no active subject.
- [x] Panel copy tests: rating labels, "already awarded" vs "awarded", save-for-later,
      discard, refusal text.
- [x] Integration with `MemoryEngineStorage`: clear a room, review it, assert one pass
      count and one reward; review the same (room, pass) again and assert idempotency.
- [x] Save/resume/discard round trip across a second engine instance.
- [x] Failing-storage pass-complete leaves state and progression unchanged.

### P5-T8 — Manual proof and visuals

- [x] Clear a room, press `R`, rate 5, confirm pass count/XP/next due.
- [x] Review the same room again in a later pass; confirm the duplicate is not paid twice.
- [x] Save for later, reload, resume, complete.
- [x] Keyboard-only run including `0`–`5`, `Enter`, `S`, `D`, `Escape`.
- [x] Capture frames for: due room prompt, review panel, rated result, saved/resumed,
      refusal, and save failure.

## Implementation notes (recorded during execution)

**Files added**

| File | Role |
|---|---|
| `src/review/projection.ts` | Pure queue, room, gate, and last-studied projections |
| `src/review/copy.ts` | Pure rating labels, award/duplicate, save, discard, refusal, and not-saved copy |
| `src/ui/reviewPanel.ts` | DOM panel; renders, never dispatches |
| `tests/reviewProjection.test.ts` | 10 projection/gate/queue tests from fixtures and real engine state |
| `tests/reviewCopy.test.ts` | 10 copy tests |
| `tests/reviewFlow.test.ts` | 7 integration and save-failure tests through `MemoryEngineStorage` |

**Files changed (example only)**

| File | Change |
|---|---|
| `src/main.ts` | `R` entry from a room and the street, resume read, three dispatches, pending guard, surface-session cleanup |
| `src/projection.ts` | `RoomView.reviewable`; `DungeonView.dueRooms`, `nextPassNumber`, `reviewUnlocked` |
| `src/render/hud.ts` | Reviews due, review pass, and review mode rows |
| `src/ui/prompts.ts` | A second `R review` line for a reviewable room |
| `index.html` | `#review-panel`, panel styles, P5 controls text |
| `scripts/capture-dungeon.mjs` | `--review` mode, review fields in the stored-state probe, retrying climb/descend helpers |

**Interface amendments (host extensions, not changes to the frozen shape)**

- `ReviewPanel` gains `markCompleted(): void`. After a recorded pass the panel disables
  the rating controls so the same open panel cannot submit twice; Escape still closes.
  The engine ledger remains the real idempotency guard.
- The panel view is named `ReviewPanelView`; its fields are exactly the frozen ones.
- `projectReview` / `projectReviewRoom` / `projectReviewGate` / `reviewDueCount` /
  `lastStudiedSubjectId` are additional pure exports. The frozen `ReviewView` fields are
  unchanged; the gate and per-room prompt are separate because the panel is per-room.

**Type-only imports recorded as candidate engine exports (K-14)**

| Type | Imported from | Why |
|---|---|---|
| `ReviewPassCompleteOutcome` | `@/application/reviewCommands` | Render award, duplicate, rank, pass progress |
| `ReviewSessionSaveOutcome` | `@/application/reviewCommands` | Render the saved marker and timestamp |
| `ReviewSessionDiscardOutcome` | `@/application/reviewCommands` | Render discarded / kept-for-other-room |
| `ReviewSessionResumeOutcome` | `@/application/reviewCommands` | Restore the saved rating and pass number |

`ReviewCommand`, `QualityRating`, `ReviewDueState`, and every helper used at runtime are
available on the public `review` namespace. No value import reaches around the barrel.

**Engine facts confirmed during execution**

- `dispatchReview` requires an active subject for all four commands; the street shortcut
  activates it first and always calls `returnToVillage()` when it did the activation
  (K-15). The capture and tests assert no session is left open.
- `review/session-resume` writes nothing; `creatorEngine.dispatchReview` skips `commit`
  for it, so the host can call it on entry and on boot (verified by a byte-identical
  snapshot assertion).
- The review unlock is `evaluateReviewUnlock` with the default ratio 1, so a cleared room
  is still locked until every room encounter is cleared. The host presents the engine's
  gate and does not open a panel that would refuse on submit; the `R` prompt still shows
  for a reviewable room and explains the lock.
- **Duplicate completion and saved markers.** `awardReviewPass` returns early on an
  already-awarded `(room, pass)` and therefore leaves an interrupted-review marker in
  place. `ReviewPassCompleteOutcome.resumedSessionDiscarded` is true even on that path.
  The panel says the marker was left in place rather than claiming it was cleared, and
  the learner clears it with `D` (discard). The host does not write the marker itself.
- `projectReviewRoom` filters on the engine's `isReviewableRoom` plus a non-empty note;
  topics, prompts, due labels, and pass numbers all come from engine helpers.

## Exit gate G5

- [x] A cleared room can be reviewed from the dungeon and the surface shortcut.
- [x] Ratings 0–5 reach the engine; the host never invents one.
- [x] One SM-2 update and at most one reward per (room, pass).
- [x] Save/resume/discard work across a reload; an interrupted review is not duplicated.
- [x] Refusal and rejection paths are visibly distinct.
- [x] Keyboard and reduced-motion passes recorded.
- [x] Root and example suites, typechecks, and builds green; engine count unchanged.
- [x] No engine source diff.
- [x] G5 entry written in [EVIDENCE.md](EVIDENCE.md), with visuals under `visuals/p5/`.

## Validation commands

```sh
npm --prefix examples/side-scroller test
npm --prefix examples/side-scroller run typecheck
npm --prefix examples/side-scroller run build
npm test
npm run typecheck
npx vitest list --config vitest.config.ts
git status --short src
```

## Sub-agent opportunities

| Task | Agent | Owns | Inputs | Output | Integration |
|---|---|---|---|---|---|
| Confirm review payloads, errors, active-subject requirement | `explore` | Nothing | `commands.ts`, `reviewCommands.ts`, `creatorEngine.ts` | Findings + line references | Run first |
| Implement pure review projection | `general` | `src/review/projection.ts`, `tests/reviewProjection.test.ts` | `EngineState` + `review` helpers | Module + tests | Before panel |
| Implement review DOM panel | `general` | `src/ui/reviewPanel.ts` | Frozen panel interface | Module + a11y notes | Parallel with projection |
| Integration and save/resume tests | `general` | `tests/reviewFlow.test.ts` | `MemoryEngineStorage`, failing storage | Tests + results | After panel |
| Loop, input, dispatch | Main agent | `src/main.ts`, `src/routing.ts` | All modules | Playable review | Final |

Guardrails: the panel does not import commands; `main.ts` is the only dispatcher; no
agent edits `src/`.

## Phase-specific risks

- **Active subject on the surface.** `dispatchReview` needs one. Entering review from the
  street activates the subject and returns to the village after; a refused activation
  must not leave a session open.
- **Type-only imports.** Review outcome types are not re-exported individually. Use the
  public `review` namespace where possible and record any type-only exception.
- **Rating copy.** Never label a rating as "correct" or "wrong"; 0–5 is self-assessment.
- **Duplicates.** A double click, a retried close, and a reload must all be idempotent
  through the engine ledger. The host adds a pending guard but does not replace it.
- **Marker keys.** Do not read `extraFields` by hand; use the interrupted-session helper.

## Rollback

Delete `src/review/`, `src/ui/reviewPanel.ts`, the `R` binding, the HUD due count, and the
route additions. The engine's review code is untouched; markers already written remain
valid engine state and are ignored by the earlier host.

## Execution evidence

| Date (UTC) | Task/Gate | Commit | Command or artifact | Result | Notes |
|---|---|---|---|---|---|
| 2026-11-24 | P5-T1 — boundary and review surface | uncommitted (base `6525c22`) | `src/creatorEngine.ts` `dispatchReview`, `src/application/reviewCommands.ts`, `src/core/review/*` | pass | Active-subject requirement, four refusal codes, and a writes-nothing `review/session-resume` confirmed; type-only outcome imports recorded above; no engine edits |
| 2026-11-24 | P5-T2 — pure projection | uncommitted | `npx --prefix examples/side-scroller vitest run --root examples/side-scroller tests/reviewProjection.test.ts` → 10 tests | pass | Never-reviewed, due today, future due, overdue, empty queue, empty-note exclusion, marker, prompt/pass, gate, last-studied subject |
| 2026-11-24 | P5-T3/T4 — entry points and panel | uncommitted | `--review` frames `01-locked`…`04-selected`; `src/ui/reviewPanel.ts` | pass | `E` and `R` prompt lines; locked refusal in toast and error region; six rating buttons with engine labels; `0`–`5`, `Enter`, `S`, `D`, `Escape`; focus trap and focus return |
| 2026-11-24 | P5-T5 — commands and outcomes | uncommitted | `tests/reviewFlow.test.ts` → 7 tests; `tests/reviewCopy.test.ts` → 10 tests; frames `05`, `06`, `08`, `09` | pass | Award vs duplicate ledgers, save/resume/discard round trip, verbatim refusal vs "Not saved", one in-flight guard |
| 2026-11-24 | P5-T6 — reload and recovery | uncommitted | Frames `07`, `09`, `10`, `11`; rejecting-storage tests | pass | Marker survives reload and is offered again; duplicate completion pays nothing and discloses the retained marker; rejected pass/save leave state and progression unchanged; nothing auto-completes |
| 2026-11-24 | P5-T7 — example suite | uncommitted | `npm --prefix examples/side-scroller test` → 22 files / 135 tests; typecheck and build clean | pass | +27 tests over the 19 / 108 P4 baseline; root suite untouched at 13 / 280 |
| 2026-11-24 | P5-T8 — manual proof and visuals | uncommitted (base `6525c22`) | `node examples/side-scroller/scripts/capture-dungeon.mjs --out docs/plans/side-scroller-host/visuals/p5 --prefix 2026-11-24-g5 --review`; repeat with `--prefix 2026-11-24-g5rm --reduced-motion` | pass | 13 frames per run and two manifests; clear → lock → clear all → rate 5 → save 4 → reload/resume → discard → save/resume/duplicate → rejected save → reload → street `R` shortcut → close (no session left open); reduced-motion run reports `matchMedia` true |
| 2026-11-24 | G5 — exit gate | uncommitted (base `6525c22`) | `npm test`, `npm run typecheck`, `npm run build`; example `test`, `typecheck`, `build`; `npx vitest list --config vitest.config.ts`; `git status --short src` | pass | Engine 13 / 280 unchanged; example 22 / 135; isolation probe 0 `examples/` paths; `src` has no diff; A-11 and E-13 verified |
| 2026-11-24 | G5 — performance | uncommitted | 10 s rAF window with the review panel open (`--review` manifest `result.frameStats`) | pass with exception | Normal run: 558 frames, avg 17.93 ms, p95 33.24 ms, max 50.56 ms. Reduced-motion run: 601 frames, avg 16.64 ms, p95 17.18 ms, max 33.38 ms. Both are the recorded P2-O1 headless software-compositing floor (P2 measured 22.25 ms average against an 18.49 ms blank-page control), not a review-panel cost |
| 2026-11-24 | G5 — reduced motion and keyboard | uncommitted | `--reduced-motion` run `2026-11-24-g5rm-*` | pass | `matchMedia('(prefers-reduced-motion: reduce)')` true; all panel actions driven by real WebDriver keys; focus ids recorded in every frame detail |
