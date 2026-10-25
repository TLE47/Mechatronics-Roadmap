#!/usr/bin/env node
/**
 * Production Bundle (GitHub Pages) End-to-End Checks — `scripts/e2e_pages_bundle.mjs`
 *
 * `scripts/e2e_browser_workbench.mjs` drives the *Vite dev server* with lesson P.6, so nothing in CI
 * ever proved what learners actually open: https://tle47.github.io/Mechatronics-Roadmap/ — a *built*
 * bundle served from a sub-path. This script closes that gap:
 *
 * 1. `dist/index.html` must reference every local asset under the Pages base path (`PAGES_BASE`,
 *    default `/Mechatronics-Roadmap/`). A bundle built for `/` is exactly the failure that shipped
 *    once before: Pages serves the repo root and nothing loads.
 * 2. The built bundle is served at that base path — the same URL shape Pages uses, not a dev server —
 *    and must mount React with no page errors.
 * 3. Representative *later-track* lessons (03.3 sensors+F, 06.1 robotics, 08.1 capstone) must load in
 *    the in-browser Python runner, so the suite is no longer a single-lesson check.
 * 4. A tablet viewport (834x1112) must keep the tab bar, lesson list and runner usable *and* fit the
 *    viewport: zero horizontal overflow, asserted rather than reported. Elements inside a
 *    horizontal scroller (the tab rail) are reachable by scrolling that rail, so they are not
 *    counted as spilling the page.
 * 5. Every school-maths ramp entry (R.1-R.6) is graded on the bundle: the starter must not verify, and
 *    the page's own reference must match its expected output and pass its instructor tests. Each ramp
 *    page repairs a Tier 1 exit-check item, so the recovery path is now proven where a learner uses it.
 * 6. *Every* graded exercise entry is graded - once - discovered from each `exercises/<package>/exercise.json`
 *    rather than listed by hand: the starter fails on its `NotImplementedError`, the reference solution
 *    passes the appended self-check, and the output badge reads MATCHED, on the built bundle. A package
 *    added to `exercises/` is in this suite the next run, and a package whose entry the bundle does not
 *    carry fails the count in every browser, so the sweep cannot fall behind the registry.
 *    The sweep runs *inside* the page (`gradeInPage`): one `page.evaluate` clicks every lesson, runs the
 *    starter and the reference, and reads the badges. Measured: a click-to-result cycle is 8-14 ms in
 *    the page and ~100 ms through Playwright, so the harness, not the interpreter, was the cost.
 * 7. A second browser grades a *sample* (`sampleExerciseIds`), not the whole list: the same bundle,
 *    Pyodide and packages had already been graded end to end once, so repeating 48 verdicts in Firefox
 *    bought no new signal for twice the interpreter runs. The sample keeps a real Firefox signal on
 *    every track and at both ends of the list, with the same assertions per entry, and its size is
 *    logged and asserted.
 *
 * Chromium always runs and carries the exhaustive pass; Firefox runs when its browser build is present
 * (`npx playwright-core install firefox`, which CI does) and grades the sample. A browser selected on
 * its own (`PLAYWRIGHT_BROWSERS=chromium|firefox`) still gets the exhaustive pass. A browser that is not
 * installed is reported as SKIP with the reason, never as a pass.
 *
 * Usage:  PAGES_BASE=/Mechatronics-Roadmap/ node scripts/e2e_pages_bundle.mjs
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox } from 'playwright-core';
import { resolveChromiumExecutable } from './e2e_browser_workbench.mjs';
import { getEditorCode, setEditorCode } from './editor-code.mjs';
import { nameStale, staleBuild } from './buildFreshness.mjs';

const repoRoot = process.cwd();
export const BASE = (process.env.PAGES_BASE ?? '/Mechatronics-Roadmap/').replace(/\/?$/, '/');
const distDir = path.join(repoRoot, 'dist');
const LATER_TRACK_LESSONS = ['03.3', '06.1', '08.1'];
/**
 * The six maths-ramp pages, in order. Each repairs at least one Tier 1 exit-check item, so the
 * recovery path is graded on the built bundle: the starter must not verify, the reference must.
 * The id doubles as the entry's `data-testid="lesson-item-..."` and its registry key.
 */
const RAMP_LESSONS = ['R.1', 'R.2', 'R.3', 'R.4', 'R.5', 'R.6'];
/**
 * One unique substring per ramp starter. Clicking a list item loads the next program
 * asynchronously, and every starter carries `TODO 1`, so the generic "has a TODO" wait can read the
 * previous entry's code for a beat and grade the wrong lesson. Each marker is a function only that
 * ramp page defines.
 */
const RAMP_STARTER_MARKERS = {
  'R.1': 'counts_to_rad',
  'R.2': 'left_rule_rad',
  'R.3': 'accel_rad_s2',
  'R.4': 'mat_vec',
  'R.5': 'sum_arrows',
  'R.6': 'phase_deg',
};
const TABLET_VIEWPORT = { width: 834, height: 1112 };
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * Every graded exercise, read from its package manifest - the registry is generated from these same
 * files (`scripts/generate_python_lessons_data.py`), so discovering them here means a new package is
 * driven in the browser as soon as it exists, with no second list to forget to update.
 */
