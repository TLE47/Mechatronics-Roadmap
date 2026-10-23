/**
 * Asking the Python worker for completions, lint, hover and signatures (`app/src/analysisClient.ts`).
 *
 * The worker owns the interpreter, so every question is a message, not an import: `complete`, `lint`,
 * `hover` and `signature` go out with a request id and come back as `completions` / `lint` / `hover` /
 * `signature`, carrying Jedi's options, pyflakes' messages, or jedi's definition and call signature.
 * Everything here is transport plus the *mapping* rules - what a Jedi type is called in a CodeMirror
 * completion, where the inserted text starts, how a note reads in a sentence, which parameter of a
 * signature is the active one - because those are the parts a test can pin without a browser or a
 * 10 MB interpreter.
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

/**
 * What hover answers: the name under the pointer and what it is.
 *
 * `description` is Jedi's definition line (`def acos`, `pi: Final[float]`, `module math`) and is the
 * part that is always true; `signature` is filled for anything callable. `doc` is empty for a
 * constant - see the worker's note on why Jedi's docstring there belongs to the type, not the name.
 */
export interface HoverInfo {
  name: string;
  type: string;
  description: string;
  signature: string;
  doc: string;
}

/** The call a cursor sits inside, as Jedi describes it. `index` is the active parameter, if any. */
export interface SignatureInfo {
  name: string;
  label: string;
  index: number | null;
  params: string[];
  doc: string;
}

/** A signature split at the active parameter, so the tooltip can bold the argument being typed. */
export interface SignatureParts {
  before: string;
  active: string;
  after: string;
}

export type AnalysisReply<T> =
  | { ok: true; value: T; ms: number }
  | { ok: false; reason: string };

/** Long enough for a cold Jedi import on a slow machine, short enough not to hold a keystroke. */
export const ANALYSIS_TIMEOUT_MS = 8000;

/**
 * What a request is allowed while the worker installs jedi and pyflakes.
 *
 * The analyzers install on the first request of every fresh worker (~1.5 MB through micropip), and a
 * tab switch throws the worker away — so the first completion after a remount waits on an installation,
 * not on an answer. Eight seconds is not that; a request cut off mid-install is answered with the
 * keyword fallback, which has nothing to say about `math.`, so the list simply never appears. This is
 * the ceiling for that case alone: it starts when the worker says it is installing and returns to
 * `ANALYSIS_TIMEOUT_MS` the moment the install reports done.
 */
export const INSTALL_TIMEOUT_MS = 60_000;

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

/** Hover and signature ask about a position too, at the name the pointer is over or the cursor. */
export type PositionRequest = CompletionRequest;

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

/**
 * The definition line for a hover, which is always true, or the bare name when Jedi sent neither.
 *
 * `def acos` / `pi: Final[float]` / `module math` / `keyword print`; the bare name is the fallback for
 * an analyzer whose description came back empty rather than an empty heading over a tooltip.
 */
export function hoverTitle(hover: HoverInfo): string {
  return hover.description || hover.name;
}

/**
 * The first paragraph of a docstring, at most `maxLines` lines and `maxChars` characters.
 *
 * A tooltip is a glance, not a page: `math`'s module docstring runs to several paragraphs, and the
 * first one is the answer to "what is this".
 */
export function docParagraph(doc: string, maxLines = 4, maxChars = 320): string {
  const text = (doc || '').trim();
  if (!text) return '';
  const paragraph = text.split(/\n\s*\n/)[0].trim();
  const lines = paragraph.split('\n').slice(0, Math.max(1, maxLines));
  const joined = lines.join('\n');
  return joined.length > maxChars ? `${joined.slice(0, maxChars - 1).trimEnd()}…` : joined;
}

/**
 * Split a signature at the argument the cursor is in, so the tooltip can bold it.
 *
 * The label is cut at *top-level* commas: `gain(k, x, scale=1.0)` at index 1 highlights `x`, not
 * `x, scale=1.0`, and a default that is itself a call (`f(g(1, 2), 3)`) does not split inside the
 * inner call. An empty argument (the cursor right after `(`) or an index outside the label returns
 * null, and the tooltip then draws the label undivided.
 */
export function splitSignature(signature: SignatureInfo): SignatureParts | null {
  const { label, index } = signature;
  if (typeof label !== 'string' || index === null || index < 0) return null;
  const open = label.indexOf('(');
  if (open < 0) return null;
  const segments: Array<[number, number]> = [];
  let depth = 0;
  let start = open + 1;
  for (let i = open + 1; i < label.length; i += 1) {
    const char = label[i];
    if (char === '(' || char === '[' || char === '{') depth += 1;
    else if (char === ')' || char === ']' || char === '}') {
      if (depth === 0) {
        segments.push([start, i]);
        break;
      }
      depth -= 1;
    } else if (char === ',' && depth === 0) {
      segments.push([start, i]);
      start = i + 1;
    }
  }
  const segment = segments[index];
  if (!segment) return null;
  const raw = label.slice(segment[0], segment[1]);
  const leading = raw.length - raw.trimStart().length;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const from = segment[0] + leading;
  const to = from + trimmed.length;
  return { before: label.slice(0, from), active: trimmed, after: label.slice(to) };
}

