/**
 * Breakpoints: a park placed on a line rather than asked for at the next one
 * (`app/src/editor/breakpoints.ts`).
 *
 * `docs/PLAN-2.0-GAP.md`'s debugger row listed the gutter breakpoint as the one piece missing after
 * Pause/Step shipped: *"a park is asked for, not placed on a line."* A breakpoint is that placement —
 * click the gutter beside a line (or press `F9` with the caret on it) and the run stops **there**,
 * whether or not the learner can reach the toolbar in time.
 *
 * **A breakpoint can carry a condition**, which is the difference between stopping at a line in a
 * loop and stopping at the pass that matters: `n == 3` is a Python expression the worker evaluates in
 * the frame it reached, and the run parks only when it is true. A breakpoint is therefore a line and
 * a sentence, not a line number alone.
 *
 * **Per lesson, on purpose.** The editor's document is a lesson's own file, so its breakpoints belong
 * to that lesson: switching to another lesson must not leave a park armed on a line the new file does
 * not have. The store is small (a line and a short expression) and it is a preference about reading
 * rather than work, so it lives in `localStorage` beside the theme and the layout preset — not in the
 * IndexedDB stores drafts and notes use.
 *
 * **Remembered as a line number, held as a position.** What a reload restores is a number beside the
 * draft it belongs to; what the editor keeps while it is open is a document position, so an edit above
 * a dot carries it — condition and all — down with the statement it was placed on rather than leaving
 * it pointing at whatever moved into that line ([`breakpointState.ts`](breakpointState.ts)). The
 * runner owns the stored list, which is why the numbers, not the positions, are this module's
 * contract.
 *
 * Pure, and separate from the gutter and the runner: the cases worth pinning (out-of-order clicks, a
 * stored list written by an older version that had no conditions, a runaway list, a browser that
 * refuses storage) are awkward to aim at through a browser and trivial to hand to a function
 * (`npm run test:breakpoints`).
 */

/**
 * One park: the line it sits on, and the Python expression that must be true for the run to stop.
 *
 * An empty condition is the plain breakpoint this store held before conditions existed — every pass
 * stops. Keeping it an empty string rather than an optional field means the gutter, the run request
 * and the worker all ask one question of one value, and a stored list written by the previous version
 * (bare numbers) reads back as unconditional parks instead of nothing at all.
 */
export interface Breakpoint {
  line: number;
  condition: string;
}

/** One record per lesson id: what it parks on, ascending by line. */
export type BreakpointStore = Record<string, Breakpoint[]>;

export const STORAGE_KEY_BREAKPOINTS = 'mechalab_breakpoints_v1';

/**
 * A lesson keeps at most this many. A file with more than twenty-five parks is not a file somebody is
 * reading one line at a time, and a runaway list would be paid for on every read.
 */
export const MAX_BREAKPOINTS_PER_LESSON = 25;

/** And the store keeps at most this many lessons, oldest written first out. */
export const MAX_BREAKPOINT_LESSONS = 60;

/**
 * How long a condition may be, in characters.
 *
 * One line's worth of expression: `i == 3 and total > 0` fits with room to spare, and the number is
 * shared with the worker (which truncates to the same width) so the bar cannot quote a condition the
 * interpreter was not given. A condition longer than this is a program, and the editor is where that
 * belongs.
 */
export const MAX_CONDITION_CHARS = 200;

/**
 * The condition as it will be stored and sent: one line, one space where whitespace ran, capped.
 *
 * Runs of whitespace collapse to a single space, and nothing is trimmed off the ends. That is not
 * tidiness, it is the typing experience: the panel's input **is** this string, so trimming what a
 * learner just typed would swallow the space bar (`n` + space would read back as `n`, and `n == 3`
 * could never be written). Newlines fold for the same reason the field is one line — a pasted
 * multi-line expression must compile as what is on screen, not as something with a newline in the
 * middle of it. Emptiness is decided by `.trim()` where it matters (an all-space condition is
 * unconditional), and the cap is the width the worker is sent.
 */
export function normalizeCondition(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').slice(0, MAX_CONDITION_CHARS);
}

/**
 * One entry, or `null` when it is not a park.
 *
 * Accepts the older shape too — a bare number, or a string of one — because the store outlives a
 * deploy: a learner who armed three lines yesterday must not lose them to a version that learned to
 * carry a condition. A line is whole, 1 or later; anything else is dropped rather than rounded into
 * a dot that points at a statement nobody chose.
 */
