# Building a Host UI

This guide is for developers turning **Knowledge Dungeon Engine** into a playable interface. It covers host architecture, screen and input design, frame loops, persistence UX, accessibility, performance, and the trust boundaries the engine deliberately leaves to you.

It does not replace the [user guide](user-guide.md), which documents commands and results, or the [administrator guide](admin-guide.md), which covers packaging and storage operations. The engine is framework-neutral; examples here are plain TypeScript sketches, not a recommendation of React, Pixi, Phaser, or any other stack.

## What the Engine Gives You

| Engine provides | Host provides |
| --- | --- |
| Subject graph, note validation, progression, review scheduling, fishing rules | Screens, layout, camera, animation, particles, sprites, audio |
| `EngineState` snapshots and change notifications | State projection into view models, rendering, local UI state |
| Domain and application commands with typed outcomes | Input mapping, command dispatch, loading and disabled states |
| Dungeon layout, floor visibility, collision, room travel | Movement presentation, camera follow, minimap rendering |
| Village layout, NPC paths, proximity candidates | NPC rendering, dialogue UI, interaction prompts |
| Fishing state machine and seeded rolls | Canvas/WebGL rendering, water, rod/line animation, input aiming |
| Study-session records and statistics inputs | Dashboard layout, charts, date formatting, export UI |
| Deterministic assistance suggestions | Suggestion presentation; the engine offers no actions |
| A storage contract | Durable adapter, encryption, backups, error reporting |

The package includes no game assets, audio files, scene manager, router, or save backend. `src/content/playerClasses.ts` supplies sprite **path strings**, not the sprites themselves.

## Recommended Host Architecture

Keep the engine as a headless authority and layer presentation around it:

```text
Input devices
    │
    ▼
Host controller / router ──────► Engine commands
    │                               │
    │                               ▼
    │                          EngineState commit
    │                               │
    ▼                               ▼
Local world state            State projection
(movement, camera,           (active subject, rooms,
 fishing machine)             progression, sessions)
    │                               │
    └──────────────► Renderer ◄─────┘
```

A practical split:

- **Engine authority:** one `KnowledgeDungeonEngine` instance, opened once, with one storage adapter.
- **Host controller:** maps input to commands, owns the current screen, and handles pending/refused/failed operations.
- **Local world state:** movement position, camera, animation, and the in-progress fishing machine. These are not committed game state.
- **Projection:** small selectors that read `snapshot()` or the latest subscribed state and produce view models.
- **Renderer:** consumes view models only. It should not mutate engine state or call commands directly.

One engine instance per adapter is a hard constraint. If you put the engine in a worker or a desktop main process, route every command through that single owner rather than opening a second instance in the UI process.

## Boot and State Flow

A minimal boot sequence:

```ts
import { KnowledgeDungeonEngine, type EngineState } from 'knowledge-dungeon-engine';

let state: EngineState;

const engine = await KnowledgeDungeonEngine.open({
  storage,
  nowIso: () => new Date().toISOString(),
  newRoomId: () => crypto.randomUUID(),
  onListenerError: (error) => reportHostError(error),
});

state = engine.snapshot();

const unsubscribe = engine.subscribe((next) => {
  state = next;
  renderFromState(next);
});
```

Guidelines:

- Keep one subscription at the app root, or a few coarse ones. Do not subscribe every component; each commit delivers a cloned full state.
- Treat both `snapshot()` and subscriber payloads as immutable. The engine clones at the boundary, but mutating the copy is still a bug in your projection.
- Use `subscribe` for committed changes and local state for per-frame movement or fishing. Do not call `snapshot()` every frame.
- Read `session.world`, `session.phase`, `activeSubjectId`, and `fishingSession` to choose the screen. Do not infer the screen from `activeSubjectId` alone.
- Route transitions through engine methods (`interactVillageStructure`, `returnToVillage`, fishing commands) rather than editing `session` fields in your own state.

## Screen and Flow Design

A reasonable mapping, not a requirement:

