#!/usr/bin/env node
/**
 * The weight budget's rules (`scripts/test_weight_budget.mjs`, `npm run test:weight`).
 *
 * `check_weight_budget.mjs` measures a real `dist/`; the judgement it applies is
 * [`weight_budget.mjs`](weight_budget.mjs), and a suite that only ever runs it against a build that
 * fits cannot tell a gate from a green light. So each direction is pinned here with invented numbers:
 *
 *   - under budget, exactly at it, and one byte over it (the boundary is where a gate is usually
 *     wrong by one);
 *   - a budget with nothing measured behind it — the direction that matters most, because a metric
 *     the build stopped emitting would otherwise pass forever;
 *   - the tightest metric, which is the number the report quotes;
 *   - the measurement itself: what counts as js, css, a font, and the largest single chunk.
 *
 * Run: node scripts/test_weight_budget.mjs
 */

import assert from 'node:assert/strict';
import {
  METRICS,
  budgetsFor,
  buildVariant,
  compareBudgets,
  formatBytes,
  formatHeadroom,
  formatUsed,
  isMusicFile,
  measurementFrom,
  shapeToBuild,
  signedInEnv,
  staleSources,
} from './weight_budget.mjs';
import { MUSIC_TAPES } from '../app/src/audio/musicCatalogue.ts';

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

const budget = {
  entry_gzip: 950,
  js_gzip: 1000,
  css_gzip: 100,
  fonts: 500,
  largest_js_gzip: 800,
  prose_gzip: 300,
  reader_gzip: 400,
  audio: 500,
  music: 600,
  total: 2000,
};
const fits = {
  entry_gzip: 900,
  js_gzip: 900,
  css_gzip: 90,
  fonts: 450,
  largest_js_gzip: 700,
  prose_gzip: 250,
  reader_gzip: 350,
  audio: 400,
  music: 300,
  total: 1800,
};

console.log('weight budget');

check('a bundle under every budget passes', () => {
  const report = compareBudgets(fits, budget);
  assert.equal(report.breaches.length, 0);
  assert.equal(report.unmeasured.length, 0);
  assert.equal(report.rows.length, METRICS.length, 'every metric must be compared, not only the small ones');
});

check('spending the budget exactly is not a breach', () => {
  const report = compareBudgets(budget, budget);
  assert.equal(report.breaches.length, 0, 'a metric at its ceiling is within it');
  assert.equal(report.rows.find((row) => row.metric === 'total').headroom, 0);
});

check('one byte over is a breach, and it names the metric', () => {
  const report = compareBudgets({ ...fits, js_gzip: 1001 }, budget);
  assert.deepEqual(
    report.breaches.map((row) => row.metric),
    ['js_gzip'],
    'expected exactly the metric that went over'
  );
  assert.equal(report.breaches[0].headroom, -1, 'expected the breach to carry the overshoot');
});

check('a budget with no measurement fails, so a vanished metric cannot pass', () => {
  const measured = { ...fits };
  delete measured.largest_js_gzip;
  const report = compareBudgets(measured, budget);
  assert.deepEqual(
    report.unmeasured.map((row) => row.metric),
    ['largest_js_gzip'],
    'expected the missing metric to be reported as unmeasured, not as within'
  );
  assert.equal(report.breaches.length, 0, 'an unmeasured metric is its own problem, not a breach');
});

check('the tightest metric is the one with the least room left', () => {
  const report = compareBudgets({ ...fits, css_gzip: 99 }, budget);
  assert.equal(report.tightest.metric, 'css_gzip', 'expected the metric 1 byte from its ceiling');
  assert.equal(report.tightest.headroom, 1);
});

check('no measurement at all reports every metric as unmeasured, never as passing', () => {
  const report = compareBudgets({}, budget);
  assert.equal(report.unmeasured.length, METRICS.length);
  assert.equal(report.tightest, null, 'a report with nothing measured cannot name a tightest metric');
});

check('a metric that is not in the budget list is ignored rather than invented', () => {
  const report = compareBudgets({ ...fits, pyodide_wasm: 9_000_000 }, budget);
  assert.equal(report.rows.some((row) => row.metric === 'pyodide_wasm'), false);
  assert.equal(report.breaches.length, 0, 'the runtime the worker fetches is not in the shell budget');
});

