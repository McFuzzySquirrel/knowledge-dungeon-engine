# P0 — Scaffold, Storage, and Boot

| Field | Value |
|---|---|
| Phase | P0 |
| Parent | [Implementation plan](README.md) |
| Depends on | — |
| Blocks | [P1](phase-1-dungeon-level.md) |
| Requirements | R-01, R-12, R-13, R-14, R-15 |
| Exit gate | [G0](#exit-gate-g0) |
| Status | Done — G0 passed 2026-11-23 |

## Objective

Stand up an isolated Vite example that opens exactly one engine instance, persists the
complete `EngineState` in IndexedDB, subscribes once, and proves the pipeline by
starting the tutorial and displaying state. No game rendering yet.

## Non-goals

- Canvas, physics, input, or level rendering.
- Village or fishing flows.
- Any change to engine source.

## Inputs and references

| What | Where |
|---|---|
| Public export surface | [`src/index.ts`](../../../src/index.ts) |
| Engine open/options | [`src/creatorEngine.ts`](../../../src/creatorEngine.ts) (`open`, `CreatorEngineOptions`) |
| Snapshot and subscribe | [`src/creatorEngine.ts`](../../../src/creatorEngine.ts) (`snapshot`, `subscribe`) |
| Tutorial entry | [`src/creatorEngine.ts`](../../../src/creatorEngine.ts) (`startTutorial`) |
| Storage contract | [`src/storage.ts`](../../../src/storage.ts); [ADR-0002](../../adr/0002-versioned-atomic-engine-state.md) |
| Boot and failure UX | [host guide §Boot](../../host-ui-guide.md#boot-and-state-flow), [§Persistence](../../host-ui-guide.md#persistence-and-failure-ux) |
| Study-session recovery | [host guide §Study Sessions](../../host-ui-guide.md#study-sessions) |
| Root scripts | [`package.json`](../../../package.json) |
| Root test config | [`vitest.config.ts`](../../../vitest.config.ts) |
| Root TS config | [`tsconfig.json`](../../../tsconfig.json) |
| Git ignore | [`.gitignore`](../../../.gitignore) |

## Frozen interfaces

Record these in the phase evidence before parallel work begins.

```ts
// src/storage.ts
export interface BrowserStorage { load(): Promise<EngineState | null>; save(state: EngineState): Promise<void>; clear(): Promise<void>; }
export function createIndexedDbStorage(databaseName?: string): BrowserStorage;

// src/engine.ts
export function openExampleEngine(storage: BrowserStorage): Promise<KnowledgeDungeonEngine>;
export function getState(): EngineState;
export function subscribeState(listener: (state: EngineState) => void): () => void;
```

`BrowserStorage` is structurally compatible with the engine's `EngineStorage`
(`load`/`save`). `clear` is host-only and never called by the engine.

## Work breakdown

### P0-T1 — Example package and scripts

- [x] Create `examples/side-scroller/package.json`: `private: true`, `type: "module"`,
      scripts `dev`, `build`, `preview`, `typecheck`, `test`, `test:watch`.
- [x] Dev dependencies only: `vite`, `typescript`, `vitest`, plus `@types/node` for the
      Node-typed Vite config and `fake-indexeddb` as the Node test double for the
      storage adapter. No framework, no UI library.
- [x] Generate a separate `package-lock.json` inside the example. Root lockfile must not
      change. Verify with `git diff --stat package-lock.json` (expect no output).
- [x] Pin versions and record them in evidence.

### P0-T2 — Vite and TypeScript configuration

- [x] `vite.config.ts` resolves `@` to `../../src` (the engine source uses `@/…`
      imports at runtime, e.g. [`encounterCommands.ts`](../../../src/application/encounterCommands.ts)).
- [x] `tsconfig.json` declares its own `baseUrl` and `paths` mapping `@/*` to
      `../../src/*`; do not rely on inherited paths.
- [x] Include `src` and `tests`; target ES2022 and DOM, strict.
- [x] `index.html` contains the canvas, a DOM overlay root, and a status region for
      announcements.
- [x] Build output goes to `dist/` inside the example; confirm the example `dist` is
      ignored and the engine's ignored `dist/` is untouched.

### P0-T3 — Root test isolation

- [x] Add `exclude: ['examples/**']` (preserving existing excludes) to the root
      [`vitest.config.ts`](../../../vitest.config.ts). This is the only permitted root
      config change and is recorded in the phase evidence.
- [x] Run `npx vitest list --config vitest.config.ts` from the repo root and record that
      no `examples/` path appears.
- [x] Run `npm test` from the root and record the test count as the **P0 baseline** in
      [EVIDENCE.md](EVIDENCE.md). Later gates compare against this number.

### P0-T4 — IndexedDB storage adapter

- [x] `createIndexedDbStorage` opens one database with one object store and one state
      key.
- [x] `load()` returns the stored object or `null`; never mutates it. The engine clones
      at its boundary, but the adapter still returns a fresh value.
- [x] `save(state)` performs one `readwrite` transaction (`put` then await
      `transaction.complete`). Any abort or error rejects. A rejected save must leave
      the prior value readable.
- [x] Store the whole `EngineState` by structured clone so `Uint8Array` attachment bytes
      survive ([ADR-0002](../../adr/0002-versioned-atomic-engine-state.md)).
- [x] `clear()` deletes the key.
- [x] Test: round-trip a fixture containing an attachment `Uint8Array`; test injected
      failure if the adapter supports a test hook (prefer a wrapper in tests rather than
      production failure flags).
- [x] Surface a visible storage error state if `open` or `load` rejects; no silent
      in-memory fallback.

### P0-T5 — Boot, subscription, and recovery

- [x] `openExampleEngine` calls `KnowledgeDungeonEngine.open` once with:
      `storage`, `nowIso: () => new Date().toISOString()`, `newRoomId: () => crypto.randomUUID()`,
      and an `onListenerError` that reports to the visible error region.
- [x] Subscribe once at the app root. Do not subscribe per component.
- [x] Boot routing reads `session.world`, `session.phase`, and `activeSubjectId`; do not
      infer from `activeSubjectId` alone. For P0, render state only.
- [x] Recovery policy: if a loaded state has `session.world === 'dungeon'` and an active
      study session, call `endStudySession(true)` and re-enter through
      `startTutorial()` or the subject portal, per the host guide. Record the observed
      behaviour; if `endStudySession(true)` does not make re-entry valid, stop and
      escalate instead of inventing a workaround.
- [x] Add a debug panel listing subject count, active subject, world/phase, quest step,
      and rooms with status. This is the P0 proof and is removed or hidden in P2.

### P0-T6 — Manual proof

- [x] Load the page, press the temporary "Start tutorial" button, and confirm the debug
      panel shows the tutorial subject with three rooms.
- [x] Reload and confirm the state is restored from IndexedDB.
- [x] Open DevTools → Application → IndexedDB and confirm one record under one key.

## Exit gate G0

All must be true, recorded in the evidence table.

- [x] Example installs, typechecks, tests, and builds with its own commands.
- [x] Root `npm test` count equals the recorded baseline; `npm run typecheck` and
      `npm run build` pass.
- [x] Isolation probe shows no `examples/` path.
- [x] Storage round-trip preserves attachment bytes; rejected save leaves prior state.
- [x] Boot + tutorial + reload works in the browser.
- [x] No `src/` diff (`git status --short src` empty).
- [x] G0 entry written in [EVIDENCE.md](EVIDENCE.md).

## Validation commands

```sh
# root
npm test
npm run typecheck
npm run build
npx vitest list --config vitest.config.ts

# example
npm --prefix examples/side-scroller install
npm --prefix examples/side-scroller run typecheck
npm --prefix examples/side-scroller test
npm --prefix examples/side-scroller run build
```

## Sub-agent opportunities

| Task | Agent | Owns | Inputs | Output | Integration |
|---|---|---|---|---|---|
| Confirm exact storage and boot symbols, options, and return types; report line references and any mismatch with this document | `explore` | Nothing (read-only) | `src/creatorEngine.ts`, `src/storage.ts`, `src/index.ts` | Short findings list | Run first; update P0 before coding |
| Implement IndexedDB adapter plus round-trip and failure tests | `general` | `src/storage.ts`, `tests/storage.test.ts` | Frozen `BrowserStorage` interface | Files, test commands, results | Merge before P0-T5 uses it |
| Implement Vite/TS/Vitest scaffold and root isolation change | `general` | `package.json`, `vite.config.ts`, `tsconfig.json`, `vitest.config.ts`, root `vitest.config.ts` | This document | Files, isolation probe output | Main agent reviews root config diff |
| Boot wiring and debug panel | Main agent | `src/engine.ts`, `src/main.ts`, `index.html` | Adapter + scaffold | Working boot | After the two agents return |

Guardrails: the storage agent may not edit `main.ts`; the scaffold agent may not edit
engine source; neither may add dependencies beyond the three approved dev dependencies.

## Phase-specific risks

- K-04: root Vitest discovery. Mitigated by P0-T3 and the isolation probe.
- K-05: IndexedDB unavailable. Fail visibly; record browser and error.
- K-06: attachment bytes lost. Covered by the storage round-trip test.
- K-11: mid-dungeon reload. Covered by the recovery task; escalate if the engine's
  documented flow does not fit.

## Rollback

Delete `examples/side-scroller/` and revert the `examples/**` exclusion in root
`vitest.config.ts`. No engine state or dependency changes to undo.

## Plan amendments during execution

| Date | Change | Reason |
|---|---|---|
| 2026-11-23 | Added `@types/node` and `fake-indexeddb` to the example dev dependencies | `vite.config.ts` imports `node:url`; IndexedDB does not exist in Node, so the storage tests need a test double |
| 2026-11-23 | Storage failure test uses a state value that cannot be structured-cloned instead of an injectable failure hook | Produces a real `put` failure; no production-only test flag |
| 2026-11-23 | Root exclusion written as `[...configDefaults.exclude, 'examples/**']` | Preserves Vitest's default excludes instead of replacing them |
| 2026-11-23 | Browser proof run in headless Firefox 150.0 through geckodriver, not by hand | Same actions and assertions; recorded as automated evidence |
| 2026-11-23 | Interrupted-dungeon recovery re-enters through `startTutorial()` | The plan allowed the tutorial or a subject portal; the tutorial is the only subject guaranteed in a P0 save |

## Execution evidence

Append rows only. Duplicate each into [EVIDENCE.md](EVIDENCE.md).

| Date (UTC) | Task/Gate | Commit | Command or artifact | Result | Notes |
|---|---|---|---|---|---|
| 2026-11-23 | Baseline (before P0 code) | `3951737` | `npm test`; `npm run typecheck`; `npm run build` | pass | 13 files / 280 tests; typecheck clean; tsup 327.74 kB ESM + declarations |
| 2026-11-23 | P0-T1/T2 | uncommitted | `npm install` in `examples/side-scroller` | pass | 45 packages, 0 vulnerabilities; vite 7.3.8, vitest 4.1.12, TypeScript 5.9.3, `@types/node` 24.19.2, `fake-indexeddb` 6.2.8 |
| 2026-11-23 | P0-T1/T2 | uncommitted | `npm run typecheck`; `npm run build` (example) | pass | Typecheck clean; Vite built 72 modules, 96.57 kB JS (27.14 kB gzip) |
| 2026-11-23 | P0-T3 | uncommitted | `npx vitest list --config vitest.config.ts`; `npm test` | pass | 0 `examples/` paths; root suite still 13 files / 280 tests |
| 2026-11-23 | P0-T4/T5 | uncommitted | `npm --prefix examples/side-scroller test` | pass | 2 files / 6 tests: storage null, round-trip `Uint8Array`, isolated copy, clear, failed save preserves prior state, tutorial boot/restore |
| 2026-11-23 | P0-T5/T6/G0 | uncommitted | Headless Firefox 150.0 via geckodriver against `npm run dev` (127.0.0.1:5174) | pass | Fresh: 0 subjects. After start: 1 subject, 3 rooms, world `dungeon`, session active. IndexedDB: version 1 record present. Reload: subject and rooms restored; recovery closed the open session and started a new one (`studySessions` 1 → 2) |
| 2026-11-23 | G0 | uncommitted | `git status --short src`; `git diff --stat src` | pass | No engine source diff. Root test baseline unchanged |
