#!/usr/bin/env node
/**
 * The workbench after the network is gone — `scripts/e2e_offline.mjs` (`npm run test:offline`).
 *
 * GitHub Pages cannot set `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy`, and it also
 * cannot make a static site work on a plane. Both jobs fall to `app/public/sw.js`, and this suite is the
 * only place either is proven the way Pages serves it: **without** the header pair, so the service worker
 * has to supply it, and then with the browser offline, so the shell has to come out of a cache.
 *
 * What it asserts, in order:
 * 1. the page registers the worker, the worker takes control, and the document reloads into an isolated
 *    one (`crossOriginIsolated === true`) — the Stop-in-place path depends on that pair;
 * 2. the shell, the built bundle and the manifest are in the caches, so the install did its job;
 * 3. **the take-offline button** caches the page's own bundle *and* the Python runtime, and reports a
 *    size — with no lesson run first, so the button is the only reason the interpreter is there;
 * 4. with the context offline, a reload still renders the workbench, a lesson still runs to the same
 *    verdict, and a **deep link** opens a lesson the cache never saw.
 * 5. **a lesson's formulas survive the flight.** Lesson 01.4 is opened while the network is still there
 *    — its reader payload, the KaTeX stylesheet and the faces its formulas need are served by this
 *    origin, so `cacheFirst` keeps them — then the browser's own HTTP cache is cleared, the context
 *    goes offline, and the page is reloaded. A formula that renders after that can only have come from
 *    `mechalab-assets-v1`, which is the claim the self-hosted stylesheet exists for.
 * 6. **a deploy replaces the old worker on one normal reload.** A temp build is served with a
 *    long-lived `index.html` cache and the frozen 4.11.0 worker; its index and worker are then replaced,
 *    and one reload must reach the new entry with the new worker controlling. This is the regression
 *    test for the stale-shell bug: the request path must not fall back to the cached document.
 *
 * Starting from the button rather than from a run is the point of the suite: the run path used to be
 * the only thing that pulled Pyodide in, and a learner about to board had no way to ask for it.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { waitForEditor } from './editor-code.mjs';
import { BASE, startStaticServer } from './e2e_pages_bundle.mjs';
import { seedTourSeen } from './tour_seed.mjs';
// The same executable search the other browser suites use: a machine with a system Chrome and no
// Playwright download is a normal machine, and this suite should run there too.
import { resolveChromiumExecutable } from './e2e_browser_workbench.mjs';

const repoRoot = process.cwd();
const distDir = path.join(repoRoot, 'dist');
const staleWorkerFixture = path.join(repoRoot, 'scripts', 'fixtures', 'sw-stale-shell.js');

function ensureBuilt() {
  if (fs.existsSync(path.join(distDir, 'index.html'))) return;
  console.log('[build] dist/index.html is missing - running `npm run build` first');
  execFileSync('npm', ['run', 'build'], { stdio: 'inherit', cwd: repoRoot });
  assert.ok(fs.existsSync(path.join(distDir, 'index.html')), 'npm run build produced no dist/index.html');
}

/** Run the open lesson and wait for its verdict badge; returns the badge text and the printed output. */
async function runLesson(page, timeoutMs = 180000) {
  await waitForEditor(page, undefined, 30000);
  await page.getByTestId('btn-run-verify').click();
  await page.waitForFunction(
    () => Boolean(document.querySelector('[data-testid^="status-"]')),
    undefined,
    { timeout: timeoutMs }
  );
  const verdict = (await page.evaluate(
    () => document.querySelector('[data-testid^="status-"]')?.textContent ?? ''
  )).trim();
  const stdout = (await page.getByTestId('pre-actual-stdout').textContent()) ?? '';
  return { verdict, stdout };
}

