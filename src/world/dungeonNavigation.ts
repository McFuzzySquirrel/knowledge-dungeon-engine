import { computeFloorVisibility, deriveGraphHierarchy } from '../core/graph';
import { generateDungeonMap } from '../core/layout/dungeonGenerator';
import type { DungeonMetadata } from '../core/validation/persistence';
import { createWalkabilityController, DUNGEON_PLAYER_SPEED, type WorldPoint } from './WalkabilityController';

export const TELEPORT_COOLDOWN_MS = 120_000;

/** Navigation is per world mount; a graph change requires a new controller. */
export function createDungeonNavigation(dungeon: DungeonMetadata) {
  const map = generateDungeonMap(dungeon);
  const hierarchy = deriveGraphHierarchy(dungeon);
  let floorId = dungeon.rootRoomId;
  let visibility = computeFloorVisibility(hierarchy, dungeon, floorId);
  const walkability = createWalkabilityController({ map, visibleRoomIds: visibility.visibleRoomIds });
  const start = walkability.landingPointFor(dungeon.rootRoomId);
  if (!start) throw new Error('Dungeon root has no layout');
  let position: WorldPoint = start;
  let lastTeleportAt: number | null = null;

  function travel(roomId: string): WorldPoint {
    const landing = walkability.landingPointFor(roomId);
    if (!landing) throw new Error('Room not found');
    floorId = hierarchy.floorIdByRoomId[roomId] ?? dungeon.rootRoomId;
    visibility = computeFloorVisibility(hierarchy, dungeon, floorId);
    walkability.setVisibleRooms(visibility.visibleRoomIds);
    position = landing;
    return { ...landing };
  }

  function snapshot() {
    return {
      floorId, position: { ...position }, currentRoomId: walkability.roomAt(position.x, position.y)?.roomId ?? null,
      visibleRoomIds: [...visibility.visibleRoomIds], portalUpRoomId: visibility.portalUpRoomId,
      portalDownRoomIds: [...visibility.portalDownRoomIds], lastTeleportAt,
    };
  }

  return {
    map,
    snapshot,
    move(direction: WorldPoint, deltaMs: number) {
      if (![direction.x, direction.y, deltaMs].every(Number.isFinite) || deltaMs < 0) {
        throw new Error('Movement must use finite values and non-negative elapsed time');
      }
      const length = Math.hypot(direction.x, direction.y);
      if (length) {
        const distance = DUNGEON_PLAYER_SPEED * deltaMs / 1000;
        position = walkability.step(position.x, position.y, direction.x / length * distance, direction.y / length * distance);
      }
      return snapshot();
    },
    travelToRoom: travel,
    changeFloor(fromRoomId: string) {
      if (fromRoomId !== visibility.portalUpRoomId && !visibility.portalDownRoomIds.has(fromRoomId)) {
        throw new Error('Room is not a portal on this floor');
      }
      return travel(fromRoomId);
    },
    teleportToRoom(roomId: string, nowMs: number) {
      if (!Number.isFinite(nowMs)) throw new Error('Teleport time must be finite');
      if (lastTeleportAt !== null && nowMs < lastTeleportAt) throw new Error('Teleport time moved backwards');
      if (lastTeleportAt !== null && nowMs - lastTeleportAt < TELEPORT_COOLDOWN_MS) {
        return { accepted: false as const, remainingMs: TELEPORT_COOLDOWN_MS - (nowMs - lastTeleportAt) };
      }
      const landing = travel(roomId);
      lastTeleportAt = nowMs;
      return { accepted: true as const, position: landing };
    },
  };
}
