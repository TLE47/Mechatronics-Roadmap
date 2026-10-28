/**
 * The ticks a learner makes in a lesson (`app/src/lessonChecks.ts`).
 *
 * A reading page's bullets are usually a list of things to do — wire the divider, run the sweep,
 * change one gain — and a list of things to do is only useful if it remembers which ones are done.
 * The reader draws every unordered item as a checkbox; this module is where the tick lives.
 *
 * One store, keyed by lesson id, and inside it the *text* of the item, cleaned the way a highlight's
 * quote is. The text is the identity on purpose: a page is regenerated from Markdown, and its block
 * indexes move whenever a paragraph is added above the list, so an index would tick the wrong line
 * after the next content build. Two identical bullets in one lesson are one item — the same sentence
 * twice is the same instruction twice — and editing a bullet's wording starts it unticked, which is
 * the honest answer to "is the thing I am now reading done?".
 *
 * This is deliberately its own key rather than a field on `studyNotes.ts`: a tick is progress, not
 * authored work, it is a few hundred short strings instead of a 4,000-character note per lesson, and
 * the reset sheet has to be able to clear it without touching what was written. The store is bounded
 * per lesson; the oldest tick goes when a page somehow grows past `MAX_TICKS_PER_LESSON` items.
 *
 * It travels two ways: the backup archive's `checks.json`, and the opt-in workspace document. Both
 * merge by union (`mergeChecks`) — a tick made on another machine is added, never taken away — which
 * is the same rule the progress maps use, and the reason a restore cannot be used to un-tick work.
 *
 * A write that cannot land says so (`false`), because private mode and a full bucket both refuse one
 * and the reader has to be able to say "not saved" instead of showing a tick that vanishes on reload.
 */

export const STORAGE_KEY_CHECKS = 'mechalab_lesson_checks_v1';
/** One reading page's checklist is dozens of items; four hundred is a page that is not prose. */
export const MAX_TICKS_PER_LESSON = 400;
/** A bullet's first 160 characters are its identity; the rest is the sentence it belongs to. */
export const MAX_CHECK_ID_CHARS = 160;

export interface LessonChecks {
  /** The cleaned text of every ticked item, oldest first. */
  done: string[];
  /** Last tick or untick, so a list can be ordered and a restore can pick a winner later. */
  updatedAt: number;
}

/** Lesson id -> the items ticked in it. */
export type CheckStore = Record<string, LessonChecks>;

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * A bullet's identity: its words, with the whitespace a selection or a copied line carries collapsed.
 *
 * It is applied to the item's raw Markdown, not its rendered text, so the identity does not change
 * when the renderer learns a new inline run. The cap keeps one pathological list from filling the
 * bucket, and the same rule is applied on read, which is how a hand-edited store stays usable.
 */
export function checkId(text: string): string {
  if (typeof text !== 'string') return '';
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_CHECK_ID_CHARS);
}

function asLesson(value: unknown): LessonChecks | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Record<string, unknown>;
  if (!Array.isArray(entry.done)) return null;
  const done: string[] = [];
  const seen = new Set<string>();
  for (const raw of entry.done) {
    const id = checkId(typeof raw === 'string' ? raw : '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    done.push(id);
  }
  if (done.length === 0) return null;
  const updatedAt = Number(entry.updatedAt);
  return {
    done: done.slice(-MAX_TICKS_PER_LESSON),
    updatedAt: Number.isFinite(updatedAt) && updatedAt >= 0 ? updatedAt : 0,
  };
}

/**
 * A store out of anything JSON-shaped: the bucket, a workspace document, a backup file.
 *
 * Entries that do not parse are dropped rather than repaired by guessing, and a lesson key is
 * trimmed the same way an item's identity is. The result is always usable by the reader.
 */
export function parseCheckStore(value: unknown): CheckStore {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const store: CheckStore = {};
  for (const [id, entry] of Object.entries(value as Record<string, unknown>)) {
    const key = id.trim();
    if (!key) continue;
    const lesson = asLesson(entry);
    if (lesson) store[key] = lesson;
  }
  return store;
}

/** A store written by another version, or by hand, reads as the part of itself that still parses. */
export function parseChecks(raw: string | null): CheckStore {
  if (!raw) return {};
  try {
    return parseCheckStore(JSON.parse(raw));
  } catch {
    return {};
  }
}

function writeChecks(store: Storage, checks: CheckStore): boolean {
  const next: CheckStore = {};
  for (const [id, lesson] of Object.entries(checks)) {
    if (!id || lesson.done.length === 0) continue;
    next[id] = { done: lesson.done.slice(-MAX_TICKS_PER_LESSON), updatedAt: lesson.updatedAt };
  }
  try {
    if (Object.keys(next).length === 0) store.removeItem(STORAGE_KEY_CHECKS);
    else store.setItem(STORAGE_KEY_CHECKS, JSON.stringify(next));
    return true;
  } catch {
    // A blocked or full bucket keeps the tick in this render only; the reader turns the false into
    // a line that says so, because throwing into a React render would take the lesson down with it.
    return false;
  }
}

