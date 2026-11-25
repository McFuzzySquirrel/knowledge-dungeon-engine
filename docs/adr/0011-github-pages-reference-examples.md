---
id: ADR-0011
applies_to:
  - ".github/workflows/deploy-example.yml"
  - "examples/**"
status: Accepted
---

# ADR-0011: Publish Reference Examples As Subpaths Of One GitHub Pages Site

- **Deciders:** McFuzzySquirrel (maintainer)
- **Date:** 2026-11-25

**Technical Story:** The P10 plan deliberately kept the side-scroller local (D-13). The
reference example is now complete and should be playable without a local checkout, while
future hosts should be able to land without becoming separate deployments.

## Agent Rules

- **MUST:** Publish each `examples/<name>` branch at
  `https://<owner>.github.io/<repo>/examples/<name>/`; do not create one Pages site per
  branch or repository.
- **MUST:** Build from the example package at the branch path with the Pages base
  (`--base="/<repo>/examples/<name>/"`), and copy only `dist` to
  `gh-pages/examples/<name>/`.
- **MUST:** Preserve the `gh-pages` landing page and every other example directory on
  each deploy.
- **MUST:** Give each hosted example a unique IndexedDB database name and `localStorage`
  key. Pages examples share one origin, so storage is not isolated by path.
- **MUST NOT:** Deploy source, plan documents, visual-record PNGs, secrets, analytics, or a
  backend from this workflow. The example remains a static, local-save host.
- **MUST NOT:** Edit `src/`, the engine export map, or the storage schema to support
  hosting.

## Verify

- **Check:** the `Deploy reference example` workflow succeeds on the `examples/*` branch;
  the published `index.html` returns 200 and its `assets/*` requests return 200.
- **Check:** a production smoke run against the Pages URL reports the title, a
  non-zero canvas, zero failed resources, and zero console errors.
- **Expected:** the landing page links to the example; local `npm --prefix
  examples/side-scroller run gate` still passes; `git status --short src` is empty.

## Context and Problem Statement

GitHub Pages serves one published site per repository. The side-scroller lives on its own
`examples/side-scroller` branch, and future hosts will live on sibling `examples/*`
branches. Publishing a branch directly would serve Vite source (`/src/main.ts`), not a
built app. Publishing separate repositories would duplicate the engine and break the
additive example boundary. How should multiple examples be hosted from one repository?

## Decision Drivers

- A visitor should reach a side-view example without installing Node.
- Future examples should add a path, not a second deployment mechanism.
- The engine repository must keep `src`, exports, and storage unchanged.
- The plan’s local-gate and evidence rules must remain valid.
- The site must be static; saves stay in the browser.

## Considered Options

- Deploy the source branch directly with GitHub Pages.
- Publish one example at the site root and switch the Pages source branch when changing
  examples.
- Publish each example branch into its own subpath of one `gh-pages` site.
- Put each example in a separate repository with its own Pages site.

## Decision Outcome

Chosen option: **publish each example branch into its own subpath of one `gh-pages`
site**, because it keeps one durable URL, supports future examples side by side, and
leaves the engine repository additive.

The current site is:

```text
https://mcfuzzysquirrel.github.io/knowledge-dungeon-engine/
  index.html
  .nojekyll
  examples/side-scroller/
```

`gh-pages` is the Pages source (`Deploy from a branch`, root). A workflow on every
`examples/**` branch builds that branch's example package, tests it, typechecks it, and
copies `dist` to `gh-pages/<branch-name>/` with the landing page preserved. Branch names
with slashes become directory paths (`examples/side-scroller` → `/examples/side-scroller/`).

### Positive Consequences

- One stable landing URL and one path per example.
- Adding an example is a branch plus a landing link, not a new Pages site.
- Only built assets are public; the source branch and the 4 MB visual record stay out of
  the deployed site.
- The engine package remains independent of the hosting decision.

### Negative Consequences

- GitHub Pages has one site per repository, so examples cannot have independent domains
  without separate repositories or a custom-domain proxy.
- The deploy workflow and `gh-pages` landing page are additional maintenance.
- All examples share the `github.io` origin: storage keys must be namespaced.
- The workflow is copied into each example branch; a future change must be rolled out to
  every example branch (or moved to a reusable workflow).
- D-13’s “no deployment” clause no longer describes the reference-example hosting. The
  engine plan and local gate otherwise remain unchanged.

## Pros and Cons of the Options

### Deploy the source branch directly

- Good, because it needs no build step.
- Bad, because Pages would serve the Vite entry source and the app would not boot.

### One example at the root, switch the source branch

- Good, because it is the simplest one-example setup.
- Bad, because only one example is live at a time and switching requires a Settings
  change or a deployment that replaces the site.

### One `gh-pages` site with per-example subpaths

- Good, because it is the only option that keeps one URL while allowing future examples
  side by side.
- Bad, because of the shared-origin storage rule and the landing/workflow maintenance.

### Separate repositories per example

- Good, because each example gets its own site and origin.
- Bad, because it duplicates the engine and makes the additive boundary harder to audit.

## Links

- [Pages workflow](../../.github/workflows/deploy-example.yml)
- [Side-scroller example](../../examples/side-scroller/README.md)
- [Engine boundary](../plans/side-scroller-host/ENGINE-BOUNDARY.md)
- [P10 plan](../plans/side-scroller-host/phase-10-polish.md)
