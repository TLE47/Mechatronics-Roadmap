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
 *
 * Starting from the button rather than from a run is the point of the suite: the run path used to be
 * the only thing that pulled Pyodide in, and a learner about to board had no way to ask for it.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { waitForEditor } from './editor-code.mjs';
import { BASE, startStaticServer } from './e2e_pages_bundle.mjs';
// The same executable search the other browser suites use: a machine with a system Chrome and no
// Playwright download is a normal machine, and this suite should run there too.
import { resolveChromiumExecutable } from './e2e_browser_workbench.mjs';

const repoRoot = process.cwd();
const distDir = path.join(repoRoot, 'dist');

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
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await waitForIsolated(page);
    console.log('  ok the service worker takes control and the document reloads isolated (no host headers)');

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

    // ---- No network from here on ----
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

    assert.deepEqual(pageErrors, [], `the page threw while offline: ${pageErrors.join(' | ')}`);
    console.log(
      `[PASS] Offline workbench: worker-supplied isolation, cached shell + ${cached.assets.length} assets + ` +
        `${pyodideCached.length} runtime files, with the network off: reload, deep link, and a lesson run`
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
