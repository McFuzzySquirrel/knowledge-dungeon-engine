import { describe, expect, it } from 'vitest';
import { KnowledgeDungeonEngine, MemoryEngineStorage } from '@/index';
import { cascadeRemovalCount, projectCreator } from '../src/creator/projection';
import { seedDemoSubjects } from '../src/creator/seeds';

const FIXED_NOW = '2026-11-24T12:00:00.000Z';

function openEngine(): Promise<KnowledgeDungeonEngine> {
  return KnowledgeDungeonEngine.open({
    storage: new MemoryEngineStorage(),
    nowIso: () => FIXED_NOW,
    newRoomId: () => crypto.randomUUID(),
    newStudySessionId: () => crypto.randomUUID(),
  });
}

async function seeded() {
  const engine = await openEngine();
  await seedDemoSubjects(engine);
  return engine;
}

function roomAfter(state: ReturnType<KnowledgeDungeonEngine['snapshot']>, subjectId: string, index: number) {
  return state.subjects[subjectId].dungeon.rooms[index].roomId;
}

describe('P6 Creator projection', () => {
  it('lists every subject with room and cleared counts', async () => {
    const engine = await seeded();
    const view = projectCreator(engine.snapshot(), null);

    expect(view.activeSubjectId).toBeNull();
    expect(view.rooms).toEqual([]);
    expect(view.edges).toEqual([]);
    expect(view.subjects.map((subject) => subject.subjectId)).toEqual([
      'demo-rivers',
      'demo-sky',
      'demo-kitchen',
    ]);
    const kitchen = view.subjects.find((subject) => subject.subjectId === 'demo-kitchen');
    expect(kitchen).toMatchObject({
      subjectName: 'Kitchen Chemistry',
      roomCount: 4,
      clearedCount: 0,
      rootRoomId: 'demo-kitchen-root',
    });
  });

  it('projects the tree in depth-first graph order with tags and cross-links', async () => {
    const engine = await seeded();
    const state = engine.snapshot();
    const view = projectCreator(state, 'demo-kitchen');

    expect(view.activeSubjectId).toBe('demo-kitchen');
    expect(view.rooms.map((room) => room.topic)).toEqual([
      'Everyday Reactions',
      'Heat & Browning',
      'Acids & Bases',
      'Emulsions',
    ]);
    expect(view.rooms.map((room) => room.depth)).toEqual([0, 1, 1, 1]);
    expect(view.rooms[0]).toMatchObject({ roomId: 'demo-kitchen-root', parentRoomId: null });
    expect(view.rooms[1]).toMatchObject({
      roomId: roomAfter(state, 'demo-kitchen', 1),
      parentRoomId: 'demo-kitchen-root',
      tags: ['cooking'],
    });

    expect(view.edges).toEqual([
      {
        fromRoomId: roomAfter(state, 'demo-kitchen', 1),
        toRoomId: roomAfter(state, 'demo-kitchen', 3),
        relationType: 'related',
      },
    ]);
  });

  it('returns an empty room list for an unknown subject', async () => {
    const engine = await seeded();
    const view = projectCreator(engine.snapshot(), 'missing-subject');
    expect(view.activeSubjectId).toBeNull();
    expect(view.rooms).toEqual([]);
    expect(view.subjects).toHaveLength(3);
  });

  it('reflects a nested reparent as deeper indentation', async () => {
    const engine = await seeded();
    await engine.activateSubject('demo-kitchen');
    const rooms = engine.snapshot().subjects['demo-kitchen'].dungeon.rooms;
    const acids = rooms[2].roomId;
    const emulsions = rooms[3].roomId;

    const moved = await engine.dispatchGraph({
      type: 'graph/room-reparent',
      payload: { roomId: emulsions, newParentRoomId: acids },
    });
    expect(moved.ok).toBe(true);

    const view = projectCreator(engine.snapshot(), 'demo-kitchen');
    const emulsionsView = view.rooms.find((room) => room.roomId === emulsions);
    expect(emulsionsView).toMatchObject({ parentRoomId: acids, depth: 2 });
    await engine.returnToVillage();
  });

  it('counts a removal cascade the way the engine does, including cross-link reachability', async () => {
    const engine = await openEngine();
    await engine.createSubject({
      dungeonId: 'cascade',
      subjectName: 'Cascade',
      rootRoomId: 'cascade-root',
      rootTopic: 'Root',
      nowIso: FIXED_NOW,
    });
    const added = await engine.dispatchGraph({
      type: 'graph/children-add',
      payload: { parentRoomId: 'cascade-root', topics: ['A', 'C'] },
    });
    if (!added.ok || added.value.command !== 'graph/children-add') throw new Error('Setup failed');
    const [a, c] = added.value.createdRoomIds;
    const nested = await engine.dispatchGraph({
      type: 'graph/children-add',
      payload: { parentRoomId: a, topics: ['B'] },
    });
    if (!nested.ok || nested.value.command !== 'graph/children-add') throw new Error('Setup failed');
    const [b] = nested.value.createdRoomIds;

    // Hierarchy alone would take A and B (2 rooms).
    let view = projectCreator(engine.snapshot(), 'cascade');
    expect(cascadeRemovalCount(view, a)).toBe(2);

    // The engine's removal rule is undirected over all edges. B–C keeps B
    // reachable once A is dropped, so only A goes.
    const linked = await engine.dispatchGraph({
      type: 'graph/cross-link-add',
      payload: { fromRoomId: b, toRoomId: c },
    });
    expect(linked.ok).toBe(true);
    view = projectCreator(engine.snapshot(), 'cascade');
    expect(cascadeRemovalCount(view, a)).toBe(1);

    const removed = await engine.dispatchGraph({
      type: 'graph/room-remove',
      payload: { roomId: a },
    });
    if (!removed.ok || removed.value.command !== 'graph/room-remove') {
      throw new Error('Expected a remove outcome');
    }
    expect(removed.value.removedRoomIds).toEqual([a]);
  });
});
