---
id: ADR-0001
applies_to:
  - "src/**/*.ts"
status: Accepted
---

# ADR-0001: Keep Gameplay Rules Headless And Renderer-Neutral

- **Deciders:** McFuzzySquirrel (maintainer)
- **Date:** 2026-11-23

**Technical Story:** Headless engine extraction (commits `980208f`, `9f7fa59`, `24c35b2`), extracted from Knowledge Dungeon at upstream commit `87c346ae7894af903ca7a514eef2badbcf32e810`.

## Agent Rules

- **MUST:** Keep `src/core/` and `src/application/` free of runtime imports from React, Pixi, Phaser, Electron, the DOM, or a renderer package.
- **MUST:** Express engine results as plain serializable data that a host can render in any UI toolkit.
- **MUST NOT:** Move rendering, input handling, camera behavior, or presentation-only animation into the engine.
- **MUST NOT:** Claim platformer support. The included movement model is grid-based and does not implement gravity or jumping.
- **SHOULD:** Put host-owned responsibilities (rendering, input, durable storage, accessibility) in the README and guides rather than adding them to the engine.

## Verify

- **Check:** `grep -RE "from '(react|pixi\\.js|phaser|electron)'" src` and `npm run typecheck`
- **Expected:** The grep prints no matches; type checking passes.

## Context and Problem Statement

Knowledge Dungeon's rules were originally entangled with a Phaser/React presentation layer, which made the learning model hard to test and impossible to reuse in another interface. Should the gameplay rules remain part of one UI, or become a headless package that multiple hosts can embed?

## Decision Drivers

- Hosts must be able to build web, desktop, mobile, terminal, or side-scrolling interfaces.
- Domain rules must be unit-testable without a browser or a renderer.
- Presentation changes must not change progression, review, or fishing semantics.
- The extraction must stay honest about scope: grid movement is included, platformer physics is not.

## Considered Options

- Keep the rules inside the existing game UI.
- Extract a headless engine package with host-owned presentation and storage.
- Build a general-purpose game engine and fit Knowledge Dungeon on top.

## Decision Outcome

Chosen option: "Extract a headless engine package with host-owned presentation and storage", because it gives the rules one tested home while letting any interface reuse them. The engine exposes state, commands, and pure models; it does not draw, read input, or choose a storage backend. Movement is the grid-based model the original game used, and platformer mechanics remain a host responsibility.

### Positive Consequences

- The same progression and learning rules can serve more than one front end.
- Domain behavior is testable in Node without a canvas.
- The host can replace rendering, input, and persistence independently.

### Negative Consequences

- Hosts must implement rendering, input, accessibility, and durable storage themselves.
- A side-scrolling host cannot reuse the grid collision model and must supply its own movement.
- The package cannot promise feature parity with the original game's presentation layer.

## Pros and Cons of the Options

### Keep the rules inside the existing game UI

- Good, because there is no extraction work and no package boundary.
- Bad, because rules stay coupled to one renderer and remain hard to test or reuse.

### Extract a headless engine package

- Good, because rules become portable, testable, and independently versioned.
- Bad, because every host must supply presentation and persistence.

### Build a general-purpose game engine

- Good, because it could support movement and physics broadly.
- Bad, because it solves a much larger problem than this project has, and most of it would be unused.

## Links

- Implemented by `src/index.ts` and the namespace exports it re-exports.
- Related: [ADR-0009](0009-grid-layout-and-floor-walkability.md).
- See the "Build any interface on top" section of the [README](../../README.md).