/** A hover answer, or null when it says nothing (Jedi found no definition under the pointer). */
export function asHover(value: unknown): HoverInfo | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Record<string, unknown>;
  const name = typeof entry.name === 'string' ? entry.name.trim() : '';
  if (!name) return null;
  return {
    name,
    type: typeof entry.type === 'string' && entry.type ? entry.type : 'statement',
    description: typeof entry.description === 'string' ? entry.description.trim() : '',
    signature: typeof entry.signature === 'string' ? entry.signature.trim() : '',
    doc: typeof entry.doc === 'string' ? entry.doc : '',
  };
}

/** A signature answer, or null when the cursor is not inside a call (or Jedi sent nothing usable). */
export function asSignature(value: unknown): SignatureInfo | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Record<string, unknown>;
  const label = typeof entry.label === 'string' ? entry.label.trim() : '';
  if (!label) return null;
  const params = Array.isArray(entry.params)
    ? entry.params.filter((param): param is string => typeof param === 'string').slice(0, 12)
    : [];
  const rawIndex = Number(entry.index);
  const index = Number.isInteger(rawIndex) && rawIndex >= 0 && rawIndex < params.length ? rawIndex : null;
  return {
    name: typeof entry.name === 'string' ? entry.name.trim() : '',
    label,
    index,
    params,
    doc: typeof entry.doc === 'string' ? entry.doc : '',
  };
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
  /** True between the worker's `installing` notice and its `ready` one. */
  private installing = false;

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
    // The worker's own report on the install, which is not an answer to any request: it moves every
    // pending request onto the install budget and back off it again.
    if (message.type === 'analysis-status' || message.type === 'format-status') {
      this.setInstalling(message.state === 'installing');
      return true;
    }
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

  /**
   * Re-arm every pending request's clock — the install budget while it runs, the normal one after.
   *
   * Nothing else changes about a request: it still resolves or refuses with the same shapes. Only how
   * long it is allowed to wait moves, because what it is waiting for is an installation.
   */
  private armPending(ms: number): void {
    for (const [requestId, waiter] of this.pending) {
      clearTimeout(waiter.timer);
      waiter.timer = setTimeout(() => {
        this.pending.delete(requestId);
        waiter.resolve({ unavailable: 'timed out' });
      }, ms);
    }
  }

  private setInstalling(installing: boolean): void {
    if (this.installing === installing) return;
    this.installing = installing;
    this.armPending(installing ? INSTALL_TIMEOUT_MS : this.timeoutMs);
  }

  private ask(
    type: 'complete' | 'lint' | 'hover' | 'signature' | 'format',
    request: AnalysisRequest & Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const requestId = this.nextId;
    this.nextId += 1;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        resolve({ unavailable: 'timed out' });
      }, this.installing ? INSTALL_TIMEOUT_MS : this.timeoutMs);
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

  /**
   * What the name at a position is.
   *
   * `ok: true, value: null` is a real answer - Jedi knows nothing about that spot (whitespace, a
   * name it cannot resolve) - and is kept apart from `ok: false`, which is the analyzer being
   * unavailable. A hover shows nothing in the first case and says why in the second with nothing to
   * add: a tooltip that appears on every word to say "unknown" would be worse than no tooltip.
   */
  async hover(request: PositionRequest): Promise<AnalysisReply<HoverInfo | null>> {
    const reply = await this.ask('hover', { ...request });
    if (reply.unavailable) {
      return { ok: false, reason: String(reply.unavailable) };
    }
    return { ok: true, value: asHover(reply.hover), ms: Number(reply.ms) || 0 };
  }

  /** The call the cursor is inside, or `ok: true, value: null` when it is not inside one. */
  async signature(request: PositionRequest): Promise<AnalysisReply<SignatureInfo | null>> {
    const reply = await this.ask('signature', { ...request });
    if (reply.unavailable) {
      return { ok: false, reason: String(reply.unavailable) };
    }
    return { ok: true, value: asSignature(reply.signature), ms: Number(reply.ms) || 0 };
  }

  /**
   * The file as the formatter would write it.
   *
   * The formatter (Black) rides this channel because it is the same worker, the same "installs on first
   * use" wait and the same one-answer-per-request contract as the analyzers; the session's install
   * budget is what stops a slow wheel download being reported as "timed out".
   *
   * Three outcomes, and they are not two: a file Black cannot parse is the learner's own syntax and
   * says so in the parser's words (`syntax: true`), while a missing wheel or a dead CDN is the
   * formatter being unavailable and must not be blamed on their code.
   */
  async format(code: string): Promise<FormatReply> {
    const reply = await this.ask('format', { code });
    if (reply.unavailable) {
      return { ok: false, syntax: false, reason: String(reply.unavailable) };
    }
    if (typeof reply.error === 'string' && reply.error) {
      return { ok: false, syntax: true, reason: reply.error };
    }
    return { ok: true, text: String(reply.formatted ?? '') };
  }
}

/** What the formatter answered: the tidied text, or which kind of failure it was. */
export type FormatReply =
  | { ok: true; text: string }
  | { ok: false; syntax: boolean; reason: string };