/** Wait across the worker's own reload: the page navigates while the worker claims it. */
async function waitForIsolated(page, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = '';
  while (Date.now() < deadline) {
    try {
      if (await page.evaluate(() => window.crossOriginIsolated === true)) return;
    } catch (error) {
      lastError = String(error.message ?? error); // a navigation was in flight; retry
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`the service worker never produced an isolated document (${lastError})`);
}

/** Wait across the worker's own reload for a build marker written by `writeShellBuild`. */
async function waitForEntry(page, expected, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (
        await page.evaluate(
          (want) => document.documentElement.dataset.entry === want,
          expected
        )
      ) {
        return;
      }
    } catch (error) {
      // A controllerchange reload can destroy the execution context between polls; retry.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`the page never reached the ${expected} entry`);
}

/** Write a tiny static build whose only job is to carry a build marker and a worker URL. */
function writeShellBuild(root, { marker, worker }) {
  fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'manifest.webmanifest'),
    JSON.stringify({ name: `stale-shell-${marker}`, short_name: 'stale-shell', start_url: './' })
  );
  fs.writeFileSync(
    path.join(root, 'favicon.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8" fill="#333"/></svg>'
  );
  fs.writeFileSync(
    path.join(root, 'assets', `entry-${marker}.js`),
    `window.__MECHALAB_ENTRY = ${JSON.stringify(marker)};\n` +
      `document.documentElement.dataset.entry = ${JSON.stringify(marker)};\n` +
      `document.getElementById('shell-marker').textContent = ${JSON.stringify(marker)};\n`
  );
  fs.writeFileSync(
    path.join(root, 'index.html'),
    `<!doctype html>\n` +
      `<html lang="en">\n` +
      `<head>\n` +
      `  <meta charset="utf-8" />\n` +
      `  <meta name="mechalab-build" content="${marker}" />\n` +
      `  <meta name="viewport" content="width=device-width, initial-scale=1" />\n` +
      `  <link rel="manifest" href="manifest.webmanifest" />\n` +
      `  <title>stale shell ${marker}</title>\n` +
      `</head>\n` +
      `<body>\n` +
      `  <p id="shell-marker">${marker}</p>\n` +
      `  <script src="${worker}"></script>\n` +
      `  <script src="assets/entry-${marker}.js"></script>\n` +
      `</body>\n` +
      `</html>\n`
  );
}

/** Read the document the worker cached as its shell, whichever key it used. */
async function readCachedShell(page) {
  return page.evaluate(async () => {
    const cache = await caches.open('mechalab-shell-v1');
    const response =
      (await cache.match(new URL('index.html', location.href).href)) ??
      (await cache.match(new URL('./', location.href).href));
    return response ? response.text() : '';
  });
}

/**
 * Ask the worker that currently controls the page for its test build id.
 *
 * The current worker copy gets a tiny test-only message handler appended. The old fixture has no
 * handler, so a page that never installs the new worker times out here even if the new HTML loaded.
 */
