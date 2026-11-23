---
id: ADR-0004
applies_to:
  - "src/application/**/*.ts"
  - "src/creatorEngine.ts"
status: Accepted
---

# ADR-0004: Report Domain Refusals As Results And Infrastructure Failures As Rejections

- **Deciders:** McFuzzySquirrel (maintainer)
- **Date:** 2026-11-23

**Technical Story:** Command contracts introduced while extracting Creator, Scribe, Archaeologist, and fishing flows from the original stores.

## Agent Rules

- **MUST:** Return `{ ok: false, error: { code, message, details? } }` for a request the domain refuses, such as an unknown room, a locked review, or a mismatched fishing context.
- **MUST:** Reject the promise when storage or another unexpected dependency fails, so a failed write cannot be reported as a successful refusal.
- **MUST:** Keep refusal codes stable and machine-readable; use `details` for app-minted ids and counts, never learner prose.
- **MUST NOT:** Swallow, log, or convert a persistence failure into an `ok: true` result.
- **MUST NOT:** Throw for an ordinary domain refusal that a host is expected to explain to the learner.
- **SHOULD:** Expose both a named method and a `dispatch(taggedCommand)` entry point that share one implementation per command.

## Verify

- **Check:** `npm test -- tests/unit/encounterCommands.test.ts tests/phase16/reviewCommands.test.ts tests/phase17/fishingCommands.test.ts tests/unit/creatorEngine.test.ts`
- **Expected:** Refusal-shape, persistence-rejection, and dispatch-parity tests pass.

## Context and Problem Statement

A host needs to distinguish "the learner asked for something the rules do not allow" from "the save failed". If both arrive as thrown strings, a UI cannot tell a correctable refusal from a data-loss risk. What should the command contract look like?

## Decision Drivers

- Refusals are expected control flow and must be renderable.
- Persistence failures are exceptional and must not be hidden.
- Hosts need machine-readable reasons without parsing prose.
- Error payloads must not carry note text or other learner content.

## Considered Options

- Throw for every failure.
- Return a boolean.
- Return a discriminated result for domain refusals and reject for infrastructure failures.

## Decision Outcome

Chosen option: "Return a discriminated result for domain refusals and reject for infrastructure failures", because it keeps expected control flow typed while making data-loss conditions impossible to ignore. The `code` field lets a host branch without parsing message text, and rejection preserves the original engine behavior for a failed save.

### Positive Consequences

- Hosts can render refusals without exception handling.
- A failed save surfaces as a rejection instead of a false success.
- Refusal codes are testable and stable.

### Negative Consequences

- Callers must handle both a result union and a rejected promise.
- A host that catches broadly can still hide a persistence failure.
- Error messages are written for conditions, so a host may want its own learner-facing copy.

## Pros and Cons of the Options

### Throw for every failure

- Good, because there is one error channel.
- Bad, because ordinary refusals become exceptions and persistence failures look the same.

### Return a boolean

- Good, because it is simple.
- Bad, because it loses the reason and invites accidental success reporting.

### Discriminated results plus rejection

- Good, because expected and exceptional failures are distinct and typed.
- Bad, because callers must handle both paths.

## Links

- Implemented by `src/application/contracts/commands.ts` and the controllers in `src/application/`.
- Related: [ADR-0005](0005-award-once-reward-ledgers.md).
- See "Statuses and Notifications" in the [user guide](../user-guide.md#statuses-and-notifications).
