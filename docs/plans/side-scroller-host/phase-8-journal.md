# P8 — Journal, Character Sheet, and Settings

| Field | Value |
|---|---|
| Phase | P8 |
| Parent | [Implementation plan](README.md) |
| Depends on | [P5](phase-5-review.md), [P6](phase-6-creator.md), [P7](phase-7-village.md) |
| Blocks | [P9](phase-9-shell-mobile.md), [P10](phase-10-polish.md) |
| Requirements | R-19, R-22 |
| Exit gate | [G8](#exit-gate-g8) |
| Status | Not started |

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

- [ ] Explore reports the exact `StatisticsComputationInput` fields and the
      `toAssistanceSubject(s)` mapping from `EngineState`.
- [ ] Confirm the assistance feature flag input and how to pass it; record the flag name.
- [ ] Confirm the progression fields for inventory items and equipped slots.
- [ ] Confirm no projection needs a value import outside the public namespaces.

### P8-T2 — Journal projection

- [ ] One subject row per subject: XP, rank, cleared/total, badges, fish, due rooms,
      last played from study sessions or statistics.
- [ ] Active subject and quest step from `EngineState`, never inferred.
- [ ] Inventory and fish rows are read from progression.
- [ ] Statistics are computed with the engine's `computeStatisticsSnapshot`, not a host
      sum. If the input is unavailable, `stats: null` and the UI says "no records yet".
- [ ] Pure and unit-tested; no DOM, no commands.

### P8-T3 — Assistance projection

- [ ] Map rooms and edges with the engine's `toAssistanceSubject` helpers.
- [ ] Pass `mode`, `nowIso`, the feature flag, and a study aggregate derived from
      statistics (or omit `study` when unavailable).
- [ ] Show only suggestions whose `surface` matches the current screen; the journal shows
      `device` and a general list.
- [ ] `off` returns the engine's empty reason and shows no suggestions.
- [ ] Suggestion copy is the engine's; the host does not invent advice.

### P8-T4 — Journal panel

- [ ] Open with `J` (and from the Guild Hall), pause the world, and trap focus.
- [ ] Sections: Overview, Subjects, Progress, Badges, Records, Inventory, Fish, Due,
      Assistance, Settings.
- [ ] Selecting a subject highlights it but does not enter it; a separate button routes to
      the P6/P3 entry path.
- [ ] Keyboard navigation: `J`/`Escape` close, arrow keys or Tab move, `Enter` activates.
- [ ] Live-region summaries are short and never include learner note text.
- [ ] `large` text scale is applied to the panel and HUD without clipping.

### P8-T5 — Settings

- [ ] Settings panel is reachable from the journal and the title screen (P9).
- [ ] Changing reduced motion takes effect immediately for camera and transitions.
- [ ] Changing assistance mode recomputes suggestions without a reload.
- [ ] Changing touch layout adds/removes controls immediately.
- [ ] Settings persist across reloads; malformed values fall back to defaults.
- [ ] A "Reset settings" action restores defaults without touching engine state.

### P8-T6 — Tests

- [ ] Journal projection fixtures: one subject, multiple subjects, empty save, badges,
      fish, inventory, due rooms.
- [ ] Settings: default, load/save round trip, malformed JSON fallback, partial object
      fallback.
- [ ] Assistance mapping: `off`, no suggestions, one suggestion, study aggregate present,
      feature flag false.
- [ ] Text-scale and touch-layout application are pure and tested.
- [ ] No `snapshot()` in the frame loop; the journal reads the cached state.

### P8-T7 — Manual proof and visuals

- [ ] Open the journal from a fresh save, a cleared save, and a multi-subject save.
- [ ] Inspect badges, records, fish, inventory, due rooms, and assistance.
- [ ] Toggle each setting, reload, and confirm it persisted.
- [ ] Keyboard-only run; reduced-motion and large-text passes.
- [ ] Capture frames for: overview, subjects, records, assistance, settings, empty state.

## Exit gate G8

- [ ] The journal shows every subject and the active player's progress from engine data.
- [ ] Statistics come from the engine; the host does not re-sum progress.
- [ ] Assistance is ranked by the engine and respects mode/flag.
- [ ] Settings persist, apply immediately, and never enter `EngineState`.
- [ ] Large text and keyboard operation work without clipping or focus loss.
- [ ] Root and example suites, typechecks, and builds green; engine count unchanged.
- [ ] No engine source diff.
- [ ] G8 entry written in [EVIDENCE.md](EVIDENCE.md), with visuals under `visuals/p8/`.

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
| | | | | | |
