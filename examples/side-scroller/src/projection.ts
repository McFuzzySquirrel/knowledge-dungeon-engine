import type { EngineState } from '@/index';

/**
 * Pure projection from engine state to the dungeon HUD / renderer view model.
 *
 * No DOM, no canvas, no commands. The frame loop never calls `snapshot()`; it
 * reads the cached state delivered by the single subscription and projects it
 * here only when that state changes.
 */

export interface RoomView {
  roomId: string;
  topic: string;
  /** Engine room state, kept verbatim for debugging and P2. */
  state: string;
  cleared: boolean;
  /** Human label that never relies on colour. */
  statusLabel: string;
}

export interface DungeonView {
  subjectId: string;
  subjectName: string;
  xp: number;
  rank: string;
  rooms: RoomView[];
  clearedCount: number;
  totalRooms: number;
  /** Distinct room ids visited in the active study session, in first-visit order. */
  visits: string[];
  studySessionOpen: boolean;
}

function statusLabel(cleared: boolean, state: string): string {
  if (cleared) return 'Cleared';
  if (state === 'Created' || state === 'Uncreated' || state === 'Visited' || state === 'NotesDrafted') {
    return 'Open';
  }
  return state;
}

/**
 * Project the active subject's dungeon. Returns `null` when no subject is active,
 * which is the host's signal to show the village or the start overlay.
 */
export function projectDungeon(state: EngineState): DungeonView | null {
  const subjectId = state.activeSubjectId;
  if (!subjectId) return null;

  const subject = state.subjects[subjectId];
  if (!subject) return null;

  const progression = state.progression[subjectId];
  const activeSession = state.studySessions.find(
    (session) => session.sessionId === state.activeStudySessionId,
  );

  const rooms: RoomView[] = subject.dungeon.rooms.map((summary) => {
    const metadata = subject.rooms[summary.roomId];
    const cleared = metadata?.validationState.finalPass ?? false;
    const roomState = metadata?.state ?? summary.status;
    return {
      roomId: summary.roomId,
      topic: summary.topic,
      state: roomState,
      cleared,
      statusLabel: statusLabel(cleared, roomState),
    };
  });

  return {
    subjectId,
    subjectName: subject.dungeon.subjectName,
    xp: progression?.xpTotal ?? subject.dungeon.progression.xpTotal,
    rank: progression?.rank ?? subject.dungeon.progression.rank,
    rooms,
    clearedCount: rooms.filter((room) => room.cleared).length,
    totalRooms: rooms.length,
    visits: [...(activeSession?.roomsVisited ?? [])],
    studySessionOpen: state.activeStudySessionId !== null,
  };
}

/** Badge record for the canvas renderer, derived from the same view model as the HUD. */
export function roomBadges(view: DungeonView | null): Record<string, { cleared: boolean; label: string }> {
  const badges: Record<string, { cleared: boolean; label: string }> = {};
  for (const room of view?.rooms ?? []) {
    badges[room.roomId] = { cleared: room.cleared, label: room.statusLabel };
  }
  return badges;
}
