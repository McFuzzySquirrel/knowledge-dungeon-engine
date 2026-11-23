import type { SubjectSnapshot } from './core/validation/persistence';
import type { CanonicalSubjectProgression } from './core/progression/canonicalProgression';
import type { FishingContext } from './core/fishing/fishingContext';
import { initialGameSession, type GameSession } from './session';
import type { StudySessionRecord } from './studySessions';

export interface EngineState {
  version: 1;
  activeSubjectId: string | null;
  subjects: Record<string, SubjectSnapshot>;
  progression: Record<string, CanonicalSubjectProgression>;
  fishingSession: FishingContext | null;
  achievements: string[];
  session: GameSession;
  studySessions: StudySessionRecord[];
  activeStudySessionId: string | null;
  attachmentBytes: Record<string, Uint8Array>;
}

/**
 * An adapter must replace the entire state atomically: a failed save must leave
 * the previous state intact. Hosts are responsible for serializing writers.
 */
export interface EngineStorage {
  load(): Promise<EngineState | null>;
  save(state: EngineState): Promise<void>;
}

export function createEmptyState(): EngineState {
  return { version: 1, activeSubjectId: null, subjects: {}, progression: {}, fishingSession: null,
    achievements: [], session: initialGameSession(), studySessions: [], activeStudySessionId: null,
    attachmentBytes: {} };
}

/** Volatile reference adapter. A new instance starts empty. */
export class MemoryEngineStorage implements EngineStorage {
  private state: EngineState | null = null;

  async load(): Promise<EngineState | null> {
    return structuredClone(this.state);
  }

  async save(state: EngineState): Promise<void> {
    this.state = structuredClone(state);
  }
}
