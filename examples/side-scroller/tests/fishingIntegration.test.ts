import { describe, expect, it } from 'vitest';
import { KnowledgeDungeonEngine, MemoryEngineStorage, tutorial, type EngineState } from '@/index';
import type { BrowserStorage } from '../src/storage';
import { createFailingStorage } from './support/failingStorage';

const FIXED_NOW = '2026-11-24T09:00:00.000Z';
const POND_ID = 'pond-fish-nw';
const VALID_NOTE = [
  'Summary',
  'The note is the unit of study and it records what the learner understood.',
  '',
  'Key Points',
  'A note needs a summary, key points, and one recall question ending with a question mark.',
  '',
  'Recall Question',
  'Why does a note need a recall question?',
  '',
].join('\n');

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

async function clearedTutorial(storage: BrowserStorage = browserStorage()) {
  const engine = await KnowledgeDungeonEngine.open(options(storage));
  await engine.startTutorial();
  const subjectId = engine.snapshot().activeSubjectId;
  if (!subjectId) throw new Error('Tutorial subject missing');
  const result = await engine.submitNote({
    roomId: 'tut-note',
    noteText: VALID_NOTE,
    manualConfirmed: true,
  });
  if (!result.ok || result.value.kind !== 'cleared') {
    throw new Error('The tutorial room did not clear');
  }
  const subjectName = engine.snapshot().subjects[subjectId]!.dungeon.subjectName;
  // The P3 return ends the study session and clears activeSubjectId, which is the
  // surface state a pond is used from.
  await engine.returnToVillage();
  return { engine, subjectId, subjectName };
}

function subject(subjectId: string, subjectName: string) {
  return { subjectId, subjectName, roomId: null };
}

function beginPayload(subjectId: string, subjectName: string) {
  return {
    pondId: POND_ID,
    subjectId,
    subjectName,
    roomId: null,
  };
}

