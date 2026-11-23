---
id: ADR-0003
applies_to:
  - "src/creatorEngine.ts"
  - "src/application/**/*.ts"
  - "src/core/fishing/fishingStateMachine.ts"
status: Accepted
---

# ADR-0003: Inject Time, Randomness, And Identifiers Into Gameplay Paths

- **Deciders:** McFuzzySquirrel (maintainer)
- **Date:** 2026-11-23

**Technical Story:** Determinism requirements carried over from the original fishing state machine and the headless engine facade.

## Agent Rules

- **MUST:** Require `nowIso` and `newRoomId` in `CreatorEngineOptions`, and accept optional `random`, `newSessionId`, `newStudySessionId`, and `newAttachmentId` factories.
- **MUST:** Make pure state machines accept the clock value (`nowMs`) and the random stream (`rng`) as arguments on each event or tick.
- **MUST NOT:** Read `Date.now()`, call `Math.random()`, or mint `crypto.randomUUID()` inside a command controller or the fishing state machine when the value affects gameplay state.
- **MUST NOT:** Read the host clock inside `src/core/fishing/fishingStateMachine.ts`.
- **SHOULD:** Keep convenience defaults (`Math.random`, current time) only in low-level helpers that are documented as non-deterministic, and have engine paths pass explicit values.

## Verify

- **Check:** `npm test -- tests/phase17/fishingStateMachine.test.ts tests/phase17/fishingCommands.test.ts tests/unit/creatorEngine.test.ts`
- **Expected:** Seeded-session reproducibility, injected clock, and idempotent-command tests pass. The command-layer purity tests also assert no real clock or randomness in the state machine and catch ledger.

## Context and Problem Statement

Fishing, loot, sessions, and timestamps all need values that differ between runs. If every module reaches for the system clock or a global random generator, tests cannot reproduce a session and two hosts cannot replay the same state. Which values should the engine own, and which should the caller supply?

## Decision Drivers

- Tests must reproduce a whole fishing session from a seed, viewport, and event sequence.
- A host may use server time, a deterministic test clock, or a replay clock.
- Identifier collisions and prototype-pollution strings must be rejected consistently.
- Randomness for loot and fishing must be controllable without patching globals.

## Considered Options

- Let each module read the clock and random globals.
- Inject every nondeterministic value through engine options and event arguments.
- Centralize randomness in a module-level singleton.

## Decision Outcome

Chosen option: "Inject every nondeterministic value through engine options and event arguments", because it is the only option that makes a full session reproducible without monkey-patching. `CreatorEngine` requires the clock and room-id factory and accepts the rest; the fishing machine derives layout from the injected viewport and draws from its seeded stream. The result is that state is a plain value and a replay is possible.

### Positive Consequences

- A fishing session can be replayed from a seed and event sequence.
- Tests can use fixed timestamps and predictable identifiers.
- Hosts can choose their own identifier and randomness policy.

### Negative Consequences

- Every call site must thread the clock and factories through.
- Pure helpers that offer real-clock defaults can still be non-deterministic if a caller omits the argument.
- Reproducibility depends on the caller preserving the same draw order and seed inputs.

## Pros and Cons of the Options

### Read globals directly

- Good, because call sites stay short.
- Bad, because sessions and tests become irreproducible and hidden dependencies spread.

### Inject values

- Good, because state transitions become pure functions of explicit input.
- Bad, because it adds parameters and factory wiring.

### Module-level singleton

- Good, because it centralizes the stream.
- Bad, because it creates ambient state that survives across sessions and tests.

## Links

- Implemented by `CreatorEngineOptions` in `src/creatorEngine.ts`.
- Related: [ADR-0008](0008-fishing-state-machine-and-command-layer.md).
- Seeded derivation is described in the [user guide](../user-guide.md#fishing).
