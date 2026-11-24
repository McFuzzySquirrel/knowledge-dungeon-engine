import { describe, expect, it } from 'vitest';
import { fishingMechanics, fishingState } from '@/index';

/**
 * P4-T7: deterministic machine replay.
 *
 * Recall *selection* is excluded (the engine pulls it with `Math.random` inside
 * `pullRecallQuestion`), but everything the host drives — phase, cast number,
 * candidate, and the effect order — is reproducible from a fixed seed and a
 * scripted event trace. This is the same machine the scene ticks, with no DOM.
 */

const VIEWPORT = { width: 960, height: 540 } as const;

interface ReplayResult {
  phase: fishingState.FishingStateName;
  castNumber: number;
  candidateId: string | null;
  fishDirection: string;
  effects: string[];
  frames: number;
}

function effectLabel(effect: fishingState.FishingMachineEffect): string {
  return effect.type === 'audio'
    ? `audio:${effect.hook}`
    : `reveal:${effect.catalogId}:${effect.castNumber}`;
}

function replay(seed: number): ReplayResult {
  const rng = fishingMechanics.createSeededRng(seed);
  let state = fishingState.createFishingState({ viewport: VIEWPORT, nowMs: 0, eligible: true });
  let now = 0;
  let frames = 0;
  const effects: string[] = [];

  const step = (event: Omit<fishingState.FishingMachineEvent, 'nowMs'>): void => {
    const result = fishingState.reduceFishing(state, { ...event, nowMs: now } as fishingState.FishingMachineEvent, rng);
    expect(result.accepted).toBe(true);
    state = result.state;
    effects.push(...result.effects.map(effectLabel));
  };

  step({ type: 'begin-power' });
  now = 800;
  step({ type: 'tick' });
  step({ type: 'release' });

  const tickUntil = (phase: fishingState.FishingStateName, budgetMs: number): void => {
    for (let elapsed = 0; state.phase !== phase && elapsed <= budgetMs; elapsed += 16) {
      now += 16;
      step({ type: 'tick' });
      frames += 1;
    }
    expect(state.phase).toBe(phase);
  };

  tickUntil('waiting', 5000);
  const candidateId = state.candidate?.id ?? null;
  const fishDirection = state.fishDirection;
  expect(candidateId).not.toBeNull();

  // A resize mid-cast must not rebuild the session.
  const beforeResize = state;
  const resized = fishingState.reduceFishing(
    state,
    { type: 'resize', viewport: { width: 800, height: 480 }, nowMs: now },
    rng,
  );
  expect(resized.accepted).toBe(true);
  expect(resized.state.castNumber).toBe(beforeResize.castNumber);
  expect(resized.state.candidate?.id).toBe(candidateId);
  state = resized.state;

  tickUntil('biting', 25000);
  step({ type: 'hook' });
  tickUntil('caught', 3000);

  return {
    phase: state.phase,
    castNumber: state.castNumber,
    candidateId,
    fishDirection,
    effects,
    frames,
  };
}

describe('P4 fishing machine replay', () => {
  it('reproduces phase, candidate, cast number, and effect order from a fixed seed', () => {
    const first = replay(1337);
    const second = replay(1337);

    expect(second).toEqual(first);
    expect(first.phase).toBe('caught');
    expect(first.castNumber).toBe(1);
    expect(first.candidateId).not.toBeNull();
    expect(first.effects).toContain(`reveal:${first.candidateId}:1`);
    expect(first.effects[0]).toBe('audio:cast');
    expect(first.effects).toContain('audio:splash');
    expect(first.effects).toContain('audio:bite');
    expect(first.effects).toContain('audio:reel-in');
    expect(first.effects).toContain('audio:catch');
    expect(first.frames).toBeGreaterThan(0);
  });

  it('refuses a cast when the subject is not eligible', () => {
    let state = fishingState.createFishingState({ viewport: VIEWPORT, nowMs: 0, eligible: false });
    const refused = fishingState.reduceFishing(
      state,
      { type: 'begin-power', nowMs: 10 },
      fishingMechanics.createSeededRng(1),
    );
    expect(refused.accepted).toBe(false);
    expect(refused.refusal).toBe('fishing-not-eligible');
    expect(refused.state).toBe(state);

    state = { ...state, eligible: true };
    const accepted = fishingState.reduceFishing(
      state,
      { type: 'begin-power', nowMs: 10 },
      fishingMechanics.createSeededRng(1),
    );
    expect(accepted.accepted).toBe(true);
    expect(accepted.state.phase).toBe('powering');
  });

  it('keeps the cast counter monotonic across reset and the next cast', () => {
    const rng = fishingMechanics.createSeededRng(99);
    let state = fishingState.createFishingState({ viewport: VIEWPORT, nowMs: 0, eligible: true });
    let now = 0;
    const step = (event: Omit<fishingState.FishingMachineEvent, 'nowMs'>): void => {
      const result = fishingState.reduceFishing(state, { ...event, nowMs: now } as fishingState.FishingMachineEvent, rng);
      expect(result.accepted).toBe(true);
      state = result.state;
    };

    step({ type: 'begin-power' });
    now = 200;
    step({ type: 'tick' });
    step({ type: 'release' });
    expect(state.castNumber).toBe(1);

    now += 16;
    const refusedReset = fishingState.reduceFishing(state, { type: 'reset', nowMs: now }, rng);
    expect(refusedReset.accepted).toBe(false);
    expect(state.phase).toBe('casting');

    // Finish one cast quickly by letting the proximity timeout miss it.
    for (let i = 0; i < 3000 && state.phase !== 'missed'; i += 1) {
      now += 16;
      step({ type: 'tick' });
    }
    expect(state.phase).toBe('missed');
    step({ type: 'reset' });
    expect(state.phase).toBe('idle');
    expect(state.castNumber).toBe(1);

    step({ type: 'begin-power' });
    now += 200;
    step({ type: 'tick' });
    step({ type: 'release' });
    expect(state.castNumber).toBe(2);
  });
});
