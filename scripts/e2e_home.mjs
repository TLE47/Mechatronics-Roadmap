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

      // The page sizes the arm on `dvh`, and its box can change without a window `resize` (an address bar
      // settling, a panel resizing after mount). While the backing store kept the old height the drawing
      // was stretched — a round joint became an ellipse — so the canvas observes its own box now.
      const lateBox = await armCanvas.evaluate(async (element) => {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const measure = () => {
          const rect = element.getBoundingClientRect();
          return {
            css: Math.round(rect.height),
            backing: Math.round(element.height / dpr),
            cssWidth: Math.round(rect.width),
            backingWidth: Math.round(element.width / dpr),
          };
        };
        const original = element.style.height;
        element.style.height = '264px';
        await wait(250);
        const stretched = measure();
        element.style.height = original;
        await wait(250);
        return { stretched, restored: measure() };
      });
      assert.ok(
        Math.abs(lateBox.stretched.backing - lateBox.stretched.css) <= 1,
        `a 264 px box drew a ${lateBox.stretched.backing} px backing for ${lateBox.stretched.css} px of height, so the arm is stretched`
      );
      assert.ok(
        Math.abs(lateBox.stretched.backingWidth - lateBox.stretched.cssWidth) <= 1,
        'a late box change must keep the backing width in step too'
      );
      assert.ok(
        Math.abs(lateBox.restored.backing - lateBox.restored.css) <= 1,
        `restoring the box left a ${lateBox.restored.backing} px backing for ${lateBox.restored.css} px of height`
      );
      console.log('  ok a box change without a window resize re-measures the arm');

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

      // A first visit is on, even on a machine that asks for less motion: the owner's rule is that
      // the page opens on its drawings, and the header switch is one press away for a reader who
      // wants stillness. A fresh context has never chosen, which is exactly this case.
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
        'on',
        'a reader who has never chosen must open on moving figures'
      );
      const playing = await stillPage.evaluate(() =>
        [...document.querySelectorAll('[data-testid^="intro-figure-"]')].filter(
          (card) => card.querySelector('.intro-step, [data-intro-packet], [data-intro-tracer]')
        ).length
      );
      assert.equal(playing, 6, `every one of the six figures must carry a motion source by default (${playing} did)`);
      // The header's switch, not only the page's: stilling the page is one press from any screen.
      const headerMotion = stillPage.getByTestId('btn-motion-toggle');
      assert.equal(await headerMotion.getAttribute('aria-pressed'), 'true', 'the header must report motion on');
      await headerMotion.click();
      await stillPage.waitForTimeout(350);
      assert.equal(
        await stillPage.getByTestId('intro-page').getAttribute('data-motion'),
        'off',
        'the header switch must still the page'
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
      // The choice is remembered, so the next visit does not undo a deliberate pause.
      await stillPage.reload({ waitUntil: 'domcontentloaded' });
      await stillPage.getByTestId('intro-page').waitFor({ timeout: 30000 });
      assert.equal(
        await stillPage.getByTestId('intro-page').getAttribute('data-motion'),
        'off',
        'a pause must survive the reload, or the control is a one-visit gimmick'
      );
      assert.equal(
        await stillPage.getByTestId('btn-motion-toggle').getAttribute('aria-pressed'),
        'false',
        'the header must still report the remembered pause after a reload'
      );
      await quiet.close();
      console.log('  ok motion is on by default, one press stills it, and the pause is remembered');

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

    // ---- 7c. A bullet is a checkbox, and a tick is remembered ----
    let checklistKey = '';
    {
      const boxes = page.locator('[data-testid^="reader-check-"]');
      const count = await boxes.count();
      assert.ok(count > 0, 'the lesson text must draw its bullet lists as checkboxes');
      const first = boxes.first();
      checklistKey = (await first.getAttribute('data-check-key')) ?? '';
      assert.ok(checklistKey.length > 0, 'a checkbox needs the item identity it stores');
      assert.equal(await first.isChecked(), false, 'a fresh browser starts with nothing ticked');
      await first.check();
      assert.equal(await first.isChecked(), true, 'ticking must land, not merely look pressed');
      console.log(`  ok ${count} bullets are checkboxes, and the first one ticks`);
    }

    // ---- 7d. A selected passage can become a sticky note, marked in the prose ----
    {
      const pane = page.getByTestId('reader-scroll');
      // Select inside one prose text node, not the whole paragraph: a note's anchor is its quote,
      // and a mark has to be able to find that quote inside the run it was taken from.
      const selected = await pane.evaluate((element) => {
        const prose = element.querySelector('[data-testid="reader-prose"]');
        if (!prose) return '';
        const walker = document.createTreeWalker(prose, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node) {
          const value = node.textContent ?? '';
          const blocked = node.parentElement?.closest('a, code, pre, [data-testid="sticky-mark"]');
          if (!blocked && value.trim().length >= 80) break;
          node = walker.nextNode();
        }
        if (!node) return '';
        const value = node.textContent ?? '';
        const lead = value.length - value.trimStart().length;
        const range = document.createRange();
        range.setStart(node, lead);
        range.setEnd(node, Math.min(value.length, lead + 48));
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        document.dispatchEvent(new Event('selectionchange'));
        return selection?.toString() ?? '';
      });
      assert.ok(selected.trim().length > 20, 'the reader must have a prose passage to select');
      await page.getByTestId('btn-sticky').click();
      await page.getByTestId('sticky-note-popup').waitFor({ timeout: 10000 });
      const note = 'The sampling time is the thing I keep forgetting.';
      await page.getByTestId('sticky-note-text').fill(note);
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

      const mark = page.locator('[data-testid="sticky-mark"]').first();
      await mark.waitFor({ timeout: 10000 });
      assert.ok(
        (await page.locator('[data-testid="sticky-mark"]').count()) >= 1,
        'the saved quote must be marked in the lesson text, not only listed in Notes'
      );
      await mark.click();
      await page.getByTestId('sticky-note-popup').waitFor({ timeout: 10000 });
      assert.equal(
        await page.getByTestId('sticky-note-text').inputValue(),
        note,
        'pressing a mark must reopen the note written for that passage'
      );

      // Bold by shortcut, underline from the bar: both are the same Markdown the note stores.
      await page.getByTestId('sticky-note-text').press('ControlOrMeta+a');
      await page.keyboard.press('ControlOrMeta+b');
      assert.equal(
        await page.getByTestId('sticky-note-text').inputValue(),
        `**${note}**`,
        '⌘B / Ctrl+B must wrap the selected note text'
      );
      assert.equal(
        await page.getByTestId('sticky-note-preview').locator('strong').count(),
        1,
        'the preview must draw the bold run as bold, not as asterisks'
      );
      await page.getByTestId('btn-sticky-underline').click();
      assert.equal(
        await page.getByTestId('sticky-note-text').inputValue(),
        `**++${note}++**`,
        'the Underline button must wrap the text the shortcut left selected'
      );
      assert.equal(
        await page.getByTestId('sticky-note-preview').locator('u').count(),
        1,
        'the preview must draw the underline'
      );
      await page.getByTestId('btn-sticky-save').click();
      await page.waitForFunction(
        () => /Sticky note updated/.test(document.querySelector('[data-testid="reader-status"]')?.textContent ?? ''),
        undefined,
        { timeout: 10000 }
      );
      assert.equal(await page.getByTestId('sticky-note-popup').count(), 0, 'an edit saves and closes');
      console.log('  ok a mark reopens its note, B/Underline format it, and Save updates it in place');

      // Both stores are per lesson and on this device; the page is the only thing that changes.
      await page.goto(`${baseUrl}?view=home`, { waitUntil: 'domcontentloaded' });
      await waitForHome(page);
      await page.getByTestId('btn-home-start').click();
      await waitForEditor(page, undefined, 30000);
      await page.getByTestId('reader-scroll').waitFor({ timeout: 30000 });
      await page.waitForTimeout(800);
      const reloaded = page.locator('[data-testid^="reader-check-"]').first();
      assert.equal(
        await reloaded.getAttribute('data-check-key'),
        checklistKey,
        'the reopened page must list the same first item'
      );
      assert.equal(await reloaded.isChecked(), true, 'a tick must survive a reload');
      assert.ok(
        (await page.locator('[data-testid="sticky-mark"]').count()) >= 1,
        'a marked passage must survive a reload'
      );
      await page.locator('[data-testid="sticky-mark"]').first().click();
      await page.getByTestId('sticky-note-popup').waitFor({ timeout: 10000 });
      assert.equal(
        await page.getByTestId('sticky-note-text').inputValue(),
        `**++${note}++**`,
        'the mark must reopen the formatted note after a reload'
      );
      await page.getByTestId('btn-sticky-cancel').click();
      console.log('  ok the checklist tick and the formatted note both survive a reload');
    }

    // ---- 7e. The note opens beside the words, above or below whichever has the room ----
    {
      const original = page.viewportSize() ?? { width: 1280, height: 900 };
      const pane = page.getByTestId('reader-scroll');

      /** Select a passage, and report where its words are, in viewport coordinates. */
      const selectPassage = async (where) =>
        pane.evaluate((element, placement) => {
          const prose = element.querySelector('[data-testid="reader-prose"]');
          if (!prose) return null;
          const paneBox = element.getBoundingClientRect();
          const walker = document.createTreeWalker(prose, NodeFilter.SHOW_TEXT);
          let chosen = null;
          while (walker.nextNode()) {
            const node = walker.currentNode;
            const value = node.textContent ?? '';
            if (value.trim().length < 80) continue;
            if (node.parentElement?.closest('a, code, pre, [data-testid="sticky-mark"]')) continue;
            const probe = document.createRange();
            probe.setStart(node, 0);
            probe.setEnd(node, Math.min(value.length, 8));
            const box = probe.getBoundingClientRect();
            if (box.height === 0 || box.bottom < paneBox.top || box.top > paneBox.bottom) continue;
            // Both passes look only at text the pane is showing; one takes the last such line, the
            // other the first, so `where` picks the edge of the pane rather than a fixed paragraph.
            if (!chosen || (placement === 'bottom' ? box.bottom > chosen.box.bottom : box.top < chosen.box.top)) {
              chosen = { node, box };
            }
          }
          if (!chosen) return null;
          const value = chosen.node.textContent ?? '';
          const lead = value.length - value.trimStart().length;
          const range = document.createRange();
          range.setStart(chosen.node, lead);
          range.setEnd(chosen.node, Math.min(value.length, lead + 48));
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
          document.dispatchEvent(new Event('selectionchange'));
          const rect = range.getBoundingClientRect();
          return {
            text: selection?.toString() ?? '',
            top: rect.top,
            bottom: rect.bottom,
            left: rect.left,
            right: rect.right,
          };
        }, where);

      /** Open the note on a passage at one edge of the pane, and report where everything landed. */
      const openOn = async (placement) => {
        await pane.evaluate((element, where) => {
          element.scrollTop = where === 'bottom' ? element.scrollHeight : 0;
        }, placement);
        await page.waitForTimeout(400);
        // For the bottom case, put the pane's own bottom edge near the window's, which is what makes the
        // last visible line a passage with no room under it. The page scrolls, not the pane.
        if (placement === 'bottom') {
          await page.evaluate(() => {
            const element = document.querySelector('[data-testid="reader-scroll"]');
            if (!element) return;
            const box = element.getBoundingClientRect();
            window.scrollBy(0, box.bottom - window.innerHeight + 40);
          });
          await page.waitForTimeout(400);
        }
        const passage = await selectPassage(placement);
        assert.ok(
          passage && passage.text.trim().length > 20,
          `the ${placement} of the pane must have a passage to select`
        );
        await page.getByTestId('btn-sticky').click();
        const popup = page.getByTestId('sticky-note-popup');
        await popup.waitFor({ timeout: 10000 });
        // Pressing the button is allowed to scroll the pane (the toolbar has to be in view), so the
        // passage is measured again *now*: the popover is placed against where the words are after
        // that scroll, and a comparison with the box from before it would be a different passage.
        const words = await page.evaluate((quote) => {
          const pane = document.querySelector('[data-testid="reader-scroll"]');
          if (!pane) return null;
          const needle = quote.trim().slice(0, 24);
          const walker = document.createTreeWalker(pane, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            const node = walker.currentNode;
            const value = node.textContent ?? '';
            const at = value.indexOf(needle);
            if (at === -1) continue;
            const range = document.createRange();
            range.setStart(node, at);
            range.setEnd(node, Math.min(value.length, at + quote.trim().length));
            const box = range.getBoundingClientRect();
            if (!box.width && !box.height) continue;
            return { top: box.top, bottom: box.bottom, left: box.left, right: box.right };
          }
          return null;
        }, passage.text);
        return {
          passage: { ...passage, ...(words ?? {}) },
          popup,
          box: await popup.boundingBox(),
          side: await popup.getAttribute('data-anchor-side'),
        };
      };

      /** The card must sit clear of the words - above or below, never over them. */
      const clearance = ({ box, passage, side }) => {
        assert.ok(box, 'the note must have a measured box once it is placed');
        const above = box.y + box.height <= passage.top + 1;
        const below = box.y >= passage.bottom - 1;
        assert.ok(
          above || below,
          `the note must sit clear of the words, above or below them (card ${Math.round(
            box.y
          )}..${Math.round(box.y + box.height)}, words ${Math.round(passage.top)}..${Math.round(
            passage.bottom
          )})`
        );
        assert.equal(
          side,
          above ? 'above' : 'below',
          'the side the note reports must be the side it was actually placed on'
        );
        assert.ok(
          box.x < passage.right && box.x + box.width > passage.left,
          'the note must hang over the words it is about, not off in a corner'
        );
        assert.ok(
          box.width <= 417,
          `the note is a popover, so it must not stretch past its own width (it is ${Math.round(
            box.width
          )}px)`
        );
        return { above, below };
      };

      // At the top of the pane there is room underneath: the card goes below the words.
      const atTop = await openOn('top');
      const topClear = clearance(atTop);
      assert.equal(
        atTop.side,
        'below',
        'a passage with room underneath must open its note below the words'
      );
      // A window would dim or cover the page behind it; a popover must not.
      const covered = await page.evaluate(() =>
        [...document.querySelectorAll('body *')].some((element) => {
          const style = getComputedStyle(element);
          if (style.position !== 'fixed' || style.visibility === 'hidden' || style.opacity === '0') {
            return false;
          }
          const box = element.getBoundingClientRect();
          return box.width >= window.innerWidth * 0.9 && box.height >= window.innerHeight * 0.9;
        })
      );
      assert.equal(covered, false, 'an open note must not put a full-window overlay over the lesson');
      // A press anywhere else closes it, because it is not modal and owns no backdrop.
      await page.getByTestId('lesson-reader').getByText('Lesson text', { exact: true }).click();
      assert.equal(
        await page.getByTestId('sticky-note-popup').count(),
        0,
        'a press outside the card must close it, the way a popover does'
      );
      console.log(
        `  ok a passage with room opens its note below the words (${Math.round(
          atTop.box.y
        )}px against words ending ${Math.round(atTop.passage.bottom)}px), with no overlay`
      );

      // At the pane's bottom edge there is no room underneath: the card goes above the words instead.
      const atEdge = await openOn('bottom');
      const edgeClear = clearance(atEdge);
      assert.equal(
        atEdge.side,
        'above',
        `a passage at the bottom edge must open its note above the words, not over them (words at ${Math.round(
          atEdge.passage.bottom
        )}px of a ${original.height}px window)`
      );
      await page.getByTestId('btn-sticky-cancel').click();
      await page.setViewportSize(original);
      assert.ok(topClear.below && edgeClear.above, 'both placements must have cleared the words');
      console.log(
        `  ok a passage at the bottom edge opens its note above the words (card ends ${Math.round(
          atEdge.box.y + atEdge.box.height
        )}px, words start ${Math.round(atEdge.passage.top)}px)`
      );
    }

    // ---- 7f. A hint stays closed, and code can carry a highlight ----
    {
      // P.1 is the page the checklist bug was reported on, and it has both a hint ladder and the
      // full solution written as `<details>` in its own Markdown.
      await page.goto(`${baseUrl}?lesson=P.1`, { waitUntil: 'domcontentloaded' });
      await waitForEditor(page, undefined, 30000);
      await page.getByTestId('reader-scroll').waitFor({ timeout: 30000 });
      await page.waitForTimeout(600);

      // Every checkbox id is the id the store keeps: a trailing space would come back trimmed and
      // the box could never tick (`lessonChecks.ts`).
      const keys = await page
        .locator('[data-testid^="reader-check-"]')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-check-key') ?? ''));
      assert.ok(keys.length > 0, 'P.1 must still draw its bullets as checkboxes');
      assert.equal(
        keys.filter((key) => key !== key.trimEnd()).length,
        0,
        'a checkbox identity must be clean, or the tick it stores cannot be read back'
      );

      const reveals = page.getByTestId('reader-reveal');
      const revealCount = await reveals.count();
      assert.ok(revealCount >= 3, 'the hint ladder, the solution and the answers are all reveals');
      const solution = reveals.filter({ hasText: 'Full Solution' }).first();
      assert.equal(
        await solution.evaluate((node) => node.open),
        false,
        'the full solution must start closed rather than print itself in the prose'
      );
      const code = solution.locator('code');
      assert.equal(await code.isVisible().catch(() => false), false, 'a closed solution shows no code');
      await solution.locator('summary').click();
      assert.equal(
        await code.isVisible().catch(() => false),
        true,
        'a press on the label must open the solution it names'
      );
      await solution.locator('summary').click();
      console.log(`  ok ${revealCount} hints and answers arrive closed; the solution opens on a press`);

      // A highlight inside a code block is drawn on the code, not only listed in Notes.
      const pre = page.getByTestId('reader-prose').locator('pre').first();
      const picked = await pre.evaluate((element) => {
        const node = element.querySelector('code')?.firstChild;
        if (!node) return '';
        const text = node.textContent ?? '';
        const start = text.search(/\S/);
        if (start < 0) return '';
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, Math.min(text.length, start + 24));
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        document.dispatchEvent(new Event('selectionchange'));
        return selection?.toString() ?? '';
      });
      assert.ok(picked.trim().length > 3, 'the page must have a line of code to select');
      await page.getByTestId('btn-highlight').click();
      await page.waitForTimeout(250);
      const inCode = pre.locator('[data-testid="sticky-mark"]');
      assert.ok(
        (await inCode.count()) >= 1,
        'a highlight taken inside a code block must be drawn there, not only stored in Notes'
      );
      await inCode.first().click();
      await page.getByTestId('sticky-note-popup').waitFor({ timeout: 10000 });
      await page.getByTestId('btn-sticky-cancel').click();
      console.log('  ok a highlight inside a code block is drawn there and reopens its note');

      // The split-view tip, and the way to the editor when the layout has no room for two columns.
      await page.getByTestId('btn-split-tip').click();
      const tip = page.getByTestId('reader-split-tip');
      await tip.waitFor({ timeout: 10000 });
      assert.ok(/Study tip/.test((await tip.textContent()) ?? ''), 'the tip must say what it is for');
      assert.equal(
        await page.getByTestId('btn-do-it-yourself').count(),
        1,
        'the Do it yourself heading must offer the jump to the editor'
      );
      console.log('  ok the header offers the split-view tip, and Do it yourself jumps to the editor');

      // A split-view resize holds the block the reader is on at the top of the pane.
      const held = await page.getByTestId('reader-scroll').evaluate((element) => {
        element.scrollTop = 1200;
        const nodes = [...element.querySelectorAll('[data-reader-block]')].filter(
          (node) => node.getClientRects().length > 0
        );
        const hit = nodes.filter((node) => node.offsetTop <= element.scrollTop + 8).pop();
        return { key: hit?.dataset.readerBlock ?? '', into: element.scrollTop + 8 - (hit?.offsetTop ?? 0) };
      });
      assert.ok(held.key, 'the pane must have a block at the top of a scrolled page');
      const original = page.viewportSize() ?? { width: 1440, height: 900 };
      await page.setViewportSize({ width: 1024, height: original.height });
      await page.waitForTimeout(700);
      const kept = await page.getByTestId('reader-scroll').evaluate((element, key) => {
        const node = element.querySelector(`[data-reader-block="${key}"]`);
        return { key, into: element.scrollTop + 8 - (node?.offsetTop ?? 0), exists: Boolean(node) };
      }, held.key);
      await page.setViewportSize(original);
      assert.equal(kept.exists, true, 'the block must still be on the page after the resize');
      assert.ok(
        Math.abs(kept.into - held.into) <= 48,
        `the block must stay at the top of the pane across a resize (${Math.round(
          held.into
        )} px in, ${Math.round(kept.into)} px after)`
      );
      console.log(
        `  ok a split-view resize holds block ${held.key} at the top of the pane (${Math.round(
          held.into
        )} px in, ${Math.round(kept.into)} px after)`
      );
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
