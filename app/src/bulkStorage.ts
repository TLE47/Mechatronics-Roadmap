/**
 * The six stores that outgrew `localStorage`, behind the same `Storage` interface.
 *
 * Why: every store was sized against one 5 MB bucket, and the caps that keep them inside it stop being
 * free — twelve drafts, five versions per lesson, a 5,000-event log — all so a paste cannot break the
 * editor. Measured worst case after the study layer arrived was ~4.0 MB of that bucket for the
 * *typical* learner and ~3.4 MB at the caps, which is one big capstone draft away from a `QuotaExceeded`
 * during a debounced save. IndexedDB's limit is a share of the disk, not 5 MB, so the caps can go back
 * to being about the backup and the sync cost rather than about surviving a save.
 *
 * How, without touching a caller: every store module already reads through a `storage()` helper whose
 * type is `Storage`, so this is a `Storage` — but not a synchronous one underneath. The trick is a
 * write-behind cache:
 *
 * - **`hydrate()` runs once, before the first render.** It opens the database, copies every entry into
 *   memory, and migrates anything a pre-IndexedDB version left in `localStorage`.
 * - **Afterwards reads are synchronous** and come from that memory map, so `readDrafts()` and the rest
 *   keep their signatures, the unit suites keep their fake buckets, and React keeps reading in
 *   `useState` initializers.
 * - **Writes update memory, then land in IndexedDB** on the next tick, coalesced per key: typing into
 *   the editor debounces to one save, and one save is one `put`.
 *
 * Two honest limits, both stated rather than hidden: a write that is still in the queue when the tab
 * dies is lost (the window is one tick, and `main.tsx` flushes on `pagehide`), and a page that never
 * called `hydrate()` gets no storage at all rather than an empty answer — `null` here means "not ready",
 * which the stores already read as "nothing stored" instead of "everything was erased".
 *
 * The migration rule is the one that cannot lose work: **copy everything first, delete only after the
 * backend has it.** A browser that refuses to open a database (private mode, blocked storage) keeps the
 * bucket and behaves exactly as before.
 *
 * `localStorage` also stays the home of the small, first-paint keys — theme, focus, the last lesson, the
 * view mode, the progress flags — because those are read before React mounts, and a theme that arrives
 * one frame late is a flash the learner sees.
 */

// Type-only on the other side, and erased by Node's type stripping, so this is not a runtime cycle.
import { openIdbBackend } from './idbBackend.ts';

/** The bulk stores, named as the keys they had in the bucket. Order is for the migration log only. */
export const BULK_KEYS = [
  'mechalab_drafts_v1',
  'mechalab_draft_history_v1',
  'mechalab.learningLog.v1',
  'mechalab_study_notes_v1',
  'mechalab_study_cards_v1',
  'mechalab_sittings_v1',
] as const;

export type BulkKey = (typeof BULK_KEYS)[number];

/** Where the bytes end up. Async because IndexedDB is; a test injects its own. */
export interface KeyValueBackend {
  readAll(): Promise<Map<string, string>>;
  write(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/** `unready` before `hydrate()`, then whichever store this browser could actually give us. */
export type BulkMode = 'unready' | 'idb' | 'passthrough';

export interface BulkStore {
  /** The `Storage` the store modules read through — null until hydrated, unless there is no IndexedDB. */
  storage(): Storage | null;
  mode(): BulkMode;
  /** Open, read, migrate. Safe to call twice; the second call returns the first result. */
  hydrate(): Promise<BulkMode>;
  /** Drain the write queue now (tests, and `pagehide`). */
  flush(): Promise<void>;
  /** Writes waiting for the backend, for a test that wants to see the queue rather than guess at it. */
  pendingWrites(): number;
}

function browserBucket(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Private mode and blocked third-party storage throw on access, not on use.
    return null;
  }
}

/**
 * Build a store over `openBackend`.
 *
 * Exported as a factory rather than a bare singleton so `scripts/test_storage.mjs` can hand it an
 * in-memory backend that fails on demand: the migration's "copy, then delete" order and the
 * write-behind queue are the two places where a bug would silently eat a learner's drafts, and neither
 * is reachable from a unit test through the real database.
 */
export function createBulkStorage(
  openBackend: () => Promise<KeyValueBackend | null>,
  bucket: () => Storage | null = browserBucket
): BulkStore {
  const cache = new Map<string, string>();
  /** Key -> next value, or null for a delete. Coalesced: the last write in a tick wins. */
  const dirty = new Map<string, string | null>();
  let chain: Promise<void> = Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let mode: BulkMode = 'unready';
  let backend: KeyValueBackend | null = null;

  function schedule(): void {
    if (timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      void drain();
    }, 0);
  }

