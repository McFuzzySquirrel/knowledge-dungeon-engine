# P5 — Archaeologist Review

| Field | Value |
|---|---|
| Phase | P5 |
| Parent | [Implementation plan](README.md) |
| Depends on | [P1](phase-1-dungeon-level.md) (rooms), [P2](phase-2-note-loop.md) (cleared rooms) |
| Blocks | [P7](phase-7-village.md) (Library review desk), [P8](phase-8-journal.md) (due-room list) |
| Requirements | R-16, R-22 |
| Exit gate | [G5](#exit-gate-g5) |
| Status | Not started |

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

- [ ] Re-read [ENGINE-BOUNDARY.md](ENGINE-BOUNDARY.md) and record any new type-only
      imports as candidates.
- [ ] Explore task reports: `ReviewCommandErrorCode` values, whether
      `dispatchReview` requires `activeSubjectId`, and which outcomes carry the reward,
      pass progress, or interrupted-session marker.
- [ ] Confirm `review/pass-complete` needs an active subject. Record the host rule:
      entering from a cleared room already has one; entering from the village calls
      `activateSubject(subjectId)` first and `returnToVillage()` after.
- [ ] Confirm `review/session-resume` writes nothing and is safe on boot.

### P5-T2 — Pure review projection

- [ ] `src/review/projection.ts` builds `ReviewView` from `EngineState` and `nowIso`.
- [ ] Candidates are cleared rooms with a note (reuse the engine's reviewable rule, not a
      second definition).
- [ ] `dueLabel` uses `daysUntilReview` / `daysSinceReviewDue`, never a home-made date
      comparison.
- [ ] A subject with no cleared rooms returns an empty candidate list, not `null`; `null`
      means no active subject.
- [ ] `hasInterrupted` reads the durable marker through the engine's own helper, not a
      guessed `extraFields` key.
- [ ] No DOM and no engine calls; tests use fixtures.

### P5-T3 — Entry points

- [ ] In the dungeon, a cleared room with a note shows a second prompt: `R review` while
      `E` still opens the composer.
- [ ] `R` opens the review panel for the room under the player. If the room is not
      cleared, explain why and do not dispatch.
- [ ] Add a global `R` shortcut from the surface: open the review queue for the
      last-studied subject, activating it if needed.
- [ ] The HUD shows the count of due rooms for the active subject.
- [ ] Do not open review while the note composer or a fishing dialog is open.

### P5-T4 — Review panel

- [ ] Show the room topic, the existing note's self-check prompt (or a clear "no prompt"
      state), the pass number, and six rating buttons labelled by `QUALITY_LABELS`.
- [ ] Keyboard: `0`–`5` set the rating, `Enter` submits, `S` saves for later, `D` discards
      (with confirmation), `Escape` closes without writing.
- [ ] Focus moves into the panel and returns to `#game` on close.
- [ ] Show pass progress and the next due date after a pass.
- [ ] Learner prompt text is a text node; it is never logged or announced verbatim.

### P5-T5 — Commands and outcomes

- [ ] Pass complete: `engine.dispatchReview({ type: 'review/pass-complete', payload: { roomId, qualityRating } })`.
- [ ] Render `progression.awarded`, `duplicate`, `xpGained`, `rankChanged`, and
      `passProgress` from the outcome.
- [ ] Save for later: `review/session-save` with the chosen rating or `null`; render
      `session.savedAt`-based copy and leave the review open or close it explicitly.
- [ ] Discard: `review/session-discard`; render `discarded` and `keptForOtherRoom`.
- [ ] Resume: `review/session-resume` on entering a room with a marker; restore the
      saved rating and pass number.
- [ ] Distinguish `{ ok: false }` refusals (shown verbatim) from rejected promises
      ("Not saved" and the panel stays open).
- [ ] Guard one in-flight review command at a time; disable rating controls while pending.

### P5-T6 — Reload and recovery

- [ ] A saved review marker survives a reload and is offered again.
- [ ] A reload during a pending pass-complete shows the boot recovery notice if the
      engine state is inconsistent; do not invent a second marker.
- [ ] Reuse the P2 failing-storage harness for a rejected pass-complete: no XP, no
      pass-count change, panel error visible.
- [ ] Do not auto-complete a review on reload.

### P5-T7 — Tests

- [ ] Projection tests: never-reviewed, due today, overdue, future due, no cleared rooms,
      interrupted marker, no active subject.
- [ ] Panel copy tests: rating labels, "already awarded" vs "awarded", save-for-later,
      discard, refusal text.
- [ ] Integration with `MemoryEngineStorage`: clear a room, review it, assert one pass
      count and one reward; review the same (room, pass) again and assert idempotency.
- [ ] Save/resume/discard round trip across a second engine instance.
- [ ] Failing-storage pass-complete leaves state and progression unchanged.

### P5-T8 — Manual proof and visuals

- [ ] Clear a room, press `R`, rate 5, confirm pass count/XP/next due.
- [ ] Review the same room again in a later pass; confirm the duplicate is not paid twice.
- [ ] Save for later, reload, resume, complete.
- [ ] Keyboard-only run including `0`–`5`, `Enter`, `S`, `D`, `Escape`.
- [ ] Capture frames for: due room prompt, review panel, rated result, saved/resumed,
      refusal, and save failure.

## Exit gate G5

- [ ] A cleared room can be reviewed from the dungeon and the surface shortcut.
- [ ] Ratings 0–5 reach the engine; the host never invents one.
- [ ] One SM-2 update and at most one reward per (room, pass).
- [ ] Save/resume/discard work across a reload; an interrupted review is not duplicated.
- [ ] Refusal and rejection paths are visibly distinct.
- [ ] Keyboard and reduced-motion passes recorded.
- [ ] Root and example suites, typechecks, and builds green; engine count unchanged.
- [ ] No engine source diff.
- [ ] G5 entry written in [EVIDENCE.md](EVIDENCE.md), with visuals under `visuals/p5/`.

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
| | | | | | |
