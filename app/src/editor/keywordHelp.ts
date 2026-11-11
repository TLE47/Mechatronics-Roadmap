import type { SignatureInfo } from '../analysisClient.ts';

/**
 * Signature help for Python's statement keywords (`app/src/editor/keywordHelp.ts`).
 *
 * Jedi can describe `print(...)` because it is a call, but `assert x == 1`, `for item in items:` and
 * `while step < 4:` have no parentheses for `get_signatures()` to sit inside. They still have a
 * shape a beginner needs, so this table draws the same kind of card from the syntax itself.
 *
 * The match is deliberately line-anchored: the keyword has to begin the statement (after its
 * indentation), and the cursor has to be on that statement. A word in a comment, a string or the
 * middle of an expression cannot open a keyword card.
 */

type Keyword = {
  /** The syntax line shown in the card. Square brackets mean optional. */
  label: string;
  /** One or two plain sentences: what the statement does and the usual beginner trap. */
  doc: string;
};

const KEYWORDS: Record<string, Keyword> = {
  assert: {
    label: 'assert condition[, message]',
    doc: 'Stops with AssertionError when condition is false; message explains what failed.',
  },
  for: {
    label: 'for target in iterable:',
    doc: 'Runs the body once per item; range(n) counts from 0 to n-1.',
  },
  while: {
    label: 'while condition:',
    doc: 'Runs the body while condition is true; update something so it can stop.',
  },
  if: {
    label: 'if condition:',
    doc: 'Runs the body only when condition is true; the colon starts the block.',
  },
  elif: {
    label: 'elif condition:',
    doc: 'Checks another condition when earlier if/elif branches were false.',
  },
  else: {
    label: 'else:',
    doc: 'Runs when every earlier if/elif condition was false.',
  },
  def: {
    label: 'def name(parameters):',
    doc: 'Defines a reusable function; parameters are its inputs and return hands a value back.',
  },
  return: {
    label: 'return [value]',
    doc: 'Ends the function and hands value back; without a value it returns None.',
  },
  import: {
    label: 'import module',
    doc: 'Loads a module so its names are used as module.name.',
  },
  from: {
    label: 'from module import name',
    doc: 'Loads selected names from a module so they can be used directly.',
  },
  with: {
    label: 'with expression as name:',
    doc: 'Runs the block with a managed resource and releases it afterwards.',
  },
  try: {
    label: 'try:',
    doc: 'Runs the block and sends errors to the matching except clauses.',
  },
  except: {
    label: 'except Exception as error:',
    doc: 'Handles an error from try; name the expected exception and say what happens next.',
  },
  class: {
    label: 'class Name:',
    doc: 'Defines a new type; its body holds the attributes and methods instances share.',
  },
  raise: {
    label: 'raise Exception(message)',
    doc: 'Stops this path by raising an error with a message that says what went wrong.',
  },
  break: {
    label: 'break',
    doc: 'Leaves the nearest for or while loop immediately.',
  },
  continue: {
    label: 'continue',
    doc: 'Skips the rest of this pass and starts the next loop pass.',
  },
  pass: {
    label: 'pass',
    doc: 'Does nothing; a placeholder where Python requires an indented block.',
  },
};

const STATEMENT = new RegExp(
  `^(\\s*)(${Object.keys(KEYWORDS).join('|')})\\b`
);

/**
 * The keyword statement the cursor is on, or null. `from` is the statement's start offset, so the
 * card hangs under the keyword rather than under the line.
 */
export function keywordSignature(
  code: string,
  pos: number
): { signature: SignatureInfo; from: number } | null {
  const limit = Math.max(0, Math.min(pos, code.length));
  const lineStart = code.lastIndexOf('\n', Math.max(0, limit - 1)) + 1;
  const before = code.slice(lineStart, limit);
  const match = STATEMENT.exec(before);
  if (!match) return null;
  const word = match[2];
  const entry = KEYWORDS[word];
  if (!entry) return null;
  // Do not open on the indentation before the first letter.
  if (before.length <= match[1].length) return null;
  return {
    from: lineStart + match[1].length,
    signature: {
      name: word,
      label: entry.label,
      index: null,
      params: [],
      doc: entry.doc,
    },
  };
}
