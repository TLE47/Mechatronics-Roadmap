/**
 * The one lesson renumber so far: on 2026-11-17 `P.15` became `P.14` and `P.14` became `P.13`.
 *
 * A lesson id is not a label. It is the key of every saved flag, draft, reading position, note and
 * shared link, which is why Track P's ids were left alone for so long. Filling the `P.13` gap means
 * paying that cost exactly once, and this module is the payment:
 *
 * - **The map is simultaneous.** An old `P.15` must become `P.14`, not fall through the gap into
 *   `P.13`, so every id is looked up in one pass against the original string.
 * - **The migration runs once per browser**, guarded by `RENAMES_MARKER_KEY`, so a later visit
 *   cannot shift a record twice (which would silently move `P.14` down to `P.13`).
 * - **Old links keep working.** `canonicalLessonId` is applied where an id enters the app
 *   (`?lesson=`), so a page bookmarked before the renumber opens the lesson it named.
 *
 * Nothing here touches the network or the DOM at import time: the pure helpers are used by
 * `progressMerge.ts` (which the Node suites import), and the migration takes the stores it rewrites
 * as arguments.
 */

export const LESSON_ID_RENAMES: Readonly<Record<string, string>> = Object.freeze({
  'P.14': 'P.13',
  'P.15': 'P.14',
});

/** Written once the maps, drafts and positions below have been moved to their new ids. */
export const RENAMES_MARKER_KEY = 'mechalab_lesson_renames_v1';
export const RENAMES_MARKER_VALUE = 'P.13,P.14@2026-11-17';

/** The id a stored or linked id means in this build. Every old id lands on its own lesson. */
export function canonicalLessonId(id: string): string {
  return LESSON_ID_RENAMES[id] ?? id;
}

/**
 * One simultaneous pass over a map keyed by lesson id (flags, drafts, positions, checks).
 *
 * A value already stored under the new key is treated as the newer write and keeps its place: the
 * map can only collide with work saved after this build shipped, never with the pre-renumber data
 * the migration is moving.
 */
export function renameLessonMap<T>(map: Record<string, T>): Record<string, T> {
  const moved = Object.keys(map).filter((key) => key in LESSON_ID_RENAMES);
  if (moved.length === 0) return map;
  const next: Record<string, T> = {};
  for (const [key, value] of Object.entries(map)) {
    if (!(key in LESSON_ID_RENAMES)) next[key] = value;
  }
  for (const key of moved) next[canonicalLessonId(key)] = map[key];
  return next;
}

/** The same pass over an array of ids, for a store that keeps a list rather than a map. */
export function renameLessonIds(ids: string[]): string[] {
  if (!ids.some((id) => id in LESSON_ID_RENAMES)) return ids;
  return ids.map(canonicalLessonId);
}

/**
 * Rewrite the ids in one already-parsed store value, or answer the same reference when nothing moved.
 *
 * Only the shallow shapes are rewritten — object keys and exact ids in strings or string arrays —
 * because a deeper pass would start editing the learner's own prose and code (a draft that says
 * "Lesson P.14" is text, not a key). The stores this app keys by lesson id are all shallow.
 */
function renameStoredValue(value: unknown): unknown {
  if (typeof value === 'string') return canonicalLessonId(value);
  if (Array.isArray(value)) {
    let changed = false;
    const renamed = value.map((item) => {
      if (typeof item !== 'string') return item;
      const id = canonicalLessonId(item);
      if (id !== item) changed = true;
      return id;
    });
    return changed ? renamed : value;
  }
  if (value && typeof value === 'object') {
    return renameLessonMap(value as Record<string, unknown>);
  }
  return value;
}

function rewriteStore(store: Storage): void {
  let keys: string[] = [];
  try {
    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index);
      if (key) keys.push(key);
    }
  } catch {
    return;
  }
  for (const key of keys) {
    if (!key.startsWith('mechalab') || key === RENAMES_MARKER_KEY) continue;
    try {
      const raw = store.getItem(key);
      if (!raw || !raw.includes('P.1')) continue;
      const parsed: unknown = JSON.parse(raw);
      const rewritten = renameStoredValue(parsed);
      if (rewritten === parsed) continue;
      store.setItem(key, JSON.stringify(rewritten));
    } catch {
      // Not JSON, or a store that refuses writes: leave the record alone rather than erase it.
    }
  }
}

/**
 * Move every stored lesson id to its current meaning, once.
 *
 * `stores[0]` holds the marker (the app passes `localStorage` first, then the bulk/IndexedDB
 * passthrough). Answers true when this call did the migration, false when it was already done or
 * there was no store to touch — the answer a test asserts on, not something the UI shows.
 */
export function migrateRenamedLessonIds(stores: Array<Storage | null | undefined>): boolean {
  const present = stores.filter((store): store is Storage => !!store);
  if (present.length === 0) return false;
  const marker = present[0];
  try {
    if (marker.getItem(RENAMES_MARKER_KEY) === RENAMES_MARKER_VALUE) return false;
  } catch {
    return false;
  }
  for (const store of present) rewriteStore(store);
  try {
    marker.setItem(RENAMES_MARKER_KEY, RENAMES_MARKER_VALUE);
  } catch {
    // The rewrite landed; a blocked marker only costs a second (idempotent) pass next visit.
  }
  return true;
}
