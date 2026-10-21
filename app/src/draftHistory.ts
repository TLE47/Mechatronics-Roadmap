// The `.ts` extension is for Node's type stripping (`scripts/test_draft_history.mjs`), the same way
// `lessonDraft.ts` imports its registry.
import { PYTHON_LESSONS } from './data/pythonLessonsData.ts';

/**
 * The code each run started from, so a learner can go back one step.
 *
 * A draft keeps the *latest* text and nothing else: running a version, breaking it, and running again
 * leaves the learner with the broken one and no way back. History is the missing half of that store -
 * every Run files what the editor held at that moment, with the verdict it got, so "it worked before I
 * touched `Kp`" is something the learner can act on rather than remember.
 *
 * Snapshots are taken on Run, not on typing: the interesting units are attempts, and a per-keystroke
 * history would be both enormous and unreadable. An identical re-run does not add a version - it
 * updates that version's verdict - because pressing Run twice on the same text is one attempt.
 *
 * Bounded three ways, because it shares the same 5 MB `localStorage` bucket as drafts and progress:
 *
 * - **No starter, no snapshot.** The starter is always one button away (Reset Starter), so storing it
 *   would spend the bucket on something the lesson already ships.
 * - **At most `MAX_SNAPSHOTS_PER_LESSON` versions**, oldest dropped first.
 * - **At most `MAX_SNAPSHOT_CHARS` per snapshot and `MAX_HISTORY_CHARS` overall**, evicting the oldest
 *   snapshots across every lesson until the store fits. A paste bigger than the per-snapshot cap is
 *   not a version worth keeping, and dropping it is cheaper than losing the whole store to a full
 *   bucket.
 *
 * Never throws: private mode and blocked storage both make `localStorage` throw on access, and a
 * learner in one of those gets a working editor without history.
 */

export const STORAGE_KEY_HISTORY = 'mechalab_draft_history_v1';
export const MAX_SNAPSHOTS_PER_LESSON = 5;
export const MAX_SNAPSHOT_CHARS = 12_000;
export const MAX_HISTORY_CHARS = 120_000;

export interface DraftSnapshot {
  /** The editor's text when Run was pressed. */
  code: string;
  /** When that run finished, so the list can say how long ago. */
  at: number;
  /** That run's verdict: verified | mismatch | harness_failed | behavior_failed | stopped | error. */
  outcome: string;
}

/** Lesson id -> its versions, newest first. */
export type HistoryStore = Record<string, DraftSnapshot[]>;

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** A store written by an older version, or a truncated one, reads as the entries it can prove. */
function parseHistory(raw: string | null): HistoryStore {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const history: HistoryStore = {};
  for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue;
    const kept: DraftSnapshot[] = [];
    for (const entry of value) {
      if (!entry || typeof entry !== 'object') continue;
      const { code, at, outcome } = entry as Record<string, unknown>;
      if (typeof code !== 'string' || typeof at !== 'number') continue;
      kept.push({ code, at, outcome: typeof outcome === 'string' ? outcome : 'untested' });
    }
    if (kept.length) history[id] = kept.slice(0, MAX_SNAPSHOTS_PER_LESSON);
  }
  return history;
}

function writeHistory(store: Storage, history: HistoryStore): void {
  try {
    store.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history));
  } catch {
    // A full bucket must not break the editor: this session keeps running, history is just empty.
  }
}

/** Characters a store holds, which is what the bucket measures. */
export function historyChars(history: HistoryStore): number {
  let total = 0;
  for (const versions of Object.values(history)) {
    for (const version of versions) total += version.code.length;
  }
  return total;
}

/**
 * Drop the oldest versions, across every lesson, until the store fits the budget.
 *
 * Eviction is by timestamp rather than by lesson, because the store has to shrink by a nameable rule:
 * the thing removed is always the least recent attempt anywhere, which is also the one a learner is
 * least likely to want back.
 */
function trimToBudget(history: HistoryStore): HistoryStore {
  let over = historyChars(history) - MAX_HISTORY_CHARS;
  if (over <= 0) return history;
  while (over > 0) {
    let oldestId: string | null = null;
    let oldestIndex = -1;
    let oldestAt = Infinity;
    for (const [id, versions] of Object.entries(history)) {
      const last = versions.length - 1;
      if (last < 0) continue;
      if (versions[last].at < oldestAt) {
        oldestAt = versions[last].at;
        oldestId = id;
        oldestIndex = last;
      }
    }
    if (oldestId === null) break;
    const [removed] = history[oldestId].splice(oldestIndex, 1);
    over -= removed.code.length;
    if (!history[oldestId].length) delete history[oldestId];
  }
  return history;
}

/** Every stored version, newest first within each lesson. */
export function readHistory(): HistoryStore {
  const store = storage();
  if (!store) return {};
  try {
    return parseHistory(store.getItem(STORAGE_KEY_HISTORY));
  } catch {
    return {};
  }
}

