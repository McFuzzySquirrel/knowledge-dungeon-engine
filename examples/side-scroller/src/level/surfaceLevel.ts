import type { village } from '@/index';
import type { CollisionWorld, LevelModel, LevelRoom, Rect } from './model';

/**
 * Side-view surface street derived from the engine's top-down `VILLAGE_MAP`.
 *
 * Presentation mapping (P3, documented because the engine data is top-down):
 *
 * | Engine field             | Side-view use                                      |
 * |--------------------------|----------------------------------------------------|
 * | `structure.gridX`        | street x intent, spread to `gridX × tileSize × 1.6` and pushed right by a minimum gap so buildings do not overlap |
 * | `structure.gridY`        | depth ordering only, never vertical position       |
 * | `structure.width`        | facade width (`width × tileSize`)                  |
 * | `structure.height`       | facade height, clamped to 1…4 tiles                |
 * | `structure.label`        | facade sign and interaction prompt                 |
 * | `playerStart.x`          | surface spawn x                                    |
 * | `entranceTile.x`         | fallback entrance shaft x when no Training Gate exists; otherwise the shaft follows the Training Gate door |
 * | `playerStart.y`, `entranceTile.y` | unused in side view                       |
 *
 * Facades are background presentation. The street ground is the only collision
 * surface, so the player can walk freely in front of every building. This was
 * changed after playtest feedback: making building bodies solid trapped the
 * spawn inside the Training Grounds doorway.
 *
 * The village tile size is the caller's `map.tileSize`. The host passes the
 * placed dungeon's tile size so the surface and the dungeon share one world
 * pixel grid; the raw `VILLAGE_TILE_SIZE` is never mutated.
 */

/** Ground line, in surface rows from the top of the street. */
const GROUND_ROW = 8;
/** Surface-only world height; the dungeon is appended below this in P3-T2. */
const SURFACE_ROWS = 10;
const MIN_FACADE_HEIGHT_TILES = 1;
const MAX_FACADE_HEIGHT_TILES = 4;
const DOOR_WIDTH_TILES = 1;
const DOOR_HEIGHT_TILES = 2;
const INTERACTION_WIDTH_TILES = 2.4;
const INTERACTION_HEIGHT_TILES = 1.5;
/** Spread the top-down grid horizontally so the side-view street reads openly. */
const SURFACE_X_SPREAD = 1.6;
/** Minimum gap between two building facades, in tiles. */
const BUILDING_GAP_TILES = 3;
/** Left margin before the first building, in tiles. */
const BUILDING_MARGIN_TILES = 2;

/** Scenery is drawn but never blocks the street or offers an interaction. */
const SCENERY_TYPES: ReadonlySet<string> = new Set([
  'tree',
  'bush',
  'flower',
  'rock',
  'torch',
  'bench',
  'signpost',
  'waysign',
  'pond',
  'gate',
]);

export interface SurfaceFacade {
  id: string;
  type: string;
  label: string;
  subjectId?: string;
  subjectName?: string;
  roomCount?: number;
  clearedCount?: number;
  /** `gridY` from the engine data; larger values draw in front. */
  depth: number;
  /** Drawn building rectangle. */
  rect: Rect;
  /** Doorway drawing and interaction anchor. */
  door: { x: number; y: number; w: number; h: number };
  /** Whether the facade is drawn as a building body rather than scenery. */
  building: boolean;
  /** Scenery only; never offered as an interaction. */
  interactive: boolean;
}

/** P3 frozen interface, extended with the structure fields P3-T5 displays. */
export interface SurfaceInteractable {
  id: string;
  type: string;
  label: string;
  subjectId?: string;
  subjectName?: string;
  roomCount?: number;
  clearedCount?: number;
  /** Interaction rect in world pixels. */
  rect: Rect;
  /** Drawn building rect. */
  facade: Rect;
  door: { x: number; y: number };
  depth: number;
}