function normalizeEntry(item: unknown): Breakpoint | null {
  if (typeof item === 'object' && item !== null) {
    const record = item as { line?: unknown; condition?: unknown };
    const line = typeof record.line === 'number' ? record.line : Number(record.line);
    if (!Number.isInteger(line) || line < 1) return null;
    return { line, condition: normalizeCondition(record.condition) };
  }
  const line = typeof item === 'number' ? item : Number(item);
  if (typeof item === 'boolean' || !Number.isInteger(line) || line < 1) return null;
  return { line, condition: '' };
}

/**
 * The list as it will be stored: whole lines, no duplicates, ascending, capped.
 *
 * Sorted because the gutter, the run request and the test all print the same order; deduped because a
 * double click must not arm the same line twice, and *last wins* because an entry written later is the
 * one a learner just edited — a stray duplicate without a condition must not erase the condition they
 * typed. Capped by *newest* entries, since a click past the cap is a learner still asking for this
 * line.
 */
export function normalizeBreakpointEntries(value: unknown): Breakpoint[] {
  const raw = Array.isArray(value) ? value : [];
  const byLine = new Map<number, string>();
  for (const item of raw) {
    const entry = normalizeEntry(item);
    if (entry) byLine.set(entry.line, entry.condition);
  }
  return [...byLine.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(-MAX_BREAKPOINTS_PER_LESSON)
    .map(([line, condition]) => ({ line, condition }));
}

/** The armed line numbers alone, for the callers that never look at a condition. */
export function normalizeBreakpoints(value: unknown): number[] {
  return normalizeBreakpointEntries(value).map((entry) => entry.line);
}

/**
 * Add a line, or take it away when it is already armed.
 *
 * No storage and no document: the runner holds the list in React state and writes it, the same shape
 * the draft store uses. A toggle is the only mutation a breakpoint has — there is no "set 1 through
 * 9", and dragging a range is a feature nobody asked this file for. A line that is disarmed loses its
 * condition with it: the two are one park, and a remembered expression with no dot would be invisible
 * state the next arm would inherit.
 */
export function toggleBreakpoint(entries: readonly Breakpoint[], line: number): Breakpoint[] {
  const number = Math.round(line);
  if (!Number.isInteger(number) || number < 1) return normalizeBreakpointEntries([...entries]);
  const current = normalizeBreakpointEntries([...entries]);
  return current.some((entry) => entry.line === number)
    ? current.filter((entry) => entry.line !== number)
    : normalizeBreakpointEntries([...current, { line: number, condition: '' }]);
}

/**
 * Set (or clear, with an empty string) the condition on an armed line.
 *
 * A no-op for a line that is not armed: a condition belongs to a dot, and writing one for a line with
 * no dot would store a park that never stops anywhere. The returned list is normalised, so the caller
 * draws exactly what the next run will send.
 */
export function setBreakpointCondition(
  entries: readonly Breakpoint[],
  line: number,
  condition: string
): Breakpoint[] {
  const number = Math.round(line);
  const current = normalizeBreakpointEntries([...entries]);
  if (!current.some((entry) => entry.line === number)) return current;
  return current.map((entry) =>
    entry.line === number ? { line: number, condition: normalizeCondition(condition) } : entry
  );
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
    const entries = normalizeBreakpointEntries(value);
    if (!entries.length) continue;
    out[id] = entries;
    lessons += 1;
  }
  return out;
}

/** This lesson's breakpoints; `[]` when none are set or storage is unavailable. */
export function readBreakpoints(lessonId: string): Breakpoint[] {
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
export function writeBreakpoints(
  lessonId: string,
  entries: readonly Breakpoint[]
): Breakpoint[] {
  const stored = normalizeBreakpointEntries([...entries]);
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
 * The parks a run should stop on, from the document it is about to execute.
 *
 * A stored line past the end of the document can never execute, and a line that is blank has nothing
 * to break on; both are dropped here rather than sent, so the worker's map is exactly the dots the
 * learner can see next to code. The condition travels with its line or not at all.
 */
export function breakpointsForRun(
  text: string,
  entries: readonly Breakpoint[]
): Breakpoint[] {
  const rows = text.split('\n');
  return normalizeBreakpointEntries([...entries]).filter(
    (entry) => entry.line <= rows.length && (rows[entry.line - 1] ?? '').trim() !== ''
  );
}
