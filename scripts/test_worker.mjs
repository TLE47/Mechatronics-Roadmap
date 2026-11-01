#!/usr/bin/env node
/**
 * The page side of the Python worker, without a browser (`scripts/test_worker.mjs`, `npm run test:worker`).
 *
 * `app/src/runtime/pyodideWorker.ts` is the one owner of the conversation both runners have with
 * `pythonWorker.js`. The browser suites prove what a learner sees; this suite proves the contract
 * itself, with a worker that only records and a clock that only counts, so each rule can be read on
 * its own: the run message, the status line, the kill clock's re-arm and its park, a verdict that
 * belongs to another run, cancel, dispose, and a worker that cannot start.
 *
 * `test:studio` proves the studio consumer of this module; this suite is what pins the module.
 */

import assert from 'node:assert/strict';
import { PyodideWorkerSession } from '../app/src/runtime/pyodideWorker.ts';

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL ${name}\n       ${error.message}`);
  }
}

async function checkAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL ${name}\n       ${error.message}`);
  }
}

/** The request both runners send, with no lesson in it: the shape is what is under test. */
const REQUEST = {
  studentCode: 'print(1)\n',
  instructorTests: '',
  benchSource: '',
  cdnUrl: 'https://cdn.example/pyodide/',
  maxSteps: 1_000,
  timeoutSec: 1,
  plantSource: 'plant = 1\n',
  plantFilename: 'plant.py',
  helperFiles: [],
  breakpoints: [],
  watches: [],
};

const LIMITS = { loadKillMs: 30_000, killMs: 5_000 };

/** A worker the page can answer for: it records posts and termination, and nothing else. */
class FakeWorker {
  static instances = [];

  constructor(url, options) {
    this.url = String(url);
    this.options = options;
    this.posted = [];
    this.terminated = false;
    FakeWorker.instances.push(this);
  }

  postMessage(message) {
    this.posted.push(message);
  }

  terminate() {
    this.terminated = true;
  }

  addEventListener() {}

  /** A message from the worker, the way the browser delivers one. */
  emit(data) {
    this.onmessage({ data });
  }

  /** A worker that could not be constructed or could not load its script. */
  fail(message) {
    this.onerror({ message });
  }
}

/** Timer control, so the kill clock can be inspected and fired instead of waited out. */
function fakeClock() {
  const real = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  let nextId = 0;
  const timers = new Map();
  globalThis.setTimeout = (fn, ms) => {
    const id = ++nextId;
    timers.set(id, { fn, ms });
    return id;
  };
  globalThis.clearTimeout = (id) => timers.delete(id);
  return {
    get pending() {
      return [...timers.values()];
    },
    get last() {
      return [...timers.values()].at(-1) ?? null;
    },
    fireLast() {
      const [id, timer] = [...timers.entries()].at(-1);
      timers.delete(id);
      timer.fn();
    },
    restore() {
      globalThis.setTimeout = real.setTimeout;
      globalThis.clearTimeout = real.clearTimeout;
    },
  };
}

function useFakeWorkers() {
  FakeWorker.instances = [];
  globalThis.Worker = FakeWorker;
}

function restoreWorker() {
  delete globalThis.Worker;
}

/** Start a run and hand back its promise, the worker it reached, and the message it posted. */
function startRun(session, limits = LIMITS) {
  const promise = session.run(REQUEST, limits);
  const worker = FakeWorker.instances.at(-1);
  assert.ok(worker, 'a run must create a worker');
  const message = worker.posted.at(-1);
  assert.equal(message.type, 'run', 'a run must post the run message');
  return { promise, worker, message };
}

