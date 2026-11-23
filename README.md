# Knowledge Dungeon Engine (extraction in progress)

This is an **incomplete, unpublished prototype**, extracted from Knowledge Dungeon
at commit `87c346ae7894af903ca7a514eef2badbcf32e810`. It is not yet a replacement
for the game and should not be used as a complete engine.

The package currently includes renderer-neutral domain rules, dungeon
walkability, existing application controllers that require host-supplied ports,
and an initial creator-only facade with volatile in-memory storage.

Still needed: engine-owned encounter, artifact, review, progression and fishing
orchestration; village and NPC mechanics; complete save semantics; browser
verification; and end-to-end gameplay and parity tests. Existing Knowledge
Dungeon saves are not supported. The storage and public APIs may change.

Run `npm install`, `npm test`, `npm run typecheck`, and `npm run build`.
The original source is MIT licensed; see `LICENSE`.
