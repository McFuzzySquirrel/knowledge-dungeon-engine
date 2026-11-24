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
| Plan version | 2.8 |
| Plan written | 2026-11-23 |
| Engine test baseline | **13 files / 280 tests at `3951737`; unchanged after P0–P8** |
| First gate run | 2026-11-23 |
| Latest gate passed | G8 (2026-11-24) |
| Current phase | P0–P8 complete; P9–P10 planned, P9 next |
| Open failures | None recorded; accepted P2-O1 performance exception, the P4 amendments, and the P8-O1 touch deferral below |

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
| G5 | [P5 — review](phase-5-review.md#execution-evidence) | 2026-11-24 | uncommitted (base `6525c22`) | pass | 13 / 280 | 22 / 135 | [P5 evidence](phase-5-review.md#execution-evidence) |
| G6 | [P6 — creator](phase-6-creator.md#execution-evidence) | 2026-11-24 | uncommitted (base `46e28b3`) | pass | 13 / 280 | 26 / 153 | [P6 evidence](phase-6-creator.md#execution-evidence) |
| G7 | [P7 — village services](phase-7-village.md#execution-evidence) | 2026-11-24 | uncommitted (base `d775008`) | pass | 13 / 280 | 28 / 176 | [P7 evidence](phase-7-village.md#execution-evidence) |
| G8 | [P8 — journal](phase-8-journal.md#execution-evidence) | 2026-11-24 | uncommitted (base `3e8039b`) | pass | 13 / 280 | 31 / 199 | [P8 evidence](phase-8-journal.md#execution-evidence) |
| G8 follow-up | [P8 — controls help](phase-8-journal.md#execution-evidence) | 2026-11-24 | uncommitted (base `3e8039b`) | pass | 13 / 280 | 32 / 201 | [P8 follow-up evidence](phase-8-journal.md#execution-evidence) |
| G8 follow-up | [P8 — room openings](phase-8-journal.md#execution-evidence) | 2026-11-24 | uncommitted (base `3e8039b`) | pass | 13 / 280 | 32 / 202 | [P8 follow-up evidence](phase-8-journal.md#execution-evidence) |
| G9 | [P9 — shell and touch](phase-9-shell-mobile.md#execution-evidence) | — | — | Planned | — | — | — |
| G10 | [P10 — local polish](phase-10-polish.md#execution-evidence) | — | — | Planned | — | — | — |

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
| 2026-11-24 | uncommitted (base `066844b`) | 13 | 280 | pass | pass | 0 `examples/` paths | Interaction-feedback follow-up; no baseline change; example suite 19 files / 108 tests |
| 2026-11-24 | uncommitted (base `6525c22`) | 13 | 280 | pass | pass | 0 `examples/` paths | G5 checkpoint; no baseline change; example suite 22 files / 135 tests; `src` diff empty |
| 2026-11-24 | uncommitted (base `46e28b3`) | 13 | 280 | pass | pass | 0 `examples/` paths | G6 checkpoint; no baseline change; example suite 26 files / 153 tests; `src` diff empty |
| 2026-11-24 | uncommitted (base `d775008`) | 13 | 280 | pass | pass | 0 `examples/` paths | G7 checkpoint; no baseline change; example suite 28 files / 176 tests; `src` status and diff empty; example-only `happy-dom` dev dependency added for the shell focus test |
| 2026-11-24 | uncommitted (base `3e8039b`) | 13 | 280 | pass | pass | 0 `examples/` paths | G8 checkpoint; no baseline change; example suite 31 files / 199 tests; `src` status and diff empty; three new P8 suites, no new dependency |
| 2026-11-24 | uncommitted (base `3e8039b`) | 13 | 280 | pass | pass | 0 `examples/` paths | Post-G8 controls follow-up; example suite 32 files / 201 tests; `src` status and diff empty; `--help` capture mode and `g8b` frames |
| 2026-11-24 | uncommitted (base `3e8039b`) | 13 | 280 | pass | pass | 0 `examples/` paths | Room-opening follow-up; example suite 32 files / 202 tests; `src` status and diff empty; `--openings` capture mode and `g8c` frames |

## Per-task evidence links

| Phase | Detailed log | Notable task rows |
|---|---|---|
| P0 | [phase-0-scaffold.md §Execution evidence](phase-0-scaffold.md#execution-evidence) | Storage round-trip, isolation probe, recovery behaviour |
| P1 | [phase-1-dungeon-level.md §Execution evidence](phase-1-dungeon-level.md#execution-evidence) | Map metrics, level/physics/visit tests, traversal proof, low-frame-rate check, reduced-motion focus pass |
| P2 | [phase-2-note-loop.md §Execution evidence](phase-2-note-loop.md#execution-evidence) | Draft/refusal/clear, save failure, keyboard pass |
| P3 | [phase-3-surface-village.md §Execution evidence](phase-3-surface-village.md#execution-evidence) | Surface layout, portal entry/return, reload routing |
| P4 | [phase-4-fishing.md §Execution evidence](phase-4-fishing.md#execution-evidence) | Replay, keep/release, reload recovery, performance |
| P5 | [phase-5-review.md §Execution evidence](phase-5-review.md#execution-evidence) | Review schedule, idempotency, resume/discard, keyboard |
| P6 | [phase-6-creator.md §Execution evidence](phase-6-creator.md#execution-evidence) | Graph mutations, seed idempotency, portals |
| P7 | [phase-7-village.md §Execution evidence](phase-7-village.md#execution-evidence) | Service projections, equipment, NPC lines |
| P8 | [phase-8-journal.md §Execution evidence](phase-8-journal.md#execution-evidence) | Journal, statistics, assistance, settings |
| P9 | [phase-9-shell-mobile.md §Execution evidence](phase-9-shell-mobile.md#execution-evidence) | Title, save bundle, touch |
| P10 | [phase-10-polish.md §Execution evidence](phase-10-polish.md#execution-evidence) | Local gate, performance, accessibility, docs |

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
| Review scheduling | Test for one SM-2 update and at most one reward per (room, pass), plus save/resume/discard across a reload |
| Creator and seeds | Graph mutation tests with typed refusals, idempotent seed test, and portal count from `villageStructures()` |
| Village services | Projection fixtures for populated and empty states, an equipment round-trip, and a frame showing every read-only label |
| Journal and settings | Projection fixtures for empty/one/multi-subject saves, assistance modes/flag, and settings load/save/reset plus a reload observation of all four values |
| Save portability | `Uint8Array` round trip, malformed-import rejection leaving the prior save intact, and one manual export/import |
| Touch operation | Dated touch-only checklist on a phone-sized viewport plus an intent-mapping test against the keyboard path |
| Boundary compliance | [ENGINE-BOUNDARY.md](ENGINE-BOUNDARY.md) is current, and both `src` diff checks are empty at the gate |
| Performance | Dated frame-trace summary with outliers, the environment baseline, or an accepted exception |

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
| P8-O1 | G8 | P8 stores the touch-layout preference, resolves `auto` against `(pointer: coarse)`, and publishes `data-touch-layout`, but there is no touch control surface until P9. The P8-T5 "adds/removes controls immediately" checkbox is deferred rather than marked passed. | Host example | Accepted — P9 consumes the attribute; documented in P8 amendments |
