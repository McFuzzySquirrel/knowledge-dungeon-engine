import { describe, expect, it } from 'vitest';
import { createRootDungeon, addLinkedRooms } from '../../src/core/graph';
import { generateDungeonMap } from '../../src/core/layout/dungeonGenerator';
import { createWalkabilityController } from '../../src/world/WalkabilityController';
import { nearbyVillageTargets, stepVillagePlayer } from '../../src/world/village';
import { VILLAGE_MAP } from '../../src/data/villageLayout';
import { createDungeonNavigation, TELEPORT_COOLDOWN_MS } from '../../src/world/dungeonNavigation';

describe('headless world mechanics', () => {
  it('blocks dungeon movement off the map and excludes hidden rooms', () => {
    const root = createRootDungeon({ dungeonId: 'd', subjectName: 'Study', rootRoomId: 'root',
      rootTopic: 'Study', nowIso: '2026-01-01T00:00:00.000Z' });
    if (!root.ok) throw new Error(root.error.message);
    const graph = addLinkedRooms(root.value, { fromRoomId: 'root',
      drafts: [{ roomId: 'child', topic: 'Child' }], nowIso: '2026-01-01T00:00:00.000Z' });
    if (!graph.ok) throw new Error(graph.error.message);
    const controller = createWalkabilityController({ map: generateDungeonMap(graph.value.dungeon),
      visibleRoomIds: new Set(['root']) });
    const rootPoint = controller.landingPointFor('root');
    const childPoint = controller.landingPointFor('child');
    if (!rootPoint || !childPoint) throw new Error('Missing rooms');
    expect(controller.canPlayerOccupy(rootPoint.x, rootPoint.y)).toBe(true);
    expect(controller.canPlayerOccupy(childPoint.x, childPoint.y)).toBe(false);
    expect(controller.isWalkableAt(-1e6, -1e6)).toBe(false);
  });

  it('normalizes village movement and reports nearby interactive structures', () => {
    const point = stepVillagePlayer({ x: 100, y: 100 }, { x: 1, y: 1 }, 1000);
    expect(Math.hypot(point.x - 100, point.y - 100)).toBeCloseTo(120);
    const structure = VILLAGE_MAP.structures.find((item) => item.id === 'keeper-tower');
    if (!structure) throw new Error('Missing keeper tower');
    const position = { x: (structure.gridX + structure.width / 2) * VILLAGE_MAP.tileSize,
      y: (structure.gridY + structure.height / 2) * VILLAGE_MAP.tileSize };
    expect(nearbyVillageTargets(position, [structure], []).map((target) => target.id)).toEqual(['keeper-tower']);
  });

  it('enforces the teleport cooldown and rejects unknown rooms', () => {
    const root = createRootDungeon({ dungeonId: 'd', subjectName: 'Study', rootRoomId: 'root',
      rootTopic: 'Study', nowIso: '2026-01-01T00:00:00.000Z' });
    if (!root.ok) throw new Error(root.error.message);
    const navigation = createDungeonNavigation(root.value);
    expect(navigation.teleportToRoom('root', 1_000).accepted).toBe(true);
    expect(navigation.teleportToRoom('root', 2_000)).toEqual({ accepted: false, remainingMs: TELEPORT_COOLDOWN_MS - 1_000 });
    expect(navigation.teleportToRoom('root', 1_000 + TELEPORT_COOLDOWN_MS).accepted).toBe(true);
    expect(() => navigation.travelToRoom('missing')).toThrow('Room not found');
  });

  it('switches floors through their portals and moves only on walkable terrain', () => {
    const root = createRootDungeon({ dungeonId: 'd', subjectName: 'Study', rootRoomId: 'root',
      rootTopic: 'Study', nowIso: '2026-01-01T00:00:00.000Z' });
    if (!root.ok) throw new Error(root.error.message);
    const graph = addLinkedRooms(root.value, { fromRoomId: 'root',
      drafts: [{ roomId: 'child', topic: 'Child' }], nowIso: '2026-01-01T00:00:00.000Z' });
    if (!graph.ok) throw new Error(graph.error.message);
    const navigation = createDungeonNavigation(graph.value.dungeon);
    expect(navigation.snapshot().portalDownRoomIds).toContain('child');
    navigation.changeFloor('child');
    expect(navigation.snapshot()).toMatchObject({ floorId: 'child', currentRoomId: 'child', portalUpRoomId: 'root' });
    navigation.move({ x: -1, y: 0 }, 1_000_000);
    expect(navigation.snapshot().currentRoomId).toBe('child');
    navigation.changeFloor('root');
    expect(navigation.snapshot()).toMatchObject({ floorId: 'root', currentRoomId: 'root' });
  });
});
