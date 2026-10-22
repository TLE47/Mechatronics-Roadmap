// The `KeyValueBackend` import is a type, so this module stays free of a runtime cycle with
// `bulkStorage.ts` under Node's type stripping as well as under Vite.
import type { KeyValueBackend } from './bulkStorage.ts';

/**
 * The IndexedDB backend — one object store, key to string, opened lazily.
 *
 * A hand-written wrapper rather than a library: the whole interface is three operations over one
 * store, and `Dexie` would be a dependency, a second schema language and a bundler-sized payload for
 * a `put` and a `get`. What it does need to get right is the failure modes, all of which resolve to
 * `null` — no `indexedDB` (Node, older browsers), an open that throws (blocked storage), an upgrade
 * that never completes (a second tab holding an older version) — because `null` is what sends the
 * store back to the bucket it has always used.
 */

const DB_NAME = 'mechalab';
const DB_VERSION = 1;
const OBJECT_STORE = 'kv';

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error ?? new Error('indexedDB request failed'));
  });
}

function openDatabase(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let opening: IDBOpenDBRequest;
    try {
      opening = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    opening.onupgradeneeded = () => {
      const database = opening.result;
      if (!database.objectStoreNames.contains(OBJECT_STORE)) database.createObjectStore(OBJECT_STORE);
    };
    opening.onsuccess = () => resolve(opening.result);
    opening.onerror = () => resolve(null);
    // Another tab is holding an older version open. Waiting for it is a hang on first paint, and a
    // store that falls back to the bucket is a working app.
    opening.onblocked = () => resolve(null);
  });
}

function transaction(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = database.transaction(OBJECT_STORE, mode);
    } catch (error) {
      reject(error);
      return;
    }
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('indexedDB transaction aborted'));
    tx.onerror = () => reject(tx.error ?? new Error('indexedDB transaction failed'));
    run(tx.objectStore(OBJECT_STORE));
  });
}

/** Open the database, or null when this browser will not give us one. */
export async function openIdbBackend(): Promise<KeyValueBackend | null> {
  if (typeof indexedDB === 'undefined') return null;
  const database = await openDatabase();
  if (!database) return null;

  return {
    async readAll(): Promise<Map<string, string>> {
      const tx = database.transaction(OBJECT_STORE, 'readonly');
      const store = tx.objectStore(OBJECT_STORE);
      // Both requests are issued before the first await: a transaction with nothing in flight is
      // allowed to commit, and a `getAll` issued after that would throw InvalidStateError.
      const [keys, values] = await Promise.all([request<IDBValidKey[]>(store.getAllKeys()), request<unknown[]>(store.getAll())]);
      const entries = new Map<string, string>();
      keys.forEach((key, index) => entries.set(String(key), String(values[index] ?? '')));
      return entries;
    },
    write: (key: string, value: string) =>
      transaction(database, 'readwrite', (store) => {
        store.put(value, key);
      }),
    remove: (key: string) =>
      transaction(database, 'readwrite', (store) => {
        store.delete(key);
      }),
  };
}
