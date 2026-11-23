# P2 — Note Loop and Progression HUD

| Field | Value |
|---|---|
| Phase | P2 |
| Parent | [Implementation plan](README.md) |
| Depends on | [P1](phase-1-dungeon-level.md) (G1) |
| Blocks | [P3](phase-3-surface-village.md), [P4](phase-4-fishing.md) |
| Requirements | R-05, R-06, R-07, R-08, R-13, R-14 |
| Exit gate | [G2](#exit-gate-g2) |
| Status | Not started |

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

## Work breakdown

### P2-T1 — Proximity and interaction

- [ ] Show a prompt when the player is inside a room and not in a modal: room topic plus
      "E — write note".
- [ ] `E` opens the composer for the current room. `Escape` closes it only when no submit
      is pending; closing never discards engine state (nothing was committed).
- [ ] Replace the P1 debug panel with the HUD and a small session panel showing visit
      count and current room.

### P2-T2 — Composer

- [ ] Use a real `<textarea>` with an associated `<label>`, not canvas text.
- [ ] Prefill a section template containing `Summary`, `Key Points`, and
      `Recall Question` so the first attempt is not a guessing game (K-08).
- [ ] A separate checkbox or button for the learner's manual confirmation. Do not
      auto-confirm. Pass it as `manualConfirmed`.
- [ ] Disable submit while pending; ignore duplicate submit attempts.
- [ ] Keep the room id and text when a refusal returns; the learner corrects in place.
- [ ] Mobile: the submit control remains reachable with the virtual keyboard open.

### P2-T3 — Command outcomes

- [ ] Call `engine.submitNote({ roomId, noteText, manualConfirmed })`.
- [ ] `{ ok: true, value.kind: 'draft' }`: render the validation result, keep the room
      uncleared, show the specific failed checks.
- [ ] `{ ok: true, value.kind: 'cleared' }`: show XP earned, rank change if present, and
      the room's cleared status. Store `artifactMarkdown` for display.
- [ ] `{ ok: false }`: render `error.code` and `error.message` verbatim enough to be
      actionable; do not replace with a generic toast.
- [ ] Rejected promise: show "Not saved" plus a retry, and do not update the UI as if the
      action committed.
- [ ] On cleared, offer "Take artifact" which calls `engine.collectArtifact(roomId)`;
      handle refusal and rejection the same way.
- [ ] Log codes and counts only, never note text or topics.

### P2-T4 — Artifact display

- [ ] Render `artifactMarkdown` as text inside a `<pre>` or equivalent; never use
      `innerHTML`.
- [ ] Treat attachment names and URLs as display text only; make no network requests.
- [ ] Note the future option of a sanitizing markdown renderer without adding it now.

### P2-T5 — HUD and projection

- [ ] `projectHud` is pure: input `EngineState` fixture, output `HudView`; test draft,
      cleared, and missing-subject cases.
- [ ] Show subject name, world/phase, XP, rank, and per-room status.
- [ ] Do not encode cleared/created by colour alone; include a label or icon shape.

### P2-T6 — Save-failure harness

- [ ] Add a test-only storage wrapper that delegates to the IndexedDB adapter but can be
      told to reject the next `save`.
- [ ] Test: a rejected save leaves `engine.snapshot()` at the prior state and the UI shows
      "Not saved".
- [ ] Reuse this harness in P3 and P4; do not duplicate it.

### P2-T7 — Accessibility pass

- [ ] Move focus into the composer on open and return it to the canvas/interaction
      surface on close.
- [ ] Announce refusals, cleared rooms, and save failures through an `aria-live` region.
- [ ] Provide a keyboard path for artifact collection and closing panels.
- [ ] Honor reduced motion for any panel transitions.
- [ ] Record the keyboard-only walkthrough result.

### P2-T8 — Manual proof

- [ ] Submit an incomplete note and confirm the exact missing section is shown.
- [ ] Submit a complete note with confirmation and confirm clear + XP + artifact.
- [ ] Reload and confirm the room and XP survive.
- [ ] Temporarily enable the failing storage wrapper and confirm "Not saved".

## Exit gate G2

- [ ] A room can be cleared end-to-end from the keyboard.
- [ ] Draft, refusal, clear, and save-failure states are each demonstrated.
- [ ] Reload preserves the cleared room, XP, and artifact availability.
- [ ] Projection and save-failure tests pass.
- [ ] Artifact text is rendered without `innerHTML`.
- [ ] Root and example suites, typechecks, and builds are green; engine count unchanged.
- [ ] No engine source diff.
- [ ] G2 entry written in [EVIDENCE.md](EVIDENCE.md).

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

## Execution evidence

| Date (UTC) | Task/Gate | Commit | Command or artifact | Result | Notes |
|---|---|---|---|---|---|
| | | | | | |
