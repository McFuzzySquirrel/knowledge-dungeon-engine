import { describe, expect, it } from 'vitest';
import { KnowledgeDungeonEngine, MemoryEngineStorage, type EngineStorage } from '@/index';
import { projectCreator } from '../src/creator/projection';

const FIXED_NOW = '2026-11-24T12:00:00.000Z';

const VALID_NOTE = [
  'Summary',
  'The note records what the learner understood in this room and why it matters.',
  '',
  'Key Points',
  'A note needs a summary, key points, and a recall question. The recall question ends with a question mark.',
  '',
  'Recall Question',
  'Why does a note need a recall question?',
  '',
].join('\n');

function openEngine(storage: EngineStorage): Promise<KnowledgeDungeonEngine> {
  return KnowledgeDungeonEngine.open({
    storage,
    nowIso: () => FIXED_NOW,
    newRoomId: () => crypto.randomUUID(),
    newStudySessionId: () => crypto.randomUUID(),
  });
}

describe('P6 created-subject campaign', () => {
  it('enters, clears, and reloads a created subject through its engine portal', async () => {
    const storage = new MemoryEngineStorage();
    const engine = await openEngine(storage);
    const created = await engine.createSubject({
      dungeonId: 'tide-pools',
      subjectName: 'Tide Pools',
      rootRoomId: 'tide-root',
      rootTopic: 'Rock Pool Ecology',
      nowIso: FIXED_NOW,
    });
    expect(created.ok).toBe(true);

    const children = await engine.dispatchGraph({
      type: 'graph/children-add',
      payload: { parentRoomId: 'tide-root', topics: ['Splash Zone', 'Mid Zone'] },
    });
    if (!children.ok || children.value.command !== 'graph/children-add') throw new Error('Setup failed');
    const [splash, mid] = children.value.createdRoomIds;

    await engine.dispatchGraph({
      type: 'graph/tags-set',
      payload: { roomId: mid, tags: ['observation'] },
    });
    await engine.dispatchGraph({
      type: 'graph/cross-link-add',
      payload: { fromRoomId: splash, toRoomId: mid },
    });
    await engine.returnToVillage();

    const portal = engine
      .villageStructures()
      .find((structure) => structure.id === 'portal-tide-pools');
    expect(portal?.label).toBe('Tide Pools');
    await engine.interactVillageStructure('portal-tide-pools');
    expect(engine.snapshot().session.world).toBe('dungeon');
    expect(engine.snapshot().activeSubjectId).toBe('tide-pools');

    const cleared = await engine.submitNote({
      roomId: splash,
      noteText: VALID_NOTE,
      manualConfirmed: true,
    });
    expect(cleared.ok).toBe(true);
    if (!cleared.ok) throw new Error('Expected a clear');
    expect(cleared.value.kind).toBe('cleared');

    const beforeReload = engine.snapshot();
    const reloaded = await openEngine(storage);
    const afterReload = reloaded.snapshot();

    expect(afterReload.subjects['tide-pools']).toEqual(beforeReload.subjects['tide-pools']);
    expect(afterReload.subjects['tide-pools'].rooms[splash].validationState.finalPass).toBe(true);
    expect(
      reloaded.villageStructures().find((structure) => structure.id === 'portal-tide-pools'),
    ).toBeDefined();

    const view = projectCreator(afterReload, 'tide-pools');
    expect(view.rooms.map((room) => room.topic)).toEqual([
      'Rock Pool Ecology',
      'Splash Zone',
      'Mid Zone',
    ]);
    expect(view.rooms[1].tags).toEqual([]);
    expect(view.rooms[2].tags).toEqual(['observation']);
    expect(view.edges).toHaveLength(1);
    expect(view.subjects.find((subject) => subject.subjectId === 'tide-pools')?.clearedCount).toBe(1);
  });
});
