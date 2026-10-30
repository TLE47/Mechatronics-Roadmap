#!/usr/bin/env node
/**
 * The settle gate waits for a count that lands late
 * (`scripts/test_settle_counts.mjs`, `npm run test:settle`)
 *
 * `scripts/snapshot_surfaces.mjs` measures 56 surfaces that are still arriving: a lazy chunk, a lesson
 * fetched as JSON, and on `tab-links` the GitHub API. The gate it waits on used to be silence only —
 * no resize and no node for 250 ms — and silence is not the same as finished. A request still in
 * flight moves nothing: `paper/tab-links` recorded 5 links on one run and 4 on the next, and the
 * `tab-links` count has been the flaky field ever since the surface gained a fetch.
 *
 * So this suite drives the real gate (`scripts/surface_settle.mjs`) against pages whose link count
 * arrives late, with a copy of the previous, silence-only gate as the **failing control**: the first
 * check runs it on the same fixture and shows it finishing before the count exists. That is the run
 * that would have failed before — the new gate is proved against it rather than asserted at.
 *
 * Two more shapes are pinned here: a count that arrives with no `*-loading` marker at all (so the
 * gate cannot be just a spinner check), and a page that never finishes (so the bound holds and the
 * sweep is not left hanging on 56 surfaces).
 *
 * Usage
 *     node scripts/test_settle_counts.mjs
 *
 * Exit-code family: typed
 *     0  every check passed
 *     1  a check failed
 *     2  the suite could not run (no Chromium)
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { resolveChromiumExecutable } from './e2e_browser_workbench.mjs';
import { SETTLE, SURFACE_COUNTS, settleSurface } from './surface_settle.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SWEEP = path.join(HERE, 'snapshot_surfaces.mjs');

let passed = 0;
let failed = 0;

function section(name) {
  console.log(`\n${name}`);
}

async function check(name, body) {
  try {
    await body();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  FAIL ${name}`);
    console.log(`       ${String(error.message).split('\n')[0]}`);
  }
}

/**
 * The gate the sweep ran until this change, verbatim in shape: a 250 ms window that a resize or a
 * landed node re-arms, then a measurement. This is the control, not a second implementation — the
 * first check fails on it, which is the whole point of the file.
 */
function quietPaneGate({ quietMs = 250, limitMs = 5000 } = {}) {
  return new Promise((resolve) => {
    const started = performance.now();
    const target = document.querySelector('#main') ?? document.body;
    let quiet = setTimeout(done, quietMs);
    const bump = () => {
      clearTimeout(quiet);
      quiet = setTimeout(done, quietMs);
    };
    const resizes = new ResizeObserver(bump);
    const mutations = new MutationObserver(bump);
    function done() {
      resizes.disconnect();
      mutations.disconnect();
      resolve({
        waitedMs: Math.round(performance.now() - started),
        links: document.querySelectorAll('a[href]').length,
      });
    }
    resizes.observe(target);
    mutations.observe(target, { childList: true, subtree: true, characterData: true });
    setTimeout(done, limitMs);
  });
}

/** A page with one inline script, which is all a fixture here ever needs. */
function page(body, script) {
  return `<!doctype html><html><body>${body}<script>${script}</script></body></html>`;
}

/** `tab-links` before its read lands: a line of text and the panel's own "Loading" sentinel. */
const PROMISED = page(
  '<div id="main"><p id="row">Open rise issues <span data-testid="rise-issues-loading">Reading…</span></p></div>',
  `setTimeout(() => {
     document.getElementById('row').innerHTML = 'Open rise issues <a href="#46">#46 Link sweep rise</a>';
   }, 700);`
);

/** The same late count with nothing on screen saying so: the case only the count vector can catch. */
const UNSIGNED = page(
  '<div id="main"><p id="row">Open rise issues</p></div>',
  `setTimeout(() => {
     const link = document.createElement('a');
     link.href = '#46';
     link.textContent = '#46 Link sweep rise';
     document.getElementById('row').appendChild(link);
   }, 350);`
);

/** Finished on the first frame: the gate must not sit for its bound on the 51 surfaces that are. */
const DONE = page(
  '<div id="main"><p id="row">Open rise issues <a href="#46">#46 Link sweep rise</a></p></div>',
  ''
);

/** A panel that never stops saying it is loading. */
const NEVER = page(
  '<div id="main"><p data-testid="reader-loading">Loading the lesson text…</p></div>',
  ''
);

