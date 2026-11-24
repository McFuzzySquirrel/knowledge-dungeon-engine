import { describe, expect, it } from 'vitest';
import {
  KnowledgeDungeonEngine,
  MemoryEngineStorage,
  type EngineState,
  type EngineStorage,
} from '@/index';
import type { ReviewCommand } from '@/index';

const FIXED_NOW = '2026-11-23T12:00:00.000Z';

const VALID_NOTE = [
  'Summary',
  'The note is the unit of study in this dungeon and it records what the learner understood.',
  '',
  'Key Points',
  'A note needs a summary, key points, and one recall question ending with a question mark.',
  '',
  'Recall Question',
  'Why does a note need a recall question?',
  '',
].join('\n');

const ROOM_IDS = ['tut-note', 'tut-tools', 'tut-map'] as const;

function openEngine(storage: EngineStorage = new MemoryEngineStorage()) {
  return KnowledgeDungeonEngine.open({
    storage,
    nowIso: () => FIXED_NOW,
    newRoomId: () => crypto.randomUUID(),
    newStudySessionId: () => crypto.randomUUID(),
  });
}

async function clearRooms(engine: KnowledgeDungeonEngine, roomIds: readonly string[]) {
  for (const roomId of roomIds) {
    const result = await engine.submitNote({
      roomId,
      noteText: VALID_NOTE,
      manualConfirmed: true,
    });
    if (!result.ok || result.value.kind !== 'cleared') {
      throw new Error(`Room ${roomId} did not clear`);
    }
  }
}

async function reviewedEngine(storage: EngineStorage = new MemoryEngineStorage()) {
  const engine = await openEngine(storage);
  await engine.startTutorial();
  await clearRooms(engine, ROOM_IDS);
  return engine;
}

function activeSubjectId(state: EngineState): string {
  if (!state.activeSubjectId) throw new Error('No active subject');
  return state.activeSubjectId;
}

