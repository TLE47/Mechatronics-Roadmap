#!/usr/bin/env node
/**
 * The first-run tour in a real browser — `scripts/e2e_tour.mjs` (`npm run test:e2e:tour`).
 *
 * The unit suite (`scripts/test_tour.mjs`) pins the table, the gates and the record. What it cannot
 * see is the part that only exists on a page: whether the ring lands on the element it names, whether
 * the editor and Run button stay clickable underneath it, whether the layout moves so the target is on
 * screen, and whether a phone gets a sheet instead of a card over the keyboard.
 *
 * Ten cases, each in a context of its own so `/` is somebody's first visit:
 *
 *   1. a first visit opens the tour, and the record says so;
 *   2. Next walks to the brief, and the ring covers that element with `pointer-events: none`;
 *   3. the editor step has no Next at all — typing advances it, and the preset switches to Write;
 *   4. the run step advances only when a run finishes (the predict gate is skipped, as a learner may);
 *   5. red checks are explained, and the checks panel is on screen when they are;
 *   6. Got it → hints → Finish, and the record is `completed`;
 *   7. a finished tour does not open again on reload;
 *   8. Esc dismisses, and a dismissed tour stays dismissed;
 *   9. a deep link to a later lesson gets the chip, and the chip starts the tour;
 *  10. leaving mid-tour offers "Resume tour (step N of 6)", and Resume continues there;
 *  11. a phone gets the bottom sheet, 44 px buttons, no ring, and one region at a time;
 *  12. the palette replays it after it has been finished.
 *
 * Usage:  node scripts/e2e_tour.mjs
 *         E2E_BASE_URL=<dev server> when a suite runner already has one (scripts/test_workbench.mjs).
 */

import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { resolveChromiumExecutable, startDevServer } from './e2e_browser_workbench.mjs';

const KEY = 'mechalab_tour_v1';
const CARD = '[data-testid="first-run-tour"]';
const CHIP = '[data-testid="tour-chip"]';

const record = (page) => page.evaluate((key) => {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : null;
}, KEY);

const step = (page) => page.locator(CARD).getAttribute('data-tour-step').catch(() => null);

async function go(page, baseUrl, path = '') {
  await page.goto(`${baseUrl}${path}`, { waitUntil: 'domcontentloaded' });
  // The shell is the readiness signal a fixed sleep was standing in for. `domcontentloaded` fires
  // before the module graph has been fetched and compiled, and on a contended runner (three suites
  // sharing one dev server) that gap is seconds: the tour read as never having opened
  // (`null !== 'welcome'`) and an Escape pressed into it went nowhere.
  await page.waitForSelector('[data-testid="btn-theme-toggle"]', { timeout: 20000 });
  // Then the settle: the tour decision runs in an effect after the shell mounts, and the coach mark
  // is measured after that.
  await page.waitForTimeout(700);
}

/**
 * Wait, bounded, for a settled geometry rather than racing it with a fixed sleep.
 *
 * On a cold server the lesson list and the reader populate after the coach mark mounts, and an early
 * measurement is a ring 4819 px above its brief — the component now re-measures when the document's
 * height changes, so what is left for the test is to assert the invariant *once the page has settled*
 * instead of on a stopwatch. The assertions below are unchanged: it still has to land, exactly, and it
 * still fails if it never does.
 */
