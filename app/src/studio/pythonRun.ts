/**
 * Running a program in the studio (`app/src/studio/pythonRun.ts`).
 *
 * This is the smallest client that can speak to the runtime worker, not a second lesson runner. The
 * worker protocol itself — the run message, the verdict, the page-side kill clock, dispose — lives
 * once in `runtime/pyodideWorker.ts`; what is left here is the studio's own: an ungraded request, a
 * status word the tab can print, and the four sentences below.
 *
 * It deliberately does not carry the runner's grading, tracing, breakpoints, stdin, analysis,
 * formatting or watch channel: an ungraded scratchpad has no expected output to meet and no lesson
 * to pass, and every one of those protocols would be machinery looking for a use. The worker is the
 * same `runtime/pythonWorker.js` the runner uses, so there is one Pyodide load path, one filesystem
 * and one definition of what Python is. It is created on the first Run rather than on mount: a
 * learner who opens the studio to write a note should not download an interpreter.
 *
 * The one failure the studio answers earlier than the runner is a refused load: a worker that cannot
 * fetch Pyodide reports `status: error`, and the tab says so and builds a fresh worker on the next
 * Run rather than waiting out the kill clock.
 */

import { MECHALAB_PLANT_FILENAME, MECHALAB_PLANT_PY } from '../data/mechalabPlant.ts';
import { readTrace, TRACE_NAME_CAP, TRACE_STEP_CAP, TRACE_VALUE_CHARS, type TraceSnapshot } from '../runTrace.ts';
import { pyodideCdn } from '../runtime/pyodideCdn.ts';
import {
  PyodideWorkerSession,
  type PythonFormatAnswer,
  type PythonRunRequest,
  type PythonWorkerMessage,
} from '../runtime/pyodideWorker.ts';

export type ScratchStatus = 'idle' | 'loading' | 'ready' | 'running' | 'error';

export interface ScratchResult {
  stdout: string;
  stderr: string;
  /** True when the program finished without a reported error. */
  ok: boolean;
  stopped?: boolean;
  timedOut?: boolean;
  /** The run trace, or null when the program recorded none. */
  trace: TraceSnapshot | null;
}

/** How long the page waits before terminating a worker that has not answered. */
export const SCRATCH_KILL_MS = 30_000;
/** The interpreter's own budget, in seconds: a busy loop is stopped there first. */
const SCRATCH_TIMEOUT_SEC = 20;
/** Enough for a scratchpad program; the worker clamps its own tracing budget separately. */
const SCRATCH_MAX_STEPS = 2_000_000;

const LOAD_FAILED = 'Python could not load. Check the connection and press Run again.';
const WORKER_FAILED =
  'The Python worker could not start. Check the connection and press Run again.';
const STOPPED = 'Stopped. The next Run reloads Python.';
const KILLED = 'Stopped after 30 s — the program may have been looping. Press Run to try again.';

export interface ScratchRunner {
  run: (code: string, breakpoints?: readonly unknown[]) => Promise<ScratchResult>;
  /** Black's formatting of a scratch file, through the same worker and on the same load. */
  format: (code: string) => Promise<PythonFormatAnswer>;
  /** Continue from a park, the same command the lesson runner's paused bar sends. */
  continue: () => void;
  stop: () => void;
  dispose: () => void;
}

function request(code: string, breakpoints: readonly unknown[]): PythonRunRequest {
  return {
    studentCode: code,
    // Nothing to grade with: the studio has no instructor tests, bench or expected output.
    instructorTests: '',
    benchSource: '',
    cdnUrl: pyodideCdn(),
    maxSteps: SCRATCH_MAX_STEPS,
    timeoutSec: SCRATCH_TIMEOUT_SEC,
    // The shared plant, so a snippet copied out of a lesson still imports the arm it names.
    plantSource: MECHALAB_PLANT_PY,
    plantFilename: MECHALAB_PLANT_FILENAME,
    helperFiles: [],
    breakpoints,
    watches: [],
    // The studio's Trace tab reads the same recording the lesson runner does. The caps travel with
    // the request so the worker and the panel cannot disagree about how much was kept.
    trace: { cap: TRACE_STEP_CAP, names: TRACE_NAME_CAP, chars: TRACE_VALUE_CHARS },
  };
}

