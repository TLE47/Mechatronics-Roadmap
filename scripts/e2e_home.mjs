#!/usr/bin/env node
/**
 * Home, in a real browser (`scripts/e2e_home.mjs`, `npm run test:e2e:home`).
 *
 * The unit suite pins the two pure halves; what only a browser can answer is whether the page the
 * landing rule chose is the page that renders, and whether each card is really a door. So this suite
 * walks both halves of the same promise:
 *
 *   - a first visit still lands on the workbench with the Start Here block, because Home is a
 *     destination and never a gate;
 *   - a returning visit lands on Home, and its one next thing opens the lesson `Mission 1` asks for,
 *     its labs open their own tab, its route opens the roadmap, and its review button opens the deck;
 *   - a reload inside the sitting stays where the learner was, while a deep link to a lesson never
 *     lands on Home at all.
 *
 * Every id and title it compares comes from the app's own modules, so a renamed lesson or a new tab
 * is checked rather than guessed. The tabs are read from `data/workbenchTabs.json`, the same registry
 * the rail and Home's launcher both render.
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { resolveChromiumExecutable, startDevServer } from './e2e_browser_workbench.mjs';
import { waitForEditor } from './editor-code.mjs';
import { seedTourSeen } from './tour_seed.mjs';
import { PYTHON_LESSONS } from '../app/src/data/pythonLessonsData.ts';
import { nextMission } from '../app/src/gamification/missions.ts';
import { SPINE } from '../app/src/spine.ts';

const COMPLETED_KEY = 'mechalab_pyodide_completed_v1';
const TAB_IDS = Object.keys(
  JSON.parse(fs.readFileSync(path.join('app', 'src', 'data', 'workbenchTabs.json'), 'utf8')).tabs
);

const FIRST_LESSON = PYTHON_LESSONS[0];
/** The entry Home's Today panel starts with, from the same join the page calls. */
const TODAY_ENTRY = nextMission({})?.entries[0] ?? null;
const TODAY_TITLE = PYTHON_LESSONS.find((lesson) => lesson.id === TODAY_ENTRY?.id)?.title ?? null;