console.log('\nbuild staleness');

// Run 165 quoted a weight that was measured against a `dist/` from before the features under test.
// A build older than its own sources is the one state that makes every budget a lie, so the rule has
// its own checks rather than being a line nobody exercises.
const SRC = (over) => ({
  path: 'app/src/main.tsx',
  mtimeMs: 1_000,
  ...over,
});
const OUT = (over) => ({ path: 'dist/assets/index-abc.js', mtimeMs: 2_000, ...over });

check('a build newer than every source is fresh', () => {
  assert.deepEqual(staleSources([SRC()], [OUT()]), []);
  assert.deepEqual(
    staleSources([SRC({ mtimeMs: 1_999 }), SRC({ path: 'app/index.html' })], [OUT()]),
    [],
    'nothing newer than the build is a fresh build'
  );
});

check('a source newer than the build makes it stale, and the newest is named first', () => {
  const stale = staleSources(
    [SRC({ path: 'app/src/watchMode.ts', mtimeMs: 3_000 }), SRC({ mtimeMs: 5_000 }), SRC({ mtimeMs: 1_500 })],
    [OUT()]
  );
  assert.deepEqual(
    stale.map((file) => file.path),
    ['app/src/main.tsx', 'app/src/watchMode.ts'],
    'expected exactly the sources the build predates, newest first'
  );
});

check('the newest output is the build; one fresh asset covers the rest', () => {
  const outputs = [OUT({ path: 'dist/index.html', mtimeMs: 2_000 }), OUT({ mtimeMs: 4_000 }) ]; 
  assert.deepEqual(
    staleSources([SRC({ mtimeMs: 3_000 })], outputs),
    [],
    'a copy written late in the build is still the build'
  );
});

check('an equal timestamp is fresh: a one-second filesystem must not flake', () => {
  assert.deepEqual(staleSources([SRC({ mtimeMs: 2_000 })], [OUT({ mtimeMs: 2_000 })]), []);
});

check('nothing built at all reads every source as stale', () => {
  assert.equal(staleSources([SRC(), SRC({ path: 'app/index.html' })], []).length, 2);
});

check('no sources (a bare checkout) is not a staleness failure', () => {
  assert.deepEqual(staleSources([], [OUT()]), []);
});

console.log('\nthe two shapes');

// Run 226: a local gate measured `dist/`, which is always local-only on a clone, so a signed-in-only
// breach could only ever surface in CI. The gate now builds the shipped shape beside it, and both
// halves of that decision are pinned here.
check('a local-only build leaves the signed-in shape to grade; a signed-in one is already it', () => {
  assert.equal(shapeToBuild('local_only'), 'signed_in');
  assert.equal(shapeToBuild('signed_in'), null, 'the build on disk is the shape that ships');
});

check('the signed-in build gets both variables from the process environment', () => {
  const env = signedInEnv({ PATH: '/usr/bin', VITE_SUPABASE_URL: 'https://real.example' });
  assert.equal(env.VITE_SUPABASE_URL, 'https://placeholder.invalid', 'the process env is what is measured');
  assert.ok(env.VITE_SUPABASE_ANON_KEY, 'expected a placeholder key so the library is really emitted');
  assert.equal(env.PATH, '/usr/bin', 'expected the rest of the environment to survive');
});

console.log('\nweight measurement');

const FILES = [
  { name: 'assets/index-abc.js', size: 3000, gzip: 900 },
  { name: 'assets/vendor-def.js', size: 1000, gzip: 400 },
  { name: 'assets/TabBode-ghi.js', size: 100, gzip: 30 },
  { name: 'assets/index-abc.css', size: 200, gzip: 90 },
  { name: 'assets/inter-latin.woff2', size: 450, gzip: 450 },
  // The room's loop: already compressed, so its own bytes are the number (a gzip of AAC is a few
  // bytes smaller and would under-report what a visit costs by hiding an incompressible file).
  { name: 'assets/rain-loop-abc.m4a', size: 400, gzip: 400 },
  // One of the tapes, at its emitted name: same treatment, and its own metric, so a track cannot hide
  // in the room's.
  { name: 'assets/lab-night-def.m4a', size: 300, gzip: 300 },
  { name: 'index.html', size: 500, gzip: 60 },
];

