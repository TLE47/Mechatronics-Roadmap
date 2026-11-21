#!/usr/bin/env node
/**
 * The two surfaces that left the entry chunk, on the *built* bundle
 * (`scripts/e2e_lazy_bundle.mjs`, `npm run test:e2e:lazy`).
 *
 * `npm run check:weight` says the Workflow pane is no longer in `index-*.js` and that twelve 100-byte
 * stub modules are gone, and `tsc` says the slot compiles. Neither can say what a learner gets when
 * the pane is opened first, or that the tape URLs point at files that exist. This suite serves
 * `dist/` the way Pages does and checks both from the bytes the build produced:
 *
 * 1. **The Workflow pane mounts, and its code is its own chunk.** The entry chunk must not carry the
 *    panel's markup, the `WorkflowPanel-*.js` chunk must be served with a 200, the pane must mount
 *    with the editor body (hidden while closed, as the runner's panes are), and the tab must then
 *    show its content — the empty state, the one-press start, and the canvas' own lazy card — with no
 *    Suspense fallback left behind and no request refused. A missing default export or a 404 on the
 *    hashed chunk fails here and nowhere earlier in the pipeline.
 * 2. **The tapes and the rain loop resolve to real, fetchable assets.** The built `musicBeds-*.js`
 *    and `rainAsset-*.js` chunks are imported in the page — the same modules the engine imports —
 *    and every URL they hand out must be a hashed asset under the Pages base, must load over HTTP,
 *    and must be the same number of bytes as the file on disk. The eager `?url` glob and the
 *    `new URL(...)` are only worth their savings if the URLs they produce are loadable.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { BASE, ensureBuilt, startStaticServer } from './e2e_pages_bundle.mjs';
import { resolveChromiumExecutable } from './e2e_browser_workbench.mjs';
import { seedTourSeen } from './tour_seed.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(repoRoot, 'dist');
const assetsDir = path.join(distDir, 'assets');

/** The hashed chunk a module was emitted into, by the module name Vite keeps in the filename. */
function chunkFor(name) {
  const file = fs.readdirSync(assetsDir).find((entry) => new RegExp(`^${name}-[\\w-]{8}\\.js$`).test(entry));
  assert.ok(file, `the build emitted no ${name}-*.js chunk; is the module still in the graph?`);
  return file;
}

/** Byte size of a built asset, from the file the server is told to serve. */
function sizeOf(assetFile) {
  const file = path.join(assetsDir, assetFile);
  assert.ok(fs.existsSync(file), `the build emitted no ${assetFile}`);
  return fs.statSync(file).size;
}

