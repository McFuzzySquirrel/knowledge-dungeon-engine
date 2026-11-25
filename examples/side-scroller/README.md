# Side-Scroller Reference Host

A small, playable game built on **Knowledge Dungeon Engine**. It is the repository's
worked example of a host UI: a side-view village street above a generated dungeon,
Canvas 2D rendering, IndexedDB persistence, and the engine's full learning loop.

The example is **strictly additive**. It never edits `src/`, the published export map,
the storage schema, or runtime dependencies. Deleting this folder (and reverting the
documented root entries) leaves the engine exactly as it was. The full rule set is in
[ENGINE-BOUNDARY.md](../../docs/plans/side-scroller-host/ENGINE-BOUNDARY.md).

| Field | Value |
| --- | --- |
| Status | Complete — P0–P10, G10 passed |
| Stack | Vanilla TypeScript + Vite + Canvas 2D |
| Storage | IndexedDB, one `EngineState` record |
| Package | Private, standalone (`package.json`, lockfile, `tsconfig`, Vitest config) |
| Plan | [Side-Scroller Host plan](../../docs/plans/side-scroller-host/README.md) |
| Playtest | [First ten minutes](../../docs/plans/side-scroller-host/first-ten-minutes.md) |
| Visual record | [VISUALS.md](../../docs/plans/side-scroller-host/VISUALS.md) |
| Evidence | [EVIDENCE.md](../../docs/plans/side-scroller-host/EVIDENCE.md) |

## Run it

```sh
npm --prefix examples/side-scroller install
npm --prefix examples/side-scroller run dev
```

Open the printed Vite URL (default `http://localhost:5174/`). The first run opens a title
card: **Continue** enters the world, **New game** clears the save after confirmation and
seeds the three demo subjects, **Start tutorial** jumps straight to the tutorial dungeon,
**Import save** accepts an exported bundle, and **Settings** opens the journal's settings
section. State persists in the `knowledge-dungeon-side-scroller` IndexedDB database — use
**Clear saved state** in the progress panel, or **New game** on the title, to start over.

The canvas fills the viewport. On a narrow screen the progress panel becomes a bottom
sheet behind the **Progress** button; on a coarse pointer the touch pad, Jump, and the
contextual action button appear over the world. Current mobile Safari/Chrome are the
supported phone browsers (see the P9 evidence for the tested Firefox emulation).

```sh
npm --prefix examples/side-scroller test
npm --prefix examples/side-scroller run typecheck
npm --prefix examples/side-scroller run build
```

These are the example's own checks. Root `npm test` stays engine-only and must not
discover `examples/**` (the root Vitest config excludes it).

One command runs both suites and the boundary checks from the repository root:

```sh
node examples/side-scroller/scripts/gate.mjs
# or
npm --prefix examples/side-scroller run gate
```

It runs root test/typecheck/build, example test/typecheck/build, the Vitest isolation
probe, and both empty-`src` checks, then prints a pass/fail summary with the engine and
example test counts. It exits non-zero on any failure and never swallows output. There is
no root package script and no CI workflow by decision (D-13); this local gate is the
repeatable substitute.

## What works

