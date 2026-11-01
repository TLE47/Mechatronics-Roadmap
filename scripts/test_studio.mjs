#!/usr/bin/env node
/**
 * The free-study store (`scripts/test_studio.mjs`, `npm run test:studio`).
 *
 * The studio is one record behind one key, and the record is the learner's work: a program that is
 * not a draft of any lesson, and a note that no exercise owns. So this suite pins the two things a
 * store can get wrong silently — losing text it accepted, and claiming to have saved text the
 * browser refused — plus the promises that make the tab honest:
 *
 * - nothing stored reads as the starter, and junk stored reads as the starter rather than a crash;
 * - code keeps its exact bytes (the final newline is the learner's) while a note is trimmed at the
 *   ends like every other note in the app;
 * - the two caps apply on the way in and on the way out, so a hand-edited backup cannot grow a box
 *   past what the tab says;
 * - a patch touches one field, never the other;
 * - an empty studio removes its key, so "never wrote" and "cleared it" are the same state.
 *
 * The runner has its own contract below, with a stub `Worker` instead of Pyodide: one run message
 * carries no grading inputs, a result delivers stdout or stderr, Stop terminates, the 30 s page kill
 * resolves as a timeout, a load failure discards the worker so the next Run is a fresh one, and
 * leaving the tab terminates. The browser suite proves the visible half end to end: Stop, both
 * budgets, a runtime error, and a fresh Run after each.
 *
 * Run: node --experimental-strip-types scripts/test_studio.mjs
 */

import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import {
  EMPTY_STUDIO,
  MAX_STUDIO_CODE_CHARS,
  MAX_STUDIO_NOTE_CHARS,
  STARTER_CODE,
  STORAGE_KEY_STUDIO,
  readStudio,
  saveStudio,
} from '../app/src/studio/store.ts';
import {
  SCRATCH_KILL_MS,
  createScratchRunner,
} from '../app/src/studio/pythonRun.ts';

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

/** A fresh browser: a working bucket, a blocked one, or none at all. */
function freshBrowser({ store = 'works' } = {}) {
  const window = new Window({ url: 'https://example.test/' });
  globalThis.window = window;
  globalThis.document = window.document;
  // The store reads through `bulkStorage()`; with no IndexedDB it is the bucket, and this keeps a
  // test from depending on an asynchronous hydrate the app does before the first render.
  delete globalThis.indexedDB;
  if (store === 'absent') {
    delete globalThis.localStorage;
  } else if (store === 'throws') {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError: localStorage is disabled');
      },
    });
  } else {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: window.localStorage,
    });
  }
  return window;
}

const NOW = 1_800_000_000_000;

check('nothing stored reads as the starter', () => {
  freshBrowser();
  const doc = readStudio();
  assert.equal(doc.code, STARTER_CODE);
  assert.equal(doc.note, '');
  assert.equal(doc.updatedAt, 0);
  assert.deepEqual(doc, EMPTY_STUDIO);
});

check('a save round-trips both fields and the timestamp', () => {
  freshBrowser();
  assert.equal(saveStudio({ code: 'print(2)\n', note: 'second thought' }, NOW), true);
  const doc = readStudio();
  assert.equal(doc.code, 'print(2)\n');
  assert.equal(doc.note, 'second thought');
  assert.equal(doc.updatedAt, NOW);
});

check('a patch touches one field and leaves the other alone', () => {
  freshBrowser();
  saveStudio({ code: 'x = 1\n', note: 'keep me' }, NOW);
  saveStudio({ code: 'x = 2\n' }, NOW + 1);
  assert.equal(readStudio().note, 'keep me', 'the note survived a code-only save');
  saveStudio({ note: 'a newer note' }, NOW + 2);
  assert.equal(readStudio().code, 'x = 2\n', 'the code survived a note-only save');
});

check('code keeps its exact bytes; a note is trimmed at the ends', () => {
  freshBrowser();
  const code = '\n    indented = True\n\n';
  saveStudio({ code, note: '   spaces around a note   ' }, NOW);
  assert.equal(readStudio().code, code);
  assert.equal(readStudio().note, 'spaces around a note');
});

check('both caps apply on the way in and on the way out', () => {
  freshBrowser();
  saveStudio({ code: 'x'.repeat(MAX_STUDIO_CODE_CHARS + 500), note: 'n'.repeat(MAX_STUDIO_NOTE_CHARS + 500) }, NOW);
  assert.equal(readStudio().code.length, MAX_STUDIO_CODE_CHARS);
  assert.equal(readStudio().note.length, MAX_STUDIO_NOTE_CHARS);
  localStorage.setItem(
    STORAGE_KEY_STUDIO,
    JSON.stringify({ code: 'y'.repeat(MAX_STUDIO_CODE_CHARS * 2), note: 'm'.repeat(MAX_STUDIO_NOTE_CHARS * 2) })
  );
  assert.equal(readStudio().code.length, MAX_STUDIO_CODE_CHARS, 'a hand-edited store is capped too');
  assert.equal(readStudio().note.length, MAX_STUDIO_NOTE_CHARS);
});

