// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  KnowledgeDungeonEngine,
  MemoryEngineStorage,
  village,
  type EngineState,
  type EngineStorage,
} from '@/index';
import { DEFAULT_TILE_SIZE } from '../src/level/dungeonLevel';
import { buildSurface, structureApproachRange } from '../src/level/surfaceLevel';
import {
  npcQuoteIndex,
  placeSurfaceNpcs,
  projectNpcLine,
  selectNearbySurfaceTargets,
} from '../src/village/npc';
import { mountServicePanel, type ServicePanel } from '../src/ui/servicePanel';

const FIXED_NOW = '2026-11-24T12:00:00.000Z';

const OPTIONS = {
  nowIso: () => FIXED_NOW,
  newRoomId: () => crypto.randomUUID(),
  newStudySessionId: () => crypto.randomUUID(),
};

type LootItem = EngineState['progression'][string]['inventory'][number];

function equipableGear(): LootItem & { equipSlot: 'head'; equipped: boolean } {
  return {
    id: 'gear-test-cap',
    name: 'Scholar’s Cap',
    description: 'A test cap.',
    rarity: 'common',
    acquiredAt: FIXED_NOW,
    equipSlot: 'head',
    equipped: false,
  };
}

async function tutorialStateWithGear(): Promise<{ storage: MemoryEngineStorage; state: EngineState }> {
  const storage = new MemoryEngineStorage();
  const engine = await KnowledgeDungeonEngine.open({ storage, ...OPTIONS });
  await engine.startTutorial();
  const state = engine.snapshot();
  const subjectId = state.activeSubjectId;
  if (!subjectId) throw new Error('No active subject');
  const record = state.progression[subjectId];
  if (!record) throw new Error('Missing progression');
  record.inventory.push(equipableGear());
  await storage.save(state);
  return { storage, state };
}

describe('equipment round trip (P7-T6)', () => {
  it('equips, survives a reload, unequips, and rejects a failed write', async () => {
    const { storage, state } = await tutorialStateWithGear();
    const subjectId = state.activeSubjectId;
    if (!subjectId) throw new Error('No active subject');

    const first = await KnowledgeDungeonEngine.open({ storage, ...OPTIONS });
    expect(await first.equipItem('gear-test-cap')).toBe(true);
    expect(first.snapshot().progression[subjectId]?.equippedItems.map((item) => item.id)).toEqual([
      'gear-test-cap',
    ]);

    const reloaded = await KnowledgeDungeonEngine.open({ storage, ...OPTIONS });
    const afterReload = reloaded.snapshot();
    expect(afterReload.progression[subjectId]?.equippedItems.map((item) => item.id)).toEqual([
      'gear-test-cap',
    ]);
    expect(
      afterReload.progression[subjectId]?.inventory.find((item) => item.id === 'gear-test-cap'),
    ).toMatchObject({ equipped: true });

    expect(await reloaded.unequipItem('gear-test-cap')).toBe(true);
    expect(reloaded.snapshot().progression[subjectId]?.equippedItems).toEqual([]);

    let fail = false;
    const failing: EngineStorage = {
      load: () => storage.load(),
      async save(next) {
        if (fail) {
          fail = false;
          throw new Error('Simulated quota failure');
        }
        await storage.save(next);
      },
    };
    const rejected = await KnowledgeDungeonEngine.open({ storage: failing, ...OPTIONS });
    const before = rejected.snapshot();
    fail = true;
    await expect(rejected.equipItem('gear-test-cap')).rejects.toThrow(/Simulated quota failure/);

    const after = rejected.snapshot();
    expect(after.progression[subjectId]?.equippedItems).toEqual(
      before.progression[subjectId]?.equippedItems,
    );
    expect(after.progression[subjectId]?.inventory).toEqual(
      before.progression[subjectId]?.inventory,
    );
  });
});

