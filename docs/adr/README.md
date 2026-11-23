# Architecture Decision Records

*The durable architectural decisions for this project, one decision per record. Each record states the options considered, the choice, and the consequences accepted. Link this index from the project README and keep it accurate as records are added or superseded.*

| ADR | Title | Status | Date |
|---|---|---|---|
| [ADR-0001](0001-headless-renderer-neutral-engine.md) | [Keep Gameplay Rules Headless And Renderer-Neutral](0001-headless-renderer-neutral-engine.md) | Accepted | 2026-11-23 |
| [ADR-0002](0002-versioned-atomic-engine-state.md) | [Persist One Versioned Engine State Through An Atomic Storage Adapter](0002-versioned-atomic-engine-state.md) | Accepted | 2026-11-23 |
| [ADR-0003](0003-injected-time-randomness-identifiers.md) | [Inject Time, Randomness, And Identifiers Into Gameplay Paths](0003-injected-time-randomness-identifiers.md) | Accepted | 2026-11-23 |
| [ADR-0004](0004-result-vs-rejection-contract.md) | [Report Domain Refusals As Results And Infrastructure Failures As Rejections](0004-result-vs-rejection-contract.md) | Accepted | 2026-11-23 |
| [ADR-0005](0005-award-once-reward-ledgers.md) | [Store Award-Once Reward Ledgers In The Progression Record](0005-award-once-reward-ledgers.md) | Accepted | 2026-11-23 |
| [ADR-0006](0006-note-validation-gates-and-rubric.md) | [Separate Blocking Note Requirements From Bonus Rubric Scoring](0006-note-validation-gates-and-rubric.md) | Accepted | 2026-11-23 |
| [ADR-0007](0007-sm2-review-scheduling-and-interrupted-sessions.md) | [Use Per-Room SM-2 Scheduling And A Separate Interrupted-Review Marker](0007-sm2-review-scheduling-and-interrupted-sessions.md) | Accepted | 2026-11-23 |
| [ADR-0008](0008-fishing-state-machine-and-command-layer.md) | [Split Fishing Into A Pure State Machine And An Explicit-Context Command Layer](0008-fishing-state-machine-and-command-layer.md) | Accepted | 2026-11-23 |
| [ADR-0009](0009-grid-layout-and-floor-walkability.md) | [Derive Grid Layout, Floor Visibility, And Walkability From The Topic Graph](0009-grid-layout-and-floor-walkability.md) | Accepted | 2026-11-23 |
| [ADR-0010](0010-study-session-lifecycle.md) | [Persist Study Sessions On Every Activity And Recover At Last Activity](0010-study-session-lifecycle.md) | Accepted | 2026-11-23 |

## Rules

- One row per record, in identifier order, with no gaps in numbering.
- Keep each row's status and date in step with the record they point at.
- When a record is superseded, update its row to `Superseded by ADR-NNNN` and link the replacement in the same row rather than deleting the entry.
- Fill a row from the record itself rather than from memory; the index is a directory, not a summary.