function discoverExerciseIds() {
  const exercisesDir = path.join(repoRoot, 'exercises');
  assert.ok(fs.existsSync(exercisesDir), `no exercises/ directory at ${exercisesDir}`);
  const entries = fs
    .readdirSync(exercisesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const ids = [];
  for (const name of entries) {
    const manifestPath = path.join(exercisesDir, name, 'exercise.json');
    if (!fs.existsSync(manifestPath)) continue;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    ids.push(manifest.delivery?.workbench_id ?? `EX.${manifest.id ?? name}`);
  }
  assert.ok(ids.length > 0, 'exercises/ carries no exercise.json manifests');
  assert.equal(
    new Set(ids).size,
    ids.length,
    `two exercise packages claim the same workbench id: ${ids.filter((id, i) => ids.indexOf(id) !== i).join(', ')}`
  );
  return ids;
}

/**
 * The entries the *second* browser grades. The exhaustive pass is the delivery claim - the registry and
 * the bundle agree, every package ships a starter that fails and a reference that passes - and one
 * browser establishes it. A second browser repeating all 48 verdicts adds no signal (same bundle, same
 * Pyodide, same packages) at twice the interpreter runs, so it grades these instead: the first package
 * of every track (a new track is in the sample the run after it lands), plus both ends of the list.
 * Assertions per entry are unchanged; the count is logged and asserted so a shrunken sample cannot pass
 * quietly.
 */
export function sampleExerciseIds(ids) {
  assert.ok(ids.length > 0, 'no graded exercise packages to sample');
  const trackOf = (id) => id.split('.')[1] ?? id;
  const firstPerTrack = new Map();
  for (const id of ids) if (!firstPerTrack.has(trackOf(id))) firstPerTrack.set(trackOf(id), id);
  const wanted = new Set([ids[0], ids[ids.length - 1], ...firstPerTrack.values()]);
  const sample = ids.filter((id) => wanted.has(id));
  assert.ok(sample.length >= 3, `the second browser's sample collapsed to ${sample.length} entries`);
  assert.equal(
    new Set(sample.map(trackOf)).size,
    firstPerTrack.size,
    `the sample must grade at least one package from each of the ${firstPerTrack.size} tracks`
  );
  return sample;
}

/**
 * The ramp entries' reference programs, read from the generated registry the bundle ships.
 *
 * The registry is a `.ts` module and this script runs on plain Node, so it is parsed the same way
 * `scripts/generate_run_callouts.py` parses it: everything after the array declaration is JSON.
 * Reading the registry rather than the Markdown keeps the browser pass grading exactly what the
 * runner has - a reference that drifts from the page fails `generate_python_lessons_data.py --check`
 * first, and a registry that loses a ramp entry fails here.
 */
function rampReferences() {
  const registry = path.join(repoRoot, 'app', 'src', 'data', 'pythonLessonsData.ts');
  assert.ok(fs.existsSync(registry), `no generated registry at ${registry} - run scripts/generate_python_lessons_data.py`);
  const marker = 'PYTHON_LESSONS: PythonLessonItem[] =';
  const text = fs.readFileSync(registry, 'utf8');
  const at = text.indexOf(marker);
  assert.ok(at >= 0, `${registry} has no PYTHON_LESSONS array`);
  const entries = JSON.parse(text.slice(at + marker.length).trim().replace(/;$/, ''));
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  return RAMP_LESSONS.map((id) => {
    const entry = byId.get(id);
    assert.ok(entry, `the registry carries no ramp entry ${id}`);
    assert.ok(entry.fullSolution.trim().length > 100, `${id}'s reference is missing from the registry`);
    assert.ok(entry.expectedOutput.trim().length > 0, `${id}'s expected output is missing from the registry`);
    return { id, reference: entry.fullSolution, expected: entry.expectedOutput };
  });
}

/**
 * Build the bundle unless it is missing or older than its own sources.
 *
 * Building only when `dist/index.html` was *missing* left the same hole the weight gate had until Run
 * 166: a bundle from an earlier checkout is graded happily, so this suite would report on exercises
 * and code that the source no longer has. Staleness is the shared rule in `buildFreshness.mjs`, so the
 * weight gate and this sweep cannot disagree about what "built" means.
 */
export function ensureBuilt() {
  const { built, stale } = staleBuild(repoRoot);
  if (built && !stale.length) return;
  console.log(
    built
      ? `[build] dist/ is older than ${stale.length} source file(s) - rebuilding before grading it`
      : '[build] dist/index.html is missing - running `npm run build` first'
  );
  if (built) console.log(`[build]   ${nameStale(stale)}`);
  execFileSync('npm', ['run', 'build'], { stdio: 'inherit', cwd: repoRoot });
  assert.ok(fs.existsSync(path.join(distDir, 'index.html')), 'npm run build produced no dist/index.html');
}

/** Serve `dist/` under the Pages base path, the way GitHub Pages does for a project site. */
export function startStaticServer({ isolation = true } = {}) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    let rel = url.pathname;
    if (!rel.startsWith(BASE)) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end(`outside the Pages base ${BASE}`);
      return;
    }
    rel = decodeURIComponent(rel.slice(BASE.length));
    const target = path.join(distDir, rel);
    if (!target.startsWith(distDir)) {
      res.writeHead(403);
      res.end('forbidden');
      return;
    }
    let file = target;
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file) && !path.extname(rel)) file = path.join(distDir, 'index.html'); // SPA route
    if (!fs.existsSync(file)) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      return;
    }
    // The real host is GitHub Pages, which cannot set these; the bundle carries app/public/sw.js for
    // that. This server sets them instead so the Pages suite exercises the isolated document without a
    // service-worker reload mid-test; the offline suite turns isolation off to test exactly that pair.
    const headers = { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' };
    if (isolation) {
      headers['Cross-Origin-Opener-Policy'] = 'same-origin';
      headers['Cross-Origin-Embedder-Policy'] = 'require-corp';
    }
    res.writeHead(200, headers);
    res.end(fs.readFileSync(file));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

export function checkBuiltHtml() {
  const html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
  assert.match(html, /<div id="root"/, 'the built index.html must contain the React root');
  const localRefs = [...html.matchAll(/(?:src|href)="(\/[^"]*)"/g)].map((m) => m[1]);
  assert.ok(localRefs.length >= 2, `expected bundled JS+CSS references, found ${localRefs.length}`);
  const offBase = localRefs.filter((ref) => !ref.startsWith(BASE));
  assert.equal(
    offBase.length,
    0,
    `assets are not under the Pages base ${BASE}: ${offBase.join(', ')} - build with PAGES_BASE set`
  );
  console.log(`  ok dist/index.html references ${localRefs.length} assets under ${BASE}`);
  return localRefs;
}

export async function checkServed(baseUrl, refs) {
  const index = await fetch(baseUrl);
  assert.equal(index.status, 200, `GET ${baseUrl} -> ${index.status}`);
  assert.match(await index.text(), /<div id="root"/, 'served index.html must contain the React root');
  for (const ref of refs) {
    const response = await fetch(new URL(ref, baseUrl));
    assert.equal(response.status, 200, `GET ${ref} -> ${response.status}`);
    const type = response.headers.get('content-type') ?? '';
    if (ref.endsWith('.js')) assert.match(type, /javascript/, `${ref} served as ${type}`);
    if (ref.endsWith('.css')) assert.match(type, /css/, `${ref} served as ${type}`);
  }
  console.log(`  ok every built asset answers 200 with the right content type at ${BASE}`);
}

/**
 * Grade `ids` on one page: the starter must fail on a hole, the reference must match and pass.
 *
 * Two things make this the suite's most expensive loop, and neither is the runtime: the app keeps one
 * Pyodide worker per page, so a run is a warm ~50-130 ms round trip, and every `getByTestId(...)` is
 * its own CDP call. So each state is read in *one* `page.evaluate` rather than four locator calls, the
 * explicit `scrollIntoViewIfNeeded` is gone (a locator click scrolls the entry into view itself), and
 * the sweep is split across pages by the caller. The assertions are unchanged.
 */
/**
 * Grade `ids` by driving the page from inside it: one `page.evaluate` clicks every lesson, runs the
 * starter and the reference, and reads the badges the learner sees.
 *
 * Measured before writing this: one click-to-result cycle is **8-14 ms** in the page (no long tasks at
 * all), while the same cycle costs **~100 ms** through Playwright - actionability checks, one IPC round
 * trip per locator, and `waitForFunction` polling at rAF granularity. The interpreter is not the cost;
 * the test harness is, and moving the loop into the page is what takes it out. Each wait is a 2 ms poll
 * inside the page, so the runner's own timing is what shows up.
 *
 * Returns one record per id; `problem` is set (and the rest of the entry's fields may be missing) when
 * a step did not arrive in time, so the failure names the package and the state it was stuck in.
 */
async function gradeInPage(page, ids) {
  return page.evaluate(async (list) => {
    const q = (sel) => document.querySelector(sel);
    const text = (sel) => q(sel)?.textContent ?? '';
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const statusId = () => q('[data-testid^="status-"]')?.getAttribute('data-testid') ?? 'none';
    const editor = () =>
      (window.__mechalabEditors && window.__mechalabEditors['editor-main']
        ? window.__mechalabEditors['editor-main'].get()
        : '');
    const waitFor = async (predicate, budgetMs) => {
      const startedAt = performance.now();
      while (performance.now() - startedAt < budgetMs) {
        if (predicate()) return true;
        await sleep(2);
      }
      return false;
    };
    const badges = () => [
      text('[data-testid="badge-output-check"]').trim(),
      text('[data-testid="badge-behavior-check"]').trim(),
    ];
    const results = [];
    const deadline = performance.now() + 300000;
    for (const id of list) {
      const result = { id, problem: '' };
      results.push(result);
      if (performance.now() > deadline) {
        result.problem = 'the sweep exceeded its five-minute budget before this entry';
        break;
      }
      q(`[data-testid="lesson-item-${id}"]`)?.click();
      // Wait for *this* entry's starter to land in the editor: after the previous exercise loaded its
      // reference, the editor holds that program for a beat, and reading it would grade the wrong lesson.
      if (!(await waitFor(() => editor().includes('raise NotImplementedError'), 15000))) {
        result.problem = "its starter never landed in the editor";
        continue;
      }
      result.starter = editor();
      result.expected = text('[data-testid="pre-expected-stdout"]').trim();
      const starterBefore = text('[data-testid="pre-actual-stdout"]');
      q('[data-testid="btn-run-verify"]').click();
      if (!(await waitFor(() => {
        const out = text('[data-testid="pre-actual-stdout"]');
        return out !== starterBefore && out.length > 0;
      }, 90000))) {
        result.problem = `its starter run never reported (status ${statusId()})`;
        continue;
      }
      result.starterStdout = text('[data-testid="pre-actual-stdout"]');
      result.starterBadges = badges();
      q('[data-testid="btn-load-solution"]').click();
      // Both clicks in one task on purpose: Run must execute the text the editor holds now, so the
      // reference still runs without waiting for React to commit it. A regression here runs the
      // starter a second time, which the PASS-line requirement below turns into a failure.
      const referenceBefore = text('[data-testid="pre-actual-stdout"]');
      q('[data-testid="btn-run-verify"]').click();
      if (!(await waitFor(() => {
        const out = text('[data-testid="pre-actual-stdout"]');
        return out !== referenceBefore && out.includes('SELF-CHECK PASS');
      }, 90000))) {
        result.problem = text('[data-testid="pre-actual-stdout"]').includes('NotImplementedError')
          ? 'its reference run executed the starter program instead (Run read stale editor text)'
          : `its reference run never printed a PASS line (status ${statusId()})`;
        continue;
      }
      result.referenceBadges = badges();
    }
    return results;
  }, ids);
}

/** The delivery claim, asserted on what the page handed back for one package. */
function assertGraded(result, name) {
  // The state a stalled entry was stuck in, before any field it never reached. Without this line a
  // reference run that timed out reached `result.referenceBadges[0]` and threw "Cannot read properties
  // of undefined", which named neither the package nor the step — the one thing this record exists to
  // say (`gradeInPage`'s `problem`).
  assert.equal(result.problem, '', `${name}: ${result.id} — ${result.problem}`);
  assert.ok(result.starter?.includes('raise NotImplementedError'), `${name}: ${result.id} ${result.problem}`);
  assert.ok(
    result.starter.includes('_selfcheck()'),
    `${name}: ${result.id} must ship its holes and its self-check together`
  );
  assert.match(
    result.expected,
    /SELF-CHECK PASS/,
    `${name}: ${result.id} expected output is not its self-check PASS line`
  );
  assert.ok(
    result.starterStdout.includes('NotImplementedError'),
    `${name}: ${result.id} starter must fail on a hole, got: ${result.starterStdout}`
  );
  assert.doesNotMatch(
    result.starterBadges[0],
    /MATCHED/i,
    `${name}: ${result.id} starter must not be graded as a match`
  );
  assert.match(
    result.starterBadges[1],
    /FAILED/i,
    `${name}: ${result.id} starter must fail the instructor behavioural tests`
  );
  assert.match(
    result.referenceBadges[0],
    /MATCHED/i,
    `${name}: ${result.id} reference must match its expected output`
  );
  // The registry's copy of the package's selfcheck.py, run after the program, is what awards
  // verification: a reference that only printed the PASS line would fail this badge.
  assert.match(
    result.referenceBadges[1],
    /PASSED/i,
    `${name}: ${result.id} reference must pass the instructor behavioural tests`
  );
}

/**
 * Grade one program per ramp page: the starter must not verify, then the reference must.
 *
 * Ramp starters deliberately run as-is (R.1 prints zeros and a "no reversal yet" line until its
 * TODOs are filled) rather than raising `NotImplementedError`, so `gradeInPage`'s starter contract
 * cannot grade them. This pass asserts the property that matters instead - a ramp entry that accepts
 * its own starter, or rejects its own reference, is a broken recovery path - and it does it on the
 * bundle a learner opens, not in the Python registry alone.
 *
 * It drives the page from inside it, like `gradeInPage`, and for a measured reason: the locator version
 * spent ~30 s per entry waiting on Playwright actionability before the first Run click, while the same
 * clicks and reads cost milliseconds in the page (twelve ramp runs now take ~0.2 s). A run is finished
 * when the panel moves to a *terminal verdict different from the one it held before the click*: R.6's
 * starter raises before printing, so a non-empty output never arrives, and the presentation badge can
 * stay UNTESTED forever. Freshness is asserted on what was printed instead - the reference's stdout
 * must carry a distinctive line of this page's own registry entry, which a stale panel cannot.
 */
async function gradeRampEntries(page, name) {
  const startedAt = Date.now();
  const entries = rampReferences();
  assert.equal(entries.length, RAMP_LESSONS.length, `${name}: the ramp set shrank to ${entries.length}`);
  const inputs = entries.map((entry) => ({ ...entry, marker: RAMP_STARTER_MARKERS[entry.id] }));
  assert.ok(
    inputs.every((entry) => entry.marker),
    `${name}: no starter marker for ${inputs.filter((entry) => !entry.marker).map((entry) => entry.id).join(', ')}`
  );
  const records = await page.evaluate(async (list) => {
    const q = (sel) => document.querySelector(sel);
    const text = (sel) => q(sel)?.textContent ?? '';
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const statusId = () => q('[data-testid^="status-"]')?.getAttribute('data-testid') ?? 'none';
    const editor = () =>
      (window.__mechalabEditors && window.__mechalabEditors['editor-main']
        ? window.__mechalabEditors['editor-main'].get()
        : '');
    const waitFor = async (predicate, budgetMs) => {
      const started = performance.now();
      while (performance.now() - started < budgetMs) {
        if (predicate()) return true;
        await sleep(2);
      }
      return false;
    };
    const badges = () => ({
      output: text('[data-testid="badge-output-check"]').trim(),
      behavior: text('[data-testid="badge-behavior-check"]').trim(),
    });
    // A run is over when the panel carries a verdict: the output has changed, the presentation badge
    // has left UNTESTED, and the status is a terminal one. Waiting on the output alone reads the
    // badges mid-run, before the runner has graded the program.
    const TERMINAL = new Set([
      'status-assert-passed',
      'status-output-mismatch',
      'status-behavior-failed',
      'status-harness-failed',
      'status-execution-stopped',
    ]);
    const runAndWait = async () => {
      const beforeStatus = statusId();
      q('[data-testid="btn-run-verify"]').click();
      const landed = await waitFor(() => {
        // A ramp starter can raise before printing anything (R.6 does), so neither a non-empty stdout
        // nor a graded presentation badge can be the completion condition; a *changed terminal
        // verdict* can. The assertions below then hold the reference's stdout to this page's own
        // expected output, which a verdict left behind by the previous entry cannot satisfy.
        return TERMINAL.has(statusId()) && statusId() !== beforeStatus;
      }, 90000);
      return { ok: landed, out: text('[data-testid="pre-actual-stdout"]'), badges: badges(), status: statusId() };
    };
    const results = [];
    for (const entry of list) {
      const result = { id: entry.id, problem: '' };
      results.push(result);
      const t0 = performance.now();
      q(`[data-testid="lesson-item-${entry.id}"]`)?.click();
      // Wait for *this* page's starter, not the previous entry's: every ramp starter has `TODO 1`.
      if (!(await waitFor(() => editor().includes(entry.marker), 15000))) {
        result.problem = 'its starter never landed in the editor';
        continue;
      }
      result.expected = text('[data-testid="pre-expected-stdout"]').trim();
      result.starter = editor();
      const starterBefore = statusId();

      const starterRun = await runAndWait();
      if (!starterRun.ok) {
        result.problem = `its starter run never reported (status ${starterRun.status})`;
        continue;
      }
      result.starterStdout = starterRun.out;
      result.starterBadges = starterRun.badges;
      result.starterStatus = starterRun.status;
      result.starterBeforeStatus = starterBefore;
      const tStarter = performance.now();

      // Write through the editor's own bridge (the same call a browser suite makes), then click Run in
      // the same task: the runner's code ref is updated synchronously, so it runs the reference text,
      // not the starter React still holds.
      window.__mechalabEditors['editor-main'].set(entry.reference);
      const referenceRun = await runAndWait();
      result.loadMs = Math.round(tStarter - t0);
      result.referenceMs = Math.round(performance.now() - tStarter);
      if (!referenceRun.ok) {
        result.problem = editor().includes('TODO')
          ? 'its reference run executed stale editor text'
          : `its reference run never reported (status ${referenceRun.status})`;
        continue;
      }
      result.referenceStdout = referenceRun.out;
      result.referenceBadges = referenceRun.badges;
      result.referenceStatus = referenceRun.status;
    }
    return results;
  }, inputs);

  for (const [i, result] of records.entries()) {
    const entry = entries[i];
    assert.ok(result.starter?.includes(RAMP_STARTER_MARKERS[entry.id]), `${name}: ${entry.id} ${result.problem}`);
    assert.equal(
      result.expected,
      entry.expected.trim(),
      `${name}: ${entry.id}'s runner shows a different expected output from the registry`
    );
    assert.ok(
      !result.problem,
      `${name}: ${entry.id} ${result.problem} (stdout: ${(result.referenceStdout ?? '').slice(0, 200)})`
    );
    assert.doesNotMatch(
      result.starterBadges.output,
      /MATCHED/i,
      `${name}: ${entry.id}'s starter was graded as matching its expected output - the ramp entry accepts unfinished work`
    );
    assert.match(
      result.starterBadges.behavior,
      /FAILED/i,
      `${name}: ${entry.id}'s starter passed the instructor tests ("${result.starterBadges.behavior}") - the ramp entry accepts unfinished work`
    );
    assert.match(
      result.referenceBadges.output,
      /MATCHED/i,
      `${name}: ${entry.id}'s reference did not match its own expected output ("${result.referenceBadges.output}")`
    );
    assert.match(
      result.referenceBadges.behavior,
      /PASSED/i,
      `${name}: ${entry.id}'s reference failed its own instructor tests - the recovery page cannot be completed`
    );
    // The reference printed *this* page's answer, not a verdict another entry left in the panel: a
    // distinctive line of the registry's expected output has to be in what the run produced.
    const signature = entry.expected
      .trim()
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 12);
    assert.ok(signature, `${name}: ${entry.id}'s expected output has no line to identify it by`);
    assert.ok(
      result.referenceStdout.includes(signature),
      `${name}: ${entry.id}'s reference printed another page's output (expected a line like "${signature}")`
    );
    assert.equal(
      result.referenceStatus,
      'status-assert-passed',
      `${name}: ${entry.id}'s reference must finish verified, not just badge-passed`
    );
    console.log(
      `    [ramp] ${name} ${entry.id}: load+starter ${(result.loadMs / 1000).toFixed(1)}s, reference ${(result.referenceMs / 1000).toFixed(1)}s`
    );
  }
  console.log(
    `  ok ${name}: ramp ${entries[0].id}..${entries[entries.length - 1].id} - each starter stays unverified and each reference verifies (${((Date.now() - startedAt) / 1000).toFixed(1)}s)`
  );
}

