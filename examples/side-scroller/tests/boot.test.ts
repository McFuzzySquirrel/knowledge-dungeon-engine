import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { KnowledgeDungeonEngine } from '@/index';
import { createIndexedDbStorage } from '../src/storage';

const FIXED_NOW = '2026-11-23T12:00:00.000Z';

function engineOptions(storage: ReturnType<typeof createIndexedDbStorage>) {
  return {
    storage,
    nowIso: () => FIXED_NOW,
    newRoomId: () => crypto.randomUUID(),
    newStudySessionId: () => crypto.randomUUID(),
  };
}

describe('P0 boot pipeline', () => {
  it('starts the tutorial and restores it through a second engine instance', async () => {
    const name = `boot-test-${crypto.randomUUID()}`;

    const firstStorage = createIndexedDbStorage(name);
    const first = await KnowledgeDungeonEngine.open(engineOptions(firstStorage));
    await first.startTutorial();

    const started = first.snapshot();
    expect(started.session.world).toBe('dungeon');
    expect(started.activeSubjectId).not.toBeNull();
    const subjectId = started.activeSubjectId;
    if (!subjectId) throw new Error('Tutorial subject was not activated');
    expect(Object.keys(started.subjects[subjectId]?.rooms ?? {})).toHaveLength(3);
    firstStorage.close();

    const secondStorage = createIndexedDbStorage(name);
    const second = await KnowledgeDungeonEngine.open(engineOptions(secondStorage));
    const restored = second.snapshot();
    expect(restored.activeSubjectId).toBe(subjectId);
    expect(Object.keys(restored.subjects[subjectId]?.rooms ?? {})).toHaveLength(3);
    expect(restored.studySessions.length).toBe(started.studySessions.length);
    secondStorage.close();
  });
});
