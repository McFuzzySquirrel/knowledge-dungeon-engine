# Execution Evidence Index — Side-Scroller Host

This file is the cross-phase index for the plan in [README.md](README.md). Detailed
rows live in each phase document's **Execution evidence** section; this index records
the gate outcome and the baseline facts later gates compare against.

## Rules

- **Append-only.** Never edit or delete an earlier row. Correct a mistake with a new
  dated row that references the old one.
- **One row per gate plus one row per material task result.** Do not log every command.
- **No learner data.** Record codes, counts, commits, file paths, and command summaries.
  Never record note text, topics, subject names, prompts, or attachment contents.
- **Commit field** is the full or short SHA of the tree tested, or `uncommitted` for a
  working-tree run. If `uncommitted`, record the phase status board value too.
- **Result** is one of `pass`, `fail`, `blocked`, or `partial`, with a one-line reason.
- **Failures stay.** A later pass links back to the failing row.
- **Artifacts** — screenshots live in `visuals/pN/` and are indexed in
  [VISUALS.md](VISUALS.md) with a per-gate manifest. Performance traces and other large
  captures may stay outside the repository; record their path, conditions, and who can
  access them.

## Status

| Field | Value |
|---|---|
| Plan version | 1.8 |
| Plan written | 2026-11-23 |
| Engine test baseline | **13 files / 280 tests at `3951737`; unchanged after P0–P4** |
| First gate run | 2026-11-23 |
| Latest gate passed | G4 (2026-11-24) |
| Current phase | P4 complete — all phases done |
| Open failures | None recorded; accepted P2-O1 performance exception and the P4 amendments below |

## Gate index

