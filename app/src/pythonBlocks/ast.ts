/**
 * The visual Python editor's program model (`app/src/pythonBlocks/ast.ts`).
 *
 * One program, two drawings. The visual workspace and the Python code view are both readings of
 * `BlockProgram`: a list of statement nodes, each with the fields its Python line needs and, when it
 * opens a suite, a body. Python is generated from this model, never parsed back from a second copy,
 * so a block edit and a code edit cannot disagree about what the program is.
 *
 * Two properties are load-bearing:
 *
 * - **An untouched program is byte-identical to the file it came from.** `renderProgram` returns
 *   `source` verbatim while `dirty` is false, because opening a lesson in visual mode must not
 *   reformat a starter (drafts, checks and the learner's undo history all compare exact text).
 *   The first block edit flips `dirty`, and from then on the program is drawn from its blocks.
 * - **Anything outside the supported subset survives as a raw node.** A class, a decorator, a
 *   multi-line string or a line this parser does not understand is kept as its own lines and
 *   re-emitted with the indentation of the body it sits in. The editor never silently deletes
 *   Python it could not draw.
 *
 * A node's `lines` matter only for `raw` and `import` statements: their text is the learner's and
 * is reproduced. Every other node's text is generated from `fields`, which is what makes an inline
 * edit one small change to the model rather than a string patch.
 */

/** The statement shapes the visual workspace can draw and edit. */
export type BlockKind =
  | 'assign'
  | 'call'
  | 'if'
  | 'elif'
  | 'else'
  | 'for'
  | 'while'
  | 'def'
  | 'return'
  | 'try'
  | 'except'
  | 'finally'
  | 'import'
  | 'raw';

/** Everything an editable statement may hold. Absent keys are the kind's default. */
export interface BlockFields {
  /** Assignment target, or the function name of a `def`. */
  name?: string;
  /** `=`, `+=`, `-=`, `*=`, `/=`, `//=`, `**=` or `%=`. */
  op?: string;
  /** Assignment right-hand side, a `return` value, or a `def` parameter list. */
  value?: string;
  /** The called function's name — `print`, `input`, a learner's own function. */
  callee?: string;
  /** What sits inside the call's parentheses. */
  args?: string;
  /** The condition of an `if`, `elif` or `while`. */
  condition?: string;
  /** The loop variable of a `for`. */
  target?: string;
  /** What a `for` iterates. */
  iterable?: string;
  /** A `def`'s parameter list. */
  params?: string;
  /** What follows `except` — empty for a bare handler. */
  clause?: string;
}

/** One statement: its shape, its fields, the suite under it, and its raw text when it has any. */
export interface BlockNode {
  id: string;
  kind: BlockKind;
  fields: BlockFields;
  body: BlockNode[];
  /** Physical lines with this statement's base indentation removed. Raw and import nodes only. */
  lines: string[];
}

/**
 * A whole program. `source` is what the file said when the program was parsed, and the fast path
 * hands it back until the first edit; `dirty` is what records that the model is now the source.
 */
export interface BlockProgram {
  source: string;
  nodes: BlockNode[];
  dirty: boolean;
  /** The next id number an inserted node may take. Keeps ids unique across a parse and its edits. */
  seq: number;
  /** The indentation unit the file used, so generated suites line up with the learner's own code. */
  unit: string;
  trailingNewline: boolean;
}

/** The kinds whose body is a Python suite. Their bodies render one level deeper. */
const CONTAINER_KINDS: ReadonlySet<BlockKind> = new Set<BlockKind>([
  'if',
  'elif',
  'else',
  'for',
  'while',
  'def',
  'try',
  'except',
  'finally',
]);

export function isContainer(kind: BlockKind): boolean {
  return CONTAINER_KINDS.has(kind);
}

/** How the kind is named in the workspace, the toolbox and a card's accessible name. */
export const KIND_LABELS: Record<BlockKind, string> = {
  assign: 'Assignment',
  call: 'Function call',
  if: 'Conditional',
  elif: 'Otherwise if',
  else: 'Otherwise',
  for: 'For loop',
  while: 'While loop',
  def: 'Function',
  return: 'Return',
  try: 'Try',
  except: 'Except',
  finally: 'Finally',
  import: 'Import',
  raw: 'Python',
};

