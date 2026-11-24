import { dungeon } from '@/index';
import type { dungeon as dungeonTypes, subjects } from '@/index';
import type { LevelDoor, LevelModel, LevelRoom, Rect } from './model';

/** Engine tiles are 24 px; three host pixels per engine pixel keeps a corridor 72 px wide. */
export const DEFAULT_RENDER_SCALE = 3;

/** One engine tile in host world pixels at the default render scale. */
export const DEFAULT_TILE_SIZE = 24 * DEFAULT_RENDER_SCALE;

/** How far a ladder may reach into an endpoint room, in tiles. Rooms are 5 tall. */
const LADDER_ROOM_REACH = 5;

function tileToWorld(tile: number, origin: number, tileSize: number): number {
  return (tile - origin) * tileSize;
}

function createWalkableLookup(map: dungeonTypes.DungeonMap): (tileX: number, tileY: number) => boolean {
  const { width, height, offsetX, offsetY, data } = map.walkable;
  return (tileX, tileY) => {
    const gx = tileX - offsetX;
    const gy = tileY - offsetY;
    if (gx < 0 || gy < 0 || gx >= width || gy >= height) return false;
    return data[gy * width + gx] === 1;
  };
}

/**
 * Merge each row of non-walkable tiles into horizontal runs. A run is one tile
 * tall, which keeps the collision set small without hiding individual gaps such
 * as a shaft opening in a room floor.
 */
function buildSolids(map: dungeonTypes.DungeonMap, tilePx: number, originX: number, originY: number): Rect[] {
  const { width, height, offsetX, data } = map.walkable;
  const solids: Rect[] = [];

  for (let gy = 0; gy < height; gy += 1) {
    let runStart = -1;
    for (let gx = 0; gx <= width; gx += 1) {
      const blocked = gx < width && data[gy * width + gx] === 0;
      if (blocked && runStart < 0) {
        runStart = gx;
      } else if (!blocked && runStart >= 0) {
        solids.push({
          x: tileToWorld(runStart + offsetX, originX, tilePx),
          y: tileToWorld(gy + map.walkable.offsetY, originY, tilePx),
          w: (gx - runStart) * tilePx,
          h: tilePx,
        });
        runStart = -1;
      }
    }
  }

  return solids;
}

/**
 * A vertical corridor segment is a one-tile-wide shaft. Extend the ladder into
 * each endpoint room while the mask stays walkable, so a player standing on
 * either room floor can mount it. Extension stops at the room's far wall or
 * after `LADDER_ROOM_REACH` tiles.
 */
function buildLadders(
  map: dungeonTypes.DungeonMap,
  tilePx: number,
  originX: number,
  originY: number,
  isWalkable: (tileX: number, tileY: number) => boolean,
): Rect[] {
  const rects: Rect[] = [];

  for (const corridor of map.corridors) {
    for (const segment of corridor.segments) {
      if (segment.orientation !== 'v') continue;

      const column = segment.x1;
      let top = Math.min(segment.y1, segment.y2);
      let bottom = Math.max(segment.y1, segment.y2);

      for (let step = 0; step < LADDER_ROOM_REACH && isWalkable(column, top - 1); step += 1) {
        top -= 1;
      }
      for (let step = 0; step < LADDER_ROOM_REACH && isWalkable(column, bottom + 1); step += 1) {
        bottom += 1;
      }

      rects.push({
        x: tileToWorld(column, originX, tilePx),
        y: tileToWorld(top, originY, tilePx),
        w: tilePx,
        h: (bottom - top + 1) * tilePx,
      });
    }
  }

  return mergeLadders(rects);
}

/** Collapse duplicate or touching ladders that share a column. */
function mergeLadders(rects: Rect[]): Rect[] {
  const sorted = [...rects].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const merged: Rect[] = [];

  for (const rect of sorted) {
    const last = merged[merged.length - 1];
    if (last && last.x === rect.x && last.w === rect.w && rect.y <= last.y + last.h) {
      const bottom = Math.max(last.y + last.h, rect.y + rect.h);
      last.h = bottom - last.y;
      continue;
    }
    merged.push({ ...rect });
  }

  return merged;
}

function findSpawn(
  map: dungeonTypes.DungeonMap,
  root: dungeonTypes.DungeonRoom,
  tilePx: number,
  originX: number,
  originY: number,
  isWalkable: (tileX: number, tileY: number) => boolean,
): { x: number; y: number } {
  const centre = root.gridX + Math.floor(root.width / 2);
  const minColumn = root.gridX;
  const maxColumn = root.gridX + root.width - 1;
  const floorRow = root.gridY + root.height - 1;
  const belowFloor = root.gridY + root.height;

  // Prefer the centre; step outwards so a shaft opening in the floor does not
  // drop the player on the first frame.
  const offsets = [0, -1, 1, -2, 2, -3, 3];
  let column = centre;
  for (const offset of offsets) {
    const candidate = centre + offset;
    if (candidate < minColumn || candidate > maxColumn) continue;
    const supported = belowFloor >= map.walkable.offsetY + map.walkable.height
      || !isWalkable(candidate, belowFloor);
    if (supported) {
      column = candidate;
      break;
    }
  }

  return {
    x: tileToWorld(column + 0.5, originX, tilePx),
    y: tileToWorld(floorRow + 1, originY, tilePx),
  };
}

/**
 * Derive a side-view level from the engine's generated dungeon map.
 *
 * The whole connected map is used: no floor slicing and no private overrides.
 * A future scale change is a host presentation decision, not a map edit.
 */
export function buildDungeonLevel(
  subject: subjects.SubjectSnapshot,
  scale: number = DEFAULT_RENDER_SCALE,
): LevelModel {
  const map = dungeon.generateDungeonMap(subject.dungeon);
  const tilePx = map.tileSize * scale;
  const originX = map.bounds.minX;
  const originY = map.bounds.minY;
  const isWalkable = createWalkableLookup(map);

  const root = map.rooms.find((room) => room.isRoot) ?? map.rooms[0];
  if (!root) throw new Error('Dungeon map has no rooms');

  const solids = buildSolids(map, tilePx, originX, originY);
  // Safety net: the padded bounds are already solid, but a guaranteed floor
  // keeps the player inside the level if bounds ever change.
  solids.push({
    x: 0,
    y: map.walkable.height * tilePx - tilePx,
    w: map.walkable.width * tilePx,
    h: tilePx,
  });

  const rooms: LevelRoom[] = map.rooms.map((room) => ({
    roomId: room.roomId,
    topic: room.topic,
    status: room.status,
    rect: {
      x: tileToWorld(room.gridX, originX, tilePx),
      y: tileToWorld(room.gridY, originY, tilePx),
      w: room.width * tilePx,
      h: room.height * tilePx,
    },
    isRoot: room.isRoot,
  }));

  const doors: LevelDoor[] = map.doors.map((door) => ({
    roomId: door.roomId,
    side: door.side,
    rect: {
      x: tileToWorld(door.x, originX, tilePx),
      y: tileToWorld(door.y, originY, tilePx),
      w: tilePx,
      h: tilePx,
    },
  }));

  return {
    subjectId: subject.dungeon.dungeonId,
    tileSize: tilePx,
    bounds: {
      x: 0,
      y: 0,
      w: map.walkable.width * tilePx,
      h: map.walkable.height * tilePx,
    },
    spawn: findSpawn(map, root, tilePx, originX, originY, isWalkable),
    solids,
    ladders: buildLadders(map, tilePx, originX, originY, isWalkable),
    rooms,
    doors,
    surfaceY: null,
  };
}
