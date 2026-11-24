import { assistance, progression, type EngineState } from '@/index';
import { isDueCandidate, projectReviewForSubject, reviewDueCount } from '../review/projection';
import { assistanceStudyAggregate, computeDeviceStatistics } from '../statistics/projection';
import type { HostSettings } from '../settings';
import { trophyBadgeLabel } from '../village/projection';

/**
 * Pure Journal and assistance projections (P8).
 *
 * The journal is a read model over the host's cached `EngineState`. XP, rank,
 * badges, inventory, fish, and due rooms are read from engine records; records
 * come from the engine's own `computeStatisticsSnapshot`; suggestions come from
 * the engine's `rankAssistance`. There is no DOM, no command, no clock of its
 * own, and no `snapshot()` call.
 */

/** The feature flag the engine accepts as a boolean. */
export const ADAPTIVE_ASSISTANCE_FLAG_NAME = 'VITE_ADAPTIVE_ASSISTANCE';

/**
 * The flag is read once at module load. The engine deliberately does not import
 * `src/config/`, so the host names the flag and passes the resolved boolean.
 * A missing value means "on"; only an explicit `false`/`0` disables it.
 */
function readAdaptiveAssistanceFlag(): boolean {
  const env = (import.meta as ImportMeta & {
    readonly env?: Readonly<Record<string, unknown>>;
  }).env;
  const value = env?.[ADAPTIVE_ASSISTANCE_FLAG_NAME];
  return value !== 'false' && value !== '0';
}

export const ADAPTIVE_ASSISTANCE_ENABLED = readAdaptiveAssistanceFlag();

export interface JournalSubjectView {
  subjectId: string;
  subjectName: string;
  xp: number;
  rank: string;
  roomsCleared: number;
  totalRooms: number;
  /** Human labels for the progress record's badges. */
  badges: string[];
  fishCount: number;
  dueRooms: number;
  /** The newest study-session timestamp for this subject, or `null`. */
  lastPlayedIso: string | null;
}

/** One room that is actually waiting for review, with the engine's due label. */
export interface JournalDueView {
  subjectId: string;
  subjectName: string;
  roomId: string;
  topic: string;
  dueLabel: string;
  overdueDays: number;
}

export interface JournalView {
  subjects: JournalSubjectView[];
  activeSubjectId: string | null;
  questStep: string;
  archetype: string | null;
  stats: ReturnType<typeof computeDeviceStatistics>;
  /**
   * Always `null` here. `projectAssistance` is separate so opening the journal
   * stays a fast projection; the host fills this in when it renders.
   */
  assistance: assistance.AssistanceResult | null;
  inventory: { id: string; name: string; equipped: boolean; slot: string | null }[];
  fish: { name: string; rarity: string; subjectName: string }[];
  /** Rooms due now, across every subject, most overdue first. */
  due: JournalDueView[];
}

const DEFAULT_RANK = 'Novice';

function lastPlayedFor(state: EngineState, subjectId: string): string | null {
  let lastIso: string | null = null;
  let lastMs = Number.NEGATIVE_INFINITY;
  for (const session of state.studySessions) {
    if (session.subjectId !== subjectId) continue;
    const candidate = session.endedAt ?? session.startedAt;
    const ms = Date.parse(candidate);
    if (!Number.isFinite(ms)) continue;
    if (ms > lastMs) {
      lastMs = ms;
      lastIso = candidate;
    }
  }
  return lastIso;
}

function dueForSubject(
  state: EngineState,
  subjectId: string,
  nowIso: string,
): JournalDueView[] {
  const review = projectReviewForSubject(state, subjectId, nowIso);
  if (!review) return [];
  const due: JournalDueView[] = [];
  for (const candidate of review.candidates) {
    if (!isDueCandidate(candidate)) continue;
    due.push({
      subjectId,
      subjectName: review.subjectName,
      roomId: candidate.roomId,
      topic: candidate.topic,
      dueLabel: candidate.dueLabel,
      overdueDays: candidate.overdueDays,
    });
  }
  return due;
}

/**
 * Project the journal from engine state.
 *
 * Subject rows are sorted by id so the list is stable. `nowIso` is injected;
 * the host passes one clock read per projection. Statistics are computed by the
 * engine and become `null` if a malformed save cannot be projected, which the
 * panel renders as "no records yet".
 */
export function projectJournal(state: EngineState, nowIso: string): JournalView {
  const subjects: JournalSubjectView[] = [];
  const inventory: JournalView['inventory'] = [];
  const fish: JournalView['fish'] = [];
  const due: JournalDueView[] = [];

  for (const subjectId of Object.keys(state.subjects).sort()) {
    const subject = state.subjects[subjectId];
    if (!subject) continue;
    const record = state.progression[subjectId];
    const review = projectReviewForSubject(state, subjectId, nowIso);
    subjects.push({
      subjectId,
      subjectName: subject.dungeon.subjectName,
      xp: record?.xpTotal ?? 0,
      rank: record?.rank ?? DEFAULT_RANK,
      roomsCleared: Object.values(subject.rooms).filter(
        (room) => room.validationState.finalPass,
      ).length,
      totalRooms: subject.dungeon.rooms.length,
      badges: (record?.badges ?? []).map(trophyBadgeLabel),
      fishCount: record?.fishCollection.length ?? 0,
      dueRooms: reviewDueCount(review),
      lastPlayedIso: lastPlayedFor(state, subjectId),
    });
    due.push(...dueForSubject(state, subjectId, nowIso));

    const equippedIds = new Set((record?.equippedItems ?? []).map((item) => item.id));
    for (const item of record?.inventory ?? []) {
      const equippable = progression.isEquippable(item);
      inventory.push({
        id: item.id,
        name: item.name,
        equipped: equippable ? item.equipped === true || equippedIds.has(item.id) : false,
        slot: equippable ? item.equipSlot : null,
      });
    }
    for (const entry of record?.fishCollection ?? []) {
      fish.push({ name: entry.name, rarity: entry.rarity, subjectName: entry.subjectName });
    }
  }

  due.sort(
    (left, right) =>
      right.overdueDays - left.overdueDays ||
      left.subjectName.localeCompare(right.subjectName) ||
      left.topic.localeCompare(right.topic) ||
      left.roomId.localeCompare(right.roomId),
  );

  return {
    subjects,
    activeSubjectId: state.activeSubjectId,
    questStep: state.session.questStep,
    archetype: state.session.playerClass,
    stats: computeDeviceStatistics(state, nowIso),
    assistance: null,
    inventory,
    fish,
    due,
  };
}

/**
 * Rank adaptive assistance for the journal.
 *
 * The engine's `toAssistanceSubjects` adapter builds each subject so no room
 * object is hand-written; `collectAssistanceSignals` derives the two live
 * signals and leaves the two historical ones at zero because this host keeps no
 * assistance record. The study aggregate is optional and omitted when the
 * statistics snapshot is unavailable.
 */
export function projectAssistance(
  state: EngineState,
  settings: HostSettings,
  nowIso: string,
  flagEnabled: boolean = ADAPTIVE_ASSISTANCE_ENABLED,
): assistance.AssistanceResult {
  const subjectIds = Object.keys(state.subjects).sort();
  const subjects = assistance.toAssistanceSubjects(
    subjectIds.map((subjectId) => state.subjects[subjectId]),
  );
  const signals = assistance.collectAssistanceSignals({ subjects, stored: null });
  const study = assistanceStudyAggregate(state, nowIso);
  return assistance.rankAssistance({
    mode: settings.assistanceMode,
    signals,
    subjects,
    nowIso,
    flagEnabled,
    ...(study === null ? {} : { study }),
  });
}
