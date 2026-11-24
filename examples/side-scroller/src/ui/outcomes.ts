import type { EncounterNoteClearOutcome } from '@/application/encounterCommands';
import type { NoteValidationOutput } from '@/core/validation/notes';

/**
 * Pure rendering text for command outcomes.
 *
 * Kept out of the DOM modules so draft, cleared, refusal, and save-failure states
 * can be asserted without a renderer. Learner text never flows through here: the
 * strings are built from codes, counts, and condition messages only.
 */

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function detail(error: unknown): string {
  return describe(error).trim().replace(/[.!?]+$/, '');
}

/** The "not saved" copy. The preceding state is intact; the learner can retry. */
export function notSavedMessage(error: unknown): string {
  return `Not saved: ${detail(error)}. Nothing was committed. Try again.`;
}

/** The "not collected" copy for a rejected artifact pickup. */
export function notCollectedMessage(error: unknown): string {
  return `Not collected: ${detail(error)}. The artifact was not added to your journal. Try again.`;
}

/** P3: a portal or village interaction was rejected; the player stays put. */
export function interactionFailedMessage(label: string, error: unknown): string {
  return `Could not use ${label}: ${detail(error)}. Nothing was committed; you stayed on the street.`;
}

/** P3: the village-gate return was rejected; the dungeon session remains open. */
export function returnFailedMessage(error: unknown): string {
  return `Could not return to the village: ${detail(error)}. Nothing was committed; the study session is still open.`;
}

/** P3-T6: a fishing save cannot be resumed until P4 ships. */
export function sessionNotResumedMessage(): string {
  return 'Session could not be resumed: fishing is not available in this build. Returned to the village street.';
}

/** A typed refusal from the encounter command (`{ ok: false }`), shown verbatim. */
export function refusalMessage(code: string, message: string): string {
  return `Refused (${code}): ${message}`;
}

/**
 * The exact failed checks for a draft, plus the non-blocking word count.
 *
 * The first line names every missing section so the learner corrects in place
 * instead of guessing (K-08). Nothing here is colour-only.
 */
export function draftSummary(validation: NoteValidationOutput): string[] {
  const lines: string[] = [];

  if (validation.missingSections.length > 0) {
    const noun = validation.missingSections.length === 1 ? 'section' : 'sections';
    lines.push(`Missing required ${noun}: ${validation.missingSections.join(', ')}.`);
  }
  if (!validation.manualConfirmed) {
    lines.push('Confirmation is required: tick “I wrote these notes myself” before submitting.');
  }
  if (validation.failedChecks.length === 0) {
    lines.push('No blocking checks failed.');
  }
  lines.push(
    `Word count: ${validation.wordCount}. The 120-word badge is optional and does not block a clear.`,
  );
  return lines;
}

/** What a clear reports: XP, rank movement, and artifact availability. */
export function clearSummary(outcome: EncounterNoteClearOutcome): string[] {
  const progression = outcome.progression;
  const lines = ['Room cleared.'];

  if (progression.duplicate) {
    lines.push('This clear was already awarded; no XP was added a second time.');
  } else if (progression.awarded) {
    lines.push(`XP gained: ${progression.xpGained}.`);
  }
  if (progression.rankChanged) {
    lines.push(`Rank is now ${progression.newRank}.`);
  }
  if (progression.unlockedBadges.length > 0) {
    lines.push(`Badges unlocked: ${progression.unlockedBadges.join(', ')}.`);
  }
  lines.push(`Quality bonus: ${outcome.validation.qualityBonus}/10.`);
  return lines;
}
