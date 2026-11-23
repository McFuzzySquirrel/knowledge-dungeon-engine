---
id: ADR-0007
applies_to:
  - "src/core/review/**/*.ts"
  - "src/learningPorts.ts"
status: Accepted
---

# ADR-0007: Use Per-Room SM-2 Scheduling And A Separate Interrupted-Review Marker

- **Deciders:** McFuzzySquirrel (maintainer)
- **Date:** 2026-11-23

**Technical Story:** Review scheduling and the "interrupted review state can be lost on exit" defect from the source application.

## Agent Rules

- **MUST:** Apply an SM-2 update only on `review/pass-complete`, using the learner's explicit integer quality rating from 0 to 5.
- **MUST:** Persist the SM-2 fields (`sm2QualityResponse`, `sm2EaseFactor`, `sm2IntervalDays`, `sm2NextReviewDate`, `sm2ConsecutiveCorrect`) on the room record.
- **MUST:** Persist an unfinished review as a resumable marker in the progression record's `extraFields` under `interruptedReviewSession`.
- **MUST:** Treat `review/session-save` and `review/session-discard` as non-awarding, non-scheduling operations.
- **MUST:** Clear a same-room resumable marker in the same transaction as a completed review.
- **MUST NOT:** Infer or default a review rating. A missing or out-of-range rating is rejected before any write.
- **MUST NOT:** Store topic, note text, artifact text, or subject name in the marker.

## Verify

- **Check:** `npm test -- tests/phase16/reviewCommands.test.ts tests/unit/spacedRepetition.test.ts`
- **Expected:** Rating validation, SM-2 transitions, same-tick single award, reload resilience, save/discard non-award, and marker isolation tests pass.

## Context and Problem Statement

A review can be completed, parked for later, or abandoned. Should those paths all update the spaced-repetition schedule, and where should an unfinished review survive a reload?

## Decision Drivers

- An unfinished review is not evidence of recall and must not schedule a future review.
- A marker stored only in a closure or a UI store is lost on reload.
- The marker must participate in normalization, backup, and subject copies.
- A completed review must not pay twice or leave a stale marker.

## Considered Options

- Keep the pending review in memory only.
- Persist the marker as a bare browser storage key.
- Persist the marker in `RoomMetadata`.
- Persist the marker in the progression record's preserved fields.

## Decision Outcome

Chosen option: "Persist the marker in the progression record's preserved fields", because it survives reloads and travels with the durable progression data, while the SM-2 schedule stays with the room it schedules. Saving or discarding a review writes only the marker. Completing a review writes SM-2, the reward ledger, and the marker clear together.

### Positive Consequences

- A learner can leave and resume an unfinished review.
- An unfinished review cannot inflate a badge or a schedule.
- Completed reviews are idempotent per room and pass.

### Negative Consequences

- Review state is split between the room record (SM-2) and the progression record (marker and ledger).
- A marker for another room must be reported rather than silently overwritten.
- A corrupt marker reads as "no session", which loses resumability but not progress.

## Pros and Cons of the Options

### In-memory pending review

- Good, because it is simple.
- Bad, because a reload or route change silently loses it.

### Bare storage key

- Good, because it survives a reload.
- Bad, because it is outside normalization, backup, and copy remapping.

### Marker in `RoomMetadata`

- Good, because it sits with the room.
- Bad, because the subject schema is not the progression carrier and would need a version change.

### Marker in progression preserved fields

- Good, because it is durable and already covered by the record's lifecycle.
- Bad, because one marker and the SM-2 fields live in two records.

## Links

- Implemented by `src/core/review/` and `src/learningPorts.ts`.
- Related: [ADR-0005](0005-award-once-reward-ledgers.md).
- See "Review a room" in the [user guide](../user-guide.md#review-a-room).