check('js, css, fonts and the largest chunk are measured from the files', () => {
  const measurement = measurementFrom(FILES);
  assert.equal(measurement.js_gzip, 1330, 'expected every .js summed, the lazy chunks included');
  assert.equal(measurement.css_gzip, 90);
  assert.equal(measurement.fonts, 450, 'expected the font counted at its own size, not gzipped twice');
  assert.equal(measurement.largest_js_gzip, 900, 'expected the biggest chunk, not the sum');
  assert.equal(measurement.audio, 400, 'expected the room counted at its own size, and only the room');
  assert.equal(measurement.music, 300, 'expected the bed counted on its own, not folded into the room');
  assert.equal(measurement.total, 2630, 'expected everything measured to be in the total, media included');
});

check('a build with no recorded room is unmeasured, not free', () => {
  const silent = measurementFrom([{ name: 'assets/index-abc.js', size: 3000, gzip: 900 }]);
  assert.equal(Number.isNaN(silent.audio), true, 'removing the loop must fail the gate, not shrink it');
  assert.equal(Number.isNaN(silent.music), true, 'and a build with no beds must not read as zero music');
});

check('the tapes are counted apart from the room, both in total', () => {
  const musicOnly = measurementFrom([{ name: 'assets/focus-current-xyz.m4a', size: 250, gzip: 250 }]);
  assert.equal(Number.isNaN(musicOnly.audio), true, 'a tape is not room tone');
  assert.equal(musicOnly.music, 250);
  assert.equal(musicOnly.total, 250);
});

check('every catalogue tape is recognised, under hashed and unhashed names', () => {
  for (const tape of MUSIC_TAPES) {
    assert.equal(isMusicFile(`assets/${tape.id}-B1c2D3e4.m4a`), true, `${tape.id} must be measured as music`);
    assert.equal(isMusicFile(`assets/music/${tape.id}.m4a`), true, `${tape.id} must be music by source name too`);
  }
  // And nothing that merely starts with a tape id's letters.
  assert.equal(isMusicFile('assets/lab-nightshift-abc.m4a'), false);
  assert.equal(isMusicFile('assets/rain-loop-abc.m4a'), false);
  assert.equal(isMusicFile('assets/index-abc.js'), false);
});

// The split's own metric: the document plus what it names is a first paint, and a chunk nobody opens
// is still emitted — so `entry_gzip` falls when tabs become lazy while `total` does not.
check('the entry is the document plus the files it names, not the whole bundle', () => {
  const measurement = measurementFrom(FILES, [
    'index.html',
    'assets/index-abc.js',
    'assets/index-abc.css',
  ]);
  assert.equal(measurement.entry_gzip, 1050, 'expected html + entry script + its stylesheet');
  assert.ok(
    measurement.entry_gzip < measurement.total,
    'expected the lazy chunk (30 B) and the font (450 B) to sit outside the entry'
  );
});

check('an entry naming a file the build did not emit is unmeasured, not free', () => {
  const measurement = measurementFrom(
    FILES,
    ['index.html', 'assets/gone-xyz.js'],
    { name: 'prose-index.json', gzip: 250 },
    { gzip: 300 }
  );
  assert.equal(
    Number.isNaN(measurement.entry_gzip),
    true,
    'expected a stale name in index.html to read as unmeasured rather than as a smaller entry'
  );
  assert.deepEqual(
    compareBudgets(measurement, budget).unmeasured.map((row) => row.metric),
    ['entry_gzip'],
    'expected the gate to fail on the budget, not to measure half an entry'
  );
});

check('a document that names nothing is unmeasured, not an empty first paint', () => {
  assert.equal(Number.isNaN(measurementFrom(FILES).entry_gzip), true);
});

