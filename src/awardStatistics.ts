import {
  decideStatisticsEvent, fishingOutcomeEventSourceIdentity, noteSubmissionEventSourceIdentity,
  reviewCompletionEventSourceIdentity, toFishingOutcomeEvent, toNoteSubmissionEvent,
  toReviewCompletionEvent, toXpAwardEvent, writeStatisticsEventLedgerToFields,
  type StatisticsEvent, type NoteSubmissionEventIdentity, type ReviewCompletionEventIdentity,
  type FishingOutcomeEventIdentity,
} from './core/statistics/statisticsEvents';
import { localDateKey } from './core/statistics/localCalendar';
import type { CanonicalSubjectProgression } from './core/progression/canonicalProgression';

type Award =
  | { kind: 'note-submission'; identity: NoteSubmissionEventIdentity }
  | { kind: 'review-completion'; identity: ReviewCompletionEventIdentity }
  | { kind: 'fishing-outcome'; identity: FishingOutcomeEventIdentity };

export function recordAwardStatistics(progression: CanonicalSubjectProgression, award: Award,
  recordedAt: string, xpAwarded: number): void {
  const common = { subjectId: progression.subjectId, localDate: localDateKey(recordedAt), recordedAt, xpAwarded };
  let event: StatisticsEvent;
  let sourceIdentity: readonly string[];
  switch (award.kind) {
    case 'note-submission':
      event = toNoteSubmissionEvent({ ...common, identity: award.identity });
      sourceIdentity = noteSubmissionEventSourceIdentity(award.identity);
      break;
    case 'review-completion':
      event = toReviewCompletionEvent({ ...common, identity: award.identity });
      sourceIdentity = reviewCompletionEventSourceIdentity(award.identity);
      break;
    case 'fishing-outcome':
      event = toFishingOutcomeEvent({ ...common, identity: award.identity });
      sourceIdentity = fishingOutcomeEventSourceIdentity(award.identity);
      break;
  }
  const xpEvent = toXpAwardEvent({ subjectId: common.subjectId, source: award.kind, sourceIdentity,
    localDate: common.localDate, recordedAt, amount: xpAwarded });
  for (const candidate of [event, xpEvent]) {
    const decision = decideStatisticsEvent({ extraFields: progression.extraFields, event: candidate });
    if (decision.outcome === 'recorded') {
      progression.extraFields = writeStatisticsEventLedgerToFields(progression.extraFields, decision.ledger);
    }
  }
}
