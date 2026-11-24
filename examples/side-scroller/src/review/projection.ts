import { review, type EngineState } from '@/index';

/**
 * Pure Archaeologist review projections (P5).
 *
 * Everything here is derived from `EngineState` with the engine's own review
 * helpers: `isReviewableRoom`, `deriveReviewPassProgress`,
 * `currentReviewPassNumber`, `describeReviewDueState`,
 * `readInterruptedReviewSessionFromFields`, and `generateSelfCheckPrompts`.
 * There is no second eligibility rule, no second date arithmetic, and no guessed
 * `extraFields` key.
 *
 * No DOM, no commands, no clock of its own: the caller supplies `nowIso`.
 */

/** One cleared room that can be reviewed, renderer-neutral. */
export interface ReviewCandidateView {
  roomId: string;
  topic: string;
  /** ISO-8601, or null when the room has never been reviewed. */
  nextReviewIso: string | null;
  overdueDays: number;
  /** A neutral label: "Due today", "Due in 3 days", "Overdue by 2 days". */
  dueLabel: string;
}

export interface ReviewView {
  subjectId: string;
  subjectName: string;
  candidates: ReviewCandidateView[];
  reviewableCount: number;
  nextPassNumber: number;
  hasInterrupted: boolean;
  interruptedRoomId: string | null;
}

/** Everything the panel needs for one room. */
export interface ReviewRoomView {
  roomId: string;
  topic: string;
  subjectName: string;
  /** The engine's first self-check prompt for this room, or null when none. */
  prompt: string | null;
  passNumber: number;
  existingRating: review.QualityRating | null;
  nextReviewIso: string | null;
  dueLabel: string;
  /** True when a durable interrupted-review marker for this room was found. */
  resumable: boolean;
}

/**
 * The subject-level review gate, straight from `review.evaluateReviewUnlock`.
 *
 * A cleared room can still be locked: the engine unlocks full review only when
 * the dungeon's completion ratio reaches its threshold (1 by default). The host
 * asks this before opening the panel so "not yet" is explained instead of a
 * panel that refuses on submit.
 */
export interface ReviewGateView {
  allowed: boolean;
  clearedRooms: number;
  totalRooms: number;
  message: string;
}

/** One day, in the words the HUD uses. */
function daysLabel(days: number): string {
  return days === 1 ? '1 day' : `${days} days`;
}

/**
 * A neutral due label from the engine's own `describeReviewDueState`.
 *
 * `describeReviewDueState` already resolves the day count with the SM-2 date
 * helpers, so this function only chooses words. A room with no schedule is not
 * overdue and is not "due today"; it has never been reviewed.
 */
export function describeDueLabel(due: review.ReviewDueState, nextReviewIso: string | null): string {
  switch (due.kind) {
    case 'overdue':
      return `Overdue by ${daysLabel(due.days)}`;
    case 'due-today':
      return 'Due today';
    default:
      if (due.days > 0) return `Due in ${daysLabel(due.days)}`;
      return nextReviewIso === null ? 'Not yet reviewed' : 'Due today';
  }
}

function subjectOf(state: EngineState) {
  const subjectId = state.activeSubjectId;
  if (!subjectId) return null;
  const subject = state.subjects[subjectId];
  if (!subject) return null;
  return { subjectId, subject };
}

/**
 * A cleared room with a note, using the engine's reviewable rule.
 *
 * `isReviewableRoom` is the engine's definition (`finalPass` plus a reviewable
 * room state). The extra note check is the host's, because a room is only useful
 * to review if the learner's own note is there to check recall against.
 */
/** Whether a cleared room with a note belongs in the review queue. */
export function isReviewCandidateRoom(room: {
  noteText: string;
  state: string;
  validationState: { finalPass: boolean };
}): boolean {
  return room.noteText.trim().length > 0 && review.isReviewableRoom(room);
}

function candidateFor(
  state: EngineState,
  subjectId: string,
  roomId: string,
  nowIso: string,
): ReviewCandidateView | null {
  const subject = state.subjects[subjectId];
  const room = subject?.rooms[roomId];
  if (!subject || !room || !isReviewCandidateRoom(room)) return null;

  const summary = subject.dungeon.rooms.find((entry) => entry.roomId === roomId);
  if (!summary) return null;

  const nextReviewIso = room.sm2NextReviewDate ?? null;
  const due = review.describeReviewDueState({ nextReviewDateIso: nextReviewIso, nowIso });
  return {
    roomId,
    topic: summary.topic || room.topic,
    nextReviewIso,
    overdueDays: due.kind === 'overdue' ? due.days : 0,
    dueLabel: describeDueLabel(due, nextReviewIso),
  };
}

/**
 * Sort the queue the way a learner expects: most overdue first, then rooms never
 * reviewed, then due today, then scheduled ahead. Ties keep dungeon order.
 */
function compareCandidates(a: ReviewCandidateView, b: ReviewCandidateView): number {
  const rank = (candidate: ReviewCandidateView): number => {
    if (candidate.overdueDays > 0) return 0;
    if (candidate.nextReviewIso === null) return 1;
    if (candidate.dueLabel === 'Due today') return 2;
    return 3;
  };
  const difference = rank(a) - rank(b);
  if (difference !== 0) return difference;
  if (a.overdueDays !== b.overdueDays) return b.overdueDays - a.overdueDays;
  return (a.nextReviewIso ?? '').localeCompare(b.nextReviewIso ?? '');
}

/**
 * Project one subject's review queue, whether or not it is active.
 *
 * P7's Library desk reads the last-studied subject from the street, where
 * `returnToVillage()` has already cleared `activeSubjectId`. This is the same
 * projection as {@link projectReview}, without the "must be active" test.
 * `null` means the subject no longer exists.
 */
