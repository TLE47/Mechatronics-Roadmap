/**
 * The page side of the Pyodide worker protocol (`app/src/runtime/pyodideWorker.ts`).
 *
 * Two surfaces run Python — the lesson runner and the free-study studio — and both talk to the same
 * `pythonWorker.js`. The rules of that conversation belong here, once: the shape of a run request,
 * the one verdict or error a run ends with, the status lines in between, the page-side clock that
 * kills a worker the interpreter's own budget cannot reach, and what "dispose" means.
 *
 * A consumer supplies only what is its own: the program, the numbers, how its status line reads,
 * and the sentences it prints. The run's identity, its clock and its worker are not the consumer's
 * to keep, so a protocol change cannot land in one surface and miss the other.
 */

/** Any message the worker sends: status, verdict, error, stdin request, scope batch or park. */
export interface PythonWorkerMessage {
  type?: string;
  status?: string;
  runId?: number;
  stdout?: string;
  stderr?: string;
  error?: string;
  stopped?: boolean;
  timedOut?: boolean;
  runtimeError?: boolean;
  ms?: number;
  boot?: string;
  prompt?: string;
  series?: unknown;
  step?: unknown;
  trace?: unknown;
  /** Set by the session when the worker itself failed, not by a `run` that ended in an error. */
  workerFailed?: boolean;
  bench?: string;
  requestId?: number;
  formatted?: string;
  unavailable?: string;
  instructorPassed?: boolean;
  instructorError?: string;
  inlineValues?: unknown;
  [key: string]: unknown;
}

/** Everything a run asks the worker to do. The session adds `type` and `runId`. */
export interface PythonRunRequest {
  studentCode: string;
  instructorTests: string;
  benchSource: string;
  cdnUrl: string;
  maxSteps: number;
  timeoutSec: number;
  plantSource: string;
  plantFilename: string;
  helperFiles: readonly { name: string; content: string }[];
  breakpoints: readonly unknown[];
  watches: readonly unknown[];
  trace?: { cap: number; names: number; chars: number };
}

/** Which stretch of a run a killed clock was measuring. */
export type KillPhase = 'load' | 'run';

export interface PythonFormatAnswer {
  formatted?: string;
  error?: string;
  unavailable?: string;
}

export interface RunLimits {
  /** Before the first `ready`: the load also has to fetch Pyodide. */
  loadKillMs: number;
  /** Once the interpreter is up, and after every pause is answered. */
  killMs: number;
}

export interface RunHandlers {
  /** Messages that are not an outcome: a waiting `input()`, a scope batch, a park. */
  onMessage?: (message: PythonWorkerMessage) => void;
}

export interface WorkerSessionOptions {
  /** Every status line, whether or not a run is waiting for one. */
  onStatus?: (message: PythonWorkerMessage) => void;
  /** What a new worker needs before it can run: shared buffers, extra listeners. */
  onCreate?: (worker: Worker) => void;
}

/**
 * One worker, one run at a time.
 *
 * A new run answers any run still waiting as stopped and takes the id, so no promise is left with
 * nobody able to settle it (a Run pressed twice, or a shortcut during a run). Stop and Reset settle
 * the waiting run explicitly with `cancel`, which also makes its id stale so a late message cannot
 * resolve the next run by accident.
 */
