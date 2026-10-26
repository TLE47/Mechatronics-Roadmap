#!/usr/bin/env node
/**
 * The workshop, walked in a real browser (`scripts/e2e_workshop.mjs`, `npm run test:e2e:workshop`).
 *
 * `scripts/test_workshop.mjs` pins the rules of the room — clamping, reach, lane changes, the key
 * map — and none of that proves the room is *reachable*. What only a browser can answer:
 *
 *  * the header's door opens the lab, and the lab is its own address (`?view=lab`) that survives a
 *    reload;
 *  * A/D and W/S move the figure the rules say they move, and E at a hotspot opens the lesson the
 *    workbench would resume;
 *  * a hotspot clicked from across the room works in one click, and the menu under the room does the
 *    same thing for a keyboard learner;
 *  * Continue is one press to the editor, so the room never gates the lesson;
 *  * `prefers-reduced-motion` turns the walk into a jump (`0s`, no transition), which is the plan's
 *    rule that the room moves only if the learner's OS says movement is welcome;
 *  * and the lab clears axe's serious/critical rules in both default palettes. The tab sweep
 *    (`check:axe`) cannot see this page because it is not a tab, so the page that owns it audits it.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { resolveChromiumExecutable, startDevServer } from './e2e_browser_workbench.mjs';
import { waitForEditor } from './editor-code.mjs';
import { seedTourSeen } from './tour_seed.mjs';
import { PYTHON_LESSONS } from '../app/src/data/pythonLessonsData.ts';

const FIRST = PYTHON_LESSONS[0];
const AXE_SOURCE = path.join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js');

const labUrl = (base) => `${base}${base.includes('?') ? '&' : '?'}view=lab`;

async function openLab(page, base) {
  await page.goto(labUrl(base), { waitUntil: 'domcontentloaded' });
  await page.getByTestId('workshop').waitFor({ state: 'visible', timeout: 30000 });
}

async function figure(page) {
  const node = page.getByTestId('workshop-figure');
  return {
    x: Number(await node.getAttribute('data-x')),
    lane: await node.getAttribute('data-lane'),
  };
}

async function press(page, key) {
  await page.keyboard.press(key);
}

/** A small wait for React to commit; the attribute is the state, so polling it is the condition. */
async function waitForX(page, expected) {
  await page.waitForFunction(
    (want) => Number(document.querySelector('[data-testid="workshop-figure"]')?.getAttribute('data-x')) === want,
    expected,
    { timeout: 5000 }
  );
}

async function runAxe(page) {
  return page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const results = await axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      rules: { 'color-contrast': { enabled: false } },
      resultTypes: ['violations'],
    });
    return results.violations.map((violation) => ({
      rule: violation.id,
      impact: violation.impact ?? 'minor',
      nodes: violation.nodes.map((node) => node.target.join(' ')),
    }));
  });
}

