import type { EngineState } from '@/index';

/**
 * Pure projections from engine state to the host's view models.
 *
 * No DOM, no canvas, no commands. The frame loop never calls `snapshot()`; it
 * reads the cached state delivered by the single subscription and projects it
 * here only when that state changes.
 */

/** P2 frozen interface: the progression HUD, renderer-neutral. */
export interface HudRoomView {
  roomId: string;
  topic: string;
  /** Human status label; never colour-only. */
  status: string;
  cleared: boolean;
}

export interface HudView {
  subjectName: string | null;
  world: 'village' | 'dungeon' | 'fishing';
  phase: 'creator' | 'scribe' | 'archaeologist';
  xpTotal: number;
  rank: string;
  rooms: HudRoomView[];
}

export interface RoomView {
  roomId: string;
  topic: string;
  /** Engine room state, kept verbatim for debugging and later phases. */
  state: string;
  cleared: boolean;
  /** Human label that never relies on colour. */
  statusLabel: string;
}

export interface DungeonView {
  subjectId: string;
  subjectName: string;
  world: 'village' | 'dungeon' | 'fishing';
  phase: 'creator' | 'scribe' | 'archaeologist';
  xp: number;
  rank: string;
  rooms: RoomView[];
  clearedCount: number;
  totalRooms: number;
  /** Distinct room ids visited in the active study session, in first-visit order. */
  visits: string[];
  studySessionOpen: boolean;
}

/** The engine's rank for zero XP, used when no progression record exists yet. */
const DEFAULT_RANK = 'Novice';

function statusLabel(cleared: boolean, state: string): string {
  if (cleared) return 'Cleared';
  if (state === 'Created' || state === 'Uncreated' || state === 'Visited' || state === 'NotesDrafted') {
    return 'Open';
  }
  return state;
}

/**
 * Project the progression HUD for one subject.
 *
 * Reads the canonical progression record, not the dungeon summary, so XP and rank
 * stay correct even if the two ever diverge. A missing subject projects to empty
 * rooms and zero XP, which is the host's signal to show the start overlay.
 */
export function projectHud(state: EngineState, subjectId: string | null): HudView {
  const subject = subjectId ? state.subjects[subjectId] : undefined;
  const progression = subjectId ? state.progression[subjectId] : undefined;
  const base: HudView = {
    subjectName: subject?.dungeon.subjectName ?? null,
    world: state.session.world,
    phase: state.session.phase,
    xpTotal: progression?.xpTotal ?? 0,
    rank: progression?.rank ?? DEFAULT_RANK,
    rooms: [],
  };
  if (!subject) return base;

  return {
    ...base,
    rooms: subject.dungeon.rooms.map((summary) => {
      const metadata = subject.rooms[summary.roomId];
      const cleared = metadata?.validationState.finalPass ?? false;
      return {
        roomId: summary.roomId,
        topic: summary.topic,
        status: statusLabel(cleared, metadata?.state ?? summary.status),
        cleared,
      };
    }),
  };
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

  const hud = projectHud(state, subjectId);
  const activeSession = state.studySessions.find(
    (session) => session.sessionId === state.activeStudySessionId,
  );

  const rooms: RoomView[] = hud.rooms.map((room) => {
    const metadata = subject.rooms[room.roomId];
    return {
      roomId: room.roomId,
      topic: room.topic,
      state: metadata?.state ?? 'Uncreated',
      cleared: room.cleared,
      statusLabel: room.status,
    };
  });

  return {
    subjectId,
    subjectName: hud.subjectName ?? subject.dungeon.subjectName,
    world: hud.world,
    phase: hud.phase,
    xp: hud.xpTotal,
    rank: hud.rank,
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
