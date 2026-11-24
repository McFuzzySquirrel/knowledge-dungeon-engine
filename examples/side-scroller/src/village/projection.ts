import {
  nextQuestStep,
  progression,
  statistics,
  type EngineState,
} from '@/index';
import {
  lastStudiedSubjectId,
  projectReviewForSubject,
  reviewDueCount,
} from '../review/projection';

/**
 * Pure village-service projections (P7).
 *
 * Every surface here is derived from `EngineState` with the engine's own
 * progression, statistics, and review helpers. There is no DOM, no command, and
 * no engine instance: the host passes the cached subscription state in and the
 * panels render the result. The frame loop never calls `snapshot()`.
 *
 * `fish-stand` is deliberately display-only: no engine command sells or trades a
 * fish, so the projection exposes a collection and no transaction.
 */

export type VillageServiceId =
  | 'library'
  | 'guild-hall'
  | 'trophy-hall'
  | 'workshop'
  | 'fish-stand';

const SERVICE_BY_STRUCTURE: Readonly<Record<string, VillageServiceId>> = {
  library: 'library',
  'guild-hall': 'guild-hall',
  'trophy-hall': 'trophy-hall',
  workshop: 'workshop',
  'fish-stand': 'fish-stand',
};

/**
 * The service a structure type opens, or `null` for a portal, a pond, or
 * scenery.
 *
 * Every labelled building is either a service in this table, a dungeon portal
 * (`portal-icon`, `training-gate`), or explicitly scenery (`keeper-tower`,
 * `fountain`). The host never invents a sixth service for one facade.
 */
export function serviceForStructure(type: string): VillageServiceId | null {
  return SERVICE_BY_STRUCTURE[type] ?? null;
}

export interface ServiceShellView {
  id: VillageServiceId;
  title: string;
  subtitle: string;
}

const SERVICE_SHELLS: Readonly<Record<VillageServiceId, { title: string; subtitle: string }>> = {
  library: {
    title: 'Library',
    subtitle: 'Review desk, artifact archive, and collected notes',
  },
  'guild-hall': {
    title: 'Guild Hall',
    subtitle: 'Quest board, archetype, and the subject roster',
  },
  'trophy-hall': {
    title: 'Trophy Hall',
    subtitle: 'Badges, fish, and records from the engine',
  },
  workshop: {
    title: 'Artisan Workshop',
    subtitle: 'Inventory and equipment for the active subject',
  },
  'fish-stand': {
    title: 'Fish Stand',
    subtitle: 'The fish collection — display only',
  },
};

/** The shell title and subtitle for one service. */
export function projectServiceShell(id: VillageServiceId): ServiceShellView {
  return { id, ...SERVICE_SHELLS[id] };
}

/* -------------------------------------------------------------------------- */
/* Library                                                                     */
/* -------------------------------------------------------------------------- */

export interface LibraryReviewEntry {
  roomId: string;
  topic: string;
  dueLabel: string;
}

export interface LibraryArtifactEntry {
  roomId: string;
  topic: string;
  /** True when the note is already in the progression's collected notes. */
  collected: boolean;
  /** ISO timestamp the note was collected, or `null` when it was not. */
  collectedAt: string | null;
  /**
   * The collected artifact's plain text, or `null`.
   *
   * Deliberately `null` for an uncollected room: the archive must not expose
   * artifact text the learner has not taken into the journal. The panel writes
   * the value as a text node, never as markup.
   */
  artifactText: string | null;
}

export interface LibraryNoteEntry {
  topic: string;
  /** ISO timestamp the note was collected. */
  collectedAt: string;
}

export interface LibraryView {
  subjectId: string | null;
  subjectName: string | null;
  /** The last-studied subject's review queue, or `null` when there is none. */
  review: {
    subjectId: string;
    subjectName: string;
    candidates: LibraryReviewEntry[];
    dueCount: number;
  } | null;
  artifacts: LibraryArtifactEntry[];
  notes: LibraryNoteEntry[];
  noteCount: number;
  emptyMessage: string;
}

const NO_SUBJECT_LIBRARY =
  'No subject yet. Start the tutorial or create a subject, then clear a room to fill the archive.';

