# Changelog

All notable changes are documented here. Follow Keep a Changelog categories: Added, Changed, Deprecated, Removed, Fixed, and Security.

## [Unreleased]

### Added

- Host UI guide covering architecture, screen and input design, frame loops, persistence UX, accessibility, performance, testing, and trust boundaries.

## [0.1.0] - 2026-11-23

The first packaged extraction of the headless Knowledge Dungeon gameplay engine. This entry records the `0.1.0` package version; no Git tag or published release exists. There is no earlier version of this package to upgrade from, and no compatibility with existing Knowledge Dungeon browser saves or backup files.

### Added

- Headless `KnowledgeDungeonEngine` (alias of `CreatorEngine`) with open, snapshot, subscribe, and serialized command entry points.
- Subject creation and activation, Creator graph mutations, tag management, and graph hierarchy/floor derivation.
- Note validation with required sections, manual confirmation, a five-criterion rubric, and Scribe artifact generation.
- Room-clear progression with XP, rank tiers, loot, equipment, phase badges, cross-subject achievements, and award-once ledgers.
- Archaeologist review with SM-2 scheduling, self-check prompts, review XP, and durable save/resume/discard of interrupted reviews.
- Fishing simulation with a pure state machine, seeded reproducibility, explicit subject context, recall outcomes, fish collection, and fishing badges.
- Village layout, structures, NPC movement, interaction selection, subject portals, the training gate, and the tutorial subject.
- Grid-based dungeon layout generation, floor visibility, collision, room travel, and teleport cooldown.
- Study-session records with unique room visits, activity counts, and recovery at last activity.
- Renderer-neutral statistics metrics, local-calendar handling, and an idempotent statistics event ledger.
- Deterministic ranked learner assistance in `off`, `gentle`, and `standard` modes.
- `MemoryEngineStorage` reference adapter and the `EngineStorage` atomic load/save contract.
- Public command types for graph, encounter, review, and fishing commands, plus standalone controllers and domain namespaces.

### Changed

- Repackaged the source application's gameplay rules as a renderer-neutral TypeScript library with no React, Pixi, Phaser, or Electron dependency.
- Session and review state are persisted in the engine state rather than in UI closures or browser keys.
- Note word count is a bonus badge target, not a pass condition.

### Deprecated

- Nothing in this release.

### Removed

- Presentation, rendering, input, camera, and audio code from the engine package.
- The source application's store and service singletons from the engine runtime.

### Fixed

- Duplicate room-clear, review-pass, and fishing rewards on retry, double dispatch, or reload.
- Lost interrupted-review state on exit.
- Fishing eligibility, recall selection, and persistence using different subject contexts.
- Study-session tracking that never started a session in the source application.
- Hidden-floor corridors that could be crossed at a doorway.

### Security

- The engine performs no network requests and includes no credentials, tokens, or signing keys.
- Reward ledgers and assistance inputs are built from app-minted ids, counts, and enum codes, not learner prose.
- `LICENSE` is MIT and the upstream attribution is preserved.

[Unreleased]: https://github.com/McFuzzySquirrel/knowledge-dungeon-engine/commits/main
[0.1.0]: docs/releases/0.1.0.md
