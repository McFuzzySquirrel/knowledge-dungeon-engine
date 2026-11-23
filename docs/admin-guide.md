# Administrator Guide

This guide is for the person who packages, deploys, and maintains a host application that embeds **Knowledge Dungeon Engine**. The project is a TypeScript library, not a server: it has no listening port, no login, no database of its own, and no environment file. Everything operational happens in the host that imports it.

If you are integrating the engine's API for the first time, read the [user guide](user-guide.md) first.

## Responsibilities and Architecture

| Component | Owner | Responsibility |
| --- | --- | --- |
| Engine (`dist/index.js`) | Project | Subject graph, note validation, progression, review, fishing, village and dungeon models. |
| `EngineStorage` adapter | Host operator | Load and atomically replace the complete `EngineState`. |
| Renderer and input | Host operator | Screens, camera, audio, keyboard/pointer/touch, accessibility. |
| Identity and access | Host operator | Accounts, authorization, encryption, secrets, TLS. |
| Backups and retention | Host operator | Durable copies, restore drills, deletion policy. |
| Monitoring and support | Host operator | Logs, error reporting, save-failure alerts, learner support. |

The engine is renderer-neutral and performs no network requests. It exposes state and commands; the host decides where state is stored and who may see it.

## Prerequisites

- **Node.js 20 or newer** for building, testing, and running the package in Node.
- **npm** with access to the Git repository.
- **ES2022 runtime** with `structuredClone`, `Blob`, and `crypto.randomUUID()` (or injected replacements).
- A durable storage backend if state must survive a restart.
- A host build pipeline that can bundle an ES module.

The package is private and is not published to npm. Install it from Git and pin a commit for reproducible deployments:

```sh
npm install github:McFuzzySquirrel/knowledge-dungeon-engine#<commit-sha>
```

The package's `prepare` script runs `npm run build`, producing `dist/index.js` and `dist/index.d.ts`.

## Installation

For a local checkout:

```sh
npm install
npm test
npm run typecheck
npm run build
```

For a host that consumes the package:

```sh
npm install github:McFuzzySquirrel/knowledge-dungeon-engine
```

The package exports one entry point:

```ts
import {
  KnowledgeDungeonEngine,
  MemoryEngineStorage,
  type EngineState,
  type EngineStorage,
} from 'knowledge-dungeon-engine';
```

Do not ship `MemoryEngineStorage` as the production adapter unless losing all progress on restart is acceptable.

## Configuration

There are no environment variables, configuration files, command-line flags, or feature flags in this package. Configuration is the `CreatorEngineOptions` object passed to `KnowledgeDungeonEngine.open()`:

| Option | Required | Default | Operational note |
| --- | --- | --- | --- |
| `storage` | Yes | None | Must implement atomic `save` and isolated `load`. |
| `nowIso` | Yes | None | Use the host clock; tests should inject a fixed clock. |
| `newRoomId` | Yes | None | Must be unique and non-empty. |
| `random` | No | `Math.random` | Inject a seeded stream for reproducible loot. |
| `newSessionId` | No | `crypto.randomUUID()` | Should be unique for fishing sessions. |
| `newStudySessionId` | No | `crypto.randomUUID()` | Must be unique and non-empty for study sessions. |
| `newAttachmentId` | No | `crypto.randomUUID()` | Must be unique across the state. |
| `onListenerError` | No | Console error | Use for host error reporting; it does not roll back a commit. |

The storage adapter is the only required integration point. Its contract:

```ts
interface EngineStorage {
  load(): Promise<EngineState | null>;
  save(state: EngineState): Promise<void>;
}
```

`save` must replace the entire state atomically or reject without changing the previous state. `load` must return a value isolated from the adapter's internal copy.

## Identity, Secrets, and TLS

**Not applicable to the library.** The engine has:

- No authentication or authorization.
- No API keys, passwords, tokens, signing keys, or certificates.
- No HTTP client, server, or TLS configuration.
- No user accounts or session cookies.

The host owns all of these. If your host adds a sync service, apply its identity model, secret storage, transport security, and audit rules there. Never place credentials in `EngineState` or in the engine options.

## Storage and Backups

### What to persist

Persist the complete `EngineState`, including:

| Field | Contents |
| --- | --- |
| `version` | State format version; currently `1`. |
| `activeSubjectId` | Active subject, or `null`. |
| `subjects` | One `SubjectSnapshot` per subject: dungeon metadata, rooms, notes, artifacts, SM-2 fields, attachments metadata. |
| `progression` | One canonical progression record per subject: XP, rank, badges, inventory, fish collection, collected notes, reward ledgers in `extraFields`. |
| `fishingSession` | Open fishing context, or `null`. |
| `achievements` | Unlocked cross-subject achievement ids. |
| `session` | Phase, player class, quest step, world. |
| `studySessions` | Study-session records. |
| `activeStudySessionId` | Open study session, or `null`. |
| `attachmentBytes` | Device-local attachment bytes, keyed by attachment id. |

Use a binary-capable format. `attachmentBytes` contains `Uint8Array` values; JSON alone will not round-trip them without an encoding step.

### Atomicity and concurrency

- Save the whole state in one atomic replacement (for example, write to a temporary key/file and swap).
- A failed save must leave the previous state intact.
- Use **one engine instance per adapter at a time**. Instances cache state independently and can overwrite each other.
- The engine serializes commands within one instance; it does not coordinate across processes or tabs.

### Versioning

