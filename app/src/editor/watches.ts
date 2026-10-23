/**
 * Watch expressions: a name pinned so its value is visible at every park
 * (`app/src/editor/watches.ts`).
 *
 * `docs/PLAN-2.0-GAP.md`'s debugger row closes with this one. The paused bar already shows the
 * frame's own values, which is enough while the name the learner is thinking about happens to be a
 * local of the frame they stopped in: `total` inside a loop is there, but `plant.L1` is not, nor is
 * `n * 2`, nor the accumulator of a function they stepped into from a helper. A watch is that gap
 * closed — an expression the learner writes once and the worker evaluates **in every frame it
 * parks in**, so the same question is answered at every stop instead of only the lucky ones.
 *
 * **Three decisions worth the words.**
 *
 * *Per lesson, on purpose.* A watch is about a program, and the editor's document is one lesson's
 * file: `total` means nothing in the next lesson, so the list travels with the lesson the way its
 * breakpoints and its draft do. It is a reading preference, not work, so it lives in `localStorage`
 * beside them rather than in the IndexedDB stores notes and drafts use.
 *
 * *An expression, not a name.* `n * 2`, `plant.L1`, `len(items)` are all the same operation to the
 * worker (one `eval` in the parked frame), so the store holds strings and nothing here has to know
 * Python. What it does enforce is the shape a one-line bar can show: one line, no runs of
 * whitespace, a width the chip has room for.
 *
 * *Five, and trimmed on the way in.* A bar with twenty pinned values is a wall, not a glance; five
 * is what fits beside the frame's own values at the narrowest width the layout allows. Unlike a
 * breakpoint's condition — whose input **is** the stored string, so trimming would swallow the
 * space bar mid-typing — a watch is written and then submitted, so the value that is stored is the
 * value that was meant: trimmed, deduplicated (adding `total` twice answers "it is already there"
 * rather than showing it twice), and capped.
 *
 * Pure, and separate from the bar: the cases worth pinning — a stored list from an older version, a
 * runaway list, a duplicate, a browser that refuses storage — are awkward to aim at through a
 * browser and trivial to hand to a function (`npm run test:watches`).
 */

/** One record per lesson id: the expressions it pins, in the order they were added. */
export type WatchStore = Record<string, string[]>;

export const STORAGE_KEY_WATCHES = 'mechalab_watches_v1';

/**
 * A lesson keeps at most this many, and the store at most this many lessons (oldest written first
 * out). The same shape as the breakpoint store, for the same reason: a runaway list would be read
 * and sent on every run.
 */
export const MAX_WATCHES_PER_LESSON = 5;
export const MAX_WATCH_LESSONS = 60;

/**
 * How long one expression may be, in characters.
 *
 * `len(plant.fk(0.1, 0.2))` fits with room to spare. The number is shared with the worker (which
 * truncates to the same width), so the chip cannot quote an expression the interpreter was not
 * given. Anything longer is a program, and the editor is where that belongs.
 */
export const MAX_WATCH_CHARS = 120;

/**
 * The expression as it will be stored and sent: one line, runs of whitespace folded to a space,
 * trimmed, capped.
 *
 * Trimmed — unlike a condition — because this string is not live in an input: the field is submitted
 * (Enter) and then cleared, so the only thing a trailing space can be is a typo. Newlines fold for
 * the same reason the field is one line: a pasted multi-line expression must be what is on screen.
 */
export function normalizeWatch(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_WATCH_CHARS);
}

/**
 * A list as it will be stored: strings, no duplicates, order kept, capped.
 *
 * Order is kept because that is the reading order the learner chose, and a re-sort would move a
 * chip while they are looking at it. Duplicates collapse to the first occurrence: a second `total`
 * would read identically and cost a second `eval` at every park.
 */
export function normalizeWatches(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : [];
  const out: string[] = [];
  for (const item of raw) {
    const expression = normalizeWatch(item);
    if (!expression || out.includes(expression)) continue;
    out.push(expression);
    if (out.length >= MAX_WATCHES_PER_LESSON) break;
  }
  return out;
}

/**
 * Pin one expression, or answer the list unchanged when it is already pinned or the bar is full.
 *
 * Returns the list to draw rather than a flag, so the caller cannot end up showing a chip the next
 * park will not evaluate. The cap is enforced here and again in the worker: this one keeps the bar
 * honest, that one keeps a hand-written message honest.
 */
export function addWatch(entries: readonly string[], expression: string): string[] {
  const current = normalizeWatches([...entries]);
  const wanted = normalizeWatch(expression);
  if (!wanted || current.includes(wanted)) return current;
  if (current.length >= MAX_WATCHES_PER_LESSON) return current;
  return [...current, wanted];
}

/** Unpin one expression; an expression that is not pinned changes nothing. */
export function removeWatch(entries: readonly string[], expression: string): string[] {
  const wanted = normalizeWatch(expression);
  return normalizeWatches([...entries]).filter((entry) => entry !== wanted);
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // A browser that refuses the property entirely (private mode, blocked third-party storage).
    return null;
  }
}

/** Every lesson's list, as stored. An entry with nothing in it is dropped. */
export function readWatchStore(): WatchStore {
  const store = storage();
  if (!store) return {};
  let parsed: unknown;
  try {
    const raw = store.getItem(STORAGE_KEY_WATCHES);
    if (!raw) return {};
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const out: WatchStore = {};
  let lessons = 0;
  for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!id || lessons >= MAX_WATCH_LESSONS) break;
    const entries = normalizeWatches(value);
    if (!entries.length) continue;
    out[id] = entries;
    lessons += 1;
  }
  return out;
}

/** This lesson's watches; `[]` when none are set or storage is unavailable. */
export function readWatches(lessonId: string): string[] {
  return readWatchStore()[lessonId] ?? [];
}

/**
 * Store this lesson's list and answer what is now stored.
 *
 * The return value is what the caller should draw, so a browser that refuses the write cannot leave
 * the bar showing a watch the next run will not send. An empty list forgets the lesson instead of
 * keeping an empty array, and the written lesson moves to the back of the record so eviction drops
 * the longest-untouched lesson rather than the alphabetically first.
 */
export function writeWatches(lessonId: string, entries: readonly string[]): string[] {
  const stored = normalizeWatches([...entries]);
  const store = storage();
  if (!store) return stored;
  const all = readWatchStore();
  delete all[lessonId];
  if (stored.length) all[lessonId] = stored;
  const ids = Object.keys(all);
  while (ids.length > MAX_WATCH_LESSONS) {
    const oldest = ids.shift();
    if (oldest) delete all[oldest];
  }
  try {
    if (ids.length) store.setItem(STORAGE_KEY_WATCHES, JSON.stringify(all));
    else store.removeItem(STORAGE_KEY_WATCHES);
  } catch {
    // Full or blocked: the run still evaluates what the bar shows, it just is not remembered.
  }
  return stored;
}

/** Forget one lesson's watches, or all of them when no id is given. */
export function clearWatches(lessonId?: string): void {
  const store = storage();
  if (!store) return;
  if (lessonId === undefined) {
    try {
      store.removeItem(STORAGE_KEY_WATCHES);
    } catch {
      // Nothing was stored to forget.
    }
    return;
  }
  const all = readWatchStore();
  if (!(lessonId in all)) return;
  delete all[lessonId];
  try {
    if (Object.keys(all).length) store.setItem(STORAGE_KEY_WATCHES, JSON.stringify(all));
    else store.removeItem(STORAGE_KEY_WATCHES);
  } catch {
    // As above: the in-memory list is still the truth for this visit.
  }
}
