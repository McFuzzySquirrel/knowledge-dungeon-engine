import type { SubjectSnapshot } from './core/validation/persistence';
import type { CanonicalSubjectProgression } from './core/progression/canonicalProgression';

export interface EngineState {
  version: 1;
  activeSubjectId: string | null;
  subjects: Record<string, SubjectSnapshot>;
  progression: Record<string, CanonicalSubjectProgression>;
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
  return { version: 1, activeSubjectId: null, subjects: {}, progression: {} };
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
