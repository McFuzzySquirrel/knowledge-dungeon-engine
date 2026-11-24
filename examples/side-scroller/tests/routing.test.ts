import { describe, expect, it } from 'vitest';
import { createEmptyState, tutorial, type EngineState } from '@/index';
import { projectRoute } from '../src/routing';

const FIXED_NOW = '2026-11-23T12:00:00.000Z';
const TUTORIAL_ID = tutorial.TUTORIAL_SUBJECT_ID;

function stateWithTutorial(): EngineState {
  const state = createEmptyState();
  state.subjects[TUTORIAL_ID] = tutorial.createTutorialSubject(FIXED_NOW);
  state.activeSubjectId = TUTORIAL_ID;
  state.session = { phase: 'scribe', playerClass: 'scholar', questStep: 'enter-dungeon', world: 'dungeon' };
  return state;
}

describe('projectRoute', () => {
  it('routes a village world to the surface even with no active subject', () => {
    const state = createEmptyState();
    expect(projectRoute(state)).toEqual({
      screen: 'surface',
      subjectId: null,
      subjectName: null,
      notice: null,
    });
  });

  it('does not infer the village screen from activeSubjectId alone', () => {
    const state = stateWithTutorial();
    state.session = { ...state.session, world: 'village' };

    expect(projectRoute(state).screen).toBe('surface');
    expect(projectRoute(state).subjectId).toBeNull();
  });

  it('routes a dungeon world to the active subject', () => {
    const view = projectRoute(stateWithTutorial());

    expect(view.screen).toBe('dungeon');
    expect(view.subjectId).toBe(TUTORIAL_ID);
    expect(view.subjectName).toBe('First Dungeon (Tutorial)');
    expect(view.notice).toBeNull();
  });

  it('falls back to the surface when the dungeon world has no active subject', () => {
    const state = stateWithTutorial();
    state.activeSubjectId = null;

    const view = projectRoute(state);
    expect(view.screen).toBe('surface');
    expect(view.notice).toContain('no active subject');
  });

  it('falls back to the surface when the active subject is missing', () => {
    const state = stateWithTutorial();
    state.activeSubjectId = 'missing-subject';

    const view = projectRoute(state);
    expect(view.screen).toBe('surface');
    expect(view.notice).toContain('no active subject');
  });

  it('routes a fishing world through its pond session, not activeSubjectId', () => {
    const state = stateWithTutorial();
    state.session = { ...state.session, world: 'fishing' };
    state.activeSubjectId = null;
    state.fishingSession = {
      contextId: 'synthetic-context',
      pondId: 'pond-fish-nw',
      enteredAt: FIXED_NOW,
      subjectId: TUTORIAL_ID,
      subjectName: 'First Dungeon (Tutorial)',
      roomId: null,
      catalogId: null,
      rarity: null,
    };

    const view = projectRoute(state);
    expect(view.screen).toBe('fishing');
    expect(view.subjectId).toBe(TUTORIAL_ID);
    expect(view.notice).toBeNull();
  });

  it('falls back to the surface when a fishing world has no pond session', () => {
    const state = stateWithTutorial();
    state.session = { ...state.session, world: 'fishing' };
    state.fishingSession = null;

    const view = projectRoute(state);
    expect(view.screen).toBe('surface');
    expect(view.notice).toContain('no pond session');
  });
});
