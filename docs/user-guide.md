# User Guide

This guide is for developers embedding **Knowledge Dungeon Engine** in a host application. The engine has no screens, accounts, or installable end-user app; its "users" are the hosts that render state and send commands. If you are looking for deployment and maintenance instructions, read the [administrator guide](admin-guide.md). For host architecture, screen design, frame loops, and accessibility, read the [host UI guide](host-ui-guide.md).

## Who This Is For

Use this guide if you are:

- Building a web, desktop, mobile, terminal, or side-scrolling interface for Knowledge Dungeon.
- Designing the host's screens, frame loop, input, and accessibility around the engine.
- Adding the learning loop (subjects, notes, reviews, fishing) to an existing host.
- Writing tests against the engine without a browser.

You should be comfortable with TypeScript, ES modules, and `async`/`await`.

## Before You Begin

- **Node.js:** 20 or newer to build and run the test suite.
- **Runtime:** the built ES module targets ES2022 and expects `structuredClone`, `Blob`, and `crypto.randomUUID()` (or your own injected factories).
- **Package:** the project is private and is not published to npm. Install it from Git:

  ```sh
  npm install github:McFuzzySquirrel/knowledge-dungeon-engine
  ```

  The package's `prepare` script builds `dist/` when installed from Git.
- **A storage adapter:** `MemoryEngineStorage` is volatile. For durable saves, implement `EngineStorage` (see [Storage and recovery](#storage-and-recovery)).
- **A presentation layer:** the engine does not render, read input, or play audio.

## Sign In and First Use

There is no sign-in and no account model. "First use" means opening the engine and creating or activating a subject.

```ts
import { KnowledgeDungeonEngine, MemoryEngineStorage } from 'knowledge-dungeon-engine';

const storage = new MemoryEngineStorage();
const engine = await KnowledgeDungeonEngine.open({
  storage,
  nowIso: () => new Date().toISOString(),
  newRoomId: () => crypto.randomUUID(),
});

const created = await engine.createSubject({
  dungeonId: 'biology',
  subjectName: 'Biology',
  rootRoomId: 'root',
  rootTopic: 'Cell Biology',
  nowIso: new Date().toISOString(),
});

if (!created.ok) throw new Error(created.error.message);
```

`KnowledgeDungeonEngine` is the public alias of `CreatorEngine`. It serializes commands within one instance, so calls from multiple UI events do not need host-side locking.

**Open options**

| Option | Required | Purpose |
| --- | --- | --- |
| `storage` | Yes | `EngineStorage` adapter for the complete `EngineState`. |
| `nowIso` | Yes | Returns the current ISO-8601 timestamp. |
| `newRoomId` | Yes | Mints a unique room id. Rejected if blank or a prototype-pollution key. |
| `random` | No | Random stream in `[0, 1)` for loot and other rolls. Defaults to `Math.random`. |
| `newSessionId` | No | Mints fishing-session ids. Defaults to `crypto.randomUUID()`. |
| `newStudySessionId` | No | Mints study-session ids. Defaults to `crypto.randomUUID()`. |
| `newAttachmentId` | No | Mints attachment ids. Defaults to `crypto.randomUUID()`. |
| `onListenerError` | No | Receives subscriber exceptions without rolling back committed state. |

## Main Workflows

### Create and activate a subject

- `createSubject(input)` creates the root room, an empty progression record, and a study session, then makes the subject active.
- `activateSubject(subjectId)` switches to an existing subject and starts a new study session.
- Both throw for an invalid or duplicate id rather than returning a refusal.

### Map topics

`dispatchGraph(command)` applies one Creator graph mutation. It returns the graph domain's `{ ok: true, value }` or `{ ok: false, error }`.

| Command | Payload | Effect |
| --- | --- | --- |
| `graph/children-add` | `{ parentRoomId, topics }` | Creates child rooms in bulk; blank topics are dropped. |
| `graph/cross-link-add` | `{ fromRoomId, toRoomId, relationType? }` | Adds a non-hierarchical edge; defaults to `related`. |
| `graph/room-reparent` | `{ roomId, newParentRoomId }` | Moves a room under a different parent. |
| `graph/room-remove` | `{ roomId }` | Removes a room and cascade-removes descendants left unreachable from the root. |
| `graph/tags-set` | `{ roomId, tags }` | Replaces a room's tag list. |
| `graph/tag-add` | `{ roomId, tag }` | Adds one tag. |
| `graph/tag-remove` | `{ roomId, tag }` | Removes one tag. |

Room ids must be unique and non-empty. The root room cannot be removed.

### Write and validate a note

Use `submitNote({ roomId, noteText, manualConfirmed })` for the common path, or `dispatchEncounter({ type: 'encounter/note-submit', payload })` when you already hold a tagged command.

A note **passes** only when:

1. It contains the sections `Summary`, `Key Points`, and `Recall Question`, each on its own line.
2. The learner has confirmed the note (`manualConfirmed: true`).

The 120-word target is a bonus badge threshold, not a pass condition. Five rubric criteria each score 0–2 and produce a `qualityBonus` from 0 to 10.

A passing note:

- Sets the room's state to `ArtifactCollected`.
- Generates the Scribe artifact markdown.
- Awards room-clear progression once per room and graph generation.
- Can unlock the 120-word Scribe badge.

A non-passing note is saved as a draft (`kind: 'draft'`) and awards nothing. The result carries the full validation output, so you do not need to re-run validation.

`collectArtifact(roomId)` forwards the pickup to the world flow and adds the note to the subject's collected notes if the room has an artifact. It throws if the room has no artifact markdown.

### Review a room

A room is reviewable when it has passed validation and is in `EncounterDefeated`, `ArtifactCollected`, or `NeedsRevalidation`. By default, review unlocks only when **every** room in the subject is cleared; the engine uses a completion ratio of `1`.

| Command | Payload | Effect |
| --- | --- | --- |
| `review/pass-complete` | `{ roomId, qualityRating }` | Records the 0–5 rating, updates SM-2, awards review XP once per room and pass. |
| `review/session-save` | `{ roomId, qualityRating }` | Saves a resumable marker; does not update SM-2 or award. `qualityRating` may be `null`. |
| `review/session-discard` | `{ roomId }` | Removes the marker; awards nothing. |
| `review/session-resume` | `{ roomId }` | Reports whether a marker exists; writes nothing. |

The rating must be an integer from 0 to 5. A missing or invalid rating is rejected before any state is written.

Quality labels:

| Rating | Meaning |
| --- | --- |
| 0 | Complete blackout |
| 1 | Incorrect, but remembered after seeing the answer |
| 2 | Incorrect, but seemed easy upon seeing the answer |
| 3 | Correct with serious difficulty |
| 4 | Correct after hesitation |
| 5 | Perfect, immediate recall |

### Fishing

Fishing is split into two layers:

1. **Simulation:** drive `fishingState.createFishingState` and `fishingState.reduceFishing` with your viewport, clock, and seeded random stream.
2. **Commands:** send the resulting cast, bite, and keep/release events through `dispatchFishing`.

```ts
const begin = await engine.dispatchFishing({
  type: 'fishing/session-begin',
  payload: {
    pondId: 'pond-1',
    subjectId: 'biology',
    subjectName: 'Biology',
    roomId: 'root',
  },
});

if (!begin.ok) throw new Error(begin.error.message);
const context = begin.value.context;
```

Every later command carries the same `subject` context. A command whose subject id, subject name, or asserted room disagrees with the open session is refused with `SUBJECT_CONTEXT_MISMATCH`.

| Command | Payload | Effect |
| --- | --- | --- |
| `fishing/session-begin` | `{ pondId, subjectId, subjectName, roomId? }` | Mints the session context and reports eligibility. |
| `fishing/cast-complete` | `{ subject, castNumber, catalogId, fishDirection }` | Reports the rolled fish; writes nothing. |
| `fishing/bite-resolve` | `{ subject, castNumber, resolution, catalogId? }` | Reports hooked or missed; awards nothing. |
| `fishing/catch-keep` | `{ subject, castNumber, catalogId, recall }` | Adds the fish, awards XP and badges once per catch identity. |
| `fishing/catch-release` | `{ subject, castNumber, catalogId }` | Writes nothing. |
| `fishing/state-read` | `{ subject? }` | Reports context, eligibility, and ledger count; writes nothing. |

`recall` is one of:

- `{ kind: 'answered-correct', roomId }` — keeps the fish and pays XP.
- `{ kind: 'answered-incorrect', roomId }` — writes nothing; the fish goes back.
- `{ kind: 'kept-without-recall' }` — keeps the fish and badges, pays no XP.

Fishing requires at least one cleared room. The command layer assumes the host sends results from the state machine; it is not an anti-cheat boundary.

### Movement and navigation

```ts
const snapshot = engine.snapshot();
const navigation = dungeonNavigation.createDungeonNavigation(snapshot.subjects.biology.dungeon);

const world = navigation.move({ x: 1, y: 0 }, 16); // direction, elapsed ms
const room = navigation.travelToRoom('some-room-id');
const teleport = navigation.teleportToRoom('some-room-id', Date.now());
```

- Movement is grid-based and frame-rate independent through elapsed milliseconds.
- Hidden floors cannot be entered or crossed.
- `teleportToRoom` enforces a 120-second cooldown and returns `{ accepted: false, remainingMs }` while cooling down.
- Recreate the navigation controller whenever the subject graph changes.

`villageWorld` provides analogous player and NPC movement, plus nearby-target selection. `villageStructures()` returns the village structures plus one portal per subject; `interactVillageStructure(id)` routes portals, the guild hall, and the training gate.

### Study sessions

A study session starts when a subject is created or activated, and also when the tutorial starts.

- Call `recordRoomVisit(roomId)` when navigation enters a room in the active subject. Unique visits are counted once per session.
- Awarded notes, reviews, and kept fish are counted automatically.
- Call `endStudySession()` when the host leaves the dungeon.
- After an interrupted host, call `endStudySession(true)` to close the unfinished session at its last activity, then `activateSubject` to start another.

Session records are in `snapshot().studySessions` and hold app-minted ids, timestamps, room ids, and counts — no note or artifact text.

### Read state and subscribe

```ts
const unsubscribe = engine.subscribe((state) => {
  render(state);
});

const copy = engine.snapshot();
unsubscribe();
```

`subscribe` receives a cloned state after each successful commit. `snapshot()` also returns an isolated copy. Mutating either copy does not affect committed state.

### Use the domain namespaces directly

The package also exports renderer-neutral namespaces for hosts that want the rules without the facade:

| Namespace | Contents |
| --- | --- |
| `graph` | Graph domain mutations, hierarchy derivation, floor visibility, tag rules. |
| `progression` | XP formula, rank tiers, badges, loot, achievements, clear-reward ledgers. |
| `review` | SM-2 scheduling, review unlock, self-check prompts, pass rewards, interrupted sessions. |
| `notes` | Note validation types and evaluator. |
| `subjects` | Subject schema types, validation, and migration helpers. |
| `artifacts` | Artifact generation. |
| `assistance` | Deterministic ranked study suggestions in `off`, `gentle`, and `standard` modes. |
| `statistics` | Local-calendar metrics and the statistics event ledger. |
| `fishingMechanics`, `fishingState`, `fishingTypes` | Fishing rolls, pure state machine, and catalog types. |
| `dungeon` | Deterministic dungeon map generation. |
| `world`, `dungeonNavigation`, `village`, `villageWorld`, `villageInteractions` | Walkability, navigation, village layout, NPCs, and interaction selection. |
| `archetypes`, `tutorial` | Player class definitions and the tutorial subject. |

## Offline and Reconnect Behavior

The engine performs no network requests. There is no sync, no remote account, and no reconnect state. "Offline" is the normal mode:

- All state lives in the `EngineState` your adapter persists.
- Memory storage is lost when the process exits.
- A durable adapter must save the whole state atomically; a rejected save leaves the previous state intact.
- Use one engine instance per adapter at a time. Two instances cache state independently and can overwrite each other.

Existing Knowledge Dungeon browser saves and backup files are **not compatible** with this engine state. There is no migration and no included durable browser or Node adapter.

### Storage and recovery

Implement `EngineStorage` when you need durable state:

```ts
interface EngineStorage {
  load(): Promise<EngineState | null>;
  save(state: EngineState): Promise<void>;
}
```

- Save the complete `EngineState` in one atomic replacement. If the save fails, reject and leave the previous state intact.
- Preserve `version` (`1`), `attachmentBytes` (`Uint8Array` values), and the progression record's `extraFields`, which carries award-once ledgers and the interrupted-review marker.
- Use a binary-capable format; plain JSON will not round-trip attachment bytes without an encoding step.
- Use one engine instance per adapter. The engine serializes commands within one instance, not across tabs or processes.
- After an unclean shutdown, call `endStudySession(true)` before starting another session.

For the full field list, backup procedure, and upgrade guidance, see the [administrator guide](admin-guide.md#storage-and-backups).

## Statuses and Notifications

The engine has no toast, notification, or event bus. It reports:

- **Command outcomes:** `{ ok: true, value }` or `{ ok: false, error: { code, message, details? } }`.
- **Rejected promises:** storage failures and unexpected dependency failures.
- **State commits:** `subscribe(listener)` after a successful save.
- **Listener failures:** `onListenerError(error)`; a listener failure does not roll back the commit.

Common refusal codes:

| Code | Meaning |
| --- | --- |
| `NO_ACTIVE_SUBJECT` | No subject is active for the command. |
| `ROOM_NOT_FOUND` | The room is not in the active subject. |
| `ROOM_NOT_REVIEWABLE` | The room has not been cleared. |
| `REVIEW_LOCKED` | Not enough rooms are cleared to unlock review. |
| `NO_OPEN_SESSION` | A fishing command arrived before `fishing/session-begin`. |
| `SUBJECT_CONTEXT_MISMATCH` | The fishing context disagrees with the open session. |
| `UNKNOWN_CATALOG_ID` | The catalogue id is not in the fish catalog. |
| `CAST_STATE_INVALID` | The cast number or catch sequence is invalid. |
| `EMPTY_TOPIC` | A graph topic was blank. |
| `ROOM_ALREADY_EXISTS` | The requested room id is already used. |
| `TOPIC_ALREADY_EXISTS` | The topic already exists under that parent. |
| `EDGE_ALREADY_EXISTS` | The edge already exists. |
| `SELF_LOOP_EDGE` | A room cannot link to itself. |

Graph refusals use the graph error codes above; note and review refusals use their own `code` unions in the controllers.

## Attachments or Other Data

The Scribe can attach images through `dispatchEncounter`:

- `encounter/attachment-add` stores picked `Blob` bytes in `EngineState.attachmentBytes` and records a device-local attachment.
- `encounter/attachment-add-external` records an external URL without fetching it.
- `encounter/attachment-remove` removes the attachment and its stored bytes.

There is no upload, no image processing, and no size limit enforced by the engine. Your host decides what to accept and how to display it. A copy of the state must include `attachmentBytes` (`Uint8Array` values) to preserve attachments.

Collected notes, artifact markdown, fish entries, loot, badges, achievements, and study-session records are all part of the state your adapter persists.

## Accessibility and Mobile Use

The engine has no user interface, so it cannot guarantee accessibility or mobile behavior by itself. The host owns:

- Keyboard, pointer, touch, and assistive-technology support.
- Focus order, announcements, contrast, and reduced-motion behavior.
- Layout, camera, and responsive controls.
- Any platform-specific input mapping.

The engine does provide input-independent rules: movement uses normalized direction vectors and elapsed milliseconds, fishing uses an injected viewport, and no rule depends on a screen size or device type. That makes a consistent mobile and desktop implementation possible, not automatic.

## Privacy and Data Handling

- **No network I/O.** The engine does not transmit state, telemetry, analytics, or crash reports.
- **Learner content stays in state.** Notes, artifact text, topics, and subject names are stored wherever your adapter writes.
- **Session records are counts and ids.** They contain app-minted session and room ids, timestamps, and integer counts. They do not contain note text or artifact text.
- **Reward ledgers are app identities.** Room-clear, review-pass, and fishing ledgers use ids, pass numbers, cast numbers, catalogue ids, and timestamps. They never hash or store learner prose.
- **Assistance inputs are reduced.** The assistance engine takes counts, enum codes, app ids, and booleans; it does not take a note or artifact field.
- **Your adapter is the privacy boundary.** Encryption at rest, access control, retention, backups, and deletion are host responsibilities.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `vitest: not found` or `tsc: not found` | Dependencies were not installed. | Run `npm install`. |
| `Unsupported engine state version` | The adapter returned a state with `version` other than `1`. | Provide a compatible state or a migration in the adapter. |
| State appears to reset | You created a new `MemoryEngineStorage`, or opened a second engine on the same adapter. | Reuse the storage instance; use one engine per adapter. |
| State does not survive a restart | You are using `MemoryEngineStorage`. | Implement `EngineStorage` with durable atomic saves. |
| `No active subject` | The command needs an active subject. | Call `createSubject` or `activateSubject` first. |
| `Room not found` | The room id is not in the active subject. | Read the current snapshot and retry with an existing room. |
| Review is refused as locked | Not every room is cleared (default ratio is 1). | Clear the remaining rooms. |
| Fishing is refused before the first cast | No fishing session is open. | Dispatch `fishing/session-begin` and keep its returned context. |
| `SUBJECT_CONTEXT_MISMATCH` | The payload context differs from the open session. | Send the exact context from `session-begin`, including the room when asserted. |
| `Clear a room before fishing` | The subject has no cleared room. | Clear and validate at least one room. |
| A valid short note does not clear | `manualConfirmed` is false or a required section heading is missing. | Confirm the note and add `Summary`, `Key Points`, and `Recall Question` lines. |
| A retried keep awards nothing | The same catch identity was already recorded. | This is intentional; read the `duplicate`/`awarded` fields in the outcome. |
| A listener throws | Host subscriber bug. | Inspect `onListenerError`; the commit is already durable. |

## Getting Help

- **Issues and questions:** [github.com/McFuzzySquirrel/knowledge-dungeon-engine/issues](https://github.com/McFuzzySquirrel/knowledge-dungeon-engine/issues)
- **Source and examples:** [github.com/McFuzzySquirrel/knowledge-dungeon-engine](https://github.com/McFuzzySquirrel/knowledge-dungeon-engine)
- **Operational guidance:** [administrator guide](admin-guide.md)
- **Host architecture:** [host UI guide](host-ui-guide.md)
- **Design rationale:** [ADR index](adr/README.md)
- **Release history:** [changelog](../CHANGELOG.md)
