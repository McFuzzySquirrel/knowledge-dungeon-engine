# P6 — Creator and Demo Campaign

| Field | Value |
|---|---|
| Phase | P6 |
| Parent | [Implementation plan](README.md) |
| Depends on | [P1](phase-1-dungeon-level.md), [P3](phase-3-surface-village.md) |
| Blocks | [P7](phase-7-village.md), [P8](phase-8-journal.md) |
| Requirements | R-17, R-22 |
| Exit gate | [G6](#exit-gate-g6) |
| Status | Done — G6 passed 2026-11-24 |

## Objective

Expose the engine's **Creator** phase and give the village more than the tutorial. A player
can create a subject, add and reorganise its rooms, tag it, and enter it from the street.
On a first run the host also seeds three synthetic demo subjects so the world has a
campaign without a Creator detour.

The engine already exposes `createSubject`, `activateSubject`, and `dispatchGraph`; this
phase builds the UI and the seed path around them, with no engine changes.

## Non-goals

- A canvas node graph with drag-and-drop. The editor is a room tree plus forms.
- A level editor for tile geometry. Dungeon layout stays generated from the subject graph.
- Subject import/export (P9 handles save bundles).
- Editing notes or reviews from the Creator.
- Multi-user or shared subjects.

## Inputs and references

| What | Where |
|---|---|
| Create a subject | [`src/creatorEngine.ts`](../../../src/creatorEngine.ts) `createSubject`, `activateSubject` |
| Graph commands | [`src/application/contracts/commands.ts`](../../../src/application/contracts/commands.ts) `graph/children-add`, `cross-link-add`, `room-reparent`, `room-remove`, `tags-set`, `tag-add`, `tag-remove` |
| Graph dispatch | [`src/creatorEngine.ts`](../../../src/creatorEngine.ts) `dispatchGraph` |
| Graph result types | [`src/core/graph/types.ts`](../../../src/core/graph/types.ts) `GraphDomainResult`, `GraphDomainError`; [`src/application/creatorGraphCommands.ts`](../../../src/application/creatorGraphCommands.ts) outcomes |
| Create input | [`src/core/graph/types.ts`](../../../src/core/graph/types.ts) `RootDungeonInitInput` |
| Portal projection | [`src/creatorEngine.ts`](../../../src/creatorEngine.ts) `villageStructures` |
| Side-view level | [`examples/side-scroller/src/level/dungeonLevel.ts`](../../../examples/side-scroller/src/level/dungeonLevel.ts) |
| Boundary rules | [ENGINE-BOUNDARY.md](ENGINE-BOUNDARY.md) |

## Frozen interfaces

```ts
import type { EngineState, KnowledgeDungeonEngine } from '@/index';

export interface DemoSubjectChild {
  /** Seed-local handle used for tags and cross-links; never a persisted id. */
  key: string;
  topic: string;
  tags?: readonly string[];
}

export interface DemoSubjectSeed {
  dungeonId: string;
  subjectName: string;
  rootRoomId: string;
  rootTopic: string;
  biome?: string;
  children: readonly DemoSubjectChild[];
  crossLinks?: readonly { from: string; to: string }[];
}

export interface SeedResult {
  seeded: string[];
  alreadyPresent: string[];
  skipped: boolean;
  /** Demo ids this run attempted but did not complete. */
  failed: string[];
}

/** Idempotent; no-op when every id already exists. */
export async function seedDemoSubjects(
  engine: KnowledgeDungeonEngine,
  seeds: readonly DemoSubjectSeed[],
): Promise<SeedResult>;

export interface SeedFlagStore {
  read(): string | null;
  write(value: string): void;
}

/** Host-owned first-run gate; writes the flag even when the seed skips. */
export async function seedDemoSubjectsOnFirstRun(
  engine: KnowledgeDungeonEngine,
  seeds: readonly DemoSubjectSeed[],
  flag: SeedFlagStore,
): Promise<SeedResult>;

export interface CreatorSubjectView {
  subjectId: string;
  subjectName: string;
  roomCount: number;
  clearedCount: number;
  rootRoomId: string;
}

export interface CreatorRoomView {
  roomId: string;
  topic: string;
  parentRoomId: string | null;
  tags: string[];
  depth: number;
}

export interface CreatorView {
  subjects: CreatorSubjectView[];
  /** The subject this view projects, not `state.activeSubjectId`. */
  activeSubjectId: string | null;
  rooms: CreatorRoomView[];
  /** Non-tree edges only (`relationType !== 'subtopic'`). */
  edges: { fromRoomId: string; toRoomId: string; relationType: string }[];
}

/** Pure projection; no commands. */
export function projectCreator(state: EngineState, subjectId: string | null): CreatorView;

/** Removal preview that mirrors the engine's undirected cascade rule. */
export function cascadeRemovalCount(view: CreatorView, roomId: string): number;
```

`main.ts` owns the commands. The Creator panel owns drafts and focus only.

### P6-T1 findings and amendments

One frozen-interface correction was needed before coding:

- **Child room ids are engine-minted.** `graph/children-add` has no room-id field and
  `dispatchGraph` mints every child id through its injected `newRoomId`. A seed therefore
  cannot name a child room id ahead of time. `DemoSubjectSeed.children[].roomId` is
  replaced by `key`, a seed-local handle used only for tags and cross-links, and
  `crossLinks` names those keys. The outcome's `createdRoomIds` is ordered like the
  submitted `topics`, so `key` is matched to the minted id by position.
- **First-run gating is host-owned and testable.** `seedDemoSubjects` stays the pure
  idempotent seeder, and a thin `seedDemoSubjectsOnFirstRun(engine, seeds, flagStore)`
  wraps it with the localStorage flag. A `SeedResult` gains `failed: string[]` so a
  partial failure reports which seeds did not complete.
- **`createSubject`/`activateSubject` both start a study session** and
  `activateSubject` does not change `session.world`; a Creator edit session therefore
  stays on the village street and must be closed with `returnToVillage()`.
  `dispatchGraph` reads `state.activeSubjectId` once and refuses nothing when it is
  `null` (the controller returns a refusal result), so the host always activates first.
- **Entering from the list** uses the existing portal command
  (`interactVillageStructure('portal-<dungeonId>')`), which sets the dungeon world and
  reuses the P3 route. Calling `activateSubject` first is unnecessary: the portal
  command activates and starts the session itself, and `startStudySession` is
  idempotent for the same subject.
- **The Guild Hall already advances the quest step** through
  `interactVillageStructure`. P6 keeps that write and opens the overlay after it; a
  host shortcut (`C`) opens the same overlay from the street for keyboard and capture
  use.
- **Type-only imports** come from `@/application/creatorGraphCommands` for the outcome
  union (`GraphChildrenAddOutcome`, `GraphRemoveRoomOutcome`, and friends), exactly as
  P5 imports review outcomes. `src/index.ts` is untouched; these are K-14 candidates.

## Demo subjects

Seeded only when their ids are absent, and only after the first-run seed flag is unset.
All content is synthetic; it never contains learner data.

| Id | Name | Root | Rooms |
|---|---|---|---|
| `demo-rivers` | Rivers & Bridges | Why Rivers Matter | River Shapes, Bridge Types, Flood Planning |
| `demo-sky` | Sky & Weather | Reading the Sky | Cloud Families, Pressure & Wind, Storm Signs, Forecast Practice |
| `demo-kitchen` | Kitchen Chemistry | Everyday Reactions | Heat & Browning, Acids & Bases, Emulsions |

`demo-kitchen` also carries one cross-link (`Heat & Browning → Emulsions`) so the editor
has a non-tree edge to display. Ids are stable so a re-run cannot duplicate them.

## Work breakdown

### P6-T1 — Confirm the Creator surface

- [x] Explore task reports the exact `RootDungeonInitInput` fields, `GraphDomainResult`
      shape, each graph payload, and the outcome fields for removals and reparenting.
- [x] Confirm `createSubject` and `activateSubject` both start a study session; record the
      required cleanup (`returnToVillage()` when entering Creator from the street).
- [x] Confirm `dispatchGraph` operates on the **active** subject only.
- [x] Record every type-only import as a K-14 candidate; do not edit `src/index.ts`.

### P6-T2 — Seed module

- [x] `src/creator/seeds.ts` holds the three `DemoSubjectSeed` values and
      `seedDemoSubjects`.
- [x] For each absent id: `createSubject(...)`, then `dispatchGraph` children, tags, and
      cross-links on that subject, then `returnToVillage()`.
- [x] Existing ids are skipped without any command; a partial failure leaves earlier
      subjects valid and reports which seeds succeeded.
- [x] A host-owned first-run flag prevents re-seeding after the player deletes a demo
      subject. If the flag is lost but the ids exist, the module still skips.
- [x] Never seed when `state.subjects` already contains a non-demo subject and the flag is
      unset; the first-run path is the only seed path.
- [x] Record seed sessions as expected engine state; do not hand-write progression.

### P6-T3 — Creator entry and subject list

- [x] The Guild Hall facade opens the Creator list (P7 later gives it a full interior; for
      P6 the facade opens a DOM overlay directly).
- [x] The list shows every subject with room/cleared counts and a "Create subject" form
      (name, root topic, optional biome).
- [x] Creating a subject validates the name, mints stable ids, calls `createSubject`, then
      returns to the street with the new subject activated. The new portal appears from
      `villageStructures()`; no host portal list is added.
- [x] Entering a subject from the list calls `activateSubject` and routes to the dungeon
      through the existing P3 flow.
- [x] Empty, duplicate, and invalid ids are surfaced as visible refusals.

### P6-T4 — Room graph editor

- [x] Show the room tree in graph order, with the root marked and depth indentation.
- [x] Add child rooms (one or many topics, blank topics dropped).
- [x] Reparent a room; remove a room with a confirmation that names the cascade count.
- [x] Add/remove tags and add cross-links between two rooms.
- [x] After each mutation, re-render from the state subscription; never mutate the local
      view model as if it were committed.
- [x] Render typed `GraphDomainError` codes and messages verbatim; a rejected promise is
      "Not saved" and leaves the previous tree intact.
- [x] Disable controls while a mutation is pending; one in-flight graph command at a time.
- [x] Keyboard-only operation for every control; focus stays in the overlay and returns
      to `#game` on close.

### P6-T5 — Campaign surface

- [x] Seeded subjects appear as extra portals in the street and in the surface HUD.
- [x] Each portal enters its own dungeon; the existing structural key rebuilds the level
      when the subject changes.
- [x] A demo subject with no cleared rooms shows the normal empty-state HUD.
- [x] Do not special-case the tutorial in routing; it remains the first subject.
- [x] Record the demo subject names in `VISUALS.md` as synthetic content, not learner data.

### P6-T6 — Tests

- [x] Seed tests with `MemoryEngineStorage`: three subjects created, progression records
      exist, session closed, portal count grows by three.
- [x] Re-running the seed is a no-op; deleting one demo subject with the first-run flag set
      does not recreate it.
- [x] Graph command tests: add children, reparent, remove cascade, tag set/add/remove,
      cross-link duplicate refusal.
- [x] Creator projection tests from an `EngineState` fixture (tree order, edges, counts).
- [x] Failing-storage create/mutation leaves the previous state; a refused graph command
      shows its code and does not change the tree.
- [x] No host test asserts engine counts; the engine suite stays at its baseline.

### P6-T7 — Manual proof and visuals

- [x] Fresh save: three demo portals + Training Grounds; enter each and return.
- [x] Create a fourth subject, add three rooms, tag one, cross-link two, enter it, clear a
      room, reload, and confirm the graph and portal survive.
- [x] Remove a room with descendants and confirm the cascade count.
- [x] Keyboard-only run through create → add rooms → enter → return.
- [x] Capture frames for: subject list, create form, tree with tags/edge, cascade
      confirmation, new portal on the street, refusal, and save failure.

## Exit gate G6

- [x] The Creator can create a subject, add/reparent/remove rooms, tag, and cross-link.
- [x] Every mutation reports typed refusals and rejected writes distinctly.
- [x] Three demo subjects seed idempotently on a first run and never resurrect after
      deletion.
- [x] New subjects appear as portals from engine data with no host hard-coding.
- [x] A created subject can be entered, cleared, and reloaded.
- [x] Keyboard and reduced-motion passes recorded.
- [x] Root and example suites, typechecks, and builds green; engine count unchanged.
- [x] No engine source diff.
- [x] G6 entry written in [EVIDENCE.md](EVIDENCE.md), with visuals under `visuals/p6/`.

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
| Confirm create/graph payloads and session side effects | `explore` | Nothing | `commands.ts`, `creatorGraphCommands.ts`, `creatorEngine.ts` | Findings + line refs | Run first |
| Seed module and idempotency tests | `general` | `src/creator/seeds.ts`, `tests/creatorSeeds.test.ts` | Frozen seed interface | Module + tests | Before editor |
| Creator projection | `general` | `src/creator/projection.ts`, `tests/creatorProjection.test.ts` | `EngineState` fixtures | Module + tests | Parallel with seeds |
| Graph editor UI | `general` | `src/ui/creatorPanel.ts` | Frozen drawer interface | Module + a11y notes | After projection |
| Integration and campaign routing | Main agent | `src/main.ts`, `src/routing.ts` | All modules | Playable Creator | Final |

Guardrails: only `main.ts` calls `createSubject`, `activateSubject`, and `dispatchGraph`;
the panel never imports the engine; no agent edits `src/`.

## Phase-specific risks

- **Session leakage.** `createSubject` and `activateSubject` start study sessions. Every
  Creator/seed path must end with `returnToVillage()` or a deliberate dungeon entry.
- **Seed vs. player intent.** A demo subject the player deleted must not return. The
  first-run flag is host-local (localStorage) and documented as such.
- **Graph cascade surprise.** Removal cascades unreachable descendants; the confirmation
  must name how many rooms will go.
- **Type surface.** Graph outcome types may need type-only imports. Record them; do not
  add exports.
- **Creator scope creep.** This is a tree editor, not a canvas graph or tile editor.

## Outcome and deviations

G6 passed on 2026-11-24 with the engine at its unchanged 13 files / 280 tests and the
example at 26 files / 153 tests. `src/` has no diff.

Delivered:

- `examples/side-scroller/src/creator/seeds.ts` — three synthetic subjects, an
  idempotent seeder, a first-run localStorage wrapper, and a partial-failure report.
- `examples/side-scroller/src/creator/projection.ts` — subject list, depth-first room
  tree, cross-link edges, and a removal-cascade preview that mirrors the engine's
  undirected reachability rule.
- `examples/side-scroller/src/ui/creatorPanel.ts` — subject list, create form, room tree,
  add/reparent/remove with two-step cascade confirmation, tag editing, cross-links,
  pending-state disabling, Tab trap, and focus return.
- `examples/side-scroller/src/main.ts` — the only writer: `createSubject`,
  `activateSubject`, `dispatchGraph`, portal entry, Guild Hall hook, `C` shortcut, and
  the first-run seed call before the subscription.
- Tests: `creatorSeeds.test.ts`, `creatorProjection.test.ts`, `creatorGraph.test.ts`,
  `creatorCampaign.test.ts`.
- `--creator` capture mode with a normal, a reduced-motion, and a keyboard-only run.

Deviations, recorded rather than hidden:

- **Duplicate ids cannot be exercised from the UI** because the host mints UUIDs; the
  visible refusal is therefore an empty name/topic check and a duplicate *subject name*
  check (case-insensitive). Invalid ids remain an engine-level throw.
- **Tag removal is expressed through `tags-set`** (edit the comma list), not a separate
  `tag-remove` control. The engine's `tag-add` and `tag-remove` commands are covered by
  `creatorGraph.test.ts`.
- **"Returns to the street with the new subject activated"** is implemented as the
  amended reading: the subject stays active while the Creator is open for editing, and
  closing the Creator returns to the street and ends that session. The portal appears
  because `villageStructures()` derives every subject, not because of the active id.
- **Six portal slots.** The engine exposes six street slots. A seventh subject has no
  portal; the panel refuses "Enter dungeon" with visible copy instead of failing at the
  engine's `Village structure not found`.
- **No K-14 type-only import was needed.** `GraphCommand` is public and the outcome union
  is narrowed from `dispatchGraph` by `value.command`; the Creator types are host-local.

## Rollback

Delete `src/creator/`, `src/ui/creatorPanel.ts`, the Guild Hall Creator overlay, and the
seed call in boot. Seeded subjects are ordinary engine state and remain valid; the earlier
host simply shows more portals. Remove the first-run seed flag if it should re-seed.

## Execution evidence

| Date (UTC) | Task/Gate | Commit | Command or artifact | Result | Notes |
|---|---|---|---|---|---|
| 2026-11-24 | P6-T1 | uncommitted | `explore` report cross-checked against `src/creatorEngine.ts`, `src/core/graph/types.ts`, `src/application/creatorGraphCommands.ts` | pass | Child ids are engine-minted; portal command routes; Guild Hall already advances the quest step; `activateSubject` starts a session |
| 2026-11-24 | P6-T2 | uncommitted | `npx vitest run tests/creatorSeeds.test.ts` | pass | 3 subjects, progression per subject, session closed, portals +3, re-run no-op, no resurrection after deletion, partial failure reports |
| 2026-11-24 | P6-T3/T4 | uncommitted | `tests/creatorProjection.test.ts`, `tests/creatorGraph.test.ts`, `visuals/p6/2026-11-24-g6-01…09` | pass | Depth-first tree, tags normalized, cross-link, reparent, cascade preview matches `removedRoomIds`, typed refusals, rejected write keeps state |
| 2026-11-24 | P6-T5 | uncommitted | `tests/creatorCampaign.test.ts`; `g6-09-street-portal.png`; `g6-13-keyboard-enter.png` | pass | Created subject entered, cleared, reloaded; portal drawn from `villageStructures()`; demo subjects are ordinary portals |
| 2026-11-24 | P6-T6 | uncommitted | `npm --prefix examples/side-scroller test` | pass | 26 files / 153 tests (baseline 22 / 135) |
| 2026-11-24 | P6-T7 | uncommitted | `--creator` capture (normal, `g6`; reduced motion, `g6rm`) and the keyboard-only segment | pass | Create form, tree, cascade confirmation, tags/edge, street portal, refusal, rejected write, keyboard create → add → enter |
| 2026-11-24 | G6 | uncommitted (base `46e28b3`) | Root: `npm test`, `npm run typecheck`, `npm run build`; example: `npm test`, `npm run typecheck`, `npm run build`; `npx vitest list --config vitest.config.ts`; `git status --short src` | pass | Engine 13 / 280 unchanged; example 26 / 153; isolation probe 0 `examples/` paths; `src` diff empty; visuals under `visuals/p6/` |
