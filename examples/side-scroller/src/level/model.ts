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

export interface LevelRoom {
  roomId: string;
  topic: string;
  /** Engine room status copied from the map at build time. */
  status: string;
  /** Room footprint in world pixels. */
  rect: Rect;
  isRoot: boolean;
}

export interface LevelModel {
  subjectId: string;
  /** One engine tile in world pixels (engine tile size × render scale). */
  tileSize: number;
  /** Level extent in world pixels, anchored at (0, 0). */
  bounds: Rect;
  /** Player feet position (bottom-centre) inside the root room. */
  spawn: { x: number; y: number };
  /** Merged solid tile runs. A tile is solid when the walkable mask is 0. */
  solids: Rect[];
  /** Climbable vertical corridor runs, extended into their endpoint rooms. */
  ladders: Rect[];
  rooms: LevelRoom[];
  /** Reserved for the surface street in P3; always `null` in P1. */
  surfaceY: number | null;
}

export { buildDungeonLevel, DEFAULT_RENDER_SCALE } from './dungeonLevel';
