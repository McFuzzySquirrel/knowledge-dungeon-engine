# P1 — Dungeon Level and Movement

| Field | Value |
|---|---|
| Phase | P1 |
| Parent | [Implementation plan](README.md) |
| Depends on | [P0](phase-0-scaffold.md) (G0) |
| Blocks | [P2](phase-2-note-loop.md) |
| Requirements | R-02, R-03, R-04, R-08, R-13, R-14 |
| Exit gate | [G1](#exit-gate-g1) |
| Visuals | [VISUALS.md §P1](VISUALS.md#p1--dungeon-level-and-movement) |
| Status | Done — G1 passed 2026-11-23 |

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

- [x] Explore task reports the exact `DungeonWalkable` field layout and indexing, the
      meaning of `DungeonCorridor.segments` versus `pathTiles`, and whether door tiles are
      included in room footprints.
- [x] Record the findings in this document before coding. Do not assume an indexing that
      the source does not state.

**Findings (2026-11-23, source-backed).**

- `DungeonWalkable` is `{ width, height, offsetX, offsetY, data: Uint8Array }` in
  [dungeonGenerator.ts](../../../src/core/layout/dungeonGenerator.ts). `data` is row-major
  with `index = (tileY - offsetY) * width + (tileX - offsetX)`; `1` means walkable,
  `0` solid. `bounds` is half-open at `maxX`/`maxY`, and `width = maxX - minX`.
- `DungeonCorridor.segments` are absolute tile coordinates, already min/max normalised,
  with `orientation: 'h' | 'v'`. `pathTiles` is the ordered run between the two door
  *outsides*, excludes both door tiles, and repeats the elbow tile on an L-bend.
  `elbow` is the bend tile or `null`.
- Door tiles sit on the room perimeter and are part of the room footprint: the mask marks
  the full `width × height` room rect first, then doors and path tiles. Corridors can
  overlap rooms in cross-link layouts (there is no containment guard), so rendering and
  ladder derivation use the mask rather than "corridors are between rooms".
- Room `gridX`/`gridY`, door coordinates, segment endpoints, and `pathTiles` are all
  **tiles**. Pixels are host-side: `tile * map.tileSize` (engine tile 24 px).
- Tutorial metrics (`generateDungeonMap(createTutorialSubject().dungeon)`): rooms
  `tut-note` at (0, 0), `tut-tools` at (0, 9), `tut-map` at (0, −9), each 6×5 tiles.
  `bounds` tiles `{ minX: -2, maxX: 8, minY: -11, maxY: 16 }`; walkable 10×27; two
  corridors, both **vertical** at column x = 3 (rows 5…8 and −4…−1), no elbows.
  Consequence: the tutorial is a vertical stack in side view, so both links are ladder
  shafts and the horizontal-tunnel-jump case is implemented but not exercised by the
  tutorial.
- `recordRoomVisit(roomId): Promise<void>` rejects `Room not found in active subject`
  (no active subject or the room is not a key of `subject.rooms`) and then
  `No active study session`. It does not update room state. `recordStudyActivity`
  stores `roomsVisited` as a **per-session set**, so a re-entry commits a second command
  but does not add a second unique room id. The host therefore enforces one command per
  entry (`level/visits.ts`); the engine's aggregate list stays a set. This is an engine
  rule, not a defect, and R-13 forbids changing it.

### P1-T2 — Level derivation

- [x] Implement `buildDungeonLevel(subject, scale = 3)`:
      - [x] Call `generateDungeonMap(subject.dungeon)`.
      - [x] Convert room rects to world pixels: `gridX * engineTile * scale`, etc.
      - [x] Convert the walkable mask to solid rectangles: a tile is solid when not
            walkable; merge horizontal runs per row to keep the render and collision sets
            small.
      - [x] Add a solid floor along the bottom world bound so the player cannot fall out
            of the level.
      - [x] Convert vertical corridor segments into ladder rectangles.
      - [x] Spawn the player inside the root room, above its floor, clear of walls.
      - [x] Set `surfaceY` to `null` in P1; P3 fills it.
- [x] Exclude no rooms: the whole connected map is visible in P1. Do not use
      `computeFloorVisibility`; it slices the dungeon into floors and fights a continuous
      side view.
- [x] Unit tests with the tutorial fixture:
      - [x] Three rooms are present with stable ids (`tut-note`, `tut-tools`, `tut-map`).
      - [x] Every room rect lies inside bounds.
      - [x] Solids do not cover any room interior.
      - [x] Spawn is not inside a solid and is above the root floor.
      - [x] Every vertical corridor produces at least one ladder rect.

**Implementation notes.** World pixels are normalised so `bounds.x/y` are 0. Ladders are
extended into each endpoint room while the mask stays walkable (cap: one room height) so
a player standing on a room floor can mount them; this is why `ladders[]` is larger than
the raw corridor segment. The bottom safety floor duplicates the padded bottom solid row;
it is harmless in collision and makes the invariant explicit in the model.

### P1-T3 — Physics

- [x] Fixed timestep: step at 1/120 s with at most 5 substeps per frame, after clamping
      the incoming frame delta to 100 ms (see the implementation note on the accumulator).
- [x] Gravity, terminal velocity, horizontal acceleration or constant speed (choose one
      and document it), jump only when `onGround`, and ladder climb when overlapping a
      ladder rect and pressing up/down.
- [x] Axis-separated AABB resolution: move X, resolve; move Y, resolve. Never resolve both
      axes in one pass.
- [x] Ladder state disables gravity while climbing and restores it on leaving the rect.
- [x] Unit tests:
      - [x] Falling body lands on the root room floor and reports `onGround`.
      - [x] Jump leaves the ground and returns to it.
      - [x] A 100 ms step at terminal velocity does not pass through a one-tile floor.
      - [x] A body centred on a ladder can climb upward and downward.
      - [x] A body cannot enter a solid from either side.

**Implementation note (deviation from "accumulate").** `stepBody` receives the frame delta
(clamped to 100 ms by the loop) and subdivides it into at most five substeps of ≤1/120 s.
There is no cross-frame accumulator: under 24 fps the simulation slows down rather than
spending or tunnelling time. This is the safer reading of the same budget for K-03 and is
asserted by the 100 ms terminal-velocity test. Horizontal movement is constant speed
(3.6 tiles/s), not accelerated; jump height is exactly two tiles, the height of every
room doorway above its room floor. Ladder speed is 5 tiles/s.

### P1-T4 — Renderer and camera

- [x] Canvas 2D draws, in order: background depth slabs, room chambers with topic labels,
      corridor tunnels, ladders, solids, player.
- [x] Camera follows the player with smoothing, clamped to `level.bounds`, and accounts for
      device pixel ratio.
- [x] Placeholder art only: rectangles, lines, and text. No image assets
      (assumption S-02).
- [x] Draw room status from the engine snapshot (created/cleared) without colour-only
      encoding; pair with a label or shape.
- [x] A minimap is out of scope for P1; note it as a later option.

**Implementation note.** The draw order is background → carved tunnel void → solids →
room chambers → ladders → room labels → player. Drawing the void first and solids over it
makes the 1-tile corridors implicit (they are the gap between merged solid runs), so no
separate corridor rect list is needed. Room labels are drawn after ladders so rungs never
cross text; the camera frames the player at 60% of the viewport height to keep the room
above visible. `prepareCanvas` owns DPR (capped at 3) and `updateCamera` is covered by
`tests/camera.test.ts`. Minimap remains a later option.

### P1-T5 — Input and room visits

- [x] Keyboard mapping: `A`/`←`, `D`/`→`, `W`/`↑`, `S`/`↓`, `Space` jump, `E`
      interact (reserved for P2). Ignore repeat events for jump.
- [x] Read input into a `MoveIntent`; do not mutate state in event handlers.
- [x] Detect room entry from the player's centre point against `rooms[].rect`.
- [x] Maintain `lastRoomId`. On a change to a non-null id, call
      `engine.recordRoomVisit(roomId)`. Await it. If it rejects, surface the error and
      keep `lastRoomId` unchanged so a retry can succeed.
- [x] Never call `recordRoomVisit` per frame or on every movement into the same room.
- [x] Reserve the interact key and proximity state for P2, but do not implement the note
      panel.

**Implementation note.** The logic lives in `src/level/visits.ts` as a pure tracker:
one command in flight, one per new room, a failed visit retried only after the player
leaves and re-enters, and an entry that completes while the player has already moved on
still records the new room. Jump is edge-triggered on keydown (repeat ignored) and the
queue is cleared every frame; input is ignored while a form control or contenteditable is
focused, ready for P2. `E` announces that interaction is not available yet.

### P1-T6 — Frame loop

- [x] One `requestAnimationFrame` loop. Compute `deltaMs`, clamp, step physics, then
      render. Never simulate inside a render callback.
- [x] Rebuild `LevelModel` only when the subject graph changes, not per frame.
- [x] Subscribe to engine state once (from P0); pass the latest state to the renderer as a
      read-only view model.
- [x] Confirm no `snapshot()` call exists in the frame path.

**Implementation note.** The level key is `subjectId | dungeonId | rootRoomId | room
ids+topics | edges`; room status changes do not rebuild geometry, they flow through the
projection into badges. `snapshot()` is only called inside `openExampleEngine` at boot;
the loop reads cached host state and the precomputed projection. `render/hud.ts` updates
the DOM HUD only from subscription callbacks and room transitions.

### P1-T7 — Manual traversal proof

- [x] Start the tutorial and record a short screen capture or step log.
      Frames: [VISUALS.md §P1](VISUALS.md#p1--dungeon-level-and-movement).
- [x] Walk from the root room to both child rooms and back.
- [x] Confirm the host issues one visit command per entry and a second on re-entry; the
      engine's session view keeps a set (`tests/visits.test.ts` plus the browser log).
- [x] Test at a deliberately low frame rate (DevTools CPU throttle) and confirm no
      tunneling.

**Observed path (headless Firefox 150.0, 2026-11-23).** Start → `tut-note` (visit 1) →
step off the root floor into the shaft, ladder down → `tut-tools` (visit 2) →
climb ≈3.8 s → `tut-map` (visit 3) → descend ≈1.1 s → `tut-note` again → step off
onto the root floor → reload → subject, three rooms, and a fresh study session restored.
The session view lists each room once because the engine stores `roomsVisited` as a set;
the host issues a second `recordRoomVisit` on re-entry, which `tests/visits.test.ts`
asserts at the command-decision level.

## Exit gate G1

- [x] `buildDungeonLevel` tests pass with the tutorial fixture.
- [x] Physics tests pass, including the tunneling and ladder cases.
- [x] A manual playthrough reaches all three tutorial rooms without debug teleports.
- [x] Visit de-duplication is demonstrated in the evidence (entry log or test).
- [x] Root and example suites, typechecks, and builds are green; engine count unchanged.
- [x] No engine source diff.
- [x] G1 entry written in [EVIDENCE.md](EVIDENCE.md).

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

## Plan amendments during execution

| Date | Change | Reason |
|---|---|---|
| 2026-11-23 | `buildDungeonLevel` lives in `src/level/dungeonLevel.ts` and is re-exported from `src/level/model.ts` | Matches the plan's architecture diagram while keeping the frozen types importable from one module |
| 2026-11-23 | Ladders extend into endpoint rooms while the mask stays walkable (cap: one room height) | The raw vertical segment ends at a door tile on the room perimeter; without the extension a player on a room floor could not mount it. The extension uses only public map data |
| 2026-11-23 | No cross-frame physics accumulator; `stepBody` subdivides each clamped delta into at most 5 × 1/120 s steps | Same K-03 guarantee without an unbounded accumulator. Under 24 fps the simulation slows down rather than tunnelling |
| 2026-11-23 | Draw order is background → tunnel void → solids → room shells → ladders → room labels → player | Corridors are the gap left between merged solid runs, so no separate corridor rect list is needed. Labels are drawn after ladders so rungs cannot cross text |
| 2026-11-23 | Added `src/level/visits.ts`, `src/render/canvas.ts`, `src/render/hud.ts`, `tests/camera.test.ts` | The plan lists the renderer and HUD; the visit tracker is the pure test seam for R-04, and the camera test covers P1-T4 |
| 2026-11-23 | `src/ui/prompts.ts` deferred to P2 | P1 only reserves the interact key; there is no note panel or proximity prompt yet |
| 2026-11-23 | Host focus moves from the start button to the Progress heading when the overlay closes | Keyboard activation left focus on a hidden button; the heading is programmatically focusable and the next Tab reaches the save control |
| 2026-11-23 | Screenshots move from host `/tmp` artifacts to the in-repo visual record `visuals/p1/` indexed by [VISUALS.md](VISUALS.md), with a repeatable WebDriver capture script (D-09) | The maintainer asked for a running visual history; the P1 frames are ~30 KiB each and contain placeholder art only. `VISUALS.md` supersedes the P0-era "keep screenshots outside the repo" wording |

## Execution evidence

Append rows only. Duplicate each into [EVIDENCE.md](EVIDENCE.md).

| Date (UTC) | Task/Gate | Commit | Command or artifact | Result | Notes |
|---|---|---|---|---|---|
| 2026-11-23 | P1-T1 | `uncommitted` (base `989acf1`) | `explore` task + source probes | pass | 3 rooms `tut-note` (0,0), `tut-tools` (0,9), `tut-map` (0,−9); bounds tiles `−2…8 × −11…16`; walkable 10×27; 2 vertical corridors at x=3, no elbows; door tiles are room footprint; `roomsVisited` is a per-session set |
| 2026-11-23 | P1-T2 | uncommitted | `npm --prefix examples/side-scroller test -- tests/level.test.ts` | pass | 8 tests: stable ids/topics, 3× scale, rects inside bounds, no solids in room interiors, spawn supported and clear of the shaft, ladders cover every vertical segment, ladders reach endpoint room floors, columns merged |
| 2026-11-23 | P1-T3 | uncommitted | `npm --prefix examples/side-scroller test -- tests/physics.test.ts` | pass | 9 tests: landing/`onGround`, 2-tile jump and return, 100 ms terminal-velocity landing without tunnelling, ladder climb up/down, ladder hold, jump-off, side walls, constant speed/stop, invalid deltas |
| 2026-11-23 | P1-T4 | uncommitted | `npm --prefix examples/side-scroller test -- tests/camera.test.ts`; example typecheck/build | pass | Camera framing 0.6 vertical, bounds clamp, small-world centring, smoothing vs reduced-motion snap, invalid input. Renderer: DPR canvas, parallax, solids/void, chambers, shape+text status, ladders, active-room dashes, labels after ladders |
| 2026-11-23 | P1-T5 | uncommitted | `npm --prefix examples/side-scroller test -- tests/visits.test.ts` | pass | Centre-point detection; exactly one command per entry; second command after leaving and re-entering; failed visit retried only after leaving; pending command not duplicated |
| 2026-11-23 | P1-T6 | uncommitted | `grep -rn "snapshot()" examples/side-scroller/src`; code review of the frame loop | pass | Only `src/engine.ts:38,50` (boot/one-shot). Level rebuild keyed on subject id, dungeon id, root, room ids+topics, edges; statuses flow through projection each commit |
| 2026-11-23 | P1-T7 | uncommitted | Headless Firefox 150.0 via geckodriver against Vite `127.0.0.1:5175`; run log + screenshots [VISUALS.md §P1](VISUALS.md#p1--dungeon-level-and-movement) | pass | Root → tools (ladder descent) → map (3.83 s climb) → root; visited list `[tut-note, tut-tools, tut-map]`; reload restored subject, 3 rooms, and a fresh session (`sessions` 1 → 2) |
| 2026-11-23 | P1-T7 (low FPS) | uncommitted | 55 ms busy loop every 80 ms; measured frames avg 37 ms, max 67 ms; frame 02 under `visuals/p1/` | pass | Fall through the shaft still landed in `tut-tools`; no tunnelling and no visible error. Physics unit test additionally forces a 100 ms terminal-velocity step |
| 2026-11-23 | P1 a11y (R-08) | uncommitted | Headless Firefox with `ui.prefersReducedMotion=1`; frame 06 under `visuals/p1/` | pass | `matchMedia` true; focus order body → Start (Enter) → Progress heading → Clear saved state; `role=status`/`aria-live=polite`/`atomic`; `role=alert` error region; canvas label + describedby; room entry announced as text |
| 2026-11-23 | Visual record (D-09) | uncommitted | `node examples/side-scroller/scripts/capture-dungeon.mjs --out /tmp/opencode/p1-recapture --prefix 2026-11-23-g1 --low-fps --reduced-motion` | pass | Script reproduced six frames, a manifest, and index rows; canonical gate frames and `2026-11-23-g1-manifest.json` under `visuals/p1/` |
| 2026-11-23 | G1 | uncommitted | `npm test`; `npm run typecheck`; `npm run build`; example test/typecheck/build; `npx vitest list`; `git status --short src` | pass | Root 13 files / 280 tests unchanged; typecheck clean; build 327.74 kB ESM / 438.49 kB d.ts; example 7 files / 39 tests, typecheck clean, 79 modules 116.54 kB JS; 0 `examples/` paths; no `src/` diff |
