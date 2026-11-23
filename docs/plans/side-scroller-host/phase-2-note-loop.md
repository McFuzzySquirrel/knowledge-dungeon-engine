# P2 — Note Loop and Progression HUD

| Field | Value |
|---|---|
| Phase | P2 |
| Parent | [Implementation plan](README.md) |
| Depends on | [P1](phase-1-dungeon-level.md) (G1) |
| Blocks | [P3](phase-3-surface-village.md), [P4](phase-4-fishing.md) |
| Requirements | R-05, R-06, R-07, R-08, R-13, R-14 |
| Exit gate | [G2](#exit-gate-g2) |
| Status | Done — G2 passed |

## Objective

Close the core loop: approach a room, open a DOM note composer, submit through the
engine, render validation and progression outcomes, and persist across reload. Also
introduce the save-failure path that every later phase reuses.

## Non-goals

- Graph editing or creating rooms (the Creator UI).
- Review scheduling or the Archaeologist flow.
- Fishing.
- Rich markdown rendering; artifacts render as plain text.

## Inputs and references

| What | Where |
|---|---|
| Note command payload | [`src/application/contracts/commands.ts`](../../../src/application/contracts/commands.ts) `encounter/note-submit` |
| Outcome types | [`src/application/encounterCommands.ts`](../../../src/application/encounterCommands.ts) `EncounterNoteDraftOutcome`, `EncounterNoteClearOutcome` |
| Facade method | [`src/creatorEngine.ts`](../../../src/creatorEngine.ts) `submitNote`, `collectArtifact` |
| Validation rules | [ADR-0006](../../adr/0006-note-validation-gates-and-rubric.md); [`src/core/validation/notes`](../../../src/core/validation/notes) |
| Result vs rejection | [ADR-0004](../../adr/0004-result-vs-rejection-contract.md) |
| Failure UX | [host guide §Input](../../host-ui-guide.md#input-and-command-dispatch), [§Persistence](../../host-ui-guide.md#persistence-and-failure-ux) |
| Content safety | [host guide §Attachments](../../host-ui-guide.md#attachments-and-content-safety) |
| Accessibility | [host guide §Accessibility](../../host-ui-guide.md#accessibility-and-mobile) |

## Frozen interfaces

```ts
// src/projection.ts
export interface HudView {
  subjectName: string | null;
  world: 'village' | 'dungeon' | 'fishing';
  phase: 'creator' | 'scribe' | 'archaeologist';
  xpTotal: number;
  rank: string;
  rooms: Array<{ roomId: string; topic: string; status: string; cleared: boolean }>;
}
export function projectHud(state: EngineState, subjectId: string | null): HudView;
```

```ts
// src/ui/notePanel.ts
export interface NotePanelCallbacks {
  onSubmit(input: { roomId: string; noteText: string; manualConfirmed: boolean }): Promise<void>;
  onCollectArtifact(roomId: string): Promise<void>;
  onClose(): void;
}
export function mountNotePanel(root: HTMLElement, room: { roomId: string; topic: string }, callbacks: NotePanelCallbacks): { setPending(value: boolean): void; showDraft(validation: NoteValidationOutput): void; showCleared(outcome: EncounterNoteClearOutcome): void; showError(message: string): void; close(): void };
```

Verify the progression source in the explore task: use the engine's progression record
for the active subject rather than the dungeon summary if the two can diverge. Do not
guess.

`src/index.ts` exports the controllers and command unions, but not every result type
(for example `EncounterNoteClearOutcome`). The example may import such types as
**type-only** from the aliased engine source (`@/application/encounterCommands`). Record
this in evidence as a candidate future engine export; do not change `src/index.ts` in
this plan.

**Implementation extensions to the frozen interface.** `NotePanel` gained one method,
`showStatus(message: string)`, so a successful artifact pickup can report inside the
panel instead of only through the HUD. The panel also traps `Tab`/`Shift+Tab` while it
is open, because `aria-modal="true"` promises that focus does not leak into the page
behind the dialog. Both are additive; the four frozen methods keep their signatures.

## Work breakdown

### P2-T1 — Proximity and interaction

- [x] Show a prompt when the player is inside a room and not in a modal: room topic plus
      "E — write note".
- [x] `E` opens the composer for the current room. `Escape` closes it only when no submit
      is pending; closing never discards engine state (nothing was committed).
- [x] Replace the P1 debug panel with the HUD and a small session panel showing visit
      count and current room.

### P2-T2 — Composer

- [x] Use a real `<textarea>` with an associated `<label>`, not canvas text.
- [x] Prefill a section template containing `Summary`, `Key Points`, and
      `Recall Question` so the first attempt is not a guessing game (K-08).
- [x] A separate checkbox or button for the learner's manual confirmation. Do not
      auto-confirm. Pass it as `manualConfirmed`.
- [x] Disable submit while pending; ignore duplicate submit attempts.
- [x] Keep the room id and text when a refusal returns; the learner corrects in place.
- [x] Mobile: the submit control remains reachable with the virtual keyboard open.

### P2-T3 — Command outcomes

- [x] Call `engine.submitNote({ roomId, noteText, manualConfirmed })`.
- [x] `{ ok: true, value.kind: 'draft' }`: render the validation result, keep the room
      uncleared, show the specific failed checks.
- [x] `{ ok: true, value.kind: 'cleared' }`: show XP earned, rank change if present, and
      the room's cleared status. Store `artifactMarkdown` for display.
- [x] `{ ok: false }`: render `error.code` and `error.message` verbatim enough to be
      actionable; do not replace with a generic toast.
- [x] Rejected promise: show "Not saved" plus a retry, and do not update the UI as if the
      action committed.
- [x] On cleared, offer "Take artifact" which calls `engine.collectArtifact(roomId)`;
      handle refusal and rejection the same way.
- [x] Log codes and counts only, never note text or topics.

### P2-T4 — Artifact display

- [x] Render `artifactMarkdown` as text inside a `<pre>` or equivalent; never use
      `innerHTML`.
- [x] Treat attachment names and URLs as display text only; make no network requests.
- [x] Note the future option of a sanitizing markdown renderer without adding it now.

### P2-T5 — HUD and projection

- [x] `projectHud` is pure: input `EngineState` fixture, output `HudView`; test draft,
      cleared, and missing-subject cases.
- [x] Show subject name, world/phase, XP, rank, and per-room status.
- [x] Do not encode cleared/created by colour alone; include a label or icon shape.

### P2-T6 — Save-failure harness

- [x] Add a test-only storage wrapper that delegates to the IndexedDB adapter but can be
      told to reject the next `save`.
- [x] Test: a rejected save leaves `engine.snapshot()` at the prior state and the UI shows
      "Not saved".
- [x] Reuse this harness in P3 and P4; do not duplicate it.

### P2-T7 — Accessibility pass

- [x] Move focus into the composer on open and return it to the canvas/interaction
      surface on close.
- [x] Announce refusals, cleared rooms, and save failures through an `aria-live` region.
- [x] Provide a keyboard path for artifact collection and closing panels.
- [x] Honor reduced motion for any panel transitions.
- [x] Record the keyboard-only walkthrough result.

### P2-T8 — Manual proof

- [x] Submit an incomplete note and confirm the exact missing section is shown.
- [x] Submit a complete note with confirmation and confirm clear + XP + artifact.
- [x] Reload and confirm the room and XP survive.
- [x] Temporarily enable the failing storage wrapper and confirm "Not saved".

**Implementation notes.**

- `main.ts` owns the modal lifecycle: `E` opens the composer for the current room,
  `Escape` closes it only when nothing is pending, physics pauses while it is open, and
  the prompt is suppressed. `notePanel.ts` never imports the engine; it receives
  `onSubmit` / `onCollectArtifact` / `onClose` callbacks.
- The composer prefills `Summary`, `Key Points`, and `Recall Question` on separate
  lines, which is exactly what `findPresentSections` matches. Word count is reported as
  optional (the 120-word badge) and is not a blocking gate, matching
  `evaluateNoteValidation`.
- The outcome copy lives in the pure `src/ui/outcomes.ts` (`draftSummary`,
  `clearSummary`, `refusalMessage`, `notSavedMessage`, `notCollectedMessage`), so draft,
  clear, refusal, and save-failure text can be asserted without a renderer.
- `projectHud` reads `state.progression[subjectId]` for XP and rank and the room
  metadata's `validationState.finalPass` for cleared state; `projectDungeon` is built on
  top of it, so the HUD, renderer badges, and tests cannot disagree.
- The save-failure harness (`tests/support/failingStorage.ts`) wraps the real IndexedDB
  adapter and fails exactly one `save`. P3 and P4 import it rather than copying it.
- Artifact markdown is assigned with `textContent` into a `<pre>`; a repository grep for
  `innerHTML` under `examples/side-scroller` returns nothing.
- Type-only imports from the aliased engine source: `EncounterNoteClearOutcome`
  (`@/application/encounterCommands`) and `NoteValidationOutput`
  (`@/core/validation/notes`). Both are candidates for future `src/index.ts` exports,
  which this phase does not add (K-14).

**Keyboard-only clear (WebDriver, headless Firefox 150, 2026-11-23).** Real key events:
`E` opens, focus lands in `#note-text`; the template is replaced by typing, then
`Tab` → `#note-confirmed`, `Space` ticks it, `Tab` → `#note-submit`, `Enter` submits.
Result: `#note-outcome` shown, XP 28, room label `Cleared`, focus advanced to
`#note-collect`, live region said “Room cleared. 28 XP gained.” A separate focus probe
confirms the trap cycles `note-text → note-confirmed → note-submit → note-close →
note-text`, and `Escape` closes the panel and returns focus to `#game`.

**Frame time (headless Firefox, DPR 1, 1366×682).** App idle: 179 frames, avg 22.25 ms,
p95 33.94 ms, max 50.48 ms. Control on `about:blank` in the same browser: avg 18.49 ms,
max 66.62 ms. Headless software compositing cannot reach 16.7 ms per frame, so the
plan's "no frame over 16.7 ms" target is not observable here; the app adds ≈3.8 ms over
the browser floor. Under the deliberate 55 ms/80 ms main-thread hog (K-03): avg 41 ms,
max 67 ms, no tunneling. Recorded as an accepted environment exception (P2-O1).

## Exit gate G2

- [x] A room can be cleared end-to-end from the keyboard.
- [x] Draft, refusal, clear, and save-failure states are each demonstrated.
- [x] Reload preserves the cleared room, XP, and artifact availability.
- [x] Projection and save-failure tests pass.
- [x] Artifact text is rendered without `innerHTML`.
- [x] Root and example suites, typechecks, and builds are green; engine count unchanged.
- [x] No engine source diff.
- [x] G2 entry written in [EVIDENCE.md](EVIDENCE.md).

## Validation commands

```sh
npm --prefix examples/side-scroller test
npm --prefix examples/side-scroller run typecheck
npm --prefix examples/side-scroller run build
npm test
npm run typecheck
grep -rn "snapshot(" examples/side-scroller/src --include='*.ts' --exclude='projection.ts'
git status --short src
```

## Sub-agent opportunities

| Task | Agent | Owns | Inputs | Output | Integration |
|---|---|---|---|---|---|
| Confirm outcome types, progression source, and validation failure shape | `explore` | Nothing | `encounterCommands.ts`, `commands.ts`, `creatorEngine.ts`, projection needs | Findings + line references | Run before P2-T3 |
| Build composer DOM, focus management, and live-region announcements | `general` | `src/ui/notePanel.ts`, `src/ui/prompts.ts` | Frozen panel interface | Modules + a11y checklist | Main agent wires callbacks |
| Implement `projection.ts` and its tests | `general` | `src/projection.ts`, `tests/projection.test.ts` | `EngineState` fixture from tutorial | Module + tests | Parallel with composer |
| Security review of artifact/attachment display and logging | `explore` | Nothing | P2 code, host guide §Content safety | Findings list | Before G2 |

Guardrails: the composer agent does not call the engine directly; it receives callbacks.
The projection agent does not render. Main agent owns `main.ts` and command dispatch.

## Phase-specific risks

- K-08: validation feels arbitrary. Exact failure text plus template mitigates.
- K-09: markdown injection. Plain-text rendering is mandatory at this gate.
- K-07: visit/session errors surface as rejections. Show the message and link to the
  session state.
- K-05/K-06: storage failures. Reuse the P0 adapter and the P2 harness.
- K-14: outcome types not re-exported by `src/index.ts`. Type-only imports from the
  aliased source are permitted and recorded; no engine export change.

## Rollback

Revert the P2 UI and projection files; the P1 movement layer remains playable. No engine
or storage migration.

## Plan amendments during execution

| Date | Change | Reason |
|---|---|---|
| 2026-11-23 | `NotePanel` gained `showStatus(message)` and a Tab focus trap | `aria-modal` needs contained focus; artifact pickup needs in-panel confirmation |
| 2026-11-23 | Outcome copy extracted to `src/ui/outcomes.ts` | E-05 asks for draft/clear/refusal text assertions without a renderer |
| 2026-11-23 | Save-failure harness lives in `tests/support/failingStorage.ts` | P3/P4 reuse one harness instead of duplicating it |
| 2026-11-23 | Capture script gained `--note-loop` (frames 07–12) | D-09 requires the G2 visual record, and the P1 script only walked the dungeon |

## Execution evidence

| Date (UTC) | Task/Gate | Commit | Command or artifact | Result | Notes |
|---|---|---|---|---|---|
| 2026-11-23 | P2-T1/T2 — prompt, composer, focus | uncommitted (base `f0eda0e`) | [`07-composer.png`](visuals/p2/2026-11-23-g2-07-composer.png) | pass | In-room prompt hidden while the modal is open; template prefilled; focus in `#note-text`; `Escape` closes and returns focus to `#game` |
| 2026-11-23 | P2-T3/T4 — outcomes, artifact | uncommitted | frames [`08-draft`](visuals/p2/2026-11-23-g2-08-draft.png), [`09-cleared`](visuals/p2/2026-11-23-g2-09-cleared.png), [`12-not-saved`](visuals/p2/2026-11-23-g2-12-not-saved.png); `tests/noteLoop.test.ts` | pass | Draft names `Key Points, Recall Question`; clear = 28 XP; artifact rendered in a `<pre>`; refusal and rejection have distinct copy; `innerHTML` grep empty |
| 2026-11-23 | P2-T5 — projection | uncommitted | `npm --prefix examples/side-scroller test` | pass | `projectHud` covers missing subject, draft, cleared, and unknown subject; `projectDungeon` is built on it |
| 2026-11-23 | P2-T6 — save-failure harness | uncommitted | `tests/saveFailure.test.ts`; frame `12-not-saved` | pass | Rejected save rejects `submitNote`, in-memory snapshot and durable record stay at the prior state, retry commits; panel and HUD both show "Not saved" |
| 2026-11-23 | P2-T7 — accessibility | uncommitted | WebDriver focus probe; frames `06/07/10` | pass | Tab order `note-text → note-confirmed → note-submit → note-close → note-text` (trapped); `Escape` returns focus to `#game`; roles `status`/`status`/`alert`; `aria-modal=true`; reduced motion honoured |
| 2026-11-23 | P2-T8 — manual proof | uncommitted | Keyboard-only clear probe; frames [`11-reload`](visuals/p2/2026-11-23-g2-11-reload.png), `12-not-saved` | pass | Real key events cleared the room; reload kept cleared=1, XP=28, artifact=1; failed save left XP 28/cleared 1 unchanged |
| 2026-11-23 | Frame-time probe | uncommitted | 179 rAF samples, headless Firefox DPR 1 | pass with exception | App avg 22.25 ms / p95 33.94 ms vs `about:blank` floor 18.49 ms; 16.7 ms unobservable in software rendering (P2-O1) |
| 2026-11-23 | G2 | uncommitted (base `f0eda0e`) | example 9 files / 49 tests; root 13 / 280; both typechecks and builds; isolation 0 `examples/` paths | pass | No `src/` diff; `snapshot()` only at boot; all exit-gate items verified |
