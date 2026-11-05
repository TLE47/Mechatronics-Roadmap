/**
 * The versioned micro-learning store (`app/src/micro/store.ts`).
 *
 * `localStorage` only, by design: progress is browser-local and there is no sync or import. The
 * store is deliberately separate from the catalogue so Home can read a due count without pulling the
 * whole micro UI into its chunk.
 *
 * Three honesty rules:
 * - a newer schema is read-only and says so; it is never silently downgraded;
 * - a blocked or full bucket falls back to memory and the tab says progress will not be saved;
 * - the event log is bounded, but the aggregates it produced are not pruned with it.
 */

import {
  MICRO_EVENT_LIMIT,
  MICRO_STORAGE_KEY,
  MICRO_STORE_VERSION,
  type MicroConceptState,
  type MicroEvent,
  type MicroStore,
} from './types.ts';

export interface StoreRead {
  store: MicroStore;
  readOnly: boolean;
  corrupt: boolean;
  persistent: boolean;
}

export function emptyStore(now = 0): MicroStore {
  return { version: 1, revision: 0, concepts: {}, events: [], updatedAt: now };
}

function asNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function asState(value: unknown): MicroConceptState | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Record<string, unknown>;
  const conceptId = typeof entry.conceptId === 'string' ? entry.conceptId : '';
  if (!conceptId) return null;
  const mastery =
    entry.mastery === 'consolidated' || entry.mastery === 'provisional' || entry.mastery === 'learning'
      ? entry.mastery
      : 'learning';
  const diagnostic = asNumber(entry.diagnosticCorrect);
  return {
    conceptId,
    revision: asNumber(entry.revision) ?? 0,
    mastery,
    stale: entry.stale === true,
    skipEligible: entry.skipEligible === true,
    successCount: Math.max(0, Math.round(asNumber(entry.successCount) ?? 0)),
    dueAt: asNumber(entry.dueAt),
    lastReviewedAt: asNumber(entry.lastReviewedAt),
    learnCompletedAt: asNumber(entry.learnCompletedAt),
    diagnosticCorrect: diagnostic === 0 || diagnostic === 1 || diagnostic === 2 ? diagnostic : null,
    practiceCorrect: typeof entry.practiceCorrect === 'boolean' ? entry.practiceCorrect : null,
  };
}

function asEvent(value: unknown): MicroEvent | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Record<string, unknown>;
  const activity = entry.activity;
  if (activity !== 'learn' && activity !== 'review' && activity !== 'challenge') return null;
  if (typeof entry.eventId !== 'string' || typeof entry.conceptId !== 'string') return null;
  const timestamp = asNumber(entry.timestamp);
  if (timestamp === null) return null;
  return {
    eventId: entry.eventId,
    attemptId: typeof entry.attemptId === 'string' ? entry.attemptId : entry.eventId,
    conceptId: entry.conceptId,
    activity,
    timestamp,
    elapsedSeconds: Math.max(0, asNumber(entry.elapsedSeconds) ?? 0),
    visibleSeconds: Math.max(0, asNumber(entry.visibleSeconds) ?? 0),
    sourceRevision: Math.max(0, asNumber(entry.sourceRevision) ?? 0),
    ...(asNumber(entry.diagnosticCorrect) !== null
      ? { diagnosticCorrect: asNumber(entry.diagnosticCorrect) as 0 | 1 | 2 }
      : {}),
    ...(asNumber(entry.diagnosticTotal) === 2 ? { diagnosticTotal: 2 as const } : {}),
    ...(typeof entry.practiceCorrect === 'boolean' || entry.practiceCorrect === null
      ? { practiceCorrect: entry.practiceCorrect }
      : {}),
    ...(asNumber(entry.correctCount) !== null ? { correctCount: asNumber(entry.correctCount) ?? 0 } : {}),
    ...(asNumber(entry.totalQuestions) !== null ? { totalQuestions: asNumber(entry.totalQuestions) ?? 0 } : {}),
    ...(typeof entry.correct === 'boolean' ? { correct: entry.correct } : {}),
  };
}

/** Parse a raw JSON string. A newer version is preserved for the caller and marked read-only. */
export function parseStore(raw: string | null, now = 0): StoreRead {
  if (!raw) return { store: emptyStore(now), readOnly: false, corrupt: false, persistent: true };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { store: emptyStore(now), readOnly: false, corrupt: true, persistent: true };
    }
    const entry = parsed as Record<string, unknown>;
    const version = asNumber(entry.version) ?? 0;
    if (version > MICRO_STORE_VERSION) {
      return { store: emptyStore(now), readOnly: true, corrupt: false, persistent: true };
    }
    const store = emptyStore(now);
    store.version = 1;
    store.revision = Math.max(0, Math.round(asNumber(entry.revision) ?? 0));
    store.updatedAt = asNumber(entry.updatedAt) ?? 0;
    const concepts = entry.concepts;
    if (concepts && typeof concepts === 'object' && !Array.isArray(concepts)) {
      for (const [id, value] of Object.entries(concepts as Record<string, unknown>)) {
        const state = asState(value);
        if (state) store.concepts[id] = state;
      }
    }
    const events = entry.events;
    if (Array.isArray(events)) {
      for (const value of events) {
        const event = asEvent(value);
        if (event) store.events.push(event);
      }
    }
    if (store.events.length > MICRO_EVENT_LIMIT) {
      store.events = store.events.slice(store.events.length - MICRO_EVENT_LIMIT);
    }
    return { store, readOnly: false, corrupt: false, persistent: true };
  } catch {
    return { store: emptyStore(now), readOnly: false, corrupt: true, persistent: true };
  }
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readStored(raw: string | null, now = Date.now()): StoreRead {
  return parseStore(raw, now);
}

export function readMicroStore(storage: StorageLike | null = browserStorage(), now = Date.now()): StoreRead {
  if (!storage) {
    return { store: emptyStore(now), readOnly: false, corrupt: false, persistent: false };
  }
  try {
    return { ...readStored(storage.getItem(MICRO_STORAGE_KEY), now), persistent: true };
  } catch {
    return { store: emptyStore(now), readOnly: false, corrupt: false, persistent: false };
  }
}

export function writeMicroStore(store: MicroStore, storage: StorageLike | null = browserStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(MICRO_STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

export function clearMicroStore(storage: StorageLike | null = browserStorage()): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(MICRO_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function pruneEvents(events: MicroEvent[]): MicroEvent[] {
  return events.length <= MICRO_EVENT_LIMIT ? events : events.slice(events.length - MICRO_EVENT_LIMIT);
}

export function dueCountFromStore(store: MicroStore, now = Date.now()): number {
  return Object.values(store.concepts).filter((state) => state.dueAt !== null && state.dueAt <= now).length;
}
