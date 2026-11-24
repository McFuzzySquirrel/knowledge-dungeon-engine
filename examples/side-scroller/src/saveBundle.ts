/**
 * Portable save bundle (P9).
 *
 * The engine's `EngineState` is structured-cloned into IndexedDB, so it can hold
 * `Uint8Array` attachment bytes directly. A portable JSON file cannot: JSON has
 * no binary type. This module encodes each attachment as base64, wraps the
 * state in a small host envelope, and decodes an untrusted file back into an
 * `EngineState` without merging arbitrary keys into engine state.
 *
 * The host settings are deliberately absent: they are device preferences, not
 * save data (see `settings.ts`).
 */
import type { EngineState } from '@/index';

export const SAVE_BUNDLE_APP = 'knowledge-dungeon-side-scroller';
export const SAVE_BUNDLE_VERSION = 1;

export interface EncodedEngineState extends Omit<EngineState, 'attachmentBytes'> {
  /** One base64 string per engine attachment key. */
  attachmentBytes: Record<string, string>;
}

export interface SaveBundle {
  /** Bundle format version, not the engine state version. */
  bundleVersion: 1;
  exportedAt: string;
  app: 'knowledge-dungeon-side-scroller';
  /** The engine state with attachment bytes encoded for JSON. */
  state: EncodedEngineState;
}

export type SaveBundleDecode =
  | { ok: true; state: EngineState }
  | { ok: false; error: string };

