import type { FishingCommand } from '@/index';

/**
 * Machine events → fishing commands.
 *
 * This is the only example module that builds `fishing/*` command objects, and it
 * builds them from the public `FishingCommand` union so a payload change fails
 * typecheck here instead of drifting silently. It owns no machine, renderer, or
 * timer: a caller reports what the machine did and gets the engine's tagged result
 * back.
 *
 * Amendment to the frozen P4 interface (2026-11-24): every hook resolves to the
 * dispatch outcome rather than `void`. The purpose is P4-T5 — the recall question
 * is pulled once by the engine inside `fishing/bite-resolve`, and returning the
 * outcome lets the host present the *engine's* question instead of drawing a second
 * one with `Math.random`. Return types widen `Promise<void>` compatibly, so a
 * caller that ignores the value is unaffected.
 */

type CastCompletePayload = Extract<FishingCommand, { type: 'fishing/cast-complete' }>['payload'];
type CatchKeepPayload = Extract<FishingCommand, { type: 'fishing/catch-keep' }>['payload'];
type BiteResolvePayload = Extract<FishingCommand, { type: 'fishing/bite-resolve' }>['payload'];

/** `FishDirection`, derived from the public command union. */
export type FishingDirection = CastCompletePayload['fishDirection'];
/** The recall union, derived from the public command union. */
export type RecallOutcome = CatchKeepPayload['recall'];
/** `'hooked' | 'missed'`, derived from the public command union. */
export type BiteResolution = BiteResolvePayload['resolution'];

/** The structural result every fishing command resolves to. */
export type FishingDispatchOutcome =
  | { ok: true; value: unknown }
  | { ok: false; error: { code: string; message: string } };

/** The subject context a pond session runs under. */
export interface FishingSessionContext {
  pondId: string;
  subjectId: string;
  subjectName: string;
  roomId?: string | null;
}

export interface FishingBridgeHooks {
  dispatch(command: FishingCommand): Promise<FishingDispatchOutcome>;
}

export interface FishingBridge {
  onCastLanded(input: {
    castNumber: number;
    catalogId: string;
    direction: FishingDirection;
  }): Promise<FishingDispatchOutcome>;
  onBiteResolved(input: {
    castNumber: number;
    resolution: BiteResolution;
    catalogId?: string;
  }): Promise<FishingDispatchOutcome>;
  onKeep(input: {
    castNumber: number;
    catalogId: string;
    recall: RecallOutcome;
  }): Promise<FishingDispatchOutcome>;
  onRelease(input: {
    castNumber: number;
    catalogId: string;
  }): Promise<FishingDispatchOutcome>;
}

export function createFishingBridge(
  context: FishingSessionContext,
  hooks: FishingBridgeHooks,
): FishingBridge {
  // One subject context, made once at pond entry and reused unchanged. The engine
  // refuses a command whose subject does not match the open session, so this is
  // also the host's guard against a stale pond.
  const subject = {
    subjectId: context.subjectId,
    subjectName: context.subjectName,
    roomId: context.roomId ?? null,
  };

  return {
    onCastLanded({ castNumber, catalogId, direction }) {
      return hooks.dispatch({
        type: 'fishing/cast-complete',
        payload: { subject, castNumber, catalogId, fishDirection: direction },
      });
    },
    onBiteResolved({ castNumber, resolution, catalogId }) {
      return hooks.dispatch({
        type: 'fishing/bite-resolve',
        payload:
          resolution === 'hooked' && catalogId !== undefined
            ? { subject, castNumber, resolution, catalogId }
            : { subject, castNumber, resolution },
      });
    },
    onKeep({ castNumber, catalogId, recall }) {
      return hooks.dispatch({
        type: 'fishing/catch-keep',
        payload: { subject, castNumber, catalogId, recall },
      });
    },
    onRelease({ castNumber, catalogId }) {
      return hooks.dispatch({
        type: 'fishing/catch-release',
        payload: { subject, castNumber, catalogId },
      });
    },
  };
}