| Screen | Source state | Primary commands |
| --- | --- | --- |
| Village | `session.world === 'village'` | `villageStructures()`, `interactVillageStructure()`, `startTutorial()` |
| Creator | `session.phase === 'creator'` with an active subject | `dispatchGraph()`, `activateSubject()` |
| Scribe / dungeon | `session.world === 'dungeon'`, `phase === 'scribe'` | `recordRoomVisit()`, `submitNote()`, `collectArtifact()` |
| Archaeologist / review | `phase === 'archaeologist'` | `dispatchReview()` |
| Fishing | `session.world === 'fishing'`, `fishingSession !== null` | `dispatchFishing()`, `fishingState` machine |
| Progress / statistics | Any world; usually an overlay | `statistics` namespace, `snapshot()` |
| Settings / assistance | Any world; usually an overlay | Host-owned; `assistance` namespace for suggestions |

Design considerations:

- **The engine has no screen stack.** You own routing, transitions, and back behavior. Decide what “back” means during a review or a fishing session.
- **Quests are data, not navigation.** `QUEST_STEPS`, `setQuestStep`, and `advanceQuest` support onboarding, but the host decides when to show quest UI and when a step is complete.
- **Review and note editing are modal in many hosts.** If you use a modal, preserve the room selection and do not discard an unfinished review on close; use `review/session-save` or `review/session-discard` explicitly.
- **The village is a hub.** Subject portals, the guild hall, and the training gate change engine state through `interactVillageStructure`; do not reimplement those transitions.
- **A side-scrolling host cannot reuse dungeon movement.** Reuse learning, progression, review, and fishing rules, but supply your own movement and collision.

## Frame Loop and Timing

Movement and fishing are driven by the host. The engine has no loop of its own.

```ts
let lastMs = performance.now();

function frame(nowMs: number) {
  const deltaMs = Math.max(0, Math.min(nowMs - lastMs, 100));
  lastMs = nowMs;

  if (currentScreen === 'dungeon' && navigation) {
    const next = navigation.move(readDirection(), deltaMs);
    renderDungeon(next); // local state; no engine commit
  }

  if (currentScreen === 'fishing') {
    const result = fishingState.reduceFishing(fishingMachine, {
      type: 'tick',
      nowMs,
    }, fishingRng);
    fishingMachine = result.state;
    playEffects(result.effects);
    renderFishing(fishingMachine);
  }

  requestAnimationFrame(frame);
}
```

Rules that prevent common bugs:

- **Do not simulate in render.** Advance the loop, then render the resulting state.
- **Pass elapsed milliseconds, not frame counts.** Movement is speed × time.
- **Clamp hostile deltas.** A background tab can deliver a huge delta; the engine rejects negative or non-finite values, but a host should also cap large steps.
- **Keep movement local.** `dungeonNavigation.move()` updates the navigation controller; it does not commit engine state. Do not save on every frame.
- **Keep an in-progress cast local.** `fishing/session-begin` is persisted, but cast, bite, and reel progress are not resumable. Do not try to restore mid-cast.
- **Use one clock domain.** Feed the same `nowMs` to the fishing machine and to `teleportToRoom`; the teleport cooldown rejects a backwards clock.
- **Respect the bite windows.** The fishing machine owns the bite and proximity deadlines. Do not invent a second timer in the renderer.

## Input and Command Dispatch

Map input to engine commands, not to state writes:

| Input | Host action |
| --- | --- |
| Select a subject portal | `interactVillageStructure(id)` |
| Move in the village | `villageWorld.stepVillagePlayer()` or your own controller |
| Move in the dungeon | `dungeonNavigation.move(direction, deltaMs)` |
| Enter a room | `recordRoomVisit(roomId)` when navigation enters it |
| Open a note editor | Local UI state; read the room from `snapshot()` |
| Submit a note | `submitNote()` or `dispatchEncounter()` |
| Complete a review | `dispatchReview({ type: 'review/pass-complete', ... })` |
| Keep or release a fish | `dispatchFishing()` after the machine result |
| Teleport on the map | `dungeonNavigation.teleportToRoom(roomId, nowMs)` |

Handle command outcomes explicitly:

```ts
async function submitNote(roomId: string, noteText: string, confirmed: boolean) {
  setPending(true);
  try {
    const result = await engine.submitNote({ roomId, noteText, manualConfirmed: confirmed });
    if (!result.ok) {
      showRefusal(result.error.code, result.error.message);
    } else if (result.value.kind === 'draft') {
      showValidation(result.value.validation);
    } else {
      showClear(result.value.progression);
      refreshArtifact(result.value.artifactMarkdown);
    }
  } catch (error) {
    showSaveFailure(error); // storage failure: the action did not commit
  } finally {
    setPending(false);
  }
}
```

