import type { PlayerClassId } from './application/contracts/world';

export const QUEST_STEPS = [
  'intro', 'meet-keeper', 'create-subject', 'visit-training', 'pick-archetype',
  'enter-dungeon', 'clear-room', 'write-note', 'review-artifact', 'complete',
] as const;
export type QuestStep = typeof QUEST_STEPS[number];
export type StudyPhase = 'creator' | 'scribe' | 'archaeologist';

export interface GameSession {
  phase: StudyPhase;
  playerClass: PlayerClassId | null;
  questStep: QuestStep;
  world: 'village' | 'dungeon' | 'fishing';
}

export function initialGameSession(): GameSession {
  return { phase: 'creator', playerClass: null, questStep: 'intro', world: 'village' };
}

export function nextQuestStep(step: QuestStep): QuestStep {
  return QUEST_STEPS[Math.min(QUEST_STEPS.indexOf(step) + 1, QUEST_STEPS.length - 1)];
}