export interface SurfaceModel extends CollisionWorld {
  /** One street tile in world pixels. */
  tileSize: number;
  spawn: { x: number; y: number };
  groundY: number;
  facades: SurfaceFacade[];
  interactables: SurfaceInteractable[];
  /** Top of the entrance shaft to the dungeon. */
  entrance: { x: number; y: number };
  /** Surface area whose entry ends the study session and returns to the village. */
  exitZone: Rect;
}

interface BodyRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function translate(rect: Rect, dx: number, dy: number): Rect {
  return { x: rect.x + dx, y: rect.y + dy, w: rect.w, h: rect.h };
}

function unionRect(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.w, b.x + b.w);
  const bottom = Math.max(a.y + a.h, b.y + b.h);
  return { x, y, w: right - x, h: bottom - y };
}

function facadeHeight(structure: village.VillageStructure, tilePx: number): number {
  const rows = clamp(structure.height, MIN_FACADE_HEIGHT_TILES, MAX_FACADE_HEIGHT_TILES);
  return rows * tilePx;
}

function facadeDoor(structure: village.VillageStructure, rect: Rect, tilePx: number): SurfaceFacade['door'] {
  const width = Math.min(tilePx * DOOR_WIDTH_TILES, rect.w * 0.7);
  const height = Math.min(tilePx * DOOR_HEIGHT_TILES, rect.h);
  return {
    x: rect.x + (rect.w - width) / 2,
    y: rect.y + rect.h - height,
    w: width,
    h: height,
  };
}

function interactionRect(door: SurfaceFacade['door'], bounds: Rect, groundY: number, tilePx: number): Rect {
  const width = Math.min(tilePx * INTERACTION_WIDTH_TILES, bounds.w);
  const height = Math.min(tilePx * INTERACTION_HEIGHT_TILES, groundY - bounds.y);
  const centre = door.x + door.w / 2;
  const x = clamp(centre - width / 2, bounds.x, bounds.x + bounds.w - width);
  return { x, y: groundY - height, w: width, h: height };
}

function bodyRect(centreX: number, groundY: number, tilePx: number): BodyRect {
  const w = tilePx * 0.45;
  const h = tilePx * 0.7;
  return { x: centreX - w / 2, y: groundY - h, w, h };
}

/** Pick a spawn near `playerStart.x` whose body is clear of every solid. */
function findSpawnX(
  preferredX: number,
  groundY: number,
  tilePx: number,
  bounds: Rect,
  solids: readonly Rect[],
): number {
  const minX = bounds.x + tilePx * 0.25;
  const maxX = bounds.x + bounds.w - tilePx * 0.25;
  const offsets = [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2, -2, 3, -3, 4, -4, 6, -6];

  for (const offset of offsets) {
    const centre = clamp(preferredX + offset * tilePx, minX, maxX);
    const candidate = bodyRect(centre, groundY, tilePx);
    if (!solids.some((solid) => overlaps(candidate, solid))) return centre;
  }
  return clamp(preferredX, minX, maxX);
}

interface FacadeLayout {
  rect: Rect;
  building: boolean;
}

function isBuilding(structure: village.VillageStructure): boolean {
  return !SCENERY_TYPES.has(structure.type);
}

/**
 * Spread buildings along the street instead of copying the top-down grid.
 *
 * Buildings keep their `gridX` order, are shifted right by at least
 * `BUILDING_GAP_TILES`, and never overlap. Scenery stays near its spread grid
 * x so trees, ponds, and flowers still frame the buildings. This is a
 * presentation layout: no engine data is mutated.
 */
