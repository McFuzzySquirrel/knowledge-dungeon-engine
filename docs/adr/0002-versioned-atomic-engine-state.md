---
id: ADR-0002
applies_to:
  - "src/storage.ts"
  - "src/creatorEngine.ts"
status: Accepted
---

# ADR-0002: Persist One Versioned Engine State Through An Atomic Storage Adapter

- **Deciders:** McFuzzySquirrel (maintainer)
- **Date:** 2026-11-23

**Technical Story:** Headless extraction from Knowledge Dungeon; the engine needs a storage contract independent of any browser database or file format.

## Agent Rules

- **MUST:** Keep `EngineState` a single structured-cloneable value with an explicit `version`.
- **MUST:** Require an adapter's `save(state)` to replace the whole state atomically or reject without changing the previous state.
- **MUST:** Clone state at engine boundaries so callers cannot mutate committed state through `snapshot()`, `load()`, or listener payloads.
- **MUST NOT:** Run more than one engine instance against the same adapter at a time; instances cache state independently.
- **MUST NOT:** Mutate the prior state when a save fails. A failed command must leave the committed state and storage untouched.
- **SHOULD:** Reject an unsupported state version at `KnowledgeDungeonEngine.open()` rather than guessing a migration.

## Verify

- **Check:** `npm test -- tests/unit/storage.test.ts tests/unit/creatorEngine.test.ts`
- **Expected:** Storage isolation, restore, failed-write, and atomic-commit tests pass.

## Context and Problem Statement

The engine needs durable state, but it cannot assume a database, a browser, or a file format. How should it expose persistence so a host can choose IndexedDB, a file, a server, or in-memory storage without the engine knowing which?

## Decision Drivers

- Hosts must be able to choose any durable backend.
- A command that reports success must have persisted its whole effect.
- A failed write must not leave a half-applied command.
- State must survive a reload without depending on renderer or service singletons.

## Considered Options

- Let the engine own a specific database.
- Expose granular per-entity persistence ports.
- Persist one versioned `EngineState` through a load/save adapter.

## Decision Outcome

Chosen option: "Persist one versioned `EngineState` through a load/save adapter", because it makes atomicity the adapter's single obligation and keeps the engine independent of storage technology. `MemoryEngineStorage` is a volatile reference implementation; hosts provide durable adapters. The engine serializes its own commands, but the one-instance-per-adapter rule remains a host responsibility.

### Positive Consequences

- Any backend that can load and atomically replace one value can host the engine.
- A successful command cannot be partially applied in storage.
- State shape and versioning are visible in one TypeScript interface.

### Negative Consequences

- Every save writes the whole state rather than a delta.
- Adapters must implement atomic replacement themselves.
- Concurrent engine instances over one adapter are unsupported and can overwrite each other.

## Pros and Cons of the Options

### Engine-owned database

- Good, because persistence is turnkey.
- Bad, because it forces one backend and drags storage code into the engine.

### Granular per-entity ports

- Good, because writes could be smaller.
- Bad, because cross-entity atomicity becomes the engine's problem across many calls.

### One versioned state through an adapter

- Good, because atomicity is simple and the backend stays replaceable.
- Bad, because full-state writes grow with the save size.

## Links

- Implemented by `src/storage.ts` and `src/creatorEngine.ts`.
- Related: [ADR-0005](0005-award-once-reward-ledgers.md) for why rewards and their ledgers share one record write.
- Storage contract in the [README](../../README.md#storage-contract).