function asResult(message: PythonWorkerMessage): ScratchResult {
  if (message.type === 'timeout') {
    return { stdout: '', stderr: KILLED, ok: false, timedOut: true, trace: null };
  }
  if (message.type === 'error') {
    return {
      stdout: '',
      stderr: String(
        message.error || (message.workerFailed ? WORKER_FAILED : 'Execution error')
      ),
      ok: false,
      trace: null,
    };
  }
  if (message.type !== 'result') {
    // Stop and a refused load settle the run themselves, with their own sentence.
    return {
      stdout: '',
      stderr: String(message.stderr || ''),
      ok: false,
      stopped: Boolean(message.stopped),
      trace: null,
    };
  }
  const stdout = String(message.stdout || '');
  const stderr = String(message.stderr || '');
  return {
    stdout,
    stderr,
    ok: !stderr && !message.runtimeError && !message.timedOut,
    stopped: Boolean(message.stopped),
    timedOut: Boolean(message.timedOut),
    trace: readTrace(message.trace),
  };
}

/**
 * Build one client around one session, which owns the one worker.
 *
 * `onStatus` is called with the state the UI prints. It is a callback rather than a React hook so
 * the worker protocol stays testable in Node (the suite stubs `Worker`), and so the tab owns only
 * what the status line says.
 */
export function createScratchRunner(
  onStatus: (status: ScratchStatus) => void,
  onPause?: (step: { line?: number; fn?: string } | null) => void
): ScratchRunner {
  // The interpreter parks on this word with `Atomics.wait`; the page wakes it with Continue or Stop.
  // Without a shared buffer the worker simply runs on, so a browser without cross-origin isolation
  // keeps the Trace tab and loses only the park.
  let pause: SharedArrayBuffer | null = null;
  try {
    if (typeof SharedArrayBuffer !== 'undefined') pause = new SharedArrayBuffer(8);
  } catch {
    pause = null;
  }
  const session = new PyodideWorkerSession({
    onCreate: (worker) => {
      if (!pause) return;
      try {
        worker.postMessage({ type: 'init', pauseBuffer: pause });
      } catch {
        pause = null;
      }
    },
    onStatus: (message) => {
      if (message.status === 'loading') onStatus('loading');
      else if (message.status === 'ready') onStatus(session.running ? 'running' : 'ready');
      else if (message.status === 'error') {
        // Throw it away rather than reuse a half-loaded worker: the next Run builds a fresh one,
        // which is the retry the status line promises.
        session.cancel({ type: 'error', error: LOAD_FAILED });
        onStatus('error');
      }
    },
  });

  const stop = () => {
    // A parked interpreter is waiting on the pause word, not on the interrupt word. Wake it so the
    // cancellation unwinds through Python instead of leaving a parked worker to be terminated.
    if (pause) {
      try {
        const view = new Int32Array(pause, 0, 2);
        Atomics.store(view, 0, 4);
        Atomics.notify(view, 0);
      } catch {
        // A buffer that cannot be reached is already gone with the worker.
      }
    }
    if (!session.worker && !session.running) return;
    session.cancel({ stopped: true, stderr: STOPPED });
    onStatus('idle');
  };

  const proceed = () => {
    if (!pause) return;
    try {
      const view = new Int32Array(pause, 0, 2);
      Atomics.store(view, 0, 2);
      Atomics.notify(view, 0);
      session.resumeClock();
    } catch {
      // Nothing is parked if the buffer cannot be written.
    }
  };

  const run = async (code: string, breakpoints: readonly unknown[] = []): Promise<ScratchResult> => {
    if (session.running) stop();
    onStatus('running');
    let verdict: PythonWorkerMessage;
    try {
      verdict = await session.run(request(code, breakpoints), {
        loadKillMs: SCRATCH_KILL_MS,
        killMs: SCRATCH_KILL_MS,
      }, {
        onMessage: (message) => {
          if (message.type === 'paused') {
            const step = (message.step ?? {}) as { line?: number; fn?: string };
            onPause?.({ line: Number(step.line) || 0, fn: step.fn });
          }
        },
      });
    } catch {
      // `ensure()` throws at its caller when the browser refuses a module worker (a CSP without
      // `worker-src`, an engine without module workers): that is a start that failed, not a run to
      // wait out, so it gets the same sentence as a worker that could not.
      onStatus('error');
      return { stdout: '', stderr: WORKER_FAILED, ok: false, trace: null };
    }
    if (verdict.type === 'result') onStatus(session.worker ? 'ready' : 'idle');
    else if (verdict.type === 'timeout' || verdict.type === 'error') {
      onStatus(verdict.type === 'error' ? 'error' : 'idle');
    }
    return asResult(verdict);
  };

  return {
    run,
    format: (code: string) => session.format(code, pyodideCdn()),
    continue: proceed,
    stop,
    dispose: () => session.dispose(),
  };
}