- **Refusals are not exceptions.** Show the code/message and let the learner correct the action.
- **A rejection means the action did not commit.** Usually that is a storage failure; it can also be a precondition or host wiring error (for example, collecting an artifact that does not exist). Show “not saved” or a specific failure, never a success state.
- **Disable or queue duplicate intent.** The engine serializes commands and some rewards are idempotent, but a disabled button is better UX than a silent duplicate.
- **Do not translate a refusal into a generic toast.** A `REVIEW_LOCKED` message is actionable; a generic “Something went wrong” is not.
- **Do not log learner prose.** Log codes, counts, and app ids.

## Persistence and Failure UX

The engine commits after successful commands and calls subscribers only after `storage.save()` resolves. That gives the host a clear rule: if `save` rejects, the action did not happen.

- Implement atomic `save`, and keep the previous state if it fails.
- Tell the learner when progress was not saved. Offer retry; do not silently continue as if it worked.
- Decide a save cadence for host-owned data (camera position, settings). The engine's state saves only on engine commands.
- Persist `attachmentBytes` with a binary-capable format. Do not drop progression `extraFields`; it carries award-once ledgers and interrupted reviews.
- Use one adapter and one engine instance. Two tabs or processes need host-level coordination, not two engine instances.
- On startup after a crash, call `endStudySession(true)` and show the recovered session if your UI reports study history.

