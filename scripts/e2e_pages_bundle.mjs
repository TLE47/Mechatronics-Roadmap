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
 *    viewport: zero horizontal overflow, asserted rather than reported.
 * 5. *Every* graded exercise entry is graded - once - discovered from each `exercises/<package>/exercise.json`
 *    rather than listed by hand: the starter fails on its `NotImplementedError`, the reference solution
 *    passes the appended self-check, and the output badge reads MATCHED, on the built bundle. A package
 *    added to `exercises/` is in this suite the next run, and a package whose entry the bundle does not
 *    carry fails the count in every browser, so the sweep cannot fall behind the registry.
 *    The sweep runs *inside* the page (`gradeInPage`): one `page.evaluate` clicks every lesson, runs the
 *    starter and the reference, and reads the badges. Measured: a click-to-result cycle is 8-14 ms in
 *    the page and ~100 ms through Playwright, so the harness, not the interpreter, was the cost.
 * 6. A second browser grades a *sample* (`sampleExerciseIds`), not the whole list: the same bundle,
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

const repoRoot = process.cwd();
export const BASE = (process.env.PAGES_BASE ?? '/Mechatronics-Roadmap/').replace(/\/?$/, '/');
const distDir = path.join(repoRoot, 'dist');
const LATER_TRACK_LESSONS = ['03.3', '06.1', '08.1'];
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

function ensureBuilt() {
  if (fs.existsSync(path.join(distDir, 'index.html'))) return;
  console.log('[build] dist/index.html is missing - running `npm run build` first');
  execFileSync('npm', ['run', 'build'], { stdio: 'inherit', cwd: repoRoot });
  assert.ok(fs.existsSync(path.join(distDir, 'index.html')), 'npm run build produced no dist/index.html');
}

/** Serve `dist/` under the Pages base path, the way GitHub Pages does for a project site. */
export function startStaticServer() {
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
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
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
    const editor = () => q('[data-testid="textarea-python-code"]')?.value ?? '';
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
      // React must commit the reference before Run is clicked: the handler captures the code it was
      // rendered with, so both clicks in one task would run the starter a second time.
      if (!(await waitFor(() => !editor().includes('raise NotImplementedError'), 15000))) {
        result.problem = "its reference never landed in the editor";
        continue;
      }
      const referenceBefore = text('[data-testid="pre-actual-stdout"]');
      q('[data-testid="btn-run-verify"]').click();
      if (!(await waitFor(() => {
        const out = text('[data-testid="pre-actual-stdout"]');
        return out !== referenceBefore && out.includes('SELF-CHECK PASS');
      }, 90000))) {
        result.problem = `its reference run never printed a PASS line (status ${statusId()})`;
        continue;
      }
      result.referenceBadges = badges();
    }
    return results;
  }, ids);
}

