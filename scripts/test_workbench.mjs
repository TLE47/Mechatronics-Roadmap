#!/usr/bin/env node
/**
 * The whole Workbench test surface, one run (`scripts/test_workbench.mjs`, `npm run test:workbench`)
 *
 * The suites used to run one after another, each booting what it needed:
 *
 *   test:practice    the roadmap <-> workbench join, pure TypeScript (Node type stripping)
 *   test:theme       palette rules: stored choice, OS default, prefers-contrast, the three controls
 *   test:theme:tokens  the ?view=theme page's parse of index.css, and its address
 *   test:spine       the ten-step spine the pages print, and the numbering no surface repeats
 *   test:palette     the ⌘K catalogue: every lesson/tab/command once, and predictable ranking
 *   test:search      ⌘⇧F inside the course: a line, not a lesson, and the solution never indexed
 *   test:prose       the 65 reading pages' index: what is copied, the heading slugs, the drift gate
 *   test:keymap      the sheet's six rebindable keys: the rules, the clash, the store, the reset
 *   test:help        the stuck report: what it carries, the three caps, and the ladder it leaves out
 *   test:pair        the pair session's wires: the two signals, the message rules, and parsing that writes nothing
 *   test:collab      the co-editing document: ids, diffs, convergence under concurrent edits, wire rules
 *   test:editor      slider directives (parse/clamp/format) and which lessons get helper tabs
 *   test:resume      the lesson the next visit reopens, including the ids it must refuse
 *   test:draft       the editor's unfinished work: kept, bounded per draft, never evicted by count, never a starter copy
 *   test:codediff    the Diff panel's rules: what a change is, how gaps are trimmed, the coarse fallback
 *   test:predict     the predict-first gate's grading: lines not strings, four verdicts, a bounded store, no lockout
 *   test:watch       when the checks may re-run themselves: after a graded failure, on an edit, never past the gate
 *   test:announce    what a screen reader hears after a run: the verdict first, then the failing line itself
 *   test:history     the versions behind the draft: filed on Run, deduped, capped, evicted oldest-first
 *   test:breakpoints the gutter's list: a toggle, per lesson, capped, evicted, and filtered to lines that run
 *   test:scope       the Scope's payload rules: NaN dropped, lengths aligned, flat traces widened
 *   test:checkhints  a failing check names its own rung, and rung 2 is earned by another run
 *   test:takealong   the offline button's URL list, its size wording, and what "ready" may claim
 *   test:backup      the backup archive: CRC, round trip, the three refusals, and a merge that never deletes
 *   test:analysis    completions, hover and signatures without a browser: insertion point, cursor coordinates, the call under the cursor, note shape, transport
 *   test:study       notes and highlights: what is kept, deduped, refused by the store, and what a restore merges
 *   test:review      FSRS: the 0.9-at-stability identity, grade ordering, lapses, the interval cap, and the card join
 *   test:sitting     the sitting clock: the idle cutoff, the three-hour cap, a backwards clock, the store, and focus's store
 *   test:portfolio   the exported Markdown: the progress record, notes and passages, the deck, the time table
 *   test:storage     drafts/versions/log/notes/schedules/sittings in IndexedDB: the migration order, the queue, the fallback
 *   test:traceback   Python's failure as data: the learner's frame, chains, syntax errors, and the explainer entry it matches
 *   test:trail       the log and the sitting clock as one trail: days, the fold that drops repeats, the caps
 *   test:trailreading the same trail read for advice: a resisting lesson, a quiet deck, days that were only opens
 *   test:paint       the first paint as a reading: one sample per visit, the newest flush wins, medians, the export
 *   test:weight      the weight budget's rules: the boundary, an unmeasured metric, the tightest one
 *   test:e2e:storage the same move in Chromium: a bucket full of a pre-IndexedDB visit, migrated, then written to
 *   test:e2e:backup  the header buttons in Chromium: write a zip, wipe, restore to store *and* screen
 *   test:e2e:review  pin, comment, review, reload in Chromium: a card asked, answered, and still scheduled tomorrow
 *   test:e2e:focus   focus mode in Chromium: the chrome hides, the work stays, three exits, and a measured sitting
 *   test:e2e:trail   the trail in Chromium: two runs become today's rows, a reload keeps them, a row opens its lesson
 *   test:fonts       the two self-hosted faces are named, imported and emitted
 *   test:firstrun    the first lesson's tour without a browser: six steps, the edit and run gates, the offer rule, the restore, and every data-tour anchor in the app's own source
 *   test:smoke       Vite in middleware mode, SSR-render App + Runner + Quiz
 *   test:e2e         Vite dev server on a random port + Chromium
 *   test:e2e:pages   `npm run build` if `dist/` was missing, a static Pages server + Chromium, Firefox
 *   test:pairs       the same dev server + Chromium, for the same-task control-pair sweep
 *   test:tour        the same dev server + Chromium, walking the guided tour's Apply Demo Presets
 *
 * Nothing they check depends on the others' timing, and the app is the same app. So this runner:
 *
 *   - builds `dist/` when it is missing or older than its sources (CI builds it in its own step, so
 *     this is a no-op there);
 *   - starts *one* dev server and *one* dist server, and hands their URLs to the suites
 *     (`E2E_BASE_URL`, `PAGES_SERVER_URL`) so no suite boots a second one;
 *   - runs the smoke suite in this process, against that same dev server, so its SSR module graph
 *     is the graph the browser suites load - not a third transformation of the same sources;
 *   - runs the browser suites in waves of four, each in its own process with its output prefixed,
 *     because thirty Chromium drivers at once is more than one dev server and one machine carry.
 *
 * Wall clock is the slowest suite rather than their sum, and the coverage is exactly what the separate
 * scripts cover when run alone. Each one still passes standalone: they create their own servers when
 * no URL is given.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { startDevServer } from './e2e_browser_workbench.mjs';
import { BASE, ensureBuilt, startStaticServer } from './e2e_pages_bundle.mjs';
import { runSmokeTests } from './smoke_test_workbench.mjs';

const repoRoot = process.cwd();

/** Stream a child's output line by line, prefixed, so two suites' logs stay readable. */
function pipe(stream, prefix) {
  let carry = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    const lines = (carry + chunk).split('\n');
    carry = lines.pop() ?? '';
    for (const line of lines) process.stdout.write(`${prefix} ${line}\n`);
  });
  stream.on('end', () => {
    if (carry) process.stdout.write(`${prefix} ${carry}\n`);
    carry = '';
  });
}