async function activeWorkerBuild(page, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let last = 'no reply';
  while (Date.now() < deadline) {
    try {
      const build = await page.evaluate(async () => {
        const controller = navigator.serviceWorker.controller;
        if (!controller) return 'no controller';
        return await new Promise((resolve) => {
          const channel = new MessageChannel();
          const timer = setTimeout(() => resolve('no reply'), 1000);
          channel.port1.onmessage = (event) => {
            clearTimeout(timer);
            resolve(event.data?.build ?? 'bad reply');
          };
          controller.postMessage({ type: 'mechalab-test-worker' }, [channel.port2]);
        });
      });
      last = build;
      if (build === 'new') return build;
    } catch (error) {
      last = String(error.message ?? error);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return last;
}

/**
 * The stale-shell deploy regression: old worker + a long-lived HTML cache, then a new index and worker.
 * One caller reload must reach the new entry and leave the new worker in control.
 */
async function checkStaleShellRefresh(browser) {
  const oldWorker = fs.readFileSync(staleWorkerFixture, 'utf8');
  assert.doesNotMatch(
    oldWorker,
    /fetch\(\s*request\s*,\s*\{\s*cache:\s*'no-store'\s*\}\s*\)/,
    'the stale-shell fixture must stay the pre-fix worker, not a copy of the current one'
  );
  const currentWorker = fs.readFileSync(path.join(distDir, 'sw.js'), 'utf8');
  assert.match(
    currentWorker,
    /fetch\(\s*request\s*,\s*\{\s*cache:\s*'no-store'\s*\}\s*\)/,
    'the built worker must keep the no-store shell fetch that makes a deploy fresh'
  );

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mechalab-stale-shell-'));
  writeShellBuild(tempRoot, { marker: 'old', worker: 'sw-old.js' });
  fs.writeFileSync(path.join(tempRoot, 'sw-old.js'), oldWorker);
  // The test-only handler identifies the active worker; it is appended to a copy, never to the build.
  fs.writeFileSync(
    path.join(tempRoot, 'sw-new.js'),
    `${currentWorker}\n` +
      `if (typeof window === 'undefined') {\n` +
      `  self.addEventListener('message', (event) => {\n` +
      `    if (!event.data || event.data.type !== 'mechalab-test-worker') return;\n` +
      `    const port = event.ports && event.ports[0];\n` +
      `    if (port) port.postMessage({ type: 'mechalab-test-worker', build: 'new' });\n` +
      `  });\n` +
      `}\n`
  );

  const { server, port } = await startStaticServer({
    isolation: false,
    root: tempRoot,
    cacheControl: 'max-age=3600',
  });
  const baseUrl = `http://127.0.0.1:${port}${BASE}`;
  const context = await browser.newContext();
  const pageErrors = [];
  try {
    const page = await context.newPage();
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await waitForIsolated(page);
    await waitForEntry(page, 'old');
    await page.waitForFunction(
      () => Boolean(navigator.serviceWorker.controller?.scriptURL.endsWith('/sw-old.js')),
      undefined,
      { timeout: 30000 }
    );
    assert.match(
      await readCachedShell(page),
      /name="mechalab-build" content="old"/,
      'the old worker must have cached the old shell before the deploy'
    );
    console.log('  ok stale shell: the 4.11.0 worker controls and its old shell is cached');

    // Deploy: new document, new entry, new worker. The server keeps serving max-age=3600.
    writeShellBuild(tempRoot, { marker: 'new', worker: 'sw-new.js' });

    // One caller-initiated reload. The worker's own controllerchange reload is the handoff, not a
    // second attempt by the test.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForEntry(page, 'new');
    assert.equal(
      await activeWorkerBuild(page, 20000),
      'new',
      'one normal reload must leave the new worker controlling, not the old worker serving its cached page'
    );
    assert.match(
      await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? ''),
      /\/sw-new\.js$/,
      'the controlling worker must be the newly deployed worker'
    );
    assert.match(
      await readCachedShell(page),
      /name="mechalab-build" content="new"/,
      'the new worker must have refreshed the cached shell to the new document'
    );
    assert.deepEqual(pageErrors, [], `the stale-shell page threw: ${pageErrors.join(' | ')}`);
    console.log('  ok stale shell: one normal reload reached entry-new with the new worker controlling');
  } finally {
    await context.close();
    server.close();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function main() {
  ensureBuilt();
  assert.ok(
    fs.existsSync(path.join(distDir, 'sw.js')),
    'the built bundle must carry sw.js - the service worker is a public asset'
  );
  const { server, port } = await startStaticServer({ isolation: false });
  const baseUrl = `http://127.0.0.1:${port}${BASE}`;
  const executablePath = resolveChromiumExecutable();
  const browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    headless: true,
  });
  try {
    const context = await browser.newContext();
    // The predict-first gate is its own suite (`test:e2e:predict`); this one proves the cache.
    await context.addInitScript(() => {
      window.__mechalabPredictFirst = false;
    });
    // Offline reloads are measured on the lesson, not under the first-run tour.
    await seedTourSeen(context);
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await waitForIsolated(page);
    console.log('  ok the service worker takes control and the document reloads isolated (no host headers)');

    // The worker fills the asset cache from fetch events after it claims the page. The reload can
    // win that race on a slow runner, so wait for the same JS asset the assertion below requires
    // instead of reading the cache while the first bundle response is still in flight.
    await page.waitForFunction(
      async () => {
        const cache = await caches.open('mechalab-assets-v1');
        return (await cache.keys()).some((request) =>
          /\/assets\/.*\.js$/.test(new URL(request.url).pathname)
        );
      },
      undefined,
      { timeout: 30000 }
    );

    // The shell and the hashed bundle are what makes an offline reload possible at all.
    const cached = await page.evaluate(async () => {
      const keys = await caches.keys();
      const shell = await caches.open('mechalab-shell-v1');
      const assets = await caches.open('mechalab-assets-v1');
      const shellEntries = await shell.keys();
      const assetEntries = await assets.keys();
      return {
        keys,
        shell: shellEntries.map((request) => new URL(request.url).pathname),
        assets: assetEntries.map((request) => new URL(request.url).pathname),
        manifest: await shell.match(new URL('manifest.webmanifest', location.href).href).then(Boolean),
      };
    });
    assert.ok(
      cached.shell.some((url) => url.endsWith('/') || url.endsWith('/index.html')),
      `the shell document must be precached; cached: ${cached.shell.join(', ')}`
    );
    assert.ok(cached.manifest, 'the web app manifest must be precached, or install has no metadata');
    assert.ok(
      cached.assets.some((url) => /\/assets\/.*\.js$/.test(url)),
      `the built bundle must be cached on first load; cached assets: ${cached.assets.join(', ')}`
    );
    console.log(
      `  ok the shell, the manifest and ${cached.assets.length} asset(s) are cached (${cached.keys.join(', ')})`
    );

    // ---- The button, with no lesson run first ----
    // This is the whole feature: one press caches the page's own bundle and the interpreter, and says
    // what it cost. No lesson has been run at this point - the page's own idle warm-up may have started
    // loading Python (it always does), but nothing has produced a verdict, and the offline run below
    // is the first one.
    await page.getByTestId('btn-offline-takealong').click();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="btn-offline-takealong"]')?.dataset.offlineState ===
        'ready',
      undefined,
      { timeout: 240000 }
    );
    const offlineLabel = (
      await page.getByTestId('btn-offline-takealong').textContent()
    ).trim();
    assert.match(
      offlineLabel,
      /Offline ready · \d+(\.\d+)? (kB|MB)/,
      `the button must report the size it cached; got: ${offlineLabel}`
    );
    const sizeMatch = offlineLabel.match(/(\d+(?:\.\d+)?) (kB|MB)/);
    const reportedBytes = sizeMatch
      ? Number(sizeMatch[1]) * (sizeMatch[2] === 'MB' ? 1_000_000 : 1000)
      : 0;
    // The report is the transfer size the CDN served (compressed), not the decoded size on disk, so the
    // floor is "clearly more than the shell". The separate Pyodide cache assertions below are what
    // prove the interpreter itself came along; this one proves the number is real and not a stub.
    assert.ok(
      reportedBytes > 3_000_000,
      `the shell alone is ~1 MB, so a real report must exceed 3 MB; got ${reportedBytes} from "${offlineLabel}"`
    );
    const pyodideCached = await page.evaluate(async () => {
      const cache = await caches.open('mechalab-pyodide-v1');
      return (await cache.keys()).map((request) => new URL(request.url).pathname);
    });
    assert.ok(
      pyodideCached.some((url) => url.endsWith('/pyodide.mjs')),
      `the button must cache the ESM runtime; cached: ${pyodideCached.join(', ')}`
    );
    assert.ok(
      pyodideCached.some((url) => url.endsWith('.wasm')),
      `the button must cache the wasm binary; cached: ${pyodideCached.join(', ')}`
    );
    console.log(`  ok the take-offline button cached the bundle and ${pyodideCached.length} runtime files (${offlineLabel})`);

    // ---- A lesson with formulas, while the network is still there ----
    // Nothing special is asked for here: opening the lesson is what a learner does, and the stylesheet
    // and faces it needs are same-origin requests, so the worker keeps them on the way past.
    const mathLesson = await context.newPage();
    mathLesson.on('pageerror', (error) => pageErrors.push(`01.4: ${error.message}`));
    await mathLesson.goto(`${baseUrl}?lesson=01.4`, { waitUntil: 'domcontentloaded' });
    await mathLesson.waitForSelector('.katex', { timeout: 30000 });
    const onlineFormulas = await mathLesson.evaluate(
      () => document.querySelectorAll('.katex').length
    );
    assert.ok(
      onlineFormulas > 5,
      `lesson 01.4 must render its formulas online before the offline half means anything; counted ${onlineFormulas}`
    );
    const mathCached = await mathLesson.evaluate(async () => {
      const cache = await caches.open('mechalab-assets-v1');
      const urls = (await cache.keys()).map((request) => new URL(request.url).pathname);
      return {
        stylesheet: urls.filter((url) => /vendor-katex-[\w-]+\.css$/.test(url)),
        faces: urls.filter((url) => /KaTeX_[\w-]+\.woff2$/.test(url)),
        payload: urls.filter((url) => /lesson-pages\/.*01\.4-[\w-]+\.json$/.test(url)),
      };
    });
    assert.equal(
      mathCached.stylesheet.length,
      1,
      `expected the KaTeX stylesheet in the asset cache; found: ${mathCached.stylesheet.join(', ') || 'nothing'}`
    );
    assert.ok(
      mathCached.faces.length > 0,
      `expected at least one KaTeX face in the asset cache; found: ${mathCached.faces.join(', ') || 'nothing'}`
    );
    assert.equal(
      mathCached.payload.length,
      1,
      `expected lesson 01.4's reader payload in the asset cache; found: ${mathCached.payload.join(', ') || 'nothing'}`
    );
    console.log(
      `  ok online: lesson 01.4 renders ${onlineFormulas} formulas and the worker keeps its payload, ` +
        `stylesheet and ${mathCached.faces.length} face(s)`
    );

    // ---- No network from here on ----
    // The browser's own HTTP cache would answer a font without the network and without the worker, so it
    // is emptied first: after this, a byte this origin serves can only come from CacheStorage.
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.clearBrowserCache');
    await cdp.detach();
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(document.querySelector('#root *')), undefined, {
      timeout: 15000,
    });
    const body = await page.evaluate(() => document.body.innerText);
    assert.match(body, /MechaLab/, 'an offline reload must still paint the workbench');
    assert.match(
      body,
      /Run Python Lessons/,
      'an offline reload must still render the tab rail, which means the registry loaded from cache'
    );
    assert.equal(
      await page.evaluate(() => window.crossOriginIsolated),
      true,
      'the cached document must still carry the isolation pair, or Stop loses in-place interruption'
    );
    console.log('  ok offline: a reload paints the workbench, isolated, with the lessons listed');

    // The claim the whole phase is for: Python still runs with the network off, from the runtime the
    // button cached. There is no online run to compare against - the button was the only warm-up.
    const offlineRun = await runLesson(page);
    assert.match(
      offlineRun.verdict,
      /FAILED/,
      `the P.1 starter must still reach its failing verdict offline; got: ${offlineRun.verdict}`
    );
    assert.doesNotMatch(
      offlineRun.stdout,
      /could not be loaded from CDN|Pyodide WASM/i,
      `the offline run must use the cached interpreter, not fail on the network: ${offlineRun.stdout.slice(0, 200)}`
    );
    console.log(`  ok offline: a lesson still runs to its verdict (${offlineRun.verdict})`);

    // A URL the cache never saw: every navigation gets the shell, and the app routes from the query.
    const deep = await context.newPage();
    await deep.goto(`${baseUrl}?lesson=P.4`, { waitUntil: 'domcontentloaded' });
    await deep.getByTestId('lesson-title').waitFor({ timeout: 15000 });
    const title = (await deep.getByTestId('lesson-title').textContent()) ?? '';
    assert.match(title, /Ordered Lists/, `offline deep link must open its lesson; title was: ${title}`);
    console.log('  ok offline: ?lesson=P.4 opens that lesson from the cached shell');

    // The formulas, with no HTTP cache to fall back on and no network to ask.
    await mathLesson.reload({ waitUntil: 'domcontentloaded' });
    await mathLesson.waitForSelector('.katex', { timeout: 20000 });
    await mathLesson.waitForFunction(() => document.fonts.status === 'loaded', undefined, {
      timeout: 20000,
    });
    const offlineMath = await mathLesson.evaluate(() => {
      const symbol = document.querySelector('.katex .mord, .katex .mbin, .katex .mrel');
      return {
        formulas: document.querySelectorAll('.katex').length,
        face: symbol ? getComputedStyle(symbol).fontFamily : '',
        main: document.fonts.check('16px KaTeX_Main'),
        raw: (document.querySelector('[data-testid="lesson-reader"]')?.textContent ?? '').includes(
          '$'
        ),
      };
    });
    assert.ok(
      offlineMath.formulas > 5,
      `offline, lesson 01.4 must still render its formulas; counted ${offlineMath.formulas}`
    );
    assert.match(
      offlineMath.face,
      /KaTeX_Main/,
      `offline formula glyphs must be set in a KaTeX face; got "${offlineMath.face}"`
    );
    assert.equal(
      offlineMath.main,
      true,
      'offline, KaTeX_Main must load from the cached face: a formula in a fallback face is a formula the flight broke'
    );
    assert.equal(
      offlineMath.raw,
      false,
      'offline, the reader must still print formulas rather than raw `$…$` source'
    );
    console.log(
      `  ok offline: lesson 01.4 still sets ${offlineMath.formulas} formulas in KaTeX_Main, from the cache`
    );

    await checkStaleShellRefresh(browser);

    assert.deepEqual(pageErrors, [], `the page threw while offline: ${pageErrors.join(' | ')}`);
    console.log(
      `[PASS] Offline workbench: worker-supplied isolation, cached shell + ${cached.assets.length} assets + ` +
        `${pyodideCached.length} runtime files, with the network off and the HTTP cache cleared: reload, ` +
        `deep link, a lesson run, and 01.4's formulas from the cached stylesheet and faces; ` +
        `a max-age deploy with the old worker reaches the new entry on one normal reload`
    );
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((error) => {
  console.error('[FAIL] Offline checks failed:', error.message);
  process.exit(1);
});