const settle = (overrides = {}) => ({ selectors: SURFACE_COUNTS, ...SETTLE, ...overrides });
/** The count vector's third field: `SURFACE_COUNTS` orders buttons, inputs, links, headings, canvases, tables. */
const linksIn = (vector) => Number(vector.split('|')[2]);

async function main() {
  const executablePath = resolveChromiumExecutable();
  if (!executablePath) {
    console.error('[FAIL] no Chromium to drive: set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH or install one');
    process.exit(2);
  }
  const browser = await chromium.launch({
    executablePath,
    args: ['--no-sandbox', '--force-device-scale-factor=1'],
  });
  try {
    // One page per fixture: `setContent` reuses the document, and a timer left pending by one fixture
    // would append its link into the next one's count — the flake this whole file is about, reproduced
    // inside its own harness.
    const onPage = async (fixture, body) => {
      const grown = await browser.newPage();
      try {
        await grown.setContent(fixture);
        return await body(grown);
      } finally {
        await grown.close();
      }
    };

    section('the old gate, on a count that has not arrived yet');

    await check('it reads the placeholder and returns before the count exists — the bug', async () => {
      await onPage(PROMISED, async (grown) => {
        const before = await grown.evaluate(quietPaneGate);
        assert.equal(before.links, 0, 'the old gate saw the late count, so this fixture proves nothing');
        assert.ok(
          before.waitedMs < 700,
          `the old gate returned after ${before.waitedMs} ms, past the fixture's 700 ms, so the race is not reproduced`
        );
      });
    });

    section('what the gate waits for now');

    await check('a count behind a loading sentinel: it waits, then counts what arrived', async () => {
      await onPage(PROMISED, async (grown) => {
        const settled = await grown.evaluate(settleSurface, settle());
        assert.equal(settled.settled, true, 'the gate gave up while the panel still said it was loading');
        assert.ok(settled.waitedMs >= 700, `returned after ${settled.waitedMs} ms, before the count arrived`);
        assert.equal(linksIn(settled.counts), 1, `counts ${settled.counts} — links is the third field`);
      });
    });

    await check('a count the old gate read early, with no loading sentinel to lean on', async () => {
      await onPage(UNSIGNED, async (grown) => {
        const before = await grown.evaluate(quietPaneGate);
        assert.equal(before.links, 0, 'the old gate caught this one, so the fixture is not the late case');
      });
      await onPage(UNSIGNED, async (grown) => {
        const settled = await grown.evaluate(settleSurface, settle());
        assert.equal(settled.settled, true);
        assert.ok(settled.waitedMs >= 350, `returned after ${settled.waitedMs} ms, before the count arrived`);
        assert.equal(linksIn(settled.counts), 1, `counts ${settled.counts}`);
      });
    });

    await check('a finished surface settles in a beat, not at the bound', async () => {
      await onPage(DONE, async (grown) => {
        const settled = await grown.evaluate(settleSurface, settle());
        assert.equal(settled.settled, true);
        assert.equal(linksIn(settled.counts), 1);
        assert.ok(settled.waitedMs < 1500, `waited ${settled.waitedMs} ms on a page that was never changing`);
      });
    });

    await check('a panel that never finishes is given up on at the bound, and measured anyway', async () => {
      await onPage(NEVER, async (grown) => {
        const settled = await grown.evaluate(
          settleSurface,
          settle({ sampleMs: 50, quietMs: 200, limitMs: 600 })
        );
        assert.equal(settled.settled, false, 'a page stuck on "loading" must be reported as unsettled');
        assert.ok(settled.waitedMs >= 600, `gave up after ${settled.waitedMs} ms, before its own bound`);
        assert.ok(settled.waitedMs < 2500, `took ${settled.waitedMs} ms — the bound is not holding`);
      });
    });

    section('one definition, in two places');

    await check('the sweep waits on this module and no longer grows a gate of its own', async () => {
      const source = fs.readFileSync(SWEEP, 'utf8');
      assert.match(
        source,
        /import \{[^}]*settleSurface[^}]*\} from '\.\/surface_settle\.mjs'/,
        'the sweep no longer imports settleSurface from surface_settle.mjs'
      );
      assert.ok(
        !/new (Resize|Mutation)Observer/.test(source),
        'the sweep has an inline settle loop again: the gate must live in surface_settle.mjs so this suite drives it'
      );
    });
  } finally {
    await browser.close();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`[FAIL] ${error?.stack ?? error}`);
  process.exit(2);
});
