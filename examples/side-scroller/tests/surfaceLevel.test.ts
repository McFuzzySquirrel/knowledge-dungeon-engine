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

function pointInRect(x: number, y: number, rect: { x: number; y: number; w: number; h: number }): boolean {
  return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
}

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

  it('leaves a door gap in a building body where the player can stand', () => {
    const model = surface();
    const gate = model.facades.find((facade) => facade.id === 'training-gate');
    if (!gate) throw new Error('Training gate missing');

    const doorX = gate.door.x + gate.door.w / 2;
    const doorY = model.groundY - model.tileSize * 0.5;
    expect(model.solids.some((solid) => pointInRect(doorX, doorY, solid))).toBe(false);

    // The jambs on either side still collide.
    const leftJamb = gate.rect.x + model.tileSize * 0.1;
    expect(model.solids.some((solid) => pointInRect(leftJamb, doorY, solid))).toBe(true);
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
