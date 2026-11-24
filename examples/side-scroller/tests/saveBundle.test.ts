import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { KnowledgeDungeonEngine, MemoryEngineStorage, createEmptyState, type EngineState } from '@/index';
import { createIndexedDbStorage } from '../src/storage';
import {
  SAVE_BUNDLE_APP,
  SAVE_BUNDLE_VERSION,
  decodeSaveBundle,
  encodeSaveBundle,
  importSaveBundle,
} from '../src/saveBundle';
import { createFailingStorage } from './support/failingStorage';

const NOW = '2026-11-24T12:00:00.000Z';

function attachmentState(): EngineState {
  const state = createEmptyState();
  // A non-trivial pattern: NUL, high bytes, CR/LF, and the full 0–255 range.
  state.attachmentBytes = {
    'notes/room-one.md': new Uint8Array([0, 1, 2, 3, 10, 13, 127, 128, 200, 254, 255]),
    'images/diagram.bin': Uint8Array.from({ length: 256 }, (_, index) => index),
  };
  return state;
}

/** A JSON file has no bytes: the fixture must survive a real stringify/parse. */
function throughJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function validBundle(): ReturnType<typeof encodeSaveBundle> {
  return encodeSaveBundle(attachmentState(), NOW);
}

describe('P9 save bundle codec (E-17)', () => {
  it('round-trips attachment bytes through JSON without truncation', () => {
    const original = attachmentState();
    const decoded = decodeSaveBundle(throughJson(encodeSaveBundle(original, NOW)));

    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.state.attachmentBytes['notes/room-one.md']).toBeInstanceOf(Uint8Array);
    expect([...decoded.state.attachmentBytes['notes/room-one.md']]).toEqual([
      0, 1, 2, 3, 10, 13, 127, 128, 200, 254, 255,
    ]);
    expect([...decoded.state.attachmentBytes['images/diagram.bin']]).toEqual([
      ...original.attachmentBytes['images/diagram.bin'],
    ]);
    expect(decoded.state.version).toBe(1);
  });

  it('round-trips an empty attachment map and keeps the bundle envelope explicit', () => {
    const empty = createEmptyState();
    const bundle = encodeSaveBundle(empty, NOW);
    expect(bundle.bundleVersion).toBe(SAVE_BUNDLE_VERSION);
    expect(bundle.app).toBe(SAVE_BUNDLE_APP);
    expect(bundle.exportedAt).toBe(NOW);
    expect(bundle.state.attachmentBytes).toEqual({});

    const decoded = decodeSaveBundle(throughJson(bundle));
    expect(decoded.ok).toBe(true);
    if (decoded.ok) expect(decoded.state).toEqual(empty);
  });

  it('keeps a real engine snapshot intact across export and import', async () => {
    const source = new MemoryEngineStorage();
    const engine = await KnowledgeDungeonEngine.open({
      storage: source,
      nowIso: () => NOW,
      newRoomId: () => crypto.randomUUID(),
      newStudySessionId: () => crypto.randomUUID(),
    });
    await engine.startTutorial();
    const before = engine.snapshot();

    const bundle = throughJson(encodeSaveBundle(before, NOW));
    const target = new MemoryEngineStorage();
    const imported = await importSaveBundle(target, bundle);
    expect(imported.ok).toBe(true);

    const restored = await KnowledgeDungeonEngine.open({
      storage: target,
      nowIso: () => NOW,
      newRoomId: () => crypto.randomUUID(),
      newStudySessionId: () => crypto.randomUUID(),
    });
    expect(restored.snapshot()).toEqual(before);
  });

  it('rejects a wrong bundle version, app, or engine version', () => {
    const bundle = validBundle();

    const wrongVersion = decodeSaveBundle({ ...bundle, bundleVersion: 2 });
    expect(wrongVersion.ok).toBe(false);
    if (!wrongVersion.ok) expect(wrongVersion.error).toContain('bundle version');

    const wrongApp = decodeSaveBundle({ ...bundle, app: 'another-app' });
    expect(wrongApp.ok).toBe(false);
    if (!wrongApp.ok) expect(wrongApp.error).toContain('not exported');

    const wrongEngine = decodeSaveBundle({
      ...bundle,
      state: { ...bundle.state, version: 2 },
    });
    expect(wrongEngine.ok).toBe(false);
    if (!wrongEngine.ok) expect(wrongEngine.error).toContain('engine state version');
  });

  it('rejects a malformed base64 payload and a missing required key', () => {
    const bundle = validBundle();

    const badBase64 = decodeSaveBundle({
      ...bundle,
      state: {
        ...bundle.state,
        attachmentBytes: { 'notes/room-one.md': 'not base64 ***' },
      },
    });
    expect(badBase64.ok).toBe(false);
    if (!badBase64.ok) expect(badBase64.error).toContain('not valid base64');

    const missingSession = { ...bundle.state } as Record<string, unknown>;
    delete missingSession.session;
    const missing = decodeSaveBundle({ ...bundle, state: missingSession });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toContain('missing session');
  });

  it('ignores unknown bundle and state keys instead of merging them', () => {
    const bundle = validBundle();
    const decoded = decodeSaveBundle({
      ...bundle,
      hostSettings: { textScale: 'large' },
      state: { ...bundle.state, learnerInjected: 'yes' },
    });

    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect('hostSettings' in decoded.state).toBe(false);
    expect('learnerInjected' in decoded.state).toBe(false);
  });

  it('leaves the previous save byte-identical when import validation fails', async () => {
    const storage = new MemoryEngineStorage();
    const prior = attachmentState();
    await storage.save(prior);

    const result = await importSaveBundle(storage, { bundleVersion: 99 });
    expect(result.ok).toBe(false);
    expect(await storage.load()).toEqual(prior);
  });

  it('reports a rejected write and keeps the previous save loadable', async () => {
    const inner = createIndexedDbStorage(`save-bundle-${crypto.randomUUID()}`);
    const prior = attachmentState();
    await inner.save(prior);
    const storage = createFailingStorage(inner);
    storage.failNextSave(new Error('QuotaExceededError: simulated quota'));

    const result = await importSaveBundle(storage, throughJson(validBundle()));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('previous save is intact');
    expect(storage.saveAttempts).toBe(1);
    expect(await inner.load()).toEqual(prior);
    inner.close();
  });
});
