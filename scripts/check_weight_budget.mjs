#!/usr/bin/env node
/**
 * The weight gate (`scripts/check_weight_budget.mjs`, `npm run check:weight`).
 *
 * Reads the built bundle, gzips every asset that a browser downloads compressed, and compares the
 * totals against `docs/weight-budget.json`. The comparison itself is
 * [`weight_budget.mjs`](weight_budget.mjs) and is pinned by `npm run test:weight`; this file only
 * measures and reports.
 *
 * `dist/prose-index.json` is measured too, as `prose_gzip`, though it is not part of the shell: the
 * app fetches it the first time `⌘⇧F` is opened. It is counted separately so a learner who never
 * searches is not asked to pay for it in `total`, and a budget with no file behind it fails like
 * any other unmeasured metric.
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
 * **A stale `dist/` is a failure, not a measurement.** The gate reads what was built, so a bundle
 * left over from an earlier checkout fits every budget while measuring code nobody is shipping — Run
 * 165 quoted 950.3 kB from exactly that. The sources are walked and compared with the newest output
 * (`weight_budget.mjs`'s `staleSources`), and a build older than its own sources exits `2` with the
 * offending files named. `--allow-stale` is for deliberately re-measuring an old build, and says so in
 * the report rather than quietly passing.
 *
 * Usage
 *     npm run build && node scripts/check_weight_budget.mjs
 *     node scripts/check_weight_budget.mjs --json        # machine-readable, stdout only
 *     node scripts/check_weight_budget.mjs --record      # write today's measurement into the file
 *     node scripts/check_weight_budget.mjs --allow-stale # measure an older build on purpose
 *
 * Exit-code family: typed
 *     0  every metric is within its budget
 *     1  a metric is over its budget, or a budget measures nothing
 *     2  no build to measure, a build older than its sources (run `npm run build`), or a bad command line
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
import { nameStale, staleBuild } from './buildFreshness.mjs';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');
const BUDGET_FILE = path.join(ROOT, 'docs', 'weight-budget.json');
const PROSE_FILE = path.join(DIST, 'prose-index.json');

const argv = process.argv.slice(2);
const JSON_OUT = argv.includes('--json');
const RECORD = argv.includes('--record');
const ALLOW_STALE = argv.includes('--allow-stale');

function log(...args) {
  (JSON_OUT ? console.error : console.log)(...args);
}

/**
 * Everything the shell actually loads, with its raw and gzipped size: `dist/assets/**` and
 * `dist/index.html`. Files at `dist/` root that no page fetches (`og.png`, the social card, 370 kB)
 * are deliberately out of scope — a budget that counts them would make the app look twice its size
 * and would move when the card is redrawn.
 *
 * Returns the files and the names `index.html` itself references, which is what `entry_gzip` sums.
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
  return { files, entry: entryNames(String(html)) };
}

/**
 * The asset names the document names: `<script src>`, `<link rel="modulepreload" href>` and
 * `<link rel="stylesheet" href>`. A stylesheet from another origin (KaTeX's CDN copy in the
 * template) is skipped — the gate measures this bundle, not somebody else's.
 */
function entryNames(html) {
  const names = new Set(['index.html']);
  const references = [
    ...html.matchAll(/<script[^>]+src="([^"]+)"/g),
    ...html.matchAll(/<link[^>]+(?:modulepreload|stylesheet)[^>]*href="([^"]+)"/g),
    ...html.matchAll(/<link[^>]+href="([^"]+)"[^>]*(?:modulepreload|stylesheet)/g),
  ];
  for (const [, href] of references) {
    const at = href.indexOf('assets/');
    if (at < 0) continue;
    names.add(href.slice(at));
  }
  return [...names];
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

  // Before measuring: is this build made of the sources in front of us?
  const { stale } = staleBuild(ROOT);
  if (stale.length && !ALLOW_STALE) {
    console.error(
      `dist/ is older than ${stale.length} source file${stale.length === 1 ? '' : 's'}; the bundle on ` +
        `disk is not what the source tree describes, so measuring it would report a number for code ` +
        `nobody is shipping. Run \`npm run build\` first (or \`--allow-stale\` to measure it anyway): ` +
        nameStale(stale)
    );
    process.exit(2);
  }

  const budgetFile = JSON.parse(fs.readFileSync(BUDGET_FILE, 'utf8'));
  const { files, entry } = readAssets(DIST);
  // Served beside the app, fetched only by a search: measured on its own, never folded into total.
  const prose = fs.existsSync(PROSE_FILE)
    ? (() => {
        const buffer = fs.readFileSync(PROSE_FILE);
        return {
          name: 'prose-index.json',
          size: buffer.length,
          gzip: zlib.gzipSync(buffer, { level: 9 }).length,
        };
      })()
    : null;
  const measured = measurementFrom(files, entry, prose);
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
    console.log(
      JSON.stringify(
        { measured, rows, biggest, files: files.length, stale: stale.map((file) => file.path) },
        null,
        2
      )
    );
  } else {
    if (stale.length) log(`  measured on purpose from a build older than ${stale.length} source file(s)`);
    log(`The built bundle: ${files.length} files, first paint from ${entry.length} of them`);
    for (const file of biggest) log(`  ${file.name.padEnd(38)} ${formatBytes(file.gzip).padStart(8)}`);
    log(
      `  prose-index.json${' '.repeat(23)}${(prose ? formatBytes(prose.gzip) : 'missing').padStart(8)}  ` +
        `(fetched by ⌘⇧F, not on a visit)`
    );
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