describe('P4 fishing commands through the engine', () => {
  it('opens a pond after returning to the village, keeps with recall, and is idempotent', async () => {
    const { engine, subjectId, subjectName } = await clearedTutorial();
    const before = engine.snapshot().progression[subjectId]!;

    const begin = await engine.dispatchFishing({
      type: 'fishing/session-begin',
      payload: beginPayload(subjectId, subjectName),
    });
    expect(begin.ok).toBe(true);
    if (!begin.ok || begin.value.command !== 'fishing/session-begin') {
      throw new Error('Expected a session-begin outcome');
    }
    expect(begin.value.eligible).toBe(true);
    expect(begin.value.clearedRoomCount).toBeGreaterThan(0);

    const opened = engine.snapshot();
    expect(opened.session.world).toBe('fishing');
    expect(opened.fishingSession?.subjectId).toBe(subjectId);
    expect(opened.fishingSession?.pondId).toBe(POND_ID);

    const bite = await engine.dispatchFishing({
      type: 'fishing/bite-resolve',
      payload: {
        subject: subject(subjectId, subjectName),
        castNumber: 1,
        resolution: 'hooked',
        catalogId: 'moss-carp',
      },
    });
    expect(bite.ok).toBe(true);
    if (!bite.ok || bite.value.command !== 'fishing/bite-resolve') {
      throw new Error('Expected a bite-resolve outcome');
    }
    const caught = bite.value.catch;
    expect(caught?.catalogEntry.id).toBe('moss-carp');
    expect(caught?.recall).not.toBeNull();
    const recallRoomId = caught!.recall!.roomId;

    const keep = await engine.dispatchFishing({
      type: 'fishing/catch-keep',
      payload: {
        subject: subject(subjectId, subjectName),
        castNumber: 1,
        catalogId: 'moss-carp',
        recall: { kind: 'answered-correct', roomId: recallRoomId },
      },
    });
    expect(keep.ok).toBe(true);
    if (!keep.ok || keep.value.command !== 'fishing/catch-keep') {
      throw new Error('Expected a catch-keep outcome');
    }
    expect(keep.value.outcome).toBe('answered-correct');
    expect(keep.value.progression?.awarded).toBe(true);
    expect(keep.value.progression?.xpGained ?? 0).toBeGreaterThan(0);

    const afterKeep = engine.snapshot();
    expect(afterKeep.progression[subjectId]!.fishCollection).toHaveLength(
      before.fishCollection.length + 1,
    );
    expect(afterKeep.progression[subjectId]!.xpTotal).toBeGreaterThan(before.xpTotal);

    // The same catch identity may not award twice.
    const duplicate = await engine.dispatchFishing({
      type: 'fishing/catch-keep',
      payload: {
        subject: subject(subjectId, subjectName),
        castNumber: 1,
        catalogId: 'moss-carp',
        recall: { kind: 'answered-correct', roomId: recallRoomId },
      },
    });
    expect(duplicate.ok).toBe(true);
    if (!duplicate.ok || duplicate.value.command !== 'fishing/catch-keep') {
      throw new Error('Expected a catch-keep outcome');
    }
    expect(duplicate.value.progression?.awarded).toBe(false);
    expect(duplicate.value.progression?.duplicate).toBe(true);
    expect(engine.snapshot().progression[subjectId]!.fishCollection).toHaveLength(
      afterKeep.progression[subjectId]!.fishCollection.length,
    );

    // Release mutates nothing at all.
    const beforeRelease: EngineState = engine.snapshot();
    const release = await engine.dispatchFishing({
      type: 'fishing/catch-release',
      payload: {
        subject: subject(subjectId, subjectName),
        castNumber: 2,
        catalogId: 'sun-skip',
      },
    });
    expect(release.ok).toBe(true);
    if (!release.ok || release.value.command !== 'fishing/catch-release') {
      throw new Error('Expected a catch-release outcome');
    }
    expect(release.value.progression).toBeNull();
    expect(engine.snapshot().progression).toEqual(beforeRelease.progression);
  });

  it('restores the kept fish and XP through a second engine over the same storage', async () => {
    const storage = new MemoryEngineStorage();
    const { engine, subjectId, subjectName } = await clearedTutorial(browserStorage(storage));

    await engine.dispatchFishing({
      type: 'fishing/session-begin',
      payload: beginPayload(subjectId, subjectName),
    });
    const bite = await engine.dispatchFishing({
      type: 'fishing/bite-resolve',
      payload: {
        subject: subject(subjectId, subjectName),
        castNumber: 1,
        resolution: 'hooked',
        catalogId: 'lunar-trout',
      },
    });
    if (!bite.ok || bite.value.command !== 'fishing/bite-resolve' || !bite.value.catch?.recall) {
      throw new Error('Expected a recall question');
    }
    const kept = await engine.dispatchFishing({
      type: 'fishing/catch-keep',
      payload: {
        subject: subject(subjectId, subjectName),
        castNumber: 1,
        catalogId: 'lunar-trout',
        recall: { kind: 'answered-correct', roomId: bite.value.catch.recall.roomId },
      },
    });
    expect(kept.ok).toBe(true);
    const beforeReload = engine.snapshot();

    const reloaded = await KnowledgeDungeonEngine.open(options(browserStorage(storage)));
    const after = reloaded.snapshot();
    expect(after.progression[subjectId]!.fishCollection).toHaveLength(1);
    expect(after.progression[subjectId]!.fishCollection[0]!.name).toBe('Lunar Trout');
    expect(after.progression[subjectId]!.xpTotal).toBe(beforeReload.progression[subjectId]!.xpTotal);
  });

  it('refuses a pond with no cleared rooms and writes no fishing session', async () => {
    const engine = await KnowledgeDungeonEngine.open(options(browserStorage()));
    await engine.startTutorial();
    const subjectId = engine.snapshot().activeSubjectId!;
    const subjectName = engine.snapshot().subjects[subjectId]!.dungeon.subjectName;

    const begin = await engine.dispatchFishing({
      type: 'fishing/session-begin',
      payload: beginPayload(subjectId, subjectName),
    });
    expect(begin.ok).toBe(true);
    if (!begin.ok || begin.value.command !== 'fishing/session-begin') {
      throw new Error('Expected a session-begin outcome');
    }
    expect(begin.value.eligible).toBe(false);
    expect(begin.value.clearedRoomCount).toBe(0);
    expect(engine.snapshot().session.world).toBe('dungeon');
  });

  it('keeps typed refusals separate from rejected promises', async () => {
    const engine = await KnowledgeDungeonEngine.open(options(browserStorage()));
    await engine.startTutorial();
    const subjectId = engine.snapshot().activeSubjectId!;

    // No open session: a typed refusal, not a throw.
    const refused = await engine.dispatchFishing({
      type: 'fishing/bite-resolve',
      payload: {
        subject: subject(subjectId, engine.snapshot().subjects[subjectId]!.dungeon.subjectName),
        castNumber: 1,
        resolution: 'missed',
      },
    });
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error('Expected a refusal');
    expect(refused.error.code).toBe('NO_OPEN_SESSION');

    // A subject that does not exist is a rejected promise from the facade.
    await expect(
      engine.dispatchFishing({
        type: 'fishing/session-begin',
        payload: beginPayload('missing-subject', 'Missing Subject'),
      }),
    ).rejects.toThrow('does not exist');
  });

  it('leaves the collection unchanged when the catch-keep save is rejected', async () => {
    const inner = new MemoryEngineStorage();
    const storage = createFailingStorage(browserStorage(inner));
    const { engine, subjectId, subjectName } = await clearedTutorial(storage);

    await engine.dispatchFishing({
      type: 'fishing/session-begin',
      payload: beginPayload(subjectId, subjectName),
    });
    const bite = await engine.dispatchFishing({
      type: 'fishing/bite-resolve',
      payload: {
        subject: subject(subjectId, subjectName),
        castNumber: 1,
        resolution: 'hooked',
        catalogId: 'moss-carp',
      },
    });
    if (!bite.ok || bite.value.command !== 'fishing/bite-resolve' || !bite.value.catch?.recall) {
      throw new Error('Expected a recall question');
    }

    const before = engine.snapshot();
    storage.failNextSave(new Error('QuotaExceededError: simulated catch write failure'));
    await expect(
      engine.dispatchFishing({
        type: 'fishing/catch-keep',
        payload: {
          subject: subject(subjectId, subjectName),
          castNumber: 1,
          catalogId: 'moss-carp',
          recall: { kind: 'answered-correct', roomId: bite.value.catch.recall.roomId },
        },
      }),
    ).rejects.toThrow('QuotaExceededError');

    expect(engine.snapshot()).toEqual(before);
    expect(engine.snapshot().progression[subjectId]!.fishCollection).toHaveLength(0);
    expect(await inner.load()).toEqual(before);
  });
});

describe('P4 tutorial fixture', () => {
  it('has the tutorial subject id the integration test clears', () => {
    expect(tutorial.TUTORIAL_SUBJECT_ID.length).toBeGreaterThan(0);
  });
});
