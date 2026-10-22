#!/usr/bin/env node
/**
 * The paint reading (`scripts/test_paint_timing.mjs`, `npm run test:paint`).
 *
 * `app/src/paintTiming.ts` records four moments per visit. What a unit suite can pin is everything
 * except the browser's own timings:
 *
 *  - the store keeps one sample per navigation, newest first, and never more than the cap;
 *  - the newest flush of a visit wins, because a later flush knows more (an `lcp` that grew);
 *  - a store written by another build, or a truncated one, reads as the samples it can prove;
 *  - the summary is medians of what was reported, and a metric nobody reported is absent rather than
 *    zero — a `0 ms` paint would be a lie a budget could be built on;
 *  - the export carries the reading, and flushing it first means an export made before the timer got
 *    to run still carries this visit.
 *
 * The browser half (`startPaintTiming`, the observers) is exercised in Chromium by
 * `scripts/e2e_browser_workbench.mjs`; in Node it must be inert, which is one of the checks here.
 *
 * Run: node --experimental-strip-types scripts/test_paint_timing.mjs
 */

import assert from 'node:assert/strict';

/** The bucket a store falls back to in Node (`bulkStorage.ts` has no IndexedDB here). */
class FakeBucket {
  #data = new Map();
  get length() {
    return this.#data.size;
  }
  key(index) {
    return [...this.#data.keys()][index] ?? null;
  }
  getItem(key) {
    return this.#data.has(key) ? this.#data.get(key) : null;
  }
  setItem(key, value) {
    this.#data.set(key, String(value));
  }
  removeItem(key) {
    this.#data.delete(key);
  }
  clear() {
    this.#data.clear();
  }
}

globalThis.localStorage = new FakeBucket();

const paint = await import('../app/src/paintTiming.ts');
const log = await import('../app/src/learningLog.ts');

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

const sample = (nav, extra = {}) => ({ nav, ...extra });

console.log('paint: the store');

check('nothing recorded reads as no samples', () => {
  assert.deepEqual(paint.readPaintSamples(), []);
});

check('a sample comes back with the metrics it carried', () => {
  paint.recordPaintSample(sample(1000, { fcp: 320, editor: 900 }));
  assert.deepEqual(paint.readPaintSamples(), [{ nav: 1000, fcp: 320, editor: 900 }]);
});

check('the newest visit is first', () => {
  paint.clearPaintSamples();
  paint.recordPaintSample(sample(1000, { fcp: 300 }));
  paint.recordPaintSample(sample(2000, { fcp: 200 }));
  assert.deepEqual(
    paint.readPaintSamples().map((entry) => entry.nav),
    [2000, 1000]
  );
});

check('a second flush of the same visit replaces it instead of adding a row', () => {
  paint.clearPaintSamples();
  paint.recordPaintSample(sample(1000, { fcp: 300, lcp: 700 }));
  paint.recordPaintSample(sample(1000, { fcp: 300, lcp: 1100, editor: 1200 }));
  const samples = paint.readPaintSamples();
  assert.equal(samples.length, 1, 'one navigation is one sample');
  assert.equal(samples[0].lcp, 1100, 'the later flush wins');
  assert.equal(samples[0].editor, 1200);
});

check(`the store stops at ${paint.MAX_PAINT_SAMPLES} visits`, () => {
  paint.clearPaintSamples();
  for (let index = 0; index < paint.MAX_PAINT_SAMPLES + 10; index += 1) {
    paint.recordPaintSample(sample(1000 + index, { fcp: 200 }));
  }
  const samples = paint.readPaintSamples();
  assert.equal(samples.length, paint.MAX_PAINT_SAMPLES);
  assert.equal(samples[0].nav, 1000 + paint.MAX_PAINT_SAMPLES + 9, 'the oldest are the ones dropped');
});

check('a store another build wrote reads as the samples it can prove', () => {
  paint.clearPaintSamples();
  localStorage.setItem(paint.PAINT_KEY, '{not json');
  assert.deepEqual(paint.readPaintSamples(), []);

  localStorage.setItem(
    paint.PAINT_KEY,
    JSON.stringify([
      { fcp: 300 }, // no navigation: not a sample
      { nav: 5, fcp: -1, lcp: 'fast', editor: 900 }, // only the number that can be true survives
      { nav: 6, run: 1200 },
    ])
  );
  assert.deepEqual(paint.readPaintSamples(), [
    { nav: 6, run: 1200 },
    { nav: 5, editor: 900 },
  ]);
});

check('a bucket that refuses to be written does not throw', () => {
  const original = globalThis.localStorage;
  globalThis.localStorage = {
    get length() {
      return 0;
    },
    key: () => null,
    getItem: () => null,
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
    removeItem: () => {},
    clear: () => {},
  };
  try {
    assert.doesNotThrow(() => paint.recordPaintSample(sample(1, { fcp: 100 })));
    assert.deepEqual(paint.readPaintSamples(), []);
  } finally {
    globalThis.localStorage = original;
  }
});

console.log('paint: the summary');

const summaryOf = (samples) => {
  paint.clearPaintSamples();
  for (const entry of samples) paint.recordPaintSample(entry);
  return paint.paintSummary();
};

check('an even count averages the two middle readings', () => {
  const summary = summaryOf([
    sample(1, { fcp: 200 }),
    sample(2, { fcp: 300 }),
    sample(3, { fcp: 400 }),
    sample(4, { fcp: 500 }),
  ]);
  assert.equal(summary.count, 4);
  assert.equal(summary.median.fcp, 350);
});

check('an odd count takes the middle reading', () => {
  const summary = summaryOf([sample(1, { run: 900 }), sample(2, { run: 300 }), sample(3, { run: 600 })]);
  assert.equal(summary.median.run, 600);
  assert.equal(summary.latest?.nav, 3, 'the latest sample is the newest navigation');
});

check('a metric nobody reported is absent, not zero', () => {
  const summary = summaryOf([sample(1, { fcp: 240 }), sample(2, { fcp: 260 })]);
  assert.equal(summary.median.fcp, 250);
  assert.equal('lcp' in summary.median, false);
  assert.equal('editor' in summary.median, false);
  assert.equal('run' in summary.median, false);
});

check('the summary of nothing is empty rather than a zero reading', () => {
  paint.clearPaintSamples();
  const summary = paint.paintSummary();
  assert.equal(summary.count, 0);
  assert.equal(summary.latest, null);
  assert.deepEqual(summary.median, {});
  assert.equal(paint.paintLine(summary), '');
});

console.log('paint: the line');

check('milliseconds under a second, seconds above it', () => {
  assert.equal(paint.durationLabel(0), '0 ms');
  assert.equal(paint.durationLabel(312.4), '312 ms');
  assert.equal(paint.durationLabel(999), '999 ms');
  assert.equal(paint.durationLabel(1000), '1.00 s');
  assert.equal(paint.durationLabel(1420), '1.42 s');
  assert.equal(paint.durationLabel(Number.NaN), '—');
});

check('one visit is worded as one visit, and medians only make sense over more', () => {
  const one = summaryOf([sample(1, { fcp: 300, run: 800 })]);
  assert.equal(paint.paintLine(one), 'Startup (1 visit): first paint 300 ms · Run ready 800 ms');

  const two = summaryOf([sample(1, { fcp: 300 }), sample(2, { fcp: 400 })]);
  assert.equal(paint.paintLine(two), 'Startup (2 visits, medians): first paint 350 ms');
});

check('the line names the metrics in the order they happen', () => {
  const summary = summaryOf([sample(1, { run: 1400, editor: 1300, lcp: 900, fcp: 400 })]);
  assert.equal(
    paint.paintLine(summary),
    'Startup (1 visit): first paint 400 ms · largest paint 900 ms · editor 1.30 s · Run ready 1.40 s'
  );
});

console.log('paint: inert in Node, and carried by the export');

check('the browser half does nothing without a window', () => {
  paint.startPaintTiming();
  paint.markPaintReady('editor');
  assert.equal(paint.currentPaintSample(), null);
  assert.doesNotThrow(() => paint.stopPaintTiming());
});

check('the learning-log export carries the samples and their summary', () => {
  paint.clearPaintSamples();
  paint.recordPaintSample(sample(4242, { fcp: 210, lcp: 640, editor: 950, run: 960 }));
  log.clearLearningLog();
  log.logEvent({ kind: 'lesson_open', lesson: 'P.1' });

  const exported = JSON.parse(log.learningLogJson());
  assert.equal(exported.schema, log.LOG_SCHEMA);
  assert.equal(exported.events.length, 1, 'a paint sample is not an event');
  assert.equal(exported.paint.schema, paint.PAINT_SCHEMA);
  assert.equal(exported.paint.samples.length, 1);
  assert.equal(exported.paint.samples[0].fcp, 210);
  assert.equal(exported.paint.summary.median.editor, 950);
  assert.equal(exported.paint.summary.count, 1);
});

console.log(
  failed
    ? `\n[FAIL] ${failed} of ${passed + failed} paint checks failed`
    : `[PASS] Paint timing: ${passed} checks`
);
process.exitCode = failed ? 1 : 0;