// The prose index is a file a search fetches, not a file a visit downloads: its budget moves on its
// own, and `total` (what the shell costs) does not know about it.
check('the prose index is measured on its own, never folded into the shell total', () => {
  const shell = measurementFrom(FILES, ['index.html', 'assets/index-abc.js']);
  assert.equal(Number.isNaN(shell.prose_gzip), true, 'no file is unmeasured, not zero bytes');
  const withProse = measurementFrom(FILES, [], { name: 'prose-index.json', size: 5000, gzip: 1200 });
  assert.equal(withProse.prose_gzip, 1200);
  assert.equal(withProse.total, shell.total, 'a file fetched by a search must not move the shell total');
  assert.deepEqual(
    compareBudgets(shell, budget).unmeasured.map((row) => row.metric),
    ['prose_gzip', 'reader_gzip'],
    'a missing prose index and a missing reader must fail the gate rather than pass as weight nothing measured'
  );
});

// The reader's pages are fetched one at a time, so the ceiling is on the whole course and the shell
// total must not move when a page is added.
check('the reader payloads are summed on their own, never folded into the shell total', () => {
  const shell = measurementFrom(FILES, ['index.html', 'assets/index-abc.js']);
  assert.equal(Number.isNaN(shell.reader_gzip), true, 'no payloads is unmeasured, not zero bytes');
  const withReader = measurementFrom(FILES, [], null, { gzip: 640, pages: 92 });
  assert.equal(withReader.reader_gzip, 640);
  assert.equal(withReader.total, shell.total, 'a page fetched by the reader must not move the shell total');
  const withProse = measurementFrom(FILES, [], { name: 'prose-index.json', gzip: 1200 }, { gzip: 640 });
  assert.equal(withProse.prose_gzip, 1200, 'the two fetched-on-demand stores are separate numbers');
  assert.equal(withProse.reader_gzip, 640);
});

check('a bundle with no js does not invent a largest chunk', () => {
  const measurement = measurementFrom([{ name: 'assets/index.css', size: 200, gzip: 90 }]);
  assert.equal(measurement.largest_js_gzip, 0);
  assert.equal(measurement.total, 90);
});

check('sizes read as sizes, and headroom as a signed share', () => {
  assert.equal(formatBytes(456), '456 B');
  assert.equal(formatBytes(45_678), '45.7 kB');
  assert.equal(formatBytes(1_234_567), '1.23 MB');
  assert.equal(formatHeadroom(1040, 1000), '+4%');
  assert.equal(formatHeadroom(960, 1000), '-4%');
  assert.equal(formatUsed(920, 1000), '92%');
  assert.equal(formatUsed(1100, 1000), '110%');
});

check('a build without the account library is local-only, and one with it is signed in', () => {
  const local = [{ name: 'assets/vendor-react-a.js', size: 90_000, gzip: 30_000 }];
  // Both builds emit a `vendor-auth` chunk; without the variables it is the one-byte stub Rollup
  // leaves behind, and that must not read as a signed-in build.
  const stub = [...local, { name: 'assets/vendor-auth-l0sNRNKZ.js', size: 1, gzip: 21 }];
  const signed = [...local, { name: 'assets/vendor-auth-C6l3xeXS.js', size: 205_000, gzip: 57_798 }];
  assert.equal(buildVariant(local), 'local_only');
  assert.equal(buildVariant(stub), 'local_only');
  assert.equal(buildVariant(signed), 'signed_in');
  // The app chunk's own name must not be mistaken for the library's chunk.
  assert.equal(buildVariant([{ name: 'assets/TabPyodideRunner-abc.js', size: 400_000, gzip: 90 }]), 'local_only');
});

check('the signed-in shape gets its own ceilings, overlaid on the base ones', () => {
  const file = {
    budgets: { entry_gzip: 480, js_gzip: 750, total: 1080 },
    signed_in: { budgets: { js_gzip: 810, total: 1140 } },
  };
  assert.deepEqual(budgetsFor(file), { entry_gzip: 480, js_gzip: 750, total: 1080 });
  assert.deepEqual(budgetsFor(file, 'signed_in'), { entry_gzip: 480, js_gzip: 810, total: 1140 });
  // A shape with no block of its own keeps the base set: an unknown variant cannot pass by being
  // unbudgeted, and it cannot silently lose a ceiling either.
  assert.deepEqual(budgetsFor({ budgets: { js_gzip: 750 } }, 'signed_in'), { js_gzip: 750 });
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
