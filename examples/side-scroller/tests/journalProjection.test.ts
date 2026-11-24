import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  KnowledgeDungeonEngine,
  MemoryEngineStorage,
  createEmptyState,
  type EngineState,
} from '@/index';
import {
  ADAPTIVE_ASSISTANCE_FLAG_NAME,
  projectAssistance,
  projectJournal,
} from '../src/journal/projection';
import { assistanceStudyAggregate } from '../src/statistics/projection';
import { DEFAULT_SETTINGS, type HostSettings } from '../src/settings';
import { seedDemoSubjects } from '../src/creator/seeds';

const FIXED_NOW = '2026-11-24T12:00:00.000Z';
const ROOM_IDS = ['tut-note', 'tut-tools', 'tut-map'] as const;

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

function openEngine(): Promise<KnowledgeDungeonEngine> {
  return KnowledgeDungeonEngine.open({
    storage: new MemoryEngineStorage(),
    nowIso: () => FIXED_NOW,
    newRoomId: () => crypto.randomUUID(),
    newStudySessionId: () => crypto.randomUUID(),
  });
}

type LootItem = EngineState['progression'][string]['inventory'][number];

function journalCap(): LootItem & { equipSlot: 'head'; equipped: boolean } {
  return {
    id: 'journal-test-cap',
    name: 'Journal Test Cap',
    description: 'A cap for the projection test.',
    rarity: 'common',
    acquiredAt: FIXED_NOW,
    equipSlot: 'head',
    equipped: true,
  };
}

function settings(overrides: Partial<HostSettings> = {}): HostSettings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

async function tutorialState(): Promise<EngineState> {
  const engine = await openEngine();
  await engine.startTutorial();
  return engine.snapshot();
}

async function clearedTutorialState(): Promise<EngineState> {
  const engine = await openEngine();
  await engine.startTutorial();
  for (const roomId of ROOM_IDS) {
    const result = await engine.submitNote({
      roomId,
      noteText: VALID_NOTE,
      manualConfirmed: true,
    });
    if (!result.ok || result.value.kind !== 'cleared') {
      throw new Error(`Room ${roomId} did not clear`);
    }
  }
  return engine.snapshot();
}

function subjectIdOf(state: EngineState): string {
  if (!state.activeSubjectId) throw new Error('No active subject');
  return state.activeSubjectId;
}

describe('journal projection (P8-T2)', () => {
  it('projects an empty save without inventing a subject', () => {
    const view = projectJournal(createEmptyState(), FIXED_NOW);
    expect(view.subjects).toEqual([]);
    expect(view.activeSubjectId).toBeNull();
    expect(view.questStep).toBe('intro');
    expect(view.archetype).toBeNull();
    expect(view.inventory).toEqual([]);
    expect(view.fish).toEqual([]);
    expect(view.due).toEqual([]);
    expect(view.stats?.totals.notesSubmitted).toBe(0);
  });

  it('projects one subject, the active id, and the quest step from engine state', async () => {
    const state = await tutorialState();
    const subjectId = subjectIdOf(state);
    const view = projectJournal(state, FIXED_NOW);

    expect(view.subjects).toHaveLength(1);
    expect(view.subjects[0]).toMatchObject({
      subjectId,
      subjectName: 'First Dungeon (Tutorial)',
      xp: 0,
      rank: 'Novice',
      roomsCleared: 0,
      totalRooms: 3,
      badges: [],
      fishCount: 0,
      dueRooms: 0,
      lastPlayedIso: FIXED_NOW,
    });
    expect(view.activeSubjectId).toBe(subjectId);
    expect(view.questStep).toBe('enter-dungeon');
    expect(view.archetype).toBe('scholar');
  });

  it('lists every subject, sorted, including the three demo subjects', async () => {
    const engine = await openEngine();
    await seedDemoSubjects(engine);
    await engine.startTutorial();
    const view = projectJournal(engine.snapshot(), FIXED_NOW);

    expect(view.subjects.map((subject) => subject.subjectId)).toEqual([
      'demo-kitchen',
      'demo-rivers',
      'demo-sky',
      'tutorial-first-walkthrough',
    ]);
    expect(view.subjects.find((subject) => subject.subjectId === 'demo-kitchen')).toMatchObject({
      subjectName: 'Kitchen Chemistry',
      totalRooms: 4,
    });
  });

  it('reads cleared rooms, XP, badges, inventory, fish, and due rooms from the engine', async () => {
    const state = await clearedTutorialState();
    const subjectId = subjectIdOf(state);
    const record = state.progression[subjectId];
    if (!record) throw new Error('Missing progression');

    record.inventory.push(journalCap());
    record.fishCollection.push({
      id: 'fish-test',
      name: 'Moss Carp',
      rarity: 'common',
      subjectId,
      subjectName: 'First Dungeon (Tutorial)',
      caughtAt: FIXED_NOW,
    });
    const room = state.subjects[subjectId]?.rooms['tut-note'];
    if (!room) throw new Error('Missing room');
    room.sm2NextReviewDate = '2026-11-20T12:00:00.000Z';
    room.sm2QualityResponse = 2;
    for (const otherId of ['tut-tools', 'tut-map']) {
      const other = state.subjects[subjectId]?.rooms[otherId];
      if (!other) throw new Error('Missing room');
      other.sm2NextReviewDate = '2026-12-08T12:00:00.000Z';
    }

    const view = projectJournal(state, FIXED_NOW);
    const subject = view.subjects[0];
    expect(subject.roomsCleared).toBe(3);
    expect(subject.xp).toBeGreaterThan(0);
    expect(subject.badges.length).toBeGreaterThan(0);
    expect(subject.badges).toContain('Scribe phase complete');
    expect(subject.fishCount).toBe(1);
    expect(subject.dueRooms).toBe(1);
    expect(view.inventory).toContainEqual({
      id: 'journal-test-cap',
      name: 'Journal Test Cap',
      equipped: true,
      slot: 'head',
    });
    expect(view.fish).toEqual([
      {
        name: 'Moss Carp',
        rarity: 'common',
        subjectName: 'First Dungeon (Tutorial)',
      },
    ]);
    expect(view.due).toHaveLength(1);
    expect(view.due[0]).toMatchObject({
      subjectId,
      roomId: 'tut-note',
      topic: 'The Note',
      overdueDays: 4,
      dueLabel: 'Overdue by 4 days',
    });
    expect(view.stats?.totals.notesSubmitted).toBe(3);
  });

  it('uses the newest study session for the last-played timestamp', async () => {
    const state = await tutorialState();
    const subjectId = subjectIdOf(state);
    state.studySessions.push({
      sessionId: 'later-session',
      subjectId,
      subjectName: 'First Dungeon (Tutorial)',
      startedAt: '2026-11-25T08:00:00.000Z',
      endedAt: '2026-11-25T08:30:00.000Z',
      roomsVisited: [],
      notesSubmitted: 0,
      reviewsCompleted: 0,
      xpEarned: 0,
    });

    const view = projectJournal(state, FIXED_NOW);
    expect(view.subjects[0]?.lastPlayedIso).toBe('2026-11-25T08:30:00.000Z');
  });

  it('never calls snapshot() in the projection', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/journal/projection.ts'), 'utf8');
    expect(source).not.toMatch(/\.\s*snapshot\s*\(/);
  });
});

