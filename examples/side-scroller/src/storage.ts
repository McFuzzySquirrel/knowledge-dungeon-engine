import type { EngineState } from '@/index';

/**
 * Host-owned durable storage. Structurally compatible with the engine's
 * `EngineStorage` (`load` / `save`); `clear` is host-only.
 */
export interface BrowserStorage {
  load(): Promise<EngineState | null>;
  save(state: EngineState): Promise<void>;
  clear(): Promise<void>;
}

export interface IndexedDbStorage extends BrowserStorage {
  close(): void;
}

const STORE_NAME = 'engine-state';
const STATE_KEY = 'state';
const DEFAULT_DATABASE = 'knowledge-dungeon-side-scroller';

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}

function openDatabase(name: string, factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(name, 1);
    } catch (error) {
      reject(error);
      return;
    }
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error(`Could not open IndexedDB database ${name}`));
    request.onblocked = () =>
      reject(new Error(`IndexedDB open blocked for database ${name}`));
  });
}

/**
 * One database, one object store, one record. The record is the complete
 * `EngineState`, stored by structured clone so `Uint8Array` attachment bytes
 * survive. `save` is one readwrite transaction: if it fails, the previous
 * record is the value a later `load` reads.
 */
export function createIndexedDbStorage(
  databaseName = DEFAULT_DATABASE,
  factory: IDBFactory | undefined = globalThis.indexedDB,
): IndexedDbStorage {
  if (!factory) {
    throw new Error('IndexedDB is not available in this environment');
  }

  let databasePromise: Promise<IDBDatabase> | null = null;
  let closed = false;

  function database(): Promise<IDBDatabase> {
    if (closed) return Promise.reject(new Error('IndexedDB storage is closed'));
    databasePromise ??= openDatabase(databaseName, factory);
    return databasePromise;
  }

  async function load(): Promise<EngineState | null> {
    const db = await database();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(STATE_KEY);
    const [value] = await Promise.all([requestResult(request), transactionDone(transaction)]);
    return (value as EngineState | undefined) ?? null;
  }

  async function save(state: EngineState): Promise<void> {
    const db = await database();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    try {
      transaction.objectStore(STORE_NAME).put(state, STATE_KEY);
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // The transaction may already be inactive; the original error is the useful one.
      }
      throw error;
    }
    await transactionDone(transaction);
  }

  async function clear(): Promise<void> {
    const db = await database();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(STATE_KEY);
    await transactionDone(transaction);
  }

  return {
    load,
    save,
    clear,
    close() {
      closed = true;
      databasePromise?.then((db) => db.close()).catch(() => undefined);
      databasePromise = null;
    },
  };
}