/**
 * Project the Library.
 *
 * The desk follows the most recently studied subject (the same rule the street
 * `R` shortcut uses), so returning to the village does not empty the library
 * just because `returnToVillage()` clears `activeSubjectId`.
 */
export function projectLibrary(state: EngineState, nowIso: string): LibraryView {
  const subjectId = lastStudiedSubjectId(state);
  const subject = subjectId ? state.subjects[subjectId] : undefined;
  if (!subjectId || !subject) {
    return {
      subjectId: null,
      subjectName: null,
      review: null,
      artifacts: [],
      notes: [],
      noteCount: 0,
      emptyMessage: NO_SUBJECT_LIBRARY,
    };
  }

  const record = state.progression[subjectId];
  const reviewView = projectReviewForSubject(state, subjectId, nowIso);
  const review = reviewView
    ? {
        subjectId,
        subjectName: reviewView.subjectName,
        candidates: reviewView.candidates.map((candidate) => ({
          roomId: candidate.roomId,
          topic: candidate.topic,
          dueLabel: candidate.dueLabel,
        })),
        dueCount: reviewDueCount(reviewView),
      }
    : null;

  const artifacts: LibraryArtifactEntry[] = [];
  for (const summary of subject.dungeon.rooms) {
    const room = subject.rooms[summary.roomId];
    if (!room?.artifactMarkdown) continue;
    const noteId = `${subject.dungeon.dungeonId}:${room.roomId}`;
    const collected = record?.collectedNotes.find((entry) => entry.noteId === noteId);
    artifacts.push({
      roomId: room.roomId,
      topic: summary.topic || room.topic,
      collected: collected !== undefined,
      collectedAt: collected?.collectedAt ?? null,
      artifactText: collected?.artifactMarkdown ?? null,
    });
  }

  const notes = (record?.collectedNotes ?? []).map((entry) => ({
    topic: entry.topic,
    collectedAt: entry.collectedAt,
  }));

  return {
    subjectId,
    subjectName: subject.dungeon.subjectName,
    review,
    artifacts,
    notes,
    noteCount: notes.length,
    emptyMessage:
      'Clear a room and take its artifact to fill the archive. Note text is never re-displayed here.',
  };
}

/* -------------------------------------------------------------------------- */
/* Guild Hall                                                                  */
/* -------------------------------------------------------------------------- */

export interface GuildSubjectEntry {
  subjectId: string;
  subjectName: string;
  clearedCount: number;
  roomCount: number;
  active: boolean;
}

export interface GuildView {
  questStep: string;
  nextQuestStep: string;
  /** `null` until an archetype is chosen; the host does not invent one. */
  archetype: string | null;
  subjects: GuildSubjectEntry[];
  emptyMessage: string;
}

/** Project the Guild Hall's quest board, archetype, and subject roster. */
export function projectGuild(state: EngineState): GuildView {
  const subjects = Object.values(state.subjects)
    .map((subject) => ({
      subjectId: subject.dungeon.dungeonId,
      subjectName: subject.dungeon.subjectName,
      clearedCount: Object.values(subject.rooms).filter((room) => room.validationState.finalPass)
        .length,
      roomCount: subject.dungeon.rooms.length,
      active: state.activeSubjectId === subject.dungeon.dungeonId,
    }))
    .sort((left, right) => left.subjectId.localeCompare(right.subjectId));

  return {
    questStep: state.session.questStep,
    nextQuestStep: nextQuestStep(state.session.questStep),
    archetype: state.session.playerClass,
    subjects,
    emptyMessage:
      'No subjects yet. Create one here through the Creator, then its portal appears on the street.',
  };
}

/* -------------------------------------------------------------------------- */
/* Trophy Hall                                                                 */
/* -------------------------------------------------------------------------- */

export interface TrophyFishEntry {
  name: string;
  rarity: string;
  subjectName: string;
}

export interface TrophyMetric {
  label: string;
  value: string;
}

export interface TrophyView {
  /** Human labels for earned badges and achievements, deduplicated. */
  badges: string[];
  fish: TrophyFishEntry[];
  /** Device records from `computeStatisticsSnapshot`; zeroes are real values. */
  metrics: TrophyMetric[];
  emptyMessage: string;
  fishEmptyMessage: string;
}

