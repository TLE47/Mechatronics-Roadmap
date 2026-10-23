/**
 * Breakpoints: a park placed on a line rather than asked for at the next one
 * (`app/src/editor/breakpoints.ts`).
 *
 * `docs/PLAN-2.0-GAP.md`'s debugger row listed the gutter breakpoint as the one piece missing after
 * Pause/Step shipped: *"a park is asked for, not placed on a line."* A breakpoint is that placement —
 * click the gutter beside a line (or press `F9` with the caret on it) and the run stops **there**,
 * whether or not the learner can reach the toolbar in time.
 *
 * **Per lesson, on purpose.** The editor's document is a lesson's own file, so its breakpoints belong
 * to that lesson: switching to another lesson must not leave a park armed on a line the new file does
 * not have. The store is small (a line number costs a few bytes) and it is a preference about reading
 * rather than work, so it lives in `localStorage` beside the theme and the layout preset — not in the
 * IndexedDB stores drafts and notes use.
 *
 * **Remembered as a line number, held as a position.** What a reload restores is a number beside the
 * draft it belongs to; what the editor keeps while it is open is a document position, so an edit above
 * a dot carries it down with the statement it was placed on rather than leaving it pointing at
 * whatever moved into that line ([`breakpointState.ts`](breakpointState.ts)). The runner owns the
 * stored list, which is why the numbers, not the positions, are this module's contract.
 *
 * Pure, and separate from the gutter and the runner: the cases worth pinning (out-of-order clicks, a
 * stored list written by an older version, a runaway list, a browser that refuses storage) are
 * awkward to aim at through a browser and trivial to hand to a function (`npm run test:breakpoints`).
 */

/** One record per lesson id: the lines it parks on, ascending. */
export type BreakpointStore = Record<string, number[]>;

export const STORAGE_KEY_BREAKPOINTS = 'mechalab_breakpoints_v1';

/**
 * A lesson keeps at most this many. A file with more than twenty-five parks is not a file somebody is
 * reading one line at a time, and a runaway list would be paid for on every read.
 */
export const MAX_BREAKPOINTS_PER_LESSON = 25;

/** And the store keeps at most this many lessons, oldest written first out. */
export const MAX_BREAKPOINT_LESSONS = 60;

/**
 * The list as it will be stored: whole numbers, line 1 or later, no duplicates, ascending, capped.
 *
 * Sorted because the gutter, the run request and the test all print the same order; deduped because
 * a double click must not arm the same line twice; capped by *newest* entries, since a click past the
 * cap is a learner still asking for this line.
 */
export function normalizeBreakpoints(value: unknown): number[] {
  const raw = Array.isArray(value) ? value : [];
  const seen = new Set<number>();
  for (const item of raw) {
    const line = typeof item === 'number' ? item : Number(item);
    if (!Number.isInteger(line) || line < 1) continue;
    seen.add(line);
  }
  return [...seen].slice(-MAX_BREAKPOINTS_PER_LESSON).sort((a, b) => a - b);
}

/**
 * Add a line, or take it away when it is already armed.
 *
 * No storage and no document: the runner holds the list in React state and writes it, the same shape
 * the draft store uses. A toggle is the only mutation a breakpoint has — there is no "set 1 through
 * 9", and dragging a range is a feature nobody asked this file for.
 */
export function toggleBreakpoint(lines: readonly number[], line: number): number[] {
  const number = Math.round(line);
  if (!Number.isInteger(number) || number < 1) return [...lines];
  const current = normalizeBreakpoints([...lines]);
  return current.includes(number)
    ? current.filter((candidate) => candidate !== number)
    : normalizeBreakpoints([...current, number]);
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
export function readBreakpointStore(): BreakpointStore {
  const store = storage();
  if (!store) return {};
  let parsed: unknown;
  try {
    const raw = store.getItem(STORAGE_KEY_BREAKPOINTS);
    if (!raw) return {};
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const out: BreakpointStore = {};
  let lessons = 0;
  for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!id || lessons >= MAX_BREAKPOINT_LESSONS) break;
    const lines = normalizeBreakpoints(value);
    if (!lines.length) continue;
    out[id] = lines;
    lessons += 1;
  }
  return out;
}

/** This lesson's breakpoints; `[]` when none are set or storage is unavailable. */
export function readBreakpoints(lessonId: string): number[] {
  return readBreakpointStore()[lessonId] ?? [];
}

/**
 * Store this lesson's list and answer what is now stored.
 *
 * The return value is what the caller should draw, so a browser that refuses the write, or a list at
 * the cap, cannot leave the gutter showing a dot the next run will not honour. An empty list forgets
 * the lesson instead of keeping an empty array.
 *
 * The written lesson moves to the back of the record: object key order is insertion order, so
 * deleting and re-adding is what makes eviction drop the longest-untouched lesson rather than the
 * alphabetically first.
 */
export function writeBreakpoints(lessonId: string, lines: readonly number[]): number[] {
  const stored = normalizeBreakpoints([...lines]);
  const store = storage();
  if (!store) return stored;
  const all = readBreakpointStore();
  delete all[lessonId];
  if (stored.length) all[lessonId] = stored;
  const ids = Object.keys(all);
  while (ids.length > MAX_BREAKPOINT_LESSONS) {
    const oldest = ids.shift();
    if (oldest) delete all[oldest];
  }
  try {
    if (ids.length) store.setItem(STORAGE_KEY_BREAKPOINTS, JSON.stringify(all));
    else store.removeItem(STORAGE_KEY_BREAKPOINTS);
  } catch {
    // Full or blocked: the run still parks where the list says, it just is not remembered.
  }
  return stored;
}

/** Forget one lesson's breakpoints, or all of them when no id is given. */
export function clearBreakpoints(lessonId?: string): void {
  const store = storage();
  if (!store) return;
  if (lessonId === undefined) {
    try {
      store.removeItem(STORAGE_KEY_BREAKPOINTS);
    } catch {
      // Nothing was stored to forget.
    }
    return;
  }
  const all = readBreakpointStore();
  if (!(lessonId in all)) return;
  delete all[lessonId];
  try {
    if (Object.keys(all).length) store.setItem(STORAGE_KEY_BREAKPOINTS, JSON.stringify(all));
    else store.removeItem(STORAGE_KEY_BREAKPOINTS);
  } catch {
    // As above: the in-memory list is still the truth for this visit.
  }
}

/**
 * The lines a run should park on, from the document it is about to execute.
 *
 * A stored line past the end of the document can never execute, and a line that is blank has nothing
 * to break on; both are dropped here rather than sent, so the worker's set is exactly the dots the
 * learner can see next to code.
 */
export function breakpointLinesForRun(text: string, lines: readonly number[]): number[] {
  const total = text.split('\n').length;
  const rows = text.split('\n');
  return normalizeBreakpoints([...lines]).filter(
    (line) => line <= total && (rows[line - 1] ?? '').trim() !== ''
  );
}
