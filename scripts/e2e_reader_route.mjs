#!/usr/bin/env node
/**
 * The lesson-reader route, for every page (`scripts/e2e_reader_route.mjs`).
 *
 * The reader pane is fed by a static document under the app's base path
 * (`<base>lesson-pages/<page>.json`), so a 200 for the app shell proves nothing about a lesson. This
 * suite walks all 97 registry pages on the built bundle and grades what a reader actually gets:
 *
 *   - the lesson's own address (`?lesson=<id>`) lands on that lesson, not a neighbour;
 *   - the payload is requested from the exact subpath URL, answers 200 as JSON, and its version,
 *     title and block count are the ones on disk;
 *   - the Study scope paints real prose, its own headings and the code the page has there;
 *   - the Read preset paints the rest, code blocks included, with the practice section;
 *   - the Bridge Notes card the payload names mounts, and shows finite numbers;
 *   - a card opens at rest: no landing has been scored and no chase record written before the
 *     learner touches it (the bug fixed in `bridges/markArmed.ts`);
 *   - zero console errors and zero page errors, per page.
 *
 * It was a scratch sweep before this file existed, which meant the strongest end-to-end evidence in
 * the repository ran only when someone remembered to run it. It is a `bundle` suite now, so CI's
 * built-bundle lane runs it on every push beside the Pages sweep. It never opens an external page:
 * the lesson's "view source" link is compared, not followed, so the suite is a static server and
 * Chromium and nothing else.
 *
 * Usage
 *   node --experimental-strip-types scripts/e2e_reader_route.mjs          # own static server
 *   PAGES_SERVER_URL=http://127.0.0.1:4173/Mechatronics-Roadmap/ node …    # the runner's server
 *   node … --only 01.1 --workers 2                                        # one page, while fixing it
 *
 * Exit-code family: typed
 *   0  every page passed
 *   1  at least one page failed, each named
 *   2  the bundle is missing (run `npm run prebuild && npx vite build`)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { resolveChromiumExecutable } from './e2e_browser_workbench.mjs';
import { BASE, startStaticServer } from './e2e_pages_bundle.mjs';
import { seedTourSeen } from './tour_seed.mjs';
import { PYTHON_LESSONS } from '../app/src/data/pythonLessonsData.ts';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');
const VISUAL_MAP = path.join(ROOT, 'resources', 'bridge-visuals.json');

const argv = process.argv.slice(2);
const only = argv.includes('--only') ? new RegExp(argv[argv.indexOf('--only') + 1]) : null;
const workersAt = argv.indexOf('--workers');
const WORKERS = workersAt === -1 ? Number(process.env.READER_WORKERS ?? 4) : Number(argv[workersAt + 1]);

const squash = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
const fold = (text) =>
  squash(String(text ?? '').replace(/[`*_#>]/g, ' '))
    .replace(/[^A-Za-z0-9%.]+/g, ' ')
    .trim()
    .toLowerCase();
const has = (haystack, needle) => fold(haystack).includes(fold(needle).slice(0, 45));

function payloadFor(lesson) {
  const file = path.join(DIST, 'lesson-pages', lesson.readerPath.replace(/\.md$/, '.json'));
  if (!fs.existsSync(file)) throw new Error(`no built payload at ${path.relative(ROOT, file)}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** A long prose paragraph inside the Study scope, to prove the pane rendered *this* page. */
