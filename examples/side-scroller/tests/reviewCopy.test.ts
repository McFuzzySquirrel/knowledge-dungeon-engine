import { describe, expect, it } from 'vitest';
import { review } from '@/index';
import type {
  ReviewPassCompleteOutcome,
  ReviewSessionDiscardOutcome,
  ReviewSessionSaveOutcome,
} from '@/application/reviewCommands';
import {
  RATING_OPTIONS,
  discardLines,
  noReviewSubjectMessage,
  passResultLines,
  ratingOption,
  reviewNotSavedMessage,
  reviewRefusalMessage,
  roomNotClearedMessage,
  saveLaterLines,
} from '../src/review/copy';

const PASS_PROGRESS = {
  fullReviewPasses: 0,
  nextPassTarget: 1,
  roomsTowardNextPass: 1,
  totalRooms: 3,
  reviewedRoomIds: ['tut-note'],
};

function passOutcome(overrides: Partial<ReviewPassCompleteOutcome> = {}): ReviewPassCompleteOutcome {
  return {
    command: 'review/pass-complete',
    roomId: 'tut-note',
    qualityRating: 5,
    reviewIdentity: {
      roomId: 'tut-note',
      passNumber: 1,
      reviewIdentity: 'identity',
    },
    passProgress: PASS_PROGRESS,
    progression: {
      awarded: true,
      duplicate: false,
      xpGained: 6,
      newRank: 'Novice',
      rankChanged: false,
      unlockedAchievements: [],
    },
    resumedSessionDiscarded: false,
    ...overrides,
  } as ReviewPassCompleteOutcome;
}

function saveOutcome(): ReviewSessionSaveOutcome {
  return {
    command: 'review/session-save',
    roomId: 'tut-note',
    session: {
      version: 1,
      roomId: 'tut-note',
      passNumber: 1,
      startedAt: '2026-11-23T12:00:00.000Z',
      savedAt: '2026-11-23T12:05:00.000Z',
      qualityRating: 4,
    },
    progression: null,
  };
}

function discardOutcome(overrides: Partial<ReviewSessionDiscardOutcome> = {}): ReviewSessionDiscardOutcome {
  return {
    command: 'review/session-discard',
    roomId: 'tut-note',
    discarded: true,
    keptForOtherRoom: null,
    progression: null,
    ...overrides,
  };
}

describe('review panel copy (P5-T4)', () => {
  it('offers six ratings labelled by the engine tables', () => {
    expect(RATING_OPTIONS).toHaveLength(6);
    expect(RATING_OPTIONS.map((option) => option.rating)).toEqual([0, 1, 2, 3, 4, 5]);
    for (const option of RATING_OPTIONS) {
      expect(option.label).toBe(review.QUALITY_LABELS[option.rating]);
      expect(option.short).toBe(review.QUALITY_SHORT_LABELS[option.rating]);
    }
    expect(ratingOption(3).short).toBe('Solid');
  });

  it('reports an award with XP, progress, and no invented second reward', () => {
    const lines = passResultLines(passOutcome()).join('\n');
    expect(lines).toContain('Review recorded.');
    expect(lines).toContain('XP gained: 6.');
    expect(lines).toContain('Pass progress: 1 room of 3 toward pass 1.');
    expect(lines).not.toContain('already awarded');
  });

  it('says "already awarded" only for a duplicate', () => {
    const lines = passResultLines(
      passOutcome({
        progression: {
          awarded: false,
          duplicate: true,
          xpGained: 0,
          newRank: 'Novice',
          rankChanged: false,
          unlockedAchievements: [],
        },
      }),
    ).join('\n');

    expect(lines).toContain('already awarded');
    expect(lines).not.toContain('XP gained');
  });

  it('does not blame a duplicate when there was nothing to pay', () => {
    const lines = passResultLines(
      passOutcome({
        progression: {
          awarded: false,
          duplicate: false,
          xpGained: 0,
          newRank: 'Novice',
          rankChanged: false,
          unlockedAchievements: [],
        },
      }),
    ).join('\n');

    expect(lines).toContain('not paid');
    expect(lines).not.toContain('already awarded');
  });

  it('reports a rank change and a resumed marker', () => {
    const lines = passResultLines(
      passOutcome({
        progression: {
          awarded: true,
          duplicate: false,
          xpGained: 12,
          newRank: 'Scholar',
          rankChanged: true,
          unlockedAchievements: ['first-review'],
        },
        resumedSessionDiscarded: true,
      }),
    ).join('\n');

    expect(lines).toContain('Rank is now Scholar.');
    expect(lines).toContain('Achievements unlocked: first-review.');
    expect(lines).toContain('resumed and cleared');
  });

  it('does not claim a duplicate pass cleared the saved marker', () => {
    const lines = passResultLines(
      passOutcome({
        progression: {
          awarded: false,
          duplicate: true,
          xpGained: 0,
          newRank: 'Novice',
          rankChanged: false,
          unlockedAchievements: [],
        },
        resumedSessionDiscarded: true,
      }),
    ).join('\n');

    expect(lines).toContain('saved marker was left in place');
    expect(lines).not.toContain('resumed and cleared');
  });

  it('renders save-for-later from the engine session timestamp and promises no schedule move', () => {
    const lines = saveLaterLines(saveOutcome()).join('\n');
    expect(lines).toContain('Saved for later at 2026-11-23T12:05:00.000Z');
    expect(lines).toContain('rating 4 preselected');
    expect(lines).toContain('No XP was awarded and the schedule did not move');
  });

  it('renders both discard outcomes and an untouched marker for another room', () => {
    expect(discardLines(discardOutcome()).join(' ')).toContain('discarded');
    expect(
      discardLines(discardOutcome({ discarded: false })).join(' '),
    ).toContain('No saved review was held');
    expect(
      discardLines(
        discardOutcome({
          discarded: false,
          keptForOtherRoom: {
            version: 1,
            roomId: 'tut-tools',
            passNumber: 1,
            startedAt: '2026-11-23T12:00:00.000Z',
            savedAt: '2026-11-23T12:01:00.000Z',
            qualityRating: null,
          },
        }),
      ).join(' '),
    ).toContain('saved review for another room is still waiting');
  });

  it('shows typed refusals verbatim in the command register', () => {
    expect(
      reviewRefusalMessage('REVIEW_LOCKED', 'Clear every room encounter to unlock full review mode.'),
    ).toBe('Refused (REVIEW_LOCKED): Clear every room encounter to unlock full review mode.');
  });

  it('distinguishes a rejected write from a refusal', () => {
    const message = reviewNotSavedMessage(new Error('QuotaExceededError'));
    expect(message).toContain('Not saved');
    expect(message).toContain('QuotaExceededError');
    expect(message).toContain('Nothing was committed');
    expect(message).toContain('review is still open');
    expect(message).not.toContain('Refused');
  });

  it('explains the two host-side entry refusals', () => {
    expect(roomNotClearedMessage()).toContain('Only cleared rooms');
    expect(roomNotClearedMessage()).toContain('press R');
    expect(noReviewSubjectMessage()).toContain('No studied dungeon');
  });
});
