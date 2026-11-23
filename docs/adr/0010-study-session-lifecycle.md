---
id: ADR-0010
applies_to:
  - "src/studySessions.ts"
  - "src/session.ts"
  - "src/creatorEngine.ts"
status: Accepted
---

# ADR-0010: Persist Study Sessions On Every Activity And Recover At Last Activity

- **Deciders:** McFuzzySquirrel (maintainer)
- **Date:** 2026-11-23

**Technical Story:** Session tracking that was never wired into gameplay in the source application.

## Agent Rules

- **MUST:** Start a study session when a subject is created or activated, and open the tutorial the same way.
- **MUST:** Keep `endedAt: null` and update `lastActivityAt` while a session is open.
- **MUST:** Count a room visit once per session, and count awarded notes, reviews, and kept fish automatically.
- **MUST:** End a session when the host returns to the village or changes subject, and treat repeated close calls as no-ops.
- **MUST:** Support `endStudySession(true)` recovery, closing an unfinished session at its `lastActivityAt`, not at recovery time.
- **MUST NOT:** Count a session twice when a close signal repeats.
- **MUST NOT:** Require a real clock inside the session helpers; the engine passes its injected `nowIso`.

## Verify

- **Check:** `npm test -- tests/unit/creatorEngine.test.ts`
- **Expected:** Unique visits are counted once, return-to-village closes the session, and recovery uses the last activity timestamp rather than the current time.

## Context and Problem Statement

A study session measures presence and activity, but a crash or force-quit can leave it open. Should the engine write only at the end, and how should an unterminated session be closed honestly?

## Decision Drivers

- A crash must not lose the whole session.
- Closing a day-old session at "now" would over-count study time.
- Repeated close signals are common and must not duplicate records.
- Session records must contain counts and ids, not learner prose.

## Considered Options

- Write only when the session ends.
- Write on start and every activity, and recover at last activity.
- Keep sessions in memory only.

## Decision Outcome

Chosen option: "Write on start and every activity, and recover at last activity", because it bounds loss to the last recorded activity and gives recovery an honest timestamp. The engine writes after every counted activity, and `endStudySession(true)` closes an unfinished record at `lastActivityAt`. This trades extra writes for a truthful record.

### Positive Consequences

- A crash loses at most the unrecorded activity since the last write.
- Recovered study time is not inflated by downtime.
- Session history is available for statistics.

### Negative Consequences

- Every activity performs a state save.
- The host must call `recordRoomVisit` and `endStudySession` at the right points.
- Sessions remain in the single engine state and grow the save over time.

## Pros and Cons of the Options

### Write only at the end

- Good, because there are fewer writes.
- Bad, because a crash loses the entire session.

### Write on start and every activity

- Good, because recovery is bounded and timestamped.
- Bad, because it increases write frequency and state size.

### Memory only

- Good, because it is simplest.
- Bad, because no session survives a reload or contributes to statistics.

## Links

- Implemented by `src/studySessions.ts` and `src/creatorEngine.ts`.
- Related: [ADR-0002](0002-versioned-atomic-engine-state.md).
- See "Study sessions" in the [user guide](../user-guide.md#study-sessions).
