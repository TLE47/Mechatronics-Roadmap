#!/usr/bin/env node
/**
 * MechaLab 3.0 in a real browser (`scripts/e2e_game.mjs`, `npm run test:e2e:game`).
 *
 * The unit suites prove the engine and the content; only a browser can answer whether the game is
 * actually *wired to the work*. Three scenarios, each the real one:
 *
 *  1. A first visit gets the four-line prologue and the warning that the starter is meant to fail;
 *     dismissing it is remembered, so the second visit is quiet.
 *  2. A learner with Mission 1 verified sees LV 1, Mission 1 verified and Mission 2 in progress, the
 *     first Black Box recording open and the second one still locked, and a Perk panel that names
 *     what the next level opens.
 *  3. A real run that passes files an award: the toast appears, the ledger holds it, and a reload
 *     does not grant it a second time.
 *
 * The middle scenario seeds the verified flags on purpose — the engine's contract is that flags are
 * the only input, and re-running 21 lessons in a browser would test Pyodide, not the game.
 */

import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { resolveChromiumExecutable, startDevServer } from './e2e_browser_workbench.mjs';
import { waitForEditor } from './editor-code.mjs';
import { clickToolbar } from './e2e_toolbar.mjs';
import { seedTourSeen } from './tour_seed.mjs';
import { PYTHON_LESSONS } from '../app/src/data/pythonLessonsData.ts';
import { missionProgressForAll } from '../app/src/gamification/missions.ts';
import { STORY_SEEN_KEY } from '../app/src/story.ts';
import { AWARDS_STORAGE_KEY } from '../app/src/gamification/awardStore.ts';

const MISSION_ONE = missionProgressForAll({})[0];
const LESSON = PYTHON_LESSONS[0];

async function openWorkbench(page, baseUrl) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(document.querySelector('#root *')), undefined, {
    timeout: 30000,
  });
}

