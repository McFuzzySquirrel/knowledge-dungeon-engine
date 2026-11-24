import { describe, expect, it } from 'vitest';
import { nothingInReachMessage, sceneryMessage } from '../src/ui/outcomes';

describe('surface interaction copy', () => {
  it('names a labelled non-service facade as scenery without inventing an interior', () => {
    expect(sceneryMessage('Keeper’s Tower')).toBe(
      'Keeper’s Tower is scenery in this example; it has no service.',
    );
    expect(sceneryMessage('Central Fountain')).toContain('no service');
  });

  it('tells the learner how to reach an interaction when E finds nothing', () => {
    expect(nothingInReachMessage()).toContain('Walk closer');
  });
});
