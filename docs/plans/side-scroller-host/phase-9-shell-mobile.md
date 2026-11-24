# P9 — Onboarding, Save Management, and Touch

| Field | Value |
|---|---|
| Phase | P9 |
| Parent | [Implementation plan](README.md) |
| Depends on | [P8](phase-8-journal.md) |
| Blocks | [P10](phase-10-polish.md) |
| Requirements | R-20, R-22 |
| Exit gate | [G9](#exit-gate-g9) |
| Status | Not started |

## Objective

Make the example start like a game and play on a phone: a title/continue flow, archetype
selection, a portable save bundle (export/import), and touch controls that feed the same
movement and fishing intents as the keyboard. The engine still owns all durable state; the
host adds the shell and the input layer.

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

- [ ] Explore confirms `EngineState.version` handling, every `attachmentBytes` value type,
      and whether any other field holds non-JSON values.
- [ ] Confirm `createIndexedDbStorage` load/save/clear semantics and the failing adapter
      harness.
- [ ] Confirm `selectArchetype` only accepts the three engine ids and which quest step it
      advances.
- [ ] Record any type-only import as a K-14 candidate.

### P9-T2 — Title and onboarding

- [ ] Replace the bare loading overlay with a title card: Continue (when a save exists),
      New game, Import save, Settings.
- [ ] New game clears the save only after confirmation, seeds demo subjects (P6), and
      offers the archetype choice.
- [ ] Archetype choice calls `selectArchetype` and shows the engine's quest step
      afterwards; no host-invented class bonuses.
- [ ] Continue restores the route through the existing P0 recovery rules and lands on the
      street or dungeon as the engine says.
- [ ] The title is keyboard-operable and has a visible focus ring; it is not a canvas.

### P9-T3 — Save export and import

- [ ] Export writes a `.json` download with `SaveBundle`; base64-encode every
      `Uint8Array` attachment.
- [ ] Import accepts a file or pasted JSON, validates `bundleVersion`, `app`, engine
      `version`, required top-level keys, and every base64 payload.
- [ ] Import never trusts arbitrary fields: reject or ignore unknown top-level keys rather
      than merging them into engine state.
- [ ] On success, save the decoded state through the storage adapter and reload the app.
- [ ] On failure, show the specific validation error and leave the current save untouched.
- [ ] Guard against a quota failure during import; the prior state must remain loadable.
- [ ] Do not include host settings in the bundle.

### P9-T4 — Touch controls

- [ ] Add a visible control layer: left/right, up/down, jump, and a contextual action
      button; in fishing, a large hold-to-cast/release button and a tap-to-reel action.
- [ ] Buttons use pointer events with `pointercancel` cleanup; `touch-action: none` on the
      canvas and controls; no page scrolling while playing.
- [ ] Multi-touch: movement plus jump/action at the same time.
- [ ] The touch layer writes to the same intent state as the keyboard; do not fork the
      physics or fishing mapping.
- [ ] `touchLayout` from P8 controls auto/on/off; `auto` shows on coarse pointers.
- [ ] Dialog buttons (note, recall, journal, services) are ordinary DOM and work by tap;
      the action button label changes with context.
- [ ] Visible focus still works for keyboard users on a hybrid device.

### P9-T5 — Responsive layout

- [ ] Below 900 px the side panel becomes a collapsible sheet or a tab; the canvas stays
      16:9 and controls do not cover the prompt.
- [ ] Safe-area insets for notches; controls respect `env(safe-area-inset-*)`.
- [ ] Large text (P8) does not clip the HUD or dialogue.
- [ ] Orientation change resizes the canvas and leaves the world state intact.
- [ ] Reduced motion still wins over any host animation.

### P9-T6 — Tests

- [ ] `encodeSaveBundle`/`decodeSaveBundle` round trip with a `Uint8Array` fixture,
      including an empty attachment map.
- [ ] Rejections: wrong bundle version, wrong app name, wrong engine version, malformed
      base64, missing required keys.
- [ ] Import failure leaves the existing storage value byte-identical.
- [ ] Title projection: no save, empty save, dungeon save, fishing save.
- [ ] Touch intent mapping: press/release produces the same `MoveIntent`/action as the
      equivalent key; cancel/blur clears held intents.
- [ ] Settings `touchLayout` auto/on/off decides visibility from a pointer media query.

### P9-T7 — Manual proof and visuals

- [ ] New game → archetype → street → tutorial → reload → Continue.
- [ ] Export, clear the save, import, reload; confirm rooms, XP, fish, and an attachment
      survive.
- [ ] Destroy the imported JSON and confirm the error leaves the old save playable.
- [ ] Touch-only run on a phone-sized viewport: walk, jump, enter, clear a note, fish,
      keep, open the journal.
- [ ] Keyboard-only regression on the same build.
- [ ] Capture desktop and mobile frames for: title, archetype, import error, touch
      controls in the dungeon, touch controls at the pond, responsive HUD.

## Exit gate G9

- [ ] New/continue and archetype selection work without the console.
- [ ] A save bundle round-trips rooms, XP, fish, badges, schedule, and attachment bytes.
- [ ] An invalid import cannot corrupt the current save.
- [ ] The full critical path is playable touch-only on a phone-sized viewport.
- [ ] Keyboard remains first-class; focus and reduced motion still pass.
- [ ] Root and example suites, typechecks, and builds green; engine count unchanged.
- [ ] No engine source diff.
- [ ] G9 entry written in [EVIDENCE.md](EVIDENCE.md), with visuals under `visuals/p9/`.

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
- **Overlay collisions.** Prompt, toast, recovery banner, note panel, and touch controls
  share the canvas; define stacking and test on a 390×844 viewport.
- **S-01 change.** Mobile Safari/Chrome becomes supported; document the tested versions.

## Rollback

Delete `src/saveBundle.ts`, `src/touchControls.ts`, `src/ui/titlePanel.ts`,
`src/ui/touchOverlay.ts`, the title/import wiring, and the touch CSS. The desktop host and
all engine state remain. Exported bundles are ordinary JSON and can be discarded.

## Execution evidence

| Date (UTC) | Task/Gate | Commit | Command or artifact | Result | Notes |
|---|---|---|---|---|---|
| | | | | | |
