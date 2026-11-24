import { describe, expect, it } from 'vitest';
import { dungeon, tutorial } from '@/index';
import { buildDungeonLevel, DEFAULT_RENDER_SCALE } from '../src/level/model';
import { createPlayerBody, overlaps } from '../src/physics';
import type { LevelModel } from '../src/level/model';

const FIXED_NOW = '2026-11-23T12:00:00.000Z';

function tutorialLevel(scale?: number): LevelModel {
  return buildDungeonLevel(tutorial.createTutorialSubject(FIXED_NOW), scale);
}

function pointInRect(x: number, y: number, rect: { x: number; y: number; w: number; h: number }): boolean {
  return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
}

describe('buildDungeonLevel', () => {
  it('derives three stable tutorial rooms at the 3x render scale', () => {
    const level = tutorialLevel();

    expect(level.tileSize).toBe(24 * DEFAULT_RENDER_SCALE);
    expect(level.rooms.map((room) => room.roomId).sort()).toEqual(['tut-map', 'tut-note', 'tut-tools']);
    expect(level.rooms.find((room) => room.isRoot)?.roomId).toBe('tut-note');
    expect(level.rooms.find((room) => room.roomId === 'tut-tools')?.topic).toBe('Tools of the Trade');
    expect(level.surfaceY).toBeNull();
    expect(level.bounds.w).toBe(10 * level.tileSize);
    expect(level.bounds.h).toBe(27 * level.tileSize);
  });

  it('scales every world dimension with the render scale', () => {
    const base = tutorialLevel(1);
    const tripled = tutorialLevel(3);

    expect(tripled.tileSize).toBe(base.tileSize * 3);
    expect(tripled.bounds.w).toBe(base.bounds.w * 3);
    expect(tripled.bounds.h).toBe(base.bounds.h * 3);
    expect(tripled.spawn.x).toBeCloseTo(base.spawn.x * 3, 6);
    expect(tripled.spawn.y).toBeCloseTo(base.spawn.y * 3, 6);
  });

  it('keeps every room rect inside the level bounds', () => {
    const level = tutorialLevel();
    for (const room of level.rooms) {
      expect(room.rect.x).toBeGreaterThanOrEqual(level.bounds.x);
      expect(room.rect.y).toBeGreaterThanOrEqual(level.bounds.y);
      expect(room.rect.x + room.rect.w).toBeLessThanOrEqual(level.bounds.x + level.bounds.w);
      expect(room.rect.y + room.rect.h).toBeLessThanOrEqual(level.bounds.y + level.bounds.h);
    }
  });

  it('maps every engine door to a room perimeter tile', () => {
    const subject = tutorial.createTutorialSubject(FIXED_NOW);
    const map = dungeon.generateDungeonMap(subject.dungeon);
    const level = buildDungeonLevel(subject);

    expect(level.doors).toHaveLength(map.doors.length);
    expect(level.doors?.length).toBeGreaterThan(0);
    for (const door of level.doors ?? []) {
      const room = level.rooms.find((entry) => entry.roomId === door.roomId);
      expect(room, `room for ${door.roomId}`).toBeDefined();
      if (!room) continue;
      expect(door.rect.w).toBe(level.tileSize);
      expect(door.rect.h).toBe(level.tileSize);
      if (door.side === 'W') expect(door.rect.x).toBe(room.rect.x);
      if (door.side === 'E') {
        expect(door.rect.x + door.rect.w).toBe(room.rect.x + room.rect.w);
      }
      if (door.side === 'N') expect(door.rect.y).toBe(room.rect.y);
      if (door.side === 'S') {
        expect(door.rect.y + door.rect.h).toBe(room.rect.y + room.rect.h);
      }
    }
  });

  it('does not cover any room interior with a solid', () => {
    const level = tutorialLevel();
    for (const room of level.rooms) {
      const interior = {
        x: room.rect.x + 0.5,
        y: room.rect.y + 0.5,
        w: room.rect.w - 1,
        h: room.rect.h - 1,
      };
      const intruding = level.solids.filter((solid) => overlaps(interior, solid));
      expect(intruding, `solids inside ${room.roomId}`).toEqual([]);
    }
  });

  it('spawns a supported body inside the root room, clear of walls', () => {
    const level = tutorialLevel();
    const root = level.rooms.find((room) => room.isRoot);
    if (!root) throw new Error('Tutorial root room missing');

    const body = createPlayerBody(level);
    expect(body.x).toBeGreaterThan(root.rect.x);
    expect(body.x + body.w).toBeLessThan(root.rect.x + root.rect.w);
    expect(body.y + body.h).toBeCloseTo(level.spawn.y, 6);
    expect(level.solids.filter((solid) => overlaps(body, solid))).toEqual([]);

    // The feet rest on a solid row, not over the shaft opening at the room centre.
    const footX = body.x + body.w / 2;
    expect(level.solids.some((solid) => pointInRect(footX, body.y + body.h + 1, solid))).toBe(true);
  });

  it('turns every vertical corridor segment into a ladder that contains it', () => {
    const subject = tutorial.createTutorialSubject(FIXED_NOW);
    const map = dungeon.generateDungeonMap(subject.dungeon);
    const level = buildDungeonLevel(subject);
    const originX = map.bounds.minX;
    const originY = map.bounds.minY;

    const verticalSegments = map.corridors.flatMap((corridor) =>
      corridor.segments.filter((segment) => segment.orientation === 'v'),
    );
    expect(verticalSegments.length).toBeGreaterThan(0);

    for (const segment of verticalSegments) {
      const x = (segment.x1 - originX + 0.5) * level.tileSize;
      const midY = ((Math.min(segment.y1, segment.y2) + Math.max(segment.y1, segment.y2)) / 2 - originY + 0.5) *
        level.tileSize;
      expect(level.ladders.some((ladder) => pointInRect(x, midY, ladder)), `ladder for x=${segment.x1}`).toBe(
        true,
      );
    }
  });

  it('extends ladders into both endpoint rooms so floors are reachable', () => {
    const level = tutorialLevel();
    const root = level.rooms.find((room) => room.roomId === 'tut-note');
    const tools = level.rooms.find((room) => room.roomId === 'tut-tools');
    const map = level.rooms.find((room) => room.roomId === 'tut-map');
    if (!root || !tools || !map) throw new Error('Tutorial rooms missing');

    const reachesRoomFloor = (room: typeof root) =>
      level.ladders.some((ladder) => {
        const overlapsRoom = overlaps(room.rect, ladder);
        return overlapsRoom && ladder.y + ladder.h >= room.rect.y + room.rect.h - level.tileSize;
      });

    expect(reachesRoomFloor(tools), 'ladder reaches the lower room floor').toBe(true);
    expect(reachesRoomFloor(root), 'ladder crosses the root room').toBe(true);
    expect(reachesRoomFloor(map), 'ladder reaches the upper room').toBe(true);
  });

  it('merges ladders that share a column instead of stacking duplicates', () => {
    const level = tutorialLevel();
    const columns = new Map<string, number>();
    for (const ladder of level.ladders) {
      const key = `${ladder.x}:${ladder.w}`;
      columns.set(key, (columns.get(key) ?? 0) + 1);
    }
    for (const count of columns.values()) expect(count).toBe(1);
  });
});