| Area | Behaviour |
| --- | --- |
| Village street | Side-view facades, subject portals, and labelled villagers from engine data; the entrance shaft leads down to the dungeon |
| Dungeon | Generated map in side view, gravity/jump/ladders, AABB collision, continuous camera, one study visit per room entry; chamber outlines break at engine doorways so corridors read as connections |
| Note loop | Composer drives `submitNote`; drafts name the exact missing sections; clears award XP and an artifact |
| Review | Cleared rooms show `E write a note` and `R review`; ratings 0–5, due labels, save/resume/discard across reload, one reward per (room, pass) |
| Library | Review desk over the last-studied subject, artifact archive with collected state, and collected-note topics/dates (note text is not reprinted) |
| Guild Hall | Quest board, next step, archetype, subject roster, and the second Creator and journal entry points |
| Trophy Hall | Labelled badges, fish collection, and device records from `statistics`; explicit zero/empty states |
| Workshop | Per-subject inventory; equip/unequip go through `engine.equipItem` / `unequipItem`; failures show "Not saved" and keep the previous equipment |
| Fish Stand | Display-only fish collection with a visible "Selling and trading are not part of this build" note and no transaction control |
| Villagers | Labelled placeholder figures; `E` cycles deterministic engine lines, the cursor is host-local and resets on reload, and only "name speaks" is announced |
| Journal | `J` opens a focus-trapped pause screen over every subject: XP, rank, cleared/total, badges, records from `statistics`, inventory, fish, due rooms, engine-ranked assistance, and settings; Enter routes through the subject portal |
| Settings | Reduced motion, assistance mode, text size (DOM and canvas labels), and touch layout are host-local `localStorage` values, never engine state; malformed values fall back field by field, and Reset restores defaults |
| Fishing | Pond entry after a clear, cast/bite/reel, recall question from a cleared room, keep/release |
| Creator | Subject list, create form, room-tree editor (add, reparent, remove with cascade count, tags, cross-links), typed refusals; `C` or the Guild Hall opens it |
| Demo campaign | Three synthetic subjects seed on a first boot and appear as ordinary portals; a first-run flag prevents resurrection after deletion |
| Title | Continue/New game/archetype choice, a tutorial shortcut, and import/export/settings; a fresh save offers the engine's three archetypes and shows the resulting quest step |
| Save bundle | `.json` export with every attachment base64-encoded; import validates version/app/state shape and every payload, writes only after a complete decode, and reloads; settings are not included |
| Layout | Full-viewport canvas, one top-left notice rail (prompt, recovery, toast), progress overlay/sheet, safe-area insets, 44 px targets, no page scroll while playing, orientation resize, large-text and reduced-motion support |
| Polish | Short reduced-motion-safe panel arrivals, visible focus on every control, touch pad hidden under a sheet or modal, world repaint paused under an covering modal |
| Touch | Left/right/up/down, Jump, and one contextual action button; pointer events with cancel/blur cleanup; the same intent state and fishing machine as the keyboard |
| Persistence | Reload keeps rooms, XP, fish, equipment, review schedule, and any saved review marker |

P10 completed the local ship pass: the notice rail and modal layers no longer overlap,
the sheet hides the touch pad, focus and 44 px targets are checked, the world stops
repainting under an covering modal, and a repeatable gate now covers both suites and the
engine boundary. Placeholder rectangles and silence remain deliberate: this example ships
no art or audio.

## Controls

| Key | Action |
| --- | --- |
| `A`/`D` or `←`/`→` | Move |
| `Space` | Jump (hold/release to cast in a pond; press at a bite to reel) |
| `W`/`S` or `↑`/`↓` | Climb ladders |
| `E` | Enter a portal / open a village service / talk to a villager / write a note |
| `C` | Open the Creator from the street (the Guild Hall does the same) |
| `R` | Review a cleared room, or the last-studied subject's queue from the street |
| `J` | Open the journal and settings; `J` or `Escape` closes |
| `?` | Open the controls popup; `?` or `Escape` closes |
| `0`–`5`, `Enter`, `S`, `D`, `Escape` | In review: rate, submit, save for later, discard, close |
| `Escape` | Close a dialog, a service, the journal, leave a pond, or close a review |
| Title `Tab`/`Shift+Tab`/`Enter` | Move inside the title card and activate the focused action |
| Touch pad | Walk left/right, climb up/down; **Jump**; the action button shows Enter/Note/Fish/Cast/Release/Reel/Keep |
| Touch in the pond | Hold the action button to charge, release to cast, tap to hook or open the catch |

The full key map is in a focus-trapped **Controls (?)** popup in the progress panel, also
reachable with `?`. Everything on the critical path is keyboard-only, and the title is a
real focus-trapped DOM card. The canvas is focusable, a permanent live region announces
outcomes even when the progress panel is collapsed, and the DOM panel mirrors progress as
text; learner notes and prompts are treated as text nodes and never logged.

## How it is put together

