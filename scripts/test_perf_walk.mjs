#!/usr/bin/env node
/**
 * The perf walk's judgement, and the page it writes into (`scripts/test_perf_walk.mjs`,
 * `npm run test:perf:unit`).
 *
 * `perf_walk.mjs` drives a browser, and a suite that can only run the walk cannot say whether the
 * walk *judges* correctly — a run that fits its ceilings passes either way. So the two decisions are
 * pinned here with invented numbers, and then read back off the real files:
 *
 *   - under a ceiling, exactly at it, and one millisecond over (the boundary is where a ceiling is
 *     usually wrong by one);
 *   - a moment the run did not measure, and a budget that does not name one: both are failures,
 *     because a gate that skips what it could not measure is a gate that passes by omission;
 *   - the row the walk writes, and the doc it writes into: `--record` must be able to replace its own
 *     row without writing a second one that contradicts it.
 *
 * Then the files themselves: this page and [`docs/PERF.md`](../docs/PERF.md) have to agree with
 * `MOMENTS` and [`docs/perf-budget.json`](perf-budget.json) — a renamed moment, a column added to one
 * and not the other, or a recorded number above its own ceiling all fail here. That is the part CI
 * runs, and it is why the doc is a gate rather than a note.
 *
 * Run: node scripts/test_perf_walk.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MOMENTS,
  PROFILES,
  compareToBudget,
  formatRow,
  headerRow,
  machineDescription,
  nextLessonId,
  parseRows,
  separatorRow,
  upsertRow,
} from './perf_walk.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DOC_FILE = path.join(ROOT, 'docs', 'PERF.md');
const BUDGET_FILE = path.join(ROOT, 'docs', 'perf-budget.json');
const PACKAGE_FILE = path.join(ROOT, 'package.json');

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

/** A run shaped the way `measureProfile` returns one, with every moment filled in. */
function runOf(moments, overrides = {}) {
  return {
    date: '2026-10-24',
    machine: 'Test CPU · darwin 27.0.0 · 8 GB · Node v22',
    profile: 'laptop',
    moments: Object.fromEntries(MOMENTS.map((moment) => [moment.id, moments[moment.id] ?? 100])),
    ...overrides,
  };
}

const budget = {
  profiles: {
    laptop: { ceiling_ms: Object.fromEntries(MOMENTS.map((moment) => [moment.id, 1000])) },
    phone: { ceiling_ms: Object.fromEntries(MOMENTS.map((moment) => [moment.id, 5000])) },
  },
};

console.log('perf walk');

check('six moments, in visit order, with distinct ids', () => {
  assert.equal(MOMENTS.length, 6, 'the plan names six moments');
  assert.equal(new Set(MOMENTS.map((moment) => moment.id)).size, 6, 'ids must be unique');
  for (const moment of MOMENTS) {
    assert.ok(moment.header && moment.label && moment.describes, `${moment.id} is missing a field`);
  }
});

check('the two profiles differ in what they throttle', () => {
  assert.deepEqual(Object.keys(PROFILES).sort(), ['laptop', 'phone']);
  assert.equal(PROFILES.laptop.cpuSlowdown, 1, 'the laptop profile is unthrottled');
  assert.equal(PROFILES.laptop.network, null, 'the laptop profile uses the machine’s own network');
  assert.ok(PROFILES.phone.cpuSlowdown > 1, 'the phone profile has to slow the CPU');
  assert.equal(
    PROFILES.phone.network.downloadBytesPerSecond,
    200_000,
    '1.6 Mbit/s is 200 000 bytes per second'
  );
});

check('a run under its ceilings passes', () => {
  const { overruns, missing } = compareToBudget(runOf({}), budget);
  assert.deepEqual(overruns, []);
  assert.deepEqual(missing, []);
});

