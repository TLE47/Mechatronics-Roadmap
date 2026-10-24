#!/usr/bin/env node
/**
 * The weight gate (`scripts/check_weight_budget.mjs`, `npm run check:weight`).
 *
 * Reads a built bundle, gzips every asset that a browser downloads compressed, and compares the
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
 * **Two shapes, two ceilings — and the shipped one is graded on every run.** The same source builds a
 * `local_only` bundle when the Supabase variables are unset and a `signed_in` one when they are set
 * (CI has the anon key as a repository variable), and the signed-in build is bigger because the
 * account panel's library is emitted with it. The gate names the shape in `dist/` and compares it
 * against that shape's ceilings: `budgets` for `local_only`, `signed_in.budgets` overlaid on top for
 * `signed_in`. Before Run 207 there was one set of numbers, so the gate passed locally and failed on
 * the runner — 532.6 kB of entry against 480 kB — which is a gate that only works when nobody builds
 * the way CI does.
 *
 * Naming the shape was only half the fix: a local `npm run check:weight` still measured `dist/`, which
 * on a fresh clone is always `local_only`, so a signed-in-only breach could only ever surface in CI
 * (Run 226). So when the build on disk is `local_only`, the gate builds the **signed-in** shape into
 * `dist-signed-in/` with the Supabase variables set to placeholders, measures it, and removes it — a
 * bare Vite build, about five seconds. CI's `dist/` is already `signed_in`, so nothing extra is built
 * there; a clone's run grades the local-only build in `dist/` and the shipped shape beside it. A chunk
 * split that only goes wrong with the account library present now fails before the push.
 *
 * It does not trust the environment to have done that: `buildVariant` reads the shape from what the
 * account chunk actually contains (both builds emit one — the unset case is a one-byte stub), and a
 * build that comes out the wrong shape exits `2` rather than being reported as the shape it was asked
 * for. `signedInEnv` puts both placeholders in the process environment, which Vite gives precedence
 * over any `.env` file, so a developer's `app/.env.local` cannot change which bytes are graded.
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
 *     0  every metric in the shape(s) graded is within its budget
 *     1  a metric is over its budget, or a budget measures nothing
 *     2  no build to measure, a build older than its sources (run `npm run build`), a shape that
 *        could not be built or came out as the wrong shape, or a bad command line
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  METRICS,
  budgetsFor,
  buildVariant,
  compareBudgets,
  formatBytes,
  formatHeadroom,
  formatUsed,
  measurementFrom,
  shapeToBuild,
  signedInEnv,
} from './weight_budget.mjs';
import { nameStale, staleBuild } from './buildFreshness.mjs';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');
const BUDGET_FILE = path.join(ROOT, 'docs', 'weight-budget.json');
const VITE_BIN = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');

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

/** `dist/prose-index.json` beside a build, or null: served, but fetched only by a search. */
function proseOf(dir) {
  const file = path.join(dir, 'prose-index.json');
  if (!fs.existsSync(file)) return null;
  const buffer = fs.readFileSync(file);
  return {
    name: 'prose-index.json',
    size: buffer.length,
    gzip: zlib.gzipSync(buffer, { level: 9 }).length,
  };
}

/** One built directory, measured: its files, the shape they make, and the numbers a budget reads. */
function measureBuild(dir) {
  const { files, entry } = readAssets(dir);
  const prose = proseOf(dir);
  const variant = buildVariant(files);
  return { dir, files, entry, prose, variant, measured: measurementFrom(files, entry, prose) };
}

/** A measurement plus the ceilings for the shape it is. */
function gradeBuild(build, budgetFile) {
  const budgets = budgetsFor(budgetFile, build.variant);
  const report = compareBudgets(build.measured, budgets);
  return {
    ...build,
    ...report,
    biggest: [...build.files].sort((left, right) => right.gzip - left.gzip).slice(0, 5),
  };
}

/** Where a shape is built when it is not the one in `dist/`: beside it, and removed after measuring. */
function shapeDirectory(variant) {
  return `dist-${variant.replace(/_/g, '-')}`;
}

/**
 * Build the signed-in shape into `dist-signed-in/`, leaving `dist/` alone.
 *
 * `tsc` is skipped on purpose: the types do not depend on the Supabase variables, and the bytes do.
 * The directory sits outside Vite's `app/` root, so `--emptyOutDir` is passed without which Vite
 * refuses to clear a previous run and the measurement would include both builds.
 */
