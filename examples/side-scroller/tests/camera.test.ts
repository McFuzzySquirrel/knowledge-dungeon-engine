import { describe, expect, it } from 'vitest';
import { createCamera, updateCamera } from '../src/render/canvas';
import type { LevelModel } from '../src/level/model';
import type { Body } from '../src/physics';

function level(bounds: LevelModel['bounds']): LevelModel {
  return {
    subjectId: 'test',
    tileSize: 72,
    bounds,
    spawn: { x: 0, y: 0 },
    solids: [],
    ladders: [],
    rooms: [],
    surfaceY: null,
  };
}

function body(x: number, y: number): Body {
  return { x, y, w: 32, h: 50, vx: 0, vy: 0, onGround: true, onLadder: false };
}

describe('updateCamera', () => {
  it('frames the player centre horizontally and 60% down vertically', () => {
    const camera = { x: 0, y: 0, w: 800, h: 600 };
    updateCamera(camera, body(1000, 1000), level({ x: 0, y: 0, w: 2000, h: 2000 }), 16, true);

    expect(camera.x).toBeCloseTo(1016 - 400, 6);
    expect(camera.y).toBeCloseTo(1025 - 360, 6);
  });

  it('clamps to the level bounds instead of showing empty space', () => {
    const camera = { x: 0, y: 0, w: 800, h: 600 };
    updateCamera(camera, body(-100, -100), level({ x: 0, y: 0, w: 2000, h: 2000 }), 16, true);
    expect(camera.x).toBe(0);
    expect(camera.y).toBe(0);

    updateCamera(camera, body(1900, 1900), level({ x: 0, y: 0, w: 2000, h: 2000 }), 16, true);
    expect(camera.x).toBeCloseTo(1200, 6);
    expect(camera.y).toBeCloseTo(1400, 6);
  });

  it('centres a world smaller than the viewport', () => {
    const camera = { x: 0, y: 0, w: 800, h: 600 };
    updateCamera(camera, body(10, 10), level({ x: 0, y: 0, w: 400, h: 300 }), 16, true);

    expect(camera.x).toBeCloseTo((400 - 800) / 2, 6);
    expect(camera.y).toBeCloseTo((300 - 600) / 2, 6);
  });

  it('smooths when motion is allowed and snaps when it is reduced', () => {
    const smooth = { x: 0, y: 0, w: 800, h: 600 };
    updateCamera(smooth, body(1000, 1000), level({ x: 0, y: 0, w: 2000, h: 2000 }), 90, false);
    expect(smooth.x).toBeGreaterThan(0);
    expect(smooth.x).toBeLessThan(616);

    const snapped = { x: 0, y: 0, w: 800, h: 600 };
    updateCamera(snapped, body(1000, 1000), level({ x: 0, y: 0, w: 2000, h: 2000 }), 0, true);
    expect(snapped.x).toBeCloseTo(616, 6);
  });

  it('ignores a zero delta and non-finite input', () => {
    const camera = { x: 5, y: 7, w: 800, h: 600 };
    updateCamera(camera, body(1000, 1000), level({ x: 0, y: 0, w: 2000, h: 2000 }), 0, false);
    expect(camera).toEqual({ x: 5, y: 7, w: 800, h: 600 });

    updateCamera(camera, body(Number.NaN, 1000), level({ x: 0, y: 0, w: 2000, h: 2000 }), 16, false);
    expect(camera).toEqual({ x: 5, y: 7, w: 800, h: 600 });
  });

  it('creates a usable default camera', () => {
    const camera = createCamera();
    expect(camera.w).toBeGreaterThan(0);
    expect(camera.h).toBeGreaterThan(0);
  });
});