check('exactly at the ceiling passes, one millisecond over fails', () => {
  const at = runOf({ warm_run: 1000 });
  assert.deepEqual(compareToBudget(at, budget).overruns, [], 'the ceiling is inclusive');
  const over = runOf({ warm_run: 1001 });
  const { overruns } = compareToBudget(over, budget);
  assert.equal(overruns.length, 1);
  assert.deepEqual(overruns[0], { id: 'warm_run', measured: 1001, ceiling: 1000 });
});

check('a ceiling is read per profile, not shared', () => {
  const phoneRun = runOf({}, { profile: 'phone' });
  phoneRun.moments.warm_run = 4000;
  assert.deepEqual(compareToBudget(phoneRun, budget).overruns, [], 'the phone ceiling is 5000 ms');
  const laptopRun = runOf({ warm_run: 4000 });
  assert.equal(compareToBudget(laptopRun, budget).overruns.length, 1, 'the laptop ceiling is 1000 ms');
});

check('a moment that was not measured is a failure, not a pass', () => {
  const run = runOf({});
  delete run.moments.first_run;
  const { missing } = compareToBudget(run, budget);
  assert.deepEqual(missing, ['first_run']);
});

check('a budget that does not name a moment is a failure too', () => {
  const short = {
    profiles: { laptop: { ceiling_ms: { nav_to_lesson: 1000 } }, phone: budget.profiles.phone },
  };
  const { missing, overruns } = compareToBudget(runOf({}), short);
  assert.ok(missing.includes('warm_run'), 'an unnamed moment would otherwise pass by omission');
  assert.deepEqual(overruns, []);
});

check('a row is the date, the machine, the profile and six numbers', () => {
  const row = formatRow(runOf(Object.fromEntries(MOMENTS.map((moment, index) => [moment.id, 100 + index]))));
  const cells = row.slice(1, -1).split('|').map((cell) => cell.trim());
  assert.equal(cells.length, MOMENTS.length + 3);
  assert.deepEqual(cells.slice(0, 3), ['2026-10-24', 'Test CPU · darwin 27.0.0 · 8 GB · Node v22', 'laptop']);
  assert.deepEqual(cells.slice(3), ['100', '101', '102', '103', '104', '105']);
  assert.equal(
    parseRows(formatRow(runOf({ warm_run: 12.6 })))[0].moments.warm_run,
    13,
    'rows are rounded to whole milliseconds'
  );
});

check('an unmeasured moment is a dash in the row, never a zero', () => {
  const run = runOf({});
  delete run.moments.reload_restore;
  assert.match(formatRow(run), /\| — \|$/, 'a missing number must not read as 0 ms');
});

check('the row can be read back, and a header cannot', () => {
  const row = formatRow(runOf({}));
  assert.deepEqual(parseRows(row)[0].moments.first_run, 100);
  assert.equal(parseRows(headerRow()).length, 0, 'the header is not a data row');
  assert.equal(parseRows(separatorRow()).length, 0, 'nor is the :--- line');
});

check('--record replaces its own row instead of adding a second one', () => {
  const doc = [headerRow(), separatorRow(), formatRow(runOf({ warm_run: 900 }))].join('\n');
  const updated = upsertRow(doc, runOf({ warm_run: 120 }));
  const rows = parseRows(updated);
  assert.equal(rows.length, 1, 'the same date, machine and profile must not appear twice');
  assert.equal(rows[0].moments.warm_run, 120);
});

check('a new row is appended after the last one, and a row from another machine is a new row', () => {
  const doc = [headerRow(), separatorRow(), formatRow(runOf({}))].join('\n');
  const second = upsertRow(doc, runOf({}, { profile: 'phone' }));
  assert.equal(parseRows(second).length, 2);
  assert.equal(parseRows(second)[1].profile, 'phone', 'a new row goes last');
  const other = upsertRow(second, runOf({}, { machine: 'Another CPU' }));
  assert.equal(parseRows(other).length, 3, 'one row per date, machine and profile');
  assert.equal(parseRows(other)[0].date, '2026-10-24', 'the history keeps its order');
});

check('a doc with no table is refused, not silently appended to', () => {
  assert.throws(() => upsertRow('# a page with no table\n', runOf({})), /no table/);
});

