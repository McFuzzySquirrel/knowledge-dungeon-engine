import { describe, expect, it } from 'vitest';
import {
  createEmptyState,
  KnowledgeDungeonEngine,
  MemoryEngineStorage,
  tutorial,
  type EngineState,
} from '@/index';
import {
  equipmentSubjectId,
  projectFishStand,
  projectGuild,
  projectLibrary,
  projectTrophy,
  projectWorkshop,
  serviceForStructure,
  trophyBadgeLabel,
} from '../src/village/projection';

const FIXED_NOW = '2026-11-24T12:00:00.000Z';

const VALID_NOTE = [
  'Summary',
  'The note is the unit of study in this dungeon and it records what the learner understood.',
  '',
  'Key Points',
  'A note needs a summary, key points, and one recall question ending with a question mark.',
  '',
  'Recall Question',
  'Why does a note need a recall question?',
  '',
].join('\n');

async function openTutorial(): Promise<KnowledgeDungeonEngine> {
  const engine = await KnowledgeDungeonEngine.open({
    storage: new MemoryEngineStorage(),
    nowIso: () => FIXED_NOW,
    newRoomId: () => crypto.randomUUID(),
    newStudySessionId: () => crypto.randomUUID(),
  });
  await engine.startTutorial();
  return engine;
}

async function clearRootRoom(engine: KnowledgeDungeonEngine): Promise<void> {
  const result = await engine.submitNote({
    roomId: 'tut-note',
    noteText: VALID_NOTE,
    manualConfirmed: true,
  });
  if (!result.ok || result.value.kind !== 'cleared') {
    throw new Error('The root room did not clear');
  }
}

function activeId(state: EngineState): string {
  if (!state.activeSubjectId) throw new Error('No active subject');
  return state.activeSubjectId;
}

describe('serviceForStructure (P7-T1)', () => {
  it('maps every service facade the village data defines', () => {
    expect(serviceForStructure('library')).toBe('library');
    expect(serviceForStructure('guild-hall')).toBe('guild-hall');
    expect(serviceForStructure('trophy-hall')).toBe('trophy-hall');
    expect(serviceForStructure('workshop')).toBe('workshop');
    expect(serviceForStructure('fish-stand')).toBe('fish-stand');
  });

  it('returns null for portals, ponds, and scenery', () => {
    for (const type of [
      'portal-icon',
      'training-gate',
      'fishing-pond',
      'keeper-tower',
      'fountain',
      'tree',
      'bench',
      'signpost',
      'gate',
      'pond',
    ]) {
      expect(serviceForStructure(type), type).toBeNull();
    }
  });
});

describe('projectLibrary (P7-T3)', () => {
  it('returns explicit empty state with no subject', () => {
    const view = projectLibrary(createEmptyState(), FIXED_NOW);

    expect(view.subjectId).toBeNull();
    expect(view.review).toBeNull();
    expect(view.artifacts).toEqual([]);
    expect(view.notes).toEqual([]);
    expect(view.noteCount).toBe(0);
    expect(view.emptyMessage).toContain('No subject yet');
  });

  it('lists the last-studied subject after returnToVillage clears the active id', async () => {
    const engine = await openTutorial();
    await clearRootRoom(engine);
    await engine.returnToVillage();
    const state = engine.snapshot();

    const view = projectLibrary(state, FIXED_NOW);
    expect(state.activeSubjectId).toBeNull();
    expect(view.subjectId).toBe(tutorial.TUTORIAL_SUBJECT_ID);
    expect(view.subjectName).toBe('First Dungeon (Tutorial)');
    expect(view.review?.subjectId).toBe(tutorial.TUTORIAL_SUBJECT_ID);
    expect(view.review?.candidates[0]?.roomId).toBe('tut-note');
    expect(view.review?.dueCount).toBe(1);
  });

  it('keeps artifact text hidden until the note is collected', async () => {
    const engine = await openTutorial();
    await clearRootRoom(engine);

    const before = projectLibrary(engine.snapshot(), FIXED_NOW);
    expect(before.artifacts).toHaveLength(1);
    expect(before.artifacts[0]?.collected).toBe(false);
    expect(before.artifacts[0]?.artifactText).toBeNull();
    expect(before.noteCount).toBe(0);

    await engine.collectArtifact('tut-note');
    const after = projectLibrary(engine.snapshot(), FIXED_NOW);
    expect(after.artifacts[0]?.collected).toBe(true);
    expect(after.artifacts[0]?.artifactText?.length).toBeGreaterThan(0);
    expect(after.notes).toHaveLength(1);
    expect(after.notes[0]?.topic).toBe('The Note');
    expect(after.noteCount).toBe(1);
  });
});

describe('projectGuild (P7-T4)', () => {
  it('projects the quest step, next step, archetype, and roster', async () => {
    const engine = await openTutorial();
    const view = projectGuild(engine.snapshot());

    expect(view.questStep).toBe('enter-dungeon');
    expect(view.nextQuestStep).toBe('clear-room');
    expect(view.archetype).toBe('scholar');
    expect(view.subjects).toEqual([
      {
        subjectId: tutorial.TUTORIAL_SUBJECT_ID,
        subjectName: 'First Dungeon (Tutorial)',
        clearedCount: 0,
        roomCount: 3,
        active: true,
      },
    ]);
  });

  it('has an explicit empty roster state', () => {
    const view = projectGuild(createEmptyState());
    expect(view.subjects).toEqual([]);
    expect(view.emptyMessage).toContain('No subjects yet');
    expect(view.archetype).toBeNull();
  });
});