`KnowledgeDungeonEngine.open()` rejects a state whose `version` is not `1`. This release ships no migration for other versions and no compatibility with existing Knowledge Dungeon browser saves or backup files. Plan a migration in your adapter or host before changing the state version.

### Backup and restore

1. Back up the complete `EngineState` on a schedule appropriate to your host.
2. Include `attachmentBytes` and the progression record's `extraFields`; otherwise artifacts and award-once ledgers are lost.
3. Verify a restore in a non-production environment by opening the engine with the restored state and reading `snapshot()`.
4. Keep at least one backup from before each upgrade.
5. Deleting a learner's data means deleting the state and every backup copy. The engine has no delete API.

## Health Checks and Monitoring

There is no health endpoint. Monitor the host that embeds the engine:

- **Save failures:** every `save` rejection is a data-integrity event. Alert on it.
- **Listener failures:** route `onListenerError` to host error reporting. A listener failure does not roll back a successful commit, but it may leave the UI stale.
- **Command refusals:** log refusal codes in aggregate, not learner prose. A spike in `REVIEW_LOCKED` or `SUBJECT_CONTEXT_MISMATCH` usually indicates a UI flow bug.
- **State size:** track serialized size; `attachmentBytes`, study sessions, and ledgers grow over time.
- **Build and test gates:** run `npm test`, `npm run typecheck`, and `npm run build` on the pinned commit before deployment.

The engine writes nothing to logs itself except console errors when a state listener fails, or when `onListenerError` itself throws.

## Upgrades and Rollback

### Upgrade procedure

1. Read the [changelog](../CHANGELOG.md) and the release notes for the target version.
2. Pin the new Git commit and update the host lockfile.
3. Run `npm test`, `npm run typecheck`, and `npm run build`.
4. Open a copy of a production state in a staging host. Confirm `snapshot()` loads and a representative command commits.
5. Back up production state.
6. Deploy the new host build.
7. Verify a save, a reload, and a note or review command.

### Rollback procedure

1. Redeploy the previous host build and pinned engine commit.
2. Restore the matching pre-upgrade state backup.
3. Confirm the engine opens the restored state and that attachments and progression ledgers are present.

State version `1` has no migrations in this release. Do not attempt to open a state written by an incompatible future version with an older build; the engine rejects unknown versions rather than guessing.

### Compatibility expectations

- The package is `0.1.0` and private. Treat minor versions as potentially breaking until a stable API policy is published.
- The in-memory adapter is volatile and is not a production store.
- Existing Knowledge Dungeon saves are not compatible with `EngineState`.

## Troubleshooting

| Symptom | Cause | Action |
| --- | --- | --- |
| `Unsupported engine state version` | Adapter loaded a non-`1` state. | Restore a compatible backup or implement a migration. |
| Progress resets after restart | Volatile adapter, new adapter instance, or a second engine. | Use a durable atomic adapter and one instance per adapter. |
| A command succeeds but the UI does not update | A subscriber threw, or the host ignored `onListenerError`. | Fix the subscriber; re-read `snapshot()`. |
| A save rejects and the command rejects | Adapter failed; state was not committed. | Keep the previous state; retry after fixing storage. |
| State is larger than expected | Attachments, study sessions, or ledgers. | Measure serialized size; apply host retention policy for blobs. |
| Review commands refuse with `REVIEW_LOCKED` | Default unlock requires every room cleared. | Clear remaining rooms or adjust the host flow; the engine controller uses ratio `1`. |
| Fishing refuses with `NO_OPEN_SESSION` | No `fishing/session-begin`. | Begin the session and pass its context through. |
| `Load` returns `null` after a crash | The previous save never completed. | Restore the last good backup. |

## Security and Privacy Checklist

- [ ] Use one engine instance per adapter, and serialize cross-tab writes in the host.
- [ ] Store state in a location with appropriate access control.
- [ ] Encrypt state at rest if it contains learner notes or personal data.
- [ ] Do not place credentials, tokens, or private URLs in `EngineState` or engine options.
- [ ] Treat attachment `fileName` and external `externalUrl` as untrusted when displaying them; the engine records them but does not sanitize display text.
- [ ] Do not fetch external attachment URLs automatically on the learner's behalf.
- [ ] Route `onListenerError` to error reporting without capturing note or artifact text.
- [ ] Log refusal codes and counts, not learner prose.
- [ ] Include `attachmentBytes` and progression `extraFields` in backups, and protect those backups.
- [ ] Define retention and deletion for state and backups; the engine has no delete API.
- [ ] Verify that the host's renderer and input layer meet your accessibility requirements; the engine does not provide them.

## Recovery and Support

### Recovering an interrupted study session

After an unclean shutdown:

1. Open the engine with the persisted state.
2. Call `endStudySession(true)` to close any unfinished session at its `lastActivityAt`.
3. Call `activateSubject(subjectId)` to start a new session.
4. Verify `snapshot().studySessions` shows the recovered record with a non-null `endedAt`.

### Recovering an interrupted review

An unfinished review is stored as a marker in the progression record. Use `dispatchReview({ type: 'review/session-resume', payload: { roomId } })` to report it. Completing it with `review/pass-complete` clears the same-room marker; discarding it with `review/session-discard` removes it without awarding.

### Support routes

- **Bugs and questions:** [github.com/McFuzzySquirrel/knowledge-dungeon-engine/issues](https://github.com/McFuzzySquirrel/knowledge-dungeon-engine/issues)
- **Design rationale:** [ADR index](adr/README.md)
- **Integrator guidance:** [user guide](user-guide.md)
- **Release history:** [changelog](../CHANGELOG.md)
