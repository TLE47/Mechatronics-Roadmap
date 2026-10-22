/**
 * `# %%` cells in a lesson (`app/src/editor/cells.ts`).
 *
 * `docs/PLAN-2.0-GAP.md` lists this as the last piece of its editor row: *"No `# %%` cells."* A cell is
 * a run boundary written in the file — the marker VS Code, Jupyter and Spyder all read:
 *
 *     # %% Set up
 *     mass = 2.0
 *
 *     # %% The step
 *     print(mass * 9.81)
 *
 * **Run to here, not run this cell.** The worker runs each program in a fresh namespace, so a later
 * cell on its own would `NameError` on everything the earlier ones bound. The button therefore runs
 * the document **through the end of that cell** — the safe, stateless reading of "run this part",
 * which is also what a learner typing a long program bottom-up actually means.
 *
 * Two rules make the boundaries trustworthy:
 *
 *  - **The marker starts at column 0.** An indented `# %%` is inside a function or a block, and
 *    splitting there would cut a body in half; only a line that begins with `#` is a boundary.
 *  - **Everything above the first marker is cell 1.** A file that is one long preamble is one cell,
 *    and code written before the first marker is not silently excluded from the run.
 *
 * Pure, and separate from both the editor and the runner, because the interesting cases (a marker in
 * a docstring, a title, an empty leading preamble, the last cell's end offset) are awkward to aim at
 * in a browser and trivial to hand to a function (`npm run test:cells`).
 */

export interface Cell {
  /** 0-based, in document order. The number the button prints is one higher. */
  index: number;
  /** What the marker said after `# %%`, trimmed; `''` when it named nothing. */
  title: string;
  /** 0-based line of the `# %%` marker, or `null` for the code above the first marker. */
  markerLine: number | null;
  /** 0-based first line of the cell's own code. */
  firstLine: number;
  /** 0-based last line, inclusive; `firstLine - 1` when the cell holds no code. */
  lastLine: number;
  /** Document offset where the cell's code starts. */
  from: number;
  /** Document offset just past its last line's text (no trailing newline). */
  to: number;
}

/** `# %%`, `#%%`, and `# %% A title` — at column 0 only. */
const MARKER = /^#\s*%%(?:\s*(.*))?$/;

/** Every cell in the document, the preamble included when it holds code. */
export function parseCells(text: string): Cell[] {
  const lines = text.split('\n');
  const offsets: number[] = [];
  let offset = 0;
  for (const lineText of lines) {
    offsets.push(offset);
    offset += lineText.length + 1;
  }

  const markers: { line: number; title: string }[] = [];
  lines.forEach((lineText, index) => {
    const match = MARKER.exec(lineText);
    if (match) markers.push({ line: index, title: (match[1] ?? '').trim() });
  });

  const bounds: Omit<Cell, 'index'>[] = [];
  const push = (markerLine: number | null, title: string, firstLine: number, lastLine: number) => {
    // A trailing blank line is whitespace, not part of the cell: keeping it would put a newline at the
    // end of every prefix, and drop the last visible line from nothing.
    let end = Math.min(lastLine, lines.length - 1);
    while (end >= firstLine && lines[end].trim() === '') end -= 1;
    const hasCode = end >= firstLine;
    // A preamble with nothing in it is not a cell: with a marker on line 1 it would make the first
    // real cell "Cell 2" on its button, which is the kind of off-by-one a learner would notice.
    if (markerLine === null && !hasCode) return;
    const from = hasCode ? offsets[firstLine] : markerLine === null ? 0 : offsets[markerLine];
    // An empty cell still runs through its own marker line: the marker is a comment, so the text is
    // identical in effect, and "run to here" then means the same thing for every cell.
    const to = hasCode
      ? offsets[end] + lines[end].length
      : offsets[markerLine ?? firstLine] + (lines[markerLine ?? firstLine]?.length ?? 0);
    bounds.push({ title, markerLine, firstLine, lastLine: hasCode ? end : firstLine - 1, from, to });
  };

  if (markers.length === 0) {
    push(null, '', 0, lines.length - 1);
  } else {
    push(null, '', 0, markers[0].line - 1);
    markers.forEach((marker, index) => {
      const nextLine = index + 1 < markers.length ? markers[index + 1].line : lines.length;
      push(marker.line, marker.title, marker.line + 1, nextLine - 1);
    });
  }

  return bounds.map((cell, index) => ({ ...cell, index }));
}

/** Does this document use cell markers at all? Without them the editor draws nothing. */
export function hasCells(cells: Cell[]): boolean {
  return cells.some((cell) => cell.markerLine !== null);
}

/**
 * The source a cell's button runs: the whole document through the end of that cell.
 *
 * `null` for an index that is not a cell, so a stale button (a marker deleted between render and
 * click) runs nothing rather than the wrong range.
 */
export function cellPrefix(text: string, index: number): string | null {
  const cell = parseCells(text).find((candidate) => candidate.index === index);
  if (!cell) return null;
  return text.slice(0, cell.to);
}

/** The button's number and title, e.g. `Cell 2 · Set up`. */
export function cellLabel(cell: Cell): string {
  return `Cell ${cell.index + 1}${cell.title ? ` · ${cell.title}` : ''}`;
}
