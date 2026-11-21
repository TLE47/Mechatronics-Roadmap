/**
 * Python text to block nodes (`app/src/pythonBlocks/parser.ts`).
 *
 * The parser is deliberately small and tolerant. It reads the statements a beginner writes —
 * assignments, calls, `if`/`elif`/`else`, `for`, `while`, `def`, `return`, `try`/`except`, imports
 * — and hands back a `raw` node for everything else, in source order and at its own depth. That is
 * what lets visual mode open any lesson: a starter with a class, a decorator or a triple-quoted
 * string is drawn as those blocks plus a raw card, and the fast path in `renderProgram` means the
 * file is not touched until a learner actually edits a block.
 *
 * Three boundaries are worth naming because they are where a tolerant parser usually lies:
 *
 * - **Logical lines, not physical ones.** A call split across lines, a bracket that spans a line
 *   break, a triple-quoted string and a trailing backslash are grouped first, so a continuation can
 *   never be mistaken for a new statement or for a deeper suite. A grouped statement that spans
 *   lines is kept raw: regenerating its inner newlines from a field would break its indentation.
 * - **Indentation, not a keyword stack.** A suite is descended into when the next logical line is
 *   deeper than the last statement's own indent, and closed when it dedents to that indent again.
 *   Unrecognized deeper indentation stays in the body it belongs to and keeps its text.
 * - **The model never invents a line.** Every node either has fields that render one header or has
 *   the exact lines it was read from.
 */

import { type BlockKind, type BlockNode, type BlockProgram, isContainer } from './ast.ts';

interface LogicalLine {
  /** The first physical line's leading whitespace, character for character. */
  indent: string;
  /** The statement's physical lines with `indent` removed, so a raw node can be re-indented. */
  lines: string[];
  /** The lines joined; classification reads this. */
  text: string;
}

// One operator set covers plain and augmented assignment. The target class cannot contain a
// comparison character, so `age >= 18` and `flag = a == b` never become assignments by accident;
// `(?!=)` keeps the first `=` of `==` from matching.
const ASSIGN = /^([A-Za-z_][\w\s,]*?)\s*(\+=|-=|\*=|\/=|\/\/=|\*\*=|%=|=)(?!=)\s*(.+)$/;
const IF = /^(if|elif)\s+(.+):$/;
const ELSE = /^else\s*:$/;
const FOR = /^for\s+(.+?)\s+in\s+(.+):$/;
const WHILE = /^while\s+(.+):$/;
const DEF = /^def\s+([A-Za-z_]\w*)\s*\((.*)\)\s*:$/;
const RETURN = /^return(?:\s+(.*))?$/;
const TRY = /^try\s*:$/;
const FINALLY = /^finally\s*:$/;
const EXCEPT = /^except(?:\s+(.*))?\s*:$/;
const IMPORT = /^(?:import|from)\s+.+$/;
const CALL = /^([A-Za-z_]\w*)\s*\((.*)\)$/;

function leadingWhitespace(line: string): string {
  return line.slice(0, line.length - line.trimStart().length);
}

/** Width as Python counts it for a suite boundary: a tab is one level, however it is written. */
function indentWidth(indent: string): number {
  let width = 0;
  for (const char of indent) width += char === '\t' ? 4 : 1;
  return width;
}

interface ScanState {
  /** Open `(`, `[` or `{`. */
  depth: number;
  /** The quote run of an open triple-quoted string, or null. */
  triple: string | null;
  /** The line ended in a backslash outside a string. */
  continuation: boolean;
}

const CLOSED: ScanState = { depth: 0, triple: null, continuation: false };

/**
 * How much of the statement is still open after this physical line.
 *
 * Strings are walked here rather than stripped by a regex because a bracket inside a string is not
 * a bracket, and a `#` inside a string does not start a comment. Escapes inside strings are skipped
 * so a quoted backslash cannot open a continuation.
 */