async function main() {
  const ownServer = process.env.E2E_BASE_URL ? null : await startDevServer(process.cwd());
  const baseUrl = process.env.E2E_BASE_URL ?? ownServer.baseUrl;
  const executablePath = resolveChromiumExecutable();
  const browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    headless: true,
  });
  try {
    // ---- 1. The story, and the one sentence that makes the first red result safe ----
    {
      const context = await browser.newContext();
      await context.addInitScript(() => {
        window.__mechalabPredictFirst = false;
      });
      await seedTourSeen(context);
      const page = await context.newPage();
      await openWorkbench(page, baseUrl);

      const prologue = page.getByTestId('prologue');
      await prologue.waitFor({ timeout: 15000 });
      const warning = await page.getByTestId('prologue-red-warning').textContent();
      assert.match(
        warning ?? '',
        /starter, not you/i,
        'the prologue must say the red result is the starter, before the first Run'
      );
      assert.match(warning ?? '', /red/i, 'the warning must name the red checks');
      console.log('  ok a first visit opens the prologue, and it explains the red checks');

      await page.getByTestId('btn-prologue-dismiss').click();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => Boolean(document.querySelector('#root *')), undefined, {
        timeout: 30000,
      });
      assert.equal(
        await page.getByTestId('prologue').count(),
        0,
        'a dismissed prologue must stay dismissed on the next visit'
      );
      const stored = await page.evaluate((key) => localStorage.getItem(key), STORY_SEEN_KEY);
      assert.equal(stored, '1', 'the dismissal must be remembered in the store, not just in state');
      console.log('  ok dismissing the prologue is remembered');
      await context.close();
    }

    // ---- 2. Mission Control, the journey map, the Black Box and the perk ladder ----
    {
      const context = await browser.newContext();
      await seedTourSeen(context);
      // A learner who has verified every check Mission 1 asks for, and nothing else.
      await context.addInitScript(
        ({ key, ids, storyKey }) => {
          localStorage.setItem(key, JSON.stringify(Object.fromEntries(ids.map((id) => [id, true]))));
          localStorage.setItem(storyKey, '1');
          window.__mechalabPredictFirst = false;
        },
        {
          key: 'mechalab_pyodide_verified_v1',
          ids: MISSION_ONE.entries.map((entry) => entry.id),
          storyKey: STORY_SEEN_KEY,
        }
      );
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      await page.goto(`${baseUrl}?view=dashboard`, { waitUntil: 'domcontentloaded' });
      await page.getByTestId('learner-dashboard').waitFor({ timeout: 30000 });

      const level = (await page.getByTestId('level-bar-level').textContent())?.trim();
      assert.equal(level, 'LV 1', `expected LV 1 after Mission 1, got ${level}`);
      const fill = page.getByTestId('level-bar-fill');
      assert.equal(await fill.getAttribute('data-value'), '0', 'the next mission has no checks yet');
      assert.match(
        (await page.getByTestId('level-bar-next').textContent()) ?? '',
        /to go in First Spark/,
        'the bar must name the mission it is measuring'
      );

      assert.equal(
        await page.getByTestId('mission-row-1').getAttribute('data-state'),
        'verified',
        'Mission 1 must read verified'
      );
      assert.equal(
        await page.getByTestId('mission-row-2').getAttribute('data-state'),
        'current',
        'Mission 2 must be the one in progress'
      );
      assert.equal(
        await page.getByTestId('mission-row-3').getAttribute('data-state'),
        'ahead',
        'Mission 3 is ahead, and still has an Open button'
      );
      const aheadButton = page.getByTestId('btn-mission-3');
      assert.equal(await aheadButton.isEnabled(), true, 'a mission ahead must never lock its lessons');
      console.log('  ok LV 1, Mission 1 verified, Mission 2 in progress, Mission 3 open');

      await page.getByTestId('btn-perks').click();
      const panel = page.getByTestId('perk-panel');
      await panel.waitFor({ timeout: 5000 });
      const panelText = (await panel.textContent()) ?? '';
      assert.match(panelText, /Now/, 'the Perk panel must show what is usable now');
      assert.match(panelText, /Next/, 'the Perk panel must show what the next level opens');
      assert.match(panelText, /Breadboard wiring toy/, 'LV 2 must name the toy it opens');
      assert.match(panelText, /Later/, 'the Perk panel must say what is further off');
      console.log('  ok the Perk panel names Now, Next and Later');

      assert.equal(
        await page.getByTestId('blackbox-row-1').getAttribute('data-locked'),
        'false',
        'recording 1 must be open after Mission 1'
      );
      assert.equal(
        await page.getByTestId('blackbox-row-2').getAttribute('data-locked'),
        'true',
        'recording 2 must still be locked'
      );
      await page.getByTestId('blackbox-row-1').locator('summary').click();
      const body = await page.getByTestId('blackbox-body-1').textContent();
      assert.match(body ?? '', /print the number/i, 'the open recording must be readable');
      const locked = await page.getByTestId('blackbox-row-2').textContent();
      assert.match(
        locked ?? '',
        /unlocks after First Spark is verified/,
        'a locked recording must say exactly what unlocks it'
      );
      console.log('  ok the Black Box opens what was earned and says what unlocks the rest');

      assert.deepEqual(pageErrors, [], `the dashboard must not throw: ${pageErrors.join('; ')}`);
      await context.close();
    }

    // ---- 3. A real pass files an award, once ----
    {
      const context = await browser.newContext();
      await seedTourSeen(context);
      await context.addInitScript(
        ({ key }) => {
          localStorage.setItem(key, '1');
          window.__mechalabPredictFirst = false;
        },
        { key: STORY_SEEN_KEY }
      );
      const page = await context.newPage();
      await openWorkbench(page, baseUrl);
      await page.getByTestId(`lesson-item-${LESSON.id}`).click();
      await waitForEditor(page, undefined, 20000);

      await clickToolbar(page, 'btn-load-solution');
      await page.getByTestId('btn-run-verify').click();
      await page.getByTestId('status-assert-passed').waitFor({ timeout: 90000 });

      const toast = page.getByTestId('award-toast');
      await toast.waitFor({ timeout: 15000 });
      const toastText = (await toast.textContent()) ?? '';
      assert.match(toastText, /Cold Boot/, `expected the first-checkpoint award, got: ${toastText}`);
      console.log('  ok a passing run earns the first Scrap and says so');

      const ledger = await page.evaluate((key) => localStorage.getItem(key), AWARDS_STORAGE_KEY);
      assert.ok(ledger, 'the award must be written to the ledger');
      assert.match(ledger, /cred:cold-boot/, 'the ledger must hold the stable id');
      const countAfterFirst = (JSON.parse(ledger).awards ?? []).length;

      // A reload re-reads the ledger; nothing in the app re-runs the rules on mount, and even if it
      // did, the id is already held. The count is the proof.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => Boolean(document.querySelector('#root *')), undefined, {
        timeout: 30000,
      });
      const ledgerAfterReload = await page.evaluate((key) => localStorage.getItem(key), AWARDS_STORAGE_KEY);
      assert.equal(
        (JSON.parse(ledgerAfterReload).awards ?? []).length,
        countAfterFirst,
        'a reload must not grant the same award twice'
      );
      assert.equal(await page.getByTestId('award-toast').count(), 0, 'no toast without new work');
      console.log('  ok the ledger survives a reload without duplicating the award');
      await context.close();
    }
  } finally {
    await browser.close();
    if (ownServer) await ownServer.viteServer.close();
  }
  console.log('[PASS] game: 7 browser checks');
}

main().catch((error) => {
  console.error(`[FAIL] The 3.0 game sweep failed: ${error.message}`);
  process.exit(1);
});