async function settled(page, predicate, timeout = 5000) {
  try {
    await page.waitForFunction(predicate, null, { timeout, polling: 100 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Wait, bounded, for the coach mark to stand at `at` — or, with `null`, to be gone.
 *
 * Every assertion that follows the next used to be `click, waitForTimeout(300), assert`, which is a
 * stopwatch measuring how long React takes on the runner. That is how `Esc dismisses, and a dismissed
 * tour stays dismissed` went red on `main` on a commit that passed on the pull request: the click had
 * landed, the state had not. Waiting for the state instead makes the assertion its own timeout.
 */
async function waitForStep(page, at, timeout = 20000) {
  try {
    await page.waitForFunction(
      (wanted) => {
        const card = document.querySelector('[data-testid="first-run-tour"]');
        const current = card ? card.getAttribute('data-tour-step') : null;
        return current === wanted;
      },
      at,
      { timeout, polling: 100 }
    );
    return true;
  } catch {
    return false;
  }
}

/** Wait, bounded, for the stored record to reach `status` (the write, not the click). */
async function waitForRecord(page, status, timeout = 20000) {
  try {
    await page.waitForFunction(
      ([key, wanted]) => {
        const raw = localStorage.getItem(key);
        if (!raw) return false;
        try {
          return JSON.parse(raw).status === wanted;
        } catch {
          return false;
        }
      },
      [KEY, status],
      { timeout, polling: 100 }
    );
    return true;
  } catch {
    return false;
  }
}

/** Answer the predict gate if it opened, the way a learner who has no answer yet would. */
async function skipPredictIfAsked(page) {
  const skip = page.locator('[data-testid="btn-predict-skip"]');
  if (await skip.count()) await skip.first().click();
}

async function main() {
  const own = process.env.E2E_BASE_URL ? null : await startDevServer(process.cwd());
  const baseUrl = (process.env.E2E_BASE_URL ?? own.baseUrl).replace(/\/*$/, '/');
  const executablePath = resolveChromiumExecutable();
  const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), headless: true });
  const checks = [];
  const check = async (name, run) => {
    try {
      await run();
      checks.push({ name, ok: true });
      console.log(`  ok  ${name}`);
    } catch (error) {
      checks.push({ name, ok: false });
      console.log(`  FAIL ${name}\n       ${String(error.message).split('\n').join('\n       ')}`);
    }
  };

  const fresh = async (options = {}) => {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    return { context, page };
  };

  try {
    /* 1 — a first visit */
    let ctx = await fresh();
    let page = ctx.page;
    await check('a first visit opens the tour at the welcome', async () => {
      await go(page, baseUrl, '?lesson=P.1');
      assert.equal(await step(page), 'welcome');
      const stored = await record(page);
      assert.equal(stored.status, 'active');
      assert.equal(stored.stepIndex, 0);
      const name = await page.locator(CARD).getAttribute('aria-labelledby');
      assert.ok(name, 'the dialog has no accessible name');
      assert.ok(await page.locator(`#${name}`).count(), 'aria-labelledby points at nothing');
    });

    /* 2 — the brief, with the ring on it */
    await check('Next walks to the brief and the ring covers it', async () => {
      await page.locator('[data-testid="btn-tour-next"]').click();
      assert.equal(await step(page), 'lesson');
      const landed = await settled(page, () => {
        const ring = document.querySelector('[data-testid="first-run-tour-ring"]');
        const anchor = document.querySelector('[data-tour="lesson-brief"]');
        if (!ring || !anchor) return false;
        const r = ring.getBoundingClientRect();
        const a = anchor.getBoundingClientRect();
        return Math.abs(r.left - a.left) < 12 && Math.abs(r.top - a.top) < 13;
      });
      const geometry = await page.evaluate(() => {
        const ring = document.querySelector('[data-testid="first-run-tour-ring"]');
        const anchor = document.querySelector('[data-tour="lesson-brief"]');
        if (!ring || !anchor) return null;
        const r = ring.getBoundingClientRect();
        const a = anchor.getBoundingClientRect();
        const style = getComputedStyle(ring);
        // What is under the middle of the brief: with the ring over it, this must still be the brief.
        const under = document.elementFromPoint(a.left + a.width / 2, a.top + a.height / 2);
        return {
          dx: Math.abs(r.left - a.left),
          dy: Math.abs(r.top - a.top),
          dw: Math.abs(r.width - a.width),
          pointer: style.pointerEvents,
          underIsAnchor: Boolean(under?.closest('[data-tour="lesson-brief"]')),
        };
      });
      assert.ok(geometry, 'no ring on a words step with an anchor');
      assert.ok(landed, `the ring never settled on the brief (offset ${geometry.dx}/${geometry.dy})`);
      assert.ok(geometry.dx < 12 && geometry.dy < 12 + 1, `ring offset ${geometry.dx}/${geometry.dy}`);
      assert.ok(geometry.dw < 16, `ring width off by ${geometry.dw}`);
      assert.equal(geometry.pointer, 'none', 'the ring must not eat clicks');
      assert.equal(geometry.underIsAnchor, true, 'the highlighted card is not clickable through the ring');
    });

    /* 3 — the editor gate */
    await check('the editor step has no Next, switches to Write, and advances on a real edit', async () => {
      await page.locator('[data-testid="btn-tour-next"]').click();
      assert.ok(await waitForStep(page, 'editor'), 'Next did not reach the editor step');
      assert.equal(await page.locator('[data-testid="btn-tour-next"]').count(), 0, 'an action step drew Next');
      assert.equal(
        await page.evaluate(() => document.querySelector('[data-layout]')?.dataset.layout),
        'write',
        'the preset did not make room for the editor'
      );
      const focused = await page.evaluate(() => document.activeElement?.classList.contains('cm-content'));
      assert.equal(focused, true, 'focus did not move into the editor');
      await page.locator('.cm-content').click();
      await page.keyboard.type('# tour edit');
      assert.ok(
        await waitForStep(page, 'run', 30000),
        'a real edit did not advance the tour to the run step'
      );
    });

    /* 4 — the run gate */
    await check('the run step waits for a finished run, predict gate and all', async () => {
      const before = await page.locator('[data-testid="badge-behavior-check"]').innerText();
      assert.match(before, /UNTESTED/);
      await page.locator('[data-testid="btn-run-verify"]').click();
      // Either the predict gate opens (the run is waiting on an answer) or the run finishes on its
      // own. Sleeping here and then looking for the gate was a race in both directions: too early
      // and nothing is skipped, leaving the tour unable to advance for two minutes.
      const asked = await settled(
        page,
        () =>
          Boolean(
            document.querySelector('[data-testid="predict-gate"]') ||
              document.querySelector('[data-testid="first-run-tour"][data-tour-step="results"]')
          ),
        120000
      );
      assert.ok(asked, 'neither the predict gate nor a finished run arrived');
      if (await page.locator('[data-testid="predict-gate"]').count()) {
        await skipPredictIfAsked(page);
        assert.ok(await waitForStep(page, 'results', 120000), 'the run never produced a verdict');
      }
      const verdict = await page.locator('[data-testid="badge-behavior-check"]').innerText();
      assert.doesNotMatch(verdict, /UNTESTED/, 'the tour moved on before a run had a verdict');
    });

    /* 5 — the red-checks step */
    await check('the red checks are explained with the checks panel on screen', async () => {
      assert.equal(await step(page), 'results');
      const body = await page.locator(CARD).innerText();
      assert.match(body, /starter is unfinished on purpose/i);
      assert.equal(
        await page.evaluate(() => document.querySelector('[data-layout]')?.dataset.layout),
        'study'
      );
      const visible = await page.evaluate(() => {
        const panel = document.querySelector('[data-tour="checks-panel"]');
        return panel ? panel.getBoundingClientRect().height > 0 : false;
      });
      assert.equal(visible, true, 'the checks panel is not on screen for the step about it');
    });

    /* 6 — the end */
    await check('Got it, the hints, then Finish completes the tour', async () => {
      await page.locator('[data-testid="btn-tour-next"]').click();
      assert.ok(await waitForStep(page, 'hints'), 'Next did not reach the hints step');
      const label = await page.locator('[data-testid="btn-tour-next"]').innerText();
      assert.match(label, /Finish tour/);
      await page.locator('[data-testid="btn-tour-next"]').click();
      assert.ok(await waitForStep(page, null), 'Finish did not take the coach mark down');
      assert.equal(await page.locator(CARD).count(), 0);
      assert.ok(await waitForRecord(page, 'completed'), 'Finish did not record a completed tour');
    });

    /* 7 — and it stays finished */
    await check('a finished tour does not open again on reload', async () => {
      await go(page, baseUrl, '?lesson=P.1');
      assert.equal(await page.locator(CARD).count(), 0);
      assert.equal(await page.locator(CHIP).count(), 0);
    });

    /* 12 — replay from the palette, in the same context that just finished */
    await check('the palette replays the tour after it was finished', async () => {
      await page.locator('[data-testid="btn-open-palette"]').click();
      const search = page.locator('[role="dialog"] input');
      await search.waitFor({ timeout: 15000 });
      await search.fill('replay the first-lesson tour');
      await page.locator('[role="option"]', { hasText: 'Replay the first-lesson tour' }).first().click();
      assert.ok(await waitForStep(page, 'welcome'), 'the palette command did not replay the tour');
      assert.ok(await waitForRecord(page, 'active'), 'the replay did not mark the tour active');
    });
    await ctx.context.close();

    /* 8 — dismiss */
    ctx = await fresh();
    page = ctx.page;
    await check('Esc dismisses, and a dismissed tour stays dismissed', async () => {
      await go(page, baseUrl, '?lesson=P.1');
      const opened = await settled(
        page,
        () => !!document.querySelector('[data-testid="first-run-tour"]'),
        15000
      );
      assert.ok(opened, 'a fresh visit must open the coach mark');
      assert.equal(await step(page), 'welcome');
      // Press only once the card is *on screen*. `step()` waits for the element, but the keydown
      // listener arrives with it: on a contended runner the card can mount after `go()`'s fixed
      // sleep, and the Escape then goes nowhere while the card stays up at `welcome` — which is
      // exactly how this check failed once in CI on a commit that passed everywhere else.
      await page.locator(CARD).waitFor({ timeout: 15000 });
      await page.keyboard.press('Escape');
      const gone = await settled(
        page,
        () => !document.querySelector('[data-testid="first-run-tour"]')
      );
      assert.ok(gone, 'Escape must take the coach mark down');
      assert.equal(await page.locator(CARD).count(), 0, 'the card is still up after Escape');
      assert.equal((await record(page)).status, 'dismissed', 'Escape must record the dismissal');
      await go(page, baseUrl, '?lesson=P.1');
      assert.equal(await page.locator(CARD).count(), 0, 'a dismissed tour reopened on reload');
      assert.equal(await page.locator(CHIP).count(), 0, 'a dismissed tour offered the resume chip');
    });
    await ctx.context.close();

    /* 9 + 10 — deep link, then leave mid-tour */
    ctx = await fresh();
    page = ctx.page;
    await check('a deep link to a later lesson gets the chip instead of the tour', async () => {
      await go(page, baseUrl, '?lesson=P.4');
      assert.equal(await page.locator(CARD).count(), 0, 'the tour opened on a later lesson');
      assert.equal(await page.locator(CHIP).count(), 1, 'no chip on a deep link');
      assert.match(await page.locator(CHIP).innerText(), /Take the tour/);
      await page.locator('[data-testid="btn-tour-start"]').click();
      assert.ok(await waitForStep(page, 'welcome'), 'the chip did not start the tour');
    });

    await check('leaving mid-tour offers the resume chip, and Resume continues there', async () => {
      await page.locator('[data-testid="btn-tour-next"]').click();
      assert.ok(await waitForStep(page, 'lesson'), 'Next did not reach the brief');
      // A chip is offered once per record; this record has not been offered one since it started.
      await page.evaluate((key) => {
        const value = JSON.parse(localStorage.getItem(key));
        localStorage.setItem(key, JSON.stringify({ ...value, chipShown: false }));
      }, KEY);
      await go(page, baseUrl, '?lesson=P.4');
      assert.equal(await page.locator(CARD).count(), 0, 'a half-finished tour reopened itself');
      const chip = page.locator(CHIP);
      assert.match(await chip.innerText(), /Resume tour \(step 2 of 6\)/);
      await page.locator('[data-testid="btn-tour-start"]').click();
      assert.ok(await waitForStep(page, 'lesson'), 'Resume did not return to the step it recorded');
    });
    await ctx.context.close();

    /* 11 — a phone */
    ctx = await fresh({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    page = ctx.page;
    await check('a phone gets a bottom sheet, 44 px buttons, no ring, one region at a time', async () => {
      await go(page, baseUrl, '?lesson=P.1');
      assert.equal(await step(page), 'welcome');
      const bottomedOut = await settled(page, () => {
        const card = document.querySelector('[data-testid="first-run-tour"]');
        if (!card) return false;
        const gap = window.innerHeight - card.getBoundingClientRect().bottom;
        return gap >= 0 && gap <= 40;
      });
      const sheet = await page.evaluate(() => {
        const card = document.querySelector('[data-testid="first-run-tour"]');
        const box = card.getBoundingClientRect();
        return {
          bottomGap: Math.round(window.innerHeight - box.bottom),
          width: Math.round(box.width),
          ring: Boolean(document.querySelector('[data-testid="first-run-tour-ring"]')),
          buttons: [...card.querySelectorAll('button')].map((b) => Math.round(b.getBoundingClientRect().height)),
          layout: document.querySelector('[data-layout]')?.dataset.layout,
        };
      });
      assert.ok(
        bottomedOut,
        `the sheet never reached the bottom of the screen (${sheet.bottomGap}px from it)`
      );
      assert.ok(sheet.bottomGap >= 0 && sheet.bottomGap <= 40, `sheet is ${sheet.bottomGap}px from the bottom`);
      assert.ok(sheet.width <= 390 - 8, `sheet is ${sheet.width}px wide on a 390px screen`);
      assert.equal(sheet.ring, false, 'a phone got the desktop ring');
      assert.equal(sheet.layout, 'read', 'the lesson step did not put the lesson text on screen');
      for (const height of sheet.buttons) assert.ok(height >= 44, `a ${height}px button on a phone`);
      await page.locator('[data-testid="btn-tour-next"]').click();
      assert.ok(await waitForStep(page, 'lesson'), 'the phone did not reach the brief');
      await page.locator('[data-testid="btn-tour-next"]').click();
      assert.ok(await waitForStep(page, 'editor'), 'the phone never reached the editor step');
      assert.equal(
        await page.evaluate(() => document.querySelector('[data-layout]')?.dataset.layout),
        'write',
        'the phone did not switch to the code region'
      );
    });
    await ctx.context.close();
  } finally {
    await browser.close();
    if (own) await own.viteServer.close();
  }

  const failed = checks.filter((entry) => !entry.ok);
  assert.equal(
    failed.length,
    0,
    `${failed.length} of ${checks.length} tour check(s) failed:\n` +
      failed.map((entry) => `  - ${entry.name}`).join('\n')
  );
  console.log(`  ok ${checks.length} first-run tour checks passed`);
  return checks.length;
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith('e2e_tour.mjs');
if (invokedDirectly) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(`[FAIL] First-run tour sweep failed: ${error?.message ?? error}`);
      process.exit(1);
    });
}

export { main as runTourSweep };
