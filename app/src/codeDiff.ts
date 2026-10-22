/**
 * The learner's code against a reference, line by line (`app/src/codeDiff.ts`).
 *
 * The roadmap card could say *how many* lines changed (`lessonDraft.ts`'s `editedLines`) and nothing
 * could say which ones. "What did I actually do to this starter" and "how does my version differ from
 * the solution" are the two questions a learner asks at the end of a lesson, and the editor is where
 * they are asked — so the diff belongs there, computed from the text already in memory.
 *
 * The rules, because a diff is a judgement and every judgement needs a stated one:
 *
 * - **A line is a line.** The comparison is exact, whitespace included: an indentation fix is a real
 *   change and hiding it would be lying about the edit. The lesson's *output* check is the lenient
 *   one; this view is the opposite, deliberately.
 * - **The longest common subsequence, not a line-by-line pair.** Inserting one line in the middle of
 *   a forty-line file costs one added row, not forty changed ones — the same rule `editedLines`
 *   counts by, which is why both now come from here instead of from two implementations.
 * - **A trailing newline is not a line.** `"a\n"` and `"a"` are the same program; counting the empty
 *   tail as a change would put a spurious row under every file that ends where a file should.
 * - **Big inputs degrade honestly.** The subsequence table is quadratic; past `MAX_TABLE_CELLS` the
 *   common head and tail are kept and the middle is shown as replaced, which is still a true
 *   statement about the two files and is sayable in a sentence instead of freezing the tab.
 * - **Unchanged runs are context, not content.** Only `context` lines either side of a change are
 *   emitted, with the size of the gap they left, so a forty-line change in a four-hundred-line file
 *   is still readable on one screen.
 */

export type DiffKind = 'same' | 'added' | 'removed';

export interface DiffRow {
  kind: DiffKind;
  text: string;
  /** 1-based line in the left (reference) text, or null when the line is not in it. */
  left: number | null;
  /** 1-based line in the right (the learner's) text, or null when the line is not in it. */
  right: number | null;
}

export interface DiffBlock {
  /** Unchanged lines skipped before this block, so the view can say `… 12 unchanged`. */
  gap: number;
  rows: DiffRow[];
}

export interface CodeDiff {
  added: number;
  removed: number;
  /** Unchanged lines in the two texts, counted once each. */
  unchanged: number;
  /** The rows worth drawing, with the unchanged runs trimmed to `context`. */
  blocks: DiffBlock[];
  /** True when the table was too large and the middle was taken as replaced (see the module note). */
  coarse: boolean;
  /** True when `maxRows` cut the view short; the counts above still describe the whole file. */
  truncated: boolean;
}

/** Above this many cells, the subsequence table is skipped for the head/tail fallback. */
export const MAX_TABLE_CELLS = 250_000;
/** Unchanged lines kept either side of a change. */
export const DEFAULT_CONTEXT = 3;
/** Rows a view may draw before it is cut short. */
export const MAX_DIFF_ROWS = 600;

/** The lines of a text: no trailing-newline phantom, and `''` is no lines at all. */
export function splitLines(text: string): string[] {
  if (text === '') return [];
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

interface Sequence {
  kind: DiffKind;
  left: number | null;
  right: number | null;
}

/** Every line of the two texts, in order, each labelled with where it came from. */
function subsequence(left: string[], right: string[]): Sequence[] {
  if (!left.length) return right.map((_, index) => ({ kind: 'added', left: null, right: index + 1 }));
  if (!right.length) return left.map((_, index) => ({ kind: 'removed', left: index + 1, right: null }));

  if (left.length * right.length > MAX_TABLE_CELLS) return coarseSequence(left, right);

  // `table[i][j]` is the LCS length of left[i:] and right[j:], filled from the end so the walk below
  // can read a decision straight off it instead of reconstructing one.
  const width = right.length + 1;
  const table = new Int32Array((left.length + 1) * width);
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      table[i * width + j] =
        left[i] === right[j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }

  const rows: Sequence[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      rows.push({ kind: 'same', left: i + 1, right: j + 1 });
      i += 1;
      j += 1;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      rows.push({ kind: 'removed', left: i + 1, right: null });
      i += 1;
    } else {
      rows.push({ kind: 'added', left: null, right: j + 1 });
      j += 1;
    }
  }
  while (i < left.length) {
    rows.push({ kind: 'removed', left: i + 1, right: null });
    i += 1;
  }
  while (j < right.length) {
    rows.push({ kind: 'added', left: null, right: j + 1 });
    j += 1;
  }
  return rows;
}

