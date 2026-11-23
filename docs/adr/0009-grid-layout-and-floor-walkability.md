---
id: ADR-0009
applies_to:
  - "src/core/layout/**/*.ts"
  - "src/world/**/*.ts"
status: Accepted
---

# ADR-0009: Derive Grid Layout, Floor Visibility, And Walkability From The Topic Graph

- **Deciders:** McFuzzySquirrel (maintainer)
- **Date:** 2026-11-23

**Technical Story:** Renderer-neutral extraction of the Phaser scene's dungeon layout and collision arithmetic.

## Agent Rules

- **MUST:** Generate the dungeon layout deterministically from the subject graph and a stable seed (the subject id by default).
- **MUST:** Place rooms by breadth-first traversal from the root and mirror parent/child plus cross-link edges as corridors.
- **MUST:** Rebuild the walkability mask for the visible floor whenever the floor changes.
- **MUST:** Exclude every corridor with a hidden endpoint, including the half that lies inside a visible room.
- **MUST:** Reject non-finite movement input, negative elapsed time, unknown rooms, and invalid portal transitions.
- **MUST NOT:** Let a hidden-floor room or corridor be walkable.
- **MUST NOT:** Reuse a navigation controller after the subject graph changes; recreate it from the new dungeon metadata.
- **SHOULD:** Apply the teleport cooldown (120,000 ms) as an engine rule, not a renderer animation.

## Verify

- **Check:** `npm test -- tests/unit/world.test.ts tests/unit/dungeonGenerator.test.ts`
- **Expected:** Layout determinism, blocked off-map movement, hidden-room exclusion, portal floor switching, and cooldown tests pass.

## Context and Problem Statement

The dungeon needs rooms, corridors, floors, and collision, but the graph is the source of truth. Should the layout be authored separately, or derived from the topic graph?

## Decision Drivers

- The graph is edited in the Creator phase, so layout must follow it.
- Hidden floors must hide both rooms and the corridors that reach them.
- Tests must validate collision and visibility without a canvas.
- Navigation state belongs to one world mount and one graph generation.

## Considered Options

- Author a separate tile map per subject.
- Derive positions and corridors from the graph on each mount.
- Let the renderer compute collision from whatever it drew.

## Decision Outcome

Chosen option: "Derive positions and corridors from the graph on each mount", because it keeps one source of truth and makes layout reproducible. `generateDungeonMap` does a deterministic BFS placement and carves axis-aligned corridors; `createDungeonNavigation` builds a walkability mask for the current visible floor and reports portals, positions, and cooldown. The renderer draws the result; it does not decide what is walkable.

### Positive Consequences

- Graph edits are reflected in the next generated layout.
- Hidden floors cannot be crossed through a partially visible corridor.
- Collision and visibility are unit-testable.

### Negative Consequences

- The layout is grid-based and not suitable for platformer movement.
- Every graph change requires a new navigation controller.
- Deterministic placement can still produce a crowded layout for very large graphs.

## Pros and Cons of the Options

### Hand-authored tile map

- Good, because layout can be art-directed.
- Bad, because it duplicates the graph and drifts from it.

### Derive from the graph

- Good, because one source of truth and reproducible tests.
- Bad, because the result is algorithmic rather than hand-designed.

### Renderer computes collision

- Good, because the renderer has final say.
- Bad, because rules and visuals can disagree, and collision cannot be tested headlessly.

## Links

- Implemented by `src/core/layout/` and `src/world/`.
- Related: [ADR-0001](0001-headless-renderer-neutral-engine.md).
- See "Movement and navigation" in the [user guide](../user-guide.md#movement-and-navigation).
