/**
 * What Python's traceback actually says, as data (`app/src/traceback.ts`).
 *
 * The runner has always been able to print the failure; the useful part is *which line in the
 * learner's own file raised it*, and that was buried in an error blob along with the workbook's own
 * harness frames. This reads the text CPython prints and answers three questions:
 *
 * - **Which frame belongs to the learner?** The deepest frame that is not the lesson's appended
 *   self-check (`_selfcheck`, which `scripts/exercise_bundle.py` appends to graded entries). A check
 *   that raises has no learner frame at all, and saying so is more honest than pointing at a line the
 *   learner cannot edit.
 * - **What raised?** The exception class and its message, from the last line of the last traceback
 *   block — CPython prints the outer failure last, so a chained error reports the one that actually
 *   stopped the program.
 * - **One line for a record.** `NameError: name 'kp' is not defined`, which is what the learning log
 *   files and what a card prints, rather than `Traceback (most recent call last):`.
 *
 * Two shapes arrive here, because the worker reports a compile failure itself: the real traceback
 * (`File "...", line 7, in f`), and `SyntaxError (line 4): invalid syntax`, which has no frames to
 * read. Both come out as the same shape, with `syntax` set for the second.
 *
 * Everything here is total: an unrecognised string is `null`, never a throw, because this parses text
 * the runtime produced and a parser that crashes on a new CPython wording would take the failure card
 * with it.
 *
 * Parsing, not a structured payload from the worker, because a learner can `raise` and print a
 * traceback of their own: the panel is handed the text that was printed, and nothing else is
 * guaranteed to be there.
 */

export interface TracebackFrame {
  /** The compiled file name — `<lesson_editor>` for everything a lesson runs. */
  file: string;
  /** 1-based line, as Python reports it. */
  line: number;
  /** The function the frame was executing; `<module>` for top-level code. */
  name: string;
  /** The source line, when CPython printed one. */
  source?: string;
}

export interface ParsedFailure {
  exception: { type: string; message: string };
  /** `TypeError: can only concatenate list (not "int") to list` — one line, for a log or a card. */
  summary: string;
  frames: TracebackFrame[];
  /** The deepest frame a learner can act on, or null when only the lesson's own check raised. */
  frame: TracebackFrame | null;
  /** The deepest frame is harness code, so the line named is not the learner's to edit. */
  raisedByCheck: boolean;
  /** The worker reported a compile-time failure as `SyntaxError (line N): msg`, with no frames. */
  syntax: boolean;
}

/**
 * Function names that belong to the lesson's harness rather than to the learner.
 *
 * The appended self-check is the only one today: `pythonLessonsData.ts` carries `_selfcheck()` at the
 * bottom of a graded entry, and its assertion raises there. Kept as an option so a future harness does
 * not have to teach this file a second list.
 */
export const HARNESS_FUNCTIONS = ['_selfcheck'];

// `\s*` rather than `\s+`: a SyntaxError prints its `File` line first, with no `Traceback` header
// above it, and the text arrives trimmed - so that frame is at column zero.
const FRAME_RE = /^\s*File "([^"]*)", line (\d+)(?:, in (.+))?\s*$/;
const WORKER_SYNTAX_RE = /(?:^|\n)SyntaxError \(line (\d+)\):\s?([^\n]*)/;
const IDENTIFIER_RE = /^[A-Za-z_][\w.]*$/;

/** Python's own markers under a bad token; not a source line, and not worth showing twice. */
const CARET_RE = /^\s*[\^~]+\s*$/;

function parseExceptionLine(line: string): { type: string; message: string } | null {
  const text = line.trim();
  if (!text) return null;
  const colon = text.indexOf(':');
  const type = (colon < 0 ? text : text.slice(0, colon)).trim();
  if (!IDENTIFIER_RE.test(type)) return null;
  const message = colon < 0 ? '' : text.slice(colon + 1).trim();
  return { type, message };
}