```text
index.html                  canvas + DOM overlay roots
src/main.ts                 boot, routing, input, frame loop, command dispatch
src/engine.ts               one engine, one subscription, cached state
src/storage.ts              IndexedDB EngineStorage adapter
src/saveBundle.ts           portable JSON bundle codec (base64 attachments) (P9)
src/touchControls.ts        one intent state + touch overlay (P9)
src/ui/titlePanel.ts        title/continue/archetype/import card (P9)
src/level/                  DungeonMap / VillageMapDef -> side-view LevelModel
src/physics.ts              fixed-step gravity, ladders, AABB movement
src/render/                 Canvas world and DOM HUD
src/ui/                     note, review, Creator, service shell, interiors, journal, NPC bubble
src/review/                 pure review projections and copy (P5)
src/creator/                demo seeds and pure Creator projections (P6)
src/village/                service projections and NPC placement (P7)
src/journal/                journal and assistance projections (P8)
src/statistics/             shared StatisticsComputationInput builder (P8)
src/settings.ts             host-local settings store (P8)
src/ui/helpPanel.ts         controls popup behind the ? key (P8 follow-up)
src/fishing/                pond bridge, machine session, scene (P4)
src/projection.ts           EngineState -> view models, pure
tests/                      one suite per phase, isolated from the root suite
scripts/capture-dungeon.mjs WebDriver visual-record capture (P10 adds --p10 and --perf)
scripts/gate.mjs           local gate: both suites, builds, isolation, src diff
```

Engine imports go through the `@` alias to `src/index.ts`, so the example typechecks
against the same source the engine builds. Public namespaces and classes are the
allowed surface; a type-only import of an unexported type must be recorded as a
candidate engine export (K-14), and no value may reach around the barrel.

Movement, camera, physics, and in-progress casts are host-local. Every durable change
goes through an engine command; the frame loop never calls `snapshot()`.

## Known limits

- **No art, audio, music, or voice.** Placeholder shapes and silence are product
  decisions (D-11), not unfinished assets.
- **Local only.** There is no CI workflow, hosted deployment, service worker, or PWA
  install. The [gate script](#run-it) is the repeatable check.
- **One browser save.** IndexedDB holds one engine state; there are no accounts, cloud
  sync, multiple slots, or anti-cheat.
- **No fish trading or NPC state.** The Fish Stand is a collection display and villagers
  are read-only; both say so on screen.
- **Headless software compositing is slower than a GPU browser.** The P10 trace records
  the `about:blank` baseline with the app frames; the world frame is the accepted
  exception ([P2-O1](../../docs/plans/side-scroller-host/EVIDENCE.md#open-issues-and-exceptions)).
- **Physical phone browsers were not available in this environment.** P9/P10 used
  Firefox with a 390×844 DPR-2 viewport through WebDriver BiDi; current mobile
  Safari/Chrome remain the target (S-01).

## Visual record

Screenshots are captured from the real app over WebDriver (Firefox + `geckodriver`)
and indexed in [VISUALS.md](../../docs/plans/side-scroller-host/VISUALS.md):

```sh
node examples/side-scroller/scripts/capture-dungeon.mjs \
  --out docs/plans/side-scroller-host/visuals/p6 \
  --prefix 2026-11-24-g6 --creator
```

Modes: default dungeon, `--note-loop`, `--surface`, `--fishing`, `--review`,
`--creator`, `--services`, `--journal`, `--help`, `--openings`, `--mobile`/`--shell`,
`--p10` (the first-ten-minutes path plus layout, focus, large-text, phone, and import
checks), `--perf` (a 10-second trace per surface plus an `about:blank` baseline), and
`--smoke` (a production-build boot check with failed-resource and console checks);
add `--low-fps` or `--reduced-motion` for the environment variants. `--mobile` uses
WebDriver BiDi viewport emulation for an exact 390×844 CSS viewport at DPR 2. The P10
modes also subscribe to the browser log and record console errors and warnings in the
manifest.

## Deleting the example

Remove `examples/side-scroller/` and the plan folder, then revert the root
`examples/**` Vitest exclusion and any `.gitignore` additions. No engine migration,
feature flag, or version bump is involved.