export function projectReviewForSubject(
  state: EngineState,
  subjectId: string,
  nowIso: string,
): ReviewView | null {
  const subject = state.subjects[subjectId];
  if (!subject) return null;

  const candidates: ReviewCandidateView[] = [];
  for (const summary of subject.dungeon.rooms) {
    const candidate = candidateFor(state, subjectId, summary.roomId, nowIso);
    if (candidate) candidates.push(candidate);
  }
  candidates.sort(compareCandidates);

  const progress = review.deriveReviewPassProgress({
    dungeon: subject.dungeon,
    rooms: subject.rooms,
  });
  const marker = review.readInterruptedReviewSessionFromFields(
    state.progression[subjectId]?.extraFields,
  );

  return {
    subjectId,
    subjectName: subject.dungeon.subjectName,
    candidates,
    reviewableCount: candidates.length,
    nextPassNumber: review.currentReviewPassNumber(progress),
    hasInterrupted: marker !== null,
    interruptedRoomId: marker?.roomId ?? null,
  };
}

/** Project the active subject's review queue. `null` means no active subject. */
export function projectReview(state: EngineState, nowIso: string): ReviewView | null {
  const active = subjectOf(state);
  if (!active) return null;
  return projectReviewForSubject(state, active.subjectId, nowIso);
}

/**
 * Project one room for the review panel, including the engine's self-check
 * prompt and any resumable marker.
 *
 * `null` when there is no active subject or the room is not reviewable right now.
 */
export function projectReviewRoom(
  state: EngineState,
  roomId: string,
  nowIso: string,
): ReviewRoomView | null {
  const active = subjectOf(state);
  if (!active) return null;
  const { subjectId, subject } = active;
  const candidate = candidateFor(state, subjectId, roomId, nowIso);
  if (!candidate) return null;

  const room = subject.rooms[roomId];
  if (!room) return null;

  const relatedTopics: string[] = [];
  for (const edge of subject.dungeon.edges) {
    const otherId =
      edge.fromRoomId === roomId
        ? edge.toRoomId
        : edge.toRoomId === roomId
          ? edge.fromRoomId
          : null;
    if (!otherId) continue;
    const other = subject.rooms[otherId];
    if (other && !relatedTopics.includes(other.topic)) relatedTopics.push(other.topic);
  }

  const prompts = review.generateSelfCheckPrompts({
    roomId,
    subjectName: subject.dungeon.subjectName,
    roomTopic: candidate.topic,
    noteHeadings: review.extractMarkdownHeadings(room.noteText),
    relatedTopics,
    maxPromptCount: 4,
  });

  const marker = review.readInterruptedReviewSessionFromFields(
    state.progression[subjectId]?.extraFields,
  );
  const resumable = marker !== null && marker.roomId === roomId;
  const progress = review.deriveReviewPassProgress({
    dungeon: subject.dungeon,
    rooms: subject.rooms,
  });

  return {
    roomId,
    topic: candidate.topic,
    subjectName: subject.dungeon.subjectName,
    prompt: prompts[0]?.text ?? null,
    passNumber: resumable ? marker.passNumber : review.currentReviewPassNumber(progress),
    existingRating: resumable ? marker.qualityRating : null,
    nextReviewIso: candidate.nextReviewIso,
    dueLabel: candidate.dueLabel,
    resumable,
  };
}

/** Whether the active subject has reached the engine's review unlock. */
export function projectReviewGate(state: EngineState): ReviewGateView | null {
  const active = subjectOf(state);
  if (!active) return null;
  const { subject } = active;
  const unlock = review.evaluateReviewUnlock({
    dungeon: subject.dungeon,
    rooms: subject.rooms,
  });

  if (unlock.unlocked) {
    return {
      allowed: true,
      clearedRooms: unlock.clearedRooms,
      totalRooms: unlock.totalRooms,
      message: `Review mode is unlocked. ${unlock.clearedRooms} of ${unlock.totalRooms} rooms cleared.`,
    };
  }

  return {
    allowed: false,
    clearedRooms: unlock.clearedRooms,
    totalRooms: unlock.totalRooms,
    message:
      `Reviews are locked: ${unlock.clearedRooms} of ${unlock.totalRooms} rooms cleared. ` +
      'Clear every room encounter to unlock full review mode.',
  };
}

/**
 * The subject the host should offer from the street: the most recent study
 * session whose subject still exists, falling back to the active subject.
 *
 * Read from engine data so a reload does not forget what was last studied.
 */
export function lastStudiedSubjectId(state: EngineState): string | null {
  for (let index = state.studySessions.length - 1; index >= 0; index -= 1) {
    const session = state.studySessions[index];
    if (session && state.subjects[session.subjectId]) return session.subjectId;
  }
  return state.activeSubjectId;
}

/**
 * Whether one candidate is actually waiting: overdue, due today, or never
 * reviewed. A room scheduled for next week is not "due".
 *
 * Exported so the HUD count and the Journal's Due section cannot disagree.
 */
export function isDueCandidate(candidate: ReviewCandidateView): boolean {
  return (
    candidate.nextReviewIso === null ||
    candidate.overdueDays > 0 ||
    candidate.dueLabel === 'Due today'
  );
}

/**
 * How many rooms in the queue are actually waiting: overdue, due today, or never
 * reviewed. A room scheduled for next week is not "due" and does not inflate the
 * HUD count.
 */
export function reviewDueCount(view: ReviewView | null): number {
  if (!view) return 0;
  return view.candidates.filter(isDueCandidate).length;
}