function layoutFacades(
  structures: village.VillageStructure[],
  tilePx: number,
  groundY: number,
): Map<string, FacadeLayout> {
  const layout = new Map<string, FacadeLayout>();
  const buildings = structures
    .filter(isBuilding)
    .sort((a, b) => a.gridX - b.gridX || a.gridY - b.gridY || a.id.localeCompare(b.id));

  let cursor = tilePx * BUILDING_MARGIN_TILES;
  for (const structure of buildings) {
    const h = facadeHeight(structure, tilePx);
    const w = Math.max(tilePx * 0.5, structure.width * tilePx);
    const desired = Math.round(structure.gridX * tilePx * SURFACE_X_SPREAD);
    const x = Math.max(desired, cursor);
    layout.set(structure.id, { rect: { x, y: groundY - h, w, h }, building: true });
    cursor = x + w + tilePx * BUILDING_GAP_TILES;
  }

  for (const structure of structures) {
    if (layout.has(structure.id)) continue;
    const h = facadeHeight(structure, tilePx);
    const w = Math.max(tilePx * 0.5, structure.width * tilePx);
    const x = Math.round(structure.gridX * tilePx * SURFACE_X_SPREAD);
    layout.set(structure.id, { rect: { x, y: groundY - h, w, h }, building: false });
  }

  return layout;
}

/**
 * Derive the side-view street. Every structure produces exactly one facade;
 * only labelled structures become interactables. The ground is the only
 * collision surface: facades are background, so the player can walk freely
 * past every building.
 */
export function buildSurface(
  structures: village.VillageStructure[],
  map: village.VillageMapDef,
): SurfaceModel {
  const tilePx = map.tileSize;
  const groundY = GROUND_ROW * tilePx;
  const layout = layoutFacades(structures, tilePx, groundY);
  const maxRight = Math.max(
    0,
    ...[...layout.values()].map(({ rect }) => rect.x + rect.w),
  );
  const bounds: Rect = {
    x: 0,
    y: 0,
    w: Math.max(map.width * tilePx * SURFACE_X_SPREAD, maxRight + tilePx * 2),
    h: SURFACE_ROWS * tilePx,
  };
  const solids: Rect[] = [
    { x: bounds.x, y: groundY, w: bounds.w, h: tilePx },
    // Invisible world edges keep the player on the street; the camera clamps
    // to the same bounds.
    { x: bounds.x - tilePx, y: bounds.y, w: tilePx, h: bounds.h },
    { x: bounds.x + bounds.w, y: bounds.y, w: tilePx, h: bounds.h },
  ];
  const facades: SurfaceFacade[] = structures.map((structure) => {
    const placed = layout.get(structure.id);
    if (!placed) throw new Error(`Missing facade layout for ${structure.id}`);
    return {
      id: structure.id,
      type: structure.type,
      label: structure.label,
      subjectId: structure.subjectId,
      subjectName: structure.subjectName,
      roomCount: structure.roomCount,
      clearedCount: structure.clearedCount,
      depth: structure.gridY,
      rect: placed.rect,
      door: facadeDoor(structure, placed.rect, tilePx),
      building: placed.building,
      interactive: structure.label.trim().length > 0,
    };
  });

  const interactables: SurfaceInteractable[] = facades
    .filter((facade) => facade.interactive)
    .map((facade) => ({
      id: facade.id,
      type: facade.type,
      label: facade.label,
      subjectId: facade.subjectId,
      subjectName: facade.subjectName,
      roomCount: facade.roomCount,
      clearedCount: facade.clearedCount,
      rect: interactionRect(facade.door, bounds, groundY, tilePx),
      facade: facade.rect,
      door: { x: facade.door.x + facade.door.w / 2, y: groundY },
      depth: facade.depth,
    }));

  const trainingGate = structures.find((structure) => structure.type === 'training-gate');
  const trainingGateRect = trainingGate ? layout.get(trainingGate.id)?.rect : undefined;
  const trainingGateDoor = trainingGate && trainingGateRect
    ? facadeDoor(trainingGate, trainingGateRect, tilePx)
    : undefined;
  const entranceX = trainingGateDoor
    ? trainingGateDoor.x
    : map.entranceTile.x * tilePx * SURFACE_X_SPREAD;

  // Spawn in front of the Training Grounds door when it exists; otherwise use
  // the engine player start. The door is the intended first interaction.
  const spawnX = findSpawnX(
    trainingGateDoor
      ? trainingGateDoor.x + trainingGateDoor.w / 2
      : map.playerStart.x * tilePx * SURFACE_X_SPREAD + tilePx / 2,
    groundY,
    tilePx,
    bounds,
    solids,
  );

  const gateStructure = structures.find((structure) => structure.type === 'gate');
  const gateRect = gateStructure ? layout.get(gateStructure.id)?.rect : undefined;
  const entranceZone: Rect = {
    x: entranceX - tilePx,
    y: groundY - tilePx,
    w: tilePx * 3,
    h: tilePx,
  };
  // The return zone must always cover the shaft top; the decorative gate is
  // unioned in so its whole threshold also ends the session.
  const exitZone: Rect = gateRect
    ? unionRect(
        {
          x: gateRect.x - tilePx * 0.5,
          y: groundY - tilePx,
          w: gateRect.w + tilePx,
          h: tilePx,
        },
        entranceZone,
      )
    : entranceZone;

  return {
    tileSize: tilePx,
    bounds,
    solids,
    ladders: [],
    spawn: { x: spawnX, y: groundY },
    groundY,
    facades,
    interactables,
    entrance: { x: entranceX, y: groundY },
    exitZone,
  };
}

