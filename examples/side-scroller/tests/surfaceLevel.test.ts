import { describe, expect, it } from 'vitest';
import type { village } from '@/index';
import { village as villageData } from '@/index';
import { DEFAULT_TILE_SIZE } from '../src/level/model';
import {
  buildSurface,
  findNearestInteractable,
  type SurfaceModel,
} from '../src/level/surfaceLevel';
import { bodyDimensions, overlaps } from '../src/physics';

const MAP: village.VillageMapDef = { ...villageData.VILLAGE_MAP, tileSize: DEFAULT_TILE_SIZE };

const STRUCTURES: village.VillageStructure[] = [
  {
    id: 'training-gate',
    type: 'training-gate',
    label: 'Training Grounds',
    gridX: 4,
    gridY: 5,
    width: 3,
    height: 3,
  },
  {
    id: 'portal-biology',
    type: 'portal-icon',
    label: 'Biology',
    gridX: 12,
    gridY: 3,
    width: 2,
    height: 3,
    subjectId: 'subject-biology',
    subjectName: 'Biology',
    roomCount: 6,
    clearedCount: 2,
  },
  {
    id: 'guild-hall',
    type: 'guild-hall',
    label: 'Guild Hall',
    gridX: 30,
    gridY: 10,
    width: 3,
    height: 3,
  },
  {
    id: 'tree-1',
    type: 'tree',
    label: '',
    gridX: 0,
    gridY: 1,
    width: 1,
    height: 1,
  },
];

function surface(): SurfaceModel {
  return buildSurface(STRUCTURES, MAP);
}

describe('buildSurface', () => {
  it('produces exactly one facade per engine structure, in every case', () => {
    expect(surface().facades).toHaveLength(STRUCTURES.length);

    const real = buildSurface(villageData.VILLAGE_MAP.structures, villageData.VILLAGE_MAP);
    expect(real.facades).toHaveLength(villageData.VILLAGE_MAP.structures.length);
  });

  it('keeps every interaction rect inside the surface bounds', () => {
    const model = surface();
    for (const interactable of model.interactables) {
      expect(interactable.rect.x).toBeGreaterThanOrEqual(model.bounds.x);
      expect(interactable.rect.y).toBeGreaterThanOrEqual(model.bounds.y);
      expect(interactable.rect.x + interactable.rect.w).toBeLessThanOrEqual(
        model.bounds.x + model.bounds.w,
      );
      expect(interactable.rect.y + interactable.rect.h).toBeLessThanOrEqual(
        model.bounds.y + model.bounds.h,
      );
    }
  });

  it('spawns a body on the ground and clear of every solid', () => {
    const model = surface();
    const { w, h } = bodyDimensions(model.tileSize);
    const body = { x: model.spawn.x - w / 2, y: model.spawn.y - h, w, h };

    expect(model.solids.filter((solid) => overlaps(body, solid))).toEqual([]);
    expect(model.spawn.y).toBe(model.groundY);
    expect(model.spawn.x).toBeGreaterThan(model.bounds.x);
    expect(model.spawn.x).toBeLessThan(model.bounds.x + model.bounds.w);
  });

  it('keeps a portal structure subjectId and label', () => {
    const portal = surface().interactables.find((entry) => entry.id === 'portal-biology');

    expect(portal?.label).toBe('Biology');
    expect(portal?.subjectId).toBe('subject-biology');
    expect(portal?.subjectName).toBe('Biology');
    expect(portal?.roomCount).toBe(6);
    expect(portal?.clearedCount).toBe(2);
  });

  it('treats an unlabelled structure as scenery only', () => {
    const model = surface();
    const tree = model.facades.find((facade) => facade.id === 'tree-1');

    expect(tree).toBeDefined();
    expect(tree?.interactive).toBe(false);
    expect(model.interactables.some((entry) => entry.id === 'tree-1')).toBe(false);
  });

  it('uses gridY only for depth ordering', () => {
    const model = surface();
    for (const facade of model.facades) {
      const source = STRUCTURES.find((structure) => structure.id === facade.id);
      expect(facade.depth).toBe(source?.gridY);
      expect(facade.rect.y).toBeLessThan(model.groundY);
    }
  });

  it('keeps facades out of collision so the street is walkable', () => {
    const model = surface();
    const gate = model.facades.find((facade) => facade.id === 'training-gate');
    if (!gate) throw new Error('Training gate missing');
    const playerBand = {
      x: gate.rect.x - model.tileSize * 2,
      y: model.groundY - model.tileSize * 0.7,
      w: gate.rect.w + model.tileSize * 4,
      h: model.tileSize * 0.7,
    };

    expect(model.solids.filter((solid) => overlaps(playerBand, solid))).toEqual([]);
  });

  it('has invisible edges that keep the player on the street', () => {
    const model = surface();
    const leftEdge = model.solids.find((solid) => Math.abs(solid.x + solid.w - model.bounds.x) < 1e-6);
    const rightEdge = model.solids.find(
      (solid) => Math.abs(solid.x - (model.bounds.x + model.bounds.w)) < 1e-6,
    );

    expect(leftEdge).toBeDefined();
    expect(rightEdge).toBeDefined();
  });

  it('spaces building facades with a real gap', () => {
    const model = surface();
    const buildings = model.facades
      .filter((facade) => facade.building)
      .sort((a, b) => a.rect.x - b.rect.x);

    expect(buildings.length).toBeGreaterThan(1);
    for (let index = 1; index < buildings.length; index += 1) {
      const previous = buildings[index - 1];
      const current = buildings[index];
      const gap = current.rect.x - (previous.rect.x + previous.rect.w);
      expect(gap, `${previous.id} → ${current.id}`).toBeGreaterThanOrEqual(model.tileSize * 1.5);
    }
  });

  it('aligns the entrance shaft with the Training Grounds door', () => {
    const model = surface();
    const gate = model.facades.find((facade) => facade.id === 'training-gate');
    if (!gate) throw new Error('Training gate missing');

    expect(model.entrance.x).toBeCloseTo(gate.door.x, 6);
  });

  it('spawns in front of the Training Grounds door', () => {
    const model = surface();
    const gate = model.facades.find((facade) => facade.id === 'training-gate');
    if (!gate) throw new Error('Training gate missing');

    expect(model.spawn.x).toBeCloseTo(gate.door.x + gate.door.w / 2, 6);
  });

  it('covers the entrance shaft with the return zone', () => {
    const model = surface();

    expect(model.exitZone.x).toBeLessThanOrEqual(model.entrance.x);
    expect(model.exitZone.x + model.exitZone.w).toBeGreaterThanOrEqual(
      model.entrance.x + model.tileSize,
    );
  });

  it('finds the nearest interactable and ignores scenery', () => {
    const model = surface();
    const gate = model.facades.find((facade) => facade.id === 'training-gate');
    if (!gate) throw new Error('Training gate missing');

    const near = findNearestInteractable(model, {
      x: gate.door.x + gate.door.w / 2,
      y: model.groundY - model.tileSize * 0.5,
    });
    expect(near?.id).toBe('training-gate');

    expect(findNearestInteractable(model, { x: 0, y: 0 })).toBeNull();
  });
});