check('junk and half-written records read as the starter, never a crash', () => {
  freshBrowser();
  localStorage.setItem(STORAGE_KEY_STUDIO, 'not json');
  assert.deepEqual(readStudio(), EMPTY_STUDIO);
  localStorage.setItem(STORAGE_KEY_STUDIO, '[]');
  assert.deepEqual(readStudio(), EMPTY_STUDIO);
  localStorage.setItem(STORAGE_KEY_STUDIO, JSON.stringify({ code: 7, note: null, updatedAt: 'later' }));
  assert.deepEqual(readStudio(), { code: '', note: '', updatedAt: 0 }, 'an object with no usable fields is empty, not the starter');
  localStorage.setItem(STORAGE_KEY_STUDIO, JSON.stringify({ code: 'print(1)', note: 'note', updatedAt: 42 }));
  assert.deepEqual(readStudio(), { code: 'print(1)', note: 'note', updatedAt: 42 });
});

check('an empty studio removes its key', () => {
  freshBrowser();
  saveStudio({ code: 'print(1)\n', note: 'something' }, NOW);
  assert.notEqual(localStorage.getItem(STORAGE_KEY_STUDIO), null);
  assert.equal(saveStudio({ code: '', note: '' }, NOW + 1), true);
  assert.equal(localStorage.getItem(STORAGE_KEY_STUDIO), null, 'nothing left behind');
  assert.deepEqual(readStudio(), EMPTY_STUDIO, 'the next visit gets the starter back');
});

check('an empty code with a note is kept: an empty program is a program', () => {
  freshBrowser();
  saveStudio({ code: '', note: 'I cleared the editor on purpose' }, NOW);
  assert.notEqual(localStorage.getItem(STORAGE_KEY_STUDIO), null, 'the note is authored work, so the key stays');
  assert.equal(readStudio().code, '');
  assert.equal(readStudio().note, 'I cleared the editor on purpose');
});

check('a blocked or absent bucket costs the save, not the render', () => {
  freshBrowser({ store: 'throws' });
  assert.deepEqual(readStudio(), EMPTY_STUDIO);
  assert.equal(saveStudio({ code: 'print(1)' }), false);
  freshBrowser({ store: 'absent' });
  assert.deepEqual(readStudio(), EMPTY_STUDIO);
  assert.equal(saveStudio({ note: 'hello' }), false);
});

/** A worker the test can answer for: it records what the page sent and whether it was terminated. */
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
}

const nativeWorker = globalThis.Worker;

function useFakeWorkers() {
  FakeWorker.instances = [];
  globalThis.Worker = FakeWorker;
}

function restoreWorker() {
  if (nativeWorker) globalThis.Worker = nativeWorker;
  else delete globalThis.Worker;
}

/** Run, then hand back the worker the client made and the message it posted. */
function startRun(runner, code) {
  const promise = runner.run(code);
  const worker = FakeWorker.instances.at(-1);
  assert.ok(worker, 'a run must create a worker');
  const message = worker.posted.at(-1);
  assert.equal(message.type, 'run', 'a run must post the worker\'s run message');
  return { promise, worker, message };
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

console.log('\nstudio runner');

await checkAsync('one run message carries the program and no grading inputs', async () => {
  useFakeWorkers();
  const statuses = [];
  const runner = createScratchRunner((status) => statuses.push(status));
  const { promise, worker, message } = startRun(runner, 'print(1)\n');
  assert.equal(message.studentCode, 'print(1)\n');
  assert.equal(message.instructorTests, '', 'the studio has no instructor tests');
  assert.equal(message.benchSource, '', 'the studio has no bench');
  assert.equal(message.timeoutSec, 20);
  assert.equal(message.maxSteps, 2_000_000);
  assert.deepEqual(message.helperFiles, []);
  assert.deepEqual(message.breakpoints, []);
  assert.deepEqual(message.watches, []);
  assert.match(message.plantFilename, /\.py$/);
  assert.ok(message.plantSource.length > 0, 'the shared plant must travel with the run');
  assert.deepEqual(statuses, ['running']);
  worker.onmessage({ data: { type: 'status', status: 'ready' } });
  worker.onmessage({
    data: { type: 'result', runId: message.runId, stdout: '1\n', stderr: '', runtimeError: false, timedOut: false },
  });
  const result = await promise;
  assert.equal(result.stdout, '1\n');
  assert.equal(result.stderr, '');
  assert.equal(result.ok, true);
  assert.equal(statuses.at(-1), 'ready');
});

await checkAsync('a runtime error resolves with its stderr and no stdout', async () => {
  useFakeWorkers();
  const runner = createScratchRunner(() => {});
  const { promise, worker, message } = startRun(runner, 'raise ValueError("boom")\n');
  worker.onmessage({
    data: {
      type: 'result',
      runId: message.runId,
      stdout: '',
      stderr: 'Traceback (most recent call last):\nValueError: boom',
      runtimeError: true,
      timedOut: false,
    },
  });
  const result = await promise;
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /ValueError: boom/);
  assert.equal(result.ok, false);
});

