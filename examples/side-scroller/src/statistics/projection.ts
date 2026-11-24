import { assistance, statistics, type EngineState } from '@/index';

/**
 * Shared projection of the engine's statistics input.
 *
 * The Trophy Hall (P7) and the Journal (P8) both need the same snapshot. The
 * engine owns every metric; this module only assembles the input its pure
 * function expects from the host's cached `EngineState`. There is no second
 * arithmetic rule and no `snapshot()` call.
 */

/** The exact `StatisticsComputationInput` the engine's `computeStatisticsSnapshot` takes. */
export function statisticsInput(
  state: EngineState,
  nowIso: string,
): statistics.StatisticsComputationInput {
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
 * The engine's device snapshot, or `null` when a malformed save cannot be
 * projected. The Journal renders "no records yet" for `null` instead of
 * failing to open.
 */
export function computeDeviceStatistics(
  state: EngineState,
  nowIso: string,
): statistics.StatisticsSnapshot | null {
  try {
    return statistics.computeStatisticsSnapshot(statisticsInput(state, nowIso));
  } catch {
    return null;
  }
}

/**
 * The optional study aggregate the assistance engine accepts.
 *
 * `roomsCleared` is the durable room-clear ledger count the engine publishes
 * per subject (`roomsClearedAwarded`), never the host's own sum of cleared
 * rooms. The other fields are totals the engine already computed.
 */
export function assistanceStudyAggregate(
  state: EngineState,
  nowIso: string,
): assistance.AssistanceStudyInput | null {
  const snapshot = computeDeviceStatistics(state, nowIso);
  if (!snapshot) return null;
  return {
    roomsCleared: snapshot.subjects.reduce(
      (sum, subject) => sum + subject.roomsClearedAwarded,
      0,
    ),
    notesSubmitted: snapshot.totals.notesSubmitted,
    reviewsCompleted: snapshot.totals.reviewsCompleted,
    activeDays: snapshot.totals.activeDays,
    fishKept: snapshot.totals.fishKept,
  };
}