/**
 * Write a whole store, as a restore or a workspace merge hands one back.
 *
 * The store is normalized first, so a backup file or an account row cannot put an entry into the
 * bucket that the reader would then refuse. An empty store removes the key, as every other write does.
 */
export function replaceChecks(checks: CheckStore): boolean {
  const store = storage();
  if (!store) return false;
  return writeChecks(store, parseCheckStore(checks));
}

/**
 * Merge a second store in — the rule the backup and the workspace document both promise: **a tick is
 * added, never removed.** A learner who ticks `wire the divider` on a phone keeps it on the laptop;
 * un-ticking is a local act until the list is cleared, which is what `clearTicks` is for.
 *
 * `added` counts the ticks the merged store holds that this one did not, which is what a restore
 * report and a sync sentence print.
 */
export function mergeChecks(
  local: CheckStore,
  incoming: CheckStore
): { store: CheckStore; added: number } {
  const base = parseCheckStore(local);
  const store = parseCheckStore(local);
  let added = 0;
  for (const [id, lesson] of Object.entries(parseCheckStore(incoming))) {
    const here = store[id];
    if (!here) {
      const done = lesson.done.slice(-MAX_TICKS_PER_LESSON);
      store[id] = { done, updatedAt: lesson.updatedAt };
      added += done.length;
      continue;
    }
    const before = new Set(base[id]?.done ?? []);
    const kept = new Set(here.done);
    for (const item of lesson.done) {
      if (kept.has(item)) continue;
      here.done.push(item);
      kept.add(item);
    }
    here.done = here.done.slice(-MAX_TICKS_PER_LESSON);
    here.updatedAt = Math.max(here.updatedAt, lesson.updatedAt);
    const final = new Set(here.done);
    added += lesson.done.filter((item) => !before.has(item) && final.has(item)).length;
  }
  return { store, added };
}

/** Every lesson with at least one tick. */
export function readChecks(): CheckStore {
  const store = storage();
  if (!store) return {};
  try {
    return parseChecks(store.getItem(STORAGE_KEY_CHECKS));
  } catch {
    return {};
  }
}

/** The ticks in one lesson, oldest first; a lesson with nothing ticked reads as an empty list. */
export function readTicks(lessonId: string): string[] {
  return readChecks()[lessonId]?.done ?? [];
}

export function isTicked(lessonId: string, text: string): boolean {
  const id = checkId(text);
  if (!id) return false;
  return readTicks(lessonId).includes(id);
}

/**
 * Tick or untick one item. Returns whether the store accepted the write.
 *
 * Asking for the state it is already in is a success with no write: a double click on a checkbox
 * must not, by itself, be able to fail and show "not saved" for a tick that is already there.
 */
export function setTicked(
  lessonId: string,
  text: string,
  ticked: boolean,
  now: number = Date.now()
): boolean {
  const store = storage();
  const lessonKey = lessonId.trim();
  const id = checkId(text);
  if (!store || !lessonKey || !id) return false;
  const checks = readChecks();
  const lesson = checks[lessonKey] ?? { done: [], updatedAt: now };
  const has = lesson.done.includes(id);
  if (ticked === has) return true;
  if (ticked) {
    lesson.done = [...lesson.done, id].slice(-MAX_TICKS_PER_LESSON);
    lesson.updatedAt = now;
    checks[lessonKey] = lesson;
  } else {
    lesson.done = lesson.done.filter((entry) => entry !== id);
    lesson.updatedAt = now;
    if (lesson.done.length === 0) delete checks[lessonKey];
    else checks[lessonKey] = lesson;
  }
  return writeChecks(store, checks);
}

/** The next state of one item and whether it was stored; the reader draws from `checked`. */
export function toggleTicked(
  lessonId: string,
  text: string,
  now: number = Date.now()
): { checked: boolean; saved: boolean } {
  const checked = !isTicked(lessonId, text);
  return { checked, saved: setTicked(lessonId, text, checked, now) };
}

/** Forget one lesson's ticks; the lesson text is untouched. */
export function clearTicks(lessonId: string): void {
  const store = storage();
  if (!store) return;
  const checks = readChecks();
  if (!(lessonId in checks)) return;
  delete checks[lessonId];
  writeChecks(store, checks);
}

/** Forget every tick in every lesson. */
export function clearAllTicks(): void {
  try {
    storage()?.removeItem(STORAGE_KEY_CHECKS);
  } catch {
    // A store that cannot be written to cannot be emptied either; the next visit reads what is left.
  }
}

/** What the reset sheet lists: lessons with ticks, and how many ticks there are in all. */
export function tickCounts(checks: CheckStore = readChecks()): { lessons: number; ticks: number } {
  const lessons = Object.values(checks).filter((lesson) => lesson.done.length > 0);
  return {
    lessons: lessons.length,
    ticks: lessons.reduce((total, lesson) => total + lesson.done.length, 0),
  };
}