describe('review commands through the engine (P5-T5)', () => {
  it('awards one pass, records one SM-2 update, and suppresses the duplicate', async () => {
    const engine = await reviewedEngine();
    const subjectId = activeSubjectId(engine.snapshot());
    const before = engine.snapshot();

    const first = await engine.dispatchReview({
      type: 'review/pass-complete',
      payload: { roomId: 'tut-note', qualityRating: 5 },
    });
    expect(first.ok).toBe(true);
    if (!first.ok || first.value.command !== 'review/pass-complete') {
      throw new Error('Expected a pass-complete outcome');
    }

    expect(first.value.progression.awarded).toBe(true);
    expect(first.value.progression.duplicate).toBe(false);
    expect(first.value.progression.xpGained).toBeGreaterThan(0);
    expect(first.value.passProgress.nextPassTarget).toBe(1);
    expect(first.value.resumedSessionDiscarded).toBe(false);

    const after = engine.snapshot();
    const room = after.subjects[subjectId]?.rooms['tut-note'];
    expect(room?.reviewPassCount).toBe(1);
    expect(room?.sm2NextReviewDate).toBeTruthy();
    expect(room?.sm2QualityResponse).toBe(5);
    expect(after.progression[subjectId]?.xpTotal).toBe(
      (before.progression[subjectId]?.xpTotal ?? 0) + first.value.progression.xpGained,
    );
    expect(after.progression[subjectId]?.reviewPasses).toBe(1);

    const nextReviewDate = room?.sm2NextReviewDate;

    // Same (room, pass) again: the durable ledger suppresses the reward.
    const second = await engine.dispatchReview({
      type: 'review/pass-complete',
      payload: { roomId: 'tut-note', qualityRating: 2 },
    });
    expect(second.ok).toBe(true);
    if (!second.ok || second.value.command !== 'review/pass-complete') {
      throw new Error('Expected a pass-complete outcome');
    }
    expect(second.value.progression.awarded).toBe(false);
    expect(second.value.progression.duplicate).toBe(true);
    expect(second.value.progression.xpGained).toBe(0);

    const unchanged = engine.snapshot();
    expect(unchanged.subjects[subjectId]?.rooms['tut-note']?.reviewPassCount).toBe(1);
    expect(unchanged.subjects[subjectId]?.rooms['tut-note']?.sm2NextReviewDate).toBe(nextReviewDate);
    expect(unchanged.subjects[subjectId]?.rooms['tut-note']?.sm2QualityResponse).toBe(5);
    expect(unchanged.progression[subjectId]?.xpTotal).toBe(after.progression[subjectId]?.xpTotal);
    expect(unchanged.progression[subjectId]?.reviewPasses).toBe(1);
  });

  it('refuses an uncleared room and an inactive subject without writing', async () => {
    const engine = await openEngine();
    await engine.startTutorial();
    const prior = engine.snapshot();

    const notCleared = await engine.dispatchReview({
      type: 'review/pass-complete',
      payload: { roomId: 'tut-note', qualityRating: 5 },
    });
    expect(notCleared.ok).toBe(false);
    if (notCleared.ok) throw new Error('Expected a refusal');
    expect(notCleared.error.code).toBe('ROOM_NOT_REVIEWABLE');
    expect(engine.snapshot()).toEqual(prior);

    await engine.returnToVillage();
    const inactive = await engine.dispatchReview({
      type: 'review/pass-complete',
      payload: { roomId: 'tut-note', qualityRating: 5 },
    });
    expect(inactive.ok).toBe(false);
    if (inactive.ok) throw new Error('Expected a refusal');
    expect(inactive.error.code).toBe('NO_ACTIVE_SUBJECT');
  });

  it('save, resume, and discard round-trip across a second engine instance', async () => {
    const storage = new MemoryEngineStorage();
    const engine = await reviewedEngine(storage);
    const subjectId = activeSubjectId(engine.snapshot());

    const saved = await engine.dispatchReview({
      type: 'review/session-save',
      payload: { roomId: 'tut-note', qualityRating: 4 },
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok || saved.value.command !== 'review/session-save') {
      throw new Error('Expected a session-save outcome');
    }
    expect(saved.value.session.savedAt).toBe(FIXED_NOW);
    expect(saved.value.session.qualityRating).toBe(4);
    expect(saved.value.progression).toBeNull();
    expect(engine.snapshot().subjects[subjectId]?.rooms['tut-note']?.reviewPassCount).toBe(0);

    // Reload: the marker is durable and nothing auto-completes.
    const reopened = await openEngine(storage);
    const beforeResume = reopened.snapshot();
    expect(beforeResume.subjects[subjectId]?.rooms['tut-note']?.reviewPassCount).toBe(0);

    const resume = await reopened.dispatchReview({
      type: 'review/session-resume',
      payload: { roomId: 'tut-note' },
    });
    expect(resume.ok).toBe(true);
    if (!resume.ok || resume.value.command !== 'review/session-resume') {
      throw new Error('Expected a session-resume outcome');
    }
    expect(resume.value.resumed).toBe(true);
    expect(resume.value.session?.qualityRating).toBe(4);
    expect(resume.value.session?.passNumber).toBe(1);
    expect(resume.value.waitingForRoomId).toBeNull();
    // Resume is read-only: the state is byte-identical.
    expect(reopened.snapshot()).toEqual(beforeResume);

    const discarded = await reopened.dispatchReview({
      type: 'review/session-discard',
      payload: { roomId: 'tut-note' },
    });
    expect(discarded.ok).toBe(true);
    if (!discarded.ok || discarded.value.command !== 'review/session-discard') {
      throw new Error('Expected a session-discard outcome');
    }
    expect(discarded.value.discarded).toBe(true);
    expect(discarded.value.keptForOtherRoom).toBeNull();

    const resumeAgain = await reopened.dispatchReview({
      type: 'review/session-resume',
      payload: { roomId: 'tut-note' },
    });
    expect(resumeAgain.ok).toBe(true);
    if (!resumeAgain.ok || resumeAgain.value.command !== 'review/session-resume') {
      throw new Error('Expected a session-resume outcome');
    }
    expect(resumeAgain.value.resumed).toBe(false);
    expect(reopened.snapshot().subjects[subjectId]?.rooms['tut-note']?.reviewPassCount).toBe(0);
  });

  it('a discard for another room leaves the saved marker alone', async () => {
    const engine = await reviewedEngine();
    await engine.dispatchReview({
      type: 'review/session-save',
      payload: { roomId: 'tut-note', qualityRating: null },
    });

    const discarded = await engine.dispatchReview({
      type: 'review/session-discard',
      payload: { roomId: 'tut-tools' },
    });
    expect(discarded.ok).toBe(true);
    if (!discarded.ok || discarded.value.command !== 'review/session-discard') {
      throw new Error('Expected a session-discard outcome');
    }
    expect(discarded.value.discarded).toBe(false);
    expect(discarded.value.keptForOtherRoom?.roomId).toBe('tut-note');

    const resume = await engine.dispatchReview({
      type: 'review/session-resume',
      payload: { roomId: 'tut-note' },
    });
    if (!resume.ok || resume.value.command !== 'review/session-resume') {
      throw new Error('Expected a session-resume outcome');
    }
    expect(resume.value.resumed).toBe(true);
    expect(resume.value.session?.qualityRating).toBeNull();
  });
});

describe('review save failure (E-13, P5-T6)', () => {
  it('a rejected pass-complete leaves state and progression unchanged', async () => {
    const inner = new MemoryEngineStorage();
    let failNext = false;
    const storage: EngineStorage = {
      load: () => inner.load(),
      async save(state: EngineState) {
        if (failNext) {
          failNext = false;
          throw new Error('QuotaExceededError: simulated write failure');
        }
        await inner.save(state);
      },
    };

    const engine = await reviewedEngine(storage);
    const prior = engine.snapshot();

    failNext = true;
    await expect(
      engine.dispatchReview({
        type: 'review/pass-complete',
        payload: { roomId: 'tut-note', qualityRating: 5 },
      } satisfies ReviewCommand),
    ).rejects.toThrow('QuotaExceededError');

    const subjectId = activeSubjectId(prior);
    expect(engine.snapshot()).toEqual(prior);
    expect(engine.snapshot().subjects[subjectId]?.rooms['tut-note']?.reviewPassCount).toBe(0);
    expect(await inner.load()).toEqual(prior);

    // The panel stays open in the DOM; a retry after the harness is disarmed commits.
    const retried = await engine.dispatchReview({
      type: 'review/pass-complete',
      payload: { roomId: 'tut-note', qualityRating: 5 },
    });
    expect(retried.ok).toBe(true);
    expect(engine.snapshot()).not.toEqual(prior);
    expect(engine.snapshot().subjects[subjectId]?.rooms['tut-note']?.reviewPassCount).toBe(1);
  });

  it('a rejected session-save leaves no marker and no reward', async () => {
    const inner = new MemoryEngineStorage();
    let failNext = false;
    const storage: EngineStorage = {
      load: () => inner.load(),
      async save(state: EngineState) {
        if (failNext) {
          failNext = false;
          throw new Error('QuotaExceededError: simulated write failure');
        }
        await inner.save(state);
      },
    };

    const engine = await reviewedEngine(storage);
    const prior = engine.snapshot();

    failNext = true;
    await expect(
      engine.dispatchReview({
        type: 'review/session-save',
        payload: { roomId: 'tut-note', qualityRating: 3 },
      }),
    ).rejects.toThrow('QuotaExceededError');

    expect(engine.snapshot()).toEqual(prior);
    const resume = await engine.dispatchReview({
      type: 'review/session-resume',
      payload: { roomId: 'tut-note' },
    });
    if (!resume.ok || resume.value.command !== 'review/session-resume') {
      throw new Error('Expected a session-resume outcome');
    }
    expect(resume.value.resumed).toBe(false);
  });
});