/** Squared distance from a point to a rect; zero when the point is inside. */
function distanceSqToRect(x: number, y: number, rect: Rect): number {
  const dx = x < rect.x ? rect.x - x : x > rect.x + rect.w ? x - (rect.x + rect.w) : 0;
  const dy = y < rect.y ? rect.y - y : y > rect.y + rect.h ? y - (rect.y + rect.h) : 0;
  return dx * dx + dy * dy;
}

/** The closest labelled facade, or `null` when nothing is within `rangePx`. */
export function findNearestInteractable(
  surface: SurfaceModel,
  point: { x: number; y: number },
  rangePx: number = surface.tileSize * 0.6,
): SurfaceInteractable | null {
  let best: SurfaceInteractable | null = null;
  let bestDistance = rangePx * rangePx;

  for (const interactable of surface.interactables) {
    const distance = distanceSqToRect(point.x, point.y, interactable.rect);
    if (distance <= bestDistance) {
      best = interactable;
      bestDistance = distance;
    }
  }
  return best;
}

/** Remove `hole` from `rect`, returning up to four non-overlapping pieces. */
function subtractRect(rect: Rect, hole: Rect): Rect[] {
  if (!overlaps(rect, hole)) return [rect];

  const left = Math.max(rect.x, hole.x);
  const right = Math.min(rect.x + rect.w, hole.x + hole.w);
  const top = Math.max(rect.y, hole.y);
  const bottom = Math.min(rect.y + rect.h, hole.y + hole.h);
  const pieces: Rect[] = [];

  if (top > rect.y) pieces.push({ x: rect.x, y: rect.y, w: rect.w, h: top - rect.y });
  if (bottom < rect.y + rect.h) {
    pieces.push({ x: rect.x, y: bottom, w: rect.w, h: rect.y + rect.h - bottom });
  }
  if (left > rect.x) pieces.push({ x: rect.x, y: top, w: left - rect.x, h: bottom - top });
  if (right < rect.x + rect.w) {
    pieces.push({ x: right, y: top, w: rect.x + rect.w - right, h: bottom - top });
  }
  return pieces.filter((piece) => piece.w > 0 && piece.h > 0);
}

function subtractRectList(rects: readonly Rect[], hole: Rect): Rect[] {
  return rects.flatMap((rect) => subtractRect(rect, hole));
}

/** Merge touching ladders that share a column so a shaft is not drawn twice. */
function mergeLadders(rects: readonly Rect[]): Rect[] {
  const sorted = [...rects].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const merged: Rect[] = [];

  for (const rect of sorted) {
    const last = merged[merged.length - 1];
    if (last && last.x === rect.x && last.w === rect.w && rect.y <= last.y + last.h) {
      last.h = Math.max(last.y + last.h, rect.y + rect.h) - last.y;
      continue;
    }
    merged.push({ ...rect });
  }
  return merged;
}

function translateRoom(room: LevelRoom, dx: number, dy: number): LevelRoom {
  return { ...room, rect: translate(room.rect, dx, dy) };
}