See [Storage and backups](admin-guide.md#storage-and-backups) for the full field list and backup procedure.

## Study Sessions

A session represents presence and activity, not a screen. Keep it aligned with the learner's actual study flow:

- `createSubject` and `activateSubject` start a session. Do not start one manually in the UI.
- Call `recordRoomVisit(roomId)` when the learner enters a room, not when a room is merely visible on the map.
- Call `endStudySession()` when leaving the dungeon. Returning to the village already ends it.
- If the host closes while a session is open, recover with `endStudySession(true)` at next boot.
- Do not count idle menu time as study time; the engine only knows the activity the host reports.

## Attachments and Content Safety

Notes and artifacts are learner-authored content. Treat them as untrusted:

- Render artifact markdown through a sanitizer or a renderer that disallows raw HTML and unsafe links.
- Do not inject `artifactMarkdown` or `noteText` with `innerHTML`.
- Treat attachment `fileName` and `externalUrl` as display text, not trusted paths or fetches.
- Do not automatically fetch external attachment URLs. The engine records them without fetching.
- Validate attachment size and MIME type in the host before calling `encounter/attachment-add`.
- Revoke object URLs when an attachment view unmounts; `attachmentBytes` are `Uint8Array` values, not browser URLs.

## Accessibility and Mobile

The engine cannot make a canvas accessible. If the UI is canvas/WebGL, provide a parallel accessible path:

- **Keyboard:** every action must have a keyboard equivalent, including map movement, interaction, note editing, review rating, and fishing.
- **Screen readers:** expose the current room, exits, room status, nearby interactables, and validation results as DOM text or ARIA live regions.
- **Focus:** move focus into modals and return it on close. Do not trap focus in a canvas.
- **Announcements:** announce command refusals, save failures, cleared rooms, and review outcomes. Do not rely on visual effects alone.
- **Reduced motion:** honor the OS preference for camera movement, fishing animation, and transitions.
- **Color:** do not encode room status, rarity, or correctness by color alone; pair it with text or shape.
- **Text:** support zoom and reflow; use real form controls for the note editor and review rating.
- **Touch:** provide adequate targets, safe-area padding, and on-screen equivalents for keyboard-only actions.
- **Mobile keyboards:** test note entry with the virtual keyboard open; do not hide the submit action behind it.
- **Audio:** if you add sound, provide captions/transcripts and a mute control. The engine names fishing audio hooks but plays nothing.

## Performance

The expensive parts are usually host-side, not domain logic:

- **Snapshot cloning:** each commit and each `snapshot()` clones the full state, including note text and attachment bytes. Do not call it per frame or per component render.
- **Subscription granularity:** subscribe once and pass down selected view models. Avoid a subscription per room card.
- **Movement:** update only navigation/render state per frame. Do not commit or save per frame.
- **Fishing:** the machine is cheap; rendering water, particles, and text is not. Keep cosmetic animation separate from the gameplay clock.
- **Markdown:** parse and sanitize once per note version, not on every render.
- **Large collections:** virtualize room lists, the fish collection, and the statistics table.
- **Attachments:** avoid copying `Uint8Array` data into multiple view models; create object URLs once and revoke them.
- **State growth:** study sessions, ledgers, collected notes, and attachments grow over time. Measure serialized size and apply host retention policy for blobs.

## Testing a Host

The engine is designed for headless tests; use that:

- Inject a fixed `nowIso`, deterministic `newRoomId`, `newStudySessionId`, `newSessionId`, `newAttachmentId`, and a seeded `random`.
- Use a fake `EngineStorage` that can reject on demand; assert that a rejected save leaves the UI in a “not saved” state.
- Test refusal paths and rejection paths separately.
- Drive `dungeonNavigation` with fixed deltas and assert positions, room transitions, and cooldown behavior.
- Replay fishing with the same seed, viewport, and event sequence; assert the phase, catch, and rewards.
- Test the projection layer without a renderer: feed an `EngineState` fixture and assert the view model.
- Test accessibility separately: keyboard-only flows, focus order, live-region messages, and reduced-motion behavior.
- Do not rely on visual snapshots alone for logic; keep domain assertions in headless tests.

## Security and Trust Boundaries

- **The engine is local authority, not an anti-cheat service.** Fishing commands trust the host's machine results. Do not use them for competitive or monetary outcomes without server-side validation.
- **The learner can edit local state.** Treat progression as local data, not as a tamper-proof record.
- **No network is built in.** If you add sync, authentication, authorization, conflict resolution, and audit are host responsibilities.
- **Never put secrets in engine options or state.**
- **Sanitize all learner-authored display content** and never auto-fetch external attachment URLs.
- **Log codes, not prose.** Note text, artifact text, topics, and subject names are learner data.
- **Do not promise privacy properties the host does not implement.** The engine sends nothing, but your host might.

## Platform Considerations

| Platform | What to plan for |
| --- | --- |
| Web | Canvas/WebGL or DOM renderer; keyboard, pointer, touch; IndexedDB or another durable adapter; bundle size; browser storage quotas. |
| Desktop | Electron/Tauri wrapper (the engine does not depend on either); file-based storage; native menus; auto-update; window persistence. |
| Mobile | Touch controls, safe areas, DPR, virtual keyboard, battery/heat, background suspension, storage limits. |
| Terminal | ASCII/ANSI map, line-based note editor, no pointer; movement and fishing still use the same rules. |
| Side-scrolling | Host-supplied movement and collision; reuse subjects, notes, progression, review, fishing, statistics, and assistance. |

For a terminal or side-scrolling host, the engine's grid navigation is optional. Its learning and progression commands are not tied to the grid.

## Host Acceptance Checklist

- [ ] One engine instance and one storage adapter, with atomic saves and a visible save-failure path.
- [ ] Boot reads `snapshot()`, subscribes once, and projects state into view models.
- [ ] Every screen has an explicit source in `session.world`, `session.phase`, `activeSubjectId`, or `fishingSession`.
- [ ] Movement and fishing tick in a host loop with elapsed milliseconds; no simulation in render.
- [ ] Movement and in-progress casts are not persisted per frame.
- [ ] Every pointer/touch action has a keyboard equivalent.
- [ ] Focus, announcements, reduced motion, and non-color status cues are implemented.
- [ ] Refusals and rejections are handled differently, and save failures say “not saved.”
- [ ] Note and artifact rendering sanitizes untrusted markdown and attachment metadata.
- [ ] Study sessions start, record room visits, end, and recover correctly.
- [ ] Fishing uses one seed, one clock, and one subject context per session.
- [ ] Host-owned assets, audio, routing, and settings are clearly separated from engine state.
- [ ] The host has headless tests for projection, commands, storage failure, movement, and fishing replay.
- [ ] No learner prose is logged, and no credentials are placed in engine state.

## Related Documentation

- [User guide](user-guide.md) — commands, workflows, refusals, and API usage.
- [Administrator guide](admin-guide.md) — storage, backups, upgrades, recovery, and security.
- [ADR index](adr/README.md) — why the engine boundary and storage contract look this way.
- [README](../README.md) — quickstart and project overview.