describe('NPC placement and proximity (P7-T8)', () => {
  const map = { ...village.VILLAGE_MAP, tileSize: DEFAULT_TILE_SIZE };

  it('places every engine NPC on the street without adding collision', () => {
    const surface = buildSurface(village.VILLAGE_MAP.structures, map);
    const npcs = placeSurfaceNpcs(map.npcs, surface);

    expect(npcs).toHaveLength(map.npcs.length);
    expect(npcs.map((npc) => npc.id)).toEqual(map.npcs.map((npc) => npc.id));
    for (const npc of npcs) {
      expect(npc.feetY).toBe(surface.groundY);
      expect(npc.x).toBeGreaterThan(surface.bounds.x);
      expect(npc.x).toBeLessThan(surface.bounds.x + surface.bounds.w);
    }
  });

  it('places every NPC outside every structure’s approach band', () => {
    const surface = buildSurface(village.VILLAGE_MAP.structures, map);
    const npcs = placeSurfaceNpcs(map.npcs, surface);
    const range = structureApproachRange(surface.tileSize);

    for (const npc of npcs) {
      const covering = surface.interactables.filter(
        (entry) =>
          npc.x >= entry.rect.x - range && npc.x <= entry.rect.x + entry.rect.w + range,
      );
      expect(covering.map((entry) => entry.id), npc.id).toEqual([]);
    }
  });

  it('uses the engine nearby selection and lets a structure win over an NPC', () => {
    const surface = buildSurface(village.VILLAGE_MAP.structures, map);
    const npcs = placeSurfaceNpcs(map.npcs, surface);
    const npc = npcs[0];
    if (!npc) throw new Error('No NPC placed');

    const nearNpc = selectNearbySurfaceTargets(surface, npcs, {
      x: npc.x,
      y: npc.feetY - npc.h / 2,
    });
    expect(nearNpc.some((target) => target.kind === 'npc' && target.id === npc.id)).toBe(true);

    const gate = surface.interactables.find((entry) => entry.type === 'training-gate');
    if (!gate) throw new Error('Training gate missing');
    // Put the player on the gate door and move the same NPC beside it: the
    // engine's rule keeps structures first even when both are in range.
    const beside = { ...npc, x: gate.door.x };
    const both = selectNearbySurfaceTargets(surface, [beside], {
      x: gate.door.x,
      y: surface.groundY - surface.tileSize * 0.2,
    });
    expect(both[0]?.kind).toBe('structure');
    expect(both[0]?.id).toBe(gate.id);
  });
});

describe('NPC line selection (P7-T8)', () => {
  const wanderer = village.VILLAGE_MAP.npcs.find((npc) => npc.id === 'villager-1');
  const keeper = village.VILLAGE_MAP.npcs.find((npc) => npc.id === 'keeper');
  if (!wanderer || !keeper) throw new Error('Expected NPC fixtures in VILLAGE_MAP');

  it('is deterministic for a fixed quest step and quote index', () => {
    const quoteIndex = npcQuoteIndex(wanderer);
    const first = projectNpcLine(wanderer, 'intro', null, quoteIndex);
    const repeat = projectNpcLine(wanderer, 'intro', null, quoteIndex);

    expect(first).toEqual(repeat);
    expect(first.source).toBe('quote');
    expect(first.line.length).toBeGreaterThan(0);
    expect(first.cursor).toEqual({ index: 0, questStep: 'intro' });
  });

  it('advances the cursor and restarts when the quest step changes', () => {
    const first = projectNpcLine(wanderer, 'intro', null, 1);
    const second = projectNpcLine(wanderer, 'intro', first.cursor, 1);
    expect(second.cursor.index).not.toBe(first.cursor.index);

    const restarted = projectNpcLine(wanderer, 'clear-room', second.cursor, 1);
    expect(restarted.cursor).toEqual({ index: 0, questStep: 'clear-room' });
    expect(restarted.line).toBe(projectNpcLine(wanderer, 'clear-room', null, 1).line);
  });

  it('selects the keeper’s quest lines for the current step', () => {
    const view = projectNpcLine(keeper, 'intro', null);
    expect(view.source).toBe('quest');
    expect(view.label).toBe('Keeper of Knowledge');
    expect(view.line.length).toBeGreaterThan(0);
    expect(view.cursor).toEqual({ index: 0, questStep: 'intro' });
  });
});

describe('service shell (P7-T2)', () => {
  it('focuses the title, traps Tab, closes on Escape, and returns focus', () => {
    document.body.innerHTML = '<button id="game">Game</button><section id="service-panel"></section>';
    const root = document.querySelector<HTMLElement>('#service-panel');
    const game = document.querySelector<HTMLElement>('#game');
    if (!root || !game) throw new Error('Test DOM missing');

    const content = document.createElement('div');
    const first = document.createElement('button');
    first.id = 'first-action';
    first.textContent = 'First';
    const last = document.createElement('button');
    last.id = 'last-action';
    last.textContent = 'Last';
    content.append(first, last);

    let closes = 0;
    let panel: ServicePanel | null = null;
    panel = mountServicePanel({
      root,
      shell: { id: 'workshop', title: 'Artisan Workshop', subtitle: 'Inventory' },
      content,
      returnFocus: game,
      callbacks: {
        onClose() {
          closes += 1;
          panel?.close();
        },
      },
    });

    expect(document.activeElement?.id).toBe('service-panel-title');

    last.focus();
    document
      .querySelector('#service-panel .service-form')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement?.id).toBe('service-close');

    document
      .querySelector('#service-panel .service-form')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    expect(document.activeElement?.id).toBe('last-action');

    document
      .querySelector('#service-panel .service-form')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(closes).toBe(1);
    expect(root.hidden).toBe(true);
    expect(document.activeElement?.id).toBe('game');
  });
});

describe('service projections stay pure (P7-T9)', () => {
  it('never calls snapshot()', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/village/projection.ts'), 'utf8');
    expect(source).not.toMatch(/\.\s*snapshot\s*\(/);
  });
});