/**
 * Place the P1 dungeon below the surface street and carve a continuous shaft.
 *
 * The dungeon is translated horizontally so its top-most ladder column meets
 * `surface.entrance.x`, and vertically so its highest room starts
 * `shaftHeightPx` below `surface.groundY`. The returned level is one collision
 * world: surface ground and facades, the translated dungeon, and a ladder from
 * the street down into the top dungeon room.
 */
export function placeDungeonBelow(
  level: LevelModel,
  surface: SurfaceModel,
  shaftHeightPx: number,
): LevelModel {
  if (level.rooms.length === 0) throw new Error('Cannot place a dungeon level with no rooms');

  const topRoom = level.rooms.reduce((top, room) => (room.rect.y < top.rect.y ? room : top));
  const topLadder = level.ladders.reduce<Rect | null>(
    (top, ladder) => (top === null || ladder.y < top.y ? ladder : top),
    null,
  );
  const shaftColumnX = topLadder ? topLadder.x : topRoom.rect.x + topRoom.rect.w / 2 - level.tileSize / 2;
  const dx = surface.entrance.x - shaftColumnX;
  const dy = surface.groundY + shaftHeightPx - topRoom.rect.y;

  const dungeonBounds = translate(level.bounds, dx, dy);
  const dungeonRooms = level.rooms.map((room) => translateRoom(room, dx, dy));
  const placedTopRoom = dungeonRooms.reduce((top, room) => (room.rect.y < top.rect.y ? room : top));
  const dungeonSolids = level.solids.map((solid) => translate(solid, dx, dy));
  const dungeonLadders = level.ladders.map((ladder) => translate(ladder, dx, dy));
  const spawn = { x: level.spawn.x + dx, y: level.spawn.y + dy };

  const shaftTop = surface.groundY;
  const shaftBottom = placedTopRoom.rect.y + placedTopRoom.rect.h;
  const shaft: Rect = {
    x: surface.entrance.x,
    y: shaftTop,
    w: level.tileSize,
    h: Math.max(level.tileSize, shaftBottom - shaftTop),
  };
  // Open only the ground and the rock directly above/into the top room; the
  // room floor and its existing ladder opening stay untouched.
  const opening: Rect = {
    x: shaft.x,
    y: shaft.y,
    w: shaft.w,
    h: Math.max(level.tileSize, placedTopRoom.rect.y + level.tileSize - shaft.y),
  };

  const left = Math.min(surface.bounds.x, dungeonBounds.x);
  const top = Math.min(surface.bounds.y, dungeonBounds.y);
  const right = Math.max(surface.bounds.x + surface.bounds.w, dungeonBounds.x + dungeonBounds.w);
  const bottom = Math.max(surface.bounds.y + surface.bounds.h, dungeonBounds.y + dungeonBounds.h);

  return {
    subjectId: level.subjectId,
    tileSize: level.tileSize,
    bounds: { x: left, y: top, w: right - left, h: bottom - top },
    spawn,
    solids: [
      ...subtractRectList(surface.solids, opening),
      ...subtractRectList(dungeonSolids, opening),
    ],
    ladders: mergeLadders([...surface.ladders, ...dungeonLadders, shaft]),
    rooms: dungeonRooms,
    surfaceY: surface.groundY,
  };
}

/**
 * Where a player enters the dungeon when they walked down the shaft rather
 * than through a portal command. The top room's floor is the shaft bottom.
 */
export function shaftBottomSpawn(level: LevelModel, surface: SurfaceModel): { x: number; y: number } {
  const topRoom = level.rooms.reduce<LevelRoom | null>(
    (top, room) => (top === null || room.rect.y < top.rect.y ? room : top),
    null,
  );
  if (!topRoom) return { x: surface.entrance.x + level.tileSize / 2, y: surface.groundY };
  return {
    x: surface.entrance.x + level.tileSize / 2,
    y: topRoom.rect.y + topRoom.rect.h,
  };
}
