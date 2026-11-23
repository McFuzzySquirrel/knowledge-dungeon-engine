import { KnowledgeDungeonEngine, type EngineState } from '@/index';
import type { BrowserStorage } from './storage';

type StateListener = (state: EngineState) => void;

let engine: KnowledgeDungeonEngine | null = null;
let current: EngineState | null = null;
const listeners = new Set<StateListener>();
let reportError: (message: string) => void = (message) => console.error(message);

/** Route host-owned failures to the visible error region. */
export function setErrorReporter(reporter: (message: string) => void): void {
  reportError = reporter;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Open the one engine instance for this tab, subscribe once, and recover an
 * interrupted dungeon session.
 *
 * Recovery follows `docs/host-ui-guide.md` §Study Sessions: close the unfinished
 * session at its last activity, then re-enter through the tutorial flow. P0 is a
 * debug build, so a non-tutorial dungeon resumes through the tutorial.
 */
export async function openExampleEngine(storage: BrowserStorage): Promise<KnowledgeDungeonEngine> {
  if (engine) throw new Error('The example engine is already open');

  engine = await KnowledgeDungeonEngine.open({
    storage,
    nowIso: () => new Date().toISOString(),
    newRoomId: () => crypto.randomUUID(),
    onListenerError: (error) => reportError(`State listener failed: ${describe(error)}`),
  });

  current = engine.snapshot();
  engine.subscribe((next) => {
    current = next;
    for (const listener of listeners) {
      try {
        listener(next);
      } catch (error) {
        reportError(`State render failed: ${describe(error)}`);
      }
    }
  });

  const loaded = engine.snapshot();
  if (loaded.session.world === 'dungeon' && loaded.activeStudySessionId !== null) {
    try {
      await engine.endStudySession(true);
      await engine.startTutorial();
    } catch (error) {
      reportError(`Could not recover the interrupted dungeon session: ${describe(error)}`);
    }
  }

  return engine;
}

export function getState(): EngineState {
  if (!current) throw new Error('The example engine is not open');
  return current;
}

/** Subscribe to committed state. The listener is called immediately with the current state. */
export function subscribeState(listener: StateListener): () => void {
  listeners.add(listener);
  if (current) listener(current);
  return () => {
    listeners.delete(listener);
  };
}
