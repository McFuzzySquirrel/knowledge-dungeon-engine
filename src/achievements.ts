import { computeCrossSubjectProgress, evaluateAchievementUnlocks } from './core/progression/achievements';
import type { EngineState } from './storage';

export function updateAchievements(state: EngineState): string[] {
  const progress = computeCrossSubjectProgress({
    bySubject: state.progression,
    totalSubjectsCreated: Object.keys(state.subjects).length,
  });
  const unlocked = evaluateAchievementUnlocks(progress, state.achievements).map((item) => item.id);
  state.achievements.push(...unlocked);
  return unlocked;
}