/** A storage target with the one method an import needs. */
export interface SaveImportTarget {
  save(state: EngineState): Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function base64ToBytes(value: string): Uint8Array | null {
  // A truncated or padded-wrong payload is not a save; reject before `atob`,
  // whose behaviour on malformed input differs between browsers.
  if (value.length % 4 !== 0 || !BASE64_PATTERN.test(value)) return null;
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

/** Encode one engine state for a `.json` download. Never mutates the input. */
export function encodeSaveBundle(state: EngineState, nowIso: string): SaveBundle {
  const attachmentBytes: Record<string, string> = {};
  for (const [key, value] of Object.entries(state.attachmentBytes)) {
    if (!(value instanceof Uint8Array)) {
      throw new Error(`Attachment ${key} is not a Uint8Array`);
    }
    attachmentBytes[key] = bytesToBase64(value);
  }

  return {
    bundleVersion: SAVE_BUNDLE_VERSION,
    exportedAt: nowIso,
    app: SAVE_BUNDLE_APP,
    state: { ...state, attachmentBytes },
  };
}

const STUDY_PHASES = ['creator', 'scribe', 'archaeologist'] as const;
const WORLD_PHASES = ['village', 'dungeon', 'fishing'] as const;
const PLAYER_CLASSES = ['scholar', 'cartographer', 'archivist'] as const;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function decodeSession(value: unknown): EngineState['session'] | null {
  if (!isRecord(value)) return null;
  const { phase, playerClass, questStep, world } = value;
  if (!STUDY_PHASES.includes(phase as (typeof STUDY_PHASES)[number])) return null;
  if (!WORLD_PHASES.includes(world as (typeof WORLD_PHASES)[number])) return null;
  if (typeof questStep !== 'string') return null;
  if (
    playerClass !== null &&
    !PLAYER_CLASSES.includes(playerClass as (typeof PLAYER_CLASSES)[number])
  ) {
    return null;
  }
  return {
    phase: phase as EngineState['session']['phase'],
    playerClass: playerClass as EngineState['session']['playerClass'],
    questStep: questStep as EngineState['session']['questStep'],
    world: world as EngineState['session']['world'],
  };
}

function decodeAttachmentMap(value: unknown): Record<string, Uint8Array> | string {
  if (value === undefined) return 'The save has no attachmentBytes map.';
  if (!isRecord(value)) return 'attachmentBytes must be an object.';

  const bytes: Record<string, Uint8Array> = {};
  for (const [key, encoded] of Object.entries(value)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      return `Attachment key ${key} is not allowed.`;
    }
    if (typeof encoded !== 'string') {
      return `Attachment ${key} is not a base64 string.`;
    }
    const decoded = base64ToBytes(encoded);
    if (decoded === null) return `Attachment ${key} is not valid base64.`;
    bytes[key] = decoded;
  }
  return bytes;
}

/**
 * Decode an untrusted bundle.
 *
 * Only the known `EngineState` keys are copied into the returned state; unknown
 * keys are ignored rather than merged. Every required key is checked, every
 * attachment payload is decoded, and the whole decode is complete before the
 * caller writes anything.
 */
export function decodeSaveBundle(raw: unknown): SaveBundleDecode {
  if (!isRecord(raw)) return { ok: false, error: 'The file is not a save bundle object.' };
  if (raw.bundleVersion !== SAVE_BUNDLE_VERSION) {
    return {
      ok: false,
      error: `Unsupported bundle version ${String(raw.bundleVersion)}; expected ${SAVE_BUNDLE_VERSION}.`,
    };
  }
  if (raw.app !== SAVE_BUNDLE_APP) {
    return { ok: false, error: 'This file was not exported by the side-scroller example.' };
  }
  if (typeof raw.exportedAt !== 'string') {
    return { ok: false, error: 'The save has no exportedAt timestamp.' };
  }

  const state = raw.state;
  if (!isRecord(state)) return { ok: false, error: 'The save has no engine state object.' };
  if (state.version !== 1) {
    return {
      ok: false,
      error: `Unsupported engine state version ${String(state.version)}.`,
    };
  }

  const required = [
    'activeSubjectId',
    'subjects',
    'progression',
    'fishingSession',
    'achievements',
    'session',
    'studySessions',
    'activeStudySessionId',
    'attachmentBytes',
  ] as const;
  for (const key of required) {
    if (!(key in state)) return { ok: false, error: `The save is missing ${key}.` };
  }

  const activeSubjectId = state.activeSubjectId;
  if (activeSubjectId !== null && typeof activeSubjectId !== 'string') {
    return { ok: false, error: 'activeSubjectId must be a string or null.' };
  }

  if (!isRecord(state.subjects)) {
    return { ok: false, error: 'subjects must be an object.' };
  }
  for (const [subjectId, subject] of Object.entries(state.subjects)) {
    if (!isRecord(subject)) return { ok: false, error: `Subject ${subjectId} is not an object.` };
    if (!isRecord(subject.dungeon)) {
      return { ok: false, error: `Subject ${subjectId} has no dungeon metadata.` };
    }
    if (!isRecord(subject.rooms)) {
      return { ok: false, error: `Subject ${subjectId} has no rooms map.` };
    }
  }

  if (!isRecord(state.progression)) {
    return { ok: false, error: 'progression must be an object.' };
  }
  for (const [subjectId, record] of Object.entries(state.progression)) {
    if (!isRecord(record)) {
      return { ok: false, error: `Progression for ${subjectId} is not an object.` };
    }
  }

  if (state.fishingSession !== null) {
    if (!isRecord(state.fishingSession)) {
      return { ok: false, error: 'fishingSession must be an object or null.' };
    }
    if (typeof state.fishingSession.subjectId !== 'string') {
      return { ok: false, error: 'fishingSession has no subjectId.' };
    }
  }

  if (!isStringArray(state.achievements)) {
    return { ok: false, error: 'achievements must be an array of strings.' };
  }

  const session = decodeSession(state.session);
  if (session === null) return { ok: false, error: 'The save session is not a known game session.' };

  if (!Array.isArray(state.studySessions)) {
    return { ok: false, error: 'studySessions must be an array.' };
  }
  if (state.activeStudySessionId !== null && typeof state.activeStudySessionId !== 'string') {
    return { ok: false, error: 'activeStudySessionId must be a string or null.' };
  }

  const attachmentBytes = decodeAttachmentMap(state.attachmentBytes);
  if (typeof attachmentBytes === 'string') return { ok: false, error: attachmentBytes };

  // A fresh object with only the known keys: an unknown field in the file is
  // ignored rather than copied into engine state.
  return {
    ok: true,
    state: {
      version: 1,
      activeSubjectId,
      subjects: state.subjects as EngineState['subjects'],
      progression: state.progression as EngineState['progression'],
      fishingSession: state.fishingSession as EngineState['fishingSession'],
      achievements: state.achievements,
      session,
      studySessions: state.studySessions as EngineState['studySessions'],
      activeStudySessionId: state.activeStudySessionId,
      attachmentBytes,
    },
  };
}

/**
 * Decode a bundle and write it through the storage adapter.
 *
 * The write happens only after a complete decode. A rejected write (quota,
 * private browsing) leaves the previous record untouched — the adapter's save
 * is one atomic transaction — and the error names the failure.
 */
export async function importSaveBundle(
  target: SaveImportTarget,
  raw: unknown,
): Promise<SaveBundleDecode> {
  const decoded = decodeSaveBundle(raw);
  if (!decoded.ok) return decoded;
  try {
    await target.save(decoded.state);
    return decoded;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `The save could not be written: ${message}. The previous save is intact.` };
  }
}
