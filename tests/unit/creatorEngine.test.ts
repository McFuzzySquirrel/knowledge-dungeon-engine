import { describe, expect, it } from 'vitest';
import { CreatorEngine } from '../../src/creatorEngine';
import { MemoryEngineStorage } from '../../src/storage';
import { countEventsOfKind, readStatisticsEventLedgerFromFields, totalXpAwarded } from '../../src/core/statistics/statisticsEvents';

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

  it('saves drafts, awards a clear once, collects its artifact and reviews it', async () => {
    const storage = new MemoryEngineStorage();
    const options = { storage, nowIso: () => nowIso, newRoomId: () => 'new-room' };
    const engine = await CreatorEngine.open(options);
    await engine.createSubject({
      dungeonId: 'subject-1', subjectName: 'Math', rootRoomId: 'root', rootTopic: 'Math', nowIso,
    });
    const draft = await engine.submitNote({ roomId: 'root', noteText: 'Summary', manualConfirmed: false });
    expect(draft.ok && draft.value.kind).toBe('draft');
    expect(engine.snapshot().progression['subject-1'].xpTotal).toBe(0);
    const noteText = 'Summary\nMath is useful.\nKey Points\n- Math is useful.\nRecall Question\nWhy?';
    const clear = await engine.submitNote({ roomId: 'root', noteText, manualConfirmed: true });
    expect(clear.ok && clear.value.kind).toBe('cleared');
    const xp = engine.snapshot().progression['subject-1'].xpTotal;
    expect(xp).toBeGreaterThan(0);
    await engine.submitNote({ roomId: 'root', noteText, manualConfirmed: true });
    expect(engine.snapshot().progression['subject-1'].xpTotal).toBe(xp);
    await engine.collectArtifact('root');
    await engine.collectArtifact('root');
    expect(engine.snapshot().progression['subject-1'].artifacts).toBe(1);
    const result = await engine.dispatchReview({
      type: 'review/pass-complete', payload: { roomId: 'root', qualityRating: 5 },
    });
    expect(result.ok).toBe(true);
    const restored = await CreatorEngine.open(options);
    expect(restored.snapshot().subjects['subject-1'].rooms.root.reviewPassCount).toBe(1);
    expect(restored.snapshot().progression['subject-1'].xpTotal).toBe(xp + 6);
    const ledger = readStatisticsEventLedgerFromFields(restored.snapshot().progression['subject-1'].extraFields);
    expect(countEventsOfKind(ledger, 'note-submission')).toBe(1);
    expect(countEventsOfKind(ledger, 'review-completion')).toBe(1);
    expect(totalXpAwarded(ledger)).toBe(xp + 6);
  });

  it('keeps fishing rewards once across reload and refuses mismatched subjects', async () => {
    const storage = new MemoryEngineStorage();
    const options = { storage, nowIso: () => nowIso, newRoomId: () => 'room',
      newSessionId: () => 'session-1' };
    const engine = await CreatorEngine.open(options);
    await engine.createSubject({
      dungeonId: 'subject-1', subjectName: 'Math', rootRoomId: 'root', rootTopic: 'Math', nowIso,
    });
    await engine.submitNote({ roomId: 'root',
      noteText: 'Summary\nMath is useful.\nKey Points\n- Math is useful.\nRecall Question\nWhy?', manualConfirmed: true });
    const subject = { subjectId: 'subject-1', subjectName: 'Math' };
    await engine.dispatchFishing({
      type: 'fishing/session-begin', payload: { pondId: 'pond', ...subject },
    });
    const keep = {
      type: 'fishing/catch-keep' as const,
      payload: { subject, castNumber: 1, catalogId: 'moss-carp',
        recall: { kind: 'kept-without-recall' as const } },
    };
    const result = await engine.dispatchFishing(keep);
    expect(result.ok && result.value.command === 'fishing/catch-keep' && result.value.progression?.awarded).toBe(true);
    const restored = await CreatorEngine.open(options);
    const repeat = await restored.dispatchFishing(keep);
    expect(repeat.ok && repeat.value.command === 'fishing/catch-keep' && repeat.value.progression?.duplicate).toBe(true);
    expect(restored.snapshot().progression['subject-1'].fishCollection).toHaveLength(1);
    const mismatch = await restored.dispatchFishing({
      type: 'fishing/catch-release',
      payload: { subject: { subjectId: 'other', subjectName: 'Other' }, castNumber: 2, catalogId: 'moss-carp' },
    });
    expect(mismatch.ok).toBe(false);
  });

  it('stores attachment bytes atomically and removes them with their room', async () => {
    const storage = new MemoryEngineStorage();
    const options = { storage, nowIso: () => nowIso, newRoomId: () => 'child',
      newAttachmentId: () => 'attachment-1' };
    const engine = await CreatorEngine.open(options);
    await engine.createSubject({
      dungeonId: 'subject-1', subjectName: 'Math', rootRoomId: 'root', rootTopic: 'Math', nowIso,
    });
    await engine.dispatchGraph({ type: 'graph/children-add', payload: { parentRoomId: 'root', topics: ['Child'] } });
    const added = await engine.dispatchEncounter({
      type: 'encounter/attachment-add', payload: { roomId: 'child', file: new Blob(['image']) },
    });
    expect(added.ok).toBe(true);
    const restored = await CreatorEngine.open(options);
    expect(new TextDecoder().decode(restored.snapshot().attachmentBytes['attachment-1'])).toBe('image');
    await restored.dispatchGraph({ type: 'graph/room-remove', payload: { roomId: 'child' } });
    expect(restored.snapshot().attachmentBytes['attachment-1']).toBeUndefined();
  });

  it('starts the tutorial and emits isolated state snapshots after persistence', async () => {
    const storage = new MemoryEngineStorage();
    const engine = await CreatorEngine.open({ storage, nowIso: () => nowIso, newRoomId: () => 'new-room' });
    const observed: string[] = [];
    const unsubscribe = engine.subscribe((state) => {
      observed.push(state.session.questStep);
      state.session.questStep = 'intro';
    });
    const tutorial = await engine.startTutorial();
    expect(tutorial.dungeon.rooms).toHaveLength(3);
    expect(observed).toEqual(['enter-dungeon']);
    expect((await storage.load())?.session.questStep).toBe('enter-dungeon');
    expect(engine.snapshot().session.questStep).toBe('enter-dungeon');
    unsubscribe();
  });

  it('equips and unequips earned gear without losing inventory', async () => {
    const engine = await CreatorEngine.open({ storage: new MemoryEngineStorage(), nowIso: () => nowIso,
      newRoomId: () => 'new-room', random: () => 0.1 });
    await engine.createSubject({
      dungeonId: 'subject-1', subjectName: 'Vector Spaces', rootRoomId: 'root', rootTopic: 'Vector Spaces', nowIso,
    });
    const noteText = `Summary\n${'Vector spaces are sets equipped with addition and scalar multiplication. '.repeat(8)}
Key Points\n- A vector space requires closure under addition.\n- A vector space requires closure under scalar multiplication.
Recall Question\nWhat are the four axioms of vector spaces? See [related topic](#).`;
    const cleared = await engine.submitNote({ roomId: 'root', noteText, manualConfirmed: true });
    if (!cleared.ok || cleared.value.kind !== 'cleared' || !cleared.value.progression.loot) {
      throw new Error('Expected equippable loot');
    }
    const lootId = cleared.value.progression.loot.id;
    expect(await engine.equipItem(lootId)).toBe(true);
    expect(engine.snapshot().progression['subject-1'].equippedItems).toHaveLength(1);
    expect(await engine.unequipItem(lootId)).toBe(true);
    expect(engine.snapshot().progression['subject-1'].equippedItems).toHaveLength(0);
    expect(engine.snapshot().progression['subject-1'].inventory).toHaveLength(1);
  });

  it('routes village portals and training into dungeon sessions', async () => {
    const engine = await CreatorEngine.open({ storage: new MemoryEngineStorage(), nowIso: () => nowIso,
      newRoomId: () => 'new-room' });
    await engine.createSubject({
      dungeonId: 'subject-1', subjectName: 'Math', rootRoomId: 'root', rootTopic: 'Math', nowIso,
    });
    expect(engine.villageStructures().some((structure) => structure.id === 'portal-subject-1')).toBe(true);
    await engine.interactVillageStructure('portal-subject-1');
    expect(engine.snapshot().session.world).toBe('dungeon');
    expect(engine.snapshot().session.playerClass).toBe('scholar');
    await engine.returnToVillage();
    await engine.interactVillageStructure('training-gate');
    expect(engine.snapshot().activeSubjectId).toBe('tutorial-first-walkthrough');
    expect(engine.snapshot().session.questStep).toBe('enter-dungeon');
  });

  it('does not partially commit a note and reward when persistence fails', async () => {
    const memory = new MemoryEngineStorage();
    let fail = false;
    const storage = {
      load: () => memory.load(),
      save: async (state: Parameters<typeof memory.save>[0]) => {
        if (fail) throw new Error('disk failed');
        await memory.save(state);
      },
    };
    const engine = await CreatorEngine.open({ storage, nowIso: () => nowIso, newRoomId: () => 'child' });
    await engine.createSubject({
      dungeonId: 'subject-1', subjectName: 'Math', rootRoomId: 'root', rootTopic: 'Math', nowIso,
    });
    const before = engine.snapshot();
    fail = true;
    await expect(engine.submitNote({ roomId: 'root', manualConfirmed: true,
      noteText: 'Summary\nMath\nKey Points\n- Math\nRecall Question\nWhy?' })).rejects.toThrow('disk failed');
    expect(engine.snapshot()).toEqual(before);
    expect(await memory.load()).toEqual(before);
  });

  it('records study sessions atomically, counts unique visits and closes on return', async () => {
    const storage = new MemoryEngineStorage();
    let sessionId = 0;
    let now = nowIso;
    const options = { storage, nowIso: () => now, newRoomId: () => 'child',
      newStudySessionId: () => `study-${++sessionId}` };
    const engine = await CreatorEngine.open(options);
    await engine.createSubject({
      dungeonId: 'subject-1', subjectName: 'Math', rootRoomId: 'root', rootTopic: 'Math', nowIso,
    });
    await engine.activateSubject('subject-1');
    await engine.recordRoomVisit('root');
    await engine.recordRoomVisit('root');
    const noteText = 'Summary\nMath is useful.\nKey Points\n- Math is useful.\nRecall Question\nWhy?';
    await engine.submitNote({ roomId: 'root', noteText, manualConfirmed: true });
    await engine.submitNote({ roomId: 'root', noteText, manualConfirmed: true });
    await engine.dispatchReview({ type: 'review/pass-complete', payload: { roomId: 'root', qualityRating: 5 } });
    const progress = engine.snapshot().progression['subject-1'];
    const session = engine.snapshot().studySessions[0];
    expect(engine.snapshot().studySessions).toHaveLength(1);
    expect(session).toMatchObject({ roomsVisited: ['root'], notesSubmitted: 1, reviewsCompleted: 1,
      xpEarned: progress.xpTotal, endedAt: null });
    now = '2026-01-01T01:00:00.000Z';
    await engine.returnToVillage();
    const reopened = await CreatorEngine.open(options);
    expect(reopened.snapshot().activeStudySessionId).toBeNull();
    expect(reopened.snapshot().studySessions[0].endedAt).toBe(now);
    await reopened.activateSubject('subject-1');
    expect(reopened.snapshot().studySessions).toHaveLength(2);
  });

  it('recovers interrupted sessions at their last activity instead of the current time', async () => {
    let now = nowIso;
    const storage = new MemoryEngineStorage();
    const options = { storage, nowIso: () => now, newRoomId: () => 'child' };
    const engine = await CreatorEngine.open(options);
    await engine.createSubject({
      dungeonId: 'subject-1', subjectName: 'Math', rootRoomId: 'root', rootTopic: 'Math', nowIso,
    });
    now = '2026-01-01T00:10:00.000Z';
    await engine.recordRoomVisit('root');
    now = '2026-01-03T00:00:00.000Z';
    const reopened = await CreatorEngine.open(options);
    await reopened.endStudySession(true);
    expect(reopened.snapshot().studySessions[0].endedAt).toBe('2026-01-01T00:10:00.000Z');
  });
});