describe('assistance projection (P8-T3)', () => {
  it('names the engine flag and respects off mode before any rule runs', async () => {
    const state = await tutorialState();
    expect(ADAPTIVE_ASSISTANCE_FLAG_NAME).toBe('VITE_ADAPTIVE_ASSISTANCE');
    const result = projectAssistance(state, settings({ assistanceMode: 'off' }), FIXED_NOW);
    expect(result.mode).toBe('off');
    expect(result.suggestions).toEqual([]);
    expect(result.emptyReason).toBe('mode-off');
    expect(result.evaluatedRuleKinds).toEqual([]);
  });

  it('returns the engine empty reason when nothing is worth suggesting', () => {
    const result = projectAssistance(createEmptyState(), settings(), FIXED_NOW);
    expect(result.suggestions).toEqual([]);
    expect(result.emptyReason).toBe('no-suggestions');
  });

  it('maps a subject with no root branch to one Creator suggestion', async () => {
    const state = await tutorialState();
    const subjectId = subjectIdOf(state);
    const subject = state.subjects[subjectId];
    if (!subject) throw new Error('Missing subject');
    subject.dungeon.edges = [];

    const result = projectAssistance(state, settings(), FIXED_NOW);
    const creator = result.suggestions.filter(
      (suggestion) => suggestion.kind === 'creator.missing-branch',
    );
    expect(creator).toHaveLength(1);
    expect(creator[0]).toMatchObject({
      kind: 'creator.missing-branch',
      surface: 'creator',
      targetId: subjectId,
      reasonCode: 'graph-no-branch',
    });
  });

  it('passes the engine study aggregate and ranks a device due suggestion', async () => {
    const state = await clearedTutorialState();
    const subjectId = subjectIdOf(state);
    const room = state.subjects[subjectId]?.rooms['tut-note'];
    if (!room) throw new Error('Missing room');
    room.sm2NextReviewDate = '2026-11-20T12:00:00.000Z';

    const study = assistanceStudyAggregate(state, FIXED_NOW);
    expect(study).toMatchObject({
      roomsCleared: 3,
      notesSubmitted: 3,
      reviewsCompleted: 0,
    });

    const result = projectAssistance(
      state,
      settings({ assistanceMode: 'standard' }),
      FIXED_NOW,
    );
    expect(result.suggestions.some((suggestion) => suggestion.kind === 'device.due-today')).toBe(
      true,
    );
    expect(
      result.suggestions.some((suggestion) => suggestion.surface === 'archaeologist'),
    ).toBe(true);
  });

  it('reports flag-disabled before reading the mode', async () => {
    const state = await tutorialState();
    const result = projectAssistance(state, settings(), FIXED_NOW, false);
    expect(result.suggestions).toEqual([]);
    expect(result.emptyReason).toBe('flag-disabled');
  });
});