function scanLine(state: ScanState, line: string): ScanState {
  let { depth, triple } = state;
  let index = 0;
  while (index < line.length) {
    const char = line[index];
    if (triple) {
      if (line.startsWith(triple, index)) {
        index += 3;
        triple = null;
        continue;
      }
      if (char === '\\') {
        index += 2;
        continue;
      }
      index += 1;
      continue;
    }
    if (char === '#') break;
    if (char === '"' || char === "'") {
      const run = line.slice(index, index + 3);
      if (run === '"""' || run === "'''") {
        triple = run;
        index += 3;
        continue;
      }
      index += 1;
      while (index < line.length) {
        if (line[index] === '\\') {
          index += 2;
          continue;
        }
        if (line[index] === char) {
          index += 1;
          break;
        }
        index += 1;
      }
      continue;
    }
    if (char === '(' || char === '[' || char === '{') depth += 1;
    else if (char === ')' || char === ']' || char === '}') depth = Math.max(0, depth - 1);
    index += 1;
  }
  const trimmed = line.replace(/\s+$/, '');
  return {
    depth: Math.max(0, depth),
    triple,
    continuation: !triple && depth === 0 && trimmed.endsWith('\\'),
  };
}

function stripBaseIndent(line: string, indent: string): string {
  if (line === '') return '';
  return line.startsWith(indent) ? line.slice(indent.length) : line.trimStart();
}

/** Group physical lines into statements, dropping blank lines between them. */
function logicalLines(source: string): LogicalLine[] {
  const physical = source.split('\n');
  if (physical.length > 0 && physical[physical.length - 1] === '') physical.pop();
  const lines: LogicalLine[] = [];
  let buffer: string[] = [];
  let state = CLOSED;
  const flush = () => {
    if (buffer.length === 0) return;
    const indent = leadingWhitespace(buffer[0]);
    const stripped = buffer.map((line) => stripBaseIndent(line, indent));
    lines.push({ indent, lines: stripped, text: stripped.join('\n') });
    buffer = [];
    state = CLOSED;
  };
  for (const line of physical) {
    if (buffer.length === 0) {
      if (line.trim() === '') continue;
    }
    buffer.push(line);
    state = scanLine(state, line);
    if (state.depth === 0 && state.triple === null && !state.continuation) flush();
  }
  flush();
  return lines;
}

/** The indentation a file already writes its bodies with, so new lines match it. */
function detectUnit(lines: LogicalLine[]): string {
  const counts = new Map<string, number>();
  for (const line of lines) {
    if (indentWidth(line.indent) === 0) continue;
    counts.set(line.indent, (counts.get(line.indent) ?? 0) + 1);
  }
  let best = '';
  let bestCount = 0;
  for (const [indent, count] of counts) {
    if (count > bestCount) {
      best = indent;
      bestCount = count;
    }
  }
  if (!best) return '    ';
  // A tab-written file keeps tabs; a space-written one keeps exactly the width it used.
  return best.includes('\t') ? '\t' : best;
}

function node(id: string, kind: BlockKind, fields: BlockNode['fields'], lines: string[] = []): BlockNode {
  return { id, kind, fields, body: [], lines };
}

/** One logical statement as a node. Multi-line statements stay raw; their own text is the model. */
function classifyLine(line: LogicalLine, id: string): BlockNode {
  if (line.lines.length > 1) return node(id, 'raw', {}, line.lines);
  const text = line.text.trim();
  if (text === '' || text.startsWith('#')) return node(id, 'raw', {}, line.lines);

  const assignment = ASSIGN.exec(text);
  if (assignment) {
    const value = assignment[3].trim();
    // An empty value catches `x =`; one that starts with `=` catches `x = = 1`. Both stay raw.
    if (value !== '' && !value.startsWith('=')) {
      return node(id, 'assign', {
        name: assignment[1].trim(),
        op: assignment[2],
        value,
      });
    }
  }

  const branch = IF.exec(text);
  if (branch) {
    const kind: BlockKind = branch[1] === 'if' ? 'if' : 'elif';
    return node(id, kind, { condition: branch[2].trim() });
  }
  if (ELSE.test(text)) return node(id, 'else', {});
  const loop = FOR.exec(text);
  if (loop) return node(id, 'for', { target: loop[1].trim(), iterable: loop[2].trim() });
  const whileLoop = WHILE.exec(text);
  if (whileLoop) return node(id, 'while', { condition: whileLoop[1].trim() });
  const def = DEF.exec(text);
  if (def) return node(id, 'def', { name: def[1], params: def[2].trim() });
  const returning = RETURN.exec(text);
  if (returning) return node(id, 'return', { value: (returning[1] ?? '').trim() });
  if (TRY.test(text)) return node(id, 'try', {});
  if (FINALLY.test(text)) return node(id, 'finally', {});
  const except = EXCEPT.exec(text);
  if (except) return node(id, 'except', { clause: (except[1] ?? '').trim() });
  if (IMPORT.test(text)) return node(id, 'import', {}, line.lines);
  const call = CALL.exec(text);
  if (call) return node(id, 'call', { callee: call[1], args: call[2] });
  return node(id, 'raw', {}, line.lines);
}

