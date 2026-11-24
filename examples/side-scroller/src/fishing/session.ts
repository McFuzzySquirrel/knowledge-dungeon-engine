import { fishingMechanics, fishingState, type EngineState } from '@/index';

/**
 * Which subject a surface pond fishes for, and whether the pond may open.
 *
 * The engine clears `activeSubjectId` in `returnToVillage()`, so after the P3
 * return-to-village flow the surface has no active subject even though the player
 * just studied one. P4 therefore resolves the pond's subject host-side, in this
 * order:
 *
 * 1. `state.activeSubjectId` when it is set (the engine's own answer).
 * 2. The subject the host last entered in this tab.
 * 3. The subject with the most cleared rooms, so a reload on the surface still
 *    finds the studied subject.
 *
 * Nothing here creates state or calls a command; eligibility uses the engine's
 * `getClearedRooms` and `isFishingEligible` so the host cannot disagree with
 * `dispatchFishing`.
 */

export interface FishingSubjectView {
  subjectId: string;
  subjectName: string;
  clearedRoomCount: number;
  totalRooms: number;
  eligible: boolean;
  source: 'active' | 'remembered' | 'most-cleared';
}

function clearedRoomCount(state: EngineState, subjectId: string): number {
  const subject = state.subjects[subjectId];
  if (!subject) return 0;
  try {
    return fishingMechanics.getClearedRooms(subject.rooms).length;
  } catch {
    // A half-migrated room record makes the pond ineligible, not the screen fatal.
    return 0;
  }
}

function viewFor(
  state: EngineState,
  subjectId: string,
  source: FishingSubjectView['source'],
): FishingSubjectView | null {
  const subject = state.subjects[subjectId];
  if (!subject) return null;
  const cleared = clearedRoomCount(state, subjectId);
  return {
    subjectId,
    subjectName: subject.dungeon.subjectName,
    clearedRoomCount: cleared,
    totalRooms: subject.dungeon.rooms.length,
    eligible: fishingState.isFishingEligible(cleared),
    source,
  };
}

/** The subject a pond should use, or `null` when the save has no subjects at all. */
export function resolveFishingSubject(
  state: EngineState,
  rememberedSubjectId: string | null,
): FishingSubjectView | null {
  if (state.activeSubjectId) {
    const active = viewFor(state, state.activeSubjectId, 'active');
    if (active) return active;
  }

  if (rememberedSubjectId) {
    const remembered = viewFor(state, rememberedSubjectId, 'remembered');
    if (remembered) return remembered;
  }

  const ids = Object.keys(state.subjects).sort();
  if (ids.length === 0) return null;

  let bestId = ids[0];
  let bestCleared = clearedRoomCount(state, bestId);
  for (const id of ids.slice(1)) {
    const cleared = clearedRoomCount(state, id);
    if (cleared > bestCleared) {
      bestId = id;
      bestCleared = cleared;
    }
  }
  return viewFor(state, bestId, 'most-cleared');
}

/** Why a pond cannot open, or `null` when it can. */
export function fishingEntryRefusal(view: FishingSubjectView | null): string | null {
  if (!view) {
    return 'No dungeon subject is in focus. Enter a dungeon and clear a room before fishing.';
  }
  if (!view.eligible) {
    return `Clear a room before fishing. ${view.subjectName} has no cleared rooms yet.`;
  }
  return null;
}

/** Kept fish for a subject; the only collection number this example shows. */
export function fishingCollectionCount(state: EngineState, subjectId: string): number {
  return state.progression[subjectId]?.fishCollection.length ?? 0;
}

/**
 * One-line outcome copy for a `fishing/catch-keep` result.
 *
 * The outcome code is the engine's, so answered-incorrect and
 * kept-without-recall read differently without the host inferring a reward.
 */
export function catchKeepSummary(input: {
  outcome: string;
  rewarded: boolean;
  duplicate: boolean;
  xpGained: number;
}): string {
  switch (input.outcome) {
    case 'answered-correct':
      if (input.duplicate) return 'This catch was already awarded; the collection is unchanged.';
      return input.rewarded ? `Kept. ${input.xpGained} XP gained.` : 'Kept.';
    case 'kept-without-recall':
      return 'Kept without a recall check. No XP was awarded.';
    case 'answered-incorrect':
      return 'You could not recall the answer. The fish went back and nothing was written.';
    case 'released':
      return 'Released. The collection is unchanged.';
    default:
      return 'The catch was resolved.';
  }
}
