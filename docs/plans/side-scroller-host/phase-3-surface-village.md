# P3 — Surface Village (Side View)

| Field | Value |
|---|---|
| Phase | P3 |
| Parent | [Implementation plan](README.md) |
| Depends on | [P2](phase-2-note-loop.md) (G2) |
| Blocks | [P4](phase-4-fishing.md) |
| Requirements | R-07, R-08, R-09, R-10, R-13, R-14 |
| Exit gate | [G3](#exit-gate-g3) |
| Status | Not started |

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
| `structure.gridX` | street x position (`gridX × tileSize`) |
| `structure.gridY` | depth ordering only (background/foreground draw order), not vertical position |
| `structure.width` | facade width (`width × tileSize`) |
| `structure.height` | facade height (`height × tileSize`), clamped to a documented range |
| `structure.label` | facade sign and interaction prompt |
| `VILLAGE_MAP.playerStart.x` | surface spawn x |
| `VILLAGE_MAP.entranceTile.x` | surface entrance/shaft x |
| `VILLAGE_MAP.playerStart.y`, `entranceTile.y` | unused in side view; record the choice |

If the result reads poorly, adjust presentation constants in `surfaceLevel.ts`; do not
mutate `VILLAGE_MAP`.

## Work breakdown

### P3-T1 — Surface level

- [ ] `buildSurface` derives a single ground strip, facade rectangles, doors, and
      interaction rects from the engine-provided structure list.
- [ ] Draw order uses `gridY` as depth; collision does not.
- [ ] Solid set includes the ground and building bodies, with a door gap only where the
      player can stand in front of the door.
- [ ] Spawn is on the ground near `playerStart.x`, clear of solids.
- [ ] Structures with no label (signposts with `label: ''`) render as scenery only and
      are not interactable.
- [ ] Unit tests with a fixed structure fixture:
      - [ ] Every structure produces exactly one facade.
      - [ ] Interaction rects lie within the surface bounds.
      - [ ] Spawn is not inside a solid.
      - [ ] A portal structure keeps its `subjectId` and `label`.

### P3-T2 — Dungeon placement below the surface

- [ ] `placeDungeonBelow` translates the P1 `LevelModel` with a chosen offset and
      extends bounds to include the shaft.
- [ ] The shaft is a ladder or climbable corridor from the surface entrance to the
      dungeon root, represented as ladders (P1 physics already supports them).
- [ ] The world uses one coordinate space: camera, collision, and rendering share it.
- [ ] Test: after placement, the dungeon's highest solid is below `surface.groundY` and
      the shaft connects the entrance to the root room without a gap.
- [ ] Test: the translated root spawn is still clear of solids.

### P3-T3 — Routing

- [ ] Boot router selects: `world === 'village'` → surface, `'dungeon'` → dungeon for
      `activeSubjectId`, `'fishing'` → P4 scene (placeholder until P4).
- [ ] `activeSubjectId === null` with `world === 'village'` is valid; do not infer the
      screen from `activeSubjectId` alone.
- [ ] On entering the dungeon (state transitions to `dungeon`), rebuild the dungeon level
      for the active subject and place the player at the dungeon spawn. If the player
      walked down the shaft, place them at the shaft bottom instead.
- [ ] On returning to the village, rebuild the surface and place the player at the
      entrance.
- [ ] Tests: route projection from `EngineState` fixtures for village, dungeon, and
      fishing (placeholder).

### P3-T4 — Interactions

- [ ] Nearest interactable in range shows a prompt: label plus `E`.
- [ ] Portal (`type === 'portal-icon'`) → `engine.interactVillageStructure(id)` then route
      to the dungeon. Handle rejection visibly.
- [ ] Training gate (`type === 'training-gate'`) → same command; this creates or reuses
      the tutorial subject ([`creatorEngine.ts`](../../../src/creatorEngine.ts)).
- [ ] Guild hall and other interactive types → call the command and render the returned
      structure; do not invent quest state.
- [ ] Return: entering the village gate/exit zone calls `engine.returnToVillage()`. This
      ends the study session; do not call `endStudySession` separately.
- [ ] Disable interaction while a command is pending.

### P3-T5 — Surface presentation

- [ ] Facades are placeholder rectangles with signs and doorways; no assets.
- [ ] Show portal room and cleared counts from the structure fields when present.
- [ ] Depth-sort by `gridY` so overlapping facades read correctly.
- [ ] Camera clamps to surface bounds.
- [ ] Announce the nearest interactable through the P2 live region when it changes.

### P3-T6 — Recovery and failure

- [ ] If boot finds `world === 'dungeon'`, apply the documented recovery from P0-T5 and
      route to the resulting model.
- [ ] If boot finds `world === 'fishing'`, defer to P4; until then, call
      `returnToVillage()` behind a visible "session could not be resumed" notice.
- [ ] Reuse the P2 failing-storage harness for a portal entry failure and a return
      failure.

### P3-T7 — Manual proof

- [ ] Walk the surface, enter the training gate, clear a room, return to the village.
- [ ] Enter a second subject portal (create a subject with the engine directly in a dev
      console or fixture if no Creator UI exists) and confirm the dungeon matches.
- [ ] Reload on the surface and in the dungeon; confirm the correct screen and preserved
      progress.
- [ ] Keyboard-only run through the surface, portal, dungeon, and return.

## Exit gate G3

- [ ] Surface and dungeon share one continuous world below the street.
- [ ] Structures and portals come from `villageStructures()`, with no hard-coded subject
      list in the host.
- [ ] Portal entry and return work through engine commands; study session starts and ends
      as documented.
- [ ] Surface placement and routing tests pass.
- [ ] Reload restores the correct screen.
- [ ] Root and example suites, typechecks, and builds are green; engine count unchanged.
- [ ] No engine source diff.
- [ ] G3 entry written in [EVIDENCE.md](EVIDENCE.md).

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

## Execution evidence

| Date (UTC) | Task/Gate | Commit | Command or artifact | Result | Notes |
|---|---|---|---|---|---|
| | | | | | |
