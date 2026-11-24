# P6 — Creator and Demo Campaign

| Field | Value |
|---|---|
| Phase | P6 |
| Parent | [Implementation plan](README.md) |
| Depends on | [P1](phase-1-dungeon-level.md), [P3](phase-3-surface-village.md) |
| Blocks | [P7](phase-7-village.md), [P8](phase-8-journal.md) |
| Requirements | R-17, R-22 |
| Exit gate | [G6](#exit-gate-g6) |
| Status | Not started |

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
import type { EngineState, GraphCommand, KnowledgeDungeonEngine } from '@/index';

export interface DemoSubjectSeed {
  dungeonId: string;
  subjectName: string;
  rootRoomId: string;
  rootTopic: string;
  children: { roomId: string; topic: string; tags?: string[] }[];
  crossLinks?: { fromRoomId: string; toRoomId: string }[];
}

export interface SeedResult {
  seeded: string[];
  alreadyPresent: string[];
  skipped: boolean;
}

/** Idempotent; no-op when every id already exists. */
export async function seedDemoSubjects(
  engine: KnowledgeDungeonEngine,
  seeds: readonly DemoSubjectSeed[],
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
  activeSubjectId: string | null;
  rooms: CreatorRoomView[];
  edges: { fromRoomId: string; toRoomId: string; relationType: string }[];
}

/** Pure projection; no commands. */
export function projectCreator(state: EngineState, subjectId: string | null): CreatorView;
```

`main.ts` owns the commands. The Creator panel owns drafts and focus only.

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

- [ ] Explore task reports the exact `RootDungeonInitInput` fields, `GraphDomainResult`
      shape, each graph payload, and the outcome fields for removals and reparenting.
- [ ] Confirm `createSubject` and `activateSubject` both start a study session; record the
      required cleanup (`returnToVillage()` when entering Creator from the street).
- [ ] Confirm `dispatchGraph` operates on the **active** subject only.
- [ ] Record every type-only import as a K-14 candidate; do not edit `src/index.ts`.

### P6-T2 — Seed module

- [ ] `src/creator/seeds.ts` holds the three `DemoSubjectSeed` values and
      `seedDemoSubjects`.
- [ ] For each absent id: `createSubject(...)`, then `dispatchGraph` children, tags, and
      cross-links on that subject, then `returnToVillage()`.
- [ ] Existing ids are skipped without any command; a partial failure leaves earlier
      subjects valid and reports which seeds succeeded.
- [ ] A host-owned first-run flag prevents re-seeding after the player deletes a demo
      subject. If the flag is lost but the ids exist, the module still skips.
- [ ] Never seed when `state.subjects` already contains a non-demo subject and the flag is
      unset; the first-run path is the only seed path.
- [ ] Record seed sessions as expected engine state; do not hand-write progression.

### P6-T3 — Creator entry and subject list

- [ ] The Guild Hall facade opens the Creator list (P7 later gives it a full interior; for
      P6 the facade opens a DOM overlay directly).
- [ ] The list shows every subject with room/cleared counts and a "Create subject" form
      (name, root topic, optional biome).
- [ ] Creating a subject validates the name, mints stable ids, calls `createSubject`, then
      returns to the street with the new subject activated. The new portal appears from
      `villageStructures()`; no host portal list is added.
- [ ] Entering a subject from the list calls `activateSubject` and routes to the dungeon
      through the existing P3 flow.
- [ ] Empty, duplicate, and invalid ids are surfaced as visible refusals.

### P6-T4 — Room graph editor

- [ ] Show the room tree in graph order, with the root marked and depth indentation.
- [ ] Add child rooms (one or many topics, blank topics dropped).
- [ ] Reparent a room; remove a room with a confirmation that names the cascade count.
- [ ] Add/remove tags and add cross-links between two rooms.
- [ ] After each mutation, re-render from the state subscription; never mutate the local
      view model as if it were committed.
- [ ] Render typed `GraphDomainError` codes and messages verbatim; a rejected promise is
      "Not saved" and leaves the previous tree intact.
- [ ] Disable controls while a mutation is pending; one in-flight graph command at a time.
- [ ] Keyboard-only operation for every control; focus stays in the overlay and returns
      to `#game` on close.

### P6-T5 — Campaign surface

- [ ] Seeded subjects appear as extra portals in the street and in the surface HUD.
- [ ] Each portal enters its own dungeon; the existing structural key rebuilds the level
      when the subject changes.
- [ ] A demo subject with no cleared rooms shows the normal empty-state HUD.
- [ ] Do not special-case the tutorial in routing; it remains the first subject.
- [ ] Record the demo subject names in `VISUALS.md` as synthetic content, not learner data.

### P6-T6 — Tests

- [ ] Seed tests with `MemoryEngineStorage`: three subjects created, progression records
      exist, session closed, portal count grows by three.
- [ ] Re-running the seed is a no-op; deleting one demo subject with the first-run flag set
      does not recreate it.
- [ ] Graph command tests: add children, reparent, remove cascade, tag set/add/remove,
      cross-link duplicate refusal.
- [ ] Creator projection tests from an `EngineState` fixture (tree order, edges, counts).
- [ ] Failing-storage create/mutation leaves the previous state; a refused graph command
      shows its code and does not change the tree.
- [ ] No host test asserts engine counts; the engine suite stays at its baseline.

### P6-T7 — Manual proof and visuals

- [ ] Fresh save: three demo portals + Training Grounds; enter each and return.
- [ ] Create a fourth subject, add three rooms, tag one, cross-link two, enter it, clear a
      room, reload, and confirm the graph and portal survive.
- [ ] Remove a room with descendants and confirm the cascade count.
- [ ] Keyboard-only run through create → add rooms → enter → return.
- [ ] Capture frames for: subject list, create form, tree with tags/edge, cascade
      confirmation, new portal on the street, refusal, and save failure.

## Exit gate G6

- [ ] The Creator can create a subject, add/reparent/remove rooms, tag, and cross-link.
- [ ] Every mutation reports typed refusals and rejected writes distinctly.
- [ ] Three demo subjects seed idempotently on a first run and never resurrect after
      deletion.
- [ ] New subjects appear as portals from engine data with no host hard-coding.
- [ ] A created subject can be entered, cleared, and reloaded.
- [ ] Keyboard and reduced-motion passes recorded.
- [ ] Root and example suites, typechecks, and builds green; engine count unchanged.
- [ ] No engine source diff.
- [ ] G6 entry written in [EVIDENCE.md](EVIDENCE.md), with visuals under `visuals/p6/`.

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

## Rollback

Delete `src/creator/`, `src/ui/creatorPanel.ts`, the Guild Hall Creator overlay, and the
seed call in boot. Seeded subjects are ordinary engine state and remain valid; the earlier
host simply shows more portals. Remove the first-run seed flag if it should re-seed.

## Execution evidence

| Date (UTC) | Task/Gate | Commit | Command or artifact | Result | Notes |
|---|---|---|---|---|---|
| | | | | | |
