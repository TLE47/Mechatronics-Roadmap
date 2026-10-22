import { lineColumnAt } from '../analysisClient.ts';

/**
 * Where the cursor sits inside a call (`app/src/editor/callContext.ts`).
 *
 * Signature help is only useful while the cursor is inside the parentheses of a call, and working
 * that out is the part with edge cases worth pinning without a browser: `f(` has one empty argument,
 * `f(a, b)` has two, `f(g(a, b), ` is in the *outer* call's second argument, a bracket inside a
 * string is not a call at all, and a `[` or `{` means there is no call to describe.
 *
 * The scan is backward from the cursor over a bounded window, which is what makes it cheap enough to
 * run on every keystroke: a long file's call is found without loading the rest of the document. Text
 * is masked first (strings and comments) so `print("(")` cannot open a call, and the mask is built
 * forward from the window's start rather than guessed backwards, where an escape would be ambiguous.
 */

export interface CallContext {
  /** Document offset of the `(` the cursor is inside. */
  open: number;
  /** 1-based line of the cursor - Jedi's coordinates. */
  line: number;
  /** 0-based column of the cursor on that line. */
  column: number;
  /** 0-based index of the argument being typed, counting top-level commas. */
  activeParam: number;
}

/** How far back a call may open and still be described. Longer than any starter in the course. */
export const CALL_WINDOW = 4000;

/** The token under the pointer: about as wide as `math.acos`, never wider than one dotted name. */
export interface HoverRange {
  from: number;
  to: number;
}

const NAME_CHAR = /[\w.]/;

/**
 * The dotted name at or beside `pos`, or null when the pointer is over whitespace or a number.
 *
 * `pos` is a gap between characters, so both neighbours are consulted: the pointer at the end of
 * `math.acos` is at the gap after the `s`, which is still that name. Leading and trailing dots are
 * trimmed so `math.` describes `math` rather than a module whose name ends in a dot.
 */
export function hoverRange(doc: string, pos: number): HoverRange | null {
  const limit = Math.max(0, Math.min(pos, doc.length));
  const at = (index: number) => (index >= 0 && index < doc.length ? doc[index] : '');
  if (!NAME_CHAR.test(at(limit)) && !NAME_CHAR.test(at(limit - 1))) return null;
  let from = limit;
  let to = limit;
  while (from > 0 && NAME_CHAR.test(at(from - 1))) from -= 1;
  while (to < doc.length && NAME_CHAR.test(at(to))) to += 1;
  while (from < to && at(from) === '.') from += 1;
  while (to > from && at(to - 1) === '.') to -= 1;
  if (from >= to) return null;
  // A number (`3.14`) is not something Jedi has anything to say about, and hovering it should not
  // open a card that says so.
  if (!/[A-Za-z_]/.test(at(from))) return null;
  return { from, to };
}

/**
 * A mask over `[start, end)` that is true where a character is Python code rather than string or
 * comment text.
 *
 * Triple-quoted strings are handled because a docstring is the normal way a lesson starts, and its
 * parentheses would otherwise look like calls for the rest of the file.
 */
function codeMask(code: string, start: number, end: number): Uint8Array {
  const mask = new Uint8Array(end - start);
  let quote: string | null = null;
  let triple = false;
  let inComment = false;
  for (let i = start; i < end; i += 1) {
    const char = code[i];
    if (inComment) {
      if (char === '\n') inComment = false;
      else {
        mask[i - start] = 0;
        continue;
      }
    }
    if (quote) {
      if (char === '\\') {
        // The escaped character is string text too; skip it so `\"` cannot close the string.
        mask[i - start] = 0;
        i += 1;
        if (i < end) mask[i - start] = 0;
        continue;
      }
      if (triple) {
        if (char === quote && code.startsWith(quote.repeat(3), i)) {
          quote = null;
          triple = false;
          mask[i - start] = 0;
          mask[i - start + 1] = 0;
          mask[i - start + 2] = 0;
          i += 2;
          continue;
        }
      } else if (char === quote || char === '\n') {
        // An unterminated single-quoted string ends at the newline: the rest is code again, which is
        // what a learner typing a quote and moving on means.
        quote = null;
        mask[i - start] = 0;
        continue;
      }
      mask[i - start] = 0;
      continue;
    }
    if (char === '#') {
      inComment = true;
      mask[i - start] = 0;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      triple = code.startsWith(char.repeat(3), i);
      mask[i - start] = 0;
      if (triple) {
        mask[i - start + 1] = 0;
        mask[i - start + 2] = 0;
        i += 2;
      }
      continue;
    }
    mask[i - start] = 1;
  }
  return mask;
}

const OPENERS = '([{';
const CLOSERS = ')]}';

/**
 * The call the cursor is inside, or null.
 *
 * `pos` is a document offset; the returned `line`/`column` are the cursor's, because that is the
 * position Jedi's `get_signatures` describes - the argument being typed, not the opening parenthesis.
 */
export function callContext(code: string, pos: number, window: number = CALL_WINDOW): CallContext | null {
  const limit = Math.max(0, Math.min(pos, code.length));
  const start = Math.max(0, limit - window);
  const mask = codeMask(code, start, limit);
  const inCode = (index: number) => index >= start && index < limit && mask[index - start] === 1;

  let depth = 0;
  let open = -1;
  for (let i = limit - 1; i >= start; i -= 1) {
    if (!inCode(i)) continue;
    const char = code[i];
    if (CLOSERS.includes(char)) {
      depth += 1;
    } else if (OPENERS.includes(char)) {
      if (depth === 0) {
        if (char !== '(') return null; // a list or dict literal: there is no signature to show
        open = i;
        break;
      }
      depth -= 1;
    }
  }
  if (open < 0) return null;

  // Top-level commas after the opener: those are the arguments the cursor has moved past.
  let nested = 0;
  let activeParam = 0;
  for (let i = open + 1; i < limit; i += 1) {
    if (!inCode(i)) continue;
    const char = code[i];
    if (OPENERS.includes(char)) nested += 1;
    else if (CLOSERS.includes(char)) nested = Math.max(0, nested - 1);
    else if (char === ',' && nested === 0) activeParam += 1;
  }

  const { line, column } = lineColumnAt(code, limit);
  return { open, line, column, activeParam };
}