/** The frames and the exception of one traceback block, which is what CPython prints per failure. */
function parseBlock(block: string): { frames: TracebackFrame[]; exception: { type: string; message: string } | null } {
  const lines = block.split('\n');
  const frames: TracebackFrame[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = FRAME_RE.exec(lines[index]);
    if (!match) continue;
    const frame: TracebackFrame = {
      file: match[1],
      line: Number(match[2]),
      name: (match[3] ?? '<module>').trim(),
    };
    // The source line follows the frame when CPython can read it. A caret line is the marker under
    // the offending token, which is what a SyntaxError adds and no other failure does.
    const next = lines[index + 1];
    if (next && next.trim() && !FRAME_RE.test(next) && !CARET_RE.test(next) && /^\s/.test(next)) {
      frame.source = next.trim();
    }
    frames.push(frame);
  }
  // The exception is the last line that reads as one: CPython ends every block with it, and a chained
  // failure's last block is the one that stopped the program. Scanning upward rather than taking the
  // final line keeps a message CPython wrapped over two lines from being read as `second line`.
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const parsed = parseExceptionLine(lines[index]);
    if (parsed) return { frames, exception: parsed };
  }
  return { frames, exception: null };
}

/**
 * Parse a failure's text, or null when the text is not a Python failure at all.
 *
 * `text` is what the runner holds as the error: the worker's `stderr`, which may carry the program's
 * own captured stderr above the traceback.
 */
export function parseFailure(
  text: string,
  options: { harnessFunctions?: string[] } = {}
): ParsedFailure | null {
  const source = String(text ?? '').replace(/\r\n?/g, '\n').trim();
  if (!source) return null;

  const workerSyntax = WORKER_SYNTAX_RE.exec(source);
  if (workerSyntax) {
    const line = Number(workerSyntax[1]);
    const message = workerSyntax[2].trim();
    const exception = { type: 'SyntaxError', message };
    return {
      exception,
      summary: message ? `SyntaxError: ${message}` : 'SyntaxError',
      frames: [{ file: '<lesson_editor>', line, name: '<module>' }],
      frame: { file: '<lesson_editor>', line, name: '<module>' },
      raisedByCheck: false,
      syntax: true,
    };
  }

  // A chained failure prints several blocks; the last one is the error that stopped the program.
  const blocks = source.split(/\nTraceback \(most recent call last\):\s*\n/);
  const block = blocks.length > 1 ? blocks[blocks.length - 1] : source;
  const { frames, exception } = parseBlock(block);
  if (!exception) return null;

  const harness = options.harnessFunctions ?? HARNESS_FUNCTIONS;
  const isHarness = (frame: TracebackFrame) => harness.includes(frame.name);
  const deepest = frames.length ? frames[frames.length - 1] : null;
  // Only the deepest frame is the answer: it is where the exception was raised. If that is harness
  // code there is no learner line at all - the frame above it is the harness's own call, and pointing
  // at it would send the learner to a line they cannot edit.
  const raisedByCheck = deepest ? isHarness(deepest) : false;
  const learnerFrame = deepest && !raisedByCheck ? deepest : null;

  return {
    exception,
    summary: exception.message
      ? `${exception.type}: ${exception.message.split('\n')[0]}`
      : exception.type,
    frames,
    frame: learnerFrame,
    raisedByCheck: deepest ? isHarness(deepest) : false,
    syntax: exception.type === 'SyntaxError' || exception.type === 'IndentationError' || exception.type === 'TabError',
  };
}

/** The one line a learning-log entry carries for a failed run, or '' when the text is not one. */
export function failureSummary(text: string): string {
  return parseFailure(text)?.summary ?? '';
}

/**
 * Whether the failure is an `AssertionError` — the learner's own check firing.
 *
 * The runner used to ask this with `text.startsWith('AssertionError')`, which was true while the
 * worker sent only the exception line and false the moment it sent the traceback: a capstone whose
 * appended self-check fired then read as a plain runtime error instead of a failed bench. The
 * exception class is the fact, so it is read from the parse, with the old prefix kept as a fallback
 * for text that is an assertion message and nothing else.
 */
export function isAssertionFailure(text: string): boolean {
  const failure = parseFailure(text);
  if (failure) return failure.exception.type === 'AssertionError';
  return String(text ?? '').trim().startsWith('AssertionError');
}
