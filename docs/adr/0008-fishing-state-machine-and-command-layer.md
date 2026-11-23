---
id: ADR-0008
applies_to:
  - "src/core/fishing/**/*.ts"
  - "src/application/fishingCommands.ts"
  - "src/fishingPorts.ts"
status: Accepted
---

# ADR-0008: Split Fishing Into A Pure State Machine And An Explicit-Context Command Layer

- **Deciders:** McFuzzySquirrel (maintainer)
- **Date:** 2026-11-23

**Technical Story:** Fishing rebuild from the scene-embedded state machine; the "eligibility, recall selection, and persistence may use different subject contexts" defect in the source application.

## Agent Rules

- **MUST:** Keep `src/core/fishing/fishingStateMachine.ts` pure: no renderer, no clock read, no global randomness, no storage.
- **MUST:** Pass `nowMs`, the seeded `rng`, and the viewport in as inputs; refuse an illegal event with `accepted: false` and an unchanged state rather than throwing.
- **MUST:** Create one `FishingContext` at `fishing/session-begin` and carry it unchanged through cast, bite, keep, release, and read.
- **MUST:** Refuse any command whose supplied context disagrees with the open session's subject, subject name, or asserted room.
- **MUST:** Require at least one cleared room (`isFishingEligible`) to fish.
- **MUST NOT:** Mutate progression on `fishing/catch-release` or on a failed recall.
- **MUST NOT:** Award a keep twice for the same session, cast, catalogue id, and recall outcome.

## Verify

- **Check:** `npm test -- tests/phase17/fishingStateMachine.test.ts tests/phase17/fishingCommands.test.ts tests/unit/fishingMechanics.test.ts`
- **Expected:** Legal and illegal transitions, seeded reproducibility, context-mismatch refusals, release/failed-recall no-op behavior, and duplicate-catch suppression all pass.

## Context and Problem Statement

Fishing needs deterministic timing and rolling for tests, but it also needs to award XP, badges, and a fish entry to the right subject. Should one module do both, or should the simulation and the durable transaction be separate?

## Decision Drivers

- The cast/bite/reel loop must be testable without a browser or a canvas.
- Eligibility and persistence must agree on the subject.
- A released or failed fish must not mutate progression.
- A retried keep must not pay twice.

## Considered Options

- Keep the whole fishing flow in one scene-like module.
- Use a pure state machine for the simulation and a command layer for persistence.
- Let the renderer own the state and call store actions directly.

## Decision Outcome

Chosen option: "Use a pure state machine for the simulation and a command layer for persistence", because it separates timing from ownership. The machine decides phases, bites, movement, and the seeded roll; the command layer decides which subject a catch belongs to and whether it may be paid. The explicit context is the single answer to "which subject is this pond session about".

### Positive Consequences

- A whole session can be replayed with the same seed and event sequence.
- Eligibility, recall, and persistence all read one context.
- Release and failed recall are non-mutating by construction.

### Negative Consequences

- The host must drive ticks and send state-machine outcomes as commands.
- Two layers mean two places to keep the context honest.
- The command interface assumes the host sends real results; it is not an anti-cheat boundary.

## Pros and Cons of the Options

### One scene-like module

- Good, because it is close to the original code.
- Bad, because rendering, timing, and persistence stay coupled and hard to test.

### Pure machine plus command layer

- Good, because simulation is deterministic and persistence has one owner.
- Bad, because the host carries more wiring.

### Renderer-owned state

- Good, because the UI has direct control.
- Bad, because rules and rewards depend on presentation events.

## Links

- Implemented by `src/core/fishing/`, `src/application/fishingCommands.ts`, and `src/fishingPorts.ts`.
- Related: [ADR-0003](0003-injected-time-randomness-identifiers.md), [ADR-0005](0005-award-once-reward-ledgers.md).
- See "Fishing" in the [user guide](../user-guide.md#fishing).