  function drain(): Promise<void> {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (!dirty.size || !backend) return chain;
    const batch = [...dirty];
    dirty.clear();
    chain = chain.then(async () => {
      for (const [key, value] of batch) {
        if (!backend) return;
        try {
          if (value === null) await backend.remove(key);
          else await backend.write(key, value);
        } catch {
          // The write failed - a full disk, a closing database. The memory copy still serves this
          // session, so the entry goes back on the queue for the next change to retry rather than
          // being dropped on the floor. Not rescheduled here: a backend that fails every time would
          // otherwise spin.
          dirty.set(key, value);
        }
      }
    });
    return chain;
  }

  const facade: Storage = {
    get length(): number {
      return cache.size;
    },
    key(index: number): string | null {
      return [...cache.keys()][index] ?? null;
    },
    getItem(key: string): string | null {
      return cache.has(key) ? (cache.get(key) as string) : null;
    },
    setItem(key: string, value: string): void {
      const text = String(value);
      cache.set(key, text);
      dirty.set(key, text);
      schedule();
    },
    removeItem(key: string): void {
      // A delete of something already gone is not a write: the stores call this on every clear.
      if (!cache.delete(key)) return;
      dirty.set(key, null);
      schedule();
    },
    clear(): void {
      for (const key of cache.keys()) dirty.set(key, null);
      cache.clear();
      schedule();
    },
  };

  function storage(): Storage | null {
    if (mode === 'passthrough') return bucket();
    if (mode === 'idb') return facade;
    // Not hydrated yet. With no IndexedDB there is nothing to wait for, so the bucket is the honest
    // answer in Node and in a browser that cannot open a database at all.
    if (typeof indexedDB === 'undefined') return bucket();
    return null;
  }

  async function hydrate(): Promise<BulkMode> {
    if (mode !== 'unready') return mode;
    let opened: KeyValueBackend | null = null;
    try {
      opened = await openBackend();
    } catch {
      opened = null;
    }
    if (!opened) {
      mode = 'passthrough';
      return mode;
    }

    let stored: Map<string, string>;
    try {
      stored = await opened.readAll();
    } catch {
      mode = 'passthrough';
      return mode;
    }
    for (const [key, value] of stored) cache.set(key, value);

    // Migrate what a pre-IndexedDB version left in the bucket. Copy first, delete only afterwards:
    // if the database cannot take an entry, the bundle it came from is still there and nothing is lost.
    const local = bucket();
    if (local) {
      const carried: string[] = [];
      try {
        for (const key of BULK_KEYS) {
          const value = local.getItem(key);
          if (value === null) continue;
          cache.set(key, value);
          await opened.write(key, value);
          carried.push(key);
        }
      } catch {
        // Leave the bucket untouched and keep using it. Anything already copied is a duplicate that
        // the next visit overwrites from the bucket, because the bucket wins while it holds a key.
        cache.clear();
        for (const [key, value] of stored) cache.set(key, value);
        mode = 'passthrough';
        return mode;
      }
      for (const key of carried) {
        try {
          local.removeItem(key);
        } catch {
          // A bucket that cannot be written to also cannot be freed; the copy in the database is
          // already there, so the next visit migrates again and finishes the job.
        }
      }
    }

    backend = opened;
    mode = 'idb';
    return mode;
  }

  return {
    storage,
    mode: () => mode,
    hydrate,
    flush: drain,
    pendingWrites: () => dirty.size,
  };
}

let singleton: BulkStore | null = null;

function instance(): BulkStore {
  if (!singleton) singleton = createBulkStorage(openIdbBackend);
  return singleton;
}

/** The `Storage` every bulk store module reads through. */
export function bulkStorage(): Storage | null {
  return instance().storage();
}

/** Open, read, migrate — `main.tsx` awaits this before the first render. */
export function hydrateBulkStorage(): Promise<BulkMode> {
  return instance().hydrate();
}

/** Drain the queue: called on `pagehide`, and by a suite that wants the write to have landed. */
export function flushBulkStorage(): Promise<void> {
  return instance().flush();
}