/** Wait until the lazy whole-page chunk has painted, not the Suspense line. */
async function waitForHome(page) {
  await page.getByTestId('home-dashboard').waitFor({ timeout: 30000 });
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
    // ---- 1. A first visit is the workbench, Start Here and all ----
    {
      const context = await browser.newContext();
      await seedTourSeen(context);
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.getByTestId('start-here').waitFor({ timeout: 30000 });
      assert.equal(
        await page.getByTestId('home-dashboard').count(),
        0,
        'a first visit belongs to the workbench: Home must never gate Lesson 1'
      );
      assert.deepEqual(pageErrors, [], `the first visit threw: ${pageErrors.join('; ')}`);
      console.log('  ok a first visit opens the workbench with Start Here, not Home');
      await context.close();
    }

    // ---- 1b. The wordmark is the door to the introduction ----
    {
      const context = await browser.newContext();
      await seedTourSeen(context);
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.getByTestId('link-brand').waitFor({ timeout: 30000 });
      await page.getByTestId('link-brand').click();
      await page.getByTestId('intro-page').waitFor({ timeout: 30000 });
      assert.equal(
        new URL(page.url()).searchParams.get('view'),
        'intro',
        'the introduction must own its address, so it can be shared, reloaded and gone back to'
      );
      assert.equal(
        await page.locator('#intro-route li').count(),
        SPINE.length,
        `the introduction must show all ${SPINE.length} route steps the roadmap prints`
      );
      assert.ok(
        (await page.locator('[data-testid^="intro-figure-"]').count()) >= 4,
        'the introduction is a showcase: it needs real figures, not only words'
      );
      assert.equal(
        await page.getByTestId(`intro-lab-${TAB_IDS[0]}`).count(),
        1,
        'every lab on the rail needs its door on the introduction'
      );
      assert.equal(
        await page.locator('#intro-route a').count(),
        0,
        'a route row must open the roadmap, not scroll to itself'
      );
      await page.getByTestId('intro-step-1').click();
      await page.getByTestId('tab-btn-tab-arch').waitFor({ timeout: 30000 });
      assert.equal(
        await page.getByTestId('tab-btn-tab-arch').getAttribute('aria-current'),
        'page',
        'a route row must land on the roadmap tab'
      );
      await page.goto(`${baseUrl}?view=intro`, { waitUntil: 'domcontentloaded' });
      await page.getByTestId('intro-page').waitFor({ timeout: 30000 });

      // A phone is the common case, not an edge. Two things have to hold at 390 px: the page
      // never scrolls sideways, and the account chip is on screen rather than the one control
      // hidden behind the swipeable tray row.
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(300);
      const narrow = await page.evaluate(() => {
        const root = document.documentElement;
        const chip = document.querySelector('[data-testid="btn-account"]')?.getBoundingClientRect();
        const strip = document.querySelector('[data-testid="tray-strip"]');
        return {
          scrollWidth: root.scrollWidth,
          clientWidth: root.clientWidth,
          chipRight: chip ? Math.round(chip.right) : null,
          stripScrollable: strip ? strip.scrollWidth > strip.clientWidth + 1 : false,
          pannedFigures: [...document.querySelectorAll('.intro-root .figure-art')].filter(
            (art) => art.scrollWidth > art.clientWidth + 1
          ).length,
        };
      });
      assert.equal(
        narrow.scrollWidth,
        narrow.clientWidth,
        `the introduction must not scroll sideways at 390 px (${narrow.scrollWidth} > ${narrow.clientWidth})`
      );
      assert.ok(
        narrow.chipRight !== null && narrow.chipRight <= 390,
        `the account chip must be on screen at 390 px, not at ${narrow.chipRight} px`
      );
      assert.equal(narrow.stripScrollable, true, 'the tray row must still scroll, so every control is reachable');
      assert.equal(
        narrow.pannedFigures,
        0,
        `a phone must not have to swipe a figure sideways (${narrow.pannedFigures} still pan)`
      );
      console.log('  ok at 390 px the page does not scroll sideways, the chip is visible and no figure pans');
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.waitForTimeout(200);

      // Motion is part of the page, not decoration bolted on: the spine's marker moves as the
      // route scrolls, and every gallery figure is a card that sweeps. Reduced motion removes both.
      assert.equal(
        await page.getByTestId('intro-route-traveller').count(),
        1,
        'the route must carry its position marker while motion is allowed'
      );
      const swept = await page.evaluate(() =>
        [...document.querySelectorAll('[data-testid^="intro-figure-"]')].every((card) =>
          card.classList.contains('intro-scan')
        )
      );
      assert.equal(swept, true, 'every gallery figure must be a live card, not a still');

      // The two motions a figure can carry: a workflow whose boxes change state, and a plot with a
      // cursor that actually moves. Both are attached after mount, so this also proves the effect
      // found the drawing rather than the Expand button's icon beside it.
      await page.locator('#intro-figures').scrollIntoViewIfNeeded();
      await page.waitForTimeout(900);
      const flow = await page.evaluate(() => ({
        steps: document.querySelectorAll('.intro-step').length,
        edges: document.querySelectorAll('.intro-edge').length,
      }));
      assert.ok(flow.steps >= 5, `a workflow figure must carry its boxes (${flow.steps} found)`);
      assert.ok(flow.edges >= 4, `a workflow figure must carry its connectors (${flow.edges} found)`);
      // Scoped to the visible cards: an off-screen figure pauses itself, and a paused dot would make
      // this pass or fail on the scroll position rather than on the animation.
      const dot = () =>
        page.evaluate(
          () =>
            document
              .querySelector('[data-testid="intro-figure-bode-margins"] circle[data-intro-tracer="true"]')
              ?.getAttribute('cx') ?? ''
        );
      const dotOne = await dot();
      await page.waitForTimeout(600);
      const dotTwo = await dot();
      assert.ok(dotOne !== '', 'a graph figure must carry its cursor');
      assert.notEqual(dotOne, dotTwo, 'the graph cursor must move while the figure is on screen');

      // The periodic plot is scrolled through its own period, so the wave itself moves; the
      // transform is the measurement, and the second reading must be a different one.
      const wave = () =>
        page.evaluate(
          () =>
            document
              .querySelector('[data-testid="intro-figure-three-phase"] path[transform]')
              ?.getAttribute('transform') ?? ''
        );
      const waveOne = await wave();
      await page.waitForTimeout(500);
      const waveTwo = await wave();
      assert.ok(waveOne.startsWith('translate('), `a wave figure must roll its series (got "${waveOne}")`);
      assert.notEqual(waveOne, waveTwo, 'the wave must move, not sit at its first frame');

      // The rest of the page moves too: the six lesson moves light in sequence, every lab carries
      // its ready beacon, the stat cards and the closing panel sweep.
      const chrome = await page.evaluate(() => {
        const name = (selector, pseudo) => {
          const node = document.querySelector(selector);
          return node ? getComputedStyle(node, pseudo).animationName : 'missing';
        };
        return {
          loop: name('.intro-loop-step'),
          beacon: name('.intro-beacon'),
          stat: name('.intro-stat', '::after'),
          closing: name('.intro-closing'),
          loops: document.querySelectorAll('.intro-loop-step').length,
        };
      });
      assert.equal(chrome.loops, 6, `the lesson loop must light all six moves (found ${chrome.loops})`);
      assert.match(chrome.loop, /intro-loop-state/, 'the six moves must change state in order');
      assert.match(chrome.beacon, /intro-beacon/, 'each lab bench must show its ready beacon');
      assert.match(chrome.stat, /intro-edge-sweep/, 'the stat cards must carry their sweep');
      assert.match(chrome.closing, /intro-aurora/, 'the closing panel must move');

      // Geometry, not vibes: a connector must be long enough to read as a direction, and a graph's
      // edge label must sit in the gap between two boxes instead of over either of them. Both were
      // complaints about the drawing itself, so both are measured off the rendered SVG.
      const geometry = await page.evaluate(() => {
        const figure = (id) =>
          document.querySelector(`[data-testid="intro-figure-${id}"] .figure-art > svg`);
        const chain = figure('signal-chain');
        const arrows = [...chain.querySelectorAll('line[marker-end]')].map((line) =>
          Math.abs(Number(line.getAttribute('x2')) - Number(line.getAttribute('x1')))
        );
        const graph = figure('ros-graph');
        const boxes = [...graph.querySelectorAll('rect[rx="7"]')].map((rect) => ({
          x: Number(rect.getAttribute('x')),
          w: Number(rect.getAttribute('width')),
        }));
        const labels = [...graph.querySelectorAll('text')]
          .filter((text) => (text.textContent ?? '').startsWith('/'))
          .map((text) => {
            const box = text.getBBox();
            const left = boxes.filter((candidate) => candidate.x + candidate.w <= box.x + 1).at(-1);
            const right = boxes.find((candidate) => candidate.x >= box.x + box.width - 1);
            return {
              text: text.textContent,
              width: Math.round(box.width),
              gap: left && right ? Math.round(right.x - (left.x + left.w)) : 0,
            };
          });
        return { shortestArrow: Math.round(Math.min(...arrows)), labels };
      });
      assert.ok(
        geometry.shortestArrow >= 26,
        `a connector is ${geometry.shortestArrow} units long: too short to read as a direction`
      );
      assert.equal(geometry.labels.length, 3, 'the ROS graph must label all three of its edges');
      for (const label of geometry.labels) {
        assert.ok(label.gap > 0, `${label.text} does not sit between two boxes (gap ${label.gap})`);
        assert.ok(
          label.width < label.gap,
          `${label.text} is ${label.width} units wide in a ${label.gap}-unit gap, so a box hides it`
        );
      }

      // One switch, two homes: the header's Motion button and this page's Play/Pause write the same
      // preference, so turning it off at the top of the page stills the figures below it — and the
      // pause is the same pause the lesson figures obey.
      assert.equal(
        await page.getByTestId('btn-motion-toggle').getAttribute('aria-pressed'),
        'true',
        'the header must show motion as on while the figures are playing'
      );
      await page.getByTestId('btn-motion-toggle').click();
      await page.waitForTimeout(350);
      assert.equal(
        await page.getByTestId('intro-page').getAttribute('data-motion'),
        'off',
        "the header's Motion button must still the introduction, not only whatever page it is on"
      );
      assert.equal(
        await page.locator('[data-intro-packet], [data-intro-tracer]').count(),
        0,
        'a paused introduction must remove its scripted motion from the header switch too'
      );
      await page.getByTestId('btn-motion-toggle').click();
      await page.waitForTimeout(350);
      assert.equal(
        await page.getByTestId('intro-page').getAttribute('data-motion'),
        'on',
        'pressing the header switch again must restart the page'
      );
      console.log("  ok the header's Motion switch and the page's own control are one preference");

      // The arm is a canvas, so nothing in the DOM reports its pose: compare the drawing itself. While
      // the page plays, two frames must differ; a paused page must hold one frame.
      const armCanvas = page.locator('.intro-arm-card canvas');
      await armCanvas.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      const frameOf = () => armCanvas.evaluate((element) => element.toDataURL());
      const firstFrame = await frameOf();
      await page.waitForTimeout(220);
      const secondFrame = await frameOf();
      assert.notEqual(firstFrame, secondFrame, 'the arm must draw a new frame while the page is playing');
      await page.getByTestId('btn-motion-toggle').click();
      await page.waitForTimeout(250);
      const stillFrame = await frameOf();
      await page.waitForTimeout(300);
      assert.equal(await frameOf(), stillFrame, 'the Motion switch must still the arm itself, not only the DOM figures');
      await page.getByTestId('btn-motion-toggle').click();
      await page.waitForTimeout(250);
      assert.notEqual(await frameOf(), stillFrame, 'turning motion back on must restart the arm');
      console.log('  ok the canvas arm moves, and the same switch stops it');

      // The nav is the page's own position indicator: nothing before the first section, then the
      // chip of the section under the reading line.
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
      assert.equal(
        await page.locator('.intro-nav-chip[aria-current]').count(),
        0,
        'no chip may claim a section while the hero is the thing on screen'
      );
      await page.locator('#intro-figures').scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      assert.equal(
        await page.getByTestId('intro-nav-intro-figures').getAttribute('aria-current'),
        'location',
        'the chip for the section under the reading line must be the current one'
      );
      console.log(
        '  ok the route marker, the workflow states, the cursor, the wave, the loop, the labs, the stats, the closing panel and the nav are live'
      );

      // The OS setting is the default, not a verdict: a reader whose machine asks for less motion
      // gets a still page, and the Play control in the header (and on the section row) is the way
      // out. A fresh context has never chosen, which is exactly this case.
      const quiet = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        reducedMotion: 'reduce',
      });
      const stillPage = await quiet.newPage();
      await stillPage.goto(`${baseUrl}?view=intro`, { waitUntil: 'domcontentloaded' });
      await stillPage.getByTestId('intro-page').waitFor({ timeout: 30000 });
      await stillPage.locator('#intro-figures').scrollIntoViewIfNeeded();
      await stillPage.waitForTimeout(800);
      assert.equal(
        await stillPage.getByTestId('intro-page').getAttribute('data-motion'),
        'off',
        'a reader who never chose, on a machine set to reduce motion, must get a still page'
      );
      assert.equal(
        await stillPage.locator('[data-intro-packet], [data-intro-tracer], .intro-step').count(),
        0,
        'a still page must not start any frame loops or annotate any figure'
      );
      // The header's switch, not only the page's: choosing motion is one press from any screen.
      const headerMotion = stillPage.getByTestId('btn-motion-toggle');
      assert.equal(await headerMotion.getAttribute('aria-pressed'), 'false', 'the header must show the OS default answer');
      await headerMotion.click();
      await stillPage.waitForTimeout(700);
      assert.equal(
        await stillPage.getByTestId('intro-page').getAttribute('data-motion'),
        'on',
        "choosing motion in the header must play the introduction's own figures"
      );
      const playing = await stillPage.evaluate(() =>
        [...document.querySelectorAll('[data-testid^="intro-figure-"]')].filter(
          (card) => card.querySelector('.intro-step, [data-intro-packet], [data-intro-tracer]')
        ).length
      );
      assert.equal(playing, 6, `every one of the six figures must carry a motion source once chosen (${playing} did)`);
      // One press stills the page again — the CSS loops and the scripted packets alike — and the
      // choice is remembered, so the next visit does not undo a deliberate pause.
      await stillPage.locator('.intro-nav-chip[aria-pressed]').click();
      await stillPage.waitForTimeout(350);
      assert.equal(
        await stillPage.getByTestId('intro-page').getAttribute('data-motion'),
        'off',
        'the play/pause control must still the page'
      );
      assert.equal(
        await stillPage.locator('[data-intro-packet], [data-intro-tracer]').count(),
        0,
        'a paused page must remove the scripted motion, not only stop advancing it'
      );
      const pausedChrome = await stillPage.evaluate(() =>
        getComputedStyle(document.querySelector('.intro-loop-step')).animationName
      );
      assert.equal(pausedChrome, 'none', 'a paused page must stop its CSS loops too');
      await stillPage.reload({ waitUntil: 'domcontentloaded' });
      await stillPage.getByTestId('intro-page').waitFor({ timeout: 30000 });
      assert.equal(
        await stillPage.getByTestId('intro-page').getAttribute('data-motion'),
        'off',
        'a pause must survive the reload, or the control is a one-visit gimmick'
      );
      await quiet.close();
      console.log('  ok motion follows the OS until chosen, then a press stills it and the pause is remembered');

      // A reload is still the introduction: an explicit view is the learner's choice, not a guess.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByTestId('intro-page').waitFor({ timeout: 30000 });
      await page.getByTestId('btn-intro-home').click();
      await waitForHome(page);
      assert.deepEqual(pageErrors, [], `the introduction threw: ${pageErrors.join(' | ')}`);
      console.log('  ok the wordmark opens the introduction, and its doors lead back in');
      await context.close();
    }

    // ---- 2. A returning visit lands on Home ----
    const context = await browser.newContext();
    await seedTourSeen(context);
    await context.addInitScript(
      ({ key, id }) => {
        localStorage.setItem(key, JSON.stringify({ [id]: true }));
      },
      { key: COMPLETED_KEY, id: FIRST_LESSON.id }
    );
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await waitForHome(page);
    assert.match(
      new URL(page.url()).search,
      /view=home/,
      'Home must keep the address in step so the page can be shared and reloaded'
    );
    console.log('  ok a returning visit with no view lands on Home, and the address says so');

    // ---- 2b. The introduction is reachable from Home and the footer too ----
    assert.equal(
      await page.getByTestId('btn-home-intro').count(),
      1,
      'Home needs a door to the introduction that is not the logo'
    );
    assert.equal(
      await page.getByTestId('link-intro-footer').count(),
      1,
      'the footer is on every page, so it is the one place the door costs nothing'
    );
    await page.getByTestId('btn-home-intro').click();
    await page.getByTestId('intro-page').waitFor({ timeout: 30000 });
    assert.equal(
      new URL(page.url()).searchParams.get('view'),
      'intro',
      'the Home door must land on the introduction, address and all'
    );
    await page.getByTestId('btn-intro-home').click();
    await waitForHome(page);
    console.log('  ok Home and the footer both open the introduction');

    // ---- 3. Today is one check, not a map ----
    assert.equal(await page.getByTestId('home-today').isVisible(), true);
    assert.match(
      (await page.getByTestId('home-today-checks').textContent()) ?? '',
      /0 of \d+ checks/,
      'Today must count the checks of the mission it measures, and only the ones this profile passed'
    );
    assert.equal(await page.getByTestId('btn-home-start').isEnabled(), true);
    console.log('  ok Today names the first mission’s one next check');

    // ---- 4. The labs are the rail, with every room on it ----
    assert.equal(
      await page.locator('[data-testid^="home-lab-"]').count(),
      TAB_IDS.length,
      `Home must offer every room the rail has (${TAB_IDS.length}); a tab added to the registry needs no edit here`
    );
    for (const tabId of TAB_IDS) {
      assert.equal(
        await page.getByTestId(`home-lab-${tabId}`).count(),
        1,
        `Home is missing the ${tabId} door`
      );
    }
    console.log(`  ok Home launches all ${TAB_IDS.length} labs from the rail's own registry`);

    // ---- 5. The route counts the same ten steps the roadmap prints ----
    assert.equal(
      await page.locator('[data-testid^="home-route-step-"]').count(),
      SPINE.length,
      `the route must list all ${SPINE.length} steps`
    );
    assert.match(
      (await page.getByTestId('home-route-total').textContent()) ?? '',
      /0 of \d+ checks/,
      'the route total must be check counts, not a second denominator'
    );
    console.log(`  ok the route is ${SPINE.length} steps of check counts`);

    // ---- 6. A lab card is a door, not a detail panel ----
    await page.getByTestId('home-lab-tab-bode').click();
    await page.getByTestId('tab-btn-tab-bode').waitFor({ timeout: 30000 });
    assert.equal(
      await page.getByTestId('tab-btn-tab-bode').getAttribute('aria-current'),
      'page',
      'a lab card must open that tab, not merely the workbench'
    );
    assert.equal(new URL(page.url()).searchParams.get('view'), null, 'the workbench is not a view query');
    console.log('  ok a lab card opens its own tab in one click');

    // ---- 7. The one next thing opens the lesson it named ----
    await page.goto(`${baseUrl}?view=home`, { waitUntil: 'domcontentloaded' });
    await waitForHome(page);
    await page.getByTestId('btn-home-start').click();
    await waitForEditor(page, undefined, 30000);
    const openedTitle = (await page.getByTestId('lesson-title').textContent())?.trim() ?? '';
    assert.equal(
      openedTitle,
      TODAY_TITLE,
      `Start must open the entry Today named ("${TODAY_ENTRY?.id}"); the editor shows "${openedTitle}"`
    );
    assert.equal(
      await page.getByTestId('home-dashboard').count(),
      0,
      'the workbench must replace Home rather than sit under it'
    );
    console.log(`  ok Start opened ${TODAY_ENTRY?.id} in one click`);

    // ---- 7b. Continue puts the reader back where it was left ----
    {
      const reader = page.getByTestId('reader-scroll');
      await reader.waitFor({ timeout: 30000 });
      const target = await reader.evaluate((pane) => {
        const furthest = Math.max(0, pane.scrollHeight - pane.clientHeight);
        pane.scrollTop = Math.min(900, furthest);
        pane.dispatchEvent(new Event('scroll', { bubbles: true }));
        return pane.scrollTop;
      });
      assert.ok(target > 120, `the pane must be long enough to scroll (moved ${target} px)`);
      // The write is debounced; one pause longer than the debounce is the whole contract.
      await page.waitForTimeout(700);
      await page.goto(`${baseUrl}?view=home`, { waitUntil: 'domcontentloaded' });
      await waitForHome(page);
      await page.getByTestId('btn-home-start').click();
      await waitForEditor(page, undefined, 30000);
      await page.getByTestId('reader-scroll').waitFor({ timeout: 30000 });
      await page.waitForTimeout(1200);
      const restored = await page.getByTestId('reader-scroll').evaluate((pane) => pane.scrollTop);
      assert.ok(
        Math.abs(restored - target) <= 24,
        `Continue must reopen the lesson at ${Math.round(target)} px, not ${Math.round(restored)} px`
      );
      console.log(`  ok Continue reopened the lesson at ${Math.round(restored)} px (left at ${Math.round(target)})`);
    }

    // ---- 7c. A selected passage can become a sticky note, not only a highlight ----
    {
      const pane = page.getByTestId('reader-scroll');
      const selected = await pane.evaluate((element) => {
        const paragraph = element.querySelector('p');
        if (!paragraph) return '';
        const range = document.createRange();
        range.selectNodeContents(paragraph);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        document.dispatchEvent(new Event('selectionchange'));
        return selection?.toString() ?? '';
      });
      assert.ok(selected.trim().length > 20, 'the reader must have a paragraph to select');
      await page.getByTestId('btn-sticky').click();
      await page.getByTestId('sticky-note-popup').waitFor({ timeout: 10000 });
      await page.getByTestId('sticky-note-text').fill('The sampling time is the thing I keep forgetting.');
      await page.getByTestId('btn-sticky-save').click();
      await page.waitForFunction(
        () => /Sticky note saved/.test(document.querySelector('[data-testid="reader-status"]')?.textContent ?? ''),
        undefined,
        { timeout: 10000 }
      );
      assert.equal(
        await page.getByTestId('sticky-note-popup').count(),
        0,
        'saving must close the popup rather than leave a stale selection in it'
      );
      console.log('  ok a selected passage opens a sticky-note popup and saves it to Notes');
    }

    // ---- 8. Review opens the deck where the cards live ----
    await page.goto(`${baseUrl}?view=home`, { waitUntil: 'domcontentloaded' });
    await waitForHome(page);
    await page.getByTestId('btn-home-review').click();
    await page.getByTestId('panel-study').waitFor({ timeout: 30000 });
    assert.equal(
      await page.getByTestId('tab-btn-tab-pyodide').getAttribute('aria-current'),
      'page',
      'the deck lives in the runner, so Review must go there'
    );
    console.log('  ok Review lands on the runner with the Study panel open');

    // ---- 9. The route door opens the roadmap ----
    await page.goto(`${baseUrl}?view=home`, { waitUntil: 'domcontentloaded' });
    await waitForHome(page);
    await page.getByTestId('btn-home-route').click();
    await page.getByTestId('tab-btn-tab-arch').waitFor({ timeout: 30000 });
    assert.equal(await page.getByTestId('tab-btn-tab-arch').getAttribute('aria-current'), 'page');
    console.log('  ok the route door opens the roadmap');

    // ---- 10. A reload stays in the sitting, and Home is not lapped ----
    await page.goto(`${baseUrl}?view=home`, { waitUntil: 'domcontentloaded' });
    await waitForHome(page);
    // No query at all: the sitting rule alone has to choose Home here.
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await waitForHome(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForHome(page);
    assert.match(new URL(page.url()).search, /view=home/, 'a reload must not be walked out of Home');
    console.log('  ok a reload inside the sitting stays on Home');

    // ---- 11. A lesson link is a destination, never the homepage ----
    await page.goto(`${baseUrl}?lesson=${FIRST_LESSON.id}`, { waitUntil: 'domcontentloaded' });
    await waitForEditor(page, undefined, 30000);
    assert.equal(
      await page.getByTestId('home-dashboard').count(),
      0,
      'a deep link to a lesson must land in the editor, not on a dashboard'
    );
    assert.equal(
      (await page.getByTestId('lesson-title').textContent())?.trim(),
      FIRST_LESSON.title,
      'the link must open the lesson it names'
    );
    console.log('  ok ?lesson= still opens that lesson, never Home');

    assert.deepEqual(pageErrors, [], `Home threw during the walk: ${pageErrors.join(' | ')}`);
    console.log(
      '[PASS] Home: a first visit stays on the workbench, a returning one lands on Home, ' +
        "Today's check, the labs, the route and review are all one click, a reload stays, and a lesson link bypasses it"
    );
    await context.close();
  } finally {
    await browser.close();
    if (ownServer) await ownServer.viteServer.close();
  }
}

main().catch((error) => {
  console.error('[FAIL] Home checks failed:', error.message);
  process.exit(1);
});
