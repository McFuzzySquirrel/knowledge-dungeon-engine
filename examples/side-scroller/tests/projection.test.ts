import { describe, expect, it } from 'vitest';
import { KnowledgeDungeonEngine, MemoryEngineStorage, type EngineState } from '@/index';
import { projectDungeon, roomBadges } from '../src/projection';

const FIXED_NOW = '2026-11-23T12:00:00.000Z';

async function tutorialState(): Promise<EngineState> {
  const engine = await KnowledgeDungeonEngine.open({
    storage: new MemoryEngineStorage(),
    nowIso: () => FIXED_NOW,
    newRoomId: () => crypto.randomUUID(),
    newStudySessionId: () => crypto.randomUUID(),
  });
  await engine.startTutorial();
  return engine.snapshot();
}

describe('projectDungeon', () => {
  it('returns null when no subject is active', async () => {
    const state = await tutorialState();
    const idle: EngineState = { ...state, activeSubjectId: null };
    expect(projectDungeon(idle)).toBeNull();
  });

  it('projects the three tutorial rooms as open with zero XP', async () => {
    const view = projectDungeon(await tutorialState());
    if (!view) throw new Error('Expected a dungeon view');

    expect(view.subjectName).toBe('First Dungeon (Tutorial)');
    expect(view.totalRooms).toBe(3);
    expect(view.clearedCount).toBe(0);
    expect(view.xp).toBe(0);
    expect(view.rooms.map((room) => room.topic)).toEqual([
      'The Note',
      'Tools of the Trade',
      'The Map & Beyond',
    ]);
    expect(view.rooms.every((room) => room.statusLabel === 'Open' && !room.cleared)).toBe(true);
    expect(view.studySessionOpen).toBe(true);
  });

  it('reports a cleared room without colour and counts it', async () => {
    const state = await tutorialState();
    const subjectId = state.activeSubjectId;
    if (!subjectId) throw new Error('Tutorial subject missing');
    const room = state.subjects[subjectId]?.rooms['tut-note'];
    if (!room) throw new Error('Root room missing');
    room.state = 'ArtifactCollected';
    room.validationState.finalPass = true;

    const view = projectDungeon(state);
    if (!view) throw new Error('Expected a dungeon view');
    const cleared = view.rooms.find((entry) => entry.roomId === 'tut-note');

    expect(cleared?.cleared).toBe(true);
    expect(cleared?.statusLabel).toBe('Cleared');
    expect(view.clearedCount).toBe(1);
    expect(view.rooms.filter((entry) => entry.roomId !== 'tut-note').every((entry) => !entry.cleared)).toBe(
      true,
    );
  });

  it('surfaces the active study session visits and XP from progression', async () => {
    const state = await tutorialState();
    const subjectId = state.activeSubjectId;
    if (!subjectId) throw new Error('Tutorial subject missing');

    const session = state.studySessions.find((entry) => entry.sessionId === state.activeStudySessionId);
    if (!session) throw new Error('Active study session missing');
    state.studySessions = state.studySessions.map((entry) =>
      entry.sessionId === session.sessionId
        ? { ...entry, roomsVisited: ['tut-note', 'tut-tools'] }
        : entry,
    );
    state.progression[subjectId] = { ...state.progression[subjectId], xpTotal: 42 };

    const view = projectDungeon(state);
    if (!view) throw new Error('Expected a dungeon view');

    expect(view.visits).toEqual(['tut-note', 'tut-tools']);
    expect(view.xp).toBe(42);
  });

  it('derives renderer badges from the same room projections', async () => {
    const view = projectDungeon(await tutorialState());
    const badges = roomBadges(view);

    expect(Object.keys(badges).sort()).toEqual(['tut-map', 'tut-note', 'tut-tools']);
    expect(badges['tut-note']).toEqual({ cleared: false, label: 'Open' });
    expect(roomBadges(null)).toEqual({});
  });
});
