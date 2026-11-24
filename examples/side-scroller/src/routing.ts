import type { EngineState } from '@/index';

/**
 * Pure screen routing for the side-scroller host.
 *
 * `session.world` is authoritative; `activeSubjectId` is never inferred from it
 * alone. A `village` world with no active subject is the normal surface screen.
 * Invalid combinations route to the surface with a visible notice instead of
 * throwing, so a corrupt save still boots.
 */

export type Screen = 'surface' | 'dungeon' | 'fishing';

export interface RouteView {
  screen: Screen;
  subjectId: string | null;
  subjectName: string | null;
  /** A host-facing explanation when the engine state is not runnable as-is. */
  notice: string | null;
}

export function projectRoute(state: EngineState): RouteView {
  const world = state.session.world;

  if (world === 'village') {
    return { screen: 'surface', subjectId: null, subjectName: null, notice: null };
  }

  if (world === 'dungeon') {
    const subjectId = state.activeSubjectId;
    const subject = subjectId ? state.subjects[subjectId] : undefined;
    if (!subjectId || !subject) {
      return {
        screen: 'surface',
        subjectId: null,
        subjectName: null,
        notice: 'The dungeon world had no active subject; returned to the village street.',
      };
    }
    return {
      screen: 'dungeon',
      subjectId,
      subjectName: subject.dungeon.subjectName,
      notice: null,
    };
  }

  // P4 replaces this placeholder. Until then, fishing cannot be resumed.
  return {
    screen: 'fishing',
    subjectId: state.activeSubjectId,
    subjectName: state.activeSubjectId
      ? state.subjects[state.activeSubjectId]?.dungeon.subjectName ?? null
      : null,
    notice: 'Fishing is not available in this build. Return to the village to continue.',
  };
}
