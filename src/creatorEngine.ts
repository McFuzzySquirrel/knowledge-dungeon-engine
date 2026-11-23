import { createCreatorGraphController } from './application/creatorGraphCommands';
import type { FishingCommand, GraphCommand, ReviewCommand, EncounterCommand, EncounterNoteSubmitPayload } from './application/contracts/commands';
import { createRootDungeon, type GraphDomainResult, type RootDungeonInitInput } from './core/graph';
import { makeDefaultSubjectProgression } from './core/progression/canonicalProgression';
import { makeEmptyRoomMetadata, type SubjectSnapshot } from './core/validation/persistence';
import { createEmptyState, type EngineState, type EngineStorage } from './storage';
import { createLearningPorts } from './learningPorts';
import { isValidQualityRating } from './core/review/spacedRepetition';
import { createFishingPorts } from './fishingPorts';
import { isEquippable } from './core/progression/lootSystem';
import { evaluatePhaseBadgeUnlocks } from './core/progression/progressionEngine';
import { updateAchievements } from './achievements';
import type { PlayerClassId } from './application/contracts/world';
import { nextQuestStep, QUEST_STEPS, type QuestStep, type StudyPhase } from './session';
import { createTutorialSubject, TUTORIAL_SUBJECT_ID } from './data/tutorialSubject';
import { isFishingEligible } from './core/fishing/fishingStateMachine';
import { getDungeonPortalSlots, VILLAGE_MAP, type VillageStructure } from './data/villageLayout';
import { endStudySession, recordStudyActivity, startStudySession } from './studySessions';

export interface CreatorEngineOptions {
  storage: EngineStorage;
  nowIso(): string;
  newRoomId(): string;
  newSessionId?(): string;
  newStudySessionId?(): string;
  random?(): number;
  newAttachmentId?(): string;
  onListenerError?(error: unknown): void;
}

function validId(id: string): boolean {
  return id.trim().length > 0 && !['__proto__', 'constructor', 'prototype'].includes(id);
}

/**
 * Stateful headless facade. Use one instance per storage adapter.
 */
export class CreatorEngine {
  private queue: Promise<void> = Promise.resolve();
  private listeners = new Set<(state: EngineState) => void>();

  private constructor(
    private state: EngineState,
    private readonly options: CreatorEngineOptions,
  ) {}

  static async open(options: CreatorEngineOptions): Promise<CreatorEngine> {
    const state = await options.storage.load();
    if (state !== null && state.version !== 1) {
      throw new Error('Unsupported engine state version');
    }
    return new CreatorEngine(structuredClone(state ?? createEmptyState()), options);
  }
  snapshot(): EngineState {
    return structuredClone(this.state);
  }

