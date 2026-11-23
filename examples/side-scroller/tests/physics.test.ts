import { describe, expect, it } from 'vitest';
import { stepBody, type Body, type MoveIntent } from '../src/physics';
import type { LevelModel, Rect } from '../src/level/model';

const TILE = 24;
const BODY_W = 0.45 * TILE;
const BODY_H = 0.7 * TILE;

const idle: MoveIntent = { left: false, right: false, up: false, down: false, jump: false };
const right: MoveIntent = { ...idle, right: true };
const left: MoveIntent = { ...idle, left: true };
const up: MoveIntent = { ...idle, up: true };
const down: MoveIntent = { ...idle, down: true };

function testLevel(solids: Rect[] = [], ladders: Rect[] = []): LevelModel {
  return {
    subjectId: 'test',
    tileSize: TILE,
    bounds: { x: 0, y: 0, w: 480, h: 480 },
    spawn: { x: 100, y: 100 },
    solids,
    ladders,
    rooms: [],
    surfaceY: null,
  };
}

function bodyAt(x: number, y: number): Body {
  return { x, y, w: BODY_W, h: BODY_H, vx: 0, vy: 0, onGround: false, onLadder: false };
}

function run(
  body: Body,
  intent: MoveIntent,
  level: LevelModel,
  ms: number,
  frameMs = 1000 / 60,
): Body {
  let next = body;
  let remaining = ms;
  while (remaining > 0) {
    const delta = Math.min(frameMs, remaining);
    next = stepBody(next, intent, level, delta);
    remaining -= delta;
  }
  return next;
}

describe('stepBody', () => {
  it('falls and lands on a floor, reporting onGround', () => {
    const floor: Rect = { x: 0, y: 200, w: 480, h: TILE };
    const body = run(bodyAt(100, 0), idle, testLevel([floor]), 2000);

    expect(body.y + body.h).toBeCloseTo(200, 6);
    expect(body.onGround).toBe(true);
    expect(body.vy).toBe(0);
  });

  it('jumps two tiles and returns to the ground', () => {
    const floor: Rect = { x: 0, y: 200, w: 480, h: TILE };
    const level = testLevel([floor]);
    const start = bodyAt(100, 200 - BODY_H);
    start.onGround = true;

    let body = stepBody(start, { ...idle, jump: true }, level, 1000 / 60);
    let minY = body.y;
    for (let frame = 0; frame < 90; frame += 1) {
      body = stepBody(body, idle, level, 1000 / 60);
      minY = Math.min(minY, body.y);
    }

    const jumpTiles = (start.y - minY) / TILE;
    expect(jumpTiles).toBeGreaterThan(1.8);
    expect(jumpTiles).toBeLessThan(2.3);
    expect(body.y + body.h).toBeCloseTo(200, 6);
    expect(body.onGround).toBe(true);
  });

  it('does not tunnel through a one-tile floor at terminal velocity during a 100 ms frame', () => {
    const floor: Rect = { x: 0, y: 200, w: 480, h: TILE };
    const body = bodyAt(100, 200 - BODY_H - 4);
    body.vy = 18 * TILE;

    const next = stepBody(body, idle, testLevel([floor]), 100);

    expect(next.y + next.h).toBeLessThanOrEqual(200 + 1e-6);
    expect(next.onGround).toBe(true);
  });

  it('climbs a ladder upward and downward', () => {
    const ladder: Rect = { x: 160, y: 40, w: TILE, h: 320 };
    const level = testLevel([], [ladder]);
    const start = bodyAt(166, 200);

    const climbed = run(start, up, level, 500);
    expect(climbed.onLadder).toBe(true);
    expect(climbed.y).toBeLessThan(start.y - TILE);

    const descended = run(climbed, down, level, 400);
    expect(descended.y).toBeGreaterThan(climbed.y);
  });

  it('holds position on a ladder when no vertical input is held', () => {
    const ladder: Rect = { x: 160, y: 40, w: TILE, h: 320 };
    const level = testLevel([], [ladder]);
    const attached = run(bodyAt(166, 200), up, level, 200);

    const held = run(attached, idle, level, 700);
    expect(held.onLadder).toBe(true);
    expect(held.y).toBeCloseTo(attached.y, 6);
  });

  it('lets go of the ladder when jumping', () => {
    const ladder: Rect = { x: 160, y: 40, w: TILE, h: 320 };
    const level = testLevel([], [ladder]);
    const attached = run(bodyAt(166, 200), up, level, 200);

    const jumped = stepBody(attached, { ...idle, jump: true }, level, 1000 / 60);
    expect(jumped.onLadder).toBe(false);
    expect(jumped.vy).toBeLessThan(0);
  });

  it('cannot enter a solid from the right or from the left', () => {
    const wall: Rect = { x: 200, y: 0, w: TILE, h: 2000 };
    const floor: Rect = { x: 0, y: 300, w: 480, h: TILE };
    const level = testLevel([wall, floor]);

    const fromLeft = run(bodyAt(150, 100), right, level, 1500);
    expect(fromLeft.x + fromLeft.w).toBeLessThanOrEqual(200 + 1e-6);

    const fromRight = run(bodyAt(250, 100), left, level, 1500);
    expect(fromRight.x).toBeGreaterThanOrEqual(200 + TILE - 1e-6);
  });

  it('moves at a constant speed and stops when input is released', () => {
    const level = testLevel([{ x: 0, y: 400, w: 480, h: TILE }]);
    const start = bodyAt(50, 400 - BODY_H);
    start.onGround = true;

    const moved = run(start, right, level, 500);
    expect(moved.vx).toBeGreaterThan(0);
    const distance = moved.x - start.x;
    expect(distance).toBeGreaterThan(TILE);
    expect(distance).toBeLessThan(TILE * 2);

    const stopped = run(moved, idle, level, 500);
    expect(stopped.vx).toBe(0);
    expect(stopped.x).toBeCloseTo(moved.x, 6);
  });

  it('ignores non-finite and negative deltas', () => {
    const body = bodyAt(100, 100);
    expect(stepBody(body, idle, testLevel(), Number.NaN)).toEqual(body);
    expect(stepBody(body, idle, testLevel(), -5)).toEqual(body);
  });
});