describe('projectTrophy (P7-T5)', () => {
  it('reports real zeroes for a fresh save', () => {
    const view = projectTrophy(createEmptyState(), FIXED_NOW);

    expect(view.badges).toEqual([]);
    expect(view.fish).toEqual([]);
    expect(view.metrics.find((metric) => metric.label === 'Notes submitted')?.value).toBe('0');
    expect(view.metrics.find((metric) => metric.label === 'Fish kept')?.value).toBe('0');
    expect(view.emptyMessage).toContain('No badges or fish yet');
  });

  it('labels known badge ids and aggregates fish across subjects', async () => {
    const engine = await openTutorial();
    await clearRootRoom(engine);
    await engine.returnToVillage();
    const state = engine.snapshot();
    const subjectId = tutorial.TUTORIAL_SUBJECT_ID;
    const record = state.progression[subjectId];
    if (!record) throw new Error('Missing progression');
    record.badges = ['ScribeCentury120', 'FshFirstCatch', 'UnknownBadgeId'];
    record.fishCollection = [
      {
        id: 'fish-1',
        name: 'Silver Minnow',
        rarity: 'common',
        subjectId,
        subjectName: 'First Dungeon (Tutorial)',
        caughtAt: FIXED_NOW,
      },
    ];

    const view = projectTrophy(state, FIXED_NOW);
    expect(view.badges).toContain('Scribe Century (120+ Words)');
    expect(view.badges).toContain('First Catch');
    expect(view.badges).toContain('Unknown Badge Id');
    expect(view.fish).toEqual([
      { name: 'Silver Minnow', rarity: 'common', subjectName: 'First Dungeon (Tutorial)' },
    ]);
    expect(view.metrics.find((metric) => metric.label === 'Notes submitted')?.value).toBe('1');
    expect(view.metrics.find((metric) => metric.label === 'Sessions completed')?.value).toBe('1');
  });

  it('keeps badge labels stable for unknown ids', () => {
    expect(trophyBadgeLabel('ArchaeologistReviewPass7')).toBe(
      'Archaeologist: 7 review passes',
    );
    expect(trophyBadgeLabel('SomeNewBadge')).toBe('Some New Badge');
  });
});

describe('projectWorkshop (P7-T6)', () => {
  it('has an explicit empty state and resolves the equipment subject', async () => {
    expect(projectWorkshop(createEmptyState()).subjectId).toBeNull();
    expect(projectWorkshop(createEmptyState()).emptyMessage).toContain('No subject yet');

    const engine = await openTutorial();
    await engine.returnToVillage();
    const state = engine.snapshot();
    expect(equipmentSubjectId(state)).toBe(tutorial.TUTORIAL_SUBJECT_ID);

    const view = projectWorkshop(state);
    expect(view.subjectId).toBe(tutorial.TUTORIAL_SUBJECT_ID);
    expect(view.items).toEqual([]);
    expect(view.emptyMessage).toContain('No equipment yet');
  });

  it('marks equippable inventory and its slot', async () => {
    const engine = await openTutorial();
    const state = engine.snapshot();
    const subjectId = activeId(state);
    const record = state.progression[subjectId];
    if (!record) throw new Error('Missing progression');

    const gear = {
      id: 'gear-1',
      name: 'Scholar’s Cap',
      description: 'A test cap.',
      rarity: 'common' as const,
      acquiredAt: FIXED_NOW,
      equipSlot: 'head' as const,
      equipped: true,
    };
    record.inventory.push(gear);
    record.equippedItems.push(gear);

    const view = projectWorkshop(state);
    expect(view.items).toEqual([
      {
        id: 'gear-1',
        name: 'Scholar’s Cap',
        description: 'A test cap.',
        rarity: 'common',
        equipped: true,
        slot: 'head',
        equippable: true,
      },
    ]);
  });
});

describe('projectFishStand (P7-T7)', () => {
  it('has an explicit empty collection', () => {
    const view = projectFishStand(createEmptyState());
    expect(view.fish).toEqual([]);
    expect(view.emptyMessage).toContain('No fish yet');
  });

  it('lists fish with name, rarity, and subject from engine data', async () => {
    const engine = await openTutorial();
    const state = engine.snapshot();
    const subjectId = activeId(state);
    const record = state.progression[subjectId];
    if (!record) throw new Error('Missing progression');
    record.fishCollection = [
      {
        id: 'fish-1',
        name: 'River Trout',
        rarity: 'rare',
        subjectId,
        subjectName: 'First Dungeon (Tutorial)',
        caughtAt: FIXED_NOW,
      },
    ];

    expect(projectFishStand(state).fish).toEqual([
      {
        name: 'River Trout',
        rarity: 'rare',
        subjectName: 'First Dungeon (Tutorial)',
        caughtAt: FIXED_NOW,
      },
    ]);
  });
});
