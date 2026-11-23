# Knowledge Dungeon Engine

A headless TypeScript engine for Knowledge Dungeon, extracted from
[Knowledge Dungeon](https://github.com/McFuzzySquirrel/knowledge-dungeon) at
commit `87c346ae7894af903ca7a514eef2badbcf32e810`. It does not depend on React,
Pixi, Phaser, Electron, or a particular interface. A host supplies presentation,
input, and long-term storage.

The package contains topic graphs and dungeon generation; Creator, Scribe and
Archaeologist commands; note validation, artifacts, review scheduling,
progression, loot, equipment, achievements and statistics; fishing rules and
commands; village data, quests, NPC movement, and dungeon/village navigation.
The host drives movement and fishing state-machine ticks and presents results.

## Setup

Requires Node.js 20 or newer to build. The built ES module also runs in modern
browsers with `structuredClone`, `Blob`, and ES2022 support.

```sh
npm install
npm test
npm run typecheck
npm run build
```

Consumers can install the Git repository; the `prepare` script builds the
package when installed from Git.

```sh
npm install github:McFuzzySquirrel/knowledge-dungeon-engine
```

## A headless learning loop

```ts
import { KnowledgeDungeonEngine, MemoryEngineStorage, dungeonNavigation } from 'knowledge-dungeon-engine';

const storage = new MemoryEngineStorage();
const engine = await KnowledgeDungeonEngine.open({
  storage,
  nowIso: () => new Date().toISOString(),
  newRoomId: () => crypto.randomUUID(),
});

const created = await engine.createSubject({
  dungeonId: 'math',
  subjectName: 'Mathematics',
  rootRoomId: 'root',
  rootTopic: 'Mathematics',
  nowIso: new Date().toISOString(),
});
if (!created.ok) throw new Error(created.error.message);

await engine.dispatchGraph({
  type: 'graph/children-add',
  payload: { parentRoomId: 'root', topics: ['Algebra'] },
});
const submitted = await engine.submitNote({
  roomId: 'root',
  noteText: 'Summary\nAn overview.\nKey Points\n- A point.\nRecall Question\nWhy?',
  manualConfirmed: true,
});
if (!submitted.ok) throw new Error(submitted.error.message);
if (submitted.value.kind === 'cleared') await engine.collectArtifact('root');

const snapshot = engine.snapshot();
const navigation = dungeonNavigation.createDungeonNavigation(snapshot.subjects.math.dungeon);
const worldState = navigation.move({ x: 1, y: 0 }, 16);
```

`engine.subscribe(listener)` receives a cloned state after each successful
commit; its return value unsubscribes. `snapshot()` also returns an isolated
copy. Commands that return `{ ok: false }` are refusals; storage and other
unexpected failures reject. The optional `onListenerError` reports subscriber
failures without rolling back an already committed state.

The engine exposes `dispatchEncounter` for attachments, `dispatchReview` for
review and interrupted sessions, `dispatchFishing` for pond commands,
`equipItem`/`unequipItem`, `activateSubject`, `startTutorial`,
`interactVillageStructure`, and quest/session methods. `villageStructures()`
provides structures including subject portals. The `world`, `dungeonNavigation`,
`villageWorld`, `villageInteractions`, `fishingState`, `fishingMechanics`, and
other exported namespaces provide host-independent models and rules.

For fishing, begin a session for a subject with `fishing/session-begin`, drive
`fishingState.createFishingState` and `fishingState.reduceFishing` with the
host's clock and random stream, and send the resulting cast, bite and keep or
release commands through `dispatchFishing`. The command interface assumes the
host sends results from the state machine; it is not an anti-cheat boundary.
Fishing requires at least one cleared room and uses the selected session's
subject for eligibility, recall, and rewards.

`dungeonNavigation` provides position, visible floors, collision, room travel
and the map-teleport cooldown. Recreate it when the subject graph changes.
`villageWorld` supplies player and NPC movement and proximity selection; a host
decides how to display and invoke the reported interactions.

Study-session records are in `snapshot().studySessions`. Creating or activating
a subject starts a session; returning to the village closes it. Call
`recordRoomVisit(roomId)` when navigation enters a room; awarded notes, reviews
and fishing XP are counted automatically. A host should call
`endStudySession()` on exit. On recovery after an interrupted host, call
`endStudySession(true)` to close the unfinished session at its last activity,
then `activateSubject` to start another. A `newStudySessionId` option can be
injected for deterministic tests.

## Storage contract

`MemoryEngineStorage` is volatile: keep the instance to reopen the same state,
but data disappears with the process. For durable saves, implement
`EngineStorage.load()` and `save(state)`. `save` must atomically replace the
whole state or reject without changing the prior state. Store the complete
`EngineState`, including `Uint8Array` attachment bytes, and preserve its
version. The engine serializes commands within one instance. Use only one
engine instance per adapter at a time: instances cache state independently.

Existing Knowledge Dungeon saves and backup files are **not compatible** with
this fresh engine state. There is no migration or persistent browser/Node
adapter included. Generated IDs must be unique; optional session and attachment
ID generators can be injected, otherwise `crypto.randomUUID()` is used. Inject
`random` to control loot rolls.

## License

MIT. The original source and attribution are preserved in `LICENSE`.