/** One sentence the card's info button can show, in the same order as the labels above. */
export const KIND_INFO: Record<BlockKind, string> = {
  assign: 'Stores a value under a name. The variable keeps that value until something changes it.',
  call: 'Calls a function such as print() and runs its effect right here.',
  if: 'Runs the statements inside only when the condition is true.',
  elif: 'Checks another condition when the earlier if or elif was false.',
  else: 'Runs when none of the conditions above were true.',
  for: 'Repeats the suite once for each item in the iterable.',
  while: 'Repeats the suite while the condition stays true.',
  def: 'Defines a function with a name and parameters; its suite is the body.',
  return: 'Ends the function and hands a value back to the caller.',
  try: 'Runs the suite and watches for an exception.',
  except: 'Runs when the matching exception was raised inside the try.',
  finally: 'Always runs after the try suite, whether it succeeded or raised.',
  import: 'Brings a module into this program so its names can be used.',
  raw: 'Lines the visual editor keeps exactly as written; it never rewrites them.',
};

/**
 * The single line a statement's header is, or null where the node carries its own lines.
 *
 * Defaults are complete Python rather than placeholders: a node inserted from the toolbox already
 * has fields, and a field emptied by a learner falls back to a value `ast.parse` accepts. The
 * visual workspace shows the same text, so what a learner reads is what Run executes.
 */
export function nodeHeader(node: BlockNode): string | null {
  const f = node.fields;
  switch (node.kind) {
    case 'assign':
      return `${f.name?.trim() || 'value'} ${f.op ?? '='} ${f.value ?? '0'}`;
    case 'call': {
      const callee = f.callee?.trim() || 'print';
      return `${callee}(${f.args ?? ''})`;
    }
    case 'if':
      return `if ${f.condition?.trim() || 'True'}:`;
    case 'elif':
      return `elif ${f.condition?.trim() || 'True'}:`;
    case 'else':
      return 'else:';
    case 'for':
      return `for ${f.target?.trim() || 'item'} in ${f.iterable?.trim() || 'items'}:`;
    case 'while':
      return `while ${f.condition?.trim() || 'True'}:`;
    case 'def':
      return `def ${f.name?.trim() || 'main'}(${f.params ?? ''}):`;
    case 'return': {
      const value = f.value?.trim();
      return value ? `return ${value}` : 'return';
    }
    case 'try':
      return 'try:';
    case 'except': {
      const clause = f.clause?.trim();
      return clause ? `except ${clause}:` : 'except:';
    }
    case 'finally':
      return 'finally:';
    case 'import':
    case 'raw':
      return null;
  }
}

/** A statement's lines at `depth`, with an empty suite spelled `pass` so the program stays runnable. */
export function renderNode(node: BlockNode, depth: number, unit: string): string[] {
  const pad = unit.repeat(Math.max(0, depth));
  if (node.kind === 'raw' || node.kind === 'import') {
    const lines = node.lines.length ? node.lines : [''];
    return lines.map((line) => `${pad}${line}`);
  }
  const head = nodeHeader(node);
  const header = `${pad}${head ?? ''}`;
  if (!isContainer(node.kind)) return [header];
  const body = node.body.flatMap((child) => renderNode(child, depth + 1, unit));
  return [header, ...(body.length ? body : [`${pad}${unit}pass`])];
}

/**
 * The program's Python.
 *
 * The fast path is the promise: a program nobody edited returns exactly the text it was parsed
 * from, blank lines and all. Once edited, every line is drawn from the model, so an untouched raw
 * node keeps its own text and an edited one gets canonical spacing around its fields.
 */
export function renderProgram(program: BlockProgram): string {
  if (!program.dirty) return program.source;
  const lines = program.nodes.flatMap((node) => renderNode(node, 0, program.unit));
  const text = lines.join('\n');
  if (!program.trailingNewline || text.length === 0) return text;
  return `${text}\n`;
}
