#!/usr/bin/env node
/**
 * MechaLab 3.0 in a real browser (`scripts/e2e_game.mjs`, `npm run test:e2e:game`).
 *
 * The unit suites prove the engine and the content; only a browser can answer whether the game is
 * actually *wired to the work*. Four scenarios, each the real one:
 *
 *  1. A first visit gets the four-line prologue and the warning that the starter is meant to fail;
 *     dismissing it is remembered, so the second visit is quiet.
 *  2. A learner with Mission 1 verified sees LV 1, Mission 1 verified and Mission 2 in progress, the
 *     first Black Box recording open and the second one still locked, and a Perk panel that names
 *     what the next level opens.
 *  3. A real run that passes files an award: the toast appears, the ledger holds it, and a reload
 *     does not grant it a second time. Sound is exercised in the same scenario, because it hangs off
 *     the same run: off until asked for, the room arriving after the gesture, a click heard through
 *     the delegated listener, the bed ducked while the checks run, and one press back to silence.
 *  4. The sound panel on a 360×640 phone: it opens, the whole card is inside the window, a fader
 *     press does not close it, its last row is reachable by scrolling, and Escape gives focus back.
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
import { SOUND_STORAGE_KEY } from '../app/src/audio/prefs.ts';
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
      // Home replaced the old `dashboard` route; `?view=dashboard` stays an alias so this bookmark-shaped
      // link still lands on the same page.
      await page.goto(`${baseUrl}?view=dashboard`, { waitUntil: 'domcontentloaded' });
      await page.getByTestId('home-dashboard').waitFor({ timeout: 30000 });
      assert.equal(
        await page.getByTestId('home-today').isVisible(),
        true,
        'Home must open with today’s one check on screen'
      );
      assert.match(
        (await page.getByTestId('home-today-checks').textContent()) ?? '',
        /\d+ of \d+ checks/,
        'Today must count the checks of the mission it is measuring'
      );
      assert.equal(
        await page.getByTestId('btn-home-start').isEnabled(),
        true,
        'the one next thing must always be a live door'
      );

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

      assert.deepEqual(pageErrors, [], `Home must not throw: ${pageErrors.join('; ')}`);
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

      // ---- 3a. Sound is off until asked for, and one press turns it on ----
      assert.equal(
        await page.getByTestId('btn-sound-toggle').getAttribute('aria-pressed'),
        'false',
        'a fresh profile must show sound off'
      );
      assert.equal(
        await page.evaluate(() => window.__mechalabAudio?.().running ?? false),
        false,
        'nothing may hold a running AudioContext before the learner asks for sound'
      );
      await page.getByTestId('btn-sound-toggle').click();
      await page.waitForFunction(() => window.__mechalabAudio?.().running === true, undefined, {
        timeout: 15000,
      });
      const storedSound = await page.evaluate((key) => localStorage.getItem(key), SOUND_STORAGE_KEY);
      assert.match(storedSound ?? '', /"on":true/, 'the toggle must remember the choice');
      console.log('  ok sound is off by default and turns on in one click');

      // The room arrives after the gesture, not with it: the loop is fetched by the engine's lazy
      // chunk. A browser without AAC (headless Chromium is one) gets the synthesised fallback rather
      // than silence, which is the same promise the unit suite pins from the other side.
      await page.waitForFunction(
        () => ['file', 'synth'].includes(window.__mechalabAudio?.().rain ?? 'none'),
        undefined,
        { timeout: 20000 }
      );
      const rain = await page.evaluate(() => window.__mechalabAudio?.().rain);
      console.log(`  ok the room arrives after the gesture (${rain})`);

      // A click is heard, and it is the delegated listener that hears it: the classifier decides the
      // role, so the settings button (an `aria-expanded` latch) must arrive as a toggle.
      await page.getByTestId('btn-sound-settings').click();
      await page.getByTestId('sound-settings').waitFor({ timeout: 5000 });
      const uiCues = await page.evaluate(() => window.__mechalabAudio?.().uiCues);
      assert.ok(
        uiCues.includes('toggle'),
        `a latch must sound like a latch, got ${JSON.stringify(uiCues)}`
      );
      console.log('  ok a control click is heard');

      // ---- 3b. The audio settings panel: sections, levels, the two switches, previews, credit ----
      for (const section of ['sound-section-master', 'sound-clicks', 'sound-credits']) {
        assert.equal(
          await page.getByTestId(section).count(),
          1,
          `the panel must carry ${section}`
        );
      }
      const credits = (await page.getByTestId('sound-credits').textContent()) ?? '';
      assert.match(credits, /Snow Drift/, 'the panel must credit the track by name');
      assert.match(credits, /CC0/, 'and name the licence it is used under');
      console.log('  ok the panel has its sections, its switches and the music credit');

      await page.getByTestId('sound-music').fill('35');
      await page.getByTestId('sound-room').fill('40');
      await page.waitForFunction(() => window.__mechalabAudio?.().room === 0.4, undefined, {
        timeout: 5000,
      });
      const storedLevels = await page.evaluate((key) => localStorage.getItem(key), SOUND_STORAGE_KEY);
      assert.match(storedLevels ?? '', /"room":0.4/, 'the Room fader must be remembered');
      assert.match(storedLevels ?? '', /"music":0.35/, 'and so must Music');
      console.log('  ok the panel\'s faders reach the engine and the store');

      // Previews are what makes the clicks decision audible rather than described.
      const beforePreview = (await page.evaluate(() => window.__mechalabAudio?.().uiCues)).length;
      await page.getByTestId('btn-sound-preview-nav').click();
      await page.waitForFunction(
        (before) => (window.__mechalabAudio?.().uiCues.length ?? 0) > before,
        beforePreview,
        { timeout: 5000 }
      );
      const previewed = await page.evaluate(() => window.__mechalabAudio?.().uiCues.at(-1));
      assert.equal(previewed, 'nav', 'the preview must be the tick its label names');
      console.log('  ok a preview plays the tick it names');

      // Switching the interface clicks off must silence the interface — including the press that
      // switches them back on, which arrives while they are still off.
      const heard = () => page.evaluate(() => window.__mechalabAudio?.().uiCues.length ?? 0);
      // The last preview was a moment ago; the press that follows it is subject to the 35 ms gap, so
      // the measurement waits for the interface to be allowed to speak again.
      await page.waitForTimeout(80);
      const beforeSwitch = await heard();
      await page.getByTestId('sound-clicks').click(); // heard, and now off
      await page.waitForTimeout(80);
      const afterOff = await heard();
      assert.equal(afterOff, beforeSwitch + 1, 'the press that switches clicks off is still heard');
      await page.getByTestId('sound-clicks').click(); // silent, and now on again
      await page.waitForTimeout(80);
      assert.equal(await heard(), afterOff, 'and the press that brings them back is not');
      assert.equal(
        await page.getByTestId('sound-clicks').getAttribute('aria-pressed'),
        'true',
        'the second press still did its job'
      );
      console.log('  ok the click switch silences the interface, and still works while silent');

      // Six categories plus the drone, and the tapes inside the open one: choosing a category is a
      // press, not a list the learner has to discover, so every chip must be present and reachable.
      for (const category of ['lofi', 'jazz', 'instrumental', 'anime', 'pop', 'kpop']) {
        assert.equal(
          await page.getByTestId(`sound-category-${category}`).count(),
          1,
          `the picker must carry the ${category} category`
        );
      }
      await page.getByTestId('sound-category-jazz').click();
      await page.getByTestId('sound-tape-winter-blues').waitFor({ timeout: 5000 });
      await page.waitForFunction(() => window.__mechalabAudio?.().tape === 'winter-blues', undefined, {
        timeout: 5000,
      });
      await page.waitForFunction(() => window.__mechalabAudio?.().musicSource === 'file', undefined, {
        timeout: 20000,
      });
      assert.match(
        (await page.getByTestId('sound-credits').textContent()) ?? '',
        /Winter Blues/,
        'the credit must follow the chosen tape'
      );
      console.log('  ok a category opens its tape, and the tape really loads');

      // The drone never fetches anything, and a composed tape says so in the credit.
      await page.getByTestId('sound-tape-drone').click();
      await page.waitForFunction(() => window.__mechalabAudio?.().musicSource === 'synth', undefined, {
        timeout: 10000,
      });
      await page.getByTestId('sound-category-kpop').click();
      await page.getByTestId('sound-tape-neon-stage').click();
      await page.waitForFunction(() => window.__mechalabAudio?.().musicSource === 'file', undefined, {
        timeout: 20000,
      });
      assert.match(
        (await page.getByTestId('sound-credits').textContent()) ?? '',
        /composed by this repository/,
        'a synthesised tape must not be credited as a licensed recording'
      );
      console.log('  ok the drone and a composed tape are both reachable and honest about it');
      await page.keyboard.press('Escape');

      // Focus is a scene on the same bus: the bed crossfades quieter and the header's control goes
      // with the chrome, so the pill carries the one press from muted.
      await page.getByTestId('btn-focus-toggle').click();
      await page.waitForFunction(() => window.__mechalabAudio?.().scene === 'focus', undefined, {
        timeout: 15000,
      });
      assert.equal(
        await page.getByTestId('btn-sound-toggle-pill').getAttribute('aria-pressed'),
        'true',
        'the focus pill must show the same sound state'
      );
      await page.getByTestId('btn-focus-pill').click();
      await page.waitForFunction(() => window.__mechalabAudio?.().scene === 'home', undefined, {
        timeout: 15000,
      });
      console.log('  ok focus quiets the bed and the pill keeps the mute one click away');

      await clickToolbar(page, 'btn-load-solution');
      await page.getByTestId('btn-run-verify').click();
      await page.getByTestId('status-assert-passed').waitFor({ timeout: 90000 });
      const audio = await page.evaluate(() => window.__mechalabAudio?.());
      assert.ok(audio?.cues?.includes('verify'), `verify must make a sound, got ${audio?.cues}`);
      assert.equal(audio?.ducked, false, 'a finished run must lift the duck');
      // The duck itself is proven by the transition history rather than by catching it in the act: a
      // fast lesson can finish between two polls of a browser suite, and a race is not a check.
      const history = audio?.duckHistory ?? [];
      assert.ok(
        history.includes(true) && history.at(-1) === false,
        `a run must duck the bed and its verdict lift it, got ${JSON.stringify(history)}`
      );

      const toast = page.getByTestId('award-toast');
      await toast.waitFor({ timeout: 15000 });
      const toastText = (await toast.textContent()) ?? '';
      assert.match(toastText, /Cold Boot/, `expected the first-checkpoint award, got: ${toastText}`);
      console.log('  ok a run ducked the bed, its verdict lifted it, and the pass earned Scrap');

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

      // A remembered "on" is armed, not playing: the context must stay suspended until a gesture.
      assert.equal(
        await page.evaluate(() => window.__mechalabAudio?.().running ?? false),
        false,
        'a reload must not autoplay the room tone'
      );
      await page.getByTestId('btn-sound-toggle').click(); // on -> off
      await page.getByTestId('btn-sound-toggle').click(); // off -> on, a real gesture
      await page.waitForFunction(() => window.__mechalabAudio?.().running === true, undefined, {
        timeout: 15000,
      });
      console.log('  ok a remembered "on" waits for a gesture instead of autoplaying');

      // And one press the other way: a muted engine schedules nothing, whatever the learner touches.
      await page.getByTestId('btn-sound-toggle').click(); // on -> off
      await page.waitForFunction(() => window.__mechalabAudio?.().muted === true, undefined, {
        timeout: 5000,
      });
      const beforeMute = await page.evaluate(() => window.__mechalabAudio?.().uiCues.length);
      await page.getByTestId('btn-sound-settings').click();
      await page.keyboard.press('Escape');
      const afterMute = await page.evaluate(() => window.__mechalabAudio?.().uiCues.length);
      assert.equal(afterMute, beforeMute, 'a muted interface must be silent, not merely quiet');
      console.log('  ok one press mutes, and a muted interface schedules nothing');
      await context.close();
    }

    // ---- 4. The sound panel on a phone: it opens, it fits, and its last row is reachable ----
    //
    // The tray row the button lives in scrolls sideways on a phone, and the panel used to be an
    // `absolute` child of it: its left edge sat at -21 px and the row's clip box cut it off, so the
    // panel was open and unusable. A 360×640 window is the short end of the same problem — the card
    // was taller than the room under the header, and its credit and **Reset** were below the fold.
    {
      const context = await browser.newContext({
        viewport: { width: 360, height: 640 },
        isMobile: true,
        hasTouch: true,
      });
      await seedTourSeen(context);
      const page = await context.newPage();
      await openWorkbench(page, baseUrl);
      await page.getByTestId('btn-sound-settings').click();
      const panel = page.getByTestId('sound-settings');
      await panel.waitFor({ timeout: 5000 });

      const fits = await page.evaluate(() => {
        const card = document.querySelector('[data-testid="sound-settings"]');
        if (!card) return { missing: true };
        const box = card.getBoundingClientRect();
        return {
          view: { width: window.innerWidth, height: window.innerHeight },
          box: { top: box.top, left: box.left, right: box.right, bottom: box.bottom },
        };
      });
      assert.ok(!fits.missing, 'the panel did not open on a phone');
      assert.ok(fits.box.left >= 0, `the panel starts at ${fits.box.left} px, off the left edge`);
      assert.ok(
        fits.box.right <= fits.view.width + 1,
        `the panel ends at ${fits.box.right} px, past the ${fits.view.width} px window`
      );
      assert.ok(
        fits.box.bottom <= fits.view.height + 1,
        `the panel ends at ${fits.box.bottom} px, below the ${fits.view.height} px window`
      );

      // A press inside a portalled panel is not a press outside it: the panel must survive its own
      // controls, or every fader drag would close it on the first touch.
      await page.getByTestId('btn-sound-master').click();
      await page.getByTestId('sound-music').fill('35');
      assert.equal(await panel.count(), 1, 'a press inside the panel closed it');
      const stored = await page.evaluate((key) => localStorage.getItem(key), SOUND_STORAGE_KEY);
      assert.match(stored ?? '', /"music":0.35/, 'the phone\u2019s fader did not reach the store');

      // The card scrolls inside itself, and the last row is where the reset lives.
      const reset = page.getByTestId('btn-sound-reset');
      await reset.scrollIntoViewIfNeeded({ timeout: 5000 });
      const resetBox = await reset.boundingBox();
      assert.ok(resetBox, 'the reset button is not in the panel');
      assert.ok(
        resetBox.y + resetBox.height <= 640 + 1,
        `the reset button is at ${resetBox.y + resetBox.height} px, below the window`
      );
      await reset.click({ timeout: 5000 });

      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      assert.equal(await panel.count(), 0, 'Escape did not close the phone panel');
      assert.equal(
        await page.evaluate(() => document.activeElement?.getAttribute('data-testid')),
        'btn-sound-settings',
        'focus must go back to the button that opened the panel'
      );
      console.log('  ok the sound panel opens on a phone, fits 360×640, and keeps its controls usable');
      await context.close();
    }
  } finally {
    await browser.close();
    if (ownServer) await ownServer.viteServer.close();
  }
  console.log('[PASS] game: 17 browser checks');
}

main().catch((error) => {
  console.error(`[FAIL] The 3.0 game sweep failed: ${error.message}`);
  process.exit(1);
});
