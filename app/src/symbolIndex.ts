/**
 * Where a name in a lesson is defined.
 *
 * The workbench has hover cards that say what a name is called, but not where to read it, and a
 * lesson is a small project: `main.py` and the read-only module it imports. Pressing **F12** (or
 * ⌘-clicking) on a name should put the cursor on the line that defines it, in whichever of those two
 * files that is — that is the whole of "symbol linking" in the plan's editor row
 * (`docs/PLAN-2.0-GAP.md`).
 *
 * **Scanning, not parsing.** Everything here is a line regex, the same shape as the editor's
 * completion list and the inline-value binder. A `def` written inside a triple-quoted string is
 * therefore indexed as a definition; the alternative is a Python parser in the editor path for a
 * feature that reads a name and a line number, and every lesson in this course writes its docstrings
 * as prose. What the scan must get right is what a learner jumps to:
 *
 *  - `def`, `async def` and `class`, **at any indent** — a method is a definition a learner wants to
 *    read, and nothing else in a method line looks like one;
 *  - a **top-level assignment**, because `total = 0j` is the other thing a name points at, and a
 *    variable rebound inside a loop has no single line to land on;
 *  - the **first** occurrence wins. Python would use the last, but a jump to the end of the file is a
 *    worse answer than the one where the name is introduced, and a lesson that redefines a name is
 *    usually showing the same function twice.
 *
 * Pure, and separate from both the editor and the runner, because the interesting cases (a method, a
 * name that only the helper file defines, a caret sitting at the end of a word) are awkward to aim at
 * in a browser and trivial to hand to a function (`npm run test:symbols`).
 */

export type SymbolKind = 'function' | 'class' | 'variable';

export interface SymbolDef {
  name: string;
  /** 1-based, the same number the editor's `revealLine` and every error message uses. */
  line: number;
  kind: SymbolKind;
}

/** The identifier the caret is on, and whether it is an attribute (`z.real`). */
export interface SymbolRef {
  name: string;
  /** Document offsets of the identifier, so a click can put the caret on it. */
  from: number;
  to: number;
  /** `true` for `z.real`: a name after a dot is somebody else's symbol, not this file's. */
  attribute: boolean;
}

export interface SymbolHit extends SymbolDef {
  /** The file that defines it: `main.py`, or a helper's own name. */
  file: string;
}

const DEF = /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/;
const CLASS = /^\s*class\s+([A-Za-z_]\w*)/;
/** An assignment a name can point at: `total = 0`, `gain: float = 1.0`, not `a == b`. */
const TOP_LEVEL_ASSIGN = /^([A-Za-z_]\w*)\s*(?::[^=\n]+)?=(?!=)/;

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && /[A-Za-z0-9_]/.test(char);
}

/** Every name the document defines, by name. First occurrence wins. */
export function indexSymbols(text: string): Map<string, SymbolDef> {
  const index = new Map<string, SymbolDef>();
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = DEF.exec(line) ?? CLASS.exec(line) ?? TOP_LEVEL_ASSIGN.exec(line);
    if (!match) continue;
    const name = match[1];
    if (index.has(name)) continue;
    const kind: SymbolKind = DEF.test(line) ? 'function' : CLASS.test(line) ? 'class' : 'variable';
    index.set(name, { name, line: i + 1, kind });
  }
  return index;
}

/**
 * The identifier at a caret or a click.
 *
 * A caret sits *between* characters, so a position inside `total` and the position just past its last
 * letter both have to answer `total` — a learner who types a name and presses F12 without arrowing
 * back has their caret after it.
 */
export function symbolAt(text: string, pos: number): SymbolRef | null {
  if (!Number.isFinite(pos)) return null;
  let at = Math.max(0, Math.min(Math.round(pos), text.length));
  if (!isWordChar(text[at]) && at > 0 && isWordChar(text[at - 1])) at -= 1;
  if (!isWordChar(text[at])) return null;
  let from = at;
  let to = at + 1;
  while (from > 0 && isWordChar(text[from - 1])) from--;
  while (to < text.length && isWordChar(text[to])) to++;
  const name = text.slice(from, to);
  // A number is not a name a file defines, and `_` alone is a throwaway.
  if (!/^[A-Za-z_]/.test(name) || name === '_') return null;
  return { name, from, to, attribute: from > 0 && text[from - 1] === '.' };
}

export interface SymbolFile {
  name: string;
  text: string;
}

/**
 * Find `name` across the lesson's files, the open one first.
 *
 * The active file wins a tie because that is where the learner is looking: a helper and a lesson that
 * both define `run` are two different functions, and jumping out of the file being edited to reach
 * the other one would be surprising.
 */
export function findDefinition(
  name: string,
  files: SymbolFile[],
  activeFile: string
): SymbolHit | null {
  const ordered = [
    ...files.filter((file) => file.name === activeFile),
    ...files.filter((file) => file.name !== activeFile),
  ];
  for (const file of ordered) {
    const def = indexSymbols(file.text).get(name);
    if (def) return { ...def, file: file.name };
  }
  return null;
}
