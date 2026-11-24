import { describe, expect, it } from 'vitest';
import { createEmptyState, subjects, tutorial, type EngineState } from '@/index';
import {
  catchKeepSummary,
  fishingCollectionCount,
  fishingEntryRefusal,
  resolveFishingSubject,
} from '../src/fishing/session';
import { projectFishing } from '../src/projection';

const NOW = '2026-11-24T10:00:00.000Z';
const TUTORIAL_ID = tutorial.TUTORIAL_SUBJECT_ID;

function emptyProgression(subjectId: string): EngineState['progression'][string] {
  return {
    subjectId,
    xpTotal: 40,
    rank: 'Novice',
    badges: [],
    inventory: [],
    equippedItems: [],
    collectedNotes: [],
    streakCount: 0,
    subjectsMastered: 0,
    roomsCleared: 0,
    reviewPasses: 0,
    artifacts: 0,
    bossesDefeated: 0,
    fishCollection: [],
    extraFields: {},
  };
}

function markCleared(state: EngineState, subjectId: string, roomIds: string[]): void {
  const subject = state.subjects[subjectId];
  if (!subject) throw new Error('Missing subject');
  for (const roomId of roomIds) {
    subject.rooms[roomId] = {
      ...subjects.makeEmptyRoomMetadata({ roomId, topic: `synthetic-${roomId}`, nowIso: NOW }),
      state: 'ArtifactCollected',
      validationState: { ...subjects.makeEmptyValidationState(), finalPass: true },
    };
  }
}

function tutorialState(): EngineState {
  const state = createEmptyState();
  state.subjects[TUTORIAL_ID] = tutorial.createTutorialSubject(NOW);
  state.progression[TUTORIAL_ID] = emptyProgression(TUTORIAL_ID);
  return state;
}

function addSecondSubject(state: EngineState): string {
  const secondId = 'second-subject';
  const second = tutorial.createTutorialSubject(NOW);
  state.subjects[secondId] = {
    ...second,
    dungeon: { ...second.dungeon, dungeonId: secondId, subjectName: 'Second Subject' },
  };
  state.progression[secondId] = emptyProgression(secondId);
  return secondId;
}

describe('P4 pond entry resolution', () => {
  it('prefers the engine active subject when there is one', () => {
    const state = tutorialState();
    state.activeSubjectId = TUTORIAL_ID;
    const view = resolveFishingSubject(state, null);
    expect(view?.subjectId).toBe(TUTORIAL_ID);
    expect(view?.source).toBe('active');
    expect(view?.eligible).toBe(false);
  });

  it('uses the remembered subject after returnToVillage cleared the active one', () => {
    const state = tutorialState();
    markCleared(state, TUTORIAL_ID, ['tut-note']);
    state.activeSubjectId = null;

    const view = resolveFishingSubject(state, TUTORIAL_ID);
    expect(view?.subjectId).toBe(TUTORIAL_ID);
    expect(view?.source).toBe('remembered');
    expect(view?.eligible).toBe(true);
    expect(view?.clearedRoomCount).toBe(1);
    expect(fishingEntryRefusal(view)).toBeNull();
  });

  it('falls back to the subject with the most cleared rooms after a reload', () => {
    const state = tutorialState();
    markCleared(state, TUTORIAL_ID, ['tut-note', 'tut-map']);
    addSecondSubject(state);

    const view = resolveFishingSubject(state, null);
    expect(view?.subjectId).toBe(TUTORIAL_ID);
    expect(view?.source).toBe('most-cleared');
    expect(view?.clearedRoomCount).toBe(2);
  });

  it('refuses with an actionable message when no subject exists or no room is cleared', () => {
    const empty = createEmptyState();
    expect(resolveFishingSubject(empty, null)).toBeNull();
    expect(fishingEntryRefusal(null)).toContain('Enter a dungeon');

    const state = tutorialState();
    state.activeSubjectId = null;
    const view = resolveFishingSubject(state, null);
    expect(view?.eligible).toBe(false);
    expect(fishingEntryRefusal(view)).toContain('Clear a room');
  });
});

describe('P4 fishing projections and copy', () => {
  it('projects the open pond session and the kept-fish count', () => {
    const state = tutorialState();
    state.fishingSession = {
      contextId: 'synthetic-context',
      pondId: 'pond-fish-nw',
      enteredAt: NOW,
      subjectId: TUTORIAL_ID,
      subjectName: 'First Dungeon (Tutorial)',
      roomId: null,
      catalogId: null,
      rarity: null,
    };
    state.progression[TUTORIAL_ID]!.fishCollection = [
      {
        id: 'moss-carp:1',
        name: 'Moss Carp',
        rarity: 'common',
        subjectId: TUTORIAL_ID,
        subjectName: 'First Dungeon (Tutorial)',
        caughtAt: NOW,
      },
    ];

    const view = projectFishing(state);
    expect(view?.subjectId).toBe(TUTORIAL_ID);
    expect(view?.pondId).toBe('pond-fish-nw');
    expect(view?.collection).toEqual([{ name: 'Moss Carp', rarity: 'common' }]);
    expect(fishingCollectionCount(state, TUTORIAL_ID)).toBe(1);
  });

  it('keeps keep/release copy aligned with the engine outcome codes', () => {
    expect(
      catchKeepSummary({ outcome: 'answered-correct', rewarded: true, duplicate: false, xpGained: 12 }),
    ).toBe('Kept. 12 XP gained.');
    expect(
      catchKeepSummary({ outcome: 'answered-correct', rewarded: false, duplicate: true, xpGained: 0 }),
    ).toContain('already awarded');
    expect(
      catchKeepSummary({ outcome: 'answered-incorrect', rewarded: false, duplicate: false, xpGained: 0 }),
    ).toContain('nothing was written');
    expect(
      catchKeepSummary({ outcome: 'kept-without-recall', rewarded: false, duplicate: false, xpGained: 0 }),
    ).toContain('No XP');
    expect(
      catchKeepSummary({ outcome: 'released', rewarded: false, duplicate: false, xpGained: 0 }),
    ).toContain('unchanged');
  });
});