const PHASE_BADGE_LABELS: Readonly<Record<string, string>> = {
  CreatorPhaseComplete: 'Creator phase complete',
  ScribePhaseComplete: 'Scribe phase complete',
  ArchaeologistPhaseComplete: 'Archaeologist phase complete',
  ArchaeologistReviewPass3: 'Archaeologist: 3 review passes',
  ArchaeologistReviewPass7: 'Archaeologist: 7 review passes',
  ArchaeologistReviewPass15: 'Archaeologist: 15 review passes',
  [progression.SCRIBE_CENTURY_120_BADGE_ID]: progression.SCRIBE_CENTURY_120_BADGE_LABEL,
};

function humanizeId(id: string): string {
  return id.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ');
}

/** A badge id from the engine, in the words the trophy wall shows. */
export function trophyBadgeLabel(id: string): string {
  const phaseLabel = PHASE_BADGE_LABELS[id];
  if (phaseLabel) return phaseLabel;
  const fishing = progression.FISHING_BADGE_DEFS[id as progression.FishingBadgeId];
  if (fishing) return fishing.label;
  const achievement = progression.ACHIEVEMENTS.find((entry) => entry.id === id);
  if (achievement) return achievement.name;
  return humanizeId(id);
}

function statisticsInput(state: EngineState, nowIso: string): statistics.StatisticsComputationInput {
  return {
    now: nowIso,
    sessions: state.studySessions.map((session) => ({
      sessionId: session.sessionId,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      subjectId: session.subjectId,
      subjectName: session.subjectName,
      roomsVisited: session.roomsVisited,
      notesSubmitted: session.notesSubmitted,
      reviewsCompleted: session.reviewsCompleted,
      xpEarned: session.xpEarned,
    })),
    subjects: Object.entries(state.subjects).map(([subjectId, subject]) => {
      const record = state.progression[subjectId] ?? null;
      return {
        subjectId,
        subjectName: subject.dungeon.subjectName,
        snapshot: subject,
        progression: record,
        events: statistics.readStatisticsEventLedgerFromFields(record?.extraFields).events,
      };
    }),
  };
}

/**
 * Project the Trophy Hall.
 *
 * `nowIso` is injectable so the records table is a pure function of its input;
 * the host passes one clock read per projection.
 */
export function projectTrophy(state: EngineState, nowIso: string): TrophyView {
  const badgeIds = new Set<string>(state.achievements);
  const fish: TrophyFishEntry[] = [];
  for (const record of Object.values(state.progression)) {
    for (const badge of record.badges) badgeIds.add(badge);
    for (const entry of record.fishCollection) {
      fish.push({ name: entry.name, rarity: entry.rarity, subjectName: entry.subjectName });
    }
  }

  const snapshot = statistics.computeStatisticsSnapshot(statisticsInput(state, nowIso));
  const totals = snapshot.totals;
  const metrics: TrophyMetric[] = [
    { label: 'Sessions completed', value: String(totals.sessionsCompleted) },
    { label: 'Study time', value: `${totals.studyTimeMinutes} min` },
    { label: 'Notes submitted', value: String(totals.notesSubmitted) },
    { label: 'Reviews completed', value: String(totals.reviewsCompleted) },
    { label: 'Fish kept', value: String(totals.fishKept) },
    { label: 'Distinct fish species', value: String(totals.distinctFishSpecies) },
    { label: 'Rooms visited', value: String(totals.uniqueRoomsVisited) },
    { label: 'Active days', value: String(totals.activeDays) },
    { label: 'Consecutive study day streak', value: String(totals.consecutiveStudyDayStreak) },
    { label: 'Consecutive review day streak', value: String(totals.consecutiveReviewDayStreak) },
    { label: 'Subjects with proven mastery', value: String(totals.subjectsWithProvenMastery) },
  ];

  return {
    badges: [...badgeIds].map(trophyBadgeLabel).sort((left, right) => left.localeCompare(right)),
    fish,
    metrics,
    emptyMessage:
      'No badges or fish yet. Clearing rooms and passing reviews unlocks badges; keeping a catch at a pond fills the collection.',
    fishEmptyMessage:
      'No fish yet. Clear a room, then cast at a fishing pond and keep a catch to display it here.',
  };
}