/** The Workflow tab, opened the way a learner opens it, on a first visit. */
async function checkWorkflowPane(browser, baseUrl) {
  const context = await browser.newContext();
  await seedTourSeen(context);
  const page = await context.newPage();
  const pageErrors = [];
  const rejected = [];
  const chunks = new Map();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (/\/assets\/.*\.js$/.test(url.pathname)) chunks.set(path.basename(url.pathname), response.status());
    if (response.status() >= 400) rejected.push(`${response.status()} ${url.pathname}`);
  });

  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(document.querySelector('#root *')), undefined, {
      timeout: 30000,
    });

    // The panel's markup is not in the entry chunk — the half `check:weight` measures, seen in bytes.
    const panelChunk = chunkFor('WorkflowPanel');
    assert.equal(
      fs.readFileSync(path.join(assetsDir, chunkFor('index')), 'utf8').includes('panel-workflow'),
      false,
      'the Workflow panel must not be in the entry chunk'
    );
    assert.equal(
      fs.readFileSync(path.join(assetsDir, panelChunk), 'utf8').includes('panel-workflow'),
      true,
      `the panel's markup must live in ${panelChunk}`
    );

    // The runner mounts its panes with the editor body and hides the ones that are closed, so the
    // chunk is fetched on the first paint and the panel resolves behind its boundary — hidden.
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid="panel-workflow"]').length > 0,
      undefined,
      { timeout: 20000 }
    );
    assert.equal(
      chunks.get(panelChunk),
      200,
      `opening the workbench must fetch ${panelChunk} and get it, got ${chunks.get(panelChunk) ?? 'no request'}`
    );
    assert.equal(
      await page.getByTestId('panel-workflow').isVisible(),
      false,
      'the pane is mounted closed until its tab is pressed'
    );

    // Study opens folded; the result tabs belong to the editor, so its body comes on screen first.
    const folded = page.locator('[data-testid="btn-toggle-editor"][aria-expanded="false"]');
    if (await folded.count()) await folded.first().click();

    await page.getByTestId('editor-tab-workflow').click();
    await page.getByTestId('panel-workflow').waitFor({ state: 'visible', timeout: 20000 });
    assert.equal(
      await page.getByTestId('panel-workflow').isVisible(),
      true,
      'the Workflow tab must draw the panel, not an empty pane'
    );
    assert.equal(
      await page.locator('[data-testid="lazy-pending"][data-lazy="the workflow"]').count(),
      0,
      'the fallback must be gone once the chunk has arrived'
    );
    assert.equal(
      await page.getByTestId('workflow-empty').isVisible(),
      true,
      'a lesson nobody has drawn yet must offer a start, not a blank card'
    );

    // The how-to is a first-visit card; it sits over the start buttons rather than replacing them.
    if (await page.getByTestId('workflow-howto').count()) {
      await page.getByTestId('workflow-howto-dismiss').click();
    }

    // The canvas is the panel's own second lazy chunk: the card proves the whole chain resolved.
    await page.getByTestId('workflow-start-blank').click();
    await page.locator('[data-node-id]').first().waitFor({ state: 'visible', timeout: 20000 });
    assert.ok(
      (await page.locator('[data-node-id]').count()) >= 1,
      'a blank workflow must open on a card, not on nothing'
    );

    assert.equal(pageErrors.length, 0, `the visit threw: ${pageErrors.join(' | ')}`);
    assert.equal(rejected.length, 0, `the visit was refused a request: ${rejected.join(' | ')}`);
    console.log(
      `  ok the Workflow pane mounts on first open (${panelChunk} 200), offers a start, and draws its card`
    );
  } finally {
    await context.close();
  }
}