await checkAsync('Stop terminates the worker and resolves as a stop', async () => {
  useFakeWorkers();
  const statuses = [];
  const runner = createScratchRunner((status) => statuses.push(status));
  const { promise, worker } = startRun(runner, 'import time\ntime.sleep(40)\n');
  runner.stop();
  const result = await promise;
  assert.equal(worker.terminated, true, 'Stop must terminate the worker');
  assert.equal(result.ok, false);
  assert.equal(result.stopped, true);
  assert.match(result.stderr, /^Stopped\./);
  assert.equal(statuses.at(-1), 'idle');
});

await checkAsync('a worker error resolves with the error sentence', async () => {
  useFakeWorkers();
  const statuses = [];
  const runner = createScratchRunner((status) => statuses.push(status));
  const { promise, message } = startRun(runner, 'print(1)\n');
  FakeWorker.instances.at(-1).onmessage({
    data: { type: 'error', runId: message.runId, error: 'worker exploded' },
  });
  const result = await promise;
  assert.equal(result.ok, false);
  assert.equal(result.stderr, 'worker exploded');
  assert.equal(statuses.at(-1), 'error');
});

await checkAsync('a refused load is discarded, and the next Run builds a fresh worker', async () => {
  useFakeWorkers();
  const runner = createScratchRunner(() => {});
  const first = startRun(runner, 'print(1)\n');
  first.worker.onmessage({ data: { type: 'status', status: 'error' } });
  const failed = await first.promise;
  assert.match(failed.stderr, /could not load/);
  assert.equal(first.worker.terminated, true, 'a worker that could not load must not be reused');

  const second = startRun(runner, 'print(2)\n');
  assert.equal(FakeWorker.instances.length, 2, 'the retry must be a new worker');
  second.worker.onmessage({
    data: { type: 'result', runId: second.message.runId, stdout: '2\n', stderr: '', runtimeError: false, timedOut: false },
  });
  const recovered = await second.promise;
  assert.equal(recovered.stdout, '2\n');
  assert.equal(recovered.ok, true);
});

await checkAsync(`the ${SCRATCH_KILL_MS / 1000} s page kill terminates and resolves as a timeout`, async () => {
  useFakeWorkers();
  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  let armed = null;
  globalThis.setTimeout = (fn, ms) => {
    armed = { fn, ms };
    return 1;
  };
  globalThis.clearTimeout = () => {
    armed = null;
  };
  try {
    const statuses = [];
    const runner = createScratchRunner((status) => statuses.push(status));
    const { promise, worker } = startRun(runner, 'import time\ntime.sleep(40)\n');
    assert.ok(armed, 'a run must arm the page watchdog');
    assert.equal(armed.ms, SCRATCH_KILL_MS);
    armed.fn();
    const result = await promise;
    assert.equal(worker.terminated, true);
    assert.equal(result.timedOut, true);
    assert.equal(result.ok, false);
    assert.match(result.stderr, /Stopped after 30 s/);
    assert.equal(statuses.at(-1), 'idle');
  } finally {
    globalThis.setTimeout = realSetTimeout;
    globalThis.clearTimeout = realClearTimeout;
  }
});

await checkAsync('a browser that refuses a worker reports a failed start, not a hung run', async () => {
  globalThis.Worker = class {
    constructor() {
      throw new Error('SecurityError: worker-src is blocked');
    }
  };
  try {
    const statuses = [];
    const runner = createScratchRunner((status) => statuses.push(status));
    const result = await runner.run('print(1)\n');
    assert.equal(result.ok, false);
    assert.match(result.stderr, /could not start/);
    assert.equal(statuses.at(-1), 'error', 'the status line must stop promising a run');
  } finally {
    restoreWorker();
  }
});

await checkAsync('dispose terminates, and a later run does not reuse the closed worker', async () => {
  useFakeWorkers();
  const runner = createScratchRunner(() => {});
  const first = startRun(runner, 'print(1)\n');
  runner.dispose();
  assert.equal(first.worker.terminated, true);
  const second = startRun(runner, 'print(2)\n');
  assert.equal(FakeWorker.instances.length, 2);
  second.worker.onmessage({
    data: { type: 'result', runId: second.message.runId, stdout: '2\n', stderr: '', runtimeError: false, timedOut: false },
  });
  assert.equal((await second.promise).stdout, '2\n');
  restoreWorker();
});

restoreWorker();

console.log(`\nstudio: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
