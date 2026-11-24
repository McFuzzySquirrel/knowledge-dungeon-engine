# P8 — Journal, Character Sheet, and Settings

| Field | Value |
|---|---|
| Phase | P8 |
| Parent | [Implementation plan](README.md) |
| Depends on | [P5](phase-5-review.md), [P6](phase-6-creator.md), [P7](phase-7-village.md) |
| Blocks | [P9](phase-9-shell-mobile.md), [P10](phase-10-polish.md) |
| Requirements | R-19, R-22 |
| Exit gate | [G8](#exit-gate-g8) |
| Status | Done — G8 passed 2026-11-24 |

## Objective

Give the player one place to see the whole run: subjects, progress, badges, statistics,
fish, inventory, review due, quest step, and adaptive-assistance suggestions. Add the
host-owned settings that affect presentation and assistance. The journal is a read model
over engine state; settings are the only P8 state the host persists itself.

P7's services are places. P8 is the character sheet and pause screen that ties them
together.

## Non-goals

- A new progression system, badge rules, or statistics definitions.
- Assistance that writes notes, creates rooms, or changes state. It suggests only.
- Cloud profiles or cross-device settings.
- Editing the subject graph from the journal; P6 owns the Creator.
- A full settings menu for audio or graphics (none exist yet).

## Inputs and references

| What | Where |
|---|---|
| Progression | [`src/core/progression/types.ts`](../../../src/core/progression/types.ts); `progression` namespace |
| Statistics | [`src/core/statistics/statisticsMetrics.ts`](../../../src/core/statistics/statisticsMetrics.ts) `computeStatisticsSnapshot` |
| Assistance | [`src/core/assistance/assistanceEngine.ts`](../../../src/core/assistance/assistanceEngine.ts) `rankAssistance`; [`types.ts`](../../../src/core/assistance/types.ts) `AssistanceEngineInput` |
| Assistance mapping | [`src/core/assistance/subjectInput.ts`](../../../src/core/assistance/subjectInput.ts) `toAssistanceSubject`, `toAssistanceSubjects` |
| Review due | [P5](phase-5-review.md) |
| Quest step | [`src/session.ts`](../../../src/session.ts) |
| Boundary rules | [ENGINE-BOUNDARY.md](ENGINE-BOUNDARY.md) |

## Frozen interfaces

```ts
import type { EngineState } from '@/index';
import type { assistance, statistics } from '@/index';

export type AssistanceMode = 'off' | 'gentle' | 'standard';
export type TextScale = 'normal' | 'large';
export type TouchLayout = 'auto' | 'on' | 'off';

export interface HostSettings {
  /** `system` follows the OS; `on` forces reduced motion. Motion is never forced. */
  reducedMotion: 'system' | 'on';
  assistanceMode: AssistanceMode;
  textScale: TextScale;
  touchLayout: TouchLayout;
}

export const DEFAULT_SETTINGS: HostSettings;
export function loadSettings(): HostSettings; // localStorage, safe defaults
export function saveSettings(settings: HostSettings): void;
export function applySettings(settings: HostSettings): void;

export interface JournalSubjectView {
  subjectId: string;
  subjectName: string;
  xp: number;
  rank: string;
  roomsCleared: number;
  totalRooms: number;
  badges: string[];
  fishCount: number;
  dueRooms: number;
  lastPlayedIso: string | null;
}

export interface JournalView {
  subjects: JournalSubjectView[];
  activeSubjectId: string | null;
  questStep: string;
  archetype: string | null;
  stats: statistics.StatisticsSnapshot | null;
  assistance: assistance.AssistanceResult | null;
  inventory: { id: string; name: string; equipped: boolean; slot: string | null }[];
  fish: { name: string; rarity: string; subjectName: string }[];
}

/** Pure; assistance may be computed separately so the journal stays a fast projection. */
export function projectJournal(state: EngineState, nowIso: string): JournalView;

export function projectAssistance(
  state: EngineState,
  settings: HostSettings,
  nowIso: string,
): assistance.AssistanceResult;

export interface JournalPanelCallbacks {
  onClose(): void;
  onOpenSettings(): void;
  onSelectSubject(subjectId: string): void;
}
```

## Settings are host-local

The engine has no settings command. `HostSettings` lives in `localStorage` under one key,
is validated on read, and falls back to defaults on malformed JSON. It is not engine
state and must not be written into `EngineState`.

| Setting | Effect | Default |
|---|---|---|
| `reducedMotion` | `system` follows `matchMedia`; `on` forces reduced motion; nothing forces motion | `system` |
| `assistanceMode` | Passed to `rankAssistance`; `off` shows no suggestions | `gentle` |
| `textScale` | `large` raises the DOM base size and canvas label sizes | `normal` |
| `touchLayout` | `auto` shows touch controls on coarse pointers; `on`/`off` override | `auto` |

## Work breakdown

### P8-T1 — Confirm projection inputs

- [x] Explore reports the exact `StatisticsComputationInput` fields and the
      `toAssistanceSubject(s)` mapping from `EngineState`.
- [x] Confirm the assistance feature flag input and how to pass it; record the flag name.
- [x] Confirm the progression fields for inventory items and equipped slots.
- [x] Confirm no projection needs a value import outside the public namespaces.

### P8-T2 — Journal projection

- [x] One subject row per subject: XP, rank, cleared/total, badges, fish, due rooms,
      last played from study sessions or statistics.
- [x] Active subject and quest step from `EngineState`, never inferred.
- [x] Inventory and fish rows are read from progression.
- [x] Statistics are computed with the engine's `computeStatisticsSnapshot`, not a host
      sum. If the input is unavailable, `stats: null` and the UI says "no records yet".
- [x] Pure and unit-tested; no DOM, no commands.

### P8-T3 — Assistance projection

- [x] Map rooms and edges with the engine's `toAssistanceSubject` helpers.
- [x] Pass `mode`, `nowIso`, the feature flag, and a study aggregate derived from
      statistics (or omit `study` when unavailable).
- [x] Show only suggestions whose `surface` matches the current screen; the journal shows
      `device` and a general list.
- [x] `off` returns the engine's empty reason and shows no suggestions.
- [x] Suggestion copy is the engine's; the host does not invent advice.

### P8-T4 — Journal panel

- [x] Open with `J` (and from the Guild Hall), pause the world, and trap focus.
- [x] Sections: Overview, Subjects, Progress, Badges, Records, Inventory, Fish, Due,
      Assistance, Settings.
- [x] Selecting a subject highlights it but does not enter it; a separate button routes to
      the P6/P3 entry path.
- [x] Keyboard navigation: `J`/`Escape` close, arrow keys or Tab move, `Enter` activates.
- [x] Live-region summaries are short and never include learner note text.
- [x] `large` text scale is applied to the panel and HUD without clipping.

### P8-T5 — Settings

- [x] Settings panel is reachable from the journal and the title screen (P9).
- [x] Changing reduced motion takes effect immediately for camera and transitions.
- [x] Changing assistance mode recomputes suggestions without a reload.
- [ ] Changing touch layout adds/removes controls immediately. **Deferred to P9:** the P9 touch overlay is the first control surface; P8 stores the setting, resolves `auto` against the pointer, applies the `data-touch-layout` attribute, and tests all of it. There is no control to add or remove yet.
- [x] Settings persist across reloads; malformed values fall back to defaults.
- [x] A "Reset settings" action restores defaults without touching engine state.

### P8-T6 — Tests

- [x] Journal projection fixtures: one subject, multiple subjects, empty save, badges,
      fish, inventory, due rooms.
- [x] Settings: default, load/save round trip, malformed JSON fallback, partial object
      fallback.
- [x] Assistance mapping: `off`, no suggestions, one suggestion, study aggregate present,
      feature flag false.
- [x] Text-scale and touch-layout application are pure and tested.
- [x] No `snapshot()` in the frame loop; the journal reads the cached state.

### P8-T7 — Manual proof and visuals

- [x] Open the journal from a fresh save, a cleared save, and a multi-subject save.
- [x] Inspect badges, records, fish, inventory, due rooms, and assistance.
- [x] Toggle each setting, reload, and confirm it persisted.
- [x] Keyboard-only run; reduced-motion and large-text passes.
- [x] Capture frames for: overview, subjects, records, assistance, settings, empty state.

## Exit gate G8

- [x] The journal shows every subject and the active player's progress from engine data.
- [x] Statistics come from the engine; the host does not re-sum progress.
- [x] Assistance is ranked by the engine and respects mode/flag.
- [x] Settings persist, apply immediately, and never enter `EngineState`.
- [x] Large text and keyboard operation work without clipping or focus loss.
- [x] Root and example suites, typechecks, and builds green; engine count unchanged.
- [x] No engine source diff.
- [x] G8 entry written in [EVIDENCE.md](EVIDENCE.md), with visuals under `visuals/p8/`.

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
| Confirm statistics/assistance inputs | `explore` | Nothing | statistics, assistance, progression | Findings + line refs | Run first |
| Journal projection and tests | `general` | `src/journal/projection.ts`, `tests/journalProjection.test.ts` | Engine fixtures | Module + tests | Before panel |
| Settings store and tests | `general` | `src/settings.ts`, `tests/settings.test.ts` | Frozen settings interface | Module + tests | Parallel |
| Journal/settings panel | `general` | `src/ui/journalPanel.ts` | Frozen views | Module + a11y notes | After projection |
| Integration and input | Main agent | `src/main.ts`, `src/render/hud.ts` | All modules | Playable journal | Final |

Guardrails: panels do not import engine commands; settings never write to `EngineState`;
no agent edits `src/`.

## Phase-specific risks

- **Statistics cost.** Computing the snapshot on every state change is fine, but not per
  frame. Cache it per state revision.
- **Assistance input drift.** Use the engine's mapping helpers; a hand-built room object
  will silently lose signals.
- **Settings leakage.** Do not put settings in the engine save bundle; exporting a save
  should not carry device preferences.
- **Large text + canvas.** Canvas labels need a scale factor; DOM-only scaling will clip.
- **Assistance tone.** Render the engine's reason codes as labels; do not add motivational
  copy the engine did not produce.

## Rollback

Delete `src/journal/`, `src/settings.ts`, `src/ui/journalPanel.ts`, and the `J` binding.
The HUD, services, and engine state are unaffected. Settings in localStorage can remain
ignored or be cleared with the save.

## Execution evidence

| Date (UTC) | Task/Gate | Commit | Command or artifact | Result | Notes |
|---|---|---|---|---|---|
| 2026-11-24 | P8-T1 projection inputs | uncommitted (base `3e8039b`) | Explore of `core/statistics`, `core/assistance`, `core/progression`, `storage.ts` | pass | `StatisticsComputationInput` = `sessions`, `subjects` (`subjectId`, `subjectName`, `snapshot`, `progression`, `events`), injected `now`, optional window limits. `AssistanceEngineInput` = `mode`, `signals`, `subjects` from `toAssistanceSubjects`, `nowIso`, optional `study`, optional `fishing`, boolean `flagEnabled`. Progression exposes `inventory` (`CanonicalLootItem[]`) and `equippedItems`, with `progression.isEquippable` and `equipSlot`; no value import outside a public namespace was needed. |
| 2026-11-24 | P8-T2/T3 projections | uncommitted (base `3e8039b`) | `src/journal/projection.ts`, `src/statistics/projection.ts`, `src/review/projection.ts` | pass | One subject row per subject including XP, rank, cleared/total, human badge labels, fish count, due count, and the newest study-session timestamp. Statistics come from `computeStatisticsSnapshot`; `stats: null` only when projection fails. Assistance uses `toAssistanceSubjects`, `collectAssistanceSignals`, the engine study aggregate, and `rankAssistance`. `isDueCandidate` was exported from P5 so the HUD count and Due section share one rule. |
| 2026-11-24 | P8-T4/T5 panel and settings | uncommitted (base `3e8039b`) | `src/ui/journalPanel.ts`, `src/settings.ts`, `src/main.ts`, `index.html`, `src/render/canvas.ts`, `src/fishing/scene.ts`, `src/render/hud.ts`, `src/ui/guildPanel.ts` | pass | `J` opens and closes, the world pauses, focus is trapped and restored; `J`/`Escape`, Tab, arrows, and Enter work. Sections: Overview, Subjects, Progress, Badges, Records, Inventory, Fish, Due, Assistance, Settings. Selecting highlights; Enter routes through the subject's portal. Settings are localStorage-only, validated field by field, applied immediately, and reset without touching `EngineState`. Large text scales the DOM base size and canvas labels. |
| 2026-11-24 | P8-T6 tests | uncommitted (base `3e8039b`) | `npm --prefix examples/side-scroller test` | pass | 31 files / 199 tests. New: `journalProjection.test.ts` (empty, one, multi-subject, cleared/badges/inventory/fish/due, last-played, assistance off/empty/one/aggregate/flag/purity), `settings.test.ts` (defaults, round trip, malformed and partial objects, resolved motion/touch/text, root attributes), `journalPanel.test.ts` (focus trap, Tab/arrows, J/Escape, selection vs entry, settings callbacks, engine reason labels). |
| 2026-11-24 | P8-T7 settings manual | uncommitted (base `3e8039b`) | WebDriver: set all four selects, reload, reset; J/Escape open/close | pass | Applied dataset `reduce/large/on/standard`; after reload the dataset and all four selects still matched; Reset restored `full/normal/off/gentle` and the four default selects. `J` closes and a second, separate `J` reopens; `Escape` closes with focus back on `#game`. Confirms persistence, immediate application, and reset without an engine write. |
| 2026-11-24 | G8 gate | uncommitted (base `3e8039b`) | `npm test`; `npm run typecheck`; `npm run build`; `npx vitest list --config vitest.config.ts`; example typecheck/test/build; `git status --short src`; `git diff --stat src` | pass | Engine 13 files / 280 tests unchanged; isolation probe 0 `examples/` paths; example 31 / 199; both typechecks and builds clean; `src` status and diff empty. |
| 2026-11-24 | P8-T7 visuals | uncommitted (base `3e8039b`) | `node examples/side-scroller/scripts/capture-dungeon.mjs --out docs/plans/side-scroller-host/visuals/p8 --prefix 2026-11-24-g8 --journal` and the `--reduced-motion` re-run (`g8rm`) | pass | 11 normal and 11 reduced-motion frames: overview, subjects, records, assistance, settings, large text, assistance off, settings after reload, journal-to-dungeon entry, fresh-save overview, and fresh-save records. Manifests under `visuals/p8/`; indexed in [VISUALS.md](VISUALS.md). |
| 2026-11-24 | P8 follow-up controls help | uncommitted (base `3e8039b`) | `src/ui/helpPanel.ts`, `tests/helpPanel.test.ts`, `src/main.ts`, `index.html`; `npm --prefix examples/side-scroller test`; `node examples/side-scroller/scripts/capture-dungeon.mjs --out docs/plans/side-scroller-host/visuals/p8 --prefix 2026-11-24-g8b --help` | pass | The long controls paragraph moved into a focus-trapped popup behind a top-of-panel **Controls (?)** button and the `?` key; the page keeps one short hint. Tab traps, Escape/`?` close, and focus returns to the button or canvas. Example suite 32 files / 201 tests; three `g8b` frames and a manifest under `visuals/p8/`. No engine change. |
| 2026-11-24 | P8 follow-up room openings | uncommitted (base `3e8039b`) | `src/level/model.ts`, `src/level/dungeonLevel.ts`, `src/render/canvas.ts`, `tests/level.test.ts`; `node examples/side-scroller/scripts/capture-dungeon.mjs --out docs/plans/side-scroller-host/visuals/p8 --prefix 2026-11-24-g8c --openings` | pass | `LevelModel` now carries each engine door tile; the chamber outline is cut at N/S/E/W doorways with a short threshold mark, so a corridor or ladder visibly connects the rooms. The new test proves every engine door maps to the matching perimeter tile. Example suite 32 files / 202 tests; two `g8c` frames and a manifest under `visuals/p8/`. No engine change. |

### Execution notes and amendments

- **`src/statistics/projection.ts` added.** The P7 Trophy Hall already held the only
  `StatisticsComputationInput` builder. P8 needs the same input for Records and for the
  assistance study aggregate, so the builder moved to one shared module and the Trophy
  Hall delegates to it. This is an additive host refactor, not an engine change.
- **The assistance flag is host-named.** The engine has no `src/config/featureFlags.ts`;
  `AssistanceEngineInput` takes a boolean `flagEnabled`. The host names the flag
  `VITE_ADAPTIVE_ASSISTANCE`, defaults it on, and passes the resolved boolean.
  `projectAssistance` also accepts an optional flag argument so the disabled path is
  directly tested.
- **Touch layout is stored but cannot move controls yet.** P9 owns the first touch
  overlay. P8 stores the preference, resolves `auto` against `(pointer: coarse)`, and
  publishes `data-touch-layout`; P9's overlay will read that attribute. The P8-T5 checkbox
  is left unchecked with this reason rather than claiming a control surface that does not
  exist.
- **`JournalView` gained a `due` array.** The frozen interface exposed only per-subject
  due counts, which cannot render the Due section. Each entry is still the engine's
  `projectReviewForSubject` candidate and the P5 due rule; no due arithmetic was added.
- **Panel callbacks are additive.** `JournalPanelCallbacks` adds `onEnterSubject` and the
  two settings callbacks because "select" and "enter" are separate actions and settings
  are host-owned. The frozen three callbacks remain.
- **Last played uses study sessions.** `StatisticsSnapshot` has a local date key, not a
  timestamp, so the row uses the newest `endedAt ?? startedAt` for that subject. A subject
  with events but no session reports `null` rather than inventing a time.
- **A "fresh save" still has the three demo subjects.** P6's first-run seeding runs
  before the journal opens, so the fresh-save frames show three subjects with zero
  progress and zero notes, not an empty subject list. That is the real first-run state.
- **`GuildPanelCallbacks.onOpenJournal` added.** The Guild Hall is the second entry point
  the plan names; it closes its shell before mounting the journal so only one modal owns
  focus.

- **Controls moved behind a help popup.** The always-visible key paragraph was long enough to dominate the page and would crowd P9 touch chrome. The full map now lives in `src/ui/helpPanel.ts`, opened by the side-panel **Controls (?)** button or `?`, with a focus trap and focus return. A short hint remains below the canvas so the shortcut is discoverable. This is presentation-only; the key handling is unchanged.
- **Room outlines break at doorways.** The side-view adapter now projects `map.doors` as `LevelDoor` tiles and the renderer cuts the chamber border at each one. The engine map already owned door and corridor geometry; this is presentation of existing data, not a new walkability rule.