  subscribe(listener: (state: EngineState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  activateSubject(subjectId: string) {
    return this.serialize(async () => {
      if (!Object.hasOwn(this.state.subjects, subjectId)) throw new Error('Subject not found');
      const next = structuredClone(this.state);
      next.activeSubjectId = subjectId;
      next.fishingSession = null;
      startStudySession(next, subjectId, this.options.nowIso(), this.mintStudySessionId);
      await this.commit(next);
      return structuredClone(next.subjects[subjectId]);
    });
  }

  setPhase(phase: StudyPhase) {
    return this.serialize(async () => {
      if (!['creator', 'scribe', 'archaeologist'].includes(phase)) throw new Error('Invalid study phase');
      const next = structuredClone(this.state);
      next.session.phase = phase;
      await this.commit(next);
    });
  }

  selectArchetype(playerClass: PlayerClassId) {
    return this.serialize(async () => {
      if (!['scholar', 'cartographer', 'archivist'].includes(playerClass)) throw new Error('Invalid archetype');
      const next = structuredClone(this.state);
      next.session.playerClass = playerClass;
      if (next.session.questStep === 'pick-archetype') next.session.questStep = nextQuestStep(next.session.questStep);
      await this.commit(next);
    });
  }

  setQuestStep(step: QuestStep) {
    return this.serialize(async () => {
      if (!QUEST_STEPS.includes(step)) throw new Error('Invalid quest step');
      const next = structuredClone(this.state);
      next.session.questStep = step;
      await this.commit(next);
    });
  }

  advanceQuest() {
    return this.serialize(async () => {
      const next = structuredClone(this.state);
      next.session.questStep = nextQuestStep(next.session.questStep);
      await this.commit(next);
      return next.session.questStep;
    });
  }

  startTutorial() {
    return this.serialize(async () => {
      const next = structuredClone(this.state);
      if (!next.subjects[TUTORIAL_SUBJECT_ID]) {
        next.subjects[TUTORIAL_SUBJECT_ID] = createTutorialSubject(this.options.nowIso());
        next.progression[TUTORIAL_SUBJECT_ID] = {
          ...makeDefaultSubjectProgression(), subjectId: TUTORIAL_SUBJECT_ID, extraFields: {},
        };
      }
      next.activeSubjectId = TUTORIAL_SUBJECT_ID;
      next.fishingSession = null;
      next.session = { phase: 'scribe', playerClass: 'scholar', questStep: 'enter-dungeon', world: 'dungeon' };
      startStudySession(next, TUTORIAL_SUBJECT_ID, this.options.nowIso(), this.mintStudySessionId);
      await this.commit(next);
      return structuredClone(next.subjects[TUTORIAL_SUBJECT_ID]);
    });
  }

  villageStructures(): VillageStructure[] {
    const subjects = Object.values(this.state.subjects);
    const portals = getDungeonPortalSlots().flatMap((slot, index) => {
      const subject = subjects[index];
      if (!subject) return [];
      return [{
        id: `portal-${subject.dungeon.dungeonId}`, type: 'portal-icon' as const,
        label: subject.dungeon.subjectName, gridX: slot.gridX, gridY: slot.gridY, width: 2, height: 3,
        subjectId: subject.dungeon.dungeonId, subjectName: subject.dungeon.subjectName,
        roomCount: subject.dungeon.rooms.length,
        clearedCount: Object.values(subject.rooms).filter((room) => room.validationState.finalPass).length,
      }];
    });
    return structuredClone([...VILLAGE_MAP.structures, ...portals]);
  }

  interactVillageStructure(structureId: string) {
    return this.serialize(async () => {
      const structure = this.villageStructures().find((item) => item.id === structureId);
      if (!structure) throw new Error('Village structure not found');
      const next = structuredClone(this.state);
      if (structure.type === 'portal-icon' && structure.subjectId) {
        next.activeSubjectId = structure.subjectId;
        next.fishingSession = null;
        next.session.phase = 'scribe';
        next.session.playerClass ??= 'scholar';
        next.session.world = 'dungeon';
      } else if (structure.type === 'guild-hall') {
        next.session.questStep = nextQuestStep(next.session.questStep);
      } else if (structure.type === 'training-gate') {
        if (!next.subjects[TUTORIAL_SUBJECT_ID]) {
          next.subjects[TUTORIAL_SUBJECT_ID] = createTutorialSubject(this.options.nowIso());
          next.progression[TUTORIAL_SUBJECT_ID] = {
            ...makeDefaultSubjectProgression(), subjectId: TUTORIAL_SUBJECT_ID, extraFields: {},
          };
        }
        next.activeSubjectId = TUTORIAL_SUBJECT_ID;
        next.fishingSession = null;
        next.session = { phase: 'scribe', playerClass: 'scholar', questStep: 'enter-dungeon', world: 'dungeon' };
      } else {
        return { kind: 'structure' as const, structure };
      }
      if (next.activeSubjectId && next.session.world === 'dungeon') {
        startStudySession(next, next.activeSubjectId, this.options.nowIso(), this.mintStudySessionId);
      }
      await this.commit(next);
      return { kind: 'structure' as const, structure };
    });
  }

  returnToVillage() {
    return this.serialize(async () => {
      const next = structuredClone(this.state);
      next.session.world = 'village';
      next.activeSubjectId = null;
      next.fishingSession = null;
      endStudySession(next, this.options.nowIso());
      await this.commit(next);
    });
  }

  private readonly mintStudySessionId = () => this.options.newStudySessionId?.() ?? crypto.randomUUID();

  recordRoomVisit(roomId: string) {
    return this.serialize(async () => {
      const next = structuredClone(this.state);
      const subject = next.activeSubjectId ? next.subjects[next.activeSubjectId] : undefined;
      if (!subject || !Object.hasOwn(subject.rooms, roomId)) throw new Error('Room not found in active subject');
      if (!next.activeStudySessionId) throw new Error('No active study session');
      recordStudyActivity(next, this.options.nowIso(), { kind: 'visit', roomId });
      await this.commit(next);
    });
  }

  endStudySession(recover = false) {
    return this.serialize(async () => {
      if (!this.state.activeStudySessionId) return;
      const next = structuredClone(this.state);
      endStudySession(next, this.options.nowIso(), recover);
      await this.commit(next);
    });
  }

  private serialize<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  private async commit(next: EngineState): Promise<void> {
    await this.options.storage.save(structuredClone(next));
    this.state = next;
    for (const listener of this.listeners) {
      try {
        listener(structuredClone(next));
      } catch (error) {
        if (this.options.onListenerError) {
          try {
            this.options.onListenerError(error);
          } catch (handlerError) {
            console.error('Engine listener error handler failed:', handlerError);
          }
        } else {
          console.error('Engine state listener failed:', error);
        }
      }
    }
  }

  createSubject(input: RootDungeonInitInput): Promise<GraphDomainResult<SubjectSnapshot>> {
    return this.serialize(async () => {
      if (!validId(input.dungeonId) || !validId(input.rootRoomId)) {
        throw new Error('Invalid subject id');
      }
      if (Object.hasOwn(this.state.subjects, input.dungeonId)) {
        throw new Error('Subject already exists');
      }
      const result = createRootDungeon(input);
      if (!result.ok) return result;
      const dungeon = result.value;
      const snapshot: SubjectSnapshot = {
        dungeon,
        rooms: {
          [dungeon.rootRoomId]: makeEmptyRoomMetadata({
            roomId: dungeon.rootRoomId,
            topic: dungeon.rooms[0].topic,
            nowIso: input.nowIso,
          }),
        },
      };
      const next = structuredClone(this.state);
      next.subjects[dungeon.dungeonId] = snapshot;
      next.progression[dungeon.dungeonId] = {
        ...makeDefaultSubjectProgression(),
        subjectId: dungeon.dungeonId,
        extraFields: {},
      };
      next.activeSubjectId = dungeon.dungeonId;
      startStudySession(next, dungeon.dungeonId, this.options.nowIso(), this.mintStudySessionId);
      await this.commit(next);
      return { ok: true, value: structuredClone(snapshot) };
    });
  }

  dispatchGraph(command: GraphCommand) {
    return this.serialize(async () => {
      const activeId = this.state.activeSubjectId;
      const controller = createCreatorGraphController({
        nowIso: this.options.nowIso,
        newRoomId: () => {
          const id = this.options.newRoomId();
          if (!validId(id)) throw new Error('Invalid room id');
          return id;
        },
        store: {
          readSnapshot: () => activeId ? structuredClone(this.state.subjects[activeId] ?? null) : null,
          commit: async (snapshot) => {
            if (!activeId) throw new Error('No active subject');
            const next = structuredClone(this.state);
            const previousIds = Object.values(next.subjects[activeId].rooms)
              .flatMap((room) => room.attachments.map((item) => item.attachmentId));
            const retainedIds = new Set(Object.values(snapshot.rooms)
              .flatMap((room) => room.attachments.map((item) => item.attachmentId)));
            for (const id of previousIds) {
              if (!retainedIds.has(id)) delete next.attachmentBytes[id];
            }
            next.subjects[activeId] = structuredClone(snapshot);
            await this.commit(next);
          },
          reportFailure: () => {},
        },
      });
      return controller.dispatch(command);
    });
  }

  submitNote(payload: EncounterNoteSubmitPayload) {
    return this.serialize(async () => {
      const next = structuredClone(this.state);
      const result = await createLearningPorts(next, this.options.nowIso, this.options.random).encounter.submitNote(payload);
      if (result.ok) {
        if (result.value.kind === 'cleared' && result.value.progression.awarded) {
          recordStudyActivity(next, this.options.nowIso(),
            { kind: 'note', roomId: payload.roomId, xp: result.value.progression.xpGained });
        }
        await this.commit(next);
      }
      return result;
    });
  }

  dispatchEncounter(command: EncounterCommand) {
    return this.serialize(async () => {
      const next = structuredClone(this.state);
      const result = await createLearningPorts(next, this.options.nowIso, this.options.random,
        this.options.newAttachmentId).encounter.dispatch(command);
      if (result.ok) {
        if (result.value.command === 'encounter/note-submit' && result.value.kind === 'cleared' &&
            result.value.progression.awarded && command.type === 'encounter/note-submit') {
          recordStudyActivity(next, this.options.nowIso(),
            { kind: 'note', roomId: command.payload.roomId, xp: result.value.progression.xpGained });
        }
        await this.commit(next);
      }
      return result;
    });
  }

  collectArtifact(roomId: string) {
    return this.serialize(async () => {
      const next = structuredClone(this.state);
      const result = await createLearningPorts(next, this.options.nowIso).encounter.artifactCollect({ roomId });
      if (result.ok) await this.commit(next);
      return result;
    });
  }

  dispatchReview(command: ReviewCommand) {
    return this.serialize(async () => {
      if (command.type === 'review/pass-complete' && !isValidQualityRating(command.payload.qualityRating)) {
        throw new Error('Review rating must be an integer from 0 to 5');
      }
      if (command.type === 'review/session-save' && command.payload.qualityRating !== null &&
          !isValidQualityRating(command.payload.qualityRating)) {
        throw new Error('Review rating must be an integer from 0 to 5');
      }
      const next = structuredClone(this.state);
      const result = createLearningPorts(next, this.options.nowIso).review.dispatch(command);
      if (result.ok && result.value.command === 'review/pass-complete' && result.value.progression.awarded) {
        const id = next.activeSubjectId;
        if (!id) throw new Error('No active subject');
        const snapshot = next.subjects[id];
        const progression = next.progression[id];
        const totalRooms = snapshot.dungeon.rooms.length;
        progression.badges.push(...evaluatePhaseBadgeUnlocks({
          totalRooms, creatorMappedRooms: totalRooms,
          scribeClearedRooms: Object.values(snapshot.rooms).filter((room) => room.validationState.finalPass).length,
          archaeologistFullReviewPasses: result.value.passProgress.fullReviewPasses,
        }, progression.badges));
        updateAchievements(next);
        if (command.type === 'review/pass-complete') {
          recordStudyActivity(next, this.options.nowIso(),
            { kind: 'review', roomId: command.payload.roomId, xp: result.value.progression.xpGained });
        }
      }
      if (result.ok && command.type !== 'review/session-resume') await this.commit(next);
      return result;
    });
  }

  dispatchFishing(command: FishingCommand) {
    return this.serialize(async () => {
      const next = structuredClone(this.state);
      if (command.type === 'fishing/session-begin') {
        const snapshot = next.subjects[command.payload.subjectId];
        if (!snapshot || snapshot.dungeon.subjectName !== command.payload.subjectName) {
          throw new Error('Fishing subject does not exist or its name does not match');
        }

      }
      if ('castNumber' in command.payload &&
          (!Number.isInteger(command.payload.castNumber) || command.payload.castNumber < 1)) {
        throw new Error('Cast number must be a positive integer');
      }
      if (command.type === 'fishing/cast-complete' || command.type === 'fishing/bite-resolve' ||
          command.type === 'fishing/catch-keep') {
        const context = next.fishingSession;
        const subject = context ? next.subjects[context.subjectId] : undefined;
        if (subject && !isFishingEligible(Object.values(subject.rooms).filter((room) => room.validationState.finalPass).length)) {
          throw new Error('Clear a room before fishing');
        }
      }
      const result = createFishingPorts(next, this.options.nowIso,
        this.options.newSessionId ?? (() => crypto.randomUUID())).dispatch(command);
      if (result.ok) {
        const outcome = result.value;
        if (outcome.command === 'fishing/session-begin') {
          next.fishingSession = outcome.context;
          if (outcome.eligible) next.session.world = 'fishing';
          await this.commit(next);
        } else if (outcome.command === 'fishing/catch-keep' && outcome.progression?.awarded) {
          const active = next.studySessions.find((session) => session.sessionId === next.activeStudySessionId);
          if (active?.subjectId === next.fishingSession?.subjectId) {
            recordStudyActivity(next, this.options.nowIso(), { kind: 'fishing', xp: outcome.progression.xpGained });
          }
          await this.commit(next);
        }
      }
      return result;
    });
  }

  equipItem(itemId: string) {
    return this.serialize(async () => {
      const next = structuredClone(this.state);
      const progression = next.activeSubjectId ? next.progression[next.activeSubjectId] : undefined;
      if (!progression) throw new Error('No active subject');
      const item = progression.inventory.find((candidate) => candidate.id === itemId);
      if (!item || !isEquippable(item) || item.equipped) return false;
      progression.equippedItems = progression.equippedItems.filter((equipped) => equipped.equipSlot !== item.equipSlot);
      progression.inventory = progression.inventory.map((candidate) =>
        isEquippable(candidate) && candidate.equipSlot === item.equipSlot
          ? { ...candidate, equipped: candidate.id === itemId } : candidate);
      progression.equippedItems.push({ ...item, equipped: true });
      await this.commit(next);
      return true;
    });
  }

  unequipItem(itemId: string) {
    return this.serialize(async () => {
      const next = structuredClone(this.state);
      const progression = next.activeSubjectId ? next.progression[next.activeSubjectId] : undefined;
      if (!progression) throw new Error('No active subject');
      if (!progression.equippedItems.some((item) => item.id === itemId)) return false;
      progression.equippedItems = progression.equippedItems.filter((item) => item.id !== itemId);
      progression.inventory = progression.inventory.map((item) =>
        item.id === itemId && isEquippable(item) ? { ...item, equipped: false } : item);
      await this.commit(next);
      return true;
    });
  }
}
