import { describe, expect, it } from 'vitest';
import { CreatorEngine } from '../../src/creatorEngine';
import { MemoryEngineStorage } from '../../src/storage';

const nowIso = '2026-01-01T00:00:00.000Z';

describe('creator engine', () => {
  it('creates a subject, serializes graph writes and restores from storage', async () => {
    const storage = new MemoryEngineStorage();
    let nextId = 0;
    const options = { storage, nowIso: () => nowIso, newRoomId: () => `room-${++nextId}` };
    const engine = await CreatorEngine.open(options);
    const created = await engine.createSubject({
      dungeonId: 'subject-1', subjectName: 'Math', rootRoomId: 'root', rootTopic: 'Math', nowIso,
    });
    expect(created.ok).toBe(true);
    const [first, second] = await Promise.all([
      engine.dispatchGraph({ type: 'graph/children-add', payload: { parentRoomId: 'root', topics: ['Algebra'] } }),
      engine.dispatchGraph({ type: 'graph/children-add', payload: { parentRoomId: 'root', topics: ['Geometry'] } }),
    ]);
    expect(first.ok && second.ok).toBe(true);
    const reopened = await CreatorEngine.open(options);
    expect(reopened.snapshot().subjects['subject-1'].dungeon.rooms.map((room) => room.topic))
      .toEqual(['Math', 'Algebra', 'Geometry']);
  });

  it('does not apply a failed write and permits retry', async () => {
    const memory = new MemoryEngineStorage();
    let fail = true;
    const storage = {
      load: () => memory.load(),
      save: async (state: Parameters<typeof memory.save>[0]) => {
        if (fail) throw new Error('disk failed');
        await memory.save(state);
      },
    };
    const engine = await CreatorEngine.open({ storage, nowIso: () => nowIso, newRoomId: () => 'new-room' });
    const input = {
      dungeonId: 'subject-1', subjectName: 'Math', rootRoomId: 'root', rootTopic: 'Math', nowIso,
    };
    await expect(engine.createSubject(input)).rejects.toThrow('disk failed');
    expect(engine.snapshot().activeSubjectId).toBeNull();
    fail = false;
    expect((await engine.createSubject(input)).ok).toBe(true);
  });
});