/* -------------------------------------------------------------------------- */
/* Workshop                                                                    */
/* -------------------------------------------------------------------------- */

export interface WorkshopItemEntry {
  id: string;
  name: string;
  description: string;
  rarity: string;
  equipped: boolean;
  /** Engine equip slot, or `null` for an item the engine will not equip. */
  slot: string | null;
  equippable: boolean;
}

export interface WorkshopView {
  subjectId: string | null;
  subjectName: string | null;
  items: WorkshopItemEntry[];
  emptyMessage: string;
}

const NO_SUBJECT_WORKSHOP =
  'No subject yet. Create a subject in the Creator; equipment is stored per subject.';

/**
 * Which subject the Workshop and its equipment commands act on.
 *
 * The engine's `equipItem` requires an active subject, so the service projects
 * the active one first, then the most recently studied one, then a stable
 * (sorted) first subject. `main.ts` activates this subject for the duration of
 * the visit and returns to the village on close (K-15).
 */
export function equipmentSubjectId(state: EngineState): string | null {
  if (state.activeSubjectId && state.subjects[state.activeSubjectId]) {
    return state.activeSubjectId;
  }
  const recent = lastStudiedSubjectId(state);
  if (recent && state.subjects[recent]) return recent;
  return Object.keys(state.subjects).sort()[0] ?? null;
}

/** Project the Workshop's inventory and equipment for one subject. */
export function projectWorkshop(state: EngineState): WorkshopView {
  const subjectId = equipmentSubjectId(state);
  const subject = subjectId ? state.subjects[subjectId] : undefined;
  if (!subjectId || !subject) {
    return { subjectId: null, subjectName: null, items: [], emptyMessage: NO_SUBJECT_WORKSHOP };
  }

  const record = state.progression[subjectId];
  const equippedIds = new Set((record?.equippedItems ?? []).map((item) => item.id));
  const items = (record?.inventory ?? []).map((item) => {
    const equippable = progression.isEquippable(item);
    return {
      id: item.id,
      name: item.name,
      description: item.description,
      rarity: item.rarity,
      equipped: equippable ? item.equipped === true || equippedIds.has(item.id) : false,
      slot: equippable ? item.equipSlot : null,
      equippable,
    };
  });

  return {
    subjectId,
    subjectName: subject.dungeon.subjectName,
    items,
    emptyMessage:
      'No equipment yet. Clearing a room with a strong note can drop gear; reviews award XP and badges rather than items.',
  };
}

/* -------------------------------------------------------------------------- */
/* NPCs                                                                        */
/* -------------------------------------------------------------------------- */

export interface NpcLineView {
  npcId: string;
  label: string;
  line: string;
  source: 'quest' | 'quote' | 'greeting' | 'dialogue';
  lineCount: number;
  /** Host conversation state; pass it back unchanged on the next press. */
  cursor: { index: number; questStep: string };
}

/* -------------------------------------------------------------------------- */
/* Fish Stand                                                                  */
/* -------------------------------------------------------------------------- */

export interface FishStandEntry {
  name: string;
  rarity: string;
  subjectName: string;
  caughtAt: string;
}

export interface FishStandView {
  fish: FishStandEntry[];
  emptyMessage: string;
}

/**
 * Project the Fish Stand.
 *
 * Display-only by product decision: the engine has no sell or trade command and
 * this projection deliberately exposes no action.
 */
export function projectFishStand(state: EngineState): FishStandView {
  const fish: FishStandEntry[] = [];
  for (const record of Object.values(state.progression)) {
    for (const entry of record.fishCollection) {
      fish.push({
        name: entry.name,
        rarity: entry.rarity,
        subjectName: entry.subjectName,
        caughtAt: entry.caughtAt,
      });
    }
  }
  return {
    fish,
    emptyMessage:
      'No fish yet. Clear a room, then cast at a fishing pond and keep a catch to display it here.',
  };
}
