/**
 * Asking the Python worker for completions and lint (`app/src/analysisClient.ts`).
 *
 * The worker owns the interpreter, so both questions are messages, not imports: `complete` and `lint`
 * go out with a request id and come back as `completions` / `lint`, carrying Jedi's options or
 * pyflakes' messages. Everything here is transport plus the *mapping* rules - what a Jedi type is
 * called in a CodeMirror completion, where the inserted text starts, how a note reads in a sentence -
 * because those are the parts a test can pin without a browser or a 10 MB interpreter.
 *
 * Three rules the code keeps:
 *
 * 1. **Nothing here can execute the learner's code.** The buffer is sent as a string and handed to
 *    `jedi.Script(...)` inside the worker; the analysis path never `exec`s it.
 * 2. **A request that is not answered is dropped, not awaited forever.** Every request has a timeout;
 *    a worker restarted mid-request resolves as `{ ok: false }` and the editor falls back to the
 *    keyword completions it shipped with.
 * 3. **An unavailable analyzer says so.** The worker reports `unavailable` (the install is the one
 *    network request in this path), and the caller shows that instead of pretending there were no
 *    problems to report.
 */

export interface AnalysisOption {
  /** The name to complete to, e.g. `acos`. */
  name: string;
  /** Jedi's own type: function, class, instance, module, keyword, property, statement, param, path. */
  type: string;
  /** The docstring's full text, already capped by the worker. */
  doc: string;
}

export interface LintNote {
  /** 1-based line, as Python counts. */
  line: number;
  /** 1-based column, as pyflakes counts. */
  column: number;
  text: string;
}

export type AnalysisReply<T> =
  | { ok: true; value: T; ms: number }
  | { ok: false; reason: string };

/** Long enough for a cold Jedi import on a slow machine, short enough not to hold a keystroke. */
export const ANALYSIS_TIMEOUT_MS = 8000;

export interface AnalysisRequest {
  code: string;
  cdnUrl?: string;
  plantSource?: string;
  plantFilename?: string;
  helperFiles?: { name: string; content: string }[];
}

/** A completion also says where the cursor is: 1-based line, 0-based column, as Jedi counts. */
export interface CompletionRequest extends AnalysisRequest {
  line: number;
  column: number;
}

/** One completed option, in the shape CodeMirror's completion list reads. */
export interface CompletionOption {
  label: string;
  type: string;
  detail?: string;
  info?: string;
}

const JEDI_TYPE_MAP: Record<string, string> = {
  module: 'namespace',
  class: 'class',
  function: 'function',
  method: 'method',
  instance: 'variable',
  param: 'variable',
  property: 'property',
  keyword: 'keyword',
  statement: 'keyword',
  path: 'text',
};

/** Jedi's vocabulary in CodeMirror's: the two are different, and an unknown one is shown as text. */
export function completionType(jediType: string): string {
  return JEDI_TYPE_MAP[jediType] ?? 'text';
}

/**
 * Where the text being completed starts.
 *
 * `math.ac` completes to `math.acos`, so the replaced span begins after the dot, not at the `m`.
 * This is the difference between a completion that works and one that types `acos` over `math.ac`.
 */
export function completionStart(code: string, pos: number): number {
  const limit = Math.max(0, Math.min(pos, code.length));
  let start = limit;
  while (start > 0 && /[A-Za-z0-9_]/.test(code[start - 1])) start -= 1;
  return start;
}

/** 1-based line, 0-based column - the pair Jedi's `complete(line, column)` expects. */
export function lineColumnAt(code: string, pos: number): { line: number; column: number } {
  const limit = Math.max(0, Math.min(pos, code.length));
  const before = code.slice(0, limit);
  const line = before.split('\n').length;
  const column = limit - (before.lastIndexOf('\n') + 1);
  return { line, column };
}

function docFirstLine(doc: string): string {
  const first = doc.split('\n').map((line) => line.trim()).find((line) => line.length > 0) ?? '';
  return first.length > 80 ? `${first.slice(0, 79)}…` : first;
}

/** Jedi's options as completion entries: the docstring's first line is the detail, all of it is the info. */
export function toCompletionOptions(options: AnalysisOption[]): CompletionOption[] {
  const seen = new Set<string>();
  const mapped: CompletionOption[] = [];
  for (const option of options) {
    if (!option || typeof option.name !== 'string' || !option.name) continue;
    if (seen.has(option.name)) continue;
    seen.add(option.name);
    const doc = typeof option.doc === 'string' ? option.doc : '';
    const detail = docFirstLine(doc);
    mapped.push({
      label: option.name,
      type: completionType(option.type),
      ...(detail ? { detail } : {}),
      ...(doc ? { info: doc } : {}),
    });
  }
  return mapped;
}

