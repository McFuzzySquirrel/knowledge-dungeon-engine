import { describe, expect, it } from 'vitest';
import { buildingInteractionMessage, nothingInReachMessage } from '../src/ui/outcomes';

describe('surface interaction copy', () => {
  it('names the quest step for the guild hall and the facade limit for other buildings', () => {
    expect(buildingInteractionMessage('guild-hall', 'Guild Hall', 'scribe-notes')).toBe(
      'Guild Hall. Quest step: scribe-notes.',
    );
    expect(buildingInteractionMessage('library', 'Library', 'scribe-notes')).toBe(
      'Library is a facade in this example. Only subject portals and the Training Grounds open a dungeon.',
    );
    expect(buildingInteractionMessage('trophy-hall', 'Trophy Hall', 'scribe-notes')).toContain(
      'facade',
    );
  });

  it('tells the learner how to reach an interaction when E finds nothing', () => {
    expect(nothingInReachMessage()).toContain('Walk closer');
  });
});
