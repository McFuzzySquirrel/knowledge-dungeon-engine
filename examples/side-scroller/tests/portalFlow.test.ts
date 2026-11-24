import { describe, expect, it } from 'vitest';
import { KnowledgeDungeonEngine, MemoryEngineStorage, tutorial, type EngineState } from '@/index';
import type { BrowserStorage } from '../src/storage';
import { createFailingStorage } from './support/failingStorage';

const FIXED_NOW = '2026-11-23T12:00:00.000Z';

function browserStorage(inner = new MemoryEngineStorage()): BrowserStorage {
  return {
    load: () => inner.load(),
    save: (state) => inner.save(state),
    clear: async () => undefined,
  };
}

function options(storage: BrowserStorage) {
  return {
    storage,
    nowIso: () => FIXED_NOW,
    newRoomId: () => crypto.randomUUID(),
    newStudySessionId: () => crypto.randomUUID(),
  };
}

async function openEngine(storage: BrowserStorage = browserStorage()): Promise<KnowledgeDungeonEngine> {
  return KnowledgeDungeonEngine.open(options(storage));
}

describe('P3 portal entry and return through engine commands', () => {
  it('starts the tutorial from the training gate and ends the study session on return', async () => {
    const engine = await openEngine();
    const fresh = engine.snapshot();
    expect(fresh.session.world).toBe('village');
    expect(fresh.activeSubjectId).toBeNull();
    expect(fresh.activeStudySessionId).toBeNull();

    const entered = await engine.interactVillageStructure('training-gate');
    expect(entered.kind).toBe('structure');
    const inDungeon = engine.snapshot();
    expect(inDungeon.session.world).toBe('dungeon');
    expect(inDungeon.activeSubjectId).toBe(tutorial.TUTORIAL_SUBJECT_ID);
    expect(inDungeon.activeStudySessionId).not.toBeNull();
    expect(inDungeon.subjects[tutorial.TUTORIAL_SUBJECT_ID]).toBeDefined();

    await engine.returnToVillage();
    const returned = engine.snapshot();
    expect(returned.session.world).toBe('village');
    expect(returned.activeSubjectId).toBeNull();
    expect(returned.activeStudySessionId).toBeNull();
  });

  it('enters an existing subject through its engine-provided portal', async () => {
    const engine = await openEngine();
    await engine.interactVillageStructure('training-gate');
    await engine.returnToVillage();

    const portal = engine
      .villageStructures()
      .find((structure) => structure.type === 'portal-icon' && structure.subjectId);
    if (!portal) throw new Error('Tutorial portal was not offered');

    await engine.interactVillageStructure(portal.id);
    const state = engine.snapshot();
    expect(state.session.world).toBe('dungeon');
    expect(state.activeSubjectId).toBe(portal.subjectId);
    expect(state.activeStudySessionId).not.toBeNull();
  });

  it('leaves the player on the street when a portal save fails', async () => {
    const inner = new MemoryEngineStorage();
    const storage = createFailingStorage(browserStorage(inner));
    const engine = await openEngine(storage);
    // Establish a durable village record so the failed save can be compared.
    await engine.returnToVillage();
    const prior: EngineState = engine.snapshot();

    storage.failNextSave(new Error('QuotaExceededError: simulated portal write failure'));
    await expect(engine.interactVillageStructure('training-gate')).rejects.toThrow('QuotaExceededError');

    expect(engine.snapshot()).toEqual(prior);
    expect(engine.snapshot().session.world).toBe('village');
    expect(await inner.load()).toEqual(prior);
  });

  it('keeps the study session open when a return save fails, then retries', async () => {
    const inner = new MemoryEngineStorage();
    const storage = createFailingStorage(browserStorage(inner));
    const engine = await openEngine(storage);
    await engine.startTutorial();
    const prior = engine.snapshot();
    expect(prior.session.world).toBe('dungeon');
    expect(prior.activeStudySessionId).not.toBeNull();

    storage.failNextSave(new Error('QuotaExceededError: simulated return write failure'));
    await expect(engine.returnToVillage()).rejects.toThrow('QuotaExceededError');

    expect(engine.snapshot()).toEqual(prior);
    expect(await inner.load()).toEqual(prior);

    storage.clearFailure();
    await engine.returnToVillage();
    expect(engine.snapshot().session.world).toBe('village');
    expect(engine.snapshot().activeStudySessionId).toBeNull();
  });
});