function runSuite(label, script, env) {
  const started = Date.now();
  const child = spawn(process.execPath, [path.join('scripts', script)], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  pipe(child.stdout, `[${label}]`);
  pipe(child.stderr, `[${label}]`);
  return new Promise((resolve) => {
    child.on('close', (code) => resolve({ label, code, ms: Date.now() - started }));
    child.on('error', (error) => {
      process.stdout.write(`[${label}] spawn failed: ${error.message}\n`);
      resolve({ label, code: 1, ms: Date.now() - started });
    });
  });
}

/**
 * Run thunks in waves. A suite is started only when a slot frees, so the wave size is how many are in
 * flight at once, and a fast suite is never held behind a slow one in the same batch.
 *
 * `throws` is false by design: a suite that cannot start has already been reported by `runSuite`, and
 * one dead script must not stop the rest of the matrix from running.
 */
async function runWaves(begins, limit) {
  const results = [];
  let next = 0;
  const worker = async () => {
    while (next < begins.length) {
      const at = next;
      next += 1;
      results[at] = await begins[at]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, begins.length) }, worker));
  return results;
}

/** Run the smoke suite in-process with its own log prefix, leaving the child pipes alone. */
function runSmoke(viteServer) {
  const started = Date.now();
  const write = console.log;
  console.log = (...args) => write('[smoke]', ...args);
  return runSmokeTests(viteServer)
    .then(() => ({ label: 'smoke', code: 0, ms: Date.now() - started }))
    .catch((error) => {
      write('[smoke] FAILED:', error?.stack ?? String(error));
      return { label: 'smoke', code: 1, ms: Date.now() - started };
    })
    .finally(() => {
      console.log = write;
    });
}

