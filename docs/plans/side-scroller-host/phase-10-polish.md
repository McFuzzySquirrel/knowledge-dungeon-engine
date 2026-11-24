# P10 — Local Polish, Hardening, and Documentation

| Field | Value |
|---|---|
| Phase | P10 |
| Parent | [Implementation plan](README.md) |
| Depends on | P5–P9 |
| Blocks | — |
| Requirements | R-21, R-22 |
| Exit gate | [G10](#exit-gate-g10) |
| Status | Not started |

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

- [ ] Run the first-ten-minutes script on a fresh save:
      title → archetype → street → tutorial → clear three rooms → review due →
      Creator → create a subject → enter it → fish → keep/release → journal →
      every service → export → clear → import → reload.
- [ ] Run it again on a save with three demo subjects and one created subject.
- [ ] Record every console error/warning, layout collision, dead control, and confusing
      message as a numbered issue with a repro.
- [ ] Fix only issues within P0–P9's scope; log anything else for a later plan.
- [ ] Re-run the path after fixes.

### P10-T2 — Presentation polish

- [ ] Review the street, dungeon, pond, and every service overlay at desktop and phone
      widths. Fix overlap, clipping, and inconsistent spacing.
- [ ] Make the prompt, toast, recovery banner, and service dialogs share one stacking
      order and never cover each other.
- [ ] Add short, reduced-motion-safe transitions between screens where they clarify the
      change; no decorative motion.
- [ ] Ensure every interactive control has a visible focus state.
- [ ] Ensure every empty state names the action that fills it.
- [ ] Keep placeholder rectangles; improve their labels, contrast, and layout only.

### P10-T3 — Accessibility pass

- [ ] Keyboard-only run of the full path, including services, journal, review, Creator,
      fishing, title, and import.
- [ ] Focus order per screen; focus returns to `#game` or the invoking control.
- [ ] Screen-reader announcements: live region is polite, short, and never reads learner
      note text or a recall prompt verbatim.
- [ ] Reduced motion: camera, transitions, and animations disabled; no motion is forced.
- [ ] Large text: HUD, dialogs, and canvas labels do not clip at the large setting.
- [ ] Contrast: status, rarity, due state, and validation are not colour-only.
- [ ] Touch targets ≥ 44 px; no hover-only affordance.
- [ ] Record the dated checklist result in the phase evidence.

### P10-T4 — Performance and resilience

- [ ] Capture 10-second frame traces at: street, dungeon room, pond, Library, and journal.
      Record average, p95, max, and the long-frame count.
- [ ] Document the headless-Firefox compositor exception (P2-O1) if it still applies;
      compare against an `about:blank` baseline.
- [ ] Confirm no `snapshot()` call in any frame callback; grep and record.
- [ ] Confirm the single subscription is the only state path; no per-frame projection of
      the whole `EngineState`.
- [ ] Check IndexedDB growth after a scripted run (rooms, notes, attachments, fish,
      statistics); record the size and that it remains bounded by the fixture.
- [ ] Confirm a quota failure is visible and does not corrupt the prior state.
- [ ] Confirm the production build boots with no console errors and no missing assets.

### P10-T5 — Local gate script

- [ ] Add `examples/side-scroller/scripts/gate.mjs` (host tooling, no engine change).
- [ ] It runs, from the repo root:
      - root `npm test`, typecheck, build;
      - example test, typecheck, build;
      - `npx vitest list --config vitest.config.ts` and asserts zero `examples/` paths;
      - `git status --short src` and `git diff --stat src` and asserts both empty;
      - prints a summary table with pass/fail and the engine/example test counts.
- [ ] Exit non-zero on any failure; do not swallow output.
- [ ] Add an example-package `gate` script that invokes it.
- [ ] Do **not** add a root package script; S-05 permits only the Vitest exclusion.
- [ ] Document the script in the example README.

### P10-T6 — Documentation

- [ ] `examples/side-scroller/README.md`: what it is, controls, architecture map, how to
      run/test/build, how to capture visuals, known limits (no audio/art/trade/cloud),
      and the engine-boundary rule.
- [ ] Root `README.md`: link the example from the “What's Next” host-examples bullet, and
      note that CI/deployment remain deferred.
- [ ] `docs/host-ui-guide.md`: add the example as a worked reference under
      “Platform Considerations”.
- [ ] Refine [ENGINE-BOUNDARY.md](ENGINE-BOUNDARY.md) with anything P5–P9 learned; keep it
      plan-scoped until a second UI is scheduled.
- [ ] `docs/plans/side-scroller-host/README.md`: status board, phase map, assumptions, and
      change log to the final state.
- [ ] Add a short “first ten minutes” playtest script to the plan folder.
- [ ] Do not add ADRs unless a decision is durable beyond this example.

### P10-T7 — Final evidence and visual record

- [ ] Capture a dated final run with every mode: dungeon, note loop, surface, fishing,
      review, Creator, services, journal, title/mobile.
- [ ] Index every new frame in [VISUALS.md](VISUALS.md) with conditions and a manifest.
- [ ] Write G10 into the phase evidence and [EVIDENCE.md](EVIDENCE.md): commands, counts,
      engine diff, performance, accessibility, and accepted exceptions.
- [ ] Confirm the engine baseline is still 13 files / 280 tests.
- [ ] Confirm `examples/side-scroller/` is the only added tree and the root config diff is
      still only the Vitest exclusion.

## Exit gate G10

- [ ] The first-ten-minutes path completes with no console errors.
- [ ] Desktop and phone-width layouts have no overlap, clipping, or unreachable control.
- [ ] Keyboard-only, reduced-motion, large-text, and touch runs pass and are recorded.
- [ ] Frame traces show the accepted performance profile, with any exception documented.
- [ ] A single local gate script reproduces every automated check.
- [ ] The example README and root docs links are accurate.
- [ ] Every phase's evidence is present, with visuals and manifests.
- [ ] Root and example suites, typechecks, and builds green; engine count unchanged.
- [ ] No engine source diff.
- [ ] G10 entry written in [EVIDENCE.md](EVIDENCE.md).

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
| | | | | | |
