/**
 * Side-view level contract.
 *
 * The engine's dungeon map is a top-down tile grid. This module and its
 * sibling `dungeonLevel.ts` reinterpret that grid for a side view:
 *
 * - world X is the map's X axis (left to right),
 * - world Y is the map's Y axis (top to bottom, so "south" is "down"),
 * - every non-walkable tile becomes solid rock,
 * - every vertical corridor segment becomes a ladder.
 *
 * All coordinates in a `LevelModel` are world pixels, normalised so the
 * level's bounding box starts at (0, 0). `spawn` is the player's feet
 * position (bottom-centre of the body).
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * P3 frozen interface: the collision subset shared by the surface street and
 * the placed dungeon. Both live in the same world-pixel coordinate space.
 */
export interface CollisionWorld {
  bounds: Rect;
  solids: Rect[];
  ladders: Rect[];
}

export interface LevelRoom {
  roomId: string;
  topic: string;
  /** Engine room status copied from the map at build time. */
  status: string;
  /** Room footprint in world pixels. */
  rect: Rect;
  isRoot: boolean;
}

/** One engine doorway on a room perimeter, in world pixels. */
export interface LevelDoor {
  roomId: string;
  side: 'N' | 'S' | 'E' | 'W';
  /** The door tile's world rectangle. */
  rect: Rect;
}

export interface LevelModel extends CollisionWorld {
  subjectId: string;
  /** One engine tile in world pixels (engine tile size × render scale). */
  tileSize: number;
  /** Player feet position (bottom-centre) inside the root room. */
  spawn: { x: number; y: number };
  rooms: LevelRoom[];
  /** Doorway tiles, used to break the room border where a corridor enters. */
  doors?: LevelDoor[];
  /** The surface ground line when the dungeon was placed below a street, else `null`. */
  surfaceY: number | null;
}

export { buildDungeonLevel, DEFAULT_RENDER_SCALE, DEFAULT_TILE_SIZE } from './dungeonLevel';
