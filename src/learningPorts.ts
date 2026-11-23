import { createEncounterController, type EncounterProgressionPort } from './application/encounterCommands';
import { createReviewController } from './application/reviewCommands';
import { generateRoomArtifact } from './core/artifacts';
import { deriveGraphHierarchy, setRoomStatus } from './core/graph';
import { awardRoomClearProgression, assignRankTier, computeEquipBonuses, rollEquippableLoot } from './core/progression';
import { decideRoomClearReward, writeRoomClearRewardLedgerToFields } from './core/progression/roomClearRewards';
import { applyInterruptedReviewSessionWrite } from './core/review/interruptedReviewSession';
import { decideReviewPassReward, writeReviewPassRewardLedgerToFields } from './core/review/reviewPassRewards';
import { clampQualityRating, updateSm2State } from './core/review/spacedRepetition';
import { evaluateNoteValidation } from './core/validation/notes';
import type { EngineState } from './storage';
import { updateAchievements } from './achievements';
import { recordAwardStatistics } from './awardStatistics';

function active(state: EngineState) {
  const id = state.activeSubjectId;
  if (!id || !state.subjects[id] || !state.progression[id]) throw new Error('No active subject');
  return { snapshot: state.subjects[id], progression: state.progression[id] };
}

export function createLearningPorts(state: EngineState, nowIso: () => string, random: () => number = Math.random,
  newAttachmentId: () => string = () => crypto.randomUUID()) {
  function allocateAttachmentId(): string {
    const id = newAttachmentId();
    if (!id.trim() || ['__proto__', 'constructor', 'prototype'].includes(id) ||
        Object.hasOwn(state.attachmentBytes, id) ||
        Object.values(state.subjects).some((snapshot) =>
          Object.values(snapshot.rooms).some((room) => room.attachments.some((item) => item.attachmentId === id)))) {
      throw new Error('Invalid or duplicate attachment id');
    }
    return id;
  }
  const subject = {
    readSnapshot: () => {
      const id = state.activeSubjectId;
      return id ? structuredClone(state.subjects[id] ?? null) : null;
    },
    async submitNote(roomId: string, noteText: string, manualConfirmed: boolean) {
      const { snapshot } = active(state);
      const room = snapshot.rooms[roomId];
      if (!room) throw new Error('Room not found');
      const validation = evaluateNoteValidation({ noteText, manualConfirmed, roomTopic: room.topic });
      const now = nowIso();
      const artifact = validation.finalPass
        ? generateRoomArtifact({
            subjectName: snapshot.dungeon.subjectName, roomId, roomTopic: room.topic,
            noteText, criterionScores: validation.criterionScores, qualityBonus: validation.qualityBonus,
            generatedAtIso: now,
          }).markdown
        : null;
      const status = validation.finalPass ? 'ArtifactCollected' : 'NotesDrafted';
      const changed = setRoomStatus(snapshot.dungeon, roomId, status);
      if (!changed.ok) throw new Error(changed.error.message);
      snapshot.dungeon = {
        ...changed.value,
        phaseState: validation.finalPass && ['CreatorActive', 'SubjectCreated'].includes(changed.value.phaseState)
          ? 'ScribeActive' : changed.value.phaseState,
        updatedAt: now,
      };
      snapshot.rooms[roomId] = {
        ...room, state: status, updatedAt: now, noteText, artifactMarkdown: artifact,
        validationState: {
          wordCount: validation.wordCount, requiredSectionsPresent: validation.requiredSectionsPresent,
          manualConfirmed: validation.manualConfirmed, criterionScores: validation.criterionScores,
          failedChecks: [...validation.failedChecks], qualityBonus: validation.qualityBonus,
          finalPass: validation.finalPass,
        },
      };
      return { ...validation, artifactMarkdown: artifact };
    },
    recordReviewPass(roomId: string, qualityRating: number) {
      const { snapshot } = active(state);
      const room = snapshot.rooms[roomId];
      if (!room || !room.validationState.finalPass) throw new Error('Room is not reviewable');
      const previousState = room.sm2QualityResponse != null ? {
        qualityResponse: clampQualityRating(room.sm2QualityResponse),
        easeFactor: room.sm2EaseFactor ?? 2.5,
        intervalDays: Math.max(1, room.sm2IntervalDays ?? 1),
        nextReviewDate: room.sm2NextReviewDate ?? nowIso(),
        consecutiveCorrect: Math.max(0, room.sm2ConsecutiveCorrect ?? 0),
      } : null;
      const reviewedAtIso = nowIso();
      const sm2 = updateSm2State({ quality: clampQualityRating(qualityRating), previousState, reviewedAtIso });
      snapshot.rooms[roomId] = {
        ...room, reviewPassCount: room.reviewPassCount + 1, updatedAt: reviewedAtIso,
        sm2QualityResponse: sm2.qualityResponse, sm2EaseFactor: sm2.easeFactor,
        sm2IntervalDays: sm2.intervalDays, sm2NextReviewDate: sm2.nextReviewDate,
        sm2ConsecutiveCorrect: sm2.consecutiveCorrect,
      };
      return Promise.resolve();
    },
    async addDeviceLocalAttachment(roomId: string, file: Blob & { readonly name?: string }) {
      const { snapshot } = active(state);
      const room = snapshot.rooms[roomId];
      if (!room) throw new Error('Room not found');
      const attachmentId = allocateAttachmentId();
      const now = nowIso();
      const attachment = { attachmentId, sourceType: 'local' as const,
        fileName: file.name ?? 'attachment', mimeType: file.type || 'application/octet-stream', addedAt: now };
      state.attachmentBytes[attachmentId] = new Uint8Array(await file.arrayBuffer());
      snapshot.rooms[roomId] = { ...room, updatedAt: now, attachments: [...room.attachments, attachment] };
      return attachment;
    },
    async addExternalAttachment(roomId: string, url: string) {
      const { snapshot } = active(state);
      const room = snapshot.rooms[roomId];
      if (!room) throw new Error('Room not found');
      const normalized = url.trim();
      const pathname = normalized.startsWith('/') && !normalized.startsWith('//')
        ? normalized : (() => {
            const parsed = new URL(normalized);
            if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('Unsupported URL protocol');
            return parsed.pathname;
          })();
      const fileName = pathname.split('/').pop() || 'image';
      const mimeByExtension: Record<string, string> = {
        png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
        gif: 'image/gif', svg: 'image/svg+xml',
      };
      const ext = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : '';
      const now = nowIso();
      const attachment = { attachmentId: allocateAttachmentId(), sourceType: 'external' as const, fileName,
        mimeType: mimeByExtension[ext] ?? 'image/jpeg', externalUrl: normalized, addedAt: now };
      snapshot.rooms[roomId] = { ...room, updatedAt: now, attachments: [...room.attachments, attachment] };
      return attachment;
    },
    async removeAttachment(roomId: string, attachmentId: string) {
      const { snapshot } = active(state);
      const room = snapshot.rooms[roomId];
      if (!room) throw new Error('Room not found');
      if (!room.attachments.some((item) => item.attachmentId === attachmentId)) throw new Error('Attachment not found');
      delete state.attachmentBytes[attachmentId];
      snapshot.rooms[roomId] = { ...room, updatedAt: nowIso(),
        attachments: room.attachments.filter((item) => item.attachmentId !== attachmentId) };
    },
  };

  const encounterProgression: EncounterProgressionPort = {
    awardRoomClear(input) {
      const { progression } = active(state);
      if (!input.clear) throw new Error('Room-clear identity is required');
      const decision = decideRoomClearReward({ extraFields: progression.extraFields, ...input.clear, awardedAt: nowIso() });
      if (decision.outcome === 'already-awarded') {
        return { awarded: false, duplicate: true, xpGained: 0, newRank: progression.rank,
          rankChanged: false, unlockedBadges: [], loot: null, unlockedAchievements: [] };
      }
      const bonuses = computeEquipBonuses(progression.equippedItems);
      const streak = progression.streakCount + 1 + bonuses.streakBonus;
      const result = awardRoomClearProgression({
        currentXpTotal: progression.xpTotal, existingBadges: progression.badges,
        qualityBonus: input.qualityBonus + bonuses.qualityBonus + progression.streakCount,
        streakCount: streak,
        badgeProgress: {
          totalRooms: input.totalRooms, creatorMappedRooms: input.creatorMappedRooms,
          scribeClearedRooms: input.scribeClearedRooms,
          archaeologistFullReviewPasses: input.archaeologistFullReviewPasses,
        },
      });
      if (!result.ok) throw new Error(result.error.message);
      const value = result.value;
      const loot = input.isBossEncounter || input.qualityBonus >= 4
        ? rollEquippableLoot(input.qualityBonus, input.bossMinLootRarity, random, () => new Date(nowIso())) : null;
      progression.xpTotal = value.xpTotalAfter;
      progression.rank = value.rankAfter;
      progression.badges = value.progressionSnapshot.badges;
      progression.streakCount = streak;
      progression.roomsCleared++;
      if (input.isBossEncounter) progression.bossesDefeated++;
      if (loot) progression.inventory.push(loot);
      progression.extraFields = writeRoomClearRewardLedgerToFields(progression.extraFields, decision.ledger);
      recordAwardStatistics(progression, { kind: 'note-submission', identity: input.clear },
        nowIso(), value.xpBreakdown.totalDelta);
      return { awarded: true, duplicate: false, xpGained: value.xpBreakdown.totalDelta,
        newRank: value.rankAfter, rankChanged: value.rankAfter !== value.rankBefore,
        unlockedBadges: value.unlockedBadges, loot, unlockedAchievements: updateAchievements(state) };
    },
    awardBadge(id) {
      const { progression } = active(state);
      if (progression.badges.includes(id)) return false;
      progression.badges.push(id);
      return true;
    },
  };

  const reviewProgression = {
    readPreservedFields: () => active(state).progression.extraFields,
    writeReviewSession: (write: Parameters<typeof applyInterruptedReviewSessionWrite>[1]) => {
      const { progression } = active(state);
      progression.extraFields = applyInterruptedReviewSessionWrite(progression.extraFields, write) ?? {};
    },
    awardReviewPass(review: { roomId: string; passNumber: number; reviewIdentity: string }) {
      const { progression } = active(state);
      const decision = decideReviewPassReward({ extraFields: progression.extraFields,
        roomId: review.roomId, passNumber: review.passNumber, awardedAt: nowIso() });
      if (decision.outcome === 'already-awarded') return {
        awarded: false, duplicate: true, xpGained: 0, newRank: progression.rank,
        rankChanged: false, unlockedAchievements: [],
      };
      const xp = 6 + computeEquipBonuses(progression.equippedItems).xpBonus;
      const previousRank = progression.rank;
      progression.xpTotal += xp;
      progression.rank = assignRankTier(progression.xpTotal);
      progression.reviewPasses++;
      progression.extraFields = applyInterruptedReviewSessionWrite(
        writeReviewPassRewardLedgerToFields(progression.extraFields, decision.ledger),
        { kind: 'discard', roomId: review.roomId },
      ) ?? {};
      recordAwardStatistics(progression, { kind: 'review-completion', identity: review }, nowIso(), xp);
      return { awarded: true, duplicate: false, xpGained: xp, newRank: progression.rank,
        rankChanged: progression.rank !== previousRank, unlockedAchievements: updateAchievements(state) };
    },
  };

  return {
    encounter: createEncounterController({
      subject, progression: encounterProgression, nowIso,
      artifactCollection: {
        collectArtifact: ({ payload }) => {
          const { snapshot, progression } = active(state);
          const room = snapshot.rooms[payload.roomId];
          if (!room?.artifactMarkdown) throw new Error('Room has no artifact');
          const noteId = `${snapshot.dungeon.dungeonId}:${room.roomId}`;
          if (progression.collectedNotes.some((entry) => entry.noteId === noteId)) return;
          const hierarchy = deriveGraphHierarchy(snapshot.dungeon);
          const floorId = hierarchy.floorIdByRoomId[room.roomId] ?? snapshot.dungeon.rootRoomId;
          const source = room.noteText.trim() || room.artifactMarkdown;
          progression.collectedNotes.unshift({
            noteId, dungeonId: snapshot.dungeon.dungeonId, roomId: room.roomId, topic: room.topic,
            floorLabel: hierarchy.floorLabelByFloorId[floorId] ?? snapshot.dungeon.subjectName,
            artifactPreview: source.replace(/^#\s+.*$/gm, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '')
              .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim().slice(0, 180),
            noteMarkdown: source, artifactMarkdown: room.artifactMarkdown, collectedAt: nowIso(),
          });
          progression.artifacts++;
          updateAchievements(state);
        },
      },
    }),
    review: createReviewController({ subject, progression: reviewProgression, nowIso }),
  };
}