| Gate | Phase | Date (UTC) | Commit | Result | Engine tests | Example tests | Evidence |
|---|---|---|---|---|---|---|---|
| G0 | [P0 — scaffold, storage, boot](phase-0-scaffold.md#execution-evidence) | 2026-11-23 | uncommitted (base `3951737`) | pass | 13 / 280 | 2 / 6 | [P0 evidence](phase-0-scaffold.md#execution-evidence) |
| G1 | [P1 — dungeon level](phase-1-dungeon-level.md#execution-evidence) | 2026-11-23 | uncommitted (base `989acf1`) | pass | 13 / 280 | 7 / 39 | [P1 evidence](phase-1-dungeon-level.md#execution-evidence) |
| G2 | [P2 — note loop](phase-2-note-loop.md#execution-evidence) | 2026-11-23 | uncommitted (base `f0eda0e`) | pass | 13 / 280 | 9 / 49 | [P2 evidence](phase-2-note-loop.md#execution-evidence) |
| G3 | [P3 — surface village](phase-3-surface-village.md#execution-evidence) | 2026-11-23 | uncommitted (base `fd8c171`) | pass | 13 / 280 | 14 / 79 | [P3 evidence](phase-3-surface-village.md#execution-evidence) |
| G3 re-run | [P3 — playtest layout fix](phase-3-surface-village.md#execution-evidence) | 2026-11-24 | uncommitted (base `b44f24a`) | pass | 13 / 280 | 14 / 84 | [P3 evidence](phase-3-surface-village.md#execution-evidence) |
| G3 polish | [P3 — street atmosphere and HUD](phase-3-surface-village.md#execution-evidence) | 2026-11-24 | uncommitted (base `1ef03cf`) | pass | 13 / 280 | 14 / 85 | [P3 evidence](phase-3-surface-village.md#execution-evidence) |
| G4 | [P4 — fishing](phase-4-fishing.md#execution-evidence) | 2026-11-24 | uncommitted (base `203011d`) | pass | 13 / 280 | 18 / 106 | [P4 evidence](phase-4-fishing.md#execution-evidence) |

## Baseline record (P0)

Fill this in during P0-T3 and do not change it later. If the engine suite legitimately
changes size, add a new baseline row and explain why.

| Date (UTC) | Commit | `npm test` files | `npm test` tests | `npm run typecheck` | `npm run build` | Isolation probe | Notes |
|---|---|---|---|---|---|---|---|
| 2026-11-23 | `3951737` | 13 | 280 | pass | pass | — | Pre-P0 baseline |
| 2026-11-23 | uncommitted | 13 | 280 | pass | pass | 0 `examples/` paths | After P0; example suite 2 files / 6 tests |
| 2026-11-23 | uncommitted (base `989acf1`) | 13 | 280 | pass | pass | 0 `examples/` paths | G1 checkpoint; no baseline change; example suite 7 files / 39 tests |
| 2026-11-23 | uncommitted (base `f0eda0e`) | 13 | 280 | pass | pass | 0 `examples/` paths | G2 checkpoint; no baseline change; example suite 9 files / 49 tests |
| 2026-11-23 | uncommitted (base `fd8c171`) | 13 | 280 | pass | pass | 0 `examples/` paths | G3 checkpoint; no baseline change; example suite 14 files / 79 tests |
| 2026-11-24 | uncommitted (base `b44f24a`) | 13 | 280 | pass | pass | 0 `examples/` paths | G3 re-run after street layout/movement fix; example suite 14 files / 84 tests |
| 2026-11-24 | uncommitted (base `1ef03cf`) | 13 | 280 | pass | pass | 0 `examples/` paths | G3 polish re-run; example suite 14 files / 85 tests |
| 2026-11-24 | uncommitted (base `203011d`) | 13 | 280 | pass | pass | 0 `examples/` paths | G4 checkpoint; no baseline change; example suite 18 files / 106 tests |

## Per-task evidence links

| Phase | Detailed log | Notable task rows |
|---|---|---|
| P0 | [phase-0-scaffold.md §Execution evidence](phase-0-scaffold.md#execution-evidence) | Storage round-trip, isolation probe, recovery behaviour |
| P1 | [phase-1-dungeon-level.md §Execution evidence](phase-1-dungeon-level.md#execution-evidence) | Map metrics, level/physics/visit tests, traversal proof, low-frame-rate check, reduced-motion focus pass |
| P2 | [phase-2-note-loop.md §Execution evidence](phase-2-note-loop.md#execution-evidence) | Draft/refusal/clear, save failure, keyboard pass |
| P3 | [phase-3-surface-village.md §Execution evidence](phase-3-surface-village.md#execution-evidence) | Surface layout, portal entry/return, reload routing |
| P4 | [phase-4-fishing.md §Execution evidence](phase-4-fishing.md#execution-evidence) | Replay, keep/release, reload recovery, performance |

Visual record: [VISUALS.md](VISUALS.md) — dated frames, conditions, and manifests per gate.

## Gate record template

Copy this into the phase document's evidence table (as one or more rows) and mirror the
summary row here.

```text
Date (UTC):
Phase / gate:
Commit:
Commands run:
  npm test                     -> <files/tests, pass/fail>
  npm run typecheck            -> <pass/fail>
  npm run build                -> <pass/fail>
  npx vitest list              -> <examples paths? yes/no>
  example typecheck            -> <pass/fail>
  example test                 -> <files/tests, pass/fail>
  example build                -> <pass/fail>
Acceptance criteria verified:  <A-xx, E-xx>
Manual checks:                 <keyboard, reduced motion, reload, performance>
Visuals:                       <VISUALS.md anchor or visual frame files>
Exceptions accepted:           <risk id + why>
Result:                        <pass/fail/blocked>
Notes:
```

## What counts as proof

| Claim | Minimum proof |
|---|---|
| Engine unchanged | `git status --short src` empty plus `git diff --stat src` empty at the gate commit |
| Test isolation | `npx vitest list --config vitest.config.ts` output contains no `examples/` path |
| Storage durability | Automated round-trip including `Uint8Array`, plus one manual reload observation |
| Save failure UX | Automated rejecting adapter test plus a manual observation of the "Not saved" state |
| Traversal | Manual step log or short capture reaching all tutorial rooms, plus the level/physics tests |
| Visit de-duplication | Test or instrumented log showing one command per entry and a second on re-entry |
| Keyboard operation | Dated manual checklist result for the path under test |
| Fishing determinism | Replay test with a fixed seed and event trace; recall selection is excluded and stated |
| Performance | Dated DevTools capture summary with frame-time outliers or an accepted exception |

## Open issues and exceptions

| ID | Raised at | Issue | Owner | Status |
|---|---|---|---|---|
| P1-O1 | G1 | The engine stores `roomsVisited` as a per-session set, so a re-entry commits a second `recordRoomVisit` but adds no second unique room id. The host de-duplication (one command per entry) is proven in `tests/visits.test.ts`; R-13 forbids changing engine behaviour. | Host example | Accepted — documented in P1 findings |
| P1-O2 | G1 | Physics has no cross-frame accumulator: a frame delta is subdivided into at most 5 × 1/120 s steps, so under 24 fps the simulation slows down instead of spending time. This is the conservative K-03 choice and is covered by the 100 ms terminal-velocity test. | Host example | Accepted — documented in P1 amendments |
| P2-O1 | G2 | Headless Firefox software compositing cannot reach the plan's 16.7 ms frame target: `about:blank` measures avg 18.49 ms. The app adds ≈3.8 ms (avg 22.25 ms, p95 33.94 ms). The deliberate 55 ms/80 ms hog run showed no tunneling. | Host example | Accepted — environment exception, not a product regression |
| P3-O1 | G3 | Normal portal entry uses `placeDungeonBelow(...).spawn` (the dungeon root), matching P3-T3's portal rule. `shaftBottomSpawn` is implemented and tested for a physical descent, but P3's village world has no active subject, so walking down the shaft is not itself a world transition. | Host example | Accepted — documented in P3 amendments |
| P3-O2 | G3 | The top-down village data overlapped the first subject portal (`gridX: 3`) with the Training Grounds facade (`gridX: 4`). Depth sorting drew the portal behind the gate. | Host example | Resolved 2026-11-24 — the spacing pass gives every building a 3-tile gap, so the portal occupies its own gap |
| P3-O3 | P3 playtest | Raw `gridX` clumped facades, and solid building bodies plus a door gap trapped the player inside the Training Grounds footprint. | Host example | Resolved 2026-11-24 — facades are background-only; buildings are spread 1.6× with a 3-tile minimum gap; spawn, entrance, and return zone follow the Training Grounds door |
| P4-O1 | G4 | The engine clears `activeSubjectId` in `returnToVillage()`, so P3's return flow reaches the street with no active subject. `resolveFishingSubject` uses active → host-remembered → most-cleared, and the pond payload uses that subject (never the nearest portal). | Host example | Accepted — P4 Amendment 1 |
| P4-O2 | G4 | `pullRecallQuestion` draws with `Math.random`, so recall selection is not seedable. Replay covers phase, candidate, cast number, and effects; recall tests pass a fixed `roomId`, and the UI presents the engine's own `catch.recall`. | Host example | Accepted — documented in P4 Findings |
| P4-O3 | G4 | Headless Firefox software compositing measures 16.79 ms average with 319/596 frames just over 16.7 ms during the 10 s pond capture (max 33.74 ms, one dropped frame). This is within the headless software-compositing variance recorded in P2-O1 and is not attributable to fishing. | Host example | Accepted — environment exception (P2-O1) |