function studySample(payload) {
  const blocks = payload.blocks ?? [];
  const learn = blocks.findIndex(
    (block) => block.t === 'h' && String(block.x ?? '').trim().toLowerCase() === 'learn'
  );
  const diy = blocks.findIndex(
    (block) => block.t === 'h' && /^do it yourself/i.test(String(block.x ?? '').trim())
  );
  const end = diy === -1 ? blocks.length : diy;
  for (const block of blocks.slice(Math.max(learn, 0), end)) {
    if (block.t !== 'p') continue;
    const raw = String(block.x ?? '');
    if (raw.includes('$') || raw.includes('\\')) continue; // math renders as KaTeX, not text
    const text = squash(raw.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*_>#]/g, ' '));
    if (text.length > 80) return text.slice(0, 90);
  }
  return null;
}

function visualOf(payload) {
  const heading = (payload.blocks ?? []).find(
    (block) => block.t === 'h' && String(block.x ?? '').trim().toLowerCase() === 'bridge notes'
  );
  return heading?.v ?? null;
}

const lessons = PYTHON_LESSONS.filter((lesson) => lesson.readerPath && (!only || only.test(lesson.id)));
if (lessons.length === 0) {
  console.error(`no registry page matches ${only}`);
  process.exit(2);
}

// Empty means "serve it myself": `/\/?$/` on an empty string would turn it into `/`.
let base = process.env.PAGES_SERVER_URL ? process.env.PAGES_SERVER_URL.replace(/\/?$/, '/') : '';
let ownServer = null;
if (!base) {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    console.error('[FAIL] no dist/ to serve: run `npm run prebuild && npx vite build`');
    process.exit(2);
  }
  const started = await startStaticServer();
  ownServer = started.server;
  base = `http://127.0.0.1:${started.port}${BASE}`;
}
const origin = new URL(base).origin;
const visualNames = fs.existsSync(VISUAL_MAP)
  ? Object.values(JSON.parse(fs.readFileSync(VISUAL_MAP, 'utf8')).pages)
  : [];

const browser = await chromium.launch({
  ...(resolveChromiumExecutable() ? { executablePath: resolveChromiumExecutable() } : {}),
  headless: true,
});

