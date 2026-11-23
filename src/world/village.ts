import { INTERACT_RADIUS, NPC_SPEED, PLAYER_SPEED, STRUCTURE_APPROACH_RADIUS,
  VILLAGE_MAP, type VillageNpc, type VillageStructure } from '../data/villageLayout';
import { selectVillageNearbyTargets } from '../application/contracts/villageNpc';

export interface Point { x: number; y: number }
export interface VillageWanderer {
  id: string;
  position: Point;
  pathIndex: number;
  waiting: boolean;
  waitMs: number;
}

export function stepVillagePlayer(position: Point, direction: Point, deltaMs: number): Point {
  if (![position.x, position.y, direction.x, direction.y, deltaMs].every(Number.isFinite) || deltaMs < 0) {
    throw new Error('Movement must use finite values and non-negative elapsed time');
  }
  const length = Math.hypot(direction.x, direction.y);
  const distance = PLAYER_SPEED * deltaMs / 1000;
  return {
    x: Math.max(0, Math.min(VILLAGE_MAP.width * VILLAGE_MAP.tileSize,
      position.x + (length ? direction.x / length * distance : 0))),
    y: Math.max(0, Math.min(VILLAGE_MAP.height * VILLAGE_MAP.tileSize,
      position.y + (length ? direction.y / length * distance : 0))),
  };
}

export function createVillageWanderer(npc: VillageNpc): VillageWanderer {
  const tile = VILLAGE_MAP.tileSize;
  return {
    id: npc.id, position: { x: (npc.gridX + 0.5) * tile, y: (npc.gridY + 0.5) * tile },
    pathIndex: 0, waiting: !npc.path?.length, waitMs: 0,
  };
}

export function stepVillageNpc(state: VillageWanderer, npc: VillageNpc, deltaMs: number,
  random: () => number): VillageWanderer {
  if (state.id !== npc.id || !Number.isFinite(deltaMs) || deltaMs < 0) throw new Error('Invalid NPC step');
  const path = npc.path;
  if (!path?.length) return state;
  if (state.waiting) {
    const waitMs = state.waitMs - deltaMs;
    return waitMs > 0 ? { ...state, waitMs } : {
      ...state, waiting: false, waitMs: 0, pathIndex: (state.pathIndex + 1) % path.length,
    };
  }
  const target = path[state.pathIndex];
  if (!target) throw new Error('Invalid NPC path index');
  const tile = VILLAGE_MAP.tileSize;
  const dx = (target.x + 0.5) * tile - state.position.x;
  const dy = (target.y + 0.5) * tile - state.position.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 4) {
    const roll = random();
    if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new Error('Random value must be in [0, 1)');
    return { ...state, waiting: true, waitMs: 400 + roll * 1200 };
  }
  const step = NPC_SPEED * deltaMs / 1000;
  return { ...state, position: { x: state.position.x + dx / distance * step, y: state.position.y + dy / distance * step } };
}

const interactive = new Set<VillageStructure['type']>([
  'portal-icon', 'keeper-tower', 'guild-hall', 'training-gate', 'signpost', 'waysign',
  'trophy-hall', 'library', 'workshop', 'fountain', 'fishing-pond', 'fish-stand',
]);

export function nearbyVillageTargets(position: Point, structures: readonly VillageStructure[],
  npcs: readonly { npc: VillageNpc; position: Point }[]) {
  const tile = VILLAGE_MAP.tileSize;
  return selectVillageNearbyTargets([
    ...structures.filter((structure) => interactive.has(structure.type)).map((structure) => ({
      kind: 'structure' as const, id: structure.id, label: structure.label || structure.type,
      distance: Math.hypot(position.x - (structure.gridX + structure.width / 2) * tile,
        position.y - (structure.gridY + structure.height / 2) * tile),
      range: STRUCTURE_APPROACH_RADIUS,
    })),
    ...npcs.map(({ npc, position: npcPosition }) => ({
      kind: 'npc' as const, id: npc.id, label: npc.label,
      distance: Math.hypot(position.x - npcPosition.x, position.y - npcPosition.y), range: INTERACT_RADIUS,
    })),
  ]);
}
