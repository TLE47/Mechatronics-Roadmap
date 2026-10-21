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
 * 3. with the context offline, a reload still renders the workbench, and a **deep link** to a lesson
 *    opens that lesson's page — the SPA shell is served from the cache for a URL the cache never saw.
 *
 * What it does not assert: running Python offline. Pyodide is loaded inside a blob-URL worker, which a
 * service worker does not control, so its CDN fetches never reach the handler. Offline *reading* is what
 * ships; offline *running* needs the worker to move to a real module URL (docs/PLAN-2.0-GAP.md).
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { BASE, startStaticServer } from './e2e_pages_bundle.mjs';

const repoRoot = process.cwd();
const distDir = path.join(repoRoot, 'dist');

function ensureBuilt() {
  if (fs.existsSync(path.join(distDir, 'index.html'))) return;
  console.log('[build] dist/index.html is missing - running `npm run build` first');
  execFileSync('npm', ['run', 'build'], { stdio: 'inherit', cwd: repoRoot });
  assert.ok(fs.existsSync(path.join(distDir, 'index.html')), 'npm run build produced no dist/index.html');
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
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
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

    // A URL the cache never saw: every navigation gets the shell, and the app routes from the query.
    const deep = await context.newPage();
    await deep.goto(`${baseUrl}?lesson=P.4`, { waitUntil: 'domcontentloaded' });
    await deep.getByTestId('lesson-title').waitFor({ timeout: 15000 });
    const title = (await deep.getByTestId('lesson-title').textContent()) ?? '';
    assert.match(title, /Ordered Lists/, `offline deep link must open its lesson; title was: ${title}`);
    console.log('  ok offline: ?lesson=P.4 opens that lesson from the cached shell');

    assert.deepEqual(pageErrors, [], `the page threw while offline: ${pageErrors.join(' | ')}`);
    console.log(
      `[PASS] Offline workbench: worker-supplied isolation, cached shell + ${cached.assets.length} assets, ` +
        'reload and deep links with the network off (Python execution offline is not covered - blob worker)'
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
