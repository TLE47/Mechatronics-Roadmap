/**
 * Save one micro-learning event (`app/src/micro/progress.ts`).
 *
 * The important rule is the one a second tab makes visible: never write `currentState + event`.
 * Read the latest stored state, apply the reducer to *that*, and retry if another tab won the race.
 * The event log is a bounded convenience; `concepts` carries the aggregates, so pruning old events
 * cannot erase mastery or a skip decision.
 */

import { MICRO_BY_ID } from './catalog.ts';
import { applyMicroEvent } from './engine.ts';
import {
  browserStorage,
  clearMicroStore,
  emptyStore,
  pruneEvents,
  readMicroStore,
  writeMicroStore,
  type StorageLike,
} from './store.ts';
import { MICRO_STORAGE_KEY, type MicroEvent, type MicroStore } from './types.ts';

export type SaveResult =
  | { saved: true; duplicate: boolean; store: MicroStore; persistent: boolean }
  | { saved: false; reason: 'read-only' | 'unavailable' | 'unknown-concept' | 'storage-full' };

export interface MicroStoreOptions {
  storage?: StorageLike | null;
  now?: () => number;
  /** Tests can supply a lock; browsers use the Web Locks API when it is present. */
  withLock?: <T>(work: () => Promise<T>) => Promise<T>;
}

function defaultLock<T>(work: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!locks?.request) return work();
  return locks.request('mechalab-micro-progress', work) as Promise<T>;
}

export interface MicroProgressApi {
  read(): MicroStore;
  readOnly(): boolean;
  persistent(): boolean;
  save(event: MicroEvent): Promise<SaveResult>;
  reset(): boolean;
  subscribe(listener: () => void): () => void;
}

export function createMicroProgress(options: MicroStoreOptions = {}): MicroProgressApi {
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  const now = options.now ?? (() => Date.now());
  const withLock = options.withLock ?? defaultLock;
  let memory = emptyStore(now());
  let persistent = Boolean(storage);
  let readOnly = false;
  // Once a write or read fails, the in-memory copy is the copy the learner can still see. Keep it
  // authoritative until another tab has a newer revision or a later write lands.
  let memoryFallback = false;
  let listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of listeners) listener();
  };

  const read = (): MicroStore => {
    if (!storage) return memory;
    const result = readMicroStore(storage, now());
    readOnly = result.readOnly;
    persistent = result.persistent;
    if (result.readOnly) return result.store;
    if (!result.persistent) {
      memoryFallback = true;
      return memory;
    }
    if (memoryFallback) {
      // A later read can recover, but only if the bucket now carries a newer revision. An empty
      // bucket is not evidence that the activity in memory never happened.
      if (result.store.revision > memory.revision) {
        memoryFallback = false;
        return result.store;
      }
      persistent = false;
      return memory;
    }
    return result.store;
  };

  const save = async (event: MicroEvent): Promise<SaveResult> => {
    if (readOnly) return { saved: false, reason: 'read-only' };
    const concept = MICRO_BY_ID.get(event.conceptId);
    if (!concept) return { saved: false, reason: 'unknown-concept' };
    return withLock(async () => {
      // The reducer is applied to the newest state on every attempt. A second tab may have written
      // between our read and our write, so a conflict is retried against its state, never against
      // the state this tab was holding when the learner pressed the button. Three attempts is enough
      // for a human-paced save; the Web Lock (when present) makes the window much smaller first.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const result = read();
        if (readOnly) return { saved: false, reason: 'read-only' };
        if (result.events.some((entry) => entry.eventId === event.eventId)) {
          return { saved: true, duplicate: true, store: result, persistent };
        }
        const next: MicroStore = {
          ...result,
          concepts: { ...result.concepts },
          events: pruneEvents([...result.events, event]),
          revision: result.revision + 1,
          updatedAt: now(),
        };
        next.concepts[event.conceptId] = applyMicroEvent(
          result.concepts[event.conceptId],
          event,
          concept,
          event.timestamp
        );
        if (!storage || !persistent || memoryFallback) {
          // No bucket, or a blocked read: keep the activity in memory and say so on screen.
          memory = next;
          memoryFallback = true;
          persistent = false;
          notify();
          return { saved: true, duplicate: false, store: next, persistent: false };
        }
        if (!writeMicroStore(next, storage)) {
          // A full or disabled bucket is not a lost activity. The in-memory store keeps working for
          // this sitting; the tab's banner tells the learner it will not be here next time.
          memory = next;
          memoryFallback = true;
          persistent = false;
          notify();
          return { saved: true, duplicate: false, store: next, persistent: false };
        }
        const after = readMicroStore(storage, now());
        if (!after.persistent) {
          memory = next;
          memoryFallback = true;
          persistent = false;
          notify();
          return { saved: true, duplicate: false, store: next, persistent: false };
        }
        if (after.store.revision === next.revision) {
          memoryFallback = false;
          persistent = true;
          notify();
          return { saved: true, duplicate: false, store: next, persistent: true };
        }
      }
      return { saved: false, reason: 'storage-full' };
    });
  };


  const reset = (): boolean => {
    // A newer schema is read-only on purpose: resetting it would delete evidence this build cannot
    // read, so the control refuses rather than silently discarding a future format.
    if (readOnly) return false;
    if (!storage) {
      memory = emptyStore(now());
      notify();
      return true;
    }
    const cleared = clearMicroStore(storage);
    memory = emptyStore(now());
    memoryFallback = false;
    persistent = cleared;
    if (cleared) notify();
    return cleared;
  };

  return {
    read,
    readOnly: () => readOnly,
    persistent: () => persistent,
    save,
    reset,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const shared = createMicroProgress();

export const microProgress = shared;

/** The React-facing save helper. It never throws: a blocked store is a visible banner, not a crash. */
export async function saveMicroEvent(event: MicroEvent): Promise<SaveResult> {
  try {
    return await shared.save(event);
  } catch {
    return { saved: false, reason: 'storage-full' };
  }
}

export function resetMicroProgress(): boolean {
  return shared.reset();
}

/** Exported for tests and the storage-event listener in the tab. */
export { MICRO_STORAGE_KEY };