/** One page, one fresh context, everything a reader of it gets. */
async function visit(lesson) {
  let payload;
  try {
    payload = payloadFor(lesson);
  } catch (error) {
    return { id: lesson.id, error: error.message };
  }
  // No service worker: the offline take-along installs one, and when it claims the page before the
  // reader asks for its payload, Chromium serves that payload from the worker's cache and emits no
  // page-level response for it. That is a property of the offline suite, not of this route, and it
  // made three of ninety-seven pages fail here at random. Blocking the worker keeps this suite
  // grading what it says it grades: every page fetched from the static server on its own address.
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block',
  });
  await seedTourSeen(context);
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${squash(message.text()).slice(0, 200)}`);
  });
  page.on('pageerror', (error) => errors.push(`page: ${squash(String(error)).slice(0, 200)}`));
  const payloadPath = lesson.readerPath.replace(/\.md$/, '.json');
  // The request, not its response: a page payload served from Chromium's HTTP cache can arrive with
  // no page-level response event, which failed the first five pages at random under the bundle
  // lane's load. The URL the reader asks for is the route's contract; the fetch below proves the
  // server answers it 200 as JSON with this page's version and blocks.
  const requests = [];
  page.on('request', (request) => {
    if (request.url().includes('/lesson-pages/')) requests.push(request.url());
  });
  const evidence = { id: lesson.id };

  try {
    await page.addInitScript(() => {
      window.__mechalabPredictFirst = false;
      window.localStorage.clear();
    });
    await page.goto(`${base}?lesson=${encodeURIComponent(lesson.id)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    await page.getByTestId('lesson-title').waitFor({ state: 'visible', timeout: 25000 });

    // 1. The address landed on this page's own title — the registry's name for it, or the payload's,
    //    because an exercise's header names the exercise while its reader shows the module page.
    const reader = page.locator('[data-testid="lesson-reader"]');
    await reader.waitFor({ state: 'visible', timeout: 25000 });
    const title = squash(await page.getByTestId('lesson-title').innerText());
    assert.ok(
      has(title, lesson.title) || has(title, payload.title),
      `address landed on "${title}", not "${lesson.title}"`
    );
    assert.ok(page.url().includes(`?lesson=${encodeURIComponent(lesson.id)}`), `address lost the lesson: ${page.url()}`);
    evidence.title = title;

    // A first visit auto-opens the tour, which draws its own preset; dismiss it like a learner.
    const dismiss = page.getByTestId('btn-tour-dismiss');
    if ((await dismiss.count()) > 0) {
      await dismiss.click();
      await page.waitForTimeout(250);
    }

    // 2. The static document: exact subpath, 200, JSON, the version this build reads.
    const asked = requests.filter((url) => url.endsWith(payloadPath));
    assert.ok(asked.length > 0, `no request for ${payloadPath}`);
    const expectedUrl = `${origin}${BASE}lesson-pages/${payloadPath}`;
    for (const url of asked) {
      assert.equal(url, expectedUrl, `payload requested from ${url}`);
    }
    const fetched = await page.evaluate(async (url) => {
      const response = await fetch(url);
      const body = await response.json();
      return {
        status: response.status,
        type: response.headers.get('content-type') ?? '',
        v: body.v,
        title: body.title,
        blocks: body.blocks.length,
      };
    }, expectedUrl);
    assert.equal(fetched.status, 200, `payload answered ${fetched.status}`);
    assert.ok(/application\/json/i.test(fetched.type), `payload typed as "${fetched.type}"`);
    assert.equal(fetched.v, payload.v, 'payload answered a different version');
    assert.equal(fetched.title, payload.title, 'payload is another page');
    assert.equal(fetched.blocks, payload.blocks.length, 'payload block count changed under a cached build');
    evidence.payload = { v: fetched.v, blocks: fetched.blocks };

    // 3. Study: the pane says which page it is and paints the reading half of it.
    assert.equal(await reader.getAttribute('data-reader-path'), lesson.readerPath, 'the reader shows a different page');
    assert.equal(await reader.getByTestId('reader-error').count(), 0, 'the reader is in its error state');
    assert.ok((await reader.getByTestId('reader-prose').count()) > 0, 'the reader painted no prose container');
    const studyText = squash(await reader.innerText());
    const headings = await reader.locator('h1, h2, h3, h4').count();
    const code = await reader.locator('pre').count();
    assert.ok(headings >= 2, `Study rendered only ${headings} headings`);
    assert.ok(studyText.length > 700, `Study holds only ${studyText.length} characters`);
    const sample = studySample(payload);
    if (sample) assert.ok(has(studyText, sample), `prose is missing: "${sample.slice(0, 60)}"`);
    evidence.study = { chars: studyText.length, headings, code };

    // 4. Read: the rest of the page, which is where a P-style lesson keeps its hints and solution.
    const switchTo = async (layout) => {
      const chip = page.getByTestId(`layout-${layout}`);
      if ((await chip.count()) === 0) return false;
      await chip.click();
      await page.waitForFunction(
        (wanted) => document.querySelector('[data-layout]')?.getAttribute('data-layout') === wanted,
        layout,
        { timeout: 15000 }
      );
      await page.waitForTimeout(200);
      return true;
    };
    assert.ok(await switchTo('read'), 'no Read preset to show the rest of the page');
    const readText = squash(await reader.innerText());
    assert.ok(readText.length > 700, `Read holds only ${readText.length} characters`);
    assert.ok((await reader.locator('pre').count()) >= 1, 'Read rendered no code block although the page has them');
    // The practice section, where the page has one: a prose lesson ends in "Do it yourself", an
    // exercise's module page may not, and asserting the literal would grade the course's wording.
    const practice = (payload.blocks ?? []).find(
      (block) => block.t === 'h' && /^do it yourself/i.test(String(block.x ?? '').trim())
    );
    if (practice) assert.ok(has(readText, practice.x), 'Read does not carry the practice section');
    evidence.read = { chars: readText.length };

    // 5. The named visual mounts, in the studied text, with finite numbers.
    const visual = visualOf(payload);
    if (visual) {
      assert.ok(await switchTo('study'), 'no Study preset to reach the visual');
      await page.getByRole('heading', { name: 'Bridge Notes', exact: true }).scrollIntoViewIfNeeded().catch(() => {});
      const card = reader.getByTestId(`bridge-visual-${visual}`);
      await card.waitFor({ state: 'visible', timeout: 25000 });
      await page.waitForTimeout(150);
      const cardText = squash(await card.innerText());
      const numbers = (cardText.match(/-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/g) ?? []).map(Number);
      assert.ok(numbers.length >= 3 && numbers.every(Number.isFinite), `${visual} shows no finite numbers`);
      assert.ok(!/\b(?:nan|infinity|undefined)\b/i.test(cardText), `${visual} shows NaN/Infinity/undefined`);
      evidence.visual = visual;

      // 6. At rest: opening a card must not score a landing (`markArmed.ts`). The first card that
      //    draws the chase is the one asked; a card without a mark is skipped by testid.
      const announce = card.getByTestId(/.*-mark-announce$/);
      if (evidence.visual && (await announce.count()) > 0) {
        const atRest = squash(await announce.innerText());
        assert.equal(atRest, '', `a card scored before anyone moved it: "${atRest}"`);
        const landed = await page.evaluate(() => window.localStorage.getItem('mechalab_bridge_chase_v1'));
        assert.equal(landed, null, `opening the card wrote a landing to the store: ${landed}`);
        evidence.markAtRest = true;
      }
    }

    assert.equal(errors.length, 0, errors.join(' || '));
    return evidence;
  } catch (error) {
    return { id: lesson.id, error: squash(error.message).slice(0, 400), errors };
  } finally {
    await context.close();
  }
}

