# P7 — Village Services and Interiors

| Field | Value |
|---|---|
| Phase | P7 |
| Parent | [Implementation plan](README.md) |
| Depends on | [P5](phase-5-review.md) (review panel), [P6](phase-6-creator.md) (subject list) |
| Blocks | [P8](phase-8-journal.md) (shared projections), [P10](phase-10-polish.md) |
| Requirements | R-18, R-22 |
| Exit gate | [G7](#exit-gate-g7) |
| Status | Not started |

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

- [ ] Explore task reports the progression fields for inventory, equipment, badges,
      collected notes, and fish, plus the exact statistics metric functions.
- [ ] Confirm which NPCs the map actually defines and that `selectVillageNpcLine` needs
      only the NPC, quest step, cursor, and optional quote index.
- [ ] Confirm `interactVillageStructure('guild-hall')` is the only quest-step mutation the
      example needs; record its outcome.
- [ ] Record any type-only import as a K-14 candidate.

### P7-T2 — Interior shell and routing

- [ ] One DOM overlay (`#service-panel`) with a title, subtitle, close button, and a
      content slot. It is a real dialog with `aria-modal`, focus trap, and focus return.
- [ ] The nearest facade's `E` opens its service; the prompt verb becomes `inspect`,
      `review`, `equip`, or `fish` as appropriate, not a generic "visit".
- [ ] Services pause the world and clear held input.
- [ ] `Escape` closes; `Tab` cycles inside; the canvas regains focus.
- [ ] A service with no data shows an explicit empty state, never a blank screen.
- [ ] The fish stand and trophy hall are reachable even with no fish/badges.

### P7-T3 — Library

- [ ] Review desk: shows due/overdue rooms from P5 and resumes the P5 panel.
- [ ] Artifact archive: lists cleared rooms with artifacts, with "collected" state from
      progression; selecting one shows the artifact's plain text only if it is already in
      the journal, never a fetched or injected document.
- [ ] Collected notes: a read-only list of room topics and dates; note text is not
      re-displayed here.
- [ ] Empty state explains that clearing a room fills the archive.

### P7-T4 — Guild Hall

- [ ] Quest board: current `questStep`, the next step, and the subject roster from P6.
- [ ] Archetype panel: selected archetype or a link to P9's selection screen.
- [ ] The facade interaction still calls `interactVillageStructure('guild-hall')`; render
      the returned structure and the new quest step.
- [ ] No host-invented quests or rewards.

### P7-T5 — Trophy Hall

- [ ] Badges as labelled rows; no colour-only state.
- [ ] Fish collection with name and rarity.
- [ ] A small records table from `statistics` metrics (rooms cleared, reviews, fish,
      longest streak); labels match the metric names, not host guesses.
- [ ] Empty state explains which actions produce a badge or a record.

### P7-T6 — Workshop

- [ ] Inventory rows with name, slot, and equipped state.
- [ ] Equip/unequip buttons call `engine.equipItem` / `engine.unequipItem`; one in-flight
      command at a time.
- [ ] A rejected command is shown as "Not saved" and the previous equipment state is
      intact.
- [ ] Empty inventory explains that room clears and reviews can grant items.
- [ ] Keyboard focus order follows the rows; buttons have accessible names.

### P7-T7 — Fish Stand

- [ ] Display the fish collection with name, rarity, and subject.
- [ ] A visible note: "Selling and trading are not part of this build."
- [ ] No button that looks like a transaction. This is a deliberate non-interactive
      surface, not a broken one.

### P7-T8 — NPCs

- [ ] Render the map's NPCs as labelled placeholder figures on the street; they do not
      block movement.
- [ ] Proximity uses the engine's `createVillageNpcSnapshot`/`selectVillageNearbyTargets`
      ranges, not a second distance rule.
- [ ] `E` opens a dialogue bubble; each press calls `selectVillageNpcLine` with the stored
      cursor and shows the returned line as text.
- [ ] The cursor is host-local conversation state; it is not persisted and resets on
      reload.
- [ ] The line is not logged or announced verbatim; only "Wandering Scholar speaks" is
      announced.

### P7-T9 — Tests

- [ ] `serviceForStructure` maps every labelled type and returns `null` for scenery.
- [ ] Projection tests for library, guild, trophy, workshop, and fish stand from fixed
      `EngineState` fixtures, including empty states.
- [ ] Equipment round trip with `MemoryEngineStorage`: equip, reload, unequip, reject.
- [ ] NPC selection determinism with a fixed cursor, quest step, and quote index.
- [ ] Shell focus test: open, Tab cycle, Escape, focus returns to `#game`.
- [ ] No service projection calls `snapshot()`; all read the cached state.

### P7-T10 — Manual proof and visuals

- [ ] Open and use every service from the street; no dead facades remain.
- [ ] Review a due room from the Library.
- [ ] Equip an item in the Workshop and verify it survives a reload.
- [ ] Talk to an NPC twice and confirm the cursor advances deterministically.
- [ ] Keyboard-only run through all services; reduced-motion pass.
- [ ] Capture frames for each service plus the empty and save-failure states.

## Exit gate G7

- [ ] Every labelled facade opens a service or is explicitly scenery.
- [ ] Library, Guild Hall, Trophy Hall, Workshop, Fish Stand, and NPCs all render engine
      data and have explicit empty states.
- [ ] Workshop equipment round-trips through a reload; failures are visible.
- [ ] Fish Stand and NPCs are honestly read-only.
- [ ] Services are keyboard-accessible and return focus.
- [ ] Root and example suites, typechecks, and builds green; engine count unchanged.
- [ ] No engine source diff.
- [ ] G7 entry written in [EVIDENCE.md](EVIDENCE.md), with visuals under `visuals/p7/`.

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
| | | | | | |
