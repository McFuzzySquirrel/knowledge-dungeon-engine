import { describe, expect, it } from 'vitest';
import { KnowledgeDungeonEngine, MemoryEngineStorage, type EngineStorage } from '@/index';
import {
  DEMO_SUBJECT_SEEDS,
  seedDemoSubjects,
  seedDemoSubjectsOnFirstRun,
  type SeedFlagStore,
} from '../src/creator/seeds';
import { createFailingStorage } from './support/failingStorage';

const FIXED_NOW = '2026-11-24T12:00:00.000Z';
const DEMO_IDS = ['demo-rivers', 'demo-sky', 'demo-kitchen'] as const;

function openEngine(storage: EngineStorage = new MemoryEngineStorage()): Promise<KnowledgeDungeonEngine> {
  return KnowledgeDungeonEngine.open({
    storage,
    nowIso: () => FIXED_NOW,
    newRoomId: () => crypto.randomUUID(),
    newStudySessionId: () => crypto.randomUUID(),
  });
}

function memoryFlag(initial: string | null = null): SeedFlagStore & { value: string | null } {
  return {
    value: initial,
    read() {
      return this.value;
    },
    write(next) {
      this.value = next;
    },
  };
}

function portals(engine: KnowledgeDungeonEngine) {
  return engine
    .villageStructures()
    .filter((structure) => structure.type === 'portal-icon' && structure.subjectId);
}

describe('P6 demo seeding', () => {
  it('creates the three demo subjects, progression, and portals, and closes the session', async () => {
    const engine = await openEngine();
    expect(portals(engine)).toHaveLength(0);

    const result = await seedDemoSubjects(engine);
    expect(result.seeded).toEqual([...DEMO_IDS]);
    expect(result.alreadyPresent).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(result.skipped).toBe(false);

    const state = engine.snapshot();
    expect(Object.keys(state.subjects).sort()).toEqual([...DEMO_IDS].sort());
    for (const id of DEMO_IDS) {
      expect(state.progression[id]).toBeDefined();
      expect(state.progression[id].subjectId).toBe(id);
    }

    expect(state.subjects['demo-rivers'].dungeon.rooms).toHaveLength(4);
    expect(state.subjects['demo-sky'].dungeon.rooms).toHaveLength(5);
    expect(state.subjects['demo-kitchen'].dungeon.rooms).toHaveLength(4);
    expect(state.subjects['demo-kitchen'].dungeon.edges.some((edge) => edge.relationType === 'related')).toBe(true);

    const browningId = state.subjects['demo-kitchen'].dungeon.rooms[1].roomId;
    expect(state.subjects['demo-kitchen'].rooms[browningId].tags).toEqual(['cooking']);

    // `createSubject` starts a session; the seed always returns to the street.
    expect(state.session.world).toBe('village');
    expect(state.activeSubjectId).toBeNull();
    expect(state.activeStudySessionId).toBeNull();
    expect(state.studySessions.every((session) => session.endedAt !== null)).toBe(true);

    expect(portals(engine).map((portal) => portal.subjectId).sort()).toEqual([...DEMO_IDS].sort());
  });

  it('is a no-op on a re-run', async () => {
    const engine = await openEngine();
    await seedDemoSubjects(engine);
    const before = engine.snapshot();

    const again = await seedDemoSubjects(engine);
    expect(again.seeded).toEqual([]);
    expect(again.alreadyPresent).toEqual([...DEMO_IDS]);
    expect(again.skipped).toBe(false);
    expect(engine.snapshot()).toEqual(before);
  });

  it('skips when a non-demo subject already exists, even with the flag unset', async () => {
    const engine = await openEngine();
    const created = await engine.createSubject({
      dungeonId: 'player-subject',
      subjectName: 'Player Subject',
      rootRoomId: 'player-root',
      rootTopic: 'Player Root',
      nowIso: FIXED_NOW,
    });
    expect(created.ok).toBe(true);
    await engine.returnToVillage();

    const result = await seedDemoSubjects(engine);
    expect(result.skipped).toBe(true);
    expect(result.seeded).toEqual([]);
    expect(Object.keys(engine.snapshot().subjects)).toEqual(['player-subject']);
  });

  it('runs once on a first boot and records the flag', async () => {
    const engine = await openEngine();
    const flag = memoryFlag();
    const first = await seedDemoSubjectsOnFirstRun(engine, DEMO_SUBJECT_SEEDS, flag);
    expect(first.seeded).toEqual([...DEMO_IDS]);
    expect(flag.value).not.toBeNull();

    const second = await seedDemoSubjectsOnFirstRun(engine, DEMO_SUBJECT_SEEDS, flag);
    expect(second.skipped).toBe(true);
    expect(second.seeded).toEqual([]);
  });

  it('does not resurrect a deleted demo subject once the flag is set', async () => {
    const storage = new MemoryEngineStorage();
    const engine = await openEngine(storage);
    const flag = memoryFlag();
    await seedDemoSubjectsOnFirstRun(engine, DEMO_SUBJECT_SEEDS, flag);

    const saved = await storage.load();
    if (!saved) throw new Error('Seed state was not saved');
    delete saved.subjects['demo-sky'];
    await storage.save(saved);

    const reopened = await openEngine(storage);
    expect(reopened.snapshot().subjects['demo-sky']).toBeUndefined();

    const rerun = await seedDemoSubjectsOnFirstRun(reopened, DEMO_SUBJECT_SEEDS, flag);
    expect(rerun.skipped).toBe(true);
    expect(reopened.snapshot().subjects['demo-sky']).toBeUndefined();
  });

  it('reports a partial failure and keeps the subjects that did seed', async () => {
    const inner = new MemoryEngineStorage();
    const storage = createFailingStorage({
      load: () => inner.load(),
      save: (state) => inner.save(state),
      clear: async () => undefined,
    });
    const engine = await openEngine(storage);
    storage.failNextSave(new Error('Simulated seed write failure'));

    const result = await seedDemoSubjects(engine);

    expect(result.failed).toEqual(['demo-rivers']);
    expect(result.seeded).toEqual(['demo-sky', 'demo-kitchen']);
    expect(engine.snapshot().subjects['demo-rivers']).toBeUndefined();
    expect(engine.snapshot().activeStudySessionId).toBeNull();
    expect(portals(engine)).toHaveLength(2);
  });
});
