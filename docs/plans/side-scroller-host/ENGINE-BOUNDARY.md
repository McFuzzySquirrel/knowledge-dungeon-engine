# Engine Boundary and Future Host UIs

| Field | Value |
|---|---|
| Status | Active — governs P5–P10 |
| Parent | [Implementation plan](README.md) |
| Written | 2026-11-24 |
| Applies to | `examples/side-scroller/` and any future host surface |

This document records how the side-scroller example stays **strictly additive** to the
engine, and how that rule scales when another UI (a top-down host, a terminal client, a
mobile shell, a different renderer) is added later. It is deliberately plan-folder-scoped
while only one host exists; promote it to a root ADR when a second UI is actually
scheduled.

---

## 1. Invariants

These are not style preferences. A phase that breaks one of them is out of scope.

1. **No engine source changes.** P5–P10 do not edit `src/`, the published export map, the
   storage schema, or runtime dependencies.
2. **Commands are the only mutation path.** Movement, camera, physics, in-progress casts,
   review drafts, and creator form state stay host-local until a command commits them.
3. **The engine owns rules.** Eligibility, validation, XP, SM-2 scheduling, fishing
   results, graph cascade rules, and persistence decisions stay in the engine. The host
   presents and routes; it never reimplements a rule to make a screen easier.
4. **One writer per store.** The host uses the single `KnowledgeDungeonEngine` instance,
   one subscription, and `snapshot()` only at boot and for one-shot reads.
5. **Text is data, not markup.** Learner notes, recall prompts, topics, and artifact text
   are rendered as text nodes. They are never put in `innerHTML`, logged, or announced
   wholesale.
6. **The example is disposable.** Deleting `examples/side-scroller/` and reverting the
   documented root entries must leave the engine exactly as it was.

## 2. What the host may import

| Kind | Allowed | Notes |
|---|---|---|
| Public namespaces | Yes | `graph`, `progression`, `review`, `notes`, `subjects`, `artifacts`, `assistance`, `statistics`, `fishingMechanics`, `fishingState`, `fishingTypes`, `dungeon`, `world`, `dungeonNavigation`, `village`, `villageWorld`, `villageInteractions`, `archetypes`, `tutorial` |
| Public classes/types | Yes | `KnowledgeDungeonEngine`, `EngineState`, command unions, controller types |
| Type-only imports from `src/` | Yes, with a record | A host may name a type the export map omits by importing it type-only through the `@` alias. Each one is a **candidate engine export** and is listed in the phase evidence (K-14). |
| Value imports from internal `src/` paths | No | If the value is needed, the engine must export it. Do not reach around the barrel. |
| Editing `src/index.ts` | No | Never, in a host plan. |

## 3. Surface ownership

| Surface | Owner | State it may hold |
|---|---|---|
| `main.ts` | Host | Screen, camera, level, body, active interactive, pending flags |
| `level/` | Host | Derived side-view geometry from `DungeonMap` / `VillageMapDef` |
| `physics.ts` | Host | Position, velocity, grounded/ladder flags |
| `render/` | Host | Canvas pixels only |
| `ui/` | Host | DOM focus, form drafts, dialogs |
| `fishing/` | Host | Machine state, RNG stream, cast clock |
| `engine.ts` | Host | One engine, one subscription, cached state |
| `storage.ts` | Host | Browser storage adapter |
| `review/`, `creator/`, `village/`, `journal/` (P5–P10) | Host | Screen state and form drafts only |

The engine owns: subjects, rooms, notes, artifacts, progression, study sessions, review
schedules, fishing sessions, graph rules, and durable app-owned fields.

## 4. Escalation path for a missing capability

When a screen wants something the engine does not expose:

1. **Try the public surface first.** Most gaps are presentation gaps, not engine gaps.
2. **Record it as a candidate export** if only a type is missing. Use a type-only import
   and note it in the phase evidence.
3. **If a command or projection is genuinely missing**, stop the host phase and write a
   separate engine plan or ADR. That plan owns:
   - the command/payload contract and its refusal codes;
   - the durable-state change, if any, with a storage migration;
   - tests against the engine suite and a new baseline row;
   - the public export.
4. **Never fork the rule in the host.** A host-side workaround that writes state, fakes a
   reward, or re-derives eligibility is a defect even when the screen looks right.

Known deferred capabilities that would need engine work are listed in §6.

## 5. Checklist for adding a new UI

- [ ] It consumes only the public surface and records any type-only imports.
- [ ] Every state change goes through a command; no direct writes to a cloned state.
- [ ] One subscription; no `snapshot()` in a frame loop.
- [ ] Screen routing is explicit from `session.world`, `session.phase`,
      `activeSubjectId`, `fishingSession`, and the route's own notice.
- [ ] It has a failure story for `{ ok: false }` and for a rejected promise.
- [ ] Learner text is rendered as text and never logged.
- [ ] Keyboard, reduced motion, and focus return are part of the definition of done.
- [ ] It can be deleted without touching `src/`.
- [ ] Its host-local state is named and documented (settings, camera, drafts).
- [ ] It typechecks against engine source at every gate.

A new UI starts with a copy of this checklist in its own plan, not by editing this one.

## 6. Deferred capabilities

| Capability | Why it is deferred | Where it would land |
|---|---|---|
| Fish selling / trading | No engine command; a host-side ledger would duplicate progression | A Fisher's Rest engine plan |
| NPC dialogue state changes | `villageNpc` selects lines; it does not persist conversation state | A village-interaction engine plan |
| Multiple save slots | The storage contract is one `EngineState` | An engine storage plan, with migration |
| Cloud sync / accounts | Explicit product non-goal | Not planned |
| Anti-cheat | The engine trusts host-reported machine results | Not planned |
| Art/audio pipeline | Placeholder rectangles and no audio are deliberate | A separate presentation plan if wanted |

P7 exposes the Fish Stand as a **collection display** and NPCs as **read-only lines**.
Those are honest host features, not stubs pretending to mutate state.

P8 keeps `HostSettings` in `localStorage` under one host key: the engine has no settings
command and no settings field in `EngineState`, so motion, text scale, assistance mode,
and touch preference never enter a save. The assistance engine accepts a boolean
`flagEnabled`; the host names that flag `VITE_ADAPTIVE_ASSISTANCE`. Journal data is a pure
projection over the public `progression`, `statistics`, `review`, and `assistance`
namespaces.

P9 adds a host JSON envelope around **one** `EngineState`: attachment bytes are base64,
the decoder validates the envelope and required keys before any write, and import uses
the host storage adapter (one atomic save) followed by a reload. This is portability, not
multi-slot storage; host settings are not in the bundle. Touch buttons call the same
`IntentState` as the keyboard and the same fishing machine events — no second movement or
cast implementation lives in the host.

## 7. Compat and review

- Every gate runs the engine and example suites, both typechecks, both builds, and the
  `examples/**` isolation probe.
- A future engine refactor may break a host; the example typecheck against source is the
  early-warning system. Add the example to CI only when a CI workflow exists; this plan
  stays local by maintainer decision.
- Re-read this document at the start of each phase and refine it in P10 with anything the
  phases learned.
- Promote to `docs/adr/` when a second UI is scheduled, so the rule outlives this example.