/** The fallback past `MAX_TABLE_CELLS`: common head, common tail, and the middle as replaced. */
function coarseSequence(left: string[], right: string[]): Sequence[] {
  let head = 0;
  while (head < left.length && head < right.length && left[head] === right[head]) head += 1;
  let tail = 0;
  while (
    tail < left.length - head &&
    tail < right.length - head &&
    left[left.length - 1 - tail] === right[right.length - 1 - tail]
  ) {
    tail += 1;
  }
  const rows: Sequence[] = [];
  for (let index = 0; index < head; index += 1) {
    rows.push({ kind: 'same', left: index + 1, right: index + 1 });
  }
  for (let index = head; index < left.length - tail; index += 1) {
    rows.push({ kind: 'removed', left: index + 1, right: null });
  }
  for (let index = head; index < right.length - tail; index += 1) {
    rows.push({ kind: 'added', left: null, right: index + 1 });
  }
  for (let index = 0; index < tail; index += 1) {
    const at = left.length - tail + index;
    rows.push({ kind: 'same', left: at + 1, right: right.length - tail + index + 1 });
  }
  return rows;
}

/**
 * Group the rows into blocks around the changes.
 *
 * A block is a run of changes plus `context` unchanged lines either side; two changes closer than
 * twice the context share a block, so a file edited in one place reads as one block rather than three
 * overlapping ones. Unchanged lines between blocks are counted in `gap`.
 */
function toBlocks(rows: DiffRow[], context: number, maxRows: number): { blocks: DiffBlock[]; truncated: boolean } {
  const changed = rows.map((row, index) => (row.kind === 'same' ? -1 : index)).filter((index) => index >= 0);
  if (!changed.length) return { blocks: [], truncated: false };

  const windows: Array<[number, number]> = [];
  for (const index of changed) {
    const start = Math.max(0, index - context);
    const end = Math.min(rows.length, index + context + 1);
    const last = windows[windows.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else windows.push([start, end]);
  }

  const blocks: DiffBlock[] = [];
  let drawn = 0;
  let previousEnd = 0;
  for (const [start, end] of windows) {
    if (drawn >= maxRows) return { blocks, truncated: true };
    const room = Math.max(0, maxRows - drawn);
    const slice = rows.slice(start, Math.min(end, start + room));
    blocks.push({ gap: start - previousEnd, rows: slice });
    drawn += slice.length;
    previousEnd = Math.min(end, start + room);
    if (slice.length < end - start) return { blocks, truncated: true };
  }
  return { blocks, truncated: false };
}

/**
 * The diff between a reference text and the learner's.
 *
 * `left` is the reference (the lesson's starter, or its solution), `right` is what is in the editor:
 * a line the learner added is `added`, a line they removed is `removed`, which is the direction a
 * "what did I change" view needs to read.
 */
export function diffLines(
  leftText: string,
  rightText: string,
  options: { context?: number; maxRows?: number } = {}
): CodeDiff {
  const context = Math.max(0, options.context ?? DEFAULT_CONTEXT);
  const maxRows = Math.max(1, options.maxRows ?? MAX_DIFF_ROWS);
  const left = splitLines(leftText);
  const right = splitLines(rightText);
  const coarse = left.length * right.length > MAX_TABLE_CELLS;

  const sequence = subsequence(left, right);
  const rows: DiffRow[] = sequence.map((entry) => ({
    kind: entry.kind,
    left: entry.left,
    right: entry.right,
    text: entry.kind === 'added' ? right[(entry.right ?? 1) - 1] : left[(entry.left ?? 1) - 1],
  }));

  let added = 0;
  let removed = 0;
  let unchanged = 0;
  for (const row of rows) {
    if (row.kind === 'added') added += 1;
    else if (row.kind === 'removed') removed += 1;
    else unchanged += 1;
  }

  const { blocks, truncated } = toBlocks(rows, context, maxRows);
  return { added, removed, unchanged, blocks, coarse, truncated };
}

/** `+12 −3`, or `no changes` when the two texts are the same. */
export function diffSummary(diff: Pick<CodeDiff, 'added' | 'removed'>): string {
  if (!diff.added && !diff.removed) return 'no changes';
  const parts: string[] = [];
  if (diff.added) parts.push(`+${diff.added}`);
  if (diff.removed) parts.push(`−${diff.removed}`);
  return parts.join(' ');
}