async function checkInBrowser(name, launcher, baseUrl, gradingIds) {
  let browser;
  const envPath = process.env[`PLAYWRIGHT_${name.toUpperCase()}_EXECUTABLE_PATH`];
  // Chromium falls back to the machine's own Chrome when the downloaded Playwright build is absent
  // (`resolveChromiumExecutable`), so a developer box without `playwright install` still runs this.
  const executablePath =
    envPath && fs.existsSync(envPath)
      ? envPath
      : name === 'chromium'
      ? resolveChromiumExecutable()
      : undefined;
  try {
    browser = await launcher.launch({ ...(executablePath ? { executablePath } : {}), headless: true });
  } catch (error) {
    console.log(`  SKIP ${name}: ${String(error.message).split('\n')[0].slice(0, 140)}`);
    return 'skip';
  }
  try {
    const context = await browser.newContext();
    // The predict-first gate is its own suite (`test:e2e:predict`); this sweep grades 44 started
    // runs on the built bundle and must not answer a prompt between each one.
    await context.addInitScript(() => {
      window.__mechalabPredictFirst = false;
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(String(error)));

    await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForFunction(() => (document.getElementById('root')?.children.length ?? 0) > 0, { timeout: 20000 });
    assert.equal(pageErrors.length, 0, `${name}: page errors after mount: ${pageErrors.join(' | ')}`);

    // The release identity, read from the bundle learners open. The footer prints package.json's
    // version through the define `vite.config.ts` injects; a build that lost that define would print
    // the development fallback here, which is exactly what this check exists to catch.
    const releaseVersion = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')
    ).version;
    assert.equal(
      (await page.getByTestId('app-version').textContent())?.trim(),
      `v${releaseVersion}`,
      `${name}: the footer must print package.json's version (v${releaseVersion})`
    );

    // The Beginner/Advanced view switch must work on the built bundle too.
    await page.getByTestId('btn-mode-advanced').click();
    await page.getByTestId('btn-mode-beginner').click();

    await page.getByTestId('tab-btn-tab-pyodide').click();
    const exerciseIds = discoverExerciseIds();
    const bundledExercises = await page.locator('[data-testid^="lesson-item-EX."]').count();
    assert.equal(
      bundledExercises,
      exerciseIds.length,
      `${name}: the bundle carries ${bundledExercises} EX.* entries but exercises/ has ${exerciseIds.length} packages`
    );
    for (const lesson of LATER_TRACK_LESSONS) {
      const item = page.getByTestId(`lesson-item-${lesson}`);
      await item.scrollIntoViewIfNeeded();
      await item.click();
      const starter = await getEditorCode(page);
      assert.ok(starter.trim().length > 40, `${name}: lesson ${lesson} starter code is empty`);
      const expected = (await page.getByTestId('pre-expected-stdout').textContent())?.trim() ?? '';
      assert.ok(expected.length > 0, `${name}: lesson ${lesson} has no expected output to grade against`);
      assert.ok(
        starter.includes('TODO'),
        `${name}: lesson ${lesson} starter code carries no TODO for the learner to complete`
      );
      console.log(`  ok ${name}: lesson ${lesson} loads ${starter.length} chars of starter code + expected output`);
    }

    // Every exercise entry is generated from its package, not hand-written into the registry: each
    // must appear in the same list, fail on its own holes, and pass once the reference is loaded.
    // That is the whole delivery claim, checked on the bundle learners actually open. `gradingIds` is
    // every package in this browser for the exhaustive pass, or the sample for a second browser.
    assert.ok(
      gradingIds.every((id) => exerciseIds.includes(id)),
      `${name}: the grading list carries an id exercises/ does not have`
    );
    const gradingScope =
      gradingIds.length === exerciseIds.length
        ? `all ${exerciseIds.length} graded exercise entries`
        : `${gradingIds.length} of ${exerciseIds.length} graded exercise entries (one per track, plus both ends)`;
    const exercisePassStarted = Date.now();
    // One page, one pass: the loop lives in the page now (see `gradeInPage`), so there is nothing to
    // parallelise - a second page only added its own load and runtime, measured at +0.2 s.
    const results = await gradeInPage(page, gradingIds);
    assert.equal(
      results.length,
      gradingIds.length,
      `${name}: the sweep returned ${results.length} results for ${gradingIds.length} packages`
    );
    for (const result of results) assertGraded(result, name);
    console.log(
      `  ok ${name}: ${gradingScope} (${gradingIds[0]} .. ${gradingIds[gradingIds.length - 1]}) ` +
        `failed their starter on a hole and matched on their reference in ${((Date.now() - exercisePassStarted) / 1000).toFixed(1)}s`
    );

    // The cheat case, on the bundle learners actually open: printing an entry's own PASS line
    // matches the presentation check while the behavioural badge fails, so nothing is verified.
    // One Tier 2 entry and one Tier 3 entry - a beginner's first graded package is Tier 2, and a
    // Tier 3-only case would not notice a Tier 2 regression in how the self-check is attached.
    //
    // In a fresh context, because the sweep above wrote a draft for every entry it graded. Drafts
    // are per lesson and kept - that is the retention rule - so reopening EX.02 on `page` would
    // correctly show the reference solution the sweep saved, and the wait below would be waiting for
    // a starter the store deliberately did not restore. The fixture starts clean rather than
    // depending on an old cap having evicted the lesson by now.
    const cheatContext = await browser.newContext();
    await cheatContext.addInitScript(() => {
      window.__mechalabPredictFirst = false;
    });
    const cheatPage = await cheatContext.newPage();
    await cheatPage.goto(baseUrl, { waitUntil: 'networkidle', timeout: 45000 });
    await cheatPage.waitForFunction(() => (document.getElementById('root')?.children.length ?? 0) > 0, { timeout: 20000 });
    await cheatPage.getByTestId('tab-btn-tab-pyodide').click();
    for (const cheatId of ['EX.02-mechanics.T2.02a', 'EX.05-control.T3.05a']) {
      const entry = cheatPage.getByTestId(`lesson-item-${cheatId}`);
      await entry.scrollIntoViewIfNeeded();
      await entry.click();
      await cheatPage.waitForFunction(
        (key) => (window.__mechalabEditors?.[key]?.get() ?? '').includes('raise NotImplementedError'),
        'editor-main',
        { timeout: 15000 }
      );
      const verifiedBefore = (await cheatPage.getByTestId('runner-verified-count').textContent())?.trim();
      const cheatExpected = (await cheatPage.getByTestId('pre-expected-stdout').textContent())?.trim() ?? '';
      assert.match(
        cheatExpected,
        /SELF-CHECK PASS/,
        `${name}: ${cheatId} expected output is not its self-check PASS line`
      );
      await setEditorCode(cheatPage, `print(${JSON.stringify(cheatExpected)})\n`);
      await cheatPage.getByTestId('btn-run-verify').click();
      await cheatPage.waitForFunction(
        () => {
          const outBadge = document.querySelector('[data-testid="badge-output-check"]');
          const behBadge = document.querySelector('[data-testid="badge-behavior-check"]');
          return (
            outBadge?.textContent?.includes('MATCHED') &&
            behBadge?.textContent?.includes('FAILED')
          );
        },
        undefined,
        { timeout: 90000 }
      );
      assert.equal(
        (await cheatPage.getByTestId('runner-verified-count').textContent())?.trim(),
        verifiedBefore,
        `${name}: printing ${cheatId}'s PASS line must not change the verified count`
      );
    }
    await cheatContext.close();
    console.log(`  ok ${name}: a Tier 2 and a Tier 3 entry print their own PASS line and stay unverified`);

    // The recovery path, graded where it is used: every ramp page repairs an exit-check item, so
    // each one must reject its starter and verify its own reference on the built bundle.
    await gradeRampEntries(page, name);

    // Debug (⌥4) is the one preset that is an *arrangement* and not only a set of hidden regions:
    // the editor on the left, the results on the right. Measured here, on the built bundle, because
    // the two columns are Tailwind utilities and the dev server the workbench suites share resolves
    // its config without the Tailwind plugin — there `display` reads `block` on the same container.
    const wideContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await wideContext.addInitScript(() => {
      window.__mechalabPredictFirst = false;
    });
    const wide = await wideContext.newPage();
    await wide.goto(baseUrl, { waitUntil: 'networkidle', timeout: 45000 });
    await wide.waitForFunction(() => (document.getElementById('root')?.children.length ?? 0) > 0, { timeout: 20000 });
    await wide.getByTestId('tab-btn-tab-pyodide').click();
    await wide.getByTestId('lesson-item-06.1').click();
    await wide.waitForSelector('[data-editor="editor-main"] .cm-content', { state: 'visible', timeout: 10000 });
    // The shortcut, not the button: ⌥4 is how a learner changes preset without leaving the editor.
    await wide.keyboard.press('Alt+4');
    await wide.waitForFunction(
      () => document.querySelector('[data-layout]')?.getAttribute('data-layout') === 'debug',
      undefined,
      { timeout: 5000 }
    );
    const split = await wide.evaluate(() => {
      const box = document.querySelector('[data-layout]');
      const editor = document.querySelector('[data-testid="editor-panel"]').getBoundingClientRect();
      const results = document.querySelector('[data-testid="results-panel"]').getBoundingClientRect();
      return {
        columns: getComputedStyle(box).gridTemplateColumns.split(' ').length,
        editorWidth: Math.round(editor.width),
        editorRight: Math.round(editor.right),
        resultsLeft: Math.round(results.left),
      };
    });
    assert.equal(split.columns, 2, `${name}: ⌥4 must lay the work area out in two columns`);
    assert.ok(
      split.resultsLeft >= split.editorRight,
      `${name}: Debug must put the results beside the editor, but the editor runs to ${split.editorRight}px ` +
        `and the results start at ${split.resultsLeft}px`
    );
    assert.ok(
      split.editorWidth > 320,
      `${name}: Debug's editor column is ${split.editorWidth}px, too narrow to type in at 1440px`
    );
    console.log(
      `  ok ${name}: ⌥4 puts the results beside the editor (editor ${split.editorWidth}px, results from ${split.resultsLeft}px)`
    );

    // The reading pane: Study renders the page itself (a heading, the lesson's own code, an
    // equation), the GitHub link is demoted to a source link, and the heading at the top of the
    // pane survives a reload. Measured on the built bundle because it needs the real payload
    // fetched from `dist/lesson-pages/`, which is exactly what a learner's first visit does.
    await wide.keyboard.press('Alt+1');
    await wide.waitForFunction(
      () => document.querySelector('[data-layout]')?.getAttribute('data-layout') === 'study',
      undefined,
      { timeout: 5000 }
    );
    await wide.getByTestId('reader-loading').waitFor({ state: 'detached', timeout: 20000 });
    const reader = await wide.evaluate(() => {
      const box = document.querySelector('[data-testid="lesson-reader"]');
      const scroll = document.querySelector('[data-testid="reader-scroll"]');
      const editor = document.querySelector('[data-testid="editor-panel"]').getBoundingClientRect();
      const readerBox = box.getBoundingClientRect();
      return {
        headings: [...box.querySelectorAll('[data-reader-anchor]')].map((heading) => heading.id),
        formulas: box.querySelectorAll('.katex').length,
        code: box.querySelectorAll('pre code').length,
        source: (document.querySelector('[data-testid="link-lesson-source"]')?.textContent ?? '').trim(),
        readerLeft: Math.round(readerBox.left),
        readerRight: Math.round(readerBox.right),
        readerWidth: Math.round(readerBox.width),
        editorLeft: Math.round(editor.left),
        editorWidth: Math.round(editor.width),
        scrollable: scroll.scrollHeight > scroll.clientHeight,
      };
    });
    assert.ok(reader.headings.length >= 3, `${name}: the pane rendered ${reader.headings.length} headings`);
    assert.ok(reader.formulas > 0, `${name}: the pane must typeset the lesson's equations`);
    assert.ok(reader.code > 0, `${name}: the pane must render the lesson's own code fences`);
    assert.equal(
      reader.source,
      'View source on GitHub ↗',
      `${name}: the GitHub link must be demoted to the source link`
    );
    assert.ok(
      reader.readerRight <= reader.editorLeft,
      `${name}: Study must put the lesson text beside the editor, but the text ends at ` +
        `${reader.readerRight}px and the editor starts at ${reader.editorLeft}px`
    );
    assert.ok(
      reader.readerWidth > 320 && reader.editorWidth > 320,
      `${name}: Study's two columns are ${reader.readerWidth}px and ${reader.editorWidth}px, too narrow at 1440px`
    );
    assert.equal(reader.scrollable, true, `${name}: a long lesson needs its own scroll container`);
    console.log(
      `  ok ${name}: Study reads beside the code (${reader.headings.length} headings, ` +
        `${reader.formulas} equations, text ${reader.readerWidth}px beside editor ${reader.editorWidth}px)`
    );

    // The reading position: scroll to a heading, reload, and find the same heading at the top of
    // the pane. A raw pixel would land in a paragraph that moved; the anchor is what a regenerated
    // page keeps.
    const scrolled = await wide.evaluate(() => {
      const scroll = document.querySelector('[data-testid="reader-scroll"]');
      const heading = document.querySelectorAll('[data-reader-anchor]')[3];
      scroll.scrollTop = heading.offsetTop + 24;
      scroll.dispatchEvent(new Event('scroll'));
      return { anchor: heading.dataset.readerAnchor, at: scroll.scrollTop };
    });
    await wide.waitForTimeout(500);
    await wide.reload({ waitUntil: 'networkidle', timeout: 45000 });
    if (await wide.getByTestId('tab-btn-tab-pyodide').count()) {
      await wide.getByTestId('tab-btn-tab-pyodide').click();
    }
    await wide.getByTestId('reader-loading').waitFor({ state: 'detached', timeout: 20000 });
    const restored = await wide.evaluate(() => {
      const scroll = document.querySelector('[data-testid="reader-scroll"]');
      let top = '';
      for (const heading of document.querySelectorAll('[data-reader-anchor]')) {
        if (heading.offsetTop <= scroll.scrollTop + 8) top = heading.dataset.readerAnchor;
        else break;
      }
      return { at: Math.round(scroll.scrollTop), top };
    });
    assert.ok(restored.at > 0, `${name}: the pane came back at the top instead of where it was left`);
    assert.equal(
      restored.top,
      scrolled.anchor,
      `${name}: the pane came back at ${restored.at}px, under "${restored.top}", not "${scrolled.anchor}"`
    );
    console.log(
      `  ok ${name}: the reading position comes back on its heading (${restored.top} at ${restored.at}px)`
    );

    // ...and the next lesson starts at its own top, not at the previous lesson's offset.
    await wide.getByTestId('lesson-item-05.1').click();
    await wide.getByTestId('reader-loading').waitFor({ state: 'detached', timeout: 20000 });
    const nextLessonTop = await wide.evaluate(
      () => Math.round(document.querySelector('[data-testid="reader-scroll"]').scrollTop)
    );
    assert.equal(nextLessonTop, 0, `${name}: a lesson never read here must start at the top`);
    console.log(`  ok ${name}: a lesson never read here starts at the top`);

    // Back to Debug for the divider below: the reading checks left the screen in Study.
    await wide.keyboard.press('Alt+4');
    await wide.waitForFunction(
      () => document.querySelector('[data-layout]')?.getAttribute('data-layout') === 'debug',
      undefined,
      { timeout: 5000 }
    );

    // The divider drags, and the share it leaves behind survives a reload. Measured as track widths
    // rather than as state: the promise is about where the boundary is on screen. The gap comes out
    // of the free space before the two tracks share it, so the target is `left + free * share`.
    const divider = wide.getByTestId('split-divider');
    assert.equal(await divider.count(), 1, `${name}: Debug must offer a divider to drag`);
    await divider.scrollIntoViewIfNeeded();
    const box = await wide.evaluate(() => {
      const container = document.querySelector('[data-layout]');
      const rect = container.getBoundingClientRect();
      const gap = Number.parseFloat(getComputedStyle(container).columnGap) || 0;
      return { left: rect.left, width: rect.width, gap };
    });
    const free = box.width - box.gap;
    const dragTo = async (share) => {
      await divider.scrollIntoViewIfNeeded();
      const handle = await divider.boundingBox();
      // The handle is as tall as the results column, which can be taller than the window: aiming at
      // its middle would put the pointer below the viewport, where no mouse event lands at all.
      const y = handle.y + Math.min(handle.height / 2, 240);
      await wide.mouse.move(handle.x + handle.width / 2, y);
      await wide.mouse.down();
      await wide.mouse.move(box.left + free * share, y, { steps: 8 });
      await wide.mouse.up();
    };
    const shareNow = async () =>
      wide.evaluate(() => {
        const container = document.querySelector('[data-layout]');
        const gap = Number.parseFloat(getComputedStyle(container).columnGap) || 0;
        const editor = document.querySelector('[data-testid="editor-panel"]').getBoundingClientRect();
        const value = Number(
          document.querySelector('[data-testid="split-divider"]').getAttribute('aria-valuenow')
        );
        return {
          editorWidth: Math.round(editor.width),
          share: Math.round((editor.width / (container.getBoundingClientRect().width - gap)) * 100),
          announced: value,
        };
      });
    await dragTo(0.35);
    const dragged = await shareNow();
    assert.ok(
      Math.abs(dragged.share - 35) <= 2,
      `${name}: dragging to 35% left the editor at ${dragged.share}% (${dragged.editorWidth}px of ${Math.round(free)}px)`
    );
    assert.equal(
      dragged.announced,
      dragged.share,
      `${name}: the separator must announce the share it actually has (${dragged.announced} vs ${dragged.share})`
    );
    console.log(
      `  ok ${name}: dragging the divider moves the boundary (35% → editor ${dragged.editorWidth}px, announced ${dragged.announced}%)`
    );

    // ...and the keyboard reaches the same two ends, at the clamp: Home is the narrowest editor the
    // preset allows, End the widest.
    await divider.focus();
    await wide.keyboard.press('Home');
    const narrowest = await shareNow();
    await wide.keyboard.press('End');
    const widest = await shareNow();
    assert.equal(narrowest.share, 30, `${name}: Home must be the 30% clamp, got ${narrowest.share}%`);
    assert.equal(widest.share, 70, `${name}: End must be the 70% clamp, got ${widest.share}%`);
    console.log(
      `  ok ${name}: Home and End walk the divider to the two clamps (${narrowest.share}% / ${widest.share}%)`
    );

    // A reload is the assertion that matters: a divider that only lives in React state would be back
    // at half on the next visit, and the learner would drag it again every time.
    await wide.reload({ waitUntil: 'networkidle', timeout: 45000 });
    if (await wide.getByTestId('tab-btn-tab-pyodide').count()) {
      await wide.getByTestId('tab-btn-tab-pyodide').click();
    }
    await wide.waitForFunction(
      () => document.querySelector('[data-layout]')?.getAttribute('data-layout') === 'debug',
      undefined,
      { timeout: 10000 }
    );
    const remembered = await shareNow();
    assert.equal(
      remembered.share,
      70,
      `${name}: the divider must come back where it was left, got ${remembered.share}%`
    );
    console.log(`  ok ${name}: the divider comes back where it was left (${remembered.share}%)`);

    // Docking, measured where the utilities exist: the results move to the left of the editor and
    // stay on the same row, and the share is still *the editor's* — the same 70% is now the second
    // track, so the editor is the wide one on the right. Dragging is measured again because the
    // pointer mapping reverses with the panel: the boundary at 65% of the free space is a 35%
    // editor, not a 65% one.
    await wide.getByTestId('btn-dock-toggle').click();
    const dockGeometry = () =>
      wide.evaluate(() => {
        const box = document.querySelector('[data-layout]');
        const rect = box.getBoundingClientRect();
        const gap = Number.parseFloat(getComputedStyle(box).columnGap) || 0;
        const editor = document.querySelector('[data-testid="editor-panel"]').getBoundingClientRect();
        const results = document.querySelector('[data-testid="results-column"]').getBoundingClientRect();
        return {
          dock: box.getAttribute('data-dock'),
          editorLeft: Math.round(editor.left),
          editorWidth: Math.round(editor.width),
          editorTop: Math.round(editor.top),
          resultsRight: Math.round(results.right),
          resultsTop: Math.round(results.top),
          sameRow: Math.abs(Math.round(editor.top) - Math.round(results.top)) <= 1,
          share: Math.round((editor.width / (rect.width - gap)) * 100),
          announced: Number(
            document.querySelector('[data-testid="split-divider"]').getAttribute('aria-valuenow')
          ),
        };
      });
    const docked = await dockGeometry();
    assert.equal(docked.dock, 'left', `${name}: the dock button must report the results docked left`);
    assert.ok(
      docked.resultsRight <= docked.editorLeft,
      `${name}: a results column docked left must end before the editor starts, but it ends at ` +
        `${docked.resultsRight}px and the editor starts at ${docked.editorLeft}px`
    );
    assert.equal(
      docked.sameRow,
      true,
      `${name}: the docked pair must share a row (editor top ${docked.editorTop}, results top ${docked.resultsTop})`
    );
    assert.ok(
      docked.editorWidth > 320,
      `${name}: the docked editor column is ${docked.editorWidth}px, too narrow to type in`
    );
    assert.equal(
      docked.share,
      docked.announced,
      `${name}: the separator must still announce the editor's share when the results are left ` +
        `(${docked.announced} vs ${docked.share})`
    );
    console.log(
      `  ok ${name}: the results dock left of the editor on the same row (editor ${docked.editorWidth}px on the right)`
    );

    await dragTo(0.65);
    const dockedDrag = await dockGeometry();
    assert.ok(
      Math.abs(dockedDrag.share - 35) <= 2,
      `${name}: dragging to 65% of the width with the results on the left must leave the editor at ` +
        `35%, got ${dockedDrag.share}%`
    );
    await divider.focus();
    await wide.keyboard.press('Home');
    const dockedHome = await dockGeometry();
    assert.equal(
      dockedHome.share,
      70,
      `${name}: Home puts the handle at the left edge, which is the editor at its widest when the ` +
        `results are docked left; got ${dockedHome.share}%`
    );
    await wide.reload({ waitUntil: 'networkidle', timeout: 45000 });
    if (await wide.getByTestId('tab-btn-tab-pyodide').count()) {
      await wide.getByTestId('tab-btn-tab-pyodide').click();
    }
    await wide.waitForFunction(
      () => document.querySelector('[data-layout]')?.getAttribute('data-dock') === 'left',
      undefined,
      { timeout: 10000 }
    );
    const dockRemembered = await dockGeometry();
    assert.equal(
      dockRemembered.share,
      70,
      `${name}: the docked side and its share must both survive the reload`
    );
    console.log(
      `  ok ${name}: the docked side survives a reload (results left, editor ${dockRemembered.share}%)`
    );

    // The activity bar: at 1440 the tab rail is a vertical strip down the left edge, every tab in
    // one column and nothing behind a sideways scroll. Below `xl` the same rail is the horizontal
    // scroller the tablet check drives.
    const activityBar = await wide.evaluate(() => {
      const rail = document.querySelector('[data-chrome="rail"]');
      const row = document.querySelector('[data-testid="tab-rail"]');
      const main = document.getElementById('main');
      const buttons = [...row.querySelectorAll('[data-testid^="tab-btn-"]')];
      return {
        railLeft: Math.round(rail.getBoundingClientRect().left),
        railRight: Math.round(rail.getBoundingClientRect().right),
        mainLeft: Math.round(main.getBoundingClientRect().left),
        direction: getComputedStyle(row).flexDirection,
        sideways: row.scrollWidth - row.clientWidth,
        count: buttons.length,
        narrowest: Math.round(Math.min(...buttons.map((button) => button.getBoundingClientRect().width))),
      };
    });
    assert.equal(
      activityBar.direction,
      'column',
      `${name}: at 1440px the tab rail must be a vertical activity bar, got ${activityBar.direction}`
    );
    assert.ok(
      activityBar.railLeft < activityBar.mainLeft,
      `${name}: the activity bar must sit beside the workbench, not above it ` +
        `(rail ${activityBar.railLeft}–${activityBar.railRight}px, main starts ${activityBar.mainLeft}px)`
    );
    assert.ok(
      activityBar.sideways <= 1,
      `${name}: the activity bar must not need a sideways scroll at 1440px (${activityBar.sideways}px past)`
    );
    assert.ok(
      activityBar.count >= 5 && activityBar.narrowest > 120,
      `${name}: every tab must have room for its label in the activity bar ` +
        `(${activityBar.count} tabs, narrowest ${activityBar.narrowest}px)`
    );
    console.log(
      `  ok ${name}: at 1440px the ${activityBar.count} tabs are an activity bar beside the workbench ` +
        `(rail ends at ${activityBar.railRight}px, main starts at ${activityBar.mainLeft}px)`
    );

    // Study's half of docking: the lesson text takes the second cell, so it sits to the right of
    // the editor instead of on the left. Measured on the bundle because the columns are a grid
    // template, and the reload is the promise that a side is a preference.
    await wide.getByTestId('layout-study').click();
    await wide.getByTestId('btn-dock-toggle').click();
    const studyDock = () =>
      wide.evaluate(() => {
        const readerBox = document
          .querySelector('[data-testid="lesson-reader"]')
          .getBoundingClientRect();
        const editor = document.querySelector('[data-testid="editor-panel"]').getBoundingClientRect();
        const work = document.querySelector('[data-layout]');
        return {
          side: work.getAttribute('data-lesson-dock'),
          editorRight: Math.round(editor.right),
          readerLeft: Math.round(readerBox.left),
          readerWidth: Math.round(readerBox.width),
          sameRow: Math.abs(Math.round(readerBox.top) - Math.round(editor.top)) <= 1,
        };
      });
    const studyDocked = await studyDock();
    assert.equal(studyDocked.side, 'right', `${name}: the lesson text must report the side it moved to`);
    assert.ok(
      studyDocked.readerLeft >= studyDocked.editorRight - 1,
      `${name}: a lesson pane docked right must start after the editor ends, but it starts at ` +
        `${studyDocked.readerLeft}px and the editor ends at ${studyDocked.editorRight}px`
    );
    assert.equal(
      studyDocked.sameRow,
      true,
      `${name}: the lesson text and the editor must stay on one row`
    );
    assert.ok(
      studyDocked.readerWidth > 320,
      `${name}: a docked lesson pane is ${studyDocked.readerWidth}px wide, too narrow to read`
    );
    await wide.reload({ waitUntil: 'networkidle', timeout: 45000 });
    if (await wide.getByTestId('tab-btn-tab-pyodide').count()) {
      await wide.getByTestId('tab-btn-tab-pyodide').click();
    }
    await wide.waitForFunction(
      () => document.querySelector('[data-layout]')?.getAttribute('data-lesson-dock') === 'right',
      undefined,
      { timeout: 10000 }
    );
    const studyRemembered = await studyDock();
    assert.equal(studyRemembered.side, 'right', `${name}: the lesson pane's side must survive a reload`);
    console.log(
      `  ok ${name}: Study's lesson text docks right of the editor and comes back there ` +
        `(${studyDocked.readerWidth}px, editor ends at ${studyDocked.editorRight}px)`
    );
    await wide.close();

    // Tablet viewport: the tab bar, lesson list and editor must all stay reachable, and the layout
    // must fit the viewport - the header used to push a 249px horizontal overflow here, so a page
    // that scrolls sideways is a failure, not a note.
    const tabletContext = await browser.newContext({ viewport: TABLET_VIEWPORT });
    await tabletContext.addInitScript(() => {
      window.__mechalabPredictFirst = false;
    });
    const tablet = await tabletContext.newPage();
    await tablet.goto(baseUrl, { waitUntil: 'networkidle', timeout: 45000 });
    await tablet.waitForFunction(() => (document.getElementById('root')?.children.length ?? 0) > 0, { timeout: 20000 });
    await tablet.getByTestId('tab-btn-tab-pyodide').click();
    const lesson = tablet.getByTestId('lesson-item-06.1');
    await lesson.scrollIntoViewIfNeeded();
    assert.ok(await lesson.isVisible(), `${name}: at ${TABLET_VIEWPORT.width}px the lesson list is not usable`);
    await lesson.click();
    await tablet.waitForSelector('[data-editor="editor-main"] .cm-content', { state: 'visible', timeout: 10000 });

    // The runner header must cost the step it names from the same generated spine the cards read:
    // the total, then the arm pass the learner is in and the depth pass after Step 10.
    const stepCost =
      (await tablet.getByTestId('lesson-step-cost').textContent())?.trim() ?? '';
    assert.match(
      stepCost,
      /^\d+(?:\.\d+)?(?:–[\d.]+)? h · arm [\d.]+(?:–[\d.]+)? h · depth [\d.]+(?:–[\d.]+)? h$/,
      `${name}: the lesson header must print the step's focused hours and arm/depth split, got "${stepCost}"`
    );

    // The lesson header used to be one nowrap flex row whose spans could shrink, so at this width
    // "Lesson P.1" split across two lines and the pass badge read across three. Items may move to
    // the next line as whole units; none of them may break inside itself.
    const brokenHeader = await tablet.evaluate(() => {
      const row = document.querySelector('[data-testid="lesson-meta"]');
      if (!row) return ['no lesson header'];
      const oneLine = parseFloat(getComputedStyle(row).fontSize) * 1.9;
      return [...row.children]
        .filter((element) => (element.textContent || '').trim())
        .filter((element) => element.getBoundingClientRect().height > oneLine)
        .map(
          (element) =>
            `"${(element.textContent || '').trim().slice(0, 28)}" is ${Math.round(
              element.getBoundingClientRect().height
            )}px tall`
        );
    });
    assert.equal(
      brokenHeader.length,
      0,
      `${name}: at ${TABLET_VIEWPORT.width}px the lesson header must not break an item across lines; ` +
        brokenHeader.join('; ')
    );

    assert.ok(await tablet.getByTestId('btn-run-verify').isVisible(), `${name}: Run & Verify is not visible on a tablet`);
    assert.ok(await tablet.getByTestId('btn-export-portfolio').isVisible(), `${name}: Export Progress is not visible on a tablet`);
    const layout = await tablet.evaluate(() => {
      const doc = document.documentElement;
      const viewportWidth = window.innerWidth;
      // The tab rail is a horizontal scroller on purpose: its cards past the right edge are reached
      // by scrolling the rail, not by scrolling the page. Counting them as spilled would forbid the
      // rail; the page itself still has to have zero horizontal overflow, which is asserted below.
      const insideHorizontalScroller = (element) => {
        for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
          if (/auto|scroll/.test(getComputedStyle(node).overflowX) && node.scrollWidth > node.clientWidth + 1) {
            return true;
          }
        }
        return false;
      };
      // KaTeX writes a second, screen-reader-only copy of every formula as MathML inside
      // `.katex-mathml`, clipped to a sliver by `clip-path` (node_modules/katex/dist/katex.css, with
      // the comment "Accessibility hack to only show to screen readers"). Its `<mo>` boxes are that
      // geometry and are invisible, and Firefox on Linux lays them out wider than macOS does: 34 of
      // them crossed a tablet's right edge while the document itself scrolled by 0px. Like the SVG
      // `<path>` below, they are drawing geometry, not a layout box — the document's own overflow is
      // still asserted, and that is the thing a learner can actually scroll. The clip test is what
      // keeps this from becoming a blanket exemption: an unclipped math box is still counted.
      const clippedMath = (element) => {
        const copy = element.closest('.katex-mathml');
        if (!copy) return false;
        const style = getComputedStyle(copy);
        return style.clipPath !== 'none' || style.clip !== 'auto';
      };
      const pastEdge = [...document.querySelectorAll('body *')]
        .map((element) => ({ element, rect: element.getBoundingClientRect() }))
        .filter(({ rect }) => rect.width > 0 && rect.height > 0 && rect.right - viewportWidth > 1)
        .filter(({ element }) => !insideHorizontalScroller(element));
      const ignored = pastEdge.filter(
        ({ element }) => element.ownerSVGElement || clippedMath(element)
      ).length;
      const spilled = pastEdge
        .filter(({ element }) => !element.ownerSVGElement && !clippedMath(element))
        .sort((a, b) => b.rect.right - a.rect.right);
      const worst = spilled[0];
      return {
        overflow: doc.scrollWidth - doc.clientWidth,
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
        spilled: spilled.length,
        ignored,
        worst: worst
          ? `${worst.element.tagName.toLowerCase()}${worst.element.dataset?.testid ? `[data-testid=${worst.element.dataset.testid}]` : ''} runs to ${Math.round(worst.rect.right)}px`
          : '',
      };
    });
    assert.ok(
      layout.overflow <= 0 && layout.spilled === 0,
      `${name}: at ${TABLET_VIEWPORT.width}px the workbench scrolls sideways by ${layout.overflow}px ` +
        `(scrollWidth ${layout.scrollWidth} > clientWidth ${layout.clientWidth}); ${layout.spilled} element(s) past the viewport` +
        (layout.worst ? `, worst: ${layout.worst}` : '') +
        (layout.ignored ? ` (${layout.ignored} clipped SVG/MathML box(es) not counted)` : '')
    );
    console.log(
      `  ok ${name}: tablet ${TABLET_VIEWPORT.width}x${TABLET_VIEWPORT.height} keeps nav, lesson list and runner usable within the viewport (horizontal overflow ${layout.overflow}px` +
        `${layout.ignored ? `, ${layout.ignored} clipped SVG/MathML box(es) skipped` : ''})`
    );
    await tablet.close();
    return 'pass';
  } finally {
    await browser.close();
  }
}

