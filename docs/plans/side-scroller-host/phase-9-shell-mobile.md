# P9 — Onboarding, Save Management, and Touch

| Field | Value |
|---|---|
| Phase | P9 |
| Parent | [Implementation plan](README.md) |
| Depends on | [P8](phase-8-journal.md) |
| Blocks | [P10](phase-10-polish.md) |
| Requirements | R-20, R-22 |
| Exit gate | [G9](#exit-gate-g9) |
| Status | Done — G9 passed 2026-11-24 |

## Objective

Make the example start like a game and play on a phone: a title/continue flow, archetype
selection, a portable save bundle (export/import), and touch controls that feed the same
movement and fishing intents as the keyboard. The engine still owns all durable state; the
host adds the shell and the input layer.

The canvas also becomes the viewport rather than a 16:9 card inside a document. The title,
HUD, journal, services, help, and touch controls all sit inside the world; the progress
panel becomes an overlay or sheet. This is the P9 shell decision made after P8, and it
replaces P9-T5's earlier "canvas stays 16:9" wording.

This is also where S-01 changes from desktop-only to current mobile Safari/Chrome.

## Non-goals

- Cloud saves, accounts, or multi-device sync.
- Multiple concurrent save slots. The engine contract is one state; export/import is the
  portability mechanism.
- Auto-save cadence changes. The engine already commits per command.
- Native apps, PWA install, or app-store packaging.
- Gesture-only controls. Every touch action has a visible button.

## Inputs and references

| What | Where |
|---|---|
| State shape | [`src/storage.ts`](../../../src/storage.ts) `EngineState`, `attachmentBytes` |
| Storage adapter | [`examples/side-scroller/src/storage.ts`](../../../examples/side-scroller/src/storage.ts) |
| Boot | [`examples/side-scroller/src/main.ts`](../../../examples/side-scroller/src/main.ts), [`engine.ts`](../../../examples/side-scroller/src/engine.ts) |
| Archetypes | [`src/creatorEngine.ts`](../../../src/creatorEngine.ts) `selectArchetype`; `archetypes` namespace |
| Start tutorial | [`src/creatorEngine.ts`](../../../src/creatorEngine.ts) `startTutorial` |
| Settings | [P8](phase-8-journal.md) |
| Seed | [P6](phase-6-creator.md) |
| Boundary rules | [ENGINE-BOUNDARY.md](ENGINE-BOUNDARY.md) |

## Frozen interfaces

```ts
import type { EngineState } from '@/index';

export interface SaveBundle {
  /** Bundle format version, not the engine state version. */
  bundleVersion: 1;
  exportedAt: string;
  app: 'knowledge-dungeon-side-scroller';
  /** The engine state with attachment bytes encoded for JSON. */
  state: EncodedEngineState;
}

export interface EncodedEngineState extends Omit<EngineState, 'attachmentBytes'> {
  attachmentBytes: Record<string, string>; // base64
}

export function encodeSaveBundle(state: EngineState, nowIso: string): SaveBundle;
export function decodeSaveBundle(raw: unknown): { ok: true; state: EngineState } | { ok: false; error: string };

export interface TitleView {
  hasSave: boolean;
  subjectCount: number;
  playerClass: string | null;
  questStep: string;
  showArchetypes: boolean;
}

export function projectTitle(state: EngineState): TitleView;

export type TouchIntent = 'left' | 'right' | 'up' | 'down' | 'jump' | 'action' | 'cast' | 'release';

export interface TouchControls {
  /** Feed a held intent into the same input state the keyboard uses. */
  press(intent: TouchIntent): void;
  release(intent: TouchIntent): void;
  /** Context label for the action button: Enter, Note, Fish, Cast, Reel, Keep. */
  setActionLabel(label: string): void;
  setVisible(visible: boolean): void;
}
```

## Work breakdown

### P9-T1 — Confirm boot and save facts

- [x] Explore confirms `EngineState.version` handling, every `attachmentBytes` value type,
      and whether any other field holds non-JSON values.
- [x] Confirm `createIndexedDbStorage` load/save/clear semantics and the failing adapter
      harness.
- [x] Confirm `selectArchetype` only accepts the three engine ids and which quest step it
      advances.
- [x] Record any type-only import as a K-14 candidate.

### P9-T2 — Title and onboarding

- [x] Replace the bare loading overlay with a title card: Continue (when a save exists),
      New game, Import save, Settings.
- [x] New game clears the save only after confirmation, seeds demo subjects (P6), and
      offers the archetype choice.
- [x] Archetype choice calls `selectArchetype` and shows the engine's quest step
      afterwards; no host-invented class bonuses.
- [x] Continue restores the route through the existing P0 recovery rules and lands on the
      street or dungeon as the engine says.
- [x] The title is keyboard-operable and has a visible focus ring; it is not a canvas.

### P9-T3 — Save export and import

- [x] Export writes a `.json` download with `SaveBundle`; base64-encode every
      `Uint8Array` attachment.
- [x] Import accepts a file or pasted JSON, validates `bundleVersion`, `app`, engine
      `version`, required top-level keys, and every base64 payload.
- [x] Import never trusts arbitrary fields: reject or ignore unknown top-level keys rather
      than merging them into engine state.
- [x] On success, save the decoded state through the storage adapter and reload the app.
- [x] On failure, show the specific validation error and leave the current save untouched.
- [x] Guard against a quota failure during import; the prior state must remain loadable.
- [x] Do not include host settings in the bundle.

### P9-T4 — Touch controls

- [x] Add a visible control layer: left/right, up/down, jump, and a contextual action
      button; in fishing, a large hold-to-cast/release button and a tap-to-reel action.
- [x] Buttons use pointer events with `pointercancel` cleanup; `touch-action: none` on the
      canvas and controls; no page scrolling while playing.
- [x] Multi-touch: movement plus jump/action at the same time.
- [x] The touch layer writes to the same intent state as the keyboard; do not fork the
      physics or fishing mapping.
- [x] `touchLayout` from P8 controls auto/on/off; `auto` shows on coarse pointers.
- [x] Dialog buttons (note, recall, journal, services) are ordinary DOM and work by tap;
      the action button label changes with context.
- [x] Visible focus still works for keyboard users on a hybrid device.

### P9-T5 — Responsive full-viewport layout

- [x] The canvas fills the viewport (`100dvh`, no 16:9 card, no document column beside it).
- [x] The progress panel becomes an overlay or collapsible sheet over the world; the page
      does not scroll while playing.
- [x] Below 900 px the panel becomes a sheet or tab; prompt, toast, recovery, and touch
      controls do not cover one another.
- [x] The title/loading overlay and every modal render inside the world viewport.
- [x] Safe-area insets for notches; controls respect `env(safe-area-inset-*)`.
- [x] Large text (P8) does not clip the HUD or dialogue.
- [x] Orientation change resizes the canvas and leaves the world state intact.
- [x] Reduced motion still wins over any host animation.

### P9-T6 — Tests

- [x] `encodeSaveBundle`/`decodeSaveBundle` round trip with a `Uint8Array` fixture,
      including an empty attachment map.
- [x] Rejections: wrong bundle version, wrong app name, wrong engine version, malformed
      base64, missing required keys.
- [x] Import failure leaves the existing storage value byte-identical.
- [x] Title projection: no save, empty save, dungeon save, fishing save.
- [x] Touch intent mapping: press/release produces the same `MoveIntent`/action as the
      equivalent key; cancel/blur clears held intents.
- [x] Settings `touchLayout` auto/on/off decides visibility from a pointer media query.

### P9-T7 — Manual proof and visuals

- [x] New game → archetype → street → tutorial → reload → Continue.
- [x] Export, clear the save, import, reload; confirm rooms, XP, fish, and an attachment
      survive.
- [x] Destroy the imported JSON and confirm the error leaves the old save playable.
- [x] Touch-only run on a phone-sized viewport: walk, jump, enter, clear a note, fish,
      keep, open the journal.
- [x] Keyboard-only regression on the same build.
- [x] Capture desktop and mobile frames for: title, archetype, import error, touch
      controls in the dungeon, touch controls at the pond, responsive HUD.

## Exit gate G9

- [x] New/continue and archetype selection work without the console.
- [x] A save bundle round-trips rooms, XP, fish, badges, schedule, and attachment bytes.
- [x] An invalid import cannot corrupt the current save.
- [x] The full critical path is playable touch-only on a phone-sized viewport.
- [x] Keyboard remains first-class; focus and reduced motion still pass.
- [x] Root and example suites, typechecks, and builds green; engine count unchanged.
- [x] No engine source diff.
- [x] G9 entry written in [EVIDENCE.md](EVIDENCE.md), with visuals under `visuals/p9/`.

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
| Confirm state/attachment/boot facts | `explore` | Nothing | `storage.ts`, `engine.ts`, `creatorEngine.ts` | Findings + line refs | Run first |
| Save bundle codec and tests | `general` | `src/saveBundle.ts`, `tests/saveBundle.test.ts` | Frozen bundle interface | Module + tests | Before title |
| Title/archetype/import UI | `general` | `src/ui/titlePanel.ts` | Frozen title view | Module + a11y notes | Parallel with touch |
| Touch controls | `general` | `src/touchControls.ts`, `src/ui/touchOverlay.ts` | Frozen touch interface | Module + tests | Parallel |
| Responsive layout, boot integration | Main agent | `src/main.ts`, `index.html` | All modules | Playable shell | Final |

Guardrails: save import writes only through the storage adapter; touch feeds the existing
intent state; no agent edits `src/`.

## Phase-specific risks

- **Attachment bytes.** JSON cannot carry `Uint8Array`; base64 is required and must round
  trip without truncation. Test a non-trivial byte pattern.
- **Hostile import.** A save file is untrusted input. Validate shape and version before
  writing; never `eval` or merge arbitrary keys.
- **Mobile IndexedDB.** Private browsing and low-quota modes may reject writes. Keep the
  existing loud failure path; do not silently fall back to memory.
- **Touch/keyboard divergence.** Both must produce the same intents. A second movement
  implementation is a fail.
- **Overlay collisions.** Prompt, toast, recovery banner, note panel, touch controls, the
  progress sheet, and the title all share one viewport; define stacking and test on a
  390×844 viewport.
- **Viewport chrome.** A full-viewport canvas changes camera framing and can hide the
  focus outline behind overlays; test that the world still frames the player and that
  keyboard focus remains visible.
- **S-01 change.** Mobile Safari/Chrome becomes supported; document the tested versions.

## Amendments and findings

| ID | Change | Why |
|---|---|---|
| P9-A1 | The title keeps a **Start tutorial** action beside Continue/New game/Import/Settings. | The capture harness and the manual smoke script reproduce P1–P8 by one click; the engine's `startTutorial()` is the same entry the old loading card used. It is a shortcut, not a second game mode. |
| P9-A2 | **Export save** is available on the title *and* in the progress panel. | A player who has already continued needs a way back to a portable file; the panel button uses the same `encodeSaveBundle` path. |
| P9-A3 | The touch overlay lives in `src/touchControls.ts` (no separate `touchOverlay.ts`), because it is a thin view over the one `IntentState`. | Keeps the frozen `TouchControls` interface and avoids a second module that could drift. |
| P9-A4 | The contextual action button always emits the `action` intent; `cast` and `release` remain in `TouchIntent` and map to the same fishing press/release. | One button, one state machine: `touchPress('action')` branches on the current screen. The unit test proves all intents map to the keyboard path. |
| P9-A5 | A permanent `#live` region sits outside the collapsible progress panel and receives every `hud.announce`. | A live region inside a hidden panel is not announced; collapsing the panel must not silence outcomes. |
| P9-A6 | `capture-dungeon.mjs --mobile` (alias `--shell`) uses WebDriver BiDi `browsingContext.setViewport` for 390×844 at DPR 2. | Headless Firefox clamps its window to 500 CSS px wide; BiDi gives the exact phone viewport without a test hook in the app. |
| P9-A7 | The import decoder copies only the known `EngineState` keys and ignores unknown bundle/state fields. | A save file is untrusted; ignoring is safer than merging. Tested with a hostile extra field. |
| P9-A8 | Engine facts confirmed for P9-T1: `EngineState.version === 1`, `attachmentBytes: Record<string, Uint8Array>`, IndexedDB structured clone, `selectArchetype('scholar' \| 'cartographer' \| 'archivist')`, and a type-only `EngineState` import. | No internal engine export or `src/` change was needed; no K-14 candidate remains. |
| P9-A9 | Import writes through `importSaveBundle(target, raw)`: complete decode first, then one `save`, then reload. | Proves the prior record is untouched on a validation or quota failure. |

Findings:

- `openExampleEngine` recovers a saved dungeon/fishing world before the title appears, so
  Continue always lands on a routed, runnable screen.
- A fresh browser profile runs the P6 demo seed **before** the title projects, so the
  first card already lists three subjects and asks for an archetype.
- `role="dialog"` keeps the title focus-trapped; `Tab` never reaches the paused world.

## Rollback

Delete `src/saveBundle.ts`, `src/touchControls.ts`, `src/ui/titlePanel.ts`, the
title/import/export wiring in `src/main.ts`, the touch markup/CSS, and the
`title`/`live` markup in `index.html`. The desktop host and all engine state remain.
Exported bundles are ordinary JSON and can be discarded.

## Execution evidence

| Date (UTC) | Task/Gate | Commit | Command or artifact | Result | Notes |
|---|---|---|---|---|---|
| 2026-11-24 | P9-T1 | uncommitted (base `5b76c82`) | `src/storage.ts`, `src/creatorEngine.ts`, `src/content/playerClasses.ts`, `examples/side-scroller/src/storage.ts` | pass | State version 1; attachment bytes are `Uint8Array`; structured-clone storage; archetype ids `scholar/cartographer/archivist`; type-only `EngineState` import |
| 2026-11-24 | P9-T3/T6 | uncommitted (base `5b76c82`) | `npm --prefix examples/side-scroller test` → `tests/saveBundle.test.ts` | pass | JSON round trip keeps a 0–255 byte fixture and a 53-byte attachment; wrong version/app/engine rejected; malformed base64 and missing keys rejected; unknown keys ignored; failed decode and quota both leave the prior record equal |
| 2026-11-24 | P9-T2/T6 | uncommitted (base `5b76c82`) | `tests/titlePanel.test.ts` | pass | No-save/save/dungeon/fishing projections; Continue/Export disabled without a save; archetype callback; malformed and host-rejected import errors |
| 2026-11-24 | P9-T4/T6 | uncommitted (base `5b76c82`) | `tests/touchControls.test.ts` | pass | Key → intent mapping; touch and keyboard produce the same `MoveIntent`; reference-counted holds; pointer cancel/window blur release; action label; auto/on/off visibility |
| 2026-11-24 | G9 | uncommitted (base `5b76c82`) | `npm test` / `npm run typecheck` / `npm run build` / `npx vitest list --config vitest.config.ts` | pass | Engine 13 files / 280 tests unchanged; typecheck and build clean; isolation probe lists 0 `examples/` paths; `git status --short src` and `git diff --stat src` empty |
| 2026-11-24 | G9 | uncommitted (base `5b76c82`) | `npm --prefix examples/side-scroller run typecheck` / `test` / `run build` | pass | Example 35 files / 228 tests; typecheck clean; Vite build clean |
| 2026-11-24 | P9-T7 normal | uncommitted (base `5b76c82`) | `node examples/side-scroller/scripts/capture-dungeon.mjs --mobile --out docs/plans/side-scroller-host/visuals/p9 --prefix 2026-11-24-g9` | pass | 13 frames (desktop + 390×844 title, archetype, rejected import, touch street/dungeon/pond, touch-only journal and review after three touch clears, cast, kept catch, sheet, import round trip); keyboard focus proof in the manifest; orientation 844×390 → 390×844 kept the world |
| 2026-11-24 | P9-T7 reduced motion | uncommitted (base `5b76c82`) | same command with `--reduced-motion --prefix 2026-11-24-g9rm` | pass | Same 13-frame path; `matchMedia('(prefers-reduced-motion: reduce)')` true; title focus and journal keyboard path still pass |
| 2026-11-24 | P9-T5 large text | uncommitted (base `5b76c82`) | browser check at 500×672 CSS: `textScale=large`, touch on, panel open | pass | `documentElement.scrollWidth` not over `innerWidth`; panel scrolls; no `dd` row clips; touch remains visible |
| 2026-11-24 | Manual proof | uncommitted (base `5b76c82`) | exported bundle → cleared save (cleared 0, XP 0) → imported → reload | pass | Restored 3 cleared rooms, 86 XP, and the 53-byte `p9-evidence.txt` attachment; the touch-only continue also hooks, answers recall, and keeps a fish (0 → 1); invalid version 2 bundle left the save unchanged and the title usable |

