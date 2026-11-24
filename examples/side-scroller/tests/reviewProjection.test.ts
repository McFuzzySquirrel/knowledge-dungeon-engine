import { describe, expect, it } from 'vitest';
import { KnowledgeDungeonEngine, MemoryEngineStorage, type EngineState } from '@/index';
import {
  describeDueLabel,
  lastStudiedSubjectId,
  projectReview,
  projectReviewGate,
  projectReviewRoom,
  reviewDueCount,
} from '../src/review/projection';

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

async function openTutorial() {
  const engine = await KnowledgeDungeonEngine.open({
    storage: new MemoryEngineStorage(),
    nowIso: () => FIXED_NOW,
    newRoomId: () => crypto.randomUUID(),
    newStudySessionId: () => crypto.randomUUID(),
  });
  await engine.startTutorial();
  return engine;
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

function activeSubjectId(state: EngineState): string {
  if (!state.activeSubjectId) throw new Error('No active subject');
  return state.activeSubjectId;
}

describe('projectReview (P5-T2)', () => {
  it('returns null when no subject is active', async () => {
    const engine = await openTutorial();
    const idle: EngineState = { ...engine.snapshot(), activeSubjectId: null };
    expect(projectReview(idle, FIXED_NOW)).toBeNull();
    expect(projectReviewGate(idle)).toBeNull();
    expect(projectReviewRoom(idle, 'tut-note', FIXED_NOW)).toBeNull();
  });

  it('returns an empty queue, not null, for a subject with no cleared rooms', async () => {
    const engine = await openTutorial();
    const view = projectReview(engine.snapshot(), FIXED_NOW);
    if (!view) throw new Error('Expected a review view');

    expect(view.subjectName).toBe('First Dungeon (Tutorial)');
    expect(view.candidates).toEqual([]);
    expect(view.reviewableCount).toBe(0);
    expect(view.nextPassNumber).toBe(1);
    expect(view.hasInterrupted).toBe(false);
    expect(view.interruptedRoomId).toBeNull();
    expect(reviewDueCount(view)).toBe(0);
  });

  it('labels a cleared but never-reviewed room without calling it overdue', async () => {
    const engine = await openTutorial();
    await clearRooms(engine, ['tut-note']);
    const view = projectReview(engine.snapshot(), FIXED_NOW);
    const candidate = view?.candidates[0];

    expect(candidate).toEqual({
      roomId: 'tut-note',
      topic: 'The Note',
      nextReviewIso: null,
      overdueDays: 0,
      dueLabel: 'Not yet reviewed',
    });
    expect(reviewDueCount(view ?? null)).toBe(1);
  });

  it('uses the engine due helpers for today, future, and overdue rooms', async () => {
    const engine = await openTutorial();
    await clearRooms(engine, ROOM_IDS);
    const state = engine.snapshot();
    const subjectId = activeSubjectId(state);
    const subject = state.subjects[subjectId];
    if (!subject) throw new Error('Missing subject');

    subject.rooms['tut-note'] = { ...subject.rooms['tut-note']!, sm2NextReviewDate: '2026-11-23T08:00:00.000Z' };
    subject.rooms['tut-tools'] = { ...subject.rooms['tut-tools']!, sm2NextReviewDate: '2026-11-26T12:00:00.000Z' };
    subject.rooms['tut-map'] = { ...subject.rooms['tut-map']!, sm2NextReviewDate: '2026-11-21T12:00:00.000Z' };

    const view = projectReview(state, FIXED_NOW);
    if (!view) throw new Error('Expected a review view');
    const byRoom = new Map(view.candidates.map((candidate) => [candidate.roomId, candidate]));

    expect(byRoom.get('tut-note')?.dueLabel).toBe('Due today');
    expect(byRoom.get('tut-note')?.overdueDays).toBe(0);
    expect(byRoom.get('tut-tools')?.dueLabel).toBe('Due in 3 days');
    expect(byRoom.get('tut-map')?.dueLabel).toBe('Overdue by 2 days');
    expect(byRoom.get('tut-map')?.overdueDays).toBe(2);

    // The queue leads with the overdue room, then due today, then scheduled ahead.
    expect(view.candidates.map((candidate) => candidate.roomId)).toEqual([
      'tut-map',
      'tut-note',
      'tut-tools',
    ]);
    expect(reviewDueCount(view)).toBe(2);
  });

  it('presents the engine due state without inventing a date comparison', () => {
    expect(describeDueLabel({ kind: 'overdue', days: 2 }, '2026-11-21T12:00:00.000Z')).toBe(
      'Overdue by 2 days',
    );
    expect(describeDueLabel({ kind: 'overdue', days: 1 }, '2026-11-22T12:00:00.000Z')).toBe(
      'Overdue by 1 day',
    );
    expect(describeDueLabel({ kind: 'due-today', days: 0 }, FIXED_NOW)).toBe('Due today');
    expect(describeDueLabel({ kind: 'due-in', days: 3 }, '2026-11-26T12:00:00.000Z')).toBe(
      'Due in 3 days',
    );
    expect(describeDueLabel({ kind: 'due-in', days: 0 }, null)).toBe('Not yet reviewed');
  });

  it('excludes a cleared room whose note is empty', async () => {
    const engine = await openTutorial();
    await clearRooms(engine, ['tut-note']);
    const state = engine.snapshot();
    const subjectId = activeSubjectId(state);
    const subject = state.subjects[subjectId];
    if (!subject) throw new Error('Missing subject');
    subject.rooms['tut-note'] = { ...subject.rooms['tut-note']!, noteText: '   ' };

    expect(projectReview(state, FIXED_NOW)?.candidates).toEqual([]);
  });

  it('reads the interrupted marker through the engine helper', async () => {
    const engine = await openTutorial();
    await clearRooms(engine, ROOM_IDS);

    const saved = await engine.dispatchReview({
      type: 'review/session-save',
      payload: { roomId: 'tut-note', qualityRating: 4 },
    });
    expect(saved.ok).toBe(true);

    const view = projectReview(engine.snapshot(), FIXED_NOW);
    expect(view?.hasInterrupted).toBe(true);
    expect(view?.interruptedRoomId).toBe('tut-note');

    const room = projectReviewRoom(engine.snapshot(), 'tut-note', FIXED_NOW);
    expect(room?.resumable).toBe(true);
    expect(room?.existingRating).toBe(4);
    expect(room?.passNumber).toBe(1);
    expect(room?.prompt).toContain('The Note');
    expect(room?.dueLabel).toBe('Not yet reviewed');
  });

  it('reports a self-check prompt and the current pass from engine data', async () => {
    const engine = await openTutorial();
    await clearRooms(engine, ROOM_IDS);
    const room = projectReviewRoom(engine.snapshot(), 'tut-tools', FIXED_NOW);

    expect(room?.topic).toBe('Tools of the Trade');
    expect(room?.subjectName).toBe('First Dungeon (Tutorial)');
    expect(room?.prompt).toContain('Tools of the Trade');
    expect(room?.passNumber).toBe(1);
    expect(room?.existingRating).toBeNull();
    expect(room?.resumable).toBe(false);
  });

  it('gates review on the engine unlock, not on a host ratio', async () => {
    const engine = await openTutorial();
    await clearRooms(engine, ['tut-note']);

    const locked = projectReviewGate(engine.snapshot());
    expect(locked?.allowed).toBe(false);
    expect(locked?.clearedRooms).toBe(1);
    expect(locked?.totalRooms).toBe(3);
    expect(locked?.message).toContain('1 of 3 rooms cleared');
    expect(locked?.message).toContain('Clear every room encounter');

    await clearRooms(engine, ['tut-tools', 'tut-map']);
    const unlocked = projectReviewGate(engine.snapshot());
    expect(unlocked?.allowed).toBe(true);
    expect(unlocked?.message).toContain('Review mode is unlocked');
  });

  it('finds the last-studied subject from engine study sessions after a reload', async () => {
    const engine = await openTutorial();
    const state = engine.snapshot();
    const subjectId = activeSubjectId(state);

    expect(lastStudiedSubjectId(state)).toBe(subjectId);
    expect(lastStudiedSubjectId({ ...state, studySessions: [] })).toBe(subjectId);
    expect(lastStudiedSubjectId({ ...state, activeSubjectId: null, studySessions: [] })).toBeNull();
  });
});
