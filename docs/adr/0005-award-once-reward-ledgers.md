---
id: ADR-0005
applies_to:
  - "src/core/progression/roomClearRewards.ts"
  - "src/core/review/reviewPassRewards.ts"
  - "src/core/fishing/catchRewards.ts"
  - "src/core/progression/canonicalProgression.ts"
  - "src/learningPorts.ts"
  - "src/fishingPorts.ts"
status: Accepted
---

# ADR-0005: Store Award-Once Reward Ledgers In The Progression Record

- **Deciders:** McFuzzySquirrel (maintainer)
- **Date:** 2026-11-23

**Technical Story:** Duplicate-award defects in the original note clear, review completion, and fishing keep flows.

## Agent Rules

- **MUST:** Decide whether a reward is already awarded and write the reward plus its ledger entry in one progression record write.
- **MUST:** Key each ledger entry by an app-minted identity (room id plus clear generation, room id plus review pass, or fishing session plus cast, catalogue id, and outcome).
- **MUST:** Keep ledgers under the static `extraFields` keys `roomClearRewardLedger`, `reviewPassRewardLedger`, and the fishing catch ledger key.
- **MUST NOT:** Hash, key, log, or store note text, artifact text, or any learner prose in a ledger.
- **MUST NOT:** Cap, evict, or garbage-collect ledger entries. Evicting an entry would let an old clear award twice.
- **SHOULD:** Treat an unreadable ledger as empty rather than throwing; a newer or corrupt entry cannot be allowed to block all future rewards.

## Verify

- **Check:** `npm test -- tests/unit/encounterCommands.test.ts tests/phase16/reviewCommands.test.ts tests/phase17/fishingCommands.test.ts tests/unit/creatorEngine.test.ts`
- **Expected:** Same-tick double awards, reload retries, and repeated catches award once; a genuine next pass or a different cast awards again; a failed write leaves no partial reward.

## Context and Problem Statement

A note submission, a review completion, or a fishing keep could be retried by a double click, a strict-mode double dispatch, or a reload. The original flows decided whether to award by reading a counter that an asynchronous writer had not yet moved, so one action could pay twice. How can "exactly once" be enforced across retries?

## Decision Drivers

- Reward and guard must be persisted atomically.
- A retry after a reload must still be recognized.
- The canonical progression record already survives reloads, copies, and backups.
- No learner content may be used as an identity or written to a ledger.

## Considered Options

- Compare against a live counter before awarding.
- Add a new storage object store for reward guards.
- Put the guard in `RoomMetadata` on the subject.
- Put the guard in the progression record's preserved app-owned fields.

## Decision Outcome

Chosen option: "Put the guard in the progression record's preserved app-owned fields", because it is the only durable carrier already covered by normalization, migration, backup, and subject-copy ID remapping. A new object store would change the data format; a room field would put progression state in the subject schema; a live counter cannot separate two same-tick calls. The ledger and the reward share one record write, so a failed write persists both or neither.

### Positive Consequences

- Double dispatch, retries, and reloads cannot pay twice.
- The guard travels with the progression record through copies and backups.
- The decision is one pure function, so same-tick concurrency is safe.

### Negative Consequences

- Ledgers grow without bound, by design, and add bytes to each progression record.
- Three separate static field keys must stay distinct and documented.
- A ledger written by a future incompatible version is treated as empty, which can re-award once rather than block the save.

## Pros and Cons of the Options

### Compare against a live counter

- Good, because it needs no new storage.
- Bad, because it is exactly the defect: two same-tick calls both pass the check.

### New object store

- Good, because guards would be isolated.
- Bad, because it changes the storage format and needs its own migration and backup participation.

### Guard in `RoomMetadata`

- Good, because it sits beside the room.
- Bad, because progression state does not belong in the subject schema, and backup/template behavior would diverge.

### Guard in preserved progression fields

- Good, because it reuses the durable carrier and writes atomically with the reward.
- Bad, because the record grows and the ledger is only as honest as its reader.

## Links

- Implemented by `src/core/progression/roomClearRewards.ts`, `src/core/review/reviewPassRewards.ts`, and `src/core/fishing/catchRewards.ts`.
- Related: [ADR-0002](0002-versioned-atomic-engine-state.md), [ADR-0007](0007-sm2-review-scheduling-and-interrupted-sessions.md).
