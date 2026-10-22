/**
 * The run trace: what a program did, line by line, kept so it can be walked back (`app/src/runTrace.ts`).
 *
 * `docs/PLAN-2.0-GAP.md`'s last **missing** row is the debugger with time travel. A real pausing
 * debugger needs the page to hold the interpreter mid-statement, and Pyodide cannot: the worker runs
 * the program inside one `runPythonAsync` call, and the page's only lever is the interrupt word. What a
 * learner actually asks of a debugger is smaller than that — *"why did this loop do that?"* — and it is
 * answerable after the fact: record each line the program executed with the values it could see, then
 * let them step through it. That is replay, not remote control, and the difference is stated on screen.
 *
 * The recording happens in the worker, in the same `settrace` hook that already enforces the step
 * budget (`runtime/pythonWorker.js`); this module is the rules about what arrives, because the payload
 * crosses a thread boundary as JSON and nothing about it can be trusted:
 *
 * 1. **A step is a line, in the learner's file.** Frames from the harness, the plant and the appended
 *    self-check are not steps: a learner stepping through `math.sqrt` would be reading CPython's
 *    source, not theirs.
 * 2. **Bounded, and honest about it.** The worker caps what it records; the count it also returns is
 *    every line the program ran, so the panel can say `300 of 12,431` instead of pretending the tail
 *    never happened. A trace that silently stopped at 300 would be a wrong answer to "what did my
 *    program do".
 * 3. **The values are strings, already cut to a width.** A repr can be enormous, and a repr can raise —
 *    the worker formats them once, filters the names that are not data, and caps both the count and
 *    the length; this module caps them again, so a hand-made payload cannot draw a 40 kB cell.
 */

/** Steps the worker records. Past this, it keeps counting but stops collecting. */
export const TRACE_STEP_CAP = 300;
/** Values drawn per step: the ones a beginner's program actually carries. */
export const TRACE_NAME_CAP = 6;
/** Characters kept from one value's repr, matching the inline values' own width. */
export const TRACE_VALUE_CHARS = 40;

export interface TraceValue {
  name: string;
  value: string;
}

export interface TraceStep {
  /** 1-based position in the trace: what the panel prints and the slider moves by. */
  index: number;
  /** 1-based line in the learner's own file. */
  line: number;
  /** The function the line is in; `<module>` is top level. */
  fn: string;
  /** Call depth, so a line inside a function reads differently from the same line at top level. */
  depth: number;
  values: TraceValue[];
}

export interface TraceSnapshot {
  steps: TraceStep[];
  /** Every line event the program ran, including the ones past the cap. */
  total: number;
  /** True when `total` is larger than what was kept. */
  truncated: boolean;
}

/** The panel's word for a call depth: `1` is top level. */
export function depthLabel(depth: number): string {
  if (!Number.isFinite(depth) || depth <= 1) return 'top level';
  return `call depth ${Math.trunc(depth)}`;
}

function text(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.slice(0, limit) : '';
}

function values(raw: unknown): TraceValue[] {
  if (!Array.isArray(raw)) return [];
  const out: TraceValue[] = [];
  for (const entry of raw.slice(0, TRACE_NAME_CAP)) {
    if (!entry || typeof entry !== 'object') continue;
    const { name, value } = entry as { name?: unknown; value?: unknown };
    const key = text(name, 32);
    if (!key) continue;
    out.push({ name: key, value: text(value, TRACE_VALUE_CHARS) });
  }
  return out;
}

/**
 * The trace in a worker result, or null when there is none.
 *
 * `raw` is the parsed field: `{ steps, total }`. A string is accepted because the worker hands the
 * page JSON (a Python `json.dumps` result), and a malformed payload reads as no trace at all rather
 * than as a panel of blanks.
 */
export function readTrace(raw: unknown): TraceSnapshot | null {
  let payload = raw;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      return null;
    }
  }
  if (!payload || typeof payload !== 'object') return null;
  const { steps: rawSteps, total: rawTotal } = payload as { steps?: unknown; total?: unknown };
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) return null;
  const steps: TraceStep[] = [];
  for (const entry of rawSteps.slice(0, TRACE_STEP_CAP)) {
    if (!entry || typeof entry !== 'object') continue;
    const { line, fn, depth, values: rawValues } = entry as {
      line?: unknown;
      fn?: unknown;
      depth?: unknown;
      values?: unknown;
    };
    const lineNumber = Number(line);
    // A step with no line is not a step: the panel's whole job is to point at one.
    if (!Number.isFinite(lineNumber) || lineNumber < 1) continue;
    steps.push({
      index: steps.length + 1,
      line: Math.trunc(lineNumber),
      fn: text(fn, 40) || '<module>',
      depth: Number.isFinite(Number(depth)) ? Math.max(1, Math.trunc(Number(depth))) : 1,
      values: values(rawValues),
    });
  }
  if (steps.length === 0) return null;
  const total = Number.isFinite(Number(rawTotal)) ? Math.max(steps.length, Math.trunc(Number(rawTotal))) : steps.length;
  return { steps, total, truncated: total > steps.length };
}

/** A step index clamped to the trace, so a slider cannot arrive at a step that is not there. */
export function clampStep(trace: TraceSnapshot, index: number): number {
  const last = trace.steps.length - 1;
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(Math.trunc(index), last));
}

/** Prev/next, clamped: the two buttons must not need a disabled state to be safe. */
export function moveStep(trace: TraceSnapshot, index: number, delta: number): number {
  return clampStep(trace, clampStep(trace, index) + delta);
}

/** `34 steps`, or `300 of 12,431 steps · capped` when the worker stopped collecting. */
export function traceSummary(trace: TraceSnapshot): string {
  const kept = trace.steps.length;
  if (!trace.truncated) return `${kept} step${kept === 1 ? '' : 's'}`;
  return `${kept} of ${grouped(trace.total)} steps · capped`;
}

/** `step 12 of 34 · line 7 · triple` — where the learner is, in the words the panel uses. */
export function stepLabel(trace: TraceSnapshot, index: number): string {
  const step = trace.steps[clampStep(trace, index)];
  if (!step) return 'no steps';
  return `step ${step.index} of ${trace.steps.length} · line ${step.line} · ${step.fn}`;
}

/** The source line a step points at, for a panel that quotes the code instead of colouring it. */
export function sourceLine(text: string, line: number): string {
  const lines = text.split('\n');
  const wanted = lines[Math.trunc(line) - 1];
  return typeof wanted === 'string' ? wanted.trim() : '';
}

/** `12345` -> `12,345`, for a total a reader has to believe. */
function grouped(value: number): string {
  return String(Math.trunc(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
