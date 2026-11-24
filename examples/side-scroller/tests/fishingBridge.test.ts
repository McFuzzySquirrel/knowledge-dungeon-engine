import { describe, expect, it } from 'vitest';
import type { FishingCommand } from '@/index';
import {
  createFishingBridge,
  type FishingDispatchOutcome,
  type FishingSessionContext,
} from '../src/fishing/bridge';

const CONTEXT: FishingSessionContext = {
  pondId: 'pond-fish-nw',
  subjectId: 'synthetic-subject',
  subjectName: 'Synthetic Subject',
  roomId: null,
};

function recorder() {
  const sent: FishingCommand[] = [];
  return {
    sent,
    dispatch: async (command: FishingCommand): Promise<FishingDispatchOutcome> => {
      sent.push(command);
      return { ok: true, value: { command: command.type } };
    },
  };
}

describe('P4 fishing bridge', () => {
  it('forwards a landed cast as fishing/cast-complete', async () => {
    const log = recorder();
    const bridge = createFishingBridge(CONTEXT, { dispatch: log.dispatch });

    await bridge.onCastLanded({ castNumber: 3, catalogId: 'moss-carp', direction: 'bottom' });

    expect(log.sent).toEqual([
      {
        type: 'fishing/cast-complete',
        payload: {
          subject: { subjectId: 'synthetic-subject', subjectName: 'Synthetic Subject', roomId: null },
          castNumber: 3,
          catalogId: 'moss-carp',
          fishDirection: 'bottom',
        },
      },
    ]);
  });

  it('forwards a hooked bite with the catalogue id and a miss without one', async () => {
    const log = recorder();
    const bridge = createFishingBridge(CONTEXT, { dispatch: log.dispatch });

    await bridge.onBiteResolved({ castNumber: 1, resolution: 'hooked', catalogId: 'moss-carp' });
    await bridge.onBiteResolved({ castNumber: 2, resolution: 'missed' });

    expect(log.sent[0]).toEqual({
      type: 'fishing/bite-resolve',
      payload: {
        subject: { subjectId: 'synthetic-subject', subjectName: 'Synthetic Subject', roomId: null },
        castNumber: 1,
        resolution: 'hooked',
        catalogId: 'moss-carp',
      },
    });
    expect(log.sent[1]).toEqual({
      type: 'fishing/bite-resolve',
      payload: {
        subject: { subjectId: 'synthetic-subject', subjectName: 'Synthetic Subject', roomId: null },
        castNumber: 2,
        resolution: 'missed',
      },
    });
    expect('catalogId' in (log.sent[1].payload as object)).toBe(false);
  });

  it('forwards keep with each recall arm unchanged', async () => {
    const log = recorder();
    const bridge = createFishingBridge(CONTEXT, { dispatch: log.dispatch });

    await bridge.onKeep({
      castNumber: 4,
      catalogId: 'gilded-koi',
      recall: { kind: 'answered-correct', roomId: 'room-a' },
    });
    await bridge.onKeep({
      castNumber: 5,
      catalogId: 'gilded-koi',
      recall: { kind: 'answered-incorrect', roomId: 'room-a' },
    });
    await bridge.onKeep({
      castNumber: 6,
      catalogId: 'gilded-koi',
      recall: { kind: 'kept-without-recall' },
    });

    expect(log.sent.map((command) => command.type)).toEqual([
      'fishing/catch-keep',
      'fishing/catch-keep',
      'fishing/catch-keep',
    ]);
    expect((log.sent[0].payload as { recall: unknown }).recall).toEqual({
      kind: 'answered-correct',
      roomId: 'room-a',
    });
    expect((log.sent[1].payload as { recall: unknown }).recall).toEqual({
      kind: 'answered-incorrect',
      roomId: 'room-a',
    });
    expect((log.sent[2].payload as { recall: unknown }).recall).toEqual({
      kind: 'kept-without-recall',
    });
  });

  it('forwards release and keeps the session room id in the subject context', async () => {
    const log = recorder();
    const bridge = createFishingBridge({ ...CONTEXT, roomId: 'room-b' }, { dispatch: log.dispatch });

    await bridge.onRelease({ castNumber: 7, catalogId: 'reed-darter' });

    expect(log.sent).toEqual([
      {
        type: 'fishing/catch-release',
        payload: {
          subject: { subjectId: 'synthetic-subject', subjectName: 'Synthetic Subject', roomId: 'room-b' },
          castNumber: 7,
          catalogId: 'reed-darter',
        },
      },
    ]);
  });

  it('returns a refusal unchanged so the host can show it', async () => {
    const refusal: FishingDispatchOutcome = {
      ok: false,
      error: { code: 'NO_OPEN_SESSION', message: 'No fishing session is open.' },
    };
    const bridge = createFishingBridge(CONTEXT, { dispatch: async () => refusal });

    await expect(
      bridge.onBiteResolved({ castNumber: 1, resolution: 'missed' }),
    ).resolves.toEqual(refusal);
  });
});
