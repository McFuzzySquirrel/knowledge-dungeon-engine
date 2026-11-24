# P7 — Village Services and Interiors

| Field | Value |
|---|---|
| Phase | P7 |
| Parent | [Implementation plan](README.md) |
| Depends on | [P5](phase-5-review.md) (review panel), [P6](phase-6-creator.md) (subject list) |
| Blocks | [P8](phase-8-journal.md) (shared projections), [P10](phase-10-polish.md) |
| Requirements | R-18, R-22 |
| Exit gate | [G7](#exit-gate-g7) |
| Status | Done — G7 passed 2026-11-24 |

## Objective

Give every labelled building a real purpose. P3 drew facades; P7 opens interiors as
accessible DOM screens over the canvas and wires each one to engine data. The street
stays the navigation layer; the interiors are services, not new worlds.

Only subject portals and the Training Grounds open a dungeon. Everything else becomes a
service: review, quests, records, equipment, the fish collection, and read-only NPC
conversation.

## Non-goals

- Fish selling or trading. No engine command exists; see [ENGINE-BOUNDARY.md](ENGINE-BOUNDARY.md) §6.
- NPC dialogue that changes engine state. Lines are selected, not persisted.
- New buildings, new village layout data, or art.
- Shop economies, currencies, or crafting.
- A replacement for the P6 Creator or P5 review overlay; P7 routes to them.

## Inputs and references

| What | Where |
|---|---|
| Structure list | [`src/creatorEngine.ts`](../../../src/creatorEngine.ts) `villageStructures` |
| Guild/quest step | [`src/creatorEngine.ts`](../../../src/creatorEngine.ts) `interactVillageStructure`, `advanceQuest`, `setQuestStep` |
| Review | [P5](phase-5-review.md); `dispatchReview`, `review` namespace |
| Progression | [`src/core/progression/types.ts`](../../../src/core/progression/types.ts); `progression` namespace |
| Equipment | [`src/creatorEngine.ts`](../../../src/creatorEngine.ts) `equipItem`, `unequipItem` |
| Statistics | [`src/core/statistics/index.ts`](../../../src/core/statistics/index.ts) |
| NPC contract | [`src/application/contracts/villageNpc.ts`](../../../src/application/contracts/villageNpc.ts) `selectVillageNpcLine`, `createVillageNpcSnapshot` |
| NPC data | [`src/data/villageLayout.ts`](../../../src/data/villageLayout.ts) `VILLAGE_MAP.npcs` |
| Creator | [P6](phase-6-creator.md) |
| Boundary rules | [ENGINE-BOUNDARY.md](ENGINE-BOUNDARY.md) |

## Service matrix

| Facade | Service id | Screen | Engine data | Writes |
|---|---|---|---|---|
| Library | `library` | Review desk + artifact archive + collected notes | `review`, progression `collectedNotes`, artifacts | Review commands only |
| Guild Hall | `guild-hall` | Quest board, archetype, subject roster | `activeSubjectId`, `session.questStep`, P6 subject list | `interactVillageStructure('guild-hall')`, `advanceQuest` via the facade |
| Trophy Hall | `trophy-hall` | Badges, fish collection, records | `progression.badges`, `fishCollection`, `statistics` metrics | None (read-only) |
| Workshop | `workshop` | Inventory and equipment | `progression.inventory`, `equippedItems` | `equipItem`, `unequipItem` |
| Fish Stand | `fish-stand` | Fish collection and rarity | `progression.fishCollection` | None (display-only) |
| NPC | `npc` | One-line dialogue bubble | `selectVillageNpcLine`, `VILLAGE_MAP.npcs` | None (read-only) |

`fish-stand` being display-only is a deliberate product decision, not a hidden todo.

## Frozen interfaces

```ts
import type { EngineState } from '@/index';

export type VillageServiceId =
  | 'library'
  | 'guild-hall'
  | 'trophy-hall'
  | 'workshop'
  | 'fish-stand';

export function serviceForStructure(type: string): VillageServiceId | null;

export interface ServiceShellView {
  id: VillageServiceId;
  title: string;
  subtitle: string;
}

export interface LibraryView {
  review: { candidates: { roomId: string; topic: string; dueLabel: string }[]; dueCount: number } | null;
  artifacts: { roomId: string; topic: string; collected: boolean }[];
  noteCount: number;
}

export interface GuildView {
  questStep: string;
  archetype: string | null;
  subjects: { subjectId: string; subjectName: string; clearedCount: number; roomCount: number }[];
}

export interface TrophyView {
  badges: string[];
  fish: { name: string; rarity: string }[];
  metrics: { label: string; value: string }[];
}

export interface WorkshopView {
  items: { id: string; name: string; equipped: boolean; slot: string | null }[];
  emptyMessage: string;
}

export interface FishStandView {
  fish: { name: string; rarity: string }[];
  emptyMessage: string;
}

export interface NpcLineView {
  npcId: string;
  label: string;
  line: string;
  source: 'quest' | 'quote' | 'greeting' | 'dialogue';
  cursor: { index: number; questStep: string };
}

/** Pure projections; no commands, no DOM. */
export function projectLibrary(state: EngineState, nowIso: string): LibraryView | null;
export function projectGuild(state: EngineState): GuildView;
export function projectTrophy(state: EngineState): TrophyView;
export function projectWorkshop(state: EngineState): WorkshopView;
export function projectFishStand(state: EngineState): FishStandView;

export function openVillageService(id: VillageServiceId): void;
export function closeVillageService(): void;
```

`main.ts` wires `openVillageService` to the nearest facade and owns all engine calls.

## Work breakdown

### P7-T1 — Confirm service inputs

- [x] Explore task reports the progression fields for inventory, equipment, badges,
      collected notes, and fish, plus the exact statistics metric functions.
- [x] Confirm which NPCs the map actually defines and that `selectVillageNpcLine` needs
      only the NPC, quest step, cursor, and optional quote index.
- [x] Confirm `interactVillageStructure('guild-hall')` is the only quest-step mutation the
      example needs; record its outcome.
- [x] Record any type-only import as a K-14 candidate.

### P7-T2 — Interior shell and routing

- [x] One DOM overlay (`#service-panel`) with a title, subtitle, close button, and a
      content slot. It is a real dialog with `aria-modal`, focus trap, and focus return.
- [x] The nearest facade's `E` opens its service; the prompt verb becomes `inspect`,
      `review`, `equip`, or `fish` as appropriate, not a generic "visit".
- [x] Services pause the world and clear held input.
- [x] `Escape` closes; `Tab` cycles inside; the canvas regains focus.
- [x] A service with no data shows an explicit empty state, never a blank screen.
- [x] The fish stand and trophy hall are reachable even with no fish/badges.

### P7-T3 — Library

- [x] Review desk: shows due/overdue rooms from P5 and resumes the P5 panel.
- [x] Artifact archive: lists cleared rooms with artifacts, with "collected" state from
      progression; selecting one shows the artifact's plain text only if it is already in
      the journal, never a fetched or injected document.
- [x] Collected notes: a read-only list of room topics and dates; note text is not
      re-displayed here.
- [x] Empty state explains that clearing a room fills the archive.

### P7-T4 — Guild Hall

- [x] Quest board: current `questStep`, the next step, and the subject roster from P6.
- [x] Archetype panel: selected archetype or a link to P9's selection screen.
- [x] The facade interaction still calls `interactVillageStructure('guild-hall')`; render
      the returned structure and the new quest step.
- [x] No host-invented quests or rewards.

### P7-T5 — Trophy Hall

- [x] Badges as labelled rows; no colour-only state.
- [x] Fish collection with name and rarity.
- [x] A small records table from `statistics` metrics (rooms cleared, reviews, fish,
      longest streak); labels match the metric names, not host guesses.
- [x] Empty state explains which actions produce a badge or a record.

### P7-T6 — Workshop

- [x] Inventory rows with name, slot, and equipped state.
- [x] Equip/unequip buttons call `engine.equipItem` / `engine.unequipItem`; one in-flight
      command at a time.
- [x] A rejected command is shown as "Not saved" and the previous equipment state is
      intact.
- [x] Empty inventory explains that room clears and reviews can grant items.
- [x] Keyboard focus order follows the rows; buttons have accessible names.

### P7-T7 — Fish Stand

- [x] Display the fish collection with name, rarity, and subject.
- [x] A visible note: "Selling and trading are not part of this build."
- [x] No button that looks like a transaction. This is a deliberate non-interactive
      surface, not a broken one.

### P7-T8 — NPCs

- [x] Render the map's NPCs as labelled placeholder figures on the street; they do not
      block movement.
- [x] Proximity uses the engine's `createVillageNpcSnapshot`/`selectVillageNearbyTargets`
      ranges, not a second distance rule.
- [x] `E` opens a dialogue bubble; each press calls `selectVillageNpcLine` with the stored
      cursor and shows the returned line as text.
- [x] The cursor is host-local conversation state; it is not persisted and resets on
      reload.
- [x] The line is not logged or announced verbatim; only "Wandering Scholar speaks" is
      announced.

### P7-T9 — Tests

- [x] `serviceForStructure` maps every labelled type and returns `null` for scenery.
- [x] Projection tests for library, guild, trophy, workshop, and fish stand from fixed
      `EngineState` fixtures, including empty states.
- [x] Equipment round trip with `MemoryEngineStorage`: equip, reload, unequip, reject.
- [x] NPC selection determinism with a fixed cursor, quest step, and quote index.
- [x] Shell focus test: open, Tab cycle, Escape, focus returns to `#game`.
- [x] No service projection calls `snapshot()`; all read the cached state.

### P7-T10 — Manual proof and visuals

- [x] Open and use every service from the street; no dead facades remain.
- [x] Review a due room from the Library.
- [x] Equip an item in the Workshop and verify it survives a reload.
- [x] Talk to an NPC twice and confirm the cursor advances deterministically.
- [x] Keyboard-only run through all services; reduced-motion pass.
- [x] Capture frames for each service plus the empty and save-failure states.

## Exit gate G7

- [x] Every labelled facade opens a service or is explicitly scenery.
- [x] Library, Guild Hall, Trophy Hall, Workshop, Fish Stand, and NPCs all render engine
      data and have explicit empty states.
- [x] Workshop equipment round-trips through a reload; failures are visible.
- [x] Fish Stand and NPCs are honestly read-only.
- [x] Services are keyboard-accessible and return focus.
- [x] Root and example suites, typechecks, and builds green; engine count unchanged.
- [x] No engine source diff.
- [x] G7 entry written in [EVIDENCE.md](EVIDENCE.md), with visuals under `visuals/p7/`.

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
| Confirm progression/stat/NPC APIs | `explore` | Nothing | progression, statistics, villageNpc | Findings + line refs | Run first |
| Service projections | `general` | `src/village/projection.ts`, `tests/villageProjection.test.ts` | Engine fixtures | Module + tests | Before shell |
| Library + Trophy screens | `general` | `src/ui/libraryPanel.ts`, `src/ui/trophyPanel.ts` | Frozen views | Modules + a11y notes | Parallel with Workshop |
| Workshop + Fish Stand | `general` | `src/ui/workshopPanel.ts`, `src/ui/fishStandPanel.ts` | Frozen views | Modules + tests | Parallel |
| Shell, routing, NPCs | Main agent | `src/main.ts`, `src/ui/servicePanel.ts`, `src/village/npc.ts` | All modules | Playable village | Final |

Guardrails: no agent edits `main.ts` except the main agent; panels never call commands; no
engine edits.

## Phase-specific risks

- **Empty inventories.** The example has no shop, so equipment may be empty. Empty states
  must explain the source rather than implying a bug.
- **Artifact safety.** Artifact text is learner-adjacent; render it as text and never log
  it. The archive should not become an exfiltration surface.
- **Read-only honesty.** A disabled "Sell" button is worse than no button. Fish Stand is a
  collection view.
- **NPC cursor drift.** The engine returns a cursor; the host must pass it back unchanged
  and reset it when the quest step changes.
- **Stats availability.** Metrics may be zero on a fresh save; show zero, not an error.

## Rollback

Delete `src/village/`, the service panels, the `#service-panel` host, and the facade
routing. The P3 street and P5/P6 overlays remain. No engine data is added by P7 except
equipment changes the player chose.

## Execution evidence

| Date (UTC) | Task/Gate | Commit | Command or artifact | Result | Notes |
|---|---|---|---|---|---|
| 2026-11-24 | P7-T1 service inputs | uncommitted (base `d775008`) | Explore of `creatorEngine.ts`, `core/progression`, `core/statistics`, `villageNpc.ts`, `villageLayout.ts` | pass | `equipItem`/`unequipItem` exist on `KnowledgeDungeonEngine`; `computeStatisticsSnapshot` is the metrics authority; `selectVillageNpcLine` needs only `npc`, `questStep`, `cursor`, optional `quoteIndex`; `createVillageNpcSnapshot` wraps `selectVillageNearbyTargets`. No K-14 type-only import was needed: `villageInteractions.VillageNpcLineCursor` comes from the public namespace. |
| 2026-11-24 | P7-T2–T8 services | uncommitted (base `d775008`) | `src/village/projection.ts`, `src/village/npc.ts`, `src/ui/servicePanel.ts`, `libraryPanel.ts`, `guildPanel.ts`, `trophyPanel.ts`, `workshopPanel.ts`, `fishStandPanel.ts`, `npcDialog.ts`, `src/main.ts` | pass | Shared focus-trapped shell; Library → P5 review; Guild roster and quest board; Trophy records; Workshop equip/unequip with "Not saved"; Fish Stand display-only; NPC lines with host-local cursors. |
| 2026-11-24 | P7-T9 tests | uncommitted (base `d775008`) | `npm --prefix examples/side-scroller test` | pass | 28 files / 176 tests. New: `villageProjection.test.ts` (service map, all five projections, empty/populated, badge labels) and `villageServices.test.ts` (equipment round trip with `MemoryEngineStorage`, rejected write, NPC placement/proximity/lines, happy-dom shell focus, `snapshot()` purity check). |
| 2026-11-24 | G7 gate | uncommitted (base `d775008`) | `npm test`; `npm run typecheck`; `npm run build`; `npx vitest list --config vitest.config.ts`; example typecheck/test/build; `git status --short src`; `git diff --stat src` | pass | Engine 13 files / 280 tests unchanged; isolation probe 0 `examples/` paths; example 28 / 176; both typechecks and builds clean; `src` status and diff empty. |
| 2026-11-24 | P7-T10 visuals | uncommitted (base `d775008`) | `node examples/side-scroller/scripts/capture-dungeon.mjs --out docs/plans/side-scroller-host/visuals/p7 --prefix 2026-11-24-g7 --services` and the `--reduced-motion` re-run (`g7rm`) | pass | 13 normal frames and 12 reduced-motion frames: every service, the Library-to-review handoff (keyboard), NPC cursor advance, rejected Workshop write, keyboard equip, and equipment surviving a reload. Manifest under `visuals/p7/`; indexed in [VISUALS.md](VISUALS.md). |
| 2026-11-24 | P7-T10 manual scenery/focus | uncommitted (base `d775008`) | WebDriver walk to Keeper's Tower; `E` | pass | Prompt reads `E inspect — Keeper's Tower` and the canvas toast reads `Keeper's Tower is scenery in this example; it has no service.` The central fountain shares the path. Every service close in the capture waited for focus to return to `#game`; the happy-dom shell test also covers Tab/Escape/focus return. |

### Execution notes and amendments

- **`src/ui/guildPanel.ts` added.** The plan's file tree listed the service shell and four
  interiors; the Guild Hall needed its own quest/roster renderer, so it got a fifth panel
  module. The shell, routing, and ownership rule are unchanged.
- **`happy-dom` is an example-only dev dependency.** The P7-T9 shell focus test needs a DOM.
  It is not a runtime dependency and does not change the engine or the published export
  map.
- **`projectReviewForSubject` added to `src/review/projection.ts`.** The Library projects
  the last-studied subject while `returnToVillage()` has cleared `activeSubjectId`. This is
  an additive refactor of P5 code; `projectReview(state, now)` still resolves the active
  subject and delegates.
- **NPC placement avoids structure bands.** The engine deliberately gives a structure
  priority over an NPC. A villager whose raw `gridX` fell inside a portal's approach band
  was visible but unreachable, so `placeSurfaceNpcs` nudges each figure to the nearest
  deterministic x outside every structure band. Proximity still uses
  `VILLAGE_NEARBY_RANGES` scaled to the side-view tile size; there is no second distance
  rule.
- **Host function naming.** The frozen interface's `openVillageService` /
  `closeVillageService` live in `main.ts` (the only engine caller); `ui/servicePanel.ts`
  owns the DOM shell. The pure view interfaces are exported from
  `src/village/projection.ts` as specified.
- **Workshop empty-state copy names the real source.** The phase text says room clears
  and reviews can grant items. The engine's loot path is room-clear only
  (`learningPorts.ts`), so the panel says clears can drop gear while reviews award XP and
  badges. A "reviews grant items" sentence would have been false.
