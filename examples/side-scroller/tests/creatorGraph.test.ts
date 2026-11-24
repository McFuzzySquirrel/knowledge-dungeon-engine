import { describe, expect, it } from 'vitest';
import { KnowledgeDungeonEngine, MemoryEngineStorage, type EngineStorage } from '@/index';
import { createFailingStorage } from './support/failingStorage';

const FIXED_NOW = '2026-11-24T12:00:00.000Z';

function openEngine(storage: EngineStorage = new MemoryEngineStorage()): Promise<KnowledgeDungeonEngine> {
  return KnowledgeDungeonEngine.open({
    storage,
    nowIso: () => FIXED_NOW,
    newRoomId: () => crypto.randomUUID(),
    newStudySessionId: () => crypto.randomUUID(),
  });
}

async function subjectWithRooms(engine: KnowledgeDungeonEngine, topics: string[]) {
  await engine.createSubject({
    dungeonId: 'graph-subject',
    subjectName: 'Graph Subject',
    rootRoomId: 'graph-root',
    rootTopic: 'Root',
    nowIso: FIXED_NOW,
  });
  if (topics.length === 0) return [];
  const result = await engine.dispatchGraph({
    type: 'graph/children-add',
    payload: { parentRoomId: 'graph-root', topics },
  });
  if (!result.ok || result.value.command !== 'graph/children-add') {
    throw new Error('Child setup failed');
  }
  return result.value.createdRoomIds;
}