/** Every tape the built bundle knows, from the URLs it actually carries. */
function builtTapes() {
  const source = fs.readFileSync(path.join(assetsDir, chunkFor('musicBeds')), 'utf8');
  const found = [...source.matchAll(/\/(?:[^"/]+\/)*assets\/([a-z0-9-]+)-([\w-]{8})\.m4a/g)].map(
    (match) => ({ id: match[1], file: `${match[1]}-${match[2]}.m4a` })
  );
  assert.ok(found.length >= 10, `expected the tape catalogue in the chunk, found ${found.length}`);
  return found;
}

/** The rain loop's built file, as the rainAsset chunk names it. */
function builtRain() {
  const source = fs.readFileSync(path.join(assetsDir, chunkFor('rainAsset')), 'utf8');
  const match = source.match(/assets\/(rain-loop-[\w-]{8}\.m4a)/);
  assert.ok(match, 'the rainAsset chunk must carry the hashed rain-loop URL');
  return match[1];
}

/** Resolve the audio modules in the page and load every URL they hand out. */
async function checkAudioAssets(browser, baseUrl) {
  const bedsChunk = chunkFor('musicBeds');
  const rainChunk = chunkFor('rainAsset');
  const tapes = builtTapes();
  const rainFile = builtRain();

  const context = await browser.newContext();
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

    // The same dynamic imports the engine performs, against the served bundle.
    const resolved = await page.evaluate(
      async ({ base, bedsChunk, rainChunk, ids }) => {
        const beds = await import(`${base}assets/${bedsChunk}`);
        const rain = await import(`${base}assets/${rainChunk}`);
        const tapeUrls = {};
        for (const id of ids) tapeUrls[id] = await beds.tapeUrl({ id });
        return { rainUrl: rain.RAIN_URL, tapeUrls };
      },
      { base: new URL(baseUrl).origin + BASE, bedsChunk, rainChunk, ids: tapes.map((t) => t.id) }
    );

    // `RAIN_URL` is absolute (`import.meta.url`); `tapeUrl` hands back a root-relative URL. Both are
    // loaded from the page's own origin, which is what a `<audio>` or `fetch` would do with them.
    const urls = {
      rain: new URL(resolved.rainUrl, baseUrl).href,
      ...Object.fromEntries(
        Object.entries(resolved.tapeUrls).map(([id, url]) => [`tape:${id}`, new URL(url, baseUrl).href])
      ),
    };
    assert.equal(
      new Set(Object.values(urls)).size,
      urls ? Object.keys(urls).length : 0,
      'every tape must resolve to its own file, not a shared one'
    );

    // A URL that is still a source path, or has no content hash, is a build that would 404 in Pages.
    for (const [label, url] of Object.entries(urls)) {
      const { pathname } = new URL(url);
      assert.ok(pathname.startsWith(`${BASE}assets/`), `${label} must be a built asset, got ${pathname}`);
      assert.match(pathname, /-[A-Za-z0-9_-]{8}\.m4a$/, `${label} must carry a content hash: ${pathname}`);
    }
    assert.equal(
      new URL(resolved.rainUrl, baseUrl).pathname,
      `${BASE}assets/${rainFile}`,
      'the rain loop URL'
    );
    for (const tape of tapes) {
      assert.equal(
        new URL(resolved.tapeUrls[tape.id], baseUrl).pathname,
        `${BASE}assets/${tape.file}`,
        `tape ${tape.id} must resolve to its own file`
      );
    }

    // Load them, in the browser, from the served build — the promise the glob is worth saving for.
    const loaded = await page.evaluate(async (entries) => {
      const out = {};
      for (const [label, url] of Object.entries(entries)) {
        const response = await fetch(url);
        const body = await response.arrayBuffer();
        out[label] = { ok: response.ok, status: response.status, bytes: body.byteLength };
      }
      return out;
    }, urls);

    const expected = { rain: sizeOf(rainFile), ...Object.fromEntries(tapes.map((t) => [`tape:${t.id}`, sizeOf(t.file)])) };
    for (const [label, result] of Object.entries(loaded)) {
      assert.equal(result.ok, true, `${label} must load over HTTP, got ${result.status}`);
      assert.equal(result.bytes, expected[label], `${label} must be the built file, byte for byte`);
      assert.ok(result.bytes > 1024, `${label} must be real audio, not a stub: ${result.bytes} bytes`);
    }
    assert.equal(pageErrors.length, 0, `resolving the audio threw: ${pageErrors.join(' | ')}`);
    console.log(
      `  ok ${tapes.length} tapes and the rain loop resolve to hashed assets and load byte-for-byte ` +
        `(${Object.values(loaded).reduce((sum, r) => sum + r.bytes, 0)} B over HTTP)`
    );
  } finally {
    await context.close();
  }
}

async function main() {
  ensureBuilt();
  const served = await startStaticServer();
  const baseUrl = `http://127.0.0.1:${served.port}${BASE}`;
  const executablePath = resolveChromiumExecutable();
  const browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    headless: true,
  });
  try {
    await checkWorkflowPane(browser, baseUrl);
    await checkAudioAssets(browser, baseUrl);
    console.log(
      '[PASS] Lazy surfaces: the Workflow pane mounts on first open from its own chunk, and the ' +
        'tapes and rain loop resolve to hashed assets that load from the built bundle'
    );
  } finally {
    await browser.close();
    served.server.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error('[FAIL] Lazy surface checks failed:', error.stack ?? error.message);
    process.exit(1);
  });
}