async function main() {
  // Build when the bundle is missing *or older than its sources*: the Pages sweep grades `dist/`, and
  // a stale one there grades code the source no longer has (the weight gate's Run 166 hole).
  ensureBuilt();

  const { viteServer, baseUrl: devUrl } = await startDevServer(repoRoot);
  const { server: distServer, port } = await startStaticServer();
  const pagesUrl = `http://127.0.0.1:${port}${BASE}`;
  console.log(`[setup] dev server ${devUrl}`);
  console.log(`[setup] built bundle ${pagesUrl}`);

  // The suites, as data: `browser` marks the ones that launch Chromium and drive pages, and those run
  // in waves rather than all at once (`runWaves` below).
  const TYPES = `${process.env.NODE_OPTIONS ?? ''} --experimental-strip-types`.trim();
  const SUITES = [
    { label: 'links', script: 'test_practice_links.mjs', env: { NODE_OPTIONS: TYPES } },
    { label: 'theme', script: 'test_theme.mjs', env: { NODE_OPTIONS: TYPES } },
    { label: 'tokens', script: 'test_theme_tokens.mjs', env: { NODE_OPTIONS: TYPES } },
    { label: 'spine', script: 'test_spine.mjs', env: { NODE_OPTIONS: TYPES } },
    { label: 'palette', script: 'test_palette.mjs', env: { NODE_OPTIONS: TYPES } },
    { label: 'search', script: 'test_lesson_search.mjs', env: { NODE_OPTIONS: TYPES } },
    { label: 'prose', script: 'test_prose_search.mjs', env: { NODE_OPTIONS: TYPES } },
    { label: 'editor', script: 'test_editor.mjs', env: { NODE_OPTIONS: TYPES } },
    { label: 'resume', script: 'test_last_lesson.mjs', env: { NODE_OPTIONS: TYPES } },
    { label: 'draft', script: 'test_lesson_draft.mjs', env: { NODE_OPTIONS: TYPES } },
    { label: 'codediff', script: 'test_codediff.mjs', env: { NODE_OPTIONS: TYPES } },
    { label: 'predict', script: 'test_predict_gate.mjs', env: { NODE_OPTIONS: TYPES } },
    { label: 'watch', script: 'test_watch.mjs', env: { NODE_OPTIONS: TYPES } },
    { label: 'announce', script: 'test_announce.mjs', env: { NODE_OPTIONS: TYPES } },
    { label: 'share', script: 'test_sharelink.mjs', env: { NODE_OPTIONS: TYPES } },
    { label: 'help', script: 'test_help_report.mjs', env: { NODE_OPTIONS: TYPES } },
    { label: 'pair', script: 'test_pair.mjs', env: { NODE_OPTIONS: TYPES } },
    { label: 'collab', script: 'test_collab.mjs', env: { NODE_OPTIONS: TYPES } },
    { label: 'inline', script: 'test_inline_values.mjs', env: { NODE_OPTIONS: TYPES } },
    { label: 'symbols', script: 'test_symbols.mjs', env: { NODE_OPTIONS: TYPES } },
    { label: 'levels', script: 'test_course_levels.mjs', env: { NODE_OPTIONS: TYPES } },
    { label: 'firstrun', script: 'test_tour.mjs', env: { NODE_OPTIONS: TYPES } },
    { label: 'layout', script: 'test_layout.mjs', env: { NODE_OPTIONS: TYPES } },
    { label: 'reader', script: 'test_reader.mjs', env: { NODE_OPTIONS: TYPES } },
    { label: 'keymap', script: 'test_keymap.mjs', env: { NODE_OPTIONS: TYPES } },
    { label: 'vim', script: 'test_vim.mjs', env: { NODE_OPTIONS: TYPES } },
    { label: 'trace', script: 'test_trace.mjs', env: { NODE_OPTIONS: TYPES } },
    { label: 'cells', script: 'test_cells.mjs', env: { NODE_OPTIONS: TYPES } },
    { label: 'breakpoints', script: 'test_breakpoints.mjs', env: { NODE_OPTIONS: TYPES } },
    { label: 'try', script: 'test_try_links.mjs', env: { NODE_OPTIONS: TYPES } },
    { label: 'history', script: 'test_draft_history.mjs', env: { NODE_OPTIONS: TYPES } },
    { label: 'scope', script: 'test_scope.mjs', env: { NODE_OPTIONS: TYPES } },
    { label: 'board', script: 'test_board_bridge.mjs', env: { NODE_OPTIONS: TYPES } },
    { label: 'avr', script: 'test_avr.mjs', env: { NODE_OPTIONS: TYPES } },
    { label: 'hints', script: 'test_check_hints.mjs', env: { NODE_OPTIONS: TYPES } },
    { label: 'takealong', script: 'test_offline_takealong.mjs', env: { NODE_OPTIONS: TYPES } },
    { label: 'backup', script: 'test_backup.mjs', env: { NODE_OPTIONS: TYPES } },
    { label: 'analysis', script: 'test_analysis.mjs', env: { NODE_OPTIONS: TYPES } },
    { label: 'study', script: 'test_study.mjs', env: { NODE_OPTIONS: TYPES } },
    { label: 'review', script: 'test_review.mjs', env: { NODE_OPTIONS: TYPES } },
    { label: 'sitting', script: 'test_sitting.mjs', env: { NODE_OPTIONS: TYPES } },
    { label: 'portfolio', script: 'test_portfolio.mjs', env: { NODE_OPTIONS: TYPES } },
    { label: 'storage', script: 'test_storage.mjs', env: { NODE_OPTIONS: TYPES } },
    { label: 'traceback', script: 'test_traceback.mjs', env: { NODE_OPTIONS: TYPES } },
    { label: 'trail', script: 'test_timeline.mjs', env: { NODE_OPTIONS: TYPES } },
    { label: 'reading', script: 'test_trail_reading.mjs', env: { NODE_OPTIONS: TYPES } },
    { label: 'paint', script: 'test_paint_timing.mjs', env: { NODE_OPTIONS: TYPES } },
    { label: 'weight', script: 'test_weight_budget.mjs' },
    { label: 'fonts', script: 'test_fonts.mjs' },
    { label: 'e2e', script: 'e2e_browser_workbench.mjs', env: { E2E_BASE_URL: devUrl }, browser: true },
    { label: 'pages', script: 'e2e_pages_bundle.mjs', env: { PAGES_SERVER_URL: pagesUrl }, browser: true },
    { label: 'pairs', script: 'e2e_same_task_pairs.mjs', env: { E2E_BASE_URL: devUrl }, browser: true },
    { label: 'firstrun-e2e', script: 'e2e_tour.mjs', env: { E2E_BASE_URL: devUrl }, browser: true },
    { label: 'tour', script: 'e2e_tour_presets.mjs', env: { E2E_BASE_URL: devUrl }, browser: true },
    { label: 'defer', script: 'e2e_editor_deferred.mjs', env: { E2E_BASE_URL: devUrl, NODE_OPTIONS: TYPES }, browser: true },
    { label: 'bak2e', script: 'e2e_backup.mjs', env: { E2E_BASE_URL: devUrl, NODE_OPTIONS: TYPES }, browser: true },
    { label: 'rev2e', script: 'e2e_review.mjs', env: { E2E_BASE_URL: devUrl, NODE_OPTIONS: TYPES }, browser: true },
    { label: 'trail2e', script: 'e2e_trail.mjs', env: { E2E_BASE_URL: devUrl, NODE_OPTIONS: TYPES }, browser: true },
    { label: 'predict2e', script: 'e2e_predict_gate.mjs', env: { E2E_BASE_URL: devUrl, NODE_OPTIONS: TYPES }, browser: true },
    { label: 'focus2e', script: 'e2e_focus.mjs', env: { E2E_BASE_URL: devUrl, NODE_OPTIONS: TYPES }, browser: true },
    { label: 'store2e', script: 'e2e_storage.mjs', env: { E2E_BASE_URL: devUrl, NODE_OPTIONS: TYPES }, browser: true },
  ];
  // Ctrl-C must not leave a Vite server or two Chromium runs behind.
  const stop = () => {
    viteServer.close();
    distServer.close();
    process.exit(130);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  let results;
  try {
    // Unit suites are cheap and share one dev server happily; the browser suites each open a Chromium
    // and drive pages, and thirty of those at once is what made this matrix flake (a 30 s navigation
    // timeout in one run, a 5 s readout wait in another, a Suspense panel read as content in a third).
    // Four at a time is what one machine carries, and wall clock is still the slowest suite plus a
    // wave, not their sum.
    // The browser suites are started as thunks so a wave decides when a Chromium is opened at all;
    // the rest are cheap and go in one batch.
    const start = (suite) => () => runSuite(suite.label, suite.script, suite.env ?? {});
    const unit = SUITES.filter((suite) => !suite.browser).map(start);
    const browser = SUITES.filter((suite) => suite.browser).map(start);
    results = [...(await Promise.all([runSmoke(viteServer), ...unit.map((begin) => begin())])), ...(await runWaves(browser, 4))];
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    await viteServer.close();
    distServer.close();
  }

  const failed = results.filter((result) => result.code !== 0);
  for (const result of results) {
    console.log(
      `[${result.code === 0 ? 'PASS' : 'FAIL'}] ${result.label.padEnd(5)} ${(result.ms / 1000).toFixed(1)}s`
    );
  }
  if (failed.length) {
    console.error(`[FAIL] ${failed.length} of ${results.length} workbench suites failed: ${failed.map((f) => f.label).join(', ')}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `[PASS] Workbench suites passed on one dev server and one built bundle: ${results
      .map((result) => `${result.label} ${(result.ms / 1000).toFixed(1)}s`)
      .join(', ')}`
  );
}

main().catch((error) => {
  console.error('[FAIL] Workbench suite run failed:', error?.stack ?? error);
  process.exit(1);
});
