# P4 — Fishing

| Field | Value |
|---|---|
| Phase | P4 |
| Parent | [Implementation plan](README.md) |
| Depends on | [P2](phase-2-note-loop.md) (G2), [P3](phase-3-surface-village.md) (G3) |
| Blocks | — |
| Requirements | R-07, R-08, R-11, R-13, R-14 |
| Exit gate | [G4](#exit-gate-g4) |
| Status | Not started |

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

- [ ] Explore task reports the exact `WorldCommandPayloadMap` fields for all six fishing
      commands, the machine's cast-count and candidate fields, and which machine effects
      carry the catalog id.
- [ ] Confirm how `dispatchFishing` commits: `session-begin` and `catch-keep` commit;
      other commands do not change engine state. Record this so the host does not expect
      a snapshot after every cast event.
- [ ] Confirm `pullRecallQuestion` uses `Math.random` internally and is therefore not
      seedable. Record the consequence: recall **selection** is not part of deterministic
      replay; the bridge is tested with a fixed `roomId`.

### P4-T2 — Entry point

- [ ] Ponds are the `fishing-pond` structures supplied by `villageStructures()`. Show a
      prompt and `E` when the player is in range.
- [ ] Require an active subject. If `activeSubjectId` is null, show a refusal-style
      message and do not dispatch.
- [ ] Compute cleared-room count from the active subject and gate the prompt with
      `isFishingEligible`.
- [ ] On entry, dispatch `fishing/session-begin` with `{ pondId, subjectId, subjectName, roomId }`
      using the **active subject**, not the nearest portal subject.
- [ ] Handle `{ ok: false }` (`NO_OPEN_SESSION`, `SUBJECT_CONTEXT_MISMATCH`,
      `INVALID_SESSION_CONTEXT`, …) and rejected promises distinctly.
- [ ] Only route to the fishing scene when the engine sets `session.world === 'fishing'`
      and `fishingSession` is non-null.

### P4-T3 — Machine and loop

- [ ] Create the machine with the canvas viewport, one clock, `castNumber` starting at 1,
      and `eligible` from `isFishingEligible`.
- [ ] Use one RNG stream per session: production seeds once, tests inject a fixed seed
      with `createSeededRng`.
- [ ] Tick with elapsed milliseconds from the same clock used for the engine commands.
      Clamp hostile deltas as in P1.
- [ ] Map input: hold to power, release to cast, press to hook, left/right to move, reset
      for the next cast. These are the machine's events, not engine commands.
- [ ] Render: horizon, shore, player, rod, bobber, fish, power meter, state prompts.
      Placeholder art only.
- [ ] Play no audio; the machine's `audio` effects are ignored or shown as text. Record
      this in evidence (assumption S-04).
- [ ] Resize sends `resize` to the machine; do not rebuild the session.

### P4-T4 — Machine → command bridge

- [ ] Detect the casting → waiting transition and call `onCastLanded` with the machine's
      candidate catalog id, direction, and cast number.
- [ ] Detect bite resolution (hooked or window expired) and call `onBiteResolved` exactly
      once per cast.
- [ ] On `caught`, display the fish and open the recall dialog.
- [ ] Keep: call `onKeep` with a recall outcome:
      - correct answer → `{ kind: 'answered-correct', roomId }`
      - incorrect answer → `{ kind: 'answered-incorrect', roomId }`
      - no question available → `{ kind: 'kept-without-recall' }`
- [ ] Release: call `onRelease` with the catalog id. Release awards nothing.
- [ ] After a keep or release, reset the machine and increment the cast counter through
      the machine, never by writing state.
- [ ] Guard against duplicate dispatch: one in-flight command per cast, disabled controls
      while pending.

### P4-T5 — Recall dialog

- [ ] Pull the question with `pullRecallQuestion({ clearedRooms, dungeonRooms, subjectName })`
      from the active subject.
- [ ] Render the prompt in a DOM dialog with real controls; focus moves in and back.
- [ ] Show "answer and keep", "could not recall", and "keep without recall" paths exactly
      as the command payload allows.
- [ ] Announce the result and the collection change through the P2 live region.
- [ ] Treat prompt text as learner content: display it, never log it.

### P4-T6 — Reload and recovery

- [ ] If boot finds `world === 'fishing'`, mid-cast progress is gone. Show "session could
      not be resumed", call `returnToVillage()`, and route to the surface.
- [ ] Confirm the persisted fish collection and XP survive the reload that follows a
      catch.
- [ ] Reuse the P2 save-failure harness for a failed `catch-keep`: the UI must say
      "Not saved" and the fish must not appear.

### P4-T7 — Tests

- [ ] Bridge unit tests with a fixed context: each hook produces the expected tagged
      command and payload.
- [ ] Machine replay with `createSeededRng` and a scripted event trace: final phase,
      candidate, and cast number are stable across runs.
- [ ] Eligibility test: zero cleared rooms refuses entry.
- [ ] Integration test with `MemoryEngineStorage`:
      - [ ] seed a tutorial subject with one cleared room,
      - [ ] begin a session,
      - [ ] keep a fish with a fixed recall room,
      - [ ] assert the collection grew and a second identical keep is idempotent,
      - [ ] release a fish and assert the collection is unchanged.
- [ ] Refusal and rejection paths are separate assertions.

### P4-T8 — Manual proof

- [ ] Clear one room, go to a fishing pond, and catch a fish.
- [ ] Keep with a correct answer and confirm the collection count and XP.
- [ ] Release a second fish and confirm no collection change.
- [ ] Reload and confirm the fish persists.
- [ ] Keyboard-only run: enter pond, cast, hook, answer, keep, leave.

## Exit gate G4

- [ ] Fishing is reachable from the surface only with an active subject and a cleared
      room.
- [ ] Cast/bite/reel runs on one clock and one RNG stream against the engine machine.
- [ ] Keep and release outcomes match the engine rules; release mutates nothing.
- [ ] Deterministic replay and bridge tests pass; integration keep/release tests pass.
- [ ] Reload during fishing recovers to the surface with a visible notice.
- [ ] Root and example suites, typechecks, and builds are green; engine count unchanged.
- [ ] No engine source diff.
- [ ] Full manual smoke script from [the plan §9](README.md#9-validation-plan) passes.
- [ ] G4 entry written in [EVIDENCE.md](EVIDENCE.md), including the performance capture
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

- K-12: reload mid-cast. Recovery is explicit and evidenced.
- K-07: no study session / no cleared room. Entry gate covers it; show the engine refusal.
- Non-seedable recall selection. Documented in P4-T1; tests pass the roomId directly.
- Duplicate dispatch. One in-flight command per cast plus engine idempotency for
  `catch-keep`.
- Asset absence. Placeholder shapes only; no audio.

## Rollback

Remove the fishing scene, bridge, and pond interaction; the P3 surface remains. The
engine's fishing code is untouched, so no data migration is needed. Any fish already
stored remain valid engine state.

## Execution evidence

| Date (UTC) | Task/Gate | Commit | Command or artifact | Result | Notes |
|---|---|---|---|---|---|
| | | | | | |
