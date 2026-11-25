# P10 — Local Polish, Hardening, and Documentation

| Field | Value |
|---|---|
| Phase | P10 |
| Parent | [Implementation plan](README.md) |
| Depends on | P5–P9 |
| Blocks | — |
| Requirements | R-21, R-22 |
| Exit gate | [G10](#exit-gate-g10) |
| Status | Complete — G10 passed 2026-11-25 |

## Objective

Finish the local example: smooth the presentation without adding art or audio, run the
accessibility and performance passes, make the console clean, write the example's own
documentation, and leave one repeatable local gate. There is no CI workflow and no
deployment in this plan; both are explicitly deferred.

This phase is deliberately **not** an art pass. Placeholder rectangles stay. The polish is
layout, affordances, transitions, focus, text, and the removal of rough edges found by
playing all six phases end to end.

## Non-goals

- Sprites, tilesets, sound effects, music, voice, or a mute control.
- GitHub Actions, Pages, Netlify, or any hosted deployment.
- PWA/service-worker install.
- New gameplay features. Bugs found here are fixed; new systems wait for a new plan.
- Engine changes, including performance work in `src/`.

## Inputs and references

| What | Where |
|---|---|
| All prior phases | P0–P9 |
| Boundary rules | [ENGINE-BOUNDARY.md](ENGINE-BOUNDARY.md) |
| Visual record | [VISUALS.md](VISUALS.md) |
| Evidence | [EVIDENCE.md](EVIDENCE.md) |
| Claim → proof table | [EVIDENCE.md §What counts as proof](EVIDENCE.md#what-counts-as-proof) |
| Capture tooling | [`examples/side-scroller/scripts/capture-dungeon.mjs`](../../../examples/side-scroller/scripts/capture-dungeon.mjs) |

## Work breakdown

### P10-T1 — End-to-end playtest and bug list

- [x] Run the first-ten-minutes script on a fresh save:
      title → archetype → street → tutorial → clear three rooms → review due →
      Creator → create a subject → enter it → fish → keep/release → journal →
      every service → export → clear → import → reload.
- [x] Run it again on a save with three demo subjects and one created subject.
- [x] Record every console error/warning, layout collision, dead control, and confusing
      message as a numbered issue with a repro.
- [x] Fix only issues within P0–P9's scope; log anything else for a later plan.
- [x] Re-run the path after fixes.

### P10-T2 — Presentation polish

- [x] Review the street, dungeon, pond, and every service overlay at desktop and phone
      widths. Fix overlap, clipping, and inconsistent spacing.
- [x] Make the prompt, toast, recovery banner, and service dialogs share one stacking
      order and never cover each other.
- [x] Add short, reduced-motion-safe transitions between screens where they clarify the
      change; no decorative motion.
- [x] Ensure every interactive control has a visible focus state.
- [x] Ensure every empty state names the action that fills it.
- [x] Keep placeholder rectangles; improve their labels, contrast, and layout only.

### P10-T3 — Accessibility pass

- [x] Keyboard-only run of the full path, including services, journal, review, Creator,
      fishing, title, and import.
- [x] Focus order per screen; focus returns to `#game` or the invoking control.
- [x] Screen-reader announcements: live region is polite, short, and never reads learner
      note text or a recall prompt verbatim.
- [x] Reduced motion: camera, transitions, and animations disabled; no motion is forced.
- [x] Large text: HUD, dialogs, and canvas labels do not clip at the large setting.
- [x] Contrast: status, rarity, due state, and validation are not colour-only.
- [x] Touch targets ≥ 44 px; no hover-only affordance.
- [x] Record the dated checklist result in the phase evidence.

### P10-T4 — Performance and resilience

- [x] Capture 10-second frame traces at: street, dungeon room, pond, Library, and journal.
      Record average, p95, max, and the long-frame count.
- [x] Document the headless-Firefox compositor exception (P2-O1) if it still applies;
      compare against an `about:blank` baseline.
- [x] Confirm no `snapshot()` call in any frame callback; grep and record.
- [x] Confirm the single subscription is the only state path; no per-frame projection of
      the whole `EngineState`.
- [x] Check IndexedDB growth after a scripted run (rooms, notes, attachments, fish,
      statistics); record the size and that it remains bounded by the fixture.
- [x] Confirm a quota failure is visible and does not corrupt the prior state.
- [x] Confirm the production build boots with no console errors and no missing assets.

### P10-T5 — Local gate script

- [x] Add `examples/side-scroller/scripts/gate.mjs` (host tooling, no engine change).
- [x] It runs, from the repo root:
      - root `npm test`, typecheck, build;
      - example test, typecheck, build;
      - `npx vitest list --config vitest.config.ts` and asserts zero `examples/` paths;
      - `git status --short src` and `git diff --stat src` and asserts both empty;
      - prints a summary table with pass/fail and the engine/example test counts.
- [x] Exit non-zero on any failure; do not swallow output.
- [x] Add an example-package `gate` script that invokes it.
- [x] Do **not** add a root package script; S-05 permits only the Vitest exclusion.
- [x] Document the script in the example README.

### P10-T6 — Documentation

- [x] `examples/side-scroller/README.md`: what it is, controls, architecture map, how to
      run/test/build, how to capture visuals, known limits (no audio/art/trade/cloud),
      and the engine-boundary rule.
- [x] Root `README.md`: link the example from the “What's Next” host-examples bullet, and
      note that CI/deployment remain deferred.
- [x] `docs/host-ui-guide.md`: add the example as a worked reference under
      “Platform Considerations”.
- [x] Refine [ENGINE-BOUNDARY.md](ENGINE-BOUNDARY.md) with anything P5–P9 learned; keep it
      plan-scoped until a second UI is scheduled.
- [x] `docs/plans/side-scroller-host/README.md`: status board, phase map, assumptions, and
      change log to the final state.
- [x] Add a short “first ten minutes” playtest script to the plan folder.
- [x] Do not add ADRs unless a decision is durable beyond this example.

### P10-T7 — Final evidence and visual record

- [x] Capture a dated final run with every mode: dungeon, note loop, surface, fishing,
      review, Creator, services, journal, title/mobile.
- [x] Index every new frame in [VISUALS.md](VISUALS.md) with conditions and a manifest.
- [x] Write G10 into the phase evidence and [EVIDENCE.md](EVIDENCE.md): commands, counts,
      engine diff, performance, accessibility, and accepted exceptions.
- [x] Confirm the engine baseline is still 13 files / 280 tests.
- [x] Confirm `examples/side-scroller/` is the only added tree and the root config diff is
      still only the Vitest exclusion.

## Playtest findings

The dated `--p10` run and a desktop/phone review found these issues. None needed a new
feature or an engine change.

| ID | Symptom | Fix |
|---|---|---|
| P10-1 | Prompt, toast, and recovery banner used three fixed offsets; a toast could cover the open progress panel, and independently positioned notices could collide. | One top bar holds a single notice column beside the progress toggle; the desktop panel shortens the column with `data-progress`. |
| P10-2 | On a phone sheet the touch pad remained painted underneath the 96%-opaque sheet, so it bled through and could not be reached. | `syncTouchVisibility()` hides the pad while the sheet or any modal is open; the sheet is opaque. |
| P10-3 | At large text on 390×844 the prompt overlapped the Progress button because a fixed `9rem` reserve no longer matched the button width. | The top bar is a flex row: the notice column and the toggle negotiate width, so they cannot overlap at any text size. |
| P10-4 | Library and journal traces measured ~31–33 ms average because the canvas kept repainting the same world under an covering modal. | The frame loop renders one frame after a resize and then skips repaint while a modal is open; both surfaces now match the `about:blank` baseline. |
| P10-5 | Dense panel buttons (including the Controls button) were 36 px tall, below the touch target rule. | Global buttons/selects have a 2.75 rem minimum; the P10 audits report zero targets under 44 px. |
| P10-6 | A few empty states named what was absent but not the action that fills them. | Journal progress/records/due/assistance and Creator cross-links now name the action. |

The automated path enters the created subject last through the journal and ends in that
dungeon. That is deliberate: the journal's portal entry uses the same engine command as
the street and does not depend on guessing a newly generated room graph. The manual
playtest script still requires a physical walk-out through the shaft.

## P10 accessibility checklist (2026-11-25)

| Check | Result | Proof |
|---|---|---|
| Keyboard-only full path | Pass | `--p10` drives title, movement, note, review, Creator, journal, fishing, and import; the keyboard regression records Continue → `#game`, walk, `J` open/close |
| Focus order and return | Pass | Title traps Tab/Shift+Tab; journal/service/help focus their headings; closing returns to `#game` or the title's primary action |
| Live region | Pass | One polite, atomic region; announcements name outcomes and actions, never note text or the recall prompt verbatim |
| Reduced motion | Pass | CSS arrivals use the same `prefers-reduced-motion`/`data-reduced-motion` rules; camera snapping is tested; reduced-motion journal run recorded |
| Large text | Pass | DOM text at 20 px and canvas labels at 1.3×; journal audit reports no horizontal page overflow, no clipped dialog, zero targets under 44 px |
| Non-colour status | Pass | Room clear/review labels, due dates, rarity, and validation messages all carry text, not colour alone |
| Touch targets | Pass | P10 audits report zero visible buttons/selects under 44 px; P9 records the touch pad at 44 px minimum |
| No hover-only affordance | Pass | Every pointer action has a visible button or a keyboard equivalent; hover only changes the background |

## P10 performance record (2026-11-25)

Environment: headless Firefox 150, 1280×800 CSS viewport, software compositing, Vite dev
server. Each row is a 10-second `requestAnimationFrame` window; `about:blank` is the
environment baseline. Raw manifest:
[`2026-11-25-g10perf-manifest.json`](visuals/p10/2026-11-25-g10perf-manifest.json).

| Surface | Frames | Average | p95 | Max | Over 16.7 ms |
|---|---:|---:|---:|---:|---:|
| `about:blank` | 576 | 17.37 ms | 17.14 ms | 67.40 ms | 332 |
| Dungeon room | 419 | 23.93 ms | 33.48 ms | 34.24 ms | 305 |
| Lower dungeon room | 400 | 25.02 ms | 33.78 ms | 49.98 ms | 298 |
| Street | 333 | 30.12 ms | 33.84 ms | 50.40 ms | 303 |
| Pond | 602 | 16.62 ms | 17.12 ms | 17.54 ms | 330 |
| Library | 601 | 16.64 ms | 17.10 ms | 17.14 ms | 343 |
| Journal | 601 | 16.64 ms | 17.12 ms | 17.42 ms | 339 |

The Pond, Library, and Journal match the `about:blank` cadence; Library and Journal were
~31–33 ms before P10 paused canvas repaint under an covering modal. The canvas-heavy Street
and dungeon rooms add 6–13 ms over the software baseline and are the accepted
[P2-O1](EVIDENCE.md#open-issues-and-exceptions) environment exception, not a rule or
projection regression. No frame callback calls `snapshot()`; the only boot/seed calls are
in `engine.ts` and `creator/seeds.ts`. `subscribeState` is called once at boot, and the
frame loop reads the cached state and the host's own local world.

IndexedDB after the scripted perf run: state JSON 20,804 bytes for 4 subjects / 16 rooms;
`navigator.storage.estimate()` reports 57,414 bytes used of 837,074,944 available. The P10
playtest grew the same fixture to 33,222 bytes for 5 subjects / 20 rooms, one 54-byte
attachment, and one fish. Growth follows the fixture, not time. The save-failure suite
(`tests/saveFailure.test.ts`, 3 tests) proves a rejected write is visible and leaves the
prior state intact.

## Exit gate G10

- [x] The first-ten-minutes path completes with no console errors.
- [x] Desktop and phone-width layouts have no overlap, clipping, or unreachable control.
- [x] Keyboard-only, reduced-motion, large-text, and touch runs pass and are recorded.
- [x] Frame traces show the accepted performance profile, with any exception documented.
- [x] A single local gate script reproduces every automated check.
- [x] The example README and root docs links are accurate.
- [x] Every phase's evidence is present, with visuals and manifests.
- [x] Root and example suites, typechecks, and builds green; engine count unchanged.
- [x] No engine source diff.
- [x] G10 entry written in [EVIDENCE.md](EVIDENCE.md).

## Validation commands

```sh
node examples/side-scroller/scripts/gate.mjs
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
| Full-path playtest and issue list | `general` | Nothing (read-only report) | Running app, capture script | Numbered issues + repros | Run first |
| Accessibility audit | `general` | Nothing (read-only report) | Running app, checklist | Dated results | Parallel with performance |
| Performance captures | `general` | Nothing (host artifacts) | Running app | Trace summaries | Parallel |
| Gate script | `general` | `examples/side-scroller/scripts/gate.mjs` | Command list | Script + output | Before docs |
| Docs and final visuals | Main agent | README files, VISUALS, EVIDENCE | All results | Final package | Final |

Guardrails: audit agents do not edit host code; the main agent fixes issues and runs the
gate; no engine edits.

## Phase-specific risks

- **Scope creep.** “Polish” becomes a redesign. Fix only issues found by the playtest.
- **Perf numbers without context.** Record the environment and the `about:blank` baseline;
  a raw max frame is not evidence on its own.
- **Docs drift.** Write the README from the running build, not from the phase plan.
- **CI temptation.** The plan stays local by decision. Mention CI as deferred, do not add
  a workflow.
- **Art temptation.** Placeholder rectangles stay; a “small icon” is an art pipeline.

## Rollback

Delete the example, its README, the plan docs, and the visual record; revert the Vitest
exclusion. P10 adds no engine state, so no migration is needed. Exported save bundles are
portable JSON and remain readable by an engine alone.

## Execution evidence

| Date (UTC) | Task/Gate | Commit | Command or artifact | Result | Notes |
|---|---|---|---|---|---|
| 2026-11-25 | P10-T1 — first-ten-minutes playtest | uncommitted | `node examples/side-scroller/scripts/capture-dungeon.mjs --out docs/plans/side-scroller-host/visuals/p10 --prefix 2026-11-25-g10play --p10`; [manifest](visuals/p10/2026-11-25-g10play-manifest.json) | pass | One real session: title → archetype → street → three clears → review pass → fishing keep → journal → export/clear/import → Creator → new subject clear. BiDi log subscription recorded 0 console errors/warnings. The dated `--services` run covers every village interior on the same tree; 12 playtest frames. |
| 2026-11-25 | P10-T2 — presentation polish | uncommitted | same `--p10` manifest plus `--shell` and `--services` | pass | Desktop, phone sheet, Creator, and large-text audits: 0 HUD overlaps, 0 visible buttons/selects under 44 px, 0 page overflow, 0 clipped dialogs. Fixed the six findings above. One layer scale: world < touch < notices < HUD/title < modal; a modal intentionally owns the screen, while prompt, recovery, and toast never overlap each other. All services share one full-screen, focus-trapped shell: `--services` captures each interior at desktop, and the same shell's phone behavior is sampled by the 390×844 journal/review and sheet frames. |
| 2026-11-25 | P10-T3 — accessibility pass | uncommitted | `--p10` keyboard regression; `--reduced-motion --journal`; `--p10` large-text and phone frames | pass | Keyboard focus title → `#game`, journal heading, service/help/review traps; live region polite/atomic; code review of every `hud.announce` call shows room/subject labels and actions, never the note body or recall prompt; large text no clip; reduced-motion run has `matchMedia` true; dated checklist above. |
| 2026-11-25 | P10-T4 — frame traces and state path | uncommitted | `node examples/side-scroller/scripts/capture-dungeon.mjs --out docs/plans/side-scroller-host/visuals/p10 --prefix 2026-11-25-g10perf --perf`; [manifest](visuals/p10/2026-11-25-g10perf-manifest.json) | pass | `about:blank` 17.37 ms avg; dungeon 23.93/33.48/34.24; lower 25.02/33.78/49.98; street 30.12/33.84/50.40; pond 16.62/17.12/17.54; Library 16.64/17.10/17.14; Journal 16.64/17.12/17.42 (avg/p95/max ms). Pond and modals match baseline; canvas-heavy surfaces carry P2-O1. `snapshot()` only in boot/seed (grep: `engine.ts:59,71`, `creator/seeds.ts:107`; none in `main.ts`, `render/`, or a frame callback), one `subscribeState`, state JSON 20,804 B / 4 subjects / 16 rooms, 57,414 B used of 837 MB. |
| 2026-11-25 | P10-T4 — save failure | uncommitted | `npx vitest run tests/saveFailure.test.ts` | pass | 3/3 tests; a rejected write shows “Not saved” and leaves the prior state intact (P2/P4 frames retained). |
| 2026-11-25 | P10-T4 — production build boot | uncommitted | `npm --prefix examples/side-scroller run build`; `npm --prefix examples/side-scroller run preview -- --port 4173`; `node examples/side-scroller/scripts/capture-dungeon.mjs --out docs/plans/side-scroller-host/visuals/p10 --prefix 2026-11-25-g10prod --smoke --base http://localhost:4173/`; [manifest](visuals/p10/2026-11-25-g10prod-manifest.json) | pass | Production `dist` boots: title in 343 ms, canvas 1280×800, 0 failed resources, 0 console errors/warnings. |
| 2026-11-25 | P10-T5 — local gate | uncommitted | `node examples/side-scroller/scripts/gate.mjs` | pass | 10/10 checks: root test/typecheck/build, example test/typecheck/build, 0 `examples/` paths, empty `src` status and diff. Engine 13 files / 280 tests; example 35 files / 228 tests. |
| 2026-11-25 | P10-T6 — documentation | uncommitted | `examples/side-scroller/README.md`, root `README.md`, `docs/host-ui-guide.md`, `ENGINE-BOUNDARY.md`, plan `README.md`, `first-ten-minutes.md` | pass | Status, controls, architecture, gate, known limits, worked reference, boundary refinements, final board, and playtest script updated. No ADR added. |
| 2026-11-25 | P10-T7 — final visual record | uncommitted | `visuals/p10/`; 12 manifests; [VISUALS.md](VISUALS.md#p10--local-polish-performance-and-the-final-record) | pass | 125 frames across the first-ten-minutes path, performance, shell, surface, fishing, review, Creator, services, journal, dungeon + note loop, reduced motion, and production boot; 256-colour PNGs (4.2 MB total). Every frame is indexed with its manifest. |
| 2026-11-25 | P10-T7 — tree and boundary | uncommitted | `git status --short`, `git diff --stat`, gate checks | pass | `src` status and diff empty; root `package.json`, `vitest.config.ts`, and `tsconfig.json` diffs empty. Changes are `examples/side-scroller/`, its plan/docs, and root README/CHANGELOG/host-guide. |
| 2026-11-25 | G10 — exit gate | uncommitted (base `5b76c82`) | gate + `--p10` + `--perf` + `--smoke` + visual record | pass | First-ten-minutes path 0 console errors; desktop/phone/large-text audits 0 overlaps/clips; keyboard, reduced-motion, large-text, and touch pass; Pond/modals match baseline while canvas surfaces carry P2-O1; gate 10/10; engine 13/280 and example 35/228; no `src` diff; G10 written in EVIDENCE. |
