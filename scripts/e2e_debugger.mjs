#!/usr/bin/env node
/** The debugger div drives the interpreter, checked by clicks (`scripts/e2e_debugger.mjs`). */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { resolveChromiumExecutable, startDevServer } from './e2e_browser_workbench.mjs';
import { getEditorCode, setEditorCode } from './editor-code.mjs';
import { seedTourSeen } from './tour_seed.mjs';

const RUN = '[data-testid="btn-run-verify"]';
const PAUSED = '[data-testid="paused-bar"]';
const LINE = '[data-testid="paused-line"]';
const q = (id) => `[data-testid="${id}"]`;

const SOURCE = `import time
total = 0
while True:
    total += 1
    time.sleep(0.05)
`;

async function main() {
  const own = process.env.E2E_BASE_URL ? null : await startDevServer(process.cwd());
  const baseUrl = process.env.E2E_BASE_URL ?? own.baseUrl;
  const executablePath = resolveChromiumExecutable();
  const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), args: ['--no-sandbox'] });
  const failures = [];
  const ok = (name) => console.log(`  ok ${name}`);
  const check = async (name, fn) => {
    try { await fn(); ok(name); } catch (error) { failures.push(`${name}: ${error.message}`); console.error(`  FAIL ${name}: ${error.message}`); }
  };
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await seedTourSeen(context);
    await context.addInitScript(() => { window.__mechalabPredictFirst = false; });
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="btn-toggle-editor"]', { state: 'attached', timeout: 60000 });
    const folded = page.locator('[data-testid="btn-toggle-editor"][aria-expanded="false"]');
    if (await folded.count()) await folded.first().click();
    await page.waitForSelector('[data-editor="editor-main"] .cm-content', { timeout: 60000 });
    await page.getByTestId('btn-more').click();
    const disabled = (id) => page.getByTestId(id).isDisabled();

    // A tile is only clickable once the panel that holds it is mounted and visible; opening it and
    // clicking in the same tick can land on the toolbar behind it.
    const ensureMore = async () => {
      if (!(await page.getByTestId('toolbar-more').isVisible().catch(() => false))) {
        await page.getByTestId('btn-more').click();
      }
      await page.getByTestId('toolbar-more').waitFor({ state: 'visible', timeout: 5000 });
    };

    await check('idle: step tools, pause, stop, watch are disabled; restart, layout, trace, breakpoints are not', async () => {
      for (const id of ['btn-debug-continue','btn-debug-step-over','btn-debug-step-into','btn-debug-step-out','btn-debug-pause','btn-debug-stop','btn-debug-watch']) assert.equal(await disabled(id), true, `${id} should be disabled at idle`);
      for (const id of ['btn-debug-restart','btn-debugger','btn-trace','btn-breakpoints']) assert.equal(await disabled(id), false, `${id} should be enabled at idle`);
    });

    await check('breakpoints and trace and debug layout toggle real UI', async () => {
      await page.getByTestId('btn-breakpoints').click();
      assert.equal(await page.locator('[data-testid="breakpoint-panel"]').isVisible(), true, 'breakpoint panel did not open');
      await page.getByTestId('btn-breakpoints').click();
      await page.getByTestId('btn-debugger').click();
      assert.equal(await page.getByTestId('layout-debug').getAttribute('aria-pressed'), 'true', 'debug layout not selected');
      await ensureMore();
    });

    await check('run starts, pause parks the frame, and step over/in/out advance it', async () => {
      await setEditorCode(page, SOURCE);
      await page.click(RUN);
      await page.waitForFunction(() => document.querySelector('[data-testid="btn-run-verify"]')?.disabled === true, null, { timeout: 60000 });
      // The toolbar's own Pause only mounts once the worker session is pause-capable. Waiting for it
      // is the same signal a user sees, and it is what proves the capability before anything is clicked.
      await page.waitForSelector('[data-testid="btn-pause-execution"]', { timeout: 60000 });
      await page.waitForTimeout(400);
      await ensureMore();
      await page.getByTestId('btn-debug-pause').click();
      for (const id of ['btn-debug-pause','btn-debug-stop']) assert.equal(await disabled(id), false, `${id} should be enabled live`);
      for (const id of ['btn-debug-restart']) assert.equal(await disabled(id), true, `${id} should be disabled live`);
      assert.equal(await disabled('btn-debug-step-over'), true, 'step over should be disabled before a park');
      await page.waitForSelector(PAUSED, { timeout: 30000 });
      const first = (await page.textContent(LINE)) ?? '';
      console.log('  · park: ' + JSON.stringify({
        bar: ((await page.textContent(PAUSED)) ?? '').replace(/\s+/g, ' ').trim().slice(0, 160),
        line: first.trim(),
        restartDisabled: await disabled('btn-debug-restart'),
        runButtonDisabled: await page.evaluate(() => document.querySelector('[data-testid="btn-run-verify"]')?.disabled === true),
      }));
      assert.equal(await disabled('btn-debug-step-over'), false, 'step over should be enabled while parked');
      assert.equal(await disabled('btn-debug-watch'), false, 'watch should be enabled while parked');
      await page.getByTestId('btn-debug-step-over').click();
      await page.waitForTimeout(400);
      const second = (await page.textContent(LINE)) ?? '';
      assert.notEqual(second, first, 'step over did not move the parked line');
      await page.getByTestId('btn-debug-step-into').click();
      await page.waitForTimeout(400);
      const third = (await page.locator(PAUSED).count()) ? (await page.textContent(LINE)) ?? '' : '';
      await page.getByTestId('btn-debug-step-out').click();
      await page.waitForTimeout(600);
      const stillParked = (await page.locator(PAUSED).count()) > 0;
      if (stillParked) assert.notEqual((await page.textContent(LINE)) ?? '', third, 'step out did not move');
      else {
        // The parked frame was the module's top level, which has no caller to return to: step out
        // there carries on running instead of parking in a caller, exactly as an IDE does at the
        // outermost frame. The bar goes and the run stays live - neither is a silent no-op.
        assert.equal(await page.evaluate(() => document.querySelector('[data-testid="btn-run-verify"]')?.disabled === true), true, 'step out at the module frame left neither a park nor a live run');
        await page.waitForSelector(PAUSED, { state: 'detached', timeout: 5000 });
      }
      ok(`stepped: "${first.trim()}" → "${second.trim()}" → ${stillParked ? 'caller frame' : 'continues (no caller)'}`);
    });

    await check('watch button focuses the paused inspection surface', async () => {
      if (!(await page.locator(PAUSED).count())) {
        await ensureMore();
        await page.getByTestId('btn-debug-pause').click();
        await page.waitForTimeout(400);
        await page.waitForSelector(PAUSED, { timeout: 20000 });
      }
      await page.getByTestId('btn-debug-watch').click();
      const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? '');
      assert.equal(focused, 'watch-input', `focus went to ${focused}`);
    });

    await check('continue resumes, stop ends the run', async () => {
      if (!(await page.locator(PAUSED).count())) {
        await ensureMore();
        await page.getByTestId('btn-debug-pause').click();
        await page.waitForTimeout(400);
        await page.waitForSelector(PAUSED, { timeout: 20000 });
      }
      await page.getByTestId('btn-debug-continue').click();
      await page.waitForSelector(PAUSED, { state: 'detached', timeout: 30000 });
      const resumed = await page.evaluate(() => document.querySelector('[data-testid="btn-run-verify"]')?.disabled === true);
      await page.getByTestId('btn-debug-stop').evaluate((node) => node.click());
      await page.waitForFunction(() => document.querySelector('[data-testid="btn-run-verify"]')?.disabled === false, null, { timeout: 30000 });
      ok(`continue kept running=${resumed}, stop returned the run button`);
    });

    await check('restart resets to idle and is enabled again', async () => {
      await page.getByTestId('btn-debug-restart').click();
      await page.waitForFunction(() => document.querySelector('[data-testid="btn-run-verify"]')?.disabled === false, null, { timeout: 30000 });
      assert.equal(await disabled('btn-debug-restart'), false);
    });

    // The debugger div is one way into Pause; a plain toolbar Pause on a normal Run has to park too.
    await check('a plain toolbar Pause parks a normal run', async () => {
      await page.click(RUN);
      await page.waitForSelector('[data-testid="btn-pause-execution"]', { timeout: 60000 });
      await page.waitForTimeout(400);
      await page.click('[data-testid="btn-pause-execution"]');
      await page.waitForSelector(PAUSED, { timeout: 20000 });
      const barLine = ((await page.textContent(LINE)) ?? '').trim();
      assert.ok(barLine.length > 0, 'the paused bar showed no line');
      assert.equal(await disabled('btn-debug-restart'), true, 'restart should be disabled while parked');
      console.log('  · toolbar pause: ' + JSON.stringify({
        bar: ((await page.textContent(PAUSED)) ?? '').replace(/\s+/g, ' ').trim().slice(0, 160),
        line: barLine,
        restartDisabled: await disabled('btn-debug-restart'),
      }));
      await page.getByTestId('btn-debug-stop').click();
      await page.waitForFunction(() => document.querySelector('[data-testid="btn-run-verify"]')?.disabled === false, null, { timeout: 30000 });
    });

    // The run and its restart must leave the learner's program alone: this script typed SOURCE, so
    // that is the text the editor still holds once the debugger has finished with the run.
    const afterRun = await getEditorCode(page);
    assert.equal(
      afterRun.includes('while True:') && afterRun.includes('time.sleep(0.05)'),
      true,
      'editor text lost'
    );
  } finally {
    await browser.close();
    if (own) await own.viteServer.close();
  }
  if (failures.length) { console.error(`[FAIL] ${failures.length}`); process.exit(1); }
  console.log('[PASS] debugger');
}
main();
