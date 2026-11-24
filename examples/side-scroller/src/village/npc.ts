import { village, villageInteractions } from '@/index';
import { distanceToRect, structureApproachRange, SURFACE_X_SPREAD, type SurfaceModel } from '../level/surfaceLevel';
import type { NpcLineView } from './projection';

/**
 * Host-local NPC presentation and line selection (P7).
 *
 * The engine owns the NPC data (`VILLAGE_MAP.npcs`) and the line rule
 * (`selectVillageNpcLine`). The host owns only:
 *
 * - screen placement of the placeholder figures,
 * - the conversation cursor, which is deliberately in memory and resets on
 *   reload,
 * - the `quoteIndex` randomness the engine's contract asks the caller to
 *   supply.
 *
 * Proximity is the engine's `selectVillageNearbyTargets`, fed with the same
 * `VILLAGE_NEARBY_RANGES` the village contract publishes. There is no second
 * distance rule and no host-side target ordering: structures still win over
 * NPCs, exactly as the engine's own interact key does.
 */

export interface SurfaceNpc {
  id: string;
  label: string;
  /** Horizontal centre of the figure, in world pixels. */
  x: number;
  /** Feet position, on the street's ground line. */
  feetY: number;
  w: number;
  h: number;
  /** `gridY` from the engine data; larger values draw in front. */
  depth: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Place every engine NPC on the street.
 *
 * Only `gridX` affects screen position; `gridY` is depth ordering, the same P3
 * mapping the facades use. Figures are intentionally not added to `solids`, so
 * they cannot block the player.
 */
export function placeSurfaceNpcs(
  npcs: readonly village.VillageNpc[],
  surface: SurfaceModel,
): SurfaceNpc[] {
  const tile = surface.tileSize;
  const w = tile * 0.42;
  const h = tile * 0.72;
  const minX = surface.bounds.x + w / 2;
  const maxX = surface.bounds.x + surface.bounds.w - w / 2;
  const range = structureApproachRange(tile);

  // A structure's interaction band wins the engine's nearby selection. An NPC
  // standing inside one would be visible but unreachable, so nudge each figure
  // to the nearest deterministic x outside every structure band.
  const bands = surface.interactables.map((entry) => ({
    min: entry.rect.x - range - tile * 0.25,
    max: entry.rect.x + entry.rect.w + range + tile * 0.25,
  }));
  const blockedByStructure = (x: number): boolean =>
    bands.some((band) => x >= band.min && x <= band.max);

  const placed: SurfaceNpc[] = [];
  const offsets = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7, 8, -8];
  for (const npc of npcs) {
    const desired = npc.gridX * tile * SURFACE_X_SPREAD + tile / 2;
    let chosen: number | null = null;
    for (const offset of offsets) {
      const x = clamp(desired + offset * tile, minX, maxX);
      if (blockedByStructure(x)) continue;
      if (placed.some((other) => Math.abs(other.x - x) < tile * 0.8)) continue;
      chosen = x;
      break;
    }
    placed.push({
      id: npc.id,
      label: npc.label,
      x: chosen ?? clamp(desired, minX, maxX),
      feetY: surface.groundY,
      w,
      h,
      depth: npc.gridY,
    });
  }
  return placed;
}

/**
 * The nearby-action list for the street, including NPCs.
 *
 * Structure candidates use the distance to their interaction rect; NPC
 * candidates use the distance to the figure's centre. Both ranges come from
 * `VILLAGE_NEARBY_RANGES`, scaled to this world's tile size.
 */
export function selectNearbySurfaceTargets(
  surface: SurfaceModel,
  npcs: readonly SurfaceNpc[],
  point: { x: number; y: number },
): readonly villageInteractions.VillageNearbyTarget[] {
  const scale = surface.tileSize / village.VILLAGE_TILE_SIZE;
  const npcRange = villageInteractions.VILLAGE_NEARBY_RANGES.npc * scale;
  const candidates: villageInteractions.VillageNearbyCandidate[] = [];

  for (const interactable of surface.interactables) {
    candidates.push({
      kind: 'structure',
      id: interactable.id,
      label: interactable.label,
      distance: distanceToRect(point.x, point.y, interactable.rect),
      range: structureApproachRange(surface.tileSize),
    });
  }

  for (const npc of npcs) {
    candidates.push({
      kind: 'npc',
      id: npc.id,
      label: npc.label,
      distance: Math.hypot(point.x - npc.x, point.y - (npc.feetY - npc.h / 2)),
      range: npcRange,
    });
  }

  return villageInteractions.createVillageNpcSnapshot({ candidates }).nearby;
}

/**
 * A deterministic first-line quote index for one wanderer.
 *
 * The engine asks the caller for the randomness. Hashing the stable NPC id
 * gives every character a different opening quote without a host RNG or a
 * per-frame decision.
 */
export function npcQuoteIndex(npc: village.VillageNpc): number {
  const length = npc.quotes?.length ?? 0;
  if (length === 0) return 0;
  let hash = 0;
  for (let index = 0; index < npc.id.length; index += 1) {
    hash = (hash * 31 + npc.id.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % length;
}

/**
 * One press of `E`: ask the engine for the next line and return the view.
 *
 * The host must hand the returned cursor back unchanged on the next press and
 * reset it when the quest step changes; the engine already restarts a
 * conversation whose cursor belongs to a different step.
 */
export function projectNpcLine(
  npc: village.VillageNpc,
  questStep: string,
  cursor: villageInteractions.VillageNpcLineCursor | null,
  quoteIndex?: number,
): NpcLineView {
  const selection = villageInteractions.selectVillageNpcLine({
    npc,
    questStep,
    cursor,
    ...(quoteIndex === undefined ? {} : { quoteIndex }),
  });
  return {
    npcId: selection.npcId,
    label: selection.label,
    line: selection.line,
    source: selection.source,
    lineCount: selection.lineCount,
    cursor: { index: selection.cursor.index, questStep: selection.cursor.questStep },
  };
}