/** The gallery renders every card's chunk, so a visual that only works inside one lesson shows up. */
async function visitGallery() {
  if (!visualNames.length) return { skipped: 'no visual map' };
  // No service worker: the offline take-along installs one, and when it claims the page before the
  // reader asks for its payload, Chromium serves that payload from the worker's cache and emits no
  // page-level response for it. That is a property of the offline suite, not of this route, and it
  // made three of ninety-seven pages fail here at random. Blocking the worker keeps this suite
  // grading what it says it grades: every page fetched from the static server on its own address.
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  try {
    await page.goto(`${base}?gallery=bridges`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.getByTestId('gallery-card-' + visualNames[0]).waitFor({ state: 'visible', timeout: 25000 });
    for (const name of visualNames) {
      assert.ok((await page.getByTestId(`gallery-card-${name}`).count()) === 1, `gallery has no card for ${name}`);
    }
    // Every card's own wrapper, not only its section: the lazy child must have resolved somewhere.
    await page.waitForFunction(
      (count) => document.querySelectorAll('[data-testid^="bridge-visual-"]').length >= count,
      visualNames.length,
      { timeout: 45000 }
    );
    const widths = await page.locator('[data-testid^="gallery-width-"]').count();
    assert.equal(widths, 3, 'the gallery lost its width controls');
    assert.equal(errors.length, 0, `gallery page errors: ${errors.join(' | ')}`);
    return { cards: visualNames.length };
  } finally {
    await context.close();
  }
}

const started = Date.now();
const results = [];
let next = 0;
const worker = async () => {
  while (next < lessons.length) {
    const lesson = lessons[next];
    next += 1;
    const evidence = await visit(lesson);
    results.push(evidence);
    if (!evidence.error) {
      console.log(
        `  ok ${lesson.id.padEnd(26)} study=${evidence.study.chars}c read=${evidence.read.chars}c` +
          `${evidence.visual ? ` visual=${evidence.visual}` : ''}${evidence.markAtRest ? ' at-rest' : ''}`
      );
    }
  }
};
await Promise.all(Array.from({ length: Math.min(WORKERS, lessons.length) }, worker));

let gallery = null;
try {
  gallery = await visitGallery();
  console.log(`  ok gallery                         ${gallery.cards ?? gallery.skipped} card(s)`);
} catch (error) {
  gallery = { error: squash(error.message).slice(0, 400) };
  console.log(`  FAIL gallery: ${gallery.error}`);
}
await browser.close();
ownServer?.close();

const failed = results.filter((result) => result.error);
const summary = {
  pages: results.length,
  passed: results.length - failed.length,
  failed: failed.map((result) => ({ id: result.id, error: result.error })),
  visuals: results.filter((result) => result.visual).length,
  markAtRest: results.filter((result) => result.markAtRest).length,
  gallery: gallery?.cards ?? gallery?.skipped ?? 0,
  seconds: Math.round((Date.now() - started) / 1000),
};
for (const failure of summary.failed) console.log(`  FAIL ${failure.id}: ${failure.error}`);
console.log(`\n${JSON.stringify(summary, null, 2)}`);

if (failed.length || gallery?.error) {
  console.log(
    `\n[FAIL] reader route: ${failed.length} of ${results.length} page(s) failed` +
      `${gallery?.error ? ' and the gallery failed' : ''}: ${failed.map((one) => one.id).join(', ')}`
  );
  process.exit(1);
}
console.log(
  `[PASS] reader route: ${summary.passed} page(s) opened by their own address, study and read scopes painted, ` +
    `${summary.visuals} visual(s) mounted, ${summary.markAtRest} card(s) at rest, gallery ${summary.gallery} card(s), ` +
    `0 console errors in ${summary.seconds}s`
);