interface Frame {
  /** The indent of the statement that owns this body. A root frame has no owner. */
  ownerIndent: number;
  body: BlockNode[];
  /** The indent of the last statement added here, which is where a deeper line descends from. */
  lastIndent: number;
  /**
   * A block this parser cannot draw (a `class`, a decorated `with`, anything unrecognized) that is
   * collecting its indented lines. A frame in this mode appends text instead of classifying it.
   */
  raw?: BlockNode;
  /** The indent those raw lines are relative to; the block's first line may itself be indented. */
  rawBase?: number;
}

/**
 * One logical line placed at `base + depth*unit` by its own indentation.
 *
 * A raw block keeps the shape it had: its lines carry the spaces they were indented past the
 * statement that owns them, so a class body re-renders under the same class even after another
 * block is edited.
 */
function relativeLines(line: LogicalLine, base: number): string[] {
  const pad = ' '.repeat(Math.max(0, indentWidth(line.indent) - base));
  return line.lines.map((entry) => `${pad}${entry}`);
}

function buildNodes(
  lines: LogicalLine[],
  startSeq: number,
  unit: string
): { nodes: BlockNode[]; seq: number } {
  const root: BlockNode[] = [];
  const stack: Frame[] = [{ ownerIndent: -1, body: root, lastIndent: -1 }];
  let seq = startSeq;
  for (const line of lines) {
    const width = indentWidth(line.indent);
    while (stack.length > 1 && width <= stack[stack.length - 1].ownerIndent) stack.pop();
    let frame = stack[stack.length - 1];

    // An undrawable block is one node with its own lines, not one node per line: keeping them
    // together is what lets `class Arm:` hold `def move(...)` at the depth it was written at.
    if (frame.raw) {
      frame.raw.lines.push(...relativeLines(line, frame.rawBase ?? frame.ownerIndent));
      continue;
    }

    if (frame.body.length > 0 && width > frame.lastIndent) {
      const last = frame.body[frame.body.length - 1];
      if (isContainer(last.kind)) {
        frame = { ownerIndent: frame.lastIndent, body: last.body, lastIndent: frame.lastIndent };
        stack.push(frame);
      } else {
        const base = frame.ownerIndent < 0 ? 0 : frame.ownerIndent + indentWidth(unit);
        seq += 1;
        const raw = node(`b${seq}`, 'raw', {}, relativeLines(line, base));
        frame.body.push(raw);
        stack.push({ ownerIndent: width, body: [], lastIndent: width, raw, rawBase: base });
        // The block belongs to the level of the statement above it, so the next line at that level
        // is a sibling rather than another descent.
        continue;
      }
    }

    seq += 1;
    frame.body.push(classifyLine(line, `b${seq}`));
    frame.lastIndent = width;
  }
  return { nodes: root, seq };
}

/**
 * Read Python into the block model.
 *
 * The returned program is not dirty: `renderProgram` hands back the original `source` until the
 * learner edits a block, which is what makes opening visual mode a read, not a rewrite.
 */
export function parseProgram(source: string): BlockProgram {
  const lines = logicalLines(source);
  const unit = detectUnit(lines);
  const { nodes, seq } = buildNodes(lines, 0, unit);
  return {
    source,
    nodes,
    dirty: false,
    seq,
    unit,
    trailingNewline: source.endsWith('\n'),
  };
}
