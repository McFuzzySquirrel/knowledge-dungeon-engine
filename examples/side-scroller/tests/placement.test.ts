import { describe, expect, it } from 'vitest';
import { tutorial, village } from '@/index';
import { buildDungeonLevel, DEFAULT_TILE_SIZE } from '../src/level/model';
import { buildSurface, placeDungeonBelow, shaftBottomSpawn } from '../src/level/surfaceLevel';
import { createPlayerBody, overlaps } from '../src/physics';

const FIXED_NOW = '2026-11-23T12:00:00.000Z';
const SHAFT_HEIGHT = 4 * DEFAULT_TILE_SIZE;

const MAP: village.VillageMapDef = { ...village.VILLAGE_MAP, tileSize: DEFAULT_TILE_SIZE };

function buildPlaced() {
  const subject = tutorial.createTutorialSubject(FIXED_NOW);
  const dungeon = buildDungeonLevel(subject);
  const surface = buildSurface(village.VILLAGE_MAP.structures, MAP);
  const placed = placeDungeonBelow(dungeon, surface, SHAFT_HEIGHT);
  return { dungeon, surface, placed };
}

function topRoom<T extends { rect: { y: number } }>(rooms: T[]): T {
  return rooms.reduce((top, room) => (room.rect.y < top.rect.y ? room : top));
}

describe('placeDungeonBelow', () => {
  it('puts the highest dungeon room exactly one shaft below the street', () => {
    const { surface, placed } = buildPlaced();
    const highest = topRoom(placed.rooms);

    expect(highest.rect.y).toBeCloseTo(surface.groundY + SHAFT_HEIGHT, 6);
    for (const room of placed.rooms) {
      expect(room.rect.y).toBeGreaterThan(surface.groundY);
    }
    expect(placed.surfaceY).toBe(surface.groundY);
  });

  it('keeps the dungeon ceiling below the surface ground', () => {
    const { surface, placed } = buildPlaced();
    const highest = topRoom(placed.rooms);
    const centreX = highest.rect.x + highest.rect.w / 2;
    const ceilings = placed.solids.filter(
      (solid) =>
        solid.x <= centreX &&
        solid.x + solid.w >= centreX &&
        Math.abs(solid.y + solid.h - highest.rect.y) < 1e-6,
    );

    expect(ceilings.length).toBeGreaterThan(0);
    expect(Math.min(...ceilings.map((solid) => solid.y))).toBeGreaterThan(surface.groundY);
  });

  it('aligns a continuous ladder shaft from the entrance into the top room', () => {
    const { surface, placed } = buildPlaced();
    const highest = topRoom(placed.rooms);
    const shaft = placed.ladders.find(
      (ladder) => Math.abs(ladder.x - surface.entrance.x) < 1e-6 && ladder.w === placed.tileSize,
    );

    expect(shaft).toBeDefined();
    expect(shaft?.y).toBeLessThanOrEqual(surface.groundY + 1e-6);
    expect((shaft?.y ?? 0) + (shaft?.h ?? 0)).toBeGreaterThanOrEqual(
      highest.rect.y + placed.tileSize,
    );

    // The shaft opening is real: the street ground is carved at the entrance.
    const holeX = surface.entrance.x + placed.tileSize / 2;
    const holeY = surface.groundY + placed.tileSize / 2;
    expect(
      placed.solids.some(
        (solid) =>
          holeX >= solid.x && holeX < solid.x + solid.w && holeY >= solid.y && holeY < solid.y + solid.h,
      ),
    ).toBe(false);
  });

  it('leaves the translated root spawn clear of solids', () => {
    const { placed } = buildPlaced();
    const body = createPlayerBody(placed);

    expect(placed.solids.filter((solid) => overlaps(body, solid))).toEqual([]);
    expect(body.y + body.h).toBeCloseTo(placed.spawn.y, 6);
  });

  it('extends the combined bounds to include street and dungeon', () => {
    const { surface, placed } = buildPlaced();

    expect(placed.bounds.y).toBeLessThanOrEqual(surface.bounds.y);
    expect(placed.bounds.x).toBeLessThanOrEqual(surface.bounds.x);
    expect(placed.bounds.y + placed.bounds.h).toBeGreaterThanOrEqual(surface.bounds.y + surface.bounds.h);
    for (const room of placed.rooms) {
      expect(room.rect.y + room.rect.h).toBeLessThanOrEqual(placed.bounds.y + placed.bounds.h);
    }
  });

  it('reports the top room floor as the shaft bottom spawn', () => {
    const { surface, placed } = buildPlaced();
    const highest = topRoom(placed.rooms);

    expect(shaftBottomSpawn(placed, surface)).toEqual({
      x: surface.entrance.x + placed.tileSize / 2,
      y: highest.rect.y + highest.rect.h,
    });
  });

  it('keeps the shaft continuous with the ladder down to the root room', () => {
    const { surface, placed } = buildPlaced();
    const root = placed.rooms.find((room) => room.isRoot);
    if (!root) throw new Error('Root room missing');
    const columnX = surface.entrance.x + placed.tileSize / 2;

    const onColumn = placed.ladders
      .filter((ladder) => ladder.x <= columnX && ladder.x + ladder.w >= columnX)
      .sort((a, b) => a.y - b.y);

    let reached = surface.groundY;
    for (const ladder of onColumn) {
      if (ladder.y <= reached + 1) reached = Math.max(reached, ladder.y + ladder.h);
    }

    expect(reached).toBeGreaterThanOrEqual(root.rect.y + placed.tileSize);
  });
});