function buildSignedInShape() {
  const variant = 'signed_in';
  const target = shapeDirectory(variant);
  const dir = path.join(ROOT, target);
  fs.rmSync(dir, { recursive: true, force: true });
  try {
    execFileSync(process.execPath, [VITE_BIN, 'build', '--outDir', `../${target}`, '--emptyOutDir'], {
      cwd: ROOT,
      env: signedInEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const detail = [error.stderr, error.stdout].filter(Boolean).join('\n').trim();
    throw new Error(`\`vite build\` failed${detail ? `:\n${detail}` : `: ${error.message}`}`);
  }
  const build = measureBuild(dir);
  // The environment, not the request, decides what a build is. If the variables did not take, this
  // measurement belongs to the other shape and reporting it as this one would be the Run 207 gap
  // again with a friendlier face.
  if (build.variant !== variant) {
    throw new Error(
      `the ${variant} build into ${target}/ came out ${build.variant}: the VITE_SUPABASE_* ` +
        'placeholders did not reach the build, so the shipped shape was not graded'
    );
  }
  return build;
}

function printBuild(heading, build) {
  log(heading);
  for (const file of build.biggest) log(`  ${file.name.padEnd(38)} ${formatBytes(file.gzip).padStart(8)}`);
  log(
    `  prose-index.json${' '.repeat(23)}${(build.prose ? formatBytes(build.prose.gzip) : 'missing').padStart(8)}  ` +
      '(fetched by ⌘⇧F, not on a visit)'
  );
  log('');
  log('  metric              measured     budget      used');
  for (const row of build.rows) {
    log(
      `  ${row.metric.padEnd(18)} ${formatBytes(row.measured).padStart(9)} ` +
        `${formatBytes(row.budget).padStart(10)}   ${formatUsed(row.measured, row.budget).padStart(5)}`
    );
  }
  log('');
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
  const primary = gradeBuild(measureBuild(DIST), budgetFile);
  const shapes = [primary];

  if (RECORD) {
    budgetFile.measured = {
      ...primary.measured,
      variant: primary.variant,
      recordedAt: new Date().toISOString().slice(0, 10),
    };
    fs.writeFileSync(BUDGET_FILE, `${JSON.stringify(budgetFile, null, 2)}\n`);
    log(
      `recorded ${primary.variant}: ${METRICS.map((metric) => `${metric}=${primary.measured[metric]}`).join(' ')}`
    );
    for (const row of primary.rows) {
      if (row.verdict === 'over') {
        log(`  over budget: ${row.metric} ${formatBytes(row.measured)} > ${formatBytes(row.budget)}`);
      }
    }
    return;
  }

  // The shape that ships is graded even when `dist/` is the local-only build. Cleaned up even when
  // the build or the check throws.
  const extraName = shapeToBuild(primary.variant);
  let extra = null;
  if (extraName) {
    const extraDir = path.join(ROOT, shapeDirectory(extraName));
    try {
      extra = gradeBuild(buildSignedInShape(), budgetFile);
      shapes.push(extra);
    } catch (error) {
      console.error(`[FAIL] could not grade the ${extraName} shape: ${error.message}`);
      process.exitCode = 2;
      return;
    } finally {
      fs.rmSync(extraDir, { recursive: true, force: true });
    }
  }

  if (JSON_OUT) {
    console.log(
      JSON.stringify(
        {
          variant: primary.variant,
          measured: primary.measured,
          rows: primary.rows,
          biggest: primary.biggest,
          files: primary.files.length,
          stale: stale.map((file) => file.path),
          shapes: shapes.map((build) => ({
            variant: build.variant,
            dir: path.relative(ROOT, build.dir),
            measured: build.measured,
            rows: build.rows,
            files: build.files.length,
          })),
        },
        null,
        2
      )
    );
  } else {
    if (stale.length) log(`  measured on purpose from a build older than ${stale.length} source file(s)`);
    printBuild(
      `dist/ — ${primary.variant}, ${primary.files.length} files, first paint from ${primary.entry.length} of them` +
        (primary.variant === 'signed_in' ? ' (accounts configured)' : ''),
      primary
    );
    if (extra) {
      printBuild(
        `${shapeDirectory(extra.variant)}/ — ${extra.variant}, built and removed by this check, ` +
          `${extra.files.length} files, first paint from ${extra.entry.length} of them` +
          (extra.variant === 'signed_in' ? ' (accounts configured)' : ''),
        extra
      );
    }
  }

  const failures = shapes.flatMap((build) => [
    ...build.breaches.map((row) => ({ build, row })),
    ...build.unmeasured.map((row) => ({ build, row })),
  ]);

  if (failures.length) {
    for (const { build, row } of failures) {
      if (row.verdict === 'over') {
        console.error(
          `[FAIL] ${build.variant}: ${row.metric} is ${formatBytes(row.measured)}, over its ` +
            `${formatBytes(row.budget)} budget by ${formatBytes(row.measured - row.budget)} ` +
            `(${formatHeadroom(row.measured, row.budget)}) — trim it, or raise the budget in ` +
            'docs/weight-budget.json and say why'
        );
      } else {
        console.error(
          `[FAIL] ${build.variant}: ${row.metric} has a budget but no measurement: the build no ` +
            'longer produces it, or the metric name changed — a budget nothing measures always passes'
        );
      }
    }
    process.exitCode = 1;
    return;
  }

  const tightest = shapes
    .map((build) => build.tightest)
    .filter(Boolean)
    .sort((left, right) => left.headroom - right.headroom)[0];
  log(
    `[PASS] Weight: ${shapes.length === 1 ? 'the build' : 'both shapes'} within budget — ` +
      shapes
        .map(
          (build) =>
            `${build.variant} ${formatBytes(build.measured.total)} in ${build.files.length} files ` +
            `(entry ${formatBytes(build.measured.entry_gzip)})`
        )
        .join(', ') +
      `; tightest metric ${tightest.metric} has ${formatBytes(tightest.headroom)} left.`
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
