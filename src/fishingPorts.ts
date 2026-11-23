import { createFishingController } from './application/fishingCommands';
import {
  CATCH_OUTCOME_POLICY, createCanonicalFishEntry, decideCatchReward,
  writeCatchRewardLedgerToFields, withRecallRoom,
} from './core/fishing/catchRewards';
import type { EngineState } from './storage';
import { updateAchievements } from './achievements';
import { recordAwardStatistics } from './awardStatistics';

export function createFishingPorts(state: EngineState, nowIso: () => string, mintSessionId: () => string) {
  return createFishingController({
    nowIso,
    mintSessionId,
    session: { readSession: () => state.fishingSession },
    subject: { readSnapshot: (id) => state.subjects[id] ?? null },
    progression: {
      readPreservedFields: (id) => state.progression[id]?.extraFields,
      commitCatch(input) {
        const progression = state.progression[input.subjectId];
        if (!progression) throw new Error('Fishing subject does not exist');
        const decline = { awarded: false, duplicate: false, xpGained: 0, newRank: null,
          rankChanged: false, unlockedBadges: [], fishEntryId: null };
        if (!CATCH_OUTCOME_POLICY[input.outcome].mutatesProgression) return decline;
        const at = nowIso();
        const entry = createCanonicalFishEntry({
          catalogEntry: input.catalogEntry, subjectId: input.subjectId, subjectName: input.subjectName,
          caughtAt: at, entrySuffix: input.identity.catchIdentity,
        });
        const decision = decideCatchReward({
          extraFields: progression.extraFields, identity: input.identity, outcome: input.outcome,
          xpTotal: progression.xpTotal, rank: progression.rank, collection: progression.fishCollection,
          heldBadges: progression.badges, fishEntry: entry, awardedAt: at,
        });
        if (decision.outcome === 'already-awarded') return { ...decline, duplicate: true };
        if (decision.outcome !== 'awarded') return decline;
        const recorded = withRecallRoom(decision, input.recallRoomId);
        progression.fishCollection.unshift(recorded.fishEntry);
        progression.xpTotal = recorded.nextXpTotal;
        progression.rank = recorded.rank;
        progression.badges.push(...recorded.badgesUnlocked);
        progression.extraFields = writeCatchRewardLedgerToFields(progression.extraFields, recorded.ledger);
        recordAwardStatistics(progression, { kind: 'fishing-outcome', identity: input.identity }, at, recorded.xpAwarded);
        updateAchievements(state);
        return { awarded: true, duplicate: false, xpGained: recorded.xpAwarded,
          newRank: recorded.rank, rankChanged: recorded.rankChanged,
          unlockedBadges: [...recorded.badgesUnlocked], fishEntryId: recorded.fishEntry.id };
      },
    },
  });
}