async function main() {
  // `PAGES_SERVER_URL` names a dist server the combined runner already started for all three
  // suites, base path included; without it this script builds and serves the bundle itself.
  const sharedBaseUrl = process.env.PAGES_SERVER_URL;
  if (!sharedBaseUrl) ensureBuilt();
  const refs = checkBuiltHtml();
  const served = sharedBaseUrl ? null : await startStaticServer();
  const baseUrl = sharedBaseUrl ? sharedBaseUrl.replace(/\/*$/, '/') : `http://127.0.0.1:${served.port}${BASE}`;
  try {
    await checkServed(baseUrl, refs);
    const wanted = (process.env.PLAYWRIGHT_BROWSERS ?? 'both').toLowerCase();
    // Each browser drives its own contexts against the same served bundle, so they run side by side:
    // the suite's wall clock is the slower browser, not the sum of both. Verdicts are collected in the
    // requested order, and each one is still SKIP-or-pass on its own.
    const selected = [
      ['chromium', chromium],
      ['firefox', firefox],
    ].filter(([name]) => wanted === name || wanted === 'both');
    if (!selected.length) throw new Error(`PLAYWRIGHT_BROWSERS=${wanted} selects no browser`);
    // The first selected browser (Chromium, unless it was not asked for) takes the exhaustive pass;
    // any browser after it grades the sample. So one browser always grades every package, and a
    // single-browser run is still exhaustive.
    const allExerciseIds = discoverExerciseIds();
    const sample = sampleExerciseIds(allExerciseIds);
    const settled = await Promise.all(
      selected.map(([name, launcher], index) =>
        checkInBrowser(name, launcher, baseUrl, index === 0 ? allExerciseIds : sample)
      )
    );
    const results = Object.fromEntries(selected.map(([name], index) => [name, settled[index]]));
    if (Object.values(results).every((value) => value === 'skip')) {
      throw new Error('no requested browser is installed - run `npx playwright-core install chromium firefox`');
    }
    const ran = Object.entries(results).filter(([, value]) => value === 'pass').map(([name]) => name);
    const skipped = Object.entries(results).filter(([, value]) => value === 'skip').map(([name]) => name);
    const grading = selected.length > 1
      ? `grades all ${allExerciseIds.length} exercise entries in ${selected[0][0]} and a ${sample.length}-entry sample in ` +
        `${selected.slice(1).map(([name]) => name).join(', ')}`
      : `grades all ${allExerciseIds.length} exercise entries in ${selected[0][0]}`;
    console.log(        `[PASS] Built Pages bundle at ${BASE} mounts, serves every asset, loads later-track lessons ` +
        `${LATER_TRACK_LESSONS.join(', ')}, grades ramp ${RAMP_LESSONS[0]}..${RAMP_LESSONS[RAMP_LESSONS.length - 1]} ` +
        `(starter unverified, reference verified), ${grading}, ` +
        `and stays usable at tablet width in: ${ran.join(', ')}` +
        (skipped.length ? ` (SKIP: ${skipped.join(', ')} not installed)` : '')
    );
  } finally {
    served?.server.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error('[FAIL] Pages bundle checks failed:', error.message);
    process.exit(1);
  });
}
