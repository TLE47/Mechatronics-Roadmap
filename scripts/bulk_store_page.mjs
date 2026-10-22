/**
 * Read the bulk store from inside a page (`scripts/bulk_store_page.mjs`).
 *
 * The browser suites used to prove persistence by reading `localStorage` after a reload, which was
 * the same store the app wrote. Drafts, versions, the log, notes, schedules and sittings now live in
 * IndexedDB (`app/src/bulkStorage.ts`) behind a write-behind cache, so the suites have to look where
 * the bytes actually are — and the honest way to do that is a second, independent reader, not a hook
 * the app exposes for tests to use.
 *
 * The open passes version 1 and creates the object store on upgrade for a reason: opening a missing
 * database without a version creates it at version 1 with no store, and the app's own open at version
 * 1 would then never fire `onupgradeneeded` — the suite would quietly break the app it is testing.
 */

export const BULK_DB = 'mechalab';
export const BULK_STORE = 'kv';

/** One round trip: `keys` for the whole key list, `get` for one value. */
function storeCall(page, operation, key) {
  return page.evaluate(
    async ({ dbName, storeName, what, wanted }) => {
      const database = await new Promise((resolve, reject) => {
        const opening = indexedDB.open(dbName, 1);
        opening.onupgradeneeded = () => {
          const db = opening.result;
          if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName);
        };
        opening.onsuccess = () => resolve(opening.result);
        opening.onerror = () => reject(opening.error);
      });
      if (!database.objectStoreNames.contains(storeName)) {
        database.close();
        return what === 'keys' ? [] : null;
      }
      const result = await new Promise((resolve, reject) => {
        const store = database.transaction(storeName, 'readonly').objectStore(storeName);
        const request = what === 'keys' ? store.getAllKeys() : store.get(wanted);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      database.close();
      return result ?? null;
    },
    { dbName: BULK_DB, storeName: BULK_STORE, what: operation, wanted: key }
  );
}

/** Every key the database holds, sorted, so a suite can say what it expected instead of what it got. */
export async function bulkKeys(page) {
  const keys = await storeCall(page, 'keys');
  return Array.isArray(keys) ? keys.map(String).sort() : [];
}

/** One key's stored string, or null when the database has never held it. */
export async function readBulk(page, key) {
  const value = await storeCall(page, 'get', key);
  return value === null ? null : String(value);
}

/**
 * Empty the database, the same way a suite empties the bucket.
 *
 * The workbench suite used to delete the `mechalab*` keys and reload to get "zero progress" on the
 * same page. Six of those stores are no longer in the bucket, so clearing only the bucket would leave
 * the log, drafts, notes and schedules the scenario is trying to forget.
 */
export async function clearBulk(page) {
  await page.evaluate(
    async ({ dbName, storeName }) => {
      const database = await new Promise((resolve, reject) => {
        const opening = indexedDB.open(dbName, 1);
        opening.onupgradeneeded = () => {
          const db = opening.result;
          if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName);
        };
        opening.onsuccess = () => resolve(opening.result);
        opening.onerror = () => reject(opening.error);
      });
      if (database.objectStoreNames.contains(storeName)) {
        await new Promise((resolve, reject) => {
          const tx = database.transaction(storeName, 'readwrite');
          tx.oncomplete = () => resolve();
          tx.onabort = () => reject(tx.error);
          tx.objectStore(storeName).clear();
        });
      }
      database.close();
    },
    { dbName: BULK_DB, storeName: BULK_STORE }
  );
}

/** Parse one key's JSON, waiting until it holds something (a write lands a tick after the input). */
export async function waitForBulk(page, key, predicate, timeout = 15000) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeout) {
    const raw = await readBulk(page, key);
    last = raw;
    if (raw !== null) {
      try {
        const parsed = JSON.parse(raw);
        if (predicate(parsed)) return parsed;
      } catch {
        // Not JSON yet (or never); the timeout below reports what it last saw.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `the database never held a ${key} that matched; last value: ${String(last).slice(0, 200)}`
  );
}
