import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { KnowledgeDungeonEngine } from '@/index';
import { createIndexedDbStorage } from '../src/storage';
import { notSavedMessage } from '../src/ui/outcomes';
import { createFailingStorage } from './support/failingStorage';

const FIXED_NOW = '2026-11-23T12:00:00.000Z';

const VALID_NOTE = ['Summary', 'A short summary of the room.', '', 'Key Points', 'One key point.', '', 'Recall Question', 'What did the note teach?', ''].join(
  '\n',
);

function options(storage: ReturnType<typeof createFailingStorage>) {
  return {
    storage,
    nowIso: () => FIXED_NOW,
    newRoomId: () => crypto.randomUUID(),
    newStudySessionId: () => crypto.randomUUID(),
  };
}

describe('P2 save-failure harness (E-06)', () => {
  it('a rejected save leaves the engine and the durable record at the prior state', async () => {
    const name = `save-failure-${crypto.randomUUID()}`;
    const inner = createIndexedDbStorage(name);
    const storage = createFailingStorage(inner);
    const engine = await KnowledgeDungeonEngine.open(options(storage));
    await engine.startTutorial();

    const prior = engine.snapshot();
    expect(prior.subjects[prior.activeSubjectId ?? '']?.rooms['tut-note']).toBeDefined();

    const attemptsBefore = storage.saveAttempts;
    storage.failNextSave(new Error('QuotaExceededError: simulated write failure'));

    await expect(
      engine.submitNote({ roomId: 'tut-note', noteText: VALID_NOTE, manualConfirmed: true }),
    ).rejects.toThrow('QuotaExceededError');

    expect(storage.saveAttempts).toBe(attemptsBefore + 1);
    // In memory: the failed commit is not applied.
    expect(engine.snapshot()).toEqual(prior);
    // On disk: the previous record is still what a reload reads.
    expect(await inner.load()).toEqual(prior);

    // A retry after the harness is disarmed commits normally.
    storage.clearFailure();
    const retried = await engine.submitNote({
      roomId: 'tut-note',
      noteText: VALID_NOTE,
      manualConfirmed: true,
    });
    expect(retried.ok).toBe(true);
    expect(engine.snapshot()).not.toEqual(prior);

    inner.close();
  });

  it('renders the "not saved" copy from a rejection', () => {
    const message = notSavedMessage(new Error('QuotaExceededError'));

    expect(message).toContain('QuotaExceededError');
    expect(message).toContain('Not saved');
    expect(message).toContain('Nothing was committed');
  });
});
