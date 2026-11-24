import { describe, expect, it } from 'vitest';
import {
  createEmptyState,
  KnowledgeDungeonEngine,
  MemoryEngineStorage,
  tutorial,
  village,
  type EngineState,
} from '@/index';
import { projectSurface } from '../src/projection';

const FIXED_NOW = '2026-11-23T12:00:00.000Z';

const STRUCTURES: village.VillageStructure[] = [
  {
    id: 'training-gate',
    type: 'training-gate',
    label: 'Training Grounds',
    gridX: 4,
    gridY: 5,
    width: 3,
    height: 3,
  },
  {
    id: 'portal-biology',
    type: 'portal-icon',
    label: 'Biology',
    gridX: 12,
    gridY: 3,
    width: 2,
    height: 3,
    subjectId: 'subject-biology',
    subjectName: 'Biology',
    roomCount: 6,
    clearedCount: 2,
  },
  {
    id: 'tree-1',
    type: 'tree',
    label: '',
    gridX: 0,
    gridY: 1,
    width: 1,
    height: 1,
  },
];

async function villageState(): Promise<EngineState> {
  const engine = await KnowledgeDungeonEngine.open({
    storage: new MemoryEngineStorage(),
    nowIso: () => FIXED_NOW,
    newRoomId: () => crypto.randomUUID(),
    newStudySessionId: () => crypto.randomUUID(),
  });
  await engine.startTutorial();
  const state = engine.snapshot();
  const base = state.progression[tutorial.TUTORIAL_SUBJECT_ID];
  if (!base) throw new Error('Tutorial progression missing');
  state.session = { ...state.session, world: 'village' };
  state.activeSubjectId = null;
  state.progression['subject-biology'] = {
    ...base,
    subjectId: 'subject-biology',
    xpTotal: 42,
    rank: 'Scholar',
  };
  return state;
}

describe('projectSurface', () => {
  it('lists labelled structures only and keeps portal counts as text', async () => {
    const view = projectSurface(await villageState(), STRUCTURES);

    expect(view.entries.map((entry) => entry.id)).toEqual(['training-gate', 'portal-biology']);
    expect(view.entries.find((entry) => entry.id === 'portal-biology')?.detail).toBe(
      '2 / 6 rooms cleared',
    );
    expect(view.entries.find((entry) => entry.id === 'training-gate')?.detail).toBe('Tutorial dungeon');
    expect(view.portalCount).toBe(1);
    expect(view.totalRooms).toBe(6);
    expect(view.clearedRooms).toBe(2);
  });

  it('sums XP across every progression record', async () => {
    const view = projectSurface(await villageState(), STRUCTURES);
    expect(view.xpTotal).toBe(42);
  });

  it('handles an empty structure list', () => {
    const view = projectSurface(createEmptyState(), []);
    expect(view.entries).toEqual([]);
    expect(view.portalCount).toBe(0);
    expect(view.totalRooms).toBe(0);
    expect(view.clearedRooms).toBe(0);
  });

  it('reads subject portals from engine.villageStructures(), not a host list', async () => {
    const engine = await KnowledgeDungeonEngine.open({
      storage: new MemoryEngineStorage(),
      nowIso: () => FIXED_NOW,
      newRoomId: () => crypto.randomUUID(),
      newStudySessionId: () => crypto.randomUUID(),
    });
    await engine.startTutorial();
    const state = engine.snapshot();
    const structures = engine.villageStructures();

    const view = projectSurface(state, structures);
    const portals = view.entries.filter((entry) => entry.portal);

    expect(portals).toHaveLength(1);
    expect(portals[0]?.subjectId).toBe(state.activeSubjectId);
    expect(portals[0]?.label).toBe('First Dungeon (Tutorial)');
    expect(structures.some((structure) => structure.type === 'training-gate')).toBe(true);
  });
});