/** A promise's resolution, observable without awaiting it. */
function settled(promise) {
  const state = { done: false, value: null };
  promise.then((value) => {
    state.done = true;
    state.value = value;
  });
  return state;
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

console.log('\nworker session');

check('one Run posts the whole request, with the type and id the worker reads', () => {
  useFakeWorkers();
  const clock = fakeClock();
  try {
    const session = new PyodideWorkerSession();
    const { worker, message } = startRun(session);
    assert.deepEqual(message, { type: 'run', runId: 1, ...REQUEST });
    assert.equal(worker.posted.length, 1, 'one run is one message');
    assert.equal(worker.options.type, 'module', 'the worker is a module worker');
    assert.equal(clock.pending.length, 1, 'a run arms its kill clock');
    assert.equal(clock.last.ms, LIMITS.loadKillMs, 'the first clock covers the load');
    assert.equal(session.runId, 1);
    assert.equal(session.running, true);
  } finally {
    clock.restore();
    restoreWorker();
  }
});

check('status lines are forwarded whether or not a run is waiting', () => {
  useFakeWorkers();
  const statuses = [];
  const session = new PyodideWorkerSession({ onStatus: (data) => statuses.push(data) });
  session.post({ type: 'warm', cdnUrl: REQUEST.cdnUrl });
  const worker = FakeWorker.instances.at(-1);
  assert.equal(worker.posted.at(-1).type, 'warm');
  worker.emit({ type: 'status', status: 'loading' });
  worker.emit({ type: 'status', status: 'ready', ms: 1200, boot: 'boot-1' });
  assert.deepEqual(statuses, [
    { type: 'status', status: 'loading' },
    { type: 'status', status: 'ready', ms: 1200, boot: 'boot-1' },
  ]);
  restoreWorker();
});

check('ready re-arms the kill clock from the load budget to the run budget', () => {
  useFakeWorkers();
  const clock = fakeClock();
  try {
    const session = new PyodideWorkerSession();
    const { worker } = startRun(session);
    worker.emit({ type: 'status', status: 'ready' });
    assert.equal(clock.pending.length, 1, 'the load clock is replaced, not added to');
    assert.equal(clock.last.ms, LIMITS.killMs);
  } finally {
    clock.restore();
    restoreWorker();
  }
});

check('a park stops the clock, and Step or Continue gives the run its budget back', () => {
  useFakeWorkers();
  const clock = fakeClock();
  try {
    const parks = [];
    const session = new PyodideWorkerSession();
    session.run(REQUEST, LIMITS, { onMessage: (data) => parks.push(data) });
    const worker = FakeWorker.instances.at(-1);
    const runId = session.runId;
    worker.emit({ type: 'status', status: 'ready' });
    assert.equal(clock.last.ms, LIMITS.killMs);
    worker.emit({ type: 'paused', runId, step: { line: 3 } });
    assert.equal(clock.pending.length, 0, 'a paused run is not a slow run');
    assert.deepEqual(parks.at(-1), { type: 'paused', runId, step: { line: 3 } });
    session.resumeClock();
    assert.equal(clock.last.ms, LIMITS.killMs, 'execution gets a full budget again');
  } finally {
    clock.restore();
    restoreWorker();
  }
});

for (const { label, ready, phase, ms } of [
  { label: 'before Python is ready', ready: false, phase: 'load', ms: LIMITS.loadKillMs },
  { label: 'after Python is ready', ready: true, phase: 'run', ms: LIMITS.killMs },
]) {
  await checkAsync(`the clock resolves its own timeout ${label}, naming the phase`, async () => {
    useFakeWorkers();
    const clock = fakeClock();
    try {
      const session = new PyodideWorkerSession();
      const { promise, worker } = startRun(session);
      if (ready) worker.emit({ type: 'status', status: 'ready' });
      clock.fireLast();
      assert.deepEqual(await promise, { type: 'timeout', timedOut: true, phase, ms });
      assert.equal(worker.terminated, true, 'a killed clock terminates its worker');
      assert.equal(session.worker, null);
      assert.equal(session.running, false);
    } finally {
      clock.restore();
      restoreWorker();
    }
  });
}

await checkAsync('a verdict for another run never settles the current one', async () => {
  useFakeWorkers();
  const clock = fakeClock();
  try {
    const cases = [
      ['result', { type: 'result', runId: 99, stdout: 'stale' }],
      ['error', { type: 'error', runId: 99, error: 'stale' }],
      ['scope', { type: 'scope', runId: 99, series: [] }],
      ['paused', { type: 'paused', runId: 99, step: {} }],
    ];
    for (const [label, stale] of cases) {
      const session = new PyodideWorkerSession();
      const { promise, worker } = startRun(session);
      const state = settled(promise);
      worker.emit(stale);
      await tick();
      assert.equal(state.done, false, `a stale ${label} must not settle the run`);
      assert.equal(session.running, true, `a stale ${label} leaves the run waiting`);
    }
  } finally {
    clock.restore();
    restoreWorker();
  }
});

await checkAsync('a newer run settles the previous one as stopped and takes the id', async () => {
  useFakeWorkers();
  const clock = fakeClock();
  try {
    const session = new PyodideWorkerSession();
    const first = startRun(session);
    const second = session.run(REQUEST, LIMITS);
    const worker = FakeWorker.instances.at(-1);
    assert.equal(FakeWorker.instances.length, 1, 'a new run reuses the worker');
    assert.equal(session.runId, 2);
    assert.deepEqual(await first.promise, { stopped: true }, 'the replaced run is answered');
    worker.emit({ type: 'result', runId: 1, stdout: 'old\n' });
    await tick();
    assert.equal(session.running, true, 'a stale verdict leaves the new run waiting');
    worker.emit({ type: 'result', runId: 2, stdout: 'new\n' });
    assert.equal((await second).stdout, 'new\n');
    assert.equal(session.runId, 2);
    assert.equal(session.isCurrent(1), false, 'the older id is stale');
  } finally {
    clock.restore();
    restoreWorker();
  }
});

await checkAsync('a run that fails inside Python keeps its own error, not workerFailed', async () => {
  useFakeWorkers();
  const clock = fakeClock();
  try {
    const session = new PyodideWorkerSession();
    const { promise, worker } = startRun(session);
    worker.emit({ type: 'error', runId: 1, error: 'ValueError: boom' });
    const verdict = await promise;
    assert.equal(verdict.error, 'ValueError: boom');
    assert.equal(verdict.workerFailed, undefined);
    assert.equal(worker.terminated, false, 'a program error keeps the interpreter');
  } finally {
    clock.restore();
    restoreWorker();
  }
});

await checkAsync('cancel answers the waiting run and terminates its worker', async () => {
  useFakeWorkers();
  const clock = fakeClock();
  try {
    const session = new PyodideWorkerSession();
    const { promise, worker } = startRun(session);
    session.cancel({ stopped: true });
    assert.deepEqual(await promise, { stopped: true });
    assert.equal(worker.terminated, true);
    assert.equal(session.worker, null);
    assert.equal(session.running, false);
    assert.equal(session.isCurrent(1), false, 'a cancelled id is stale');
    assert.equal(clock.pending.length, 0, 'a cancelled run leaves no clock armed');
  } finally {
    clock.restore();
    restoreWorker();
  }
});

await checkAsync('dispose terminates the worker and a later run builds a fresh one', async () => {
  useFakeWorkers();
  const clock = fakeClock();
  try {
    const session = new PyodideWorkerSession();
    const first = startRun(session);
    session.dispose();
    assert.equal(first.worker.terminated, true);
    assert.equal(session.worker, null);
    // A Run that was abandoned by an unmount is still waiting; Stop settles it after the dispose.
    session.settle({ stopped: true });
    assert.deepEqual(await first.promise, { stopped: true });
    const second = startRun(session);
    assert.equal(FakeWorker.instances.length, 2, 'the next run must not reuse a closed worker');
    assert.equal(second.message.runId, 2);
    second.worker.emit({ type: 'result', runId: 2, stdout: 'fresh\n' });
    assert.equal((await second.promise).stdout, 'fresh\n');
  } finally {
    clock.restore();
    restoreWorker();
  }
});

await checkAsync('a worker that cannot start resolves as workerFailed and reports the status', async () => {
  useFakeWorkers();
  const clock = fakeClock();
  const statuses = [];
  try {
    const session = new PyodideWorkerSession({ onStatus: (data) => statuses.push(data) });
    const { promise, worker } = startRun(session);
    const runPromise = promise;
    worker.fail('boot exploded');
    const verdict = await runPromise;
    assert.deepEqual(verdict, { type: 'error', workerFailed: true, error: 'boot exploded' });
    assert.equal(worker.terminated, true, 'a worker that cannot start is discarded');
    assert.deepEqual(statuses.at(-1), { type: 'status', status: 'error' });
    assert.equal(session.running, false);
  } finally {
    clock.restore();
    restoreWorker();
  }
});

check('ensure is idempotent and onCreate sees the one worker', () => {
  useFakeWorkers();
  const created = [];
  const session = new PyodideWorkerSession({ onCreate: (worker) => created.push(worker) });
  const a = session.ensure();
  const b = session.ensure();
  assert.equal(a, b);
  assert.equal(FakeWorker.instances.length, 1);
  assert.deepEqual(created, [a]);
  assert.equal(session.worker, a);
  restoreWorker();
});

restoreWorker();

console.log(`\nworker: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