async function main() {
  if (!fs.existsSync(AXE_SOURCE)) {
    console.error(`axe-core is not installed (${AXE_SOURCE} missing); run npm ci`);
    process.exit(2);
  }
  const axeSource = fs.readFileSync(AXE_SOURCE, 'utf8');
  const ownServer = process.env.E2E_BASE_URL ? null : await startDevServer(process.cwd());
  const baseUrl = process.env.E2E_BASE_URL ?? ownServer.baseUrl;
  const executablePath = resolveChromiumExecutable();
  const browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    headless: true,
  });
  try {
    const context = await browser.newContext();
    // The coach mark and the predict-first gate belong to their own suites; this one walks a room
    // and then opens a lesson, and neither should change what is on screen.
    await context.addInitScript(() => {
      window.__mechalabPredictFirst = false;
    });
    await seedTourSeen(context);
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await openLab(page, baseUrl);
    assert.equal(
      await page.getByTestId('workshop').isVisible(),
      true,
      '?view=lab must open the room'
    );
    assert.equal(
      await page.getByTestId('btn-open-lab').count(),
      1,
      'the header must carry the door on every page it renders'
    );
    console.log('  ok the lab has an address and the header has its door');

    // ---- The room's three hotspots, in the room and in the menu ----
    for (const id of ['terminal', 'h7', 'door']) {
      assert.equal(
        await page.getByTestId(`workshop-hotspot-${id}`).isVisible(),
        true,
        `hotspot ${id} must be painted`
      );
      assert.equal(
        await page.getByTestId(`workshop-menu-${id}`).isVisible(),
        true,
        `hotspot ${id} must also be in the menu`
      );
    }
    console.log('  ok every hotspot is a button in the room and a row in the menu');

    // ---- The keys move the figure the way the model says ----
    const start = await figure(page);
    assert.equal(start.x, 0.58, `expected the start pose, got ${start.x}`);
    assert.equal(start.lane, 'floor');
    await press(page, 'd');
    await waitForX(page, 0.64);
    await press(page, 'ArrowLeft');
    await waitForX(page, 0.58);
    await press(page, 'w');
    await page.waitForFunction(
      () => document.querySelector('[data-testid="workshop-figure"]')?.getAttribute('data-lane') === 'bench'
    );
    await press(page, 's');
    await page.waitForFunction(
      () => document.querySelector('[data-testid="workshop-figure"]')?.getAttribute('data-lane') === 'floor'
    );
    console.log('  ok A/D walk and W/S change depth');

    // ---- E at the terminal, reached by the keys, opens the lesson ----
    await press(page, 'w');
    await press(page, 'a');
    await press(page, 'a');
    await page.waitForSelector('[data-testid="workshop-hotspot-terminal"][data-active="true"]', {
      timeout: 5000,
    });
    const status = (await page.getByTestId('workshop-status').textContent()) ?? '';
    assert.match(status, /Press E/, `the status line must say how to use what is in reach: ${status}`);
    await press(page, 'e');
    await page.getByTestId('btn-run-verify').waitFor({ state: 'visible', timeout: 30000 });
    await waitForEditor(page, undefined, 30000);
    const title = (await page.getByTestId('lesson-title').textContent()) ?? '';
    assert.match(title, new RegExp(FIRST.title.slice(0, 18)), `expected ${FIRST.title} on screen, got ${title}`);
    console.log('  ok E at the bench terminal opens the lesson the workbench would resume');

    // ---- Continue is one press, from anywhere in the room ----
    await page.getByTestId('btn-open-lab').click();
    await page.getByTestId('workshop').waitFor({ state: 'visible', timeout: 10000 });
    await page.getByTestId('btn-workshop-continue').click();
    await page.getByTestId('btn-run-verify').waitFor({ state: 'visible', timeout: 30000 });
    await waitForEditor(page, undefined, 30000);
    console.log('  ok Continue reaches the editor in one press');

    // ---- A hotspot clicked from across the room, and the menu's copy of it ----
    await page.getByTestId('btn-open-lab').click();
    await page.getByTestId('workshop').waitFor({ state: 'visible', timeout: 10000 });
    await page.getByTestId('workshop-hotspot-h7').click();
    await page.getByTestId('workshop-robot-card').waitFor({ state: 'visible', timeout: 5000 });
    const restored = (await page.getByTestId('workshop-restored').textContent()) ?? '';
    assert.match(restored, /0 of 10 capabilities/, `a fresh profile restores nothing: ${restored}`);
    await page.getByTestId('btn-workshop-robot-close').click();
    await page.getByTestId('workshop-robot-card').waitFor({ state: 'detached', timeout: 5000 });
    await page.getByTestId('workshop-menu-h7').click();
    await page.getByTestId('workshop-robot-card').waitFor({ state: 'visible', timeout: 5000 });
    console.log("  ok H-7 opens from the room and from the menu, and counts what was earned");

    // ---- Tap to walk, then the door ----
    const scene = await page.getByTestId('workshop').boundingBox();
    assert.ok(scene, 'the room must have a box');
    await page.mouse.click(scene.x + scene.width * 0.25, scene.y + scene.height * 0.7);
    await page.waitForFunction(
      () => Math.abs(Number(document.querySelector('[data-testid="workshop-figure"]')?.getAttribute('data-x')) - 0.25) < 0.03,
      undefined,
      { timeout: 5000 }
    );
    await page.getByTestId('workshop-hotspot-door').click();
    await page.getByTestId('btn-run-verify').waitFor({ state: 'visible', timeout: 30000 });
    assert.equal(
      await page.getByTestId('workshop').count(),
      0,
      'the alley door must leave the room'
    );
    console.log('  ok tapping the floor walks there, and the door leaves for the workbench');

    // ---- Axe, in the page's own palettes (the tab sweep cannot see a whole page) ----
    await page.getByTestId('btn-open-lab').click();
    await page.getByTestId('workshop').waitFor({ state: 'visible', timeout: 10000 });
    await page.addScriptTag({ content: axeSource });
    const readTheme = () =>
      page.evaluate(() => document.documentElement.getAttribute('data-theme') ?? 'light');
    const firstTheme = await readTheme();
    const findings = [];
    for (const violation of await runAxe(page)) findings.push({ palette: firstTheme, ...violation });
    // The flip button is the honest way to reach the other default palette; a machine whose OS is
    // light starts on light, so the second palette is whichever one the button lands on.
    await page.getByTestId('btn-theme-toggle').click();
    await page.waitForFunction(
      (previous) => document.documentElement.getAttribute('data-theme') !== previous,
      firstTheme,
      { timeout: 5000 }
    );
    const secondTheme = await readTheme();
    for (const violation of await runAxe(page)) findings.push({ palette: secondTheme, ...violation });
    const failing = findings.filter((finding) => finding.impact === 'serious' || finding.impact === 'critical');
    for (const finding of failing) {
      console.error(`  FAIL ${finding.palette} · ${finding.rule} (${finding.impact}) on ${finding.nodes.join(', ')}`);
    }
    assert.deepEqual(failing, [], 'the lab must clear axe serious/critical in both palettes');
    console.log(
      `  ok axe: the lab is clear in ${firstTheme} and ${secondTheme} (${findings.length} minor rule(s) allowed)`
    );

    assert.deepEqual(pageErrors, [], `the lab must not throw: ${pageErrors.join('; ')}`);
    await context.close();

    // ---- Reduced motion: the room does not animate ----
    const reducedContext = await browser.newContext({ reducedMotion: 'reduce' });
    await seedTourSeen(reducedContext);
    const reducedPage = await reducedContext.newPage();
    await openLab(reducedPage, baseUrl);
    assert.equal(await reducedPage.getByTestId('workshop-page').getAttribute('data-reduced-motion'), 'true');
    const duration = await reducedPage.evaluate(() => {
      const node = document.querySelector('[data-testid="workshop-figure"]');
      return node ? getComputedStyle(node).transitionDuration : null;
    });
    assert.ok(duration, 'the figure must have a computed transition duration');
    const seconds = Math.max(...duration.split(',').map((part) => parseFloat(part) || 0));
    assert.ok(seconds <= 0.05, `reduced motion must not animate the walk, got ${duration}`);
    await press(reducedPage, 'd');
    await waitForX(reducedPage, 0.64);
    console.log('  ok reduced motion swaps the walk for an instant move');
    await reducedContext.close();

    console.log('[PASS] workshop: 9 browser checks');
  } finally {
    await browser.close();
    if (ownServer) await ownServer.viteServer.close();
  }
}

main().catch((error) => {
  console.error('[FAIL] workshop:', error?.stack ?? error);
  process.exit(1);
});
