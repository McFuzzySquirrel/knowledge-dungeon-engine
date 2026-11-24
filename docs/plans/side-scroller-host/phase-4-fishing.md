# P4 — Fishing

| Field | Value |
|---|---|
| Phase | P4 |
| Parent | [Implementation plan](README.md) |
| Depends on | [P2](phase-2-note-loop.md) (G2), [P3](phase-3-surface-village.md) (G3) |
| Blocks | — |
| Requirements | R-07, R-08, R-11, R-13, R-14 |
| Exit gate | [G4](#exit-gate-g4) |
| Status | Done — G4 passed 2026-11-24 |

## Objective

Add the Fisher's Rest loop at a surface pond: begin a session, drive the engine's pure
cast/bite/reel state machine in a canvas scene, report machine results through
`dispatchFishing`, and resolve keep/release with a recall question from a cleared room.

P4 is a phase in this plan by maintainer decision (D-03), but it is the last gate and may
be deferred without affecting P0–P3.

## Non-goals

- Competitive or anti-cheat behaviour. The engine trusts host-reported machine results
  ([host guide §Security](../../host-ui-guide.md#security-and-trust-boundaries)).
- Fish stand trading, equipment, badges UI, or the full collection screen. A simple
  collection count is enough.
- Mid-cast save/resume. Cast and bite progress are not resumable
  ([host guide §Frame Loop](../../host-ui-guide.md#frame-loop-and-timing)).
- Changing fishing rules, catalogs, or command payloads.

## Inputs and references

| What | Where |
|---|---|
| Command payloads | [`src/application/contracts/commands.ts`](../../../src/application/contracts/commands.ts) `fishing/session-begin`, `fishing/cast-complete`, `fishing/bite-resolve`, `fishing/catch-keep`, `fishing/catch-release`, `fishing/state-read` |
| Facade dispatch | [`src/creatorEngine.ts`](../../../src/creatorEngine.ts) `dispatchFishing` |
| State machine | [`src/core/fishing/fishingStateMachine.ts`](../../../src/core/fishing/fishingStateMachine.ts) `createFishingState`, `reduceFishing`, `isFishingEligible` |
| Recall helpers | [`src/core/fishing/fishingMechanics.ts`](../../../src/core/fishing/fishingMechanics.ts) `getClearedRooms`, `pullRecallQuestion`, `createSeededRng` |
| Command layer rules | [ADR-0008](../../adr/0008-fishing-state-machine-and-command-layer.md) |
| Pond data | [`src/data/villageLayout.ts`](../../../src/data/villageLayout.ts) `fishing-pond` structures, `getFishingPondPortalMap`, `getNearestFishingPondToPortal` |
| Existing tests to mirror | [`tests/phase17/fishingStateMachine.test.ts`](../../../tests/phase17/fishingStateMachine.test.ts), [`tests/phase17/fishingCommands.test.ts`](../../../tests/phase17/fishingCommands.test.ts) |

## Frozen interfaces

```ts
import type { FishingCommand } from '@/index';

// Derived from the public command union so the bridge cannot drift from payloads.
type CastCompletePayload = Extract<FishingCommand, { type: 'fishing/cast-complete' }>['payload'];
type CatchKeepPayload = Extract<FishingCommand, { type: 'fishing/catch-keep' }>['payload'];
type FishingDirection = CastCompletePayload['fishDirection'];
type RecallOutcome = CatchKeepPayload['recall'];

export type FishingDispatchOutcome =
  | { ok: true; value: unknown }
  | { ok: false; error: { code: string; message: string } };

// src/fishing/bridge.ts
export interface FishingSessionContext {
  pondId: string;
  subjectId: string;
  subjectName: string;
  roomId?: string | null;
}

export interface FishingBridgeHooks {
  dispatch(command: FishingCommand): Promise<FishingDispatchOutcome>;
}

export function createFishingBridge(context: FishingSessionContext, hooks: FishingBridgeHooks): {
  onCastLanded(input: { castNumber: number; catalogId: string; direction: FishingDirection }): Promise<void>;
  onBiteResolved(input: { castNumber: number; resolution: 'hooked' | 'missed'; catalogId?: string }): Promise<void>;
  onKeep(input: { castNumber: number; catalogId: string; recall: RecallOutcome }): Promise<void>;
  onRelease(input: { castNumber: number; catalogId: string }): Promise<void>;
};
```

The bridge builds the `FishingSubjectContext` from the session context and forwards
tagged commands. It does not own the machine, rendering, or timing.

## Work breakdown

### P4-T1 — Confirm fishing surface

- [x] Explore task reports the exact `WorldCommandPayloadMap` fields for all six fishing
      commands, the machine's cast-count and candidate fields, and which machine effects
      carry the catalog id.
- [x] Confirm how `dispatchFishing` commits: `session-begin` and `catch-keep` commit;
      other commands do not change engine state. Record this so the host does not expect
      a snapshot after every cast event.
- [x] Confirm `pullRecallQuestion` uses `Math.random` internally and is therefore not
      seedable. Record the consequence: recall **selection** is not part of deterministic
      replay; the bridge is tested with a fixed `roomId`.

### P4-T2 — Entry point

- [x] Ponds are the `fishing-pond` structures supplied by `villageStructures()`. Show a
      prompt and `E` when the player is in range.
- [x] Require an active subject. If `activeSubjectId` is null, show a refusal-style
      message and do not dispatch. *(Amended 2026-11-24: the engine clears
      `activeSubjectId` in `returnToVillage()`, so the host resolves the pond subject as
      active → remembered → most-cleared. See [amendments](#amendments-2026-11-24).)*
- [x] Compute cleared-room count from the active subject and gate the prompt with
      `isFishingEligible`. *(Amended: the prompt stays visible so the refusal can explain
      itself; `session-begin` is gated.)*
- [x] On entry, dispatch `fishing/session-begin` with `{ pondId, subjectId, subjectName, roomId }`
      using the **active subject**, not the nearest portal subject.
- [x] Handle `{ ok: false }` (`NO_OPEN_SESSION`, `SUBJECT_CONTEXT_MISMATCH`,
      `INVALID_SESSION_CONTEXT`, …) and rejected promises distinctly.
- [x] Only route to the fishing scene when the engine sets `session.world === 'fishing'`
      and `fishingSession` is non-null.

### P4-T3 — Machine and loop

- [x] Create the machine with the canvas viewport, one clock, `castNumber` starting at 1,
      and `eligible` from `isFishingEligible`.
- [x] Use one RNG stream per session: production seeds once, tests inject a fixed seed
      with `createSeededRng`.
- [x] Tick with elapsed milliseconds from the same clock used for the engine commands.
      Clamp hostile deltas as in P1.
- [x] Map input: hold to power, release to cast, press to hook, left/right to move, reset
      for the next cast. These are the machine's events, not engine commands.
- [x] Render: horizon, shore, player, rod, bobber, fish, power meter, state prompts.
      Placeholder art only.
- [x] Play no audio; the machine's `audio` effects are ignored or shown as text. Record
      this in evidence (assumption S-04).
- [x] Resize sends `resize` to the machine; do not rebuild the session.

### P4-T4 — Machine → command bridge

- [x] Detect the casting → waiting transition and call `onCastLanded` with the machine's
      candidate catalog id, direction, and cast number.
- [x] Detect bite resolution (hooked or window expired) and call `onBiteResolved` exactly
      once per cast.
- [x] On `caught`, display the fish and open the recall dialog.
- [x] Keep: call `onKeep` with a recall outcome:
      - correct answer → `{ kind: 'answered-correct', roomId }`
      - incorrect answer → `{ kind: 'answered-incorrect', roomId }`
      - no question available → `{ kind: 'kept-without-recall' }`
- [x] Release: call `onRelease` with the catalog id. Release awards nothing.
- [x] After a keep or release, reset the machine and increment the cast counter through
      the machine, never by writing state.
- [x] Guard against duplicate dispatch: one in-flight command per cast, disabled controls
      while pending.

### P4-T5 — Recall dialog

- [x] Pull the question with `pullRecallQuestion({ clearedRooms, dungeonRooms, subjectName })`
      from the active subject. *(Amended: the question is the engine's
      `fishing/bite-resolve` `catch.recall`, which calls `pullRecallQuestion` once against
      the session's subject.)*
- [x] Render the prompt in a DOM dialog with real controls; focus moves in and back.
- [x] Show "answer and keep", "could not recall", and "keep without recall" paths exactly
      as the command payload allows.
- [x] Announce the result and the collection change through the P2 live region.
- [x] Treat prompt text as learner content: display it, never log it.

### P4-T6 — Reload and recovery

- [x] If boot finds `world === 'fishing'`, mid-cast progress is gone. Show "session could
      not be resumed", call `returnToVillage()`, and route to the surface.
- [x] Confirm the persisted fish collection and XP survive the reload that follows a
      catch.
- [x] Reuse the P2 save-failure harness for a failed `catch-keep`: the UI must say
      "Not saved" and the fish must not appear.

### P4-T7 — Tests

- [x] Bridge unit tests with a fixed context: each hook produces the expected tagged
      command and payload.
- [x] Machine replay with `createSeededRng` and a scripted event trace: final phase,
      candidate, and cast number are stable across runs.
- [x] Eligibility test: zero cleared rooms refuses entry.
- [x] Integration test with `MemoryEngineStorage`:
      - [x] seed a tutorial subject with one cleared room,
      - [x] begin a session,
      - [x] keep a fish with a fixed recall room,
      - [x] assert the collection grew and a second identical keep is idempotent,
      - [x] release a fish and assert the collection is unchanged.
- [x] Refusal and rejection paths are separate assertions.

### P4-T8 — Manual proof

- [x] Clear one room, go to a fishing pond, and catch a fish.
- [x] Keep with a correct answer and confirm the collection count and XP.
- [x] Release a second fish and confirm no collection change.
- [x] Reload and confirm the fish persists.
- [x] Keyboard-only run: enter pond, cast, hook, answer, keep, leave.

## Findings (P4-T1)

| Item | Finding |
|---|---|
| `fishing/session-begin` | `{ pondId, subjectId, subjectName, roomId? }`; mints the session context. |
| `fishing/cast-complete` | `{ subject, castNumber, catalogId, fishDirection }`; `fishDirection` is `'right' \| 'bottom'`. |
| `fishing/bite-resolve` | `{ subject, castNumber, resolution: 'hooked' \| 'missed', catalogId? }`; the hooked outcome carries `catch.recall`, the engine's one `pullRecallQuestion` result. |
| `fishing/catch-keep` | `{ subject, castNumber, catalogId, recall }`; `recall` is `answered-correct` / `answered-incorrect` / `kept-without-recall`. |
| `fishing/catch-release` | `{ subject, castNumber, catalogId }`; writes nothing. |
| `fishing/state-read` | `{ subject? }`; a read. |
| Machine candidate | `candidate` is rolled on the landing tick (`casting → waiting`) and cleared on `release` and `reset`; `castNumber` advances only on `release` and is deliberately not rewound by `reset`. |
| Effects | `catch-revealed` carries `catalogId`, `rarity`, `castNumber`, and `description`; `audio` hooks are named only. |
| Commit behaviour | `session-begin` always stores `fishingSession` and commits; it sets `session.world = 'fishing'` only when eligible. `catch-keep` commits only when the ledger writes; the other commands return an outcome without changing engine state. |
| Recall selection | `pullRecallQuestion` draws with `Math.random` twice, so it is not seedable. Deterministic replay covers phase, candidate, cast number, and effects; recall is tested with a fixed `roomId`. |

## Amendments (2026-11-24)

1. **Pond subject is host-resolved.** `returnToVillage()` clears `activeSubjectId`, and
   P3's return flow therefore reaches the street with no active subject. `resolveFishingSubject`
   in `src/fishing/session.ts` uses, in order: `state.activeSubjectId`; the subject the
   host last entered in this tab; the subject with the most cleared rooms (so a reload on
   the street still finds it). It returns `null` only when the save has no subjects. The
   command payload still uses that subject, never the nearest portal subject (K-10's
   rule), and `dispatchFishing` remains the gatekeeper.
2. **The prompt stays visible when a pond is ineligible.** The plan says "gate the
   prompt"; hiding it leaves the learner with no explanation. The prompt is shown, and
   `E` renders the specific refusal (`Clear a room before fishing…`) without dispatching.
   Successful dispatch is still gated by `isFishingEligible` inside the engine.
3. **Bridge hooks resolve to the dispatch outcome.** The frozen interface declared
   `Promise<void>`; returning `FishingDispatchOutcome` lets the host present the engine's
   own recall question from `fishing/bite-resolve` instead of drawing a second question
   with `Math.random`. A caller that ignores the value is unaffected.
4. **One recall question, from the engine.** `catch.recall` is projected into the DOM
   dialog as plain text. It is never logged or announced; only the dialog title and
   outcome are announced.
5. **Recovery notice is a persistent banner.** The street's proximity announcements
   overwrite the live region immediately after boot, so a "session could not be resumed"
   message in `#status` would vanish. The notice is mirrored into `#recovery`, which
   stays visible until the learner dismisses it or enters a dungeon or pond.
6. **The scene imports the public `fishingState` namespace only.** It reads layout
   helpers and constants from `@/index` and never imports the engine class or a command.
   The bridge is still the only module that builds `fishing/*` commands.
7. **`--fishing` capture mode.** The WebDriver script drives the real app through street
   → pond → cast → bite → recall → keep → release → reload → mid-cast recovery, including
   a simulated IndexedDB failure. It adds no page hooks.

## Exit gate G4

- [x] Fishing is reachable from the surface only with an active subject and a cleared
      room.
- [x] Cast/bite/reel runs on one clock and one RNG stream against the engine machine.
- [x] Keep and release outcomes match the engine rules; release mutates nothing.
- [x] Deterministic replay and bridge tests pass; integration keep/release tests pass.
- [x] Reload during fishing recovers to the surface with a visible notice.
- [x] Root and example suites, typechecks, and builds are green; engine count unchanged.
- [x] No engine source diff.
- [x] Full manual smoke script from [the plan §9](README.md#9-validation-plan) passes.
- [x] G4 entry written in [EVIDENCE.md](EVIDENCE.md), including the performance capture
      and the accessibility pass.

## Validation commands

```sh
npm --prefix examples/side-scroller test
npm --prefix examples/side-scroller run typecheck
npm --prefix examples/side-scroller run build
npm test
npm run typecheck
git status --short src
```

## Sub-agent opportunities

| Task | Agent | Owns | Inputs | Output | Integration |
|---|---|---|---|---|---|
| Confirm command payloads, machine candidate/effect fields, and `dispatchFishing` commit behaviour | `explore` | Nothing | `commands.ts`, `fishingStateMachine.ts`, `creatorEngine.ts` | Findings + line references | Run first |
| Implement `fishing/bridge.ts` and tests | `general` | `src/fishing/bridge.ts`, `tests/fishingBridge.test.ts` | Frozen bridge interface | Module + tests | Before scene integration |
| Implement fishing canvas scene | `general` | `src/fishing/scene.ts` | Machine state and viewport contract | Module + screenshot | Main agent wires the loop |
| Implement recall dialog with focus management | `general` | `src/ui/recallDialog.ts` | `FishingRecallQuestion` shape | Module + a11y notes | Parallel with scene |
| Machine replay and engine integration tests | `general` | `tests/fishingReplay.test.ts` | `createSeededRng`, `MemoryEngineStorage` | Tests + results | After bridge |
| Loop, input, and command dispatch | Main agent | `src/main.ts` | All modules | Playable fishing | Final |

Guardrails: the bridge is the only module that calls `dispatchFishing`; the scene does
not import the engine. The scene may not mutate machine state outside `reduceFishing`.
Bridge result types derive from the exported `FishingCommand` union, so no internal
engine type import is needed (K-14).

## Phase-specific risks

- K-12: reload mid-cast. Recovery is explicit and evidenced (frame `12`).
- K-07: no study session / no cleared room. Entry resolution explains the missing
  requirement; `session-begin` and the machine refuse to cast.
- Non-seedable recall selection. Documented in P4-T1; tests pass the `roomId` directly
  and replay covers everything except the pull.
- Duplicate dispatch. Per-cast reported/resolved guards, one in-flight keep/release, and
  engine idempotency for `catch-keep`.
- Asset absence. Placeholder shapes only; no audio (S-04).
- Host-resolved pond subject. Recorded as Amendment 1; the engine still enforces
  subject existence, name match, and eligibility.

## Rollback

Remove `src/fishing/`, `src/ui/recallDialog.ts`, the pond branch in `useInteractable`, the
fishing routing branch, and the `#fishing-panel`/`#recovery` additions; the P3 surface
remains. The engine's fishing code is untouched, so no data migration is needed. Any fish
already stored remain valid engine state.

## Execution evidence

| Date (UTC) | Task/Gate | Commit | Command or artifact | Result | Notes |
|---|---|---|---|---|---|
| 2026-11-24 | P4-T1 — fishing surface | uncommitted (base `203011d`) | source exploration of `contracts/commands.ts`, `core/fishing/fishingStateMachine.ts`, `creatorEngine.ts` | pass | Six payload shapes, candidate/effect fields, and commit behaviour recorded in Findings; recall selection is excluded from deterministic replay |
| 2026-11-24 | P4-T2/T4 — bridge and entry | uncommitted | `tests/fishingBridge.test.ts`, `tests/fishingEntry.test.ts` | pass | 5 bridge tests; 6 entry/projection/copy tests; each hook produces one tagged command, subject resolution is active → remembered → most-cleared |
| 2026-11-24 | P4-T3/T7 — machine replay | uncommitted | `tests/fishingReplay.test.ts` | pass | Fixed seed 1337: phase, candidate, cast number, and effect order stable; resize keeps the cast; counter monotonic across reset |
| 2026-11-24 | P4-T4/T6 — engine integration | uncommitted | `tests/fishingIntegration.test.ts` | pass | Begin after `returnToVillage`; keep awards and is idempotent; release mutates no progression; reload restores XP and fish; rejected keep leaves the collection empty; typed refusal vs rejected promise |
| 2026-11-24 | P4-T8 — manual/keyboard and visuals | uncommitted | `node examples/side-scroller/scripts/capture-dungeon.mjs --out docs/plans/side-scroller-host/visuals/p4 --prefix 2026-11-24-g4 --fishing --reduced-motion` | pass | 12 frames: street pond, powering, waiting, bite, recall, not-saved, keep, release, street, reload, mid-cast recovery. Keep and release activated with Enter on the focused button; reduced motion true |
| 2026-11-24 | P4-T6 — recovery and save failure | uncommitted | frames [`07-not-saved`](visuals/p4/2026-11-24-g4-07-not-saved.png), [`12-mid-cast-reload`](visuals/p4/2026-11-24-g4-12-mid-cast-reload.png) | pass | Save failure shows "Not saved" in the dialog and HUD, fish 0→0; mid-cast reload returns to the street with the persistent recovery banner |
| 2026-11-24 | P4-T8 — full §9 smoke re-run | uncommitted | `capture-dungeon.mjs` default, `--note-loop`, and `--surface` modes into `/tmp/opencode/p4-smoke` | pass | Three-room traversal visits 1→2→3; composer draft/clear/reload/save failure; street/portal/return/reload. Scratch artifacts are host-only and not committed |
| 2026-11-24 | G4 — exit gate | uncommitted (base `203011d`) | full gate commands below | pass | Engine 13 files / 280 tests; example 18 files / 106 tests; engine typecheck/build green; example typecheck/build green; isolation probe 0 `examples/` paths; `git status --short src` empty |
| 2026-11-24 | G4 — performance and accessibility | uncommitted | 10 s rAF capture in the pond; `matchMedia` reduced-motion true; keyboard-only capture | pass with P2-O1 exception | frames 596; avg 16.79 ms; p95 17.16 ms; max 33.74 ms; 319 frames just over 16.7 ms in headless software compositing (P2-O1). No audio (S-04); Tab order inside the recall dialog is `answered-incorrect → release → later → answered-correct` (wraps) and focus returns to `#game` |