check('the next lesson is the one after this, wrapping at the end', () => {
  assert.equal(nextLessonId(['P.1', 'P.2', 'P.3'], 'P.1'), 'P.2');
  assert.equal(nextLessonId(['P.1', 'P.2', 'P.3'], 'P.3'), 'P.1');
  assert.equal(nextLessonId(['P.1', 'P.2'], 'not-in-the-list'), 'P.1');
  assert.throws(() => nextLessonId(['P.1'], 'P.1'), /fewer than two/);
});

check('the machine description names the CPU, the OS and the Node that ran the walk', () => {
  const described = machineDescription();
  assert.ok(described.length > 10, described);
  assert.match(described, /Node v\d+/, 'a row has to name the runtime that produced it');
  assert.ok(!described.includes('|'), 'a table cell cannot carry a pipe');
});

// ---- the files this repository actually ships -------------------------------------------------

const doc = fs.readFileSync(DOC_FILE, 'utf8');
const shippedBudget = JSON.parse(fs.readFileSync(BUDGET_FILE, 'utf8'));
const packageJson = JSON.parse(fs.readFileSync(PACKAGE_FILE, 'utf8'));

check('docs/PERF.md carries the table the walk writes into', () => {
  const lines = doc.split('\n').map((line) => line.trim());
  assert.ok(lines.includes(headerRow()), `docs/PERF.md is missing the header line:\n${headerRow()}`);
  assert.ok(lines.includes(separatorRow()), 'docs/PERF.md is missing the :--- line under the header');
});

check('the budget names every moment for every profile', () => {
  for (const id of Object.keys(PROFILES)) {
    const block = shippedBudget.profiles?.[id];
    assert.ok(block, `perf-budget.json has no ${id} block`);
    for (const moment of MOMENTS) {
      assert.equal(
        typeof block.ceiling_ms?.[moment.id],
        'number',
        `perf-budget.json has no ${id}/${moment.id} ceiling`
      );
    }
  }
  for (const id of Object.keys(shippedBudget.profiles)) {
    assert.ok(PROFILES[id], `perf-budget.json names a profile the walk does not measure: ${id}`);
  }
});

check('no recorded number is above its own ceiling', () => {
  const rows = parseRows(doc);
  for (const row of rows) {
    const ceilings = shippedBudget.profiles[row.profile]?.ceiling_ms ?? {};
    for (const moment of MOMENTS) {
      const measured = row.moments[moment.id];
      const ceiling = ceilings[moment.id];
      assert.ok(
        measured === null || (Number.isFinite(ceiling) && measured <= ceiling),
        `${row.date} ${row.profile}/${moment.id}: ${measured} ms is over its ${ceiling} ms ceiling — ` +
          're-record with --record and say in docs/PERF.md why the number moved'
      );
    }
  }
});

check('every recorded row names a profile the walk runs', () => {
  for (const row of parseRows(doc)) {
    assert.ok(PROFILES[row.profile], `${row.date}: unknown profile "${row.profile}"`);
    assert.ok(row.machine.length > 5, `${row.date}: a row without a machine is not a measurement`);
  }
});

check('the doc prints the ceilings the budget holds', () => {
  for (const [id, block] of Object.entries(shippedBudget.profiles)) {
    for (const moment of MOMENTS) {
      const ceiling = block.ceiling_ms[moment.id];
      const printed = ceiling.toLocaleString('en-US').replace(/,/g, ' ');
      assert.ok(
        doc.includes(`| ${ceiling} ms |`) || doc.includes(`| ${printed} ms |`),
        `docs/PERF.md does not print the ${id}/${moment.id} ceiling (${ceiling} ms)`
      );
    }
  }
});

check('the page names the command CI runs', () => {
  for (const script of ['test:perf', 'test:perf:unit']) {
    assert.ok(packageJson.scripts[script], `package.json has no ${script} script`);
    assert.ok(doc.includes(`npm run ${script}`), `docs/PERF.md never names npm run ${script}`);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
