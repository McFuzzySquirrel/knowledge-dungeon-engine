# P1 — Dungeon Level and Movement

| Field | Value |
|---|---|
| Phase | P1 |
| Parent | [Implementation plan](README.md) |
| Depends on | [P0](phase-0-scaffold.md) (G0) |
| Blocks | [P2](phase-2-note-loop.md) |
| Requirements | R-02, R-03, R-04, R-08, R-13, R-14 |
| Exit gate | [G1](#exit-gate-g1) |
| Status | Not started |

## Objective

Turn the engine's generated dungeon map into a side-view level, render it, and let the
player traverse it with host-owned gravity, jumping, ladders, and collision. Entering a
room records exactly one study visit.

This is the phase where the product idea is validated or rejected. If the generated map
cannot be made traversable, stop at G1 and record the failure rather than adding
private level overrides that hide it.

## Non-goals

- Note editing, XP HUD, or artifact display (P2).
- Surface street (P3).
- Using `dungeonNavigation.move`; the side-scroller does not use the engine's movement
  controller ([host guide §Screen and Flow](../../host-ui-guide.md#screen-and-flow-design)).
- Changing `generateDungeonMap` or its output.

## Inputs and references

| What | Where |
|---|---|
| Map generator | [`src/core/layout/dungeonGenerator.ts`](../../../src/core/layout/dungeonGenerator.ts) `generateDungeonMap` |
| Map shape | same file: `DungeonMap`, `DungeonRoom`, `DungeonCorridor`, `DungeonCorridorSegment`, `DungeonWalkable` |
| Walkable mask | same file: `DungeonWalkable` exposes `width`/`height`, `offsetX`/`offsetY`, and a row-major `Uint8Array` where `1` means walkable; confirm corridor-door coordinate semantics in P1-T1 |
| Layout constants | same file: `ROOM_WIDTH = 6`, `ROOM_HEIGHT = 5`, `ROOM_SPACING = 4`, `TILE_SIZE = 24` |
| Room placement | same file `generateDungeonMap` room projection (`gridX`, `gridY`) |
| Corridor segments | same file `DungeonCorridor.segments`, `elbow`, `pathTiles` |
| Tutorial fixture | [`src/data/tutorialSubject.ts`](../../../src/data/tutorialSubject.ts) (`createTutorialSubject`, `TUTORIAL_SUBJECT_ID`) |
| Export namespaces | [`src/index.ts`](../../../src/index.ts) (`dungeon`, `tutorial`) |
| Visit command | [`src/creatorEngine.ts`](../../../src/creatorEngine.ts) `recordRoomVisit` |
| Session rules | [host guide §Study Sessions](../../host-ui-guide.md#study-sessions) |
| Frame-loop rules | [host guide §Frame Loop](../../host-ui-guide.md#frame-loop-and-timing) |

## Frozen interfaces

Freeze before parallel work. Confirm the `DungeonWalkable` indexing in the explore task
before implementing.

```ts
// src/level/model.ts
export interface Rect { x: number; y: number; w: number; h: number }

export interface LevelRoom {
  roomId: string;
  topic: string;
  status: string;
  rect: Rect;          // world pixels
  isRoot: boolean;
}

export interface LevelModel {
  subjectId: string;
  tileSize: number;     // engine tile size × render scale
  bounds: Rect;         // world pixels
  spawn: { x: number; y: number };
  solids: Rect[];       // merged solid tile runs
  ladders: Rect[];      // vertical corridor segments
  rooms: LevelRoom[];
  surfaceY: number | null; // reserved for P3
}

export function buildDungeonLevel(subject: SubjectSnapshot, scale?: number): LevelModel;
```

```ts
// src/physics.ts
export interface Body { x: number; y: number; w: number; h: number; vx: number; vy: number; onGround: boolean; onLadder: boolean }
export interface MoveIntent { left: boolean; right: boolean; up: boolean; down: boolean; jump: boolean }
export function stepBody(body: Body, intent: MoveIntent, level: LevelModel, deltaMs: number): Body;
```

## Work breakdown

### P1-T1 — Confirm map data semantics

- [ ] Explore task reports the exact `DungeonWalkable` field layout and indexing, the
      meaning of `DungeonCorridor.segments` versus `pathTiles`, and whether door tiles are
      included in room footprints.
- [ ] Record the findings in this document before coding. Do not assume an indexing that
      the source does not state.

### P1-T2 — Level derivation

- [ ] Implement `buildDungeonLevel(subject, scale = 3)`:
      - [ ] Call `generateDungeonMap(subject.dungeon)`.
      - [ ] Convert room rects to world pixels: `gridX * engineTile * scale`, etc.
      - [ ] Convert the walkable mask to solid rectangles: a tile is solid when not
            walkable; merge horizontal runs per row to keep the render and collision sets
            small.
      - [ ] Add a solid floor along the bottom world bound so the player cannot fall out
            of the level.
      - [ ] Convert vertical corridor segments into ladder rectangles.
      - [ ] Spawn the player inside the root room, above its floor, clear of walls.
      - [ ] Set `surfaceY` to `null` in P1; P3 fills it.
- [ ] Exclude no rooms: the whole connected map is visible in P1. Do not use
      `computeFloorVisibility`; it slices the dungeon into floors and fights a continuous
      side view.
- [ ] Unit tests with the tutorial fixture:
      - [ ] Three rooms are present with stable ids (`tut-note`, `tut-tools`, `tut-map`).
      - [ ] Every room rect lies inside bounds.
      - [ ] Solids do not cover any room interior.
      - [ ] Spawn is not inside a solid and is above the root floor.
      - [ ] Every vertical corridor produces at least one ladder rect.

### P1-T3 — Physics

- [ ] Fixed timestep: accumulate real time, step at 1/120 s, max 5 substeps per frame.
      Clamp the incoming frame delta to 100 ms before accumulating.
- [ ] Gravity, terminal velocity, horizontal acceleration or constant speed (choose one
      and document it), jump only when `onGround`, and ladder climb when overlapping a
      ladder rect and pressing up/down.
- [ ] Axis-separated AABB resolution: move X, resolve; move Y, resolve. Never resolve both
      axes in one pass.
- [ ] Ladder state disables gravity while climbing and restores it on leaving the rect.
- [ ] Unit tests:
      - [ ] Falling body lands on the root room floor and reports `onGround`.
      - [ ] Jump leaves the ground and returns to it.
      - [ ] A 100 ms step at terminal velocity does not pass through a one-tile floor.
      - [ ] A body centred on a ladder can climb upward and downward.
      - [ ] A body cannot enter a solid from either side.

### P1-T4 — Renderer and camera

- [ ] Canvas 2D draws, in order: background depth slabs, room chambers with topic labels,
      corridor tunnels, ladders, solids, player.
- [ ] Camera follows the player with smoothing, clamped to `level.bounds`, and accounts for
      device pixel ratio.
- [ ] Placeholder art only: rectangles, lines, and text. No image assets
      (assumption S-02).
- [ ] Draw room status from the engine snapshot (created/cleared) without colour-only
      encoding; pair with a label or shape.
- [ ] A minimap is out of scope for P1; note it as a later option.

### P1-T5 — Input and room visits

- [ ] Keyboard mapping: `A`/`←`, `D`/`→`, `W`/`↑`, `S`/`↓`, `Space` jump, `E`
      interact (reserved for P2). Ignore repeat events for jump.
- [ ] Read input into a `MoveIntent`; do not mutate state in event handlers.
- [ ] Detect room entry from the player's centre point against `rooms[].rect`.
- [ ] Maintain `lastRoomId`. On a change to a non-null id, call
      `engine.recordRoomVisit(roomId)`. Await it. If it rejects, surface the error and
      keep `lastRoomId` unchanged so a retry can succeed.
- [ ] Never call `recordRoomVisit` per frame or on every movement into the same room.
- [ ] Reserve the interact key and proximity state for P2, but do not implement the note
      panel.

### P1-T6 — Frame loop

- [ ] One `requestAnimationFrame` loop. Compute `deltaMs`, clamp, step physics, then
      render. Never simulate inside a render callback.
- [ ] Rebuild `LevelModel` only when the subject graph changes, not per frame.
- [ ] Subscribe to engine state once (from P0); pass the latest state to the renderer as a
      read-only view model.
- [ ] Confirm no `snapshot()` call exists in the frame path.

### P1-T7 — Manual traversal proof

- [ ] Start the tutorial and record a short screen capture or step log.
- [ ] Walk from the root room to both child rooms and back.
- [ ] Confirm the study session view shows one visit per entry, and re-entry adds a
      second.
- [ ] Test at a deliberately low frame rate (DevTools CPU throttle) and confirm no
      tunneling.

## Exit gate G1

- [ ] `buildDungeonLevel` tests pass with the tutorial fixture.
- [ ] Physics tests pass, including the tunneling and ladder cases.
- [ ] A manual playthrough reaches all three tutorial rooms without debug teleports.
- [ ] Visit de-duplication is demonstrated in the evidence (entry log or test).
- [ ] Root and example suites, typechecks, and builds are green; engine count unchanged.
- [ ] No engine source diff.
- [ ] G1 entry written in [EVIDENCE.md](EVIDENCE.md).

If any tutorial room cannot be reached, record the map metrics and stop. Do not ship a
private override that hides K-01.

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
| Confirm walkable indexing and corridor segment semantics; report tutorial map bounds and room positions | `explore` | Nothing | `dungeonGenerator.ts`, tutorial fixture | Findings + map metrics | Run before P1-T2 |
| Implement `level/model.ts` and `level/dungeonLevel.ts` with tests | `general` | `src/level/*`, `tests/level.test.ts` | Frozen `LevelModel`, explore findings | Files + test output | Merge before physics integration |
| Implement `physics.ts` with tests | `general` | `src/physics.ts`, `tests/physics.test.ts` | Frozen `Body`/`stepBody` | Files + test output | Can run parallel with level derivation |
| Implement canvas renderer and camera | `general` | `src/render/canvas.ts` | Frozen `LevelModel`, palette rules | Module + screenshot | Main agent wires it in `main.ts` |
| Frame loop, input, and visit de-duplication | Main agent | `src/main.ts` | All modules | Playable dungeon | After modules return |

Guardrails: level and physics agents may not edit `main.ts`; the renderer may not read
engine state directly, only the passed view model.

## Phase-specific risks

- K-01: awkward generated geometry. Instrument: record room count, bounds, and ladder
  count in evidence during the playthrough.
- K-02: cramped corridors. If the player hitbox cannot pass at 3× scale, adjust scale
  before adjusting the map.
- K-03: tunneling. The 100 ms clamp plus 1/120 s substeps is mandatory.
- K-07: visit command throws when no study session is active. Enter through the tutorial
  command only.

## Rollback

Revert the P1 files and return to the P0 debug panel. No engine or storage changes.

## Execution evidence

| Date (UTC) | Task/Gate | Commit | Command or artifact | Result | Notes |
|---|---|---|---|---|---|
| | | | | | |