/** Keep only the messages that can be drawn: a line number, and words. */
export function asLintNotes(value: unknown, max = 20): LintNote[] {
  if (!Array.isArray(value)) return [];
  const notes: LintNote[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const { line, column, text } = entry as Record<string, unknown>;
    if (typeof text !== 'string' || !text.trim()) continue;
    const lineNumber = Number(line);
    if (!Number.isFinite(lineNumber) || lineNumber < 1) continue;
    const columnNumber = Number(column);
    notes.push({
      line: Math.round(lineNumber),
      column: Number.isFinite(columnNumber) && columnNumber >= 1 ? Math.round(columnNumber) : 1,
      text: text.trim(),
    });
    if (notes.length >= max) break;
  }
  return notes;
}

/** `line 3 · 'os' imported but unused` - the line a learner has to look at, then what is wrong. */
export function noteLabel(note: LintNote): string {
  return `line ${note.line} · ${note.text}`;
}

/** The same notes in the same order: a lint that repeats itself is not news. */
export function sameNotes(a: LintNote[], b: LintNote[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (note, index) =>
      note.line === b[index].line && note.column === b[index].column && note.text === b[index].text
  );
}

function asOptions(value: unknown): AnalysisOption[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    .filter((entry) => typeof entry.name === 'string')
    .map((entry) => ({
      name: entry.name as string,
      type: typeof entry.type === 'string' ? entry.type : 'statement',
      doc: typeof entry.doc === 'string' ? entry.doc : '',
    }));
}

interface Waiter {
  resolve: (reply: Record<string, unknown>) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * One worker's analysis channel: request ids in, matched answers out.
 *
 * Built around `postMessage` rather than a worker handle so the runner can hand it the *current*
 * worker (Reset Runtime replaces one) and so a test can drive it with a fake.
 */
export class AnalysisSession {
  private nextId = 1;
  private readonly pending = new Map<number, Waiter>();
  private readonly post: (message: Record<string, unknown>) => void;
  private readonly timeoutMs: number;

  /**
   * @param post         how to reach the current worker
   * @param timeoutMs    how long to wait for an answer; injected by the suite so its timeout case
   *                     does not take eight seconds
   */
  constructor(
    post: (message: Record<string, unknown>) => void,
    timeoutMs: number = ANALYSIS_TIMEOUT_MS
  ) {
    this.post = post;
    this.timeoutMs = timeoutMs;
  }

  /**
   * True when this message was an analysis answer.
   *
   * The runner checks this before its run-outcome gate: an answer arriving mid-run has no `runId`, and
   * letting it reach that gate would resolve the run's promise with a completion list.
   */
  handleMessage(data: unknown): boolean {
    if (!data || typeof data !== 'object') return false;
    const message = data as Record<string, unknown>;
    if (typeof message.requestId !== 'number') return false;
    const waiter = this.pending.get(message.requestId);
    if (!waiter) return true; // a late answer to a request that already timed out
    this.pending.delete(message.requestId);
    clearTimeout(waiter.timer);
    waiter.resolve(message);
    return true;
  }

  /** Drop every in-flight request; they resolve as unavailable so no caller waits forever. */
  cancelAll(reason = 'cancelled'): void {
    for (const [id, waiter] of this.pending) {
      clearTimeout(waiter.timer);
      this.pending.delete(id);
      waiter.resolve({ unavailable: reason });
    }
  }

  private ask(
    type: 'complete' | 'lint',
    request: AnalysisRequest & Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const requestId = this.nextId;
    this.nextId += 1;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        resolve({ unavailable: 'timed out' });
      }, this.timeoutMs);
      this.pending.set(requestId, { resolve, timer });
      try {
        this.post({ type, requestId, ...request });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(requestId);
        resolve({ unavailable: error instanceof Error ? error.message : String(error) });
      }
    });
  }

  async complete(request: CompletionRequest): Promise<AnalysisReply<AnalysisOption[]>> {
    const reply = await this.ask('complete', { ...request });
    if (reply.unavailable) {
      return { ok: false, reason: String(reply.unavailable) };
    }
    return {
      ok: true,
      value: asOptions(reply.options),
      ms: Number(reply.ms) || 0,
    };
  }

  async lint(request: AnalysisRequest): Promise<AnalysisReply<LintNote[]>> {
    const reply = await this.ask('lint', { ...request });
    if (reply.unavailable) {
      return { ok: false, reason: String(reply.unavailable) };
    }
    return {
      ok: true,
      value: asLintNotes(reply.messages),
      ms: Number(reply.ms) || 0,
    };
  }
}
