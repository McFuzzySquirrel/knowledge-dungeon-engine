import { review } from '@/index';
import type {
  ReviewPassCompleteOutcome,
  ReviewSessionDiscardOutcome,
  ReviewSessionSaveOutcome,
} from '@/application/reviewCommands';
import { refusalMessage } from '../ui/outcomes';

/**
 * Pure copy for the Archaeologist review panel (P5).
 *
 * Kept out of the DOM so rating labels, award/duplicate text, save-for-later,
 * discard, and refusal states can be asserted without a renderer. Every string is
 * built from engine codes, counts, and condition messages. Learner text (topics,
 * note text, prompts) never flows through here.
 *
 * `ReviewPassCompleteOutcome` and friends are named by a **type-only** import:
 * `src/index.ts` re-exports `ReviewCommand` but not the review outcome types
 * (K-14). They are recorded as candidate engine exports in the P5 evidence and
 * nothing here reaches around the barrel at runtime.
 */

export interface RatingOption {
  rating: review.QualityRating;
  /** The engine's long label, used for the accessible name. */
  label: string;
  /** The engine's short button label. */
  short: string;
}

/** The six rating buttons, straight from the engine's own label tables. */
export const RATING_OPTIONS: readonly RatingOption[] = ([0, 1, 2, 3, 4, 5] as const).map(
  (rating) => ({
    rating,
    label: review.QUALITY_LABELS[rating],
    short: review.QUALITY_SHORT_LABELS[rating],
  }),
);

export function ratingOption(rating: review.QualityRating): RatingOption {
  return RATING_OPTIONS[rating];
}

function plural(count: number, noun: string): string {
  return count === 1 ? `1 ${noun}` : `${count} ${noun}s`;
}

/** What a completed pass reports: reward, rank, and pass progress. */
export function passResultLines(outcome: ReviewPassCompleteOutcome): string[] {
  const progression = outcome.progression;
  const lines: string[] = ['Review recorded.'];

  if (progression.duplicate) {
    lines.push('This pass was already awarded for this room; no XP was added again.');
  } else if (progression.awarded) {
    lines.push(`XP gained: ${progression.xpGained}.`);
  } else {
    // `awarded: false` without `duplicate` means there was no active subject to
    // pay. Saying "already awarded" here would name a cause that did not happen.
    lines.push('The pass was not paid: no active subject progression was found.');
  }

  if (progression.rankChanged) {
    lines.push(`Rank is now ${progression.newRank}.`);
  }
  if (progression.unlockedAchievements.length > 0) {
    lines.push(`Achievements unlocked: ${progression.unlockedAchievements.join(', ')}.`);
  }
  if (outcome.resumedSessionDiscarded) {
    // The engine clears the marker only on the award path. A duplicate pass
    // returns from the ledger before the marker write, so the host must not
    // claim the saved review was cleared.
    lines.push(
      progression.duplicate
        ? 'The saved review for this room was found; this pass was already awarded, so the saved marker was left in place.'
        : 'The saved review for this room was resumed and cleared.',
    );
  }

  const progress = outcome.passProgress;
  lines.push(
    `Pass progress: ${plural(progress.roomsTowardNextPass, 'room')} of ${progress.totalRooms} toward pass ${progress.nextPassTarget}.`,
  );
  return lines;
}

/** What "save for later" reports. No XP and no schedule movement. */
export function saveLaterLines(outcome: ReviewSessionSaveOutcome): string[] {
  const session = outcome.session;
  const rating =
    session.qualityRating === null ? 'no rating chosen' : `rating ${session.qualityRating} preselected`;
  return [
    `Saved for later at ${session.savedAt} (${rating}).`,
    'No XP was awarded and the schedule did not move. Complete the review or discard it later.',
  ];
}

/** What a discard reports, including another room's untouched marker. */
export function discardLines(outcome: ReviewSessionDiscardOutcome): string[] {
  const lines = [
    outcome.discarded
      ? 'Saved review discarded. Nothing was scheduled.'
      : 'No saved review was held for this room.',
  ];
  if (outcome.keptForOtherRoom) {
    lines.push('A saved review for another room is still waiting.');
  }
  return lines;
}

/** A typed refusal (`{ ok: false }`), shown verbatim in the engine's register. */
export function reviewRefusalMessage(code: string, message: string): string {
  return refusalMessage(code, message);
}

/** A rejected promise: the command may or may not have committed, so say so. */
export function reviewNotSavedMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  const trimmed = detail.trim().replace(/[.!?]+$/, '');
  return `Not saved: ${trimmed}. Nothing was committed; the review is still open. Try again.`;
}

/**
 * Entry refusal when the room itself has not been cleared. The host does not
 * dispatch in this case: there is nothing for the engine to review.
 */
export function roomNotClearedMessage(): string {
  return 'Only cleared rooms with a note can be reviewed. Clear this room first, then press R.';
}

/** Entry refusal when no subject has been studied from this save. */
export function noReviewSubjectMessage(): string {
  return 'No studied dungeon to review yet. Enter a portal and clear a room first.';
}