describe('P6 Creator graph commands through the engine', () => {
  it('adds children, sets tags, and adds a cross-link', async () => {
    const engine = await openEngine();
    const [a, b] = await subjectWithRooms(engine, ['A', 'B']);

    const tagged = await engine.dispatchGraph({
      type: 'graph/tags-set',
      payload: { roomId: a, tags: ['Heat & Browning', 'cooking'] },
    });
    expect(tagged.ok).toBe(true);
    if (!tagged.ok || tagged.value.command !== 'graph/tags-set') throw new Error('Expected tags');
    expect(tagged.value.tags).toEqual(['heat-browning', 'cooking']);

    const added = await engine.dispatchGraph({
      type: 'graph/tag-add',
      payload: { roomId: a, tag: 'science' },
    });
    expect(added.ok).toBe(true);
    if (!added.ok || added.value.command !== 'graph/tag-add') throw new Error('Expected tags');
    expect(added.value.tags).toContain('science');

    const removed = await engine.dispatchGraph({
      type: 'graph/tag-remove',
      payload: { roomId: a, tag: 'science' },
    });
    expect(removed.ok).toBe(true);
    if (!removed.ok || removed.value.command !== 'graph/tag-remove') throw new Error('Expected tags');
    expect(removed.value.tags).not.toContain('science');

    const linked = await engine.dispatchGraph({
      type: 'graph/cross-link-add',
      payload: { fromRoomId: a, toRoomId: b },
    });
    expect(linked.ok).toBe(true);
    expect(engine.snapshot().subjects['graph-subject'].dungeon.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fromRoomId: a, toRoomId: b, relationType: 'related' }),
      ]),
    );
  });

  it('reparents a room and reports the previous parent', async () => {
    const engine = await openEngine();
    const [a, b] = await subjectWithRooms(engine, ['A', 'B']);

    const moved = await engine.dispatchGraph({
      type: 'graph/room-reparent',
      payload: { roomId: b, newParentRoomId: a },
    });
    expect(moved.ok).toBe(true);
    if (!moved.ok || moved.value.command !== 'graph/room-reparent') throw new Error('Expected move');
    expect(moved.value.previousParentRoomId).toBe('graph-root');

    const edges = engine.snapshot().subjects['graph-subject'].dungeon.edges;
    expect(edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fromRoomId: a, toRoomId: b, relationType: 'subtopic' }),
      ]),
    );
  });

  it('removes a room and every room left unreachable from the root', async () => {
    const engine = await openEngine();
    const [a, c] = await subjectWithRooms(engine, ['A', 'C']);
    const nested = await engine.dispatchGraph({
      type: 'graph/children-add',
      payload: { parentRoomId: a, topics: ['B'] },
    });
    if (!nested.ok || nested.value.command !== 'graph/children-add') throw new Error('Setup failed');
    const [b] = nested.value.createdRoomIds;

    const removed = await engine.dispatchGraph({
      type: 'graph/room-remove',
      payload: { roomId: a },
    });
    expect(removed.ok).toBe(true);
    if (!removed.ok || removed.value.command !== 'graph/room-remove') throw new Error('Expected remove');
    expect([...removed.value.removedRoomIds].sort()).toEqual([a, b].sort());
    expect(engine.snapshot().subjects['graph-subject'].dungeon.rooms.map((room) => room.roomId)).toEqual([
      'graph-root',
      c,
    ]);
  });

  it('returns typed refusals without writing', async () => {
    const engine = await openEngine();
    const [a, b] = await subjectWithRooms(engine, ['A', 'B']);
    await engine.dispatchGraph({
      type: 'graph/cross-link-add',
      payload: { fromRoomId: a, toRoomId: b },
    });
    const before = engine.snapshot();

    const duplicate = await engine.dispatchGraph({
      type: 'graph/cross-link-add',
      payload: { fromRoomId: a, toRoomId: b },
    });
    expect(duplicate.ok).toBe(false);
    if (duplicate.ok) throw new Error('Expected a refusal');
    expect(duplicate.error.code).toBe('EDGE_ALREADY_EXISTS');

    const self = await engine.dispatchGraph({
      type: 'graph/cross-link-add',
      payload: { fromRoomId: a, toRoomId: a },
    });
    expect(self.ok).toBe(false);
    if (self.ok) throw new Error('Expected a refusal');
    expect(self.error.code).toBe('SELF_LOOP_EDGE');

    const duplicateTopics = await engine.dispatchGraph({
      type: 'graph/children-add',
      payload: { parentRoomId: 'graph-root', topics: ['Fresh', 'fresh'] },
    });
    expect(duplicateTopics.ok).toBe(false);
    if (duplicateTopics.ok) throw new Error('Expected a refusal');
    expect(duplicateTopics.error.code).toBe('TOPIC_ALREADY_EXISTS');

    expect(engine.snapshot()).toEqual(before);
  });

  it('refuses every graph command with no active subject', async () => {
    const engine = await openEngine();
    await subjectWithRooms(engine, ['A']);
    await engine.returnToVillage();
    const before = engine.snapshot();
    expect(before.activeSubjectId).toBeNull();

    const result = await engine.dispatchGraph({
      type: 'graph/tags-set',
      payload: { roomId: 'graph-root', tags: ['x'] },
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected a refusal');
    expect(result.error.code).toBe('INVALID_OPERATION');
    expect(result.error.message).toBe('No active subject');
    expect(engine.snapshot()).toEqual(before);
  });

  it('leaves both the in-memory and durable state intact when a write fails', async () => {
    const inner = new MemoryEngineStorage();
    const storage = createFailingStorage({
      load: () => inner.load(),
      save: (state) => inner.save(state),
      clear: async () => undefined,
    });
    const engine = await openEngine(storage);
    const [a] = await subjectWithRooms(engine, ['A']);
    const before = engine.snapshot();
    const durableBefore = await inner.load();

    storage.failNextSave(new Error('Simulated graph write failure'));
    await expect(
      engine.dispatchGraph({ type: 'graph/tags-set', payload: { roomId: a, tags: ['lost'] } }),
    ).rejects.toThrow('Simulated graph write failure');

    expect(engine.snapshot()).toEqual(before);
    expect(await inner.load()).toEqual(durableBefore);

    storage.clearFailure();
    const retried = await engine.dispatchGraph({
      type: 'graph/tags-set',
      payload: { roomId: a, tags: ['saved'] },
    });
    expect(retried.ok).toBe(true);
    expect(engine.snapshot().subjects['graph-subject'].rooms[a].tags).toEqual(['saved']);
  });
});