export class PyodideWorkerSession {
  private current: Worker | null = null;
  private nextRunId = 0;  private pending: { resolve: (message: PythonWorkerMessage) => void; handlers: RunHandlers } | null = null;
  /** Format requests are outside a run: they have their own ids and their own one-shot answers. */
  private formatWaiters = new Map<
    number,
    { resolve: (answer: PythonFormatAnswer) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private nextFormatId = 1;
  private clock: ReturnType<typeof setTimeout> | null = null;
  private limits: RunLimits | null = null;

  private readonly options: WorkerSessionOptions;

  constructor(options: WorkerSessionOptions = {}) {
    this.options = options;
  }

  get worker(): Worker | null {
    return this.current;
  }

  /** The id of the most recent run, current or abandoned. */
  get runId(): number {
    return this.nextRunId;
  }

  /** True while a run is waiting for its verdict. */
  get running(): boolean {
    return this.pending !== null;
  }

  /** The worker, created on first use. A refused construction throws here, at the caller. */
  ensure(): Worker {
    if (this.current) return this.current;
    // A real module URL, not a blob: the service worker controls this worker, so the Pyodide wheels
    // it fetches can be cached and served with the network off. `type: 'module'` is what lets the
    // worker use a dynamic `import()` for the ESM runtime instead of `importScripts`.
    const worker = new Worker(new URL('./pythonWorker.js', import.meta.url), { type: 'module' });
    this.current = worker;
    worker.onmessage = (event: MessageEvent) =>
      this.receive((event.data || {}) as PythonWorkerMessage);
    worker.onerror = (event: ErrorEvent) => this.fail(event);
    this.options.onCreate?.(worker);
    return worker;
  }

  /** Send a message outside a run: warm, format, an analysis request. */
  post(message: Record<string, unknown>): void {
    this.ensure().postMessage(message);
  }

  /**
   * Ask the worker for Black's formatting of one file, without a run or a grade.
   *
   * The worker installs Black on the first request and answers with `formatted`, the parser's
   * `error`, or `unavailable` when the wheel/CDN/worker failed. The timeout is longer than a run's
   * because the first call may be installing a wheel; the answer settles exactly once.
   */
  format(code: string, cdnUrl: string, timeoutMs = 120_000): Promise<PythonFormatAnswer> {
    const requestId = this.nextFormatId++;
    return new Promise<PythonFormatAnswer>((resolve) => {
      const timer = setTimeout(() => {
        this.formatWaiters.delete(requestId);
        resolve({ unavailable: 'The formatter did not answer. Try Format again.' });
      }, timeoutMs);
      this.formatWaiters.set(requestId, { resolve, timer });
      try {
        this.post({ type: 'format', requestId, code, cdnUrl });
      } catch (error) {
        clearTimeout(timer);
        this.formatWaiters.delete(requestId);
        resolve({ unavailable: error instanceof Error ? error.message : String(error) });
      }
    });
  }

  run(
    request: PythonRunRequest,
    limits: RunLimits,
    handlers: RunHandlers = {}
  ): Promise<PythonWorkerMessage> {
    this.settle({ stopped: true });
    this.nextRunId += 1;
    return new Promise<PythonWorkerMessage>((resolve) => {
      // Create first: a worker that cannot be constructed rejects the run, and must not leave a
      // clock or a pending entry behind.
      const worker = this.ensure();
      this.limits = limits;
      this.pending = { resolve, handlers };
      this.arm(limits.loadKillMs, 'load');
      worker.postMessage({ type: 'run', runId: this.nextRunId, ...request });
    });
  }

  isCurrent(runId: number): boolean {
    return this.nextRunId === runId;
  }

  /** Resolve the waiting run from outside the worker, without touching the worker. */
  settle(message: PythonWorkerMessage): void {
    this.clearClock();
    const pending = this.pending;
    this.pending = null;
    pending?.resolve(message);
  }

  /** Drop the run: its id goes stale, its clock stops and its worker is terminated. */
  cancel(message: PythonWorkerMessage): void {
    this.nextRunId += 1;
    this.settle(message);
    this.dispose();
  }

  /** A park is not a slow run: the clock belongs to execution, and a pause has none. */
  pauseClock(): void {
    this.clearClock();
  }

  /** Step or Continue: execution is moving again, so the run gets its budget back. */
  resumeClock(): void {
    if (this.pending && this.limits) this.arm(this.limits.killMs, 'run');
  }

  dispose(): void {
    this.clearClock();
    // A formatter waiting on a worker that is being torn down gets its answer now, not after its
    // two-minute clock. The request is outside the run, so the run's settle path cannot reach it.
    for (const waiter of this.formatWaiters.values()) {
      clearTimeout(waiter.timer);
      waiter.resolve({ unavailable: 'The formatter worker stopped.' });
    }
    this.formatWaiters.clear();
    const worker = this.current;
    this.current = null;
    if (!worker) return;
    try {
      worker.terminate();
    } catch {
      // Termination on a worker that is already gone is not a failure to report.
    }
  }

  private receive(data: PythonWorkerMessage): void {
    // Format answers are not runs: they must be read before the no-pending early return, and while a
    // run is waiting they must not be mistaken for its verdict.
    if (data.type === 'format') {
      const requestId = Number(data.requestId) || 0;
      const waiter = this.formatWaiters.get(requestId);
      if (waiter) {
        clearTimeout(waiter.timer);
        this.formatWaiters.delete(requestId);
        waiter.resolve({
          formatted: typeof data.formatted === 'string' ? data.formatted : undefined,
          error: typeof data.error === 'string' ? data.error : undefined,
          unavailable: typeof data.unavailable === 'string' ? data.unavailable : undefined,
        });
      }
      return;
    }
    if (data.type === 'status') {
      this.options.onStatus?.(data);
      // A consumer may have discarded the worker from its status handler (a refused load), and the
      // run is then already settled.
      if (!this.pending) return;
      if (data.status === 'ready') this.arm(this.limits?.killMs ?? 0, 'run');
      return;
    }
    const pending = this.pending;
    if (!pending) return;
    // The learner's `input()` is waiting on a line: the run is still alive, so this is not an
    // outcome. It carries no run id — the worker only asks while it is executing a program.
    if (data.type === 'stdin-request') {
      pending.handlers.onMessage?.(data);
      return;
    }
    // Scope batches and parks belong to the run that produced them, and neither ends it.
    if (data.type === 'scope' || data.type === 'paused') {
      if (data.runId !== this.nextRunId) return;
      if (data.type === 'paused') this.pauseClock();
      pending.handlers.onMessage?.(data);
      return;
    }
    if (data.runId !== this.nextRunId) return;
    this.settle(data);
  }

  private fail(event: ErrorEvent): void {
    const error = event?.message || '';
    this.dispose();
    this.settle({ type: 'error', workerFailed: true, error });
    // A worker that cannot start is a status before it is a verdict: the studio's line promises a
    // retry, so say so even when no run was waiting for this one.
    this.options.onStatus?.({ type: 'status', status: 'error' });
  }

  private arm(ms: number, phase: KillPhase): void {
    this.clearClock();
    this.clock = setTimeout(() => {
      this.clock = null;
      this.dispose();
      this.settle({ type: 'timeout', timedOut: true, phase, ms });
    }, ms);
  }

  private clearClock(): void {
    if (this.clock === null) return;
    clearTimeout(this.clock);
    this.clock = null;
  }
}
