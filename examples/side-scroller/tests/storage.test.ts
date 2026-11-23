import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createEmptyState, type EngineState } from '@/index';
import { createIndexedDbStorage } from '../src/storage';

function databaseName(): string {
  return `storage-test-${crypto.randomUUID()}`;
}

function fixture(label: string): EngineState {
  const state = createEmptyState();
  state.activeSubjectId = label;
  state.attachmentBytes = { 'attachment-1': new Uint8Array([0, 1, 2, 255]) };
  return state;
}

describe('IndexedDB storage adapter', () => {
  it('returns null when the database has no state', async () => {
    const storage = createIndexedDbStorage(databaseName());
    await expect(storage.load()).resolves.toBeNull();
    storage.close();
  });

  it('round-trips the complete state, including attachment bytes', async () => {
    const storage = createIndexedDbStorage(databaseName());
    await storage.save(fixture('first'));

    const loaded = await storage.load();
    expect(loaded?.activeSubjectId).toBe('first');
    const bytes = loaded?.attachmentBytes['attachment-1'];
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(bytes ?? [])).toEqual([0, 1, 2, 255]);
    storage.close();
  });

  it('returns an isolated copy, not a shared reference', async () => {
    const storage = createIndexedDbStorage(databaseName());
    await storage.save(fixture('first'));

    const firstRead = await storage.load();
    if (firstRead) firstRead.activeSubjectId = 'mutated';

    const secondRead = await storage.load();
    expect(secondRead?.activeSubjectId).toBe('first');
    storage.close();
  });

  it('clears the stored state', async () => {
    const storage = createIndexedDbStorage(databaseName());
    await storage.save(fixture('first'));
    await storage.clear();
    await expect(storage.load()).resolves.toBeNull();
    storage.close();
  });

  it('leaves the prior state readable when a save fails', async () => {
    const storage = createIndexedDbStorage(databaseName());
    await storage.save(fixture('first'));

    const poisoned = {
      ...fixture('second'),
      attachmentBytes: { bad: (() => undefined) as unknown as Uint8Array },
    } as EngineState;
    await expect(storage.save(poisoned)).rejects.toThrow();

    const loaded = await storage.load();
    expect(loaded?.activeSubjectId).toBe('first');
    storage.close();
  });
});
