# P3 — Surface Village (Side View)

| Field | Value |
|---|---|
| Phase | P3 |
| Parent | [Implementation plan](README.md) |
| Depends on | [P2](phase-2-note-loop.md) (G2) |
| Blocks | [P4](phase-4-fishing.md) |
| Requirements | R-07, R-08, R-09, R-10, R-13, R-14 |
| Exit gate | [G3](#exit-gate-g3) |
| Status | Done — G3 passed 2026-11-23; layout and polish re-runs 2026-11-24 |

## Objective

Place the village on the surface as a side-view street, connect it to the underground
dungeon with a real vertical entrance shaft, and wire portal entry and return flows
through engine commands. The surface uses `VILLAGE_MAP` and `villageStructures()` as
data; it does not use `villageWorld` movement, which is top-down.

## Non-goals

- Creating subjects or editing the graph (Creator UI).
- NPC path simulation, dialogue trees, or quest scripting. Structures are static
  facades in this phase.
- Using `villageWorld.stepVillagePlayer` or NPC wanderers.
- Redesigning the village layout.

## Inputs and references

| What | Where |
|---|---|
| Village map data | [`src/data/villageLayout.ts`](../../../src/data/villageLayout.ts) `VILLAGE_MAP`, `VILLAGE_TILE_SIZE`, `VillageStructure`, `VillageMapDef` |
| Portal slots | same file `getDungeonPortalSlots` |
| Structure list including portals | [`src/creatorEngine.ts`](../../../src/creatorEngine.ts) `villageStructures` |
| Portal/gate commands | same file `interactVillageStructure`, `returnToVillage` |
| Session fields | [`src/session.ts`](../../../src/session.ts) `GameSession`, `StudyPhase`, `QuestStep` |
| Screen mapping | [host guide §Screen and Flow](../../host-ui-guide.md#screen-and-flow-design) |
| Study session rules | [host guide §Study Sessions](../../host-ui-guide.md#study-sessions) |
| Top-down movement model (not used) | [`src/world/village.ts`](../../../src/world/village.ts) |

## Frozen interfaces

```ts
// src/level/model.ts (extension)
export interface CollisionWorld {
  bounds: Rect;
  solids: Rect[];
  ladders: Rect[];
}

// src/level/surfaceLevel.ts
export interface SurfaceInteractable {
  id: string;
  type: string;
  label: string;
  subjectId?: string;
  rect: Rect;         // interaction rect in world pixels
  facade: Rect;       // drawn building rect
  door: { x: number; y: number };
}

export interface SurfaceModel extends CollisionWorld {
  spawn: { x: number; y: number };
  groundY: number;
  interactables: SurfaceInteractable[];
  entrance: { x: number; y: number };  // top of the shaft to the dungeon
}

export function buildSurface(structures: VillageStructure[], map: VillageMapDef): SurfaceModel;
export function placeDungeonBelow(level: LevelModel, surface: SurfaceModel, shaftHeightPx: number): LevelModel;
```

`placeDungeonBelow` translates the dungeon so its highest room sits `shaftHeightPx` below
the surface ground, and returns a level whose bounds include the shaft. The shaft is a
host-authored collision corridor connecting the surface entrance to the dungeon root.

## Presentation mapping (documented, not engine semantics)

The village map is authored top-down. P3 uses it as follows and records this mapping in
the code header:

| Engine field | Side-view use |
|---|---|
| `structure.gridX` | street x intent, spread by 1.6× and pushed right by a minimum 3-tile building gap so facades do not clump |
| `structure.gridY` | depth ordering only (background/foreground draw order), not vertical position |
| `structure.width` | facade width (`width × tileSize`) |
| `structure.height` | facade height (`height × tileSize`), clamped to a documented range |
| `structure.label` | facade sign and interaction prompt |
| `VILLAGE_MAP.playerStart.x` | fallback spawn x; the Training Grounds door is used when present |
| `VILLAGE_MAP.entranceTile.x` | fallback entrance/shaft x; the Training Grounds door is used when present |
| `VILLAGE_MAP.playerStart.y`, `entranceTile.y` | unused in side view; record the choice |

If the result reads poorly, adjust presentation constants in `surfaceLevel.ts`; do not
mutate `VILLAGE_MAP`.

## Work breakdown

### P3-T1 — Surface level

- [x] `buildSurface` derives a single ground strip, facade rectangles, doors, and
      interaction rects from the engine-provided structure list.
- [x] Draw order uses `gridY` as depth; collision does not.
- [x] Solid set contains the street ground and invisible world-edge walls. Facades are
      background presentation only, so the player can walk past every building.
      *(Amended 2026-11-24 after playtest: solid building bodies trapped the spawn inside
      the Training Grounds doorway.)*
- [x] Spawn is on the ground in front of the Training Grounds door (or near
      `playerStart.x` when no gate exists), clear of solids.
- [x] Buildings are laid out with a 3-tile minimum gap and 1.6× horizontal spread.
      *(Amended 2026-11-24 after playtest: raw `gridX` clumped facades together.)*
- [x] Structures with no label (signposts with `label: ''`) render as scenery only and
      are not interactable.
- [x] Unit tests with a fixed structure fixture:
      - [x] Every structure produces exactly one facade.
      - [x] Interaction rects lie within the surface bounds.
      - [x] Spawn is not inside a solid.
      - [x] A portal structure keeps its `subjectId` and `label`.
      - [x] Facades do not collide and buildings keep a real gap.

### P3-T2 — Dungeon placement below the surface

- [x] `placeDungeonBelow` translates the P1 `LevelModel` with a chosen offset and
      extends bounds to include the shaft.
- [x] The shaft is a ladder or climbable corridor from the surface entrance to the
      dungeon root, represented as ladders (P1 physics already supports them).
- [x] The world uses one coordinate space: camera, collision, and rendering share it.
- [x] Test: after placement, the dungeon's highest solid is below `surface.groundY` and
      the shaft connects the entrance to the root room without a gap.
- [x] Test: the translated root spawn is still clear of solids.

### P3-T3 — Routing

- [x] Boot router selects: `world === 'village'` → surface, `'dungeon'` → dungeon for
      `activeSubjectId`, `'fishing'` → P4 scene (placeholder until P4).
- [x] `activeSubjectId === null` with `world === 'village'` is valid; do not infer the
      screen from `activeSubjectId` alone.
- [x] On entering the dungeon (state transitions to `dungeon`), rebuild the dungeon level
      for the active subject and place the player at the dungeon spawn. If the player
      walked down the shaft, place them at the shaft bottom instead.
- [x] On returning to the village, rebuild the surface and place the player at the
      entrance.
- [x] Tests: route projection from `EngineState` fixtures for village, dungeon, and
      fishing (placeholder).

### P3-T4 — Interactions

- [x] Nearest interactable in range shows a prompt: label plus `E`.
- [x] Portal (`type === 'portal-icon'`) → `engine.interactVillageStructure(id)` then route
      to the dungeon. Handle rejection visibly.
- [x] Training gate (`type === 'training-gate'`) → same command; this creates or reuses
      the tutorial subject ([`creatorEngine.ts`](../../../src/creatorEngine.ts)).
- [x] Guild hall and other interactive types → call the command and render the returned
      structure; do not invent quest state.
- [x] Return: entering the village gate/exit zone calls `engine.returnToVillage()`. This
      ends the study session; do not call `endStudySession` separately.
- [x] Disable interaction while a command is pending.

### P3-T5 — Surface presentation

- [x] Facades are placeholder rectangles with signs and doorways; no assets.
- [x] Show portal room and cleared counts from the structure fields when present.
- [x] Depth-sort by `gridY` so overlapping facades read correctly.
- [x] Camera clamps to surface bounds.
- [x] Announce the nearest interactable through the P2 live region when it changes.

### P3-T6 — Recovery and failure

- [x] If boot finds `world === 'dungeon'`, apply the documented recovery from P0-T5 and
      route to the resulting model.
- [x] If boot finds `world === 'fishing'`, defer to P4; until then, call
      `returnToVillage()` behind a visible "session could not be resumed" notice.
- [x] Reuse the P2 failing-storage harness for a portal entry failure and a return
      failure.

### P3-T7 — Manual proof

- [x] Walk the surface, enter the training gate, clear a room, return to the village.
- [x] Enter a second subject portal (create a subject with the engine directly in a dev
      console or fixture if no Creator UI exists) and confirm the dungeon matches.
- [x] Reload on the surface and in the dungeon; confirm the correct screen and preserved
      progress.
- [x] Keyboard-only run through the surface, portal, dungeon, and return.

## Exit gate G3

- [x] Surface and dungeon share one continuous world below the street.
- [x] Structures and portals come from `villageStructures()`, with no hard-coded subject
      list in the host.
- [x] Portal entry and return work through engine commands; study session starts and ends
      as documented.
- [x] Surface placement and routing tests pass.
- [x] Reload restores the correct screen.
- [x] Root and example suites, typechecks, and builds are green; engine count unchanged.
- [x] No engine source diff.
- [x] G3 entry written in [EVIDENCE.md](EVIDENCE.md).

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
| Confirm structure/portal fields, `interactVillageStructure` transitions, and `returnToVillage` session effects | `explore` | Nothing | `villageLayout.ts`, `creatorEngine.ts`, `session.ts` | Findings + line references | Run first |
| Implement `surfaceLevel.ts` and layout tests | `general` | `src/level/surfaceLevel.ts`, `tests/surfaceLevel.test.ts` | Frozen `SurfaceModel` | Module + tests | Before routing |
| Implement dungeon placement/shaft and tests | `general` | `src/level/placement.ts`, `tests/placement.test.ts` | P1 `LevelModel` | Module + tests | Parallel with surface |
| Implement routing projection and tests | `general` | `src/routing.ts`, `tests/routing.test.ts` | `EngineState` fixtures | Module + tests | After explore |
| Wire interactions, transitions, and recovery | Main agent | `src/main.ts`, `src/ui/prompts.ts` | All modules | Playable surface | Final integration |

Guardrails: neither layout agent edits `main.ts`; no agent edits `VILLAGE_MAP`; routing
does not call engine commands, only projects state.

## Phase-specific risks

- K-10: top-down data in a side view. The mapping table is the mitigation; document any
  deviation.
- K-07: portal entry rejection when no study session can start. Show the refusal and
  keep the player on the surface.
- K-11: reload routing. Test both worlds.
- K-12: reload during fishing is deferred to P4.

## Rollback

Revert P3 files and route directly to the P2 dungeon on boot. The example remains a
playable dungeon loop without a surface.

## Plan amendments during execution

| Date | Change | Reason |
|---|---|---|
| 2026-11-23 | `SurfaceModel` gained `tileSize`, `facades`, and `exitZone`; `SurfaceFacade` and `SurfaceInteractable` carry `depth` plus the engine portal counts | Scenery-only facades must render without becoming interactable, `gridY` must drive depth sorting, and the village gate must be a real return zone |
| 2026-11-23 | `placeDungeonBelow` also aligns the dungeon's top ladder column to `surface.entrance.x` and carves the shaft opening through the street ground and the rock above the top room | One coordinate space and a continuous, climbable shaft; `VILLAGE_MAP` is unchanged |
| 2026-11-23 | Surface coordinates use the placed dungeon's `tileSize` (72 px), passed as a copy of `VILLAGE_MAP`; the raw `VILLAGE_TILE_SIZE` is untouched | Prevents a body-size and shaft-misalignment change between the street and the dungeon |
| 2026-11-23 | Added `src/routing.ts` (`projectRoute`) and `projectSurface`; `Hud` split into `updateDungeon` and `updateSurface` | Routing and surface presentation are pure and testable from `EngineState` fixtures; the frame loop never calls `snapshot()` |
| 2026-11-23 | `shaftBottomSpawn` exists and is tested, but normal portal entry uses `placed.spawn` | A village world has no active subject, so walking down the entrance shaft is not a world transition in P3; the helper keeps the physical-descent path available without a second level model |
| 2026-11-23 | Capture script gained `--surface` (frames 01–06) | D-09 requires a dated visual record for G3 |
| 2026-11-23 | `#game:focus-visible` outline added | The canvas is the primary keyboard target; the check now shows a 3 px accent outline |
| 2026-11-24 | Facades no longer contribute collision; the street ground and invisible world-edge walls are the only solids | Playtest: solid building bodies plus a door gap trapped the spawn inside the Training Grounds footprint |
| 2026-11-24 | Buildings are spread 1.6× from `gridX` with a 3-tile minimum gap; scenery stays near its spread x; spawn and entrance follow the Training Grounds door | Playtest: raw `gridX` clumped facades; spacing the gate also moved the shaft, so both now derive from the placed door |
| 2026-11-24 | Return zone unions the decorative gate with the shaft top | The gate rect and the shaft can drift apart after spacing; a return must always work at the shaft |
| 2026-11-24 | Decorative gate drawn as low posts and a threshold instead of a full beam | The wide beam visually joined neighbouring buildings |
| 2026-11-24 | Surface polish: deterministic skyline and moon, facade window lights, contact shadows, door frames and steps, a street gradient/paving seams, and a shaft chevron | The corrected street was readable but flat; the polish adds depth and makes the entrance shaft cue clearer |
| 2026-11-24 | Portal signs may extend into the building gap; sign font shrinks before truncating | A two-tile portal facade truncated “First Dungeon (Tutorial)”; the 3-tile building gap leaves room for the full name |
| 2026-11-24 | Surface HUD drops redundant type repeats and adds a direction suffix to repeated labels; leaving a door announces “No door in reach.” | Three “Fishing Pond” rows were ambiguous and “Library — Library” wasted space; the live region previously stayed on the last door after leaving |

### Visual review (K-10)

The original raw-grid layout overlapped the first subject portal (`gridX: 3`) with the
Training Grounds facade (`gridX: 4`). The 2026-11-24 spacing pass removes that overlap:
buildings keep `gridX` order but receive a 1.6× spread and a 3-tile minimum gap, so the
portal occupies its own gap. The old 2026-11-23 frames remain in the record; the
2026-11-24 frames show the corrected street.

## Manual checks

- **Keyboard-only path (WebDriver, headless Firefox, 2026-11-23).** Boot focus is the
  Progress heading. `Shift+Tab` reaches the canvas with `:focus-visible` true and a
  `solid 3px` outline; `Tab` moves to `Clear saved state` and `Shift+Tab` returns.
  Real key events then entered the Training Grounds, opened the composer (`#note-text`),
  `Tab` → `#note-confirmed`, `Space`, `Tab` → `#note-submit`, `Enter`, and `Escape`.
  Focus returned to `#game`; the live region reported `Room cleared. 28 XP gained.`
  Climbing with real `W` returned through the shaft in one hold; the live region changed
  to the street and announced the Training Grounds proximity prompt.
- **Street movement (2026-11-24).** From the spawn in front of the Training Grounds door,
  real `D` and `A` holds walked right to the Fishing Pond and left to the world edge.
  The player stayed on screen, the camera clamped, and returning to the gate and pressing
  `E` entered the dungeon. No facade blocked movement.
- **Surface readability (2026-11-24).** The polish capture shows the skyline, moon,
  lit windows, contact shadows, paving seams, and the shaft chevron. The portal sign
  carries the full subject name after walking into view, and the HUD reads
  `Fishing Pond (north-west)`, `Fishing Pond (south-west)`, and `Fishing Pond (east)`
  instead of three identical rows. Leaving a door announces “No door in reach.”
- **Reduced motion.** A session opened with `ui.prefersReducedMotion=1` reports
  `matchMedia` true, still enters the dungeon, and keeps the room visit count at 1.
- **Reload.** Reload on the street restores `world=village`, one subject portal, and the
  cleared count; reload in the dungeon follows P0-T5 recovery and restores
  `world=dungeon`, three rooms, and the active session.
- **Frame loop.** `snapshot()` appears only in `src/engine.ts` at boot; the frame
  callback reads the subscribed state and the pure projections. No `innerHTML` in the
  example.

## Execution evidence

| Date (UTC) | Task/Gate | Commit | Command or artifact | Result | Notes |
|---|---|---|---|---|---|
| 2026-11-23 | P3-T1 — surface level | uncommitted (base `fd8c171`) | `tests/surfaceLevel.test.ts`; frames [`01-street`](visuals/p3/2026-11-23-g3-01-street.png), [`04-returned`](visuals/p3/2026-11-23-g3-04-returned.png) | pass | One facade per structure; labelled-only interactions; spawn clear of solids; portal `subjectId` and counts preserved; scenery-only unlabelled tree |
| 2026-11-23 | P3-T2 — placement and shaft | uncommitted | `tests/placement.test.ts`; frame [`02-dungeon-entry`](visuals/p3/2026-11-23-g3-02-dungeon-entry.png) | pass | Highest room is exactly 4 tiles below the street; dungeon ceiling stays below `groundY`; shaft ladder is continuous to the top room; root spawn is clear |
| 2026-11-23 | P3-T3 — routing | uncommitted | `tests/routing.test.ts`, `tests/surfaceProjection.test.ts` | pass | Village, dungeon, invalid dungeon, and fishing fixtures; `activeSubjectId` alone never selects the screen; portal list comes from `engine.villageStructures()` |
| 2026-11-23 | P3-T4 — interactions | uncommitted | `tests/portalFlow.test.ts`; frames `02`, `04` | pass | Training gate starts the tutorial and a study session; return ends it; subject portal enters the existing dungeon; pending commands disable the prompt |
| 2026-11-23 | P3-T5 — surface presentation | uncommitted | frames [`01`](visuals/p3/2026-11-23-g3-01-street.png), [`04`](visuals/p3/2026-11-23-g3-04-returned.png), [`05`](visuals/p3/2026-11-23-g3-05-reload-surface.png) | pass | Depth-sorted placeholders and signs; portal counts as text; camera clamped to bounds; nearest facade announced; canvas focus outline visible |
| 2026-11-23 | P3-T6 — recovery and failure | uncommitted | `tests/portalFlow.test.ts` (failing-storage cases), `tests/routing.test.ts` | pass | Failed portal save stays on the street; failed return keeps the session open and retries; fishing boot notice deferred to P4 |
| 2026-11-23 | P3-T7 — manual proof | uncommitted | keyboard probe; frames [`01`–`06`](visuals/p3/) | pass | Keyboard-only enter/clear/climb/return; reload on both screens; reduced motion true |
| 2026-11-23 | G3 | uncommitted (base `fd8c171`) | example 14 files / 79 tests; root 13 / 280; both typechecks and builds; isolation 0 `examples/` paths | pass | A-07, A-08, E-02, E-03, E-08, E-10, E-11 verified; no `src/` diff; portal entry/return and surface/dungeon reload verified; visuals in `visuals/p3/` |
| 2026-11-24 | P3 playtest fix — spacing and movement | uncommitted (base `b44f24a`) | `tests/surfaceLevel.test.ts`; frames [`01-street`](visuals/p3/2026-11-24-g3-01-street.png), [`04-returned`](visuals/p3/2026-11-24-g3-04-returned.png) | pass | Facades no longer collide; buildings keep a 3-tile gap; spawn is centred on the Training Grounds door; real-key walk left/right and gate entry verified; shaft return green |
| 2026-11-24 | G3 re-run | uncommitted (base `b44f24a`) | example 14 files / 84 tests; root 13 / 280; both typechecks and builds; isolation 0 `examples/` paths | pass | A-07 and A-08 rechecked on the corrected street; new visuals `2026-11-24-g3`; old `2026-11-23-g3` frames retained |
| 2026-11-24 | P3 polish — street atmosphere and HUD | uncommitted (base `1ef03cf`) | `tests/surfaceProjection.test.ts`; frames [`01-street`](visuals/p3/2026-11-24-g3p-01-street.png), [`04-returned`](visuals/p3/2026-11-24-g3p-04-returned.png) | pass | Skyline, moon, window lights, shadows, paving, shaft chevron; full portal name; HUD dedupe and pond locations; `No door in reach.` announcement |
| 2026-11-24 | G3 polish re-run | uncommitted (base `1ef03cf`) | example 14 files / 85 tests; root 13 / 280; both typechecks and builds; isolation 0 `examples/` paths | pass | A-07 and A-08 rechecked; new visuals `2026-11-24-g3p`; earlier visual sets retained |
