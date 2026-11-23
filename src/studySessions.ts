import type { LifecycleSessionRecord } from './application/sessionLifecycle';
import type { EngineState } from './storage';

export type StudySessionRecord = LifecycleSessionRecord;

export function endStudySession(state: EngineState, now: string, recover = false): void {
  const record = state.studySessions.find((session) => session.sessionId === state.activeStudySessionId);
  if (!record) return;
  const endedAt = recover ? record.lastActivityAt ?? record.startedAt : now;
  state.studySessions = state.studySessions.map((session) =>
    session.sessionId === record.sessionId
      ? { ...session, endedAt, lastActivityAt: session.lastActivityAt ?? endedAt }
      : session);
  state.activeStudySessionId = null;
}

export function startStudySession(state: EngineState, subjectId: string, now: string, mintId: () => string): void {
  const active = state.studySessions.find((session) => session.sessionId === state.activeStudySessionId);
  if (active?.subjectId === subjectId) return;
  endStudySession(state, now);
  const id = mintId();
  if (!id.trim() || state.studySessions.some((session) => session.sessionId === id)) {
    throw new Error('Study session id must be unique and non-empty');
  }
  const subject = state.subjects[subjectId];
  if (!subject) throw new Error('Subject not found');
  state.studySessions.push({
    sessionId: id, subjectId, subjectName: subject.dungeon.subjectName, startedAt: now, endedAt: null,
    roomsVisited: [], notesSubmitted: 0, reviewsCompleted: 0, xpEarned: 0,
  });
  state.activeStudySessionId = id;
}

export function recordStudyActivity(
  state: EngineState,
  now: string,
  activity: { kind: 'visit'; roomId: string } |
    { kind: 'note' | 'review'; roomId: string; xp: number } |
    { kind: 'fishing'; xp: number },
): void {
  const index = state.studySessions.findIndex((session) => session.sessionId === state.activeStudySessionId);
  if (index < 0) return;
  const record = state.studySessions[index];
  const roomId = activity.kind === 'fishing' ? null : activity.roomId;
  if (activity.kind === 'visit' && record.roomsVisited.includes(activity.roomId)) return;
  state.studySessions[index] = {
    ...record,
    roomsVisited: roomId && !record.roomsVisited.includes(roomId)
      ? [...record.roomsVisited, roomId] : record.roomsVisited,
    notesSubmitted: record.notesSubmitted + (activity.kind === 'note' ? 1 : 0),
    reviewsCompleted: record.reviewsCompleted + (activity.kind === 'review' ? 1 : 0),
    xpEarned: record.xpEarned + (activity.kind === 'visit' ? 0 : activity.xp),
    lastActivityAt: now,
  };
}
