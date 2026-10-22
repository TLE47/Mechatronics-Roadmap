#!/usr/bin/env node
/**
 * The weight gate (`scripts/check_weight_budget.mjs`, `npm run check:weight`).
 *
 * Reads the built bundle, gzips every asset that a browser downloads compressed, and compares the
 * totals against `docs/weight-budget.json`. The comparison itself is
 * [`weight_budget.mjs`](weight_budget.mjs) and is pinned by `npm run test:weight`; this file only
 * measures and reports.
 *
 * Two rules make it a gate rather than a dashboard:
 *
 * - a metric over its budget fails, and the line says by how much — a ceiling nobody breaches has no
 *   ceiling;
 * - a budget with nothing measured behind it fails too. A metric the build stopped producing (a CSS
 *   file that moved, a font that stopped being emitted) would otherwise pass forever by being absent.
 *
 * `--record` rewrites the `measured` block with today's numbers and prints what moved; the budgets
 * themselves are hand-edited, deliberately, like the accessibility allowlist.
 *
 * Usage
 *     npm run build && node scripts/check_weight_budget.mjs
 *     node scripts/check_weight_budget.mjs --json      # machine-readable, stdout only
 *     node scripts/check_weight_budget.mjs --record    # write today's measurement into the file
 *
 * Exit-code family: typed
 *     0  every metric is within its budget
 *     1  a metric is over its budget, or a budget measures nothing
 *     2  no build to measure (run `npm run build`), or a bad command line
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import {
  METRICS,
  compareBudgets,
  formatBytes,
  formatHeadroom,
  formatUsed,
  measurementFrom,
} from './weight_budget.mjs';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');
const BUDGET_FILE = path.join(ROOT, 'docs', 'weight-budget.json');

const argv = process.argv.slice(2);
const JSON_OUT = argv.includes('--json');
const RECORD = argv.includes('--record');

function log(...args) {
  (JSON_OUT ? console.error : console.log)(...args);
}

/**
 * Everything the shell actually loads, with its raw and gzipped size: `dist/assets/**` and
 * `dist/index.html`. Files at `dist/` root that no page fetches (`og.png`, the social card, 370 kB)
 * are deliberately out of scope — a budget that counts them would make the app look twice its size
 * and would move when the card is redrawn.
 */
function readAssets(dir) {
  const files = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        const buffer = fs.readFileSync(full);
        files.push({
          name: path.relative(dir, full),
          size: buffer.length,
          gzip: zlib.gzipSync(buffer, { level: 9 }).length,
        });
      }
    }
  };
  walk(path.join(dir, 'assets'));
  const html = fs.readFileSync(path.join(dir, 'index.html'));
  files.push({
    name: 'index.html',
    size: html.length,
    gzip: zlib.gzipSync(html, { level: 9 }).length,
  });
  return files;
}

function main() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    console.error('dist/index.html is missing: run `npm run build` before the weight gate');
    process.exit(2);
  }
  if (!fs.existsSync(BUDGET_FILE)) {
    console.error(`${BUDGET_FILE} is missing; the gate has nothing to compare against`);
    process.exit(2);
  }
  const budgetFile = JSON.parse(fs.readFileSync(BUDGET_FILE, 'utf8'));
  const files = readAssets(DIST);
  const measured = measurementFrom(files);
  const { rows, breaches, unmeasured, tightest } = compareBudgets(measured, budgetFile.budgets);

  if (RECORD) {
    budgetFile.measured = { ...measured, recordedAt: new Date().toISOString().slice(0, 10) };
    fs.writeFileSync(BUDGET_FILE, `${JSON.stringify(budgetFile, null, 2)}\n`);
    log(`recorded ${METRICS.map((metric) => `${metric}=${measured[metric]}`).join(' ')}`);
    for (const row of rows) {
      if (row.verdict === 'over') {
        log(`  over budget: ${row.metric} ${formatBytes(row.measured)} > ${formatBytes(row.budget)}`);
      }
    }
    return;
  }

  const biggest = [...files].sort((left, right) => right.gzip - left.gzip).slice(0, 5);

  if (JSON_OUT) {
    console.log(JSON.stringify({ measured, rows, biggest, files: files.length }, null, 2));
  } else {
    log(`The built bundle: ${files.length} files, biggest gzipped first`);
    for (const file of biggest) log(`  ${file.name.padEnd(38)} ${formatBytes(file.gzip).padStart(8)}`);
    log('');
    log('  metric              measured     budget      used');
    for (const row of rows) {
      log(
        `  ${row.metric.padEnd(18)} ${formatBytes(row.measured).padStart(9)} ` +
          `${formatBytes(row.budget).padStart(10)}   ${formatUsed(row.measured, row.budget).padStart(5)}`
      );
    }
  }

  if (breaches.length || unmeasured.length) {
    for (const row of breaches) {
      console.error(
        `[FAIL] ${row.metric} is ${formatBytes(row.measured)}, over its ${formatBytes(row.budget)} budget ` +
          `by ${formatBytes(row.measured - row.budget)} (${formatHeadroom(row.measured, row.budget)}) — ` +
          `trim it, or raise the budget in docs/weight-budget.json and say why`
      );
    }
    for (const row of unmeasured) {
      console.error(
        `[FAIL] ${row.metric} has a budget but no measurement: the build no longer produces it, ` +
          `or the metric name changed — a budget nothing measures always passes`
      );
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `[PASS] Weight: ${formatBytes(measured.total)} gzipped in ${files.length} files ` +
      `(js ${formatBytes(measured.js_gzip)}, css ${formatBytes(measured.css_gzip)}, ` +
      `fonts ${formatBytes(measured.fonts)}); tightest metric ${tightest.metric} has ` +
      `${formatBytes(tightest.headroom)} left.`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error('[FAIL] weight gate failed:', error?.stack ?? error);
    process.exit(2);
  }
}
