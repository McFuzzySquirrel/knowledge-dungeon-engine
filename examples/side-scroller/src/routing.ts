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

  // P4: the pond session names the subject the pond runs under. Without it the
  // world is unrecoverable mid-cast, so route to the surface with a notice.
  const context = state.fishingSession;
  if (!context) {
    return {
      screen: 'surface',
      subjectId: null,
      subjectName: null,
      notice: 'The fishing world had no pond session; returned to the village street.',
    };
  }
  if (!state.subjects[context.subjectId]) {
    return {
      screen: 'surface',
      subjectId: null,
      subjectName: null,
      notice: 'The fishing subject no longer exists; returned to the village street.',
    };
  }
  return {
    screen: 'fishing',
    subjectId: context.subjectId,
    subjectName: context.subjectName,
    notice: null,
  };
}
