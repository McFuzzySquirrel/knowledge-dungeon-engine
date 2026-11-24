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
| Status | P0–P6 complete; P7–P10 planned |
| Stack | Vanilla TypeScript + Vite + Canvas 2D |
| Storage | IndexedDB, one `EngineState` record |
| Package | Private, standalone (`package.json`, lockfile, `tsconfig`, Vitest config) |
| Plan | [Side-Scroller Host plan](../../docs/plans/side-scroller-host/README.md) |
| Visual record | [VISUALS.md](../../docs/plans/side-scroller-host/VISUALS.md) |
| Evidence | [EVIDENCE.md](../../docs/plans/side-scroller-host/EVIDENCE.md) |

## Run it

```sh
npm --prefix examples/side-scroller install
npm --prefix examples/side-scroller run dev
```

Open the printed Vite URL (default `http://localhost:5174/`). The first run starts on
the village street; **Start tutorial** or the Training Grounds door creates the tutorial
subject. State persists in the `knowledge-dungeon-side-scroller` IndexedDB database —
use **Clear saved state** in the side panel to start over.

```sh
npm --prefix examples/side-scroller test
npm --prefix examples/side-scroller run typecheck
npm --prefix examples/side-scroller run build
```

These are the example's own gate. Root `npm test` stays engine-only and must not
discover `examples/**` (the root Vitest config excludes it).

## What works

| Area | Behaviour |
| --- | --- |
| Village street | Side-view facades and subject portals from `villageStructures()`; the entrance shaft leads down to the dungeon |
| Dungeon | Generated map in side view, gravity/jump/ladders, AABB collision, continuous camera, one study visit per room entry |
| Note loop | Composer drives `submitNote`; drafts name the exact missing sections; clears award XP and an artifact |
| Review | Cleared rooms show `E write a note` and `R review`; ratings 0–5, due labels, save/resume/discard across reload, one reward per (room, pass) |
| Fishing | Pond entry after a clear, cast/bite/reel, recall question from a cleared room, keep/release |
| Creator | Subject list, create form, room-tree editor (add, reparent, remove with cascade count, tags, cross-links), typed refusals; `C` or the Guild Hall opens it |
| Demo campaign | Three synthetic subjects seed on a first boot and appear as ordinary portals; a first-run flag prevents resurrection after deletion |
| Persistence | Reload keeps rooms, XP, fish, review schedule, and any saved review marker |

P7–P10 add village services, the journal and settings, title/save portability, touch
controls, and local polish. Placeholder rectangles and silence are deliberate: this
example ships no art or audio.

## Controls

| Key | Action |
| --- | --- |
| `A`/`D` or `←`/`→` | Move |
| `Space` | Jump (hold/release to cast in a pond; press at a bite to reel) |
| `W`/`S` or `↑`/`↓` | Climb ladders |
| `E` | Enter a portal / use a building / write a note |
| `C` | Open the Creator from the street (the Guild Hall does the same) |
| `R` | Review a cleared room, or the last-studied subject's queue from the street |
| `0`–`5`, `Enter`, `S`, `D`, `Escape` | In review: rate, submit, save for later, discard, close |
| `Escape` | Close a dialog, leave a pond, or close a review |

Everything on the critical path is keyboard-only. The canvas is focusable and the DOM
side panel mirrors progress and outcomes as text; learner notes and prompts are treated
as text nodes and never logged.

## How it is put together

```text
index.html                  canvas + DOM overlay roots
src/main.ts                 boot, routing, input, frame loop, command dispatch
src/engine.ts               one engine, one subscription, cached state
src/storage.ts              IndexedDB EngineStorage adapter
src/level/                  DungeonMap / VillageMapDef -> side-view LevelModel
src/physics.ts              fixed-step gravity, ladders, AABB movement
src/render/                 Canvas world and DOM HUD
src/ui/                     note panel, review panel, Creator panel, recall dialog, prompts
src/review/                 pure review projections and copy (P5)
src/creator/                demo seeds and pure Creator projections (P6)
src/fishing/                pond bridge, machine session, scene (P4)
src/projection.ts           EngineState -> view models, pure
tests/                      one suite per phase, isolated from the root suite
scripts/capture-dungeon.mjs WebDriver visual-record capture
```

Engine imports go through the `@` alias to `src/index.ts`, so the example typechecks
against the same source the engine builds. Public namespaces and classes are the
allowed surface; a type-only import of an unexported type must be recorded as a
candidate engine export (K-14), and no value may reach around the barrel.

Movement, camera, physics, and in-progress casts are host-local. Every durable change
goes through an engine command; the frame loop never calls `snapshot()`.

## Visual record

Screenshots are captured from the real app over WebDriver (Firefox + `geckodriver`)
and indexed in [VISUALS.md](../../docs/plans/side-scroller-host/VISUALS.md):

```sh
node examples/side-scroller/scripts/capture-dungeon.mjs \
  --out docs/plans/side-scroller-host/visuals/p6 \
  --prefix 2026-11-24-g6 --creator
```

Modes: default dungeon, `--note-loop`, `--surface`, `--fishing`, `--review`,
`--creator`; add `--low-fps` or `--reduced-motion` for the environment variants.

## Deleting the example

Remove `examples/side-scroller/` and the plan folder, then revert the root
`examples/**` Vitest exclusion and any `.gitignore` additions. No engine migration,
feature flag, or version bump is involved.
