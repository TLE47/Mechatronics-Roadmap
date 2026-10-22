/**
 * The values a run left behind, placed on the lines that bound them.
 *
 * The workbench could already tell a learner *that* their output differed. It could not tell them
 * what the name their loop was supposed to fill actually held — the one question every beginner
 * arrives at while staring at a traceback, and the reason Thonny's variable pane is the first thing
 * a beginner turns on.
 *
 * Three rules, and the tests in `scripts/test_inline_values.mjs` exist to keep them:
 *
 * 1. **A value belongs to a run.** The worker sends the namespace *that run* returned, so a stale
 *    value is impossible by construction — the alternative (reading globals later) would show a
 *    number from a previous attempt beside code that no longer produces it.
 * 2. **A value is drawn where it was bound.** Only a **top-level** `name = …` line is a home for it:
 *    a line inside a function is executed many times with different values, and drawing one of them
 *    beside the source would be a lie with extra steps. Annotated assignments (`x: float = 1.0`)
 *    count; `==`, `+=` and friends do not.
 * 3. **The last binding wins, and a name with no line is dropped.** `x = 1` twice in one file means
 *    the value belongs to the second line; a name the worker sent that the text no longer assigns
 *    (edited after the run) has nowhere honest to go, so it is not drawn.
 *
 * Everything here is pure: no DOM, no storage, no worker. The widget in `editor/inlineWidget.ts`
 * draws what this returns, and the runner is the only thing that joins the two.
 */

/** One name and its rendered value, exactly as the worker sent it. */
export interface RunValue {
  name: string;
  value: string;
}

/** A value with the 1-based document line it belongs beside. */
export interface InlineValueAt extends RunValue {
  line: number;
}

/** The longest value drawn beside a line; the worker truncates to the same width. */
export const MAX_INLINE_CHARS = 48;

/** A name Python can bind, at the start of a line: `total`, `_x` excluded later. */
const ASSIGNMENT = /^([A-Za-z_]\w*)\s*(?::[^=\n]+)?=(?!=)/;
/** Statement keywords that are followed by an `=` sooner or later but never bind a name. */
const NOT_A_NAME = new Set(['if', 'while', 'for', 'assert', 'return', 'elif', 'with', 'lambda']);

/**
 * The 1-based line of the **last** top-level assignment to each name, in source order.
 *
 * Indentation is the whole test for "top level": a line that starts with whitespace is inside
 * something, and a name bound there has no single value to draw.
 */
export function assignmentLines(code: string): Map<string, number> {
  const lines = new Map<string, number>();
  const text = code.split('\n');
  for (let index = 0; index < text.length; index += 1) {
    const line = text[index];
    if (!line || line[0] === ' ' || line[0] === '\t' || line[0] === '#') continue;
    const match = ASSIGNMENT.exec(line);
    if (!match) continue;
    const name = match[1];
    if (NOT_A_NAME.has(name)) continue;
    // Delete then set: the map keeps the *last* line, and a name assigned again moves rather than
    // staying where it first appeared.
    lines.delete(name);
    lines.set(name, index + 1);
  }
  return lines;
}

/**
 * What the worker sent, or `[]` — never a guess.
 *
 * The payload crosses a `postMessage` boundary and is not typed there, so each entry is checked:
 * a name that is a string, a value that is a string, a name a Python line could bind. Anything else
 * is dropped rather than rendered as `undefined`.
 */
export function readRunValues(raw: unknown): RunValue[] {
  if (!Array.isArray(raw)) return [];
  const values: RunValue[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const { name, value } = entry as Record<string, unknown>;
    if (typeof name !== 'string' || typeof value !== 'string') continue;
    if (!/^[A-Za-z_]\w*$/.test(name) || name.startsWith('_')) continue;
    values.push({ name, value: formatInlineValue(value) });
  }
  return values;
}

/** One line's worth of a value: a long list is cut at a word boundary, with an ellipsis saying so. */
export function formatInlineValue(text: string, max = MAX_INLINE_CHARS): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  // Cut at the last space when one is reasonably far in; a single long token is cut where it must be.
  return `${space > max * 0.6 ? cut.slice(0, space) : cut}…`;
}

/**
 * Join a run's values to the lines of the code that produced them.
 *
 * `code` must be the text the run actually executed, not the editor's current text: the runner ran
 * a snapshot, and the learner may have typed since. Sorted by line so the widget set is stable.
 */
export function inlineValuesFor(code: string, values: RunValue[]): InlineValueAt[] {
  const lines = assignmentLines(code);
  const placed: InlineValueAt[] = [];
  for (const value of values) {
    const line = lines.get(value.name);
    if (!line) continue;
    placed.push({ ...value, line });
  }
  return placed.sort((a, b) => a.line - b.line);
}