/** The delivery claim, asserted on what the page handed back for one package. */
function assertGraded(result, name) {
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

async function checkInBrowser(name, launcher, baseUrl, gradingIds) {
  let browser;
  const envPath = process.env[`PLAYWRIGHT_${name.toUpperCase()}_EXECUTABLE_PATH`];
  const executablePath = envPath && fs.existsSync(envPath) ? envPath : undefined;
  try {
    browser = await launcher.launch({ ...(executablePath ? { executablePath } : {}), headless: true });
  } catch (error) {
    console.log(`  SKIP ${name}: ${String(error.message).split('\n')[0].slice(0, 140)}`);
    return 'skip';
  }
  try {
    const page = await (await browser.newContext()).newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(String(error)));

    await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForFunction(() => (document.getElementById('root')?.children.length ?? 0) > 0, { timeout: 20000 });
    assert.equal(pageErrors.length, 0, `${name}: page errors after mount: ${pageErrors.join(' | ')}`);

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
      const starter = await page.getByTestId('textarea-python-code').inputValue();
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
    for (const cheatId of ['EX.02-mechanics.T2.02a', 'EX.05-control.T3.05a']) {
      const entry = page.getByTestId(`lesson-item-${cheatId}`);
      await entry.scrollIntoViewIfNeeded();
      await entry.click();
      await page.waitForFunction(
        () =>
          (document.querySelector('[data-testid="textarea-python-code"]')?.value ?? '').includes(
            'raise NotImplementedError'
          ),
        undefined,
        { timeout: 15000 }
      );
      const verifiedBefore = (await page.getByTestId('runner-verified-count').textContent())?.trim();
      const cheatExpected = (await page.getByTestId('pre-expected-stdout').textContent())?.trim() ?? '';
      assert.match(
        cheatExpected,
        /SELF-CHECK PASS/,
        `${name}: ${cheatId} expected output is not its self-check PASS line`
      );
      await page.getByTestId('textarea-python-code').fill(`print(${JSON.stringify(cheatExpected)})\n`);
      await page.getByTestId('btn-run-verify').click();
      await page.waitForFunction(
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
        (await page.getByTestId('runner-verified-count').textContent())?.trim(),
        verifiedBefore,
        `${name}: printing ${cheatId}'s PASS line must not change the verified count`
      );
    }
    console.log(`  ok ${name}: a Tier 2 and a Tier 3 entry print their own PASS line and stay unverified`);

    // Tablet viewport: the tab bar, lesson list and editor must all stay reachable, and the layout
    // must fit the viewport - the header used to push a 249px horizontal overflow here, so a page
    // that scrolls sideways is a failure, not a note.
    const tablet = await (await browser.newContext({ viewport: TABLET_VIEWPORT })).newPage();
    await tablet.goto(baseUrl, { waitUntil: 'networkidle', timeout: 45000 });
    await tablet.waitForFunction(() => (document.getElementById('root')?.children.length ?? 0) > 0, { timeout: 20000 });
    await tablet.getByTestId('tab-btn-tab-pyodide').click();
    const lesson = tablet.getByTestId('lesson-item-06.1');
    await lesson.scrollIntoViewIfNeeded();
    assert.ok(await lesson.isVisible(), `${name}: at ${TABLET_VIEWPORT.width}px the lesson list is not usable`);
    await lesson.click();
    await tablet.getByTestId('textarea-python-code').waitFor({ state: 'visible', timeout: 10000 });
    assert.ok(await tablet.getByTestId('btn-run-verify').isVisible(), `${name}: Run & Verify is not visible on a tablet`);
    assert.ok(await tablet.getByTestId('btn-export-portfolio').isVisible(), `${name}: Export Progress is not visible on a tablet`);
    const layout = await tablet.evaluate(() => {
      const doc = document.documentElement;
      const viewportWidth = window.innerWidth;
      const spilled = [...document.querySelectorAll('body *')]
        .map((element) => ({ element, rect: element.getBoundingClientRect() }))
        .filter(({ rect }) => rect.width > 0 && rect.height > 0 && rect.right - viewportWidth > 1)
        .sort((a, b) => b.rect.right - a.rect.right);
      const worst = spilled[0];
      return {
        overflow: doc.scrollWidth - doc.clientWidth,
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
        spilled: spilled.length,
        worst: worst
          ? `${worst.element.tagName.toLowerCase()}${worst.element.dataset?.testid ? `[data-testid=${worst.element.dataset.testid}]` : ''} runs to ${Math.round(worst.rect.right)}px`
          : '',
      };
    });
    assert.ok(
      layout.overflow <= 0 && layout.spilled === 0,
      `${name}: at ${TABLET_VIEWPORT.width}px the workbench scrolls sideways by ${layout.overflow}px ` +
        `(scrollWidth ${layout.scrollWidth} > clientWidth ${layout.clientWidth}); ${layout.spilled} element(s) past the viewport` +
        (layout.worst ? `, worst: ${layout.worst}` : '')
    );
    console.log(
      `  ok ${name}: tablet ${TABLET_VIEWPORT.width}x${TABLET_VIEWPORT.height} keeps nav, lesson list and runner usable within the viewport (horizontal overflow ${layout.overflow}px)`
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
        `${LATER_TRACK_LESSONS.join(', ')}, ${grading}, ` +
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
