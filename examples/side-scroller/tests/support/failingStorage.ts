import type { EngineState } from '@/index';
import type { BrowserStorage } from '../../src/storage';

/**
 * Test-only storage wrapper (P2-T6).
 *
 * Delegates every call to the real adapter, but can be told to reject the next
 * `save` exactly once. Reused by P3 and P4 so the "Not saved" path is proven the
 * same way in every phase. It is never imported by the example's runtime code.
 */
export interface FailingStorage extends BrowserStorage {
  /** Reject the next `save` with this error (default: a simulated write failure). */
  failNextSave(error?: Error): void;
  /** Stop failing; the next save delegates normally. */
  clearFailure(): void;
  /** Number of `save` calls, including rejected ones. */
  readonly saveAttempts: number;
}

export function createFailingStorage(inner: BrowserStorage): FailingStorage {
  let nextError: Error | null = null;
  let attempts = 0;

  return {
    get saveAttempts() {
      return attempts;
    },
    failNextSave(error = new Error('Simulated storage failure')) {
      nextError = error;
    },
    clearFailure() {
      nextError = null;
    },
    load: () => inner.load(),
    clear: () => inner.clear(),
    async save(state: EngineState) {
      attempts += 1;
      if (nextError) {
        const error = nextError;
        nextError = null;
        throw error;
      }
      await inner.save(state);
    },
  };
}