/** One lesson's versions, newest first - what the runner's History panel lists. */
export function snapshotsFor(id: string): DraftSnapshot[] {
  return readHistory()[id] ?? [];
}

export interface HistoryMerge {
  /** The store as written. */
  history: HistoryStore;
  /** Versions the result holds that it did not hold before; an evicted arrival does not count. */
  added: number;
}

/**
 * Merge a whole store in - a backup's versions, or another device's.
 *
 * `recordSnapshot` cannot do this job: it files arrivals in the order they come, which is correct for
 * a Run (a live run is always the newest) and wrong for a replay, where an older version inserted
 * after a newer one would sit on top and then evict it. A merge therefore orders by timestamp itself,
 * dedupes by that timestamp plus the text, and enforces both caps on the result.
 */
export function mergeHistory(incoming: HistoryStore): HistoryMerge {
  const current = readHistory();
  const ids = new Set([...Object.keys(current), ...Object.keys(incoming)]);
  const merged: HistoryStore = {};
  for (const id of ids) {
    const byKey = new Map<string, DraftSnapshot>();
    for (const version of current[id] ?? []) byKey.set(`${version.at}|${version.code}`, version);
    const starter = starterFor(id);
    for (const version of incoming[id] ?? []) {
      if (!version.code.trim() || version.code.length > MAX_SNAPSHOT_CHARS) continue;
      if (starter !== null && version.code === starter) continue;
      byKey.set(`${version.at}|${version.code}`, version);
    }
    const kept = [...byKey.values()]
      .sort((a, b) => b.at - a.at)
      .slice(0, MAX_SNAPSHOTS_PER_LESSON);
    if (kept.length) merged[id] = kept;
  }
  const history = trimToBudget(merged);
  const store = storage();
  if (store) writeHistory(store, history);

  let added = 0;
  for (const [id, versions] of Object.entries(history)) {
    for (const version of versions) {
      const known = (current[id] ?? []).some(
        (existing) => existing.at === version.at && existing.code === version.code
      );
      if (!known) added += 1;
    }
  }
  return { history, added };
}

function starterFor(id: string): string | null {
  return PYTHON_LESSONS.find((lesson) => lesson.id === id)?.starterCode ?? null;
}

/**
 * File the text a run started from, with that run's verdict.
 *
 * Returns the store as written, so a caller that wants to show the list immediately does not have to
 * read it back. A run of the untouched starter, of empty text, or of a paste past the cap files
 * nothing: none of the three is a version a learner would restore.
 */
export function recordSnapshot(
  id: string,
  code: string,
  outcome: string,
  at: number = Date.now()
): HistoryStore {
  const history = readHistory();
  const starter = starterFor(id);
  if (!code.trim() || code.length > MAX_SNAPSHOT_CHARS) return history;
  if (starter !== null && code === starter) return history;

  const versions = history[id] ?? [];
  if (versions.length && versions[0].code === code) {
    // The same text run again is the same version: keep one entry carrying the newest verdict, so
    // pressing Run three times on a failing line does not bury the version that worked.
    versions[0] = { code, at, outcome };
  } else {
    versions.unshift({ code, at, outcome });
  }
  history[id] = versions.slice(0, MAX_SNAPSHOTS_PER_LESSON);

  const store = storage();
  if (!store) return history;
  writeHistory(store, trimToBudget(history));
  return history;
}

/** How old a version is, in the one unit a person reads without arithmetic. */
export function snapshotAgeLabel(at: number, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

/**
 * A run's verdict in the words the History list uses.
 *
 * The runner's own state names are precise and unreadable in a list (`behavior_failed`); this is the
 * same fact, short enough to sit beside a timestamp. An unknown name is shown as itself rather than
 * hidden, so a new verdict appears in the list instead of silently reading "unknown".
 */
export function verdictLabel(outcome: string): string {
  switch (outcome) {
    case 'verified':
    case 'passed':
      return 'passed';
    case 'mismatch':
      return 'output mismatch';
    case 'behavior_failed':
      return 'checks failed';
    case 'harness_failed':
      return 'bench failed';
    case 'stopped':
      return 'stopped';
    case 'error':
      return 'error';
    case 'untested':
      return 'not run';
    default:
      return outcome;
  }
}

/** Forget one lesson's versions, or every lesson's when no id is given. */
export function clearHistory(id?: string): void {
  const store = storage();
  if (!store) return;
  if (id === undefined) {
    try {
      store.removeItem(STORAGE_KEY_HISTORY);
    } catch {
      // Blocked storage: nothing was stored to forget.
    }
    return;
  }
  const history = readHistory();
  if (!(id in history)) return;
  delete history[id];
  writeHistory(store, history);
}
