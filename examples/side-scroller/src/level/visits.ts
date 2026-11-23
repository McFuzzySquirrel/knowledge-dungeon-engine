import type { LevelModel, LevelRoom } from './model';

/** The player's room is decided by the centre point, not the body edges. */
export function roomAtPoint(level: LevelModel, x: number, y: number): LevelRoom | null {
  for (const room of level.rooms) {
    const { rect } = room;
    if (x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h) {
      return room;
    }
  }
  return null;
}

export function playerCentre(body: { x: number; y: number; w: number; h: number }): {
  x: number;
  y: number;
} {
  return { x: body.x + body.w / 2, y: body.y + body.h / 2 };
}

/**
 * Host-side visit de-duplication.
 *
 * The engine's study-session record keeps a *set* of visited room ids per
 * session, so re-entering a room is a commit with no aggregate change. The host
 * still owes the engine exactly one `recordRoomVisit` per entry, which this
 * tracker enforces: no per-frame calls, one call per new room, and a retry only
 * after the learner leaves a room whose command failed.
 */
export interface VisitTracker {
  readonly lastRecordedRoomId: string | null;
  readonly pendingRoomId: string | null;
  /** Returns a roomId when a visit command should be issued now. */
  observe(room: LevelRoom | null): string | null;
  /** The command committed; remember the room so staying still stays quiet. */
  succeed(roomId: string): void;
  /** The command rejected; keep the previous room and wait for a re-entry. */
  fail(roomId: string): void;
  reset(): void;
}

export function createVisitTracker(): VisitTracker {
  let lastRecordedRoomId: string | null = null;
  let pendingRoomId: string | null = null;
  let failedRoomId: string | null = null;
  let observedRoomId: string | null = null;

  return {
    get lastRecordedRoomId() {
      return lastRecordedRoomId;
    },
    get pendingRoomId() {
      return pendingRoomId;
    },
    observe(room) {
      const roomId = room?.roomId ?? null;
      observedRoomId = roomId;

      if (roomId === null) {
        // Leaving a room ends that entry and clears a failed retry.
        lastRecordedRoomId = null;
        failedRoomId = null;
        return null;
      }
      // One command at a time; the next observe picks up wherever the player is.
      if (pendingRoomId !== null) return null;
      if (roomId === lastRecordedRoomId) return null;
      if (roomId === failedRoomId) return null;

      pendingRoomId = roomId;
      return roomId;
    },
    succeed(roomId) {
      if (pendingRoomId === roomId) pendingRoomId = null;
      // If the player moved on while the command was in flight, the new room
      // still owes an entry.
      lastRecordedRoomId = observedRoomId === roomId ? roomId : null;
    },
    fail(roomId) {
      if (pendingRoomId === roomId) pendingRoomId = null;
      failedRoomId = roomId;
    },
    reset() {
      lastRecordedRoomId = null;
      pendingRoomId = null;
      failedRoomId = null;
      observedRoomId = null;
    },
  };
}
