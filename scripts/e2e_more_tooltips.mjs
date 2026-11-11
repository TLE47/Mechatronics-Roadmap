#!/usr/bin/env node
/**
 * Every folded control answers a hover with the app's own bubble (`scripts/e2e_more_tooltips.mjs`).
 *
 * The More panel is thirteen tiles in a `hidden` fold, and the header's `HeaderTips` bubble was
 * mounted only inside the header trays — so a tile's only hover hint was a native `title`, which is
 * slow, unstyled, and invisible to this suite. This drives a real browser: it opens More, hovers the
 * More button and every tile inside it (the debugger tools included), and asserts the bubble is
 * rendered, visible, and carries that control's own sentence. It checks the same panel at 1440 px
 * and at 1800 px, because a stylesheet rule used to hide the bubble above 2xl.
 *
 * Run it with the browser the other suites use:
 *   PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=<chrome> node scripts/e2e_more_tooltips.mjs
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { resolveChromiumExecutable } from './e2e_browser_workbench.mjs';
import { ensureBuilt, startStaticServer } from './e2e_pages_bundle.mjs';
import { seedTourSeen } from './tour_seed.mjs';

const executablePath = resolveChromiumExecutable();
if (!executablePath) {
  console.error('[FAIL] no Chromium to drive: set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH');
  process.exit(2);
}

ensureBuilt();
const { server, port } = await startStaticServer();
const baseUrl = `http://127.0.0.1:${port}/Mechatronics-Roadmap/`;
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox', '--force-device-scale-factor=1'] });
const failures = [];
let checked = 0;

/** Hover one control and read the bubble back. */
async function expectTip(page, label, hover) {
  await hover();
  const bubble = page.getByTestId('header-tip');
  try {
    await bubble.waitFor({ state: 'visible', timeout: 2500 });
  } catch {
    failures.push(`${label}: no bubble appeared`);
    return;
  }
  const text = ((await bubble.textContent()) ?? '').trim();
  const box = await bubble.boundingBox();
  if (!box || box.width < 1 || box.height < 1) {
    failures.push(`${label}: bubble exists but has no painted box`);
    return;
  }
  if (!text) {
    failures.push(`${label}: bubble is empty`);
    return;
  }
  checked += 1;
  const expected = await page
    .locator('.header-tip')
    .first()
    .evaluate((node) => node.textContent.trim());
  assert.equal(text, expected);
}

try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1800, height: 900 }]) {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
      colorScheme: 'light',
      reducedMotion: 'reduce',
    });
    await seedTourSeen(context);
    const page = await context.newPage();
    page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') failures.push(`console: ${message.text()}`);
    });
    await page.goto(baseUrl, { waitUntil: 'load' });
    await page.getByTestId('btn-theme-toggle').waitFor({ timeout: 30000 });
    await page.waitForFunction(
      () =>
        !document.querySelector('[data-testid="reader-loading"]') &&
        !document.querySelector('[data-editor-ready="false"]'),
      undefined,
      { timeout: 30000 }
    );

    // The header trays keep their own bubbles: a control there answers a hover too.
    const headerControl = page.locator('[data-testid="btn-theme-toggle"]');
    const headerTip = (await headerControl.getAttribute('data-tip')) ?? '';
    if (viewport.width <= 1536) {
      await expectTip(page, 'header: btn-theme-toggle', () => headerControl.hover());
      const bubble = page.getByTestId('header-tip');
      assert.equal(((await bubble.textContent()) ?? '').trim(), headerTip.trim());
      await page.mouse.move(1, 1);
    }

    await page.getByTestId('btn-more').click();
    await page.getByTestId('toolbar-more').waitFor({ state: 'visible', timeout: 5000 });

    const native = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#toolbar-more [title]')).map(
        (node) => node.getAttribute('data-testid') ?? node.textContent.trim()
      )
    );
    if (native.length) failures.push(`tiles still rely on a native title: ${native.join(', ')}`);

    const controls = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#toolbar-more [data-tip]')).map((node) => ({
        id: node.getAttribute('data-testid') ?? node.textContent.trim(),
        tip: (node.getAttribute('data-tip') ?? '').trim(),
      }))
    );
    if (controls.length < 15) {
      failures.push(`expected at least 15 tipped tiles in More, found ${controls.length}`);
    }
    for (const control of controls) {
      await expectTip(page, `more: ${control.id}`, () =>
        page.locator(`#toolbar-more [data-testid="${control.id}"]`).hover()
      );
      await page.mouse.move(1, 1);
    }

    const more = page.getByTestId('btn-more');
    const moreTip = (await more.getAttribute('data-tip')) ?? '';
    await expectTip(page, 'more: btn-more', () => more.hover());
    const bubble = page.getByTestId('header-tip');
    assert.equal(((await bubble.textContent()) ?? '').trim(), moreTip.trim());

    console.log(`  ok ${viewport.width}px: ${controls.length} folded tiles and the header answered a hover`);
    await context.close();
  }
} catch (error) {
  console.error(error.message);
  for (const failure of failures.slice(0, 12)) console.error(`  - ${failure}`);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}

if (checked === 0) failures.push('no control produced a bubble, so nothing was proved');

if (failures.length) {
  console.error(`[FAIL] ${failures.length} tooltip problem(s):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`[PASS] more-tooltips: ${checked} hovers drew a labelled bubble`);
