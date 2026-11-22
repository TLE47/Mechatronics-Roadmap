#!/usr/bin/env node
/**
 * The phone gate (`scripts/e2e_mobile.mjs`, `npm run test:e2e:mobile`).
 *
 * Every mobile rule the app claims has to be measured on a real 390 px viewport with a coarse
 * pointer, because the failures are the quiet kind: a row that pushes the page 12 px sideways, a
 * control under 28 px, a fixed bar under the keyboard, a ring that is a tab stop nobody can see.
 * The suite drives the actual app in Chromium at 390x844 with touch (and a 3x pixel ratio, so a
 * 1 px hairline is not mistaken for a 3 px one), then at 768 and 1024 for the breakpoint handover.
 *
 * What it proves, in the order a learner meets it:
 *
 *   1. The shell fits. The tab picker is the only navigation row, the rail is gone, the header
 *      publishes its measured height, and the page does not scroll sideways.
 *   2. The picker reaches every tab. All twelve are in the sheet, each row is a 56 px target, the
 *      sheet closes on Escape and on a choice, and focus returns to the control that opened it.
 *   3. A lab's plot opens at its own resolution in a sheet that scrolls both ways — the reason the
 *      expander exists — and the page behind it neither moves nor scrolls sideways.
 *   4. Study is one surface at a time. Lesson opens on the text, Code mounts the editor and the
 *      shared coding keyboard — a symbol key inserts at the caret, Fn makes digits, 123 opens the
 *      number page, undo/redo walk the history, native switching removes `inputmode` and the mode
 *      bar's key button brings the Python keys back, and Done folds them. Every key is at least
 *      40 px tall, the keyboard itself ends on the bottom edge while the fixed Study bar rides on
 *      top of it (and returns to the edge with Done), that bar carries a 44 px Run, and a sheet
 *      hides it instead of covering its last row.
 *   5. A reload inside Code comes back to Code; switching to Lesson hides the editor without
 *      losing it.
 *   6. The lesson sheet is the chooser: another entry opens, the sheet closes, the title follows.
 *   7. The install row appears only when it can act (a browser prompt event, or iOS's Share sheet),
 *      calls the browser's prompt once, and leaves after the learner accepts.
 *   8. At 768 and 1024 the rail returns, the picker goes, and Predict still shares Run's row.
 *   9. The keyboard answers a real finger, not a mouse: Chromium's touch events tap the editor's keys
 *      and a page field's keys, hold one to raise its preview, type at an uninterrupted finger's
 *      pace, read the haptics, lock capitals on a double Shift, repeat Backspace while it is held,
 *      keep the caret through the gap between two caps and through 123/ABC, return after a native
 *      handoff, retarget between two fields without folding, and measure the slide up and the slide
 *      down at 390 and 360 px. A key that cancels `pointerdown` is exactly where a mouse-only gate lies.
 *
 * It is deliberately not a Pyodide suite: `npm run test:e2e` and `npm run test:predict` already own
 * running code, and a 10 MB interpreter on a throttled phone link would make this gate too slow to
 * run on every pull request. What a phone needs proved is layout and reach, which is all this does.
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { resolveChromiumExecutable, startDevServer } from './e2e_browser_workbench.mjs';
import { getEditorCode } from './editor-code.mjs';
import { seedTourSeen } from './tour_seed.mjs';
import { PYTHON_LESSONS } from '../app/src/data/pythonLessonsData.ts';

const PHONE = { width: 390, height: 844 };
const TERMINAL = { width: 768, height: 1024 };
const WIDE = { width: 1024, height: 900 };
const IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

const TAB_IDS = Object.keys(
  JSON.parse(fs.readFileSync(path.join('app', 'src', 'data', 'workbenchTabs.json'), 'utf8')).tabs
);

/** The second lesson in the reader's own order, so the chooser test names nothing by hand. */
const OTHER_LESSON = PYTHON_LESSONS[1];

function ok(message) {
  console.log(`  ok   ${message}`);
}

function fail(message) {
  console.log(`  FAIL ${message}`);
  throw new Error(message);
}

function check(condition, message) {
  if (!condition) fail(message);
}

/** The page must not scroll sideways: a 390 px screen has no gutter to scroll into. */
async function assertNoSidewaysScroll(page, label) {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  check(
    metrics.scrollWidth <= metrics.innerWidth + 1 && metrics.bodyWidth <= metrics.innerWidth + 1,
    `${label}: the page scrolls sideways (document ${metrics.scrollWidth}px, body ${metrics.bodyWidth}px, viewport ${metrics.innerWidth}px)`
  );
}

/** The right edge of an element's box, relative to the viewport. */
async function rightEdge(page, testId) {
  const box = await page.getByTestId(testId).first().boundingBox();
  check(Boolean(box), `${testId} has no box to measure`);
  return box.x + box.width;
}

async function box(page, testId) {
  const found = await page.getByTestId(testId).first().boundingBox();
  check(Boolean(found), `${testId} has no box to measure`);
  return found;
}

/**
 * Wait, bounded, for two toolbar buttons to share a row, and answer the offset it settled at.
 *
 * A wrap is a layout, not a timing: it never resolves, so a row that is really two rows still
 * fails. What this stops is reading the toolbar mid-swap — `main` failed this check at 1024 px with
 * Predict 58 px above Run on the same tree that had passed on the pull request twice, then passed
 * on a re-run (2026-10-29).
 */
async function rowOffset(page, firstId, secondId, timeout = 8000) {
  const measure = () =>
    page.evaluate(
      ([a, b]) => {
        const one = document.querySelector(`[data-testid="${a}"]`)?.getBoundingClientRect();
        const two = document.querySelector(`[data-testid="${b}"]`)?.getBoundingClientRect();
        return one && two ? Math.round(two.y - one.y) : null;
      },
      [firstId, secondId]
    );
  try {
    await page.waitForFunction(
      ([a, b]) => {
        const one = document.querySelector(`[data-testid="${a}"]`)?.getBoundingClientRect();
        const two = document.querySelector(`[data-testid="${b}"]`)?.getBoundingClientRect();
        return Boolean(one && two) && Math.abs(one.y - two.y) <= 2;
      },
      [firstId, secondId],
      { timeout, polling: 100 }
    );
    return 0;
  } catch {
    return measure();
  }
}

async function waitForEditor(page) {
  await page.waitForFunction(
    () => Boolean(window.__mechalabEditors && window.__mechalabEditors['editor-main']),
    undefined,
    { timeout: 30000 }
  );
}

/**
 * A finger on the glass (`scripts/e2e_mobile.mjs`).
 *
 * Playwright's `click()` sends a mouse press even inside a `hasTouch` context, and every key on this
 * keyboard cancels `pointerdown`. Whether a real touch still reaches the key's `click` is therefore
 * the one thing a mouse-driven gate cannot prove. These helpers send Chromium's own touch events
 * through CDP: a finger down, held for a moment, then lifted. `fingerDown`/`touchUp` are split so a
 * test can look at the press — the character preview — before the finger leaves.
 */
async function fingerPoint(page, locator, { scroll = false, label = 'the touch target' } = {}) {
  const target = locator.first();
  // Scroll, then wait until the element has actually stopped. A finger put down while the page is
  // still coasting is a drag, and Chromium will never synthesise the click.
  const scrollToCentre = () =>
    target.evaluate(
      (element) =>
        new Promise((resolve) => {
          element.scrollIntoView({ block: 'center', inline: 'nearest' });
          let last = element.getBoundingClientRect().top;
          let stable = 0;
          const started = performance.now();
          const tick = () => {
            const top = element.getBoundingClientRect().top;
            if (Math.abs(top - last) <= 0.5) stable += 1;
            else {
              stable = 0;
              last = top;
            }
            if (stable >= 4 || performance.now() - started > 1500) resolve();
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        })
    );
  if (scroll) await scrollToCentre();
  let found = await target.boundingBox();
  check(Boolean(found), `${label} has no box for a finger`);
  const viewport = page.viewportSize();
  const offScreen =
    found.x + found.width < 0 ||
    found.x > viewport.width ||
    found.y + found.height < 0 ||
    found.y > viewport.height;
  if (offScreen) {
    await scrollToCentre();
    found = await target.boundingBox();
    check(Boolean(found), `${label} has no box after scrolling to it`);
  }
  const x = found.x + found.width / 2;
  const y = found.y + found.height / 2;
  check(
    x >= 0 && x <= viewport.width && y >= 0 && y <= viewport.height,
    `${label} is off screen at ${Math.round(x)},${Math.round(y)}`
  );
  return { x, y };
}

async function fingerDown(page, cdp, locator, options = {}) {
  const point = await fingerPoint(page, locator, options);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: point.x, y: point.y, id: 1, radiusX: 5, radiusY: 5, force: 1 }],
  });
  return point;
}

async function touchUp(page, cdp) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function touchTap(page, cdp, locator, options = {}) {
  const hold = options.hold ?? 40;
  await fingerDown(page, cdp, locator, options);
  await page.waitForTimeout(hold);
  await touchUp(page, cdp);
  await page.waitForTimeout(45);
}

/**
 * Record the shell's own rect every frame while `action` opens or folds it. The promise is created
 * before the touch, so the first frame is the position the finger found, not the one it left.
 */
function recordKeyboardFrames(page, testId, duration) {
  return page.evaluate(
    ({ testId, duration }) =>
      new Promise((resolve) => {
        const shell = document.querySelector(`[data-testid="${testId}"]`);
        const frames = [];
        const started = performance.now();
        const tick = () => {
          const now = performance.now();
          const rect = shell.getBoundingClientRect();
          frames.push({
            t: now - started,
            y: rect.y,
            height: rect.height,
            state: shell.getAttribute('data-state'),
            visibility: getComputedStyle(shell).visibility,
          });
          if (now - started < duration) requestAnimationFrame(tick);
          else resolve(frames);
        };
        requestAnimationFrame(tick);
      }),
    { testId, duration }
  );
}

async function sampleKeyboardSlide(page, testId, action, duration = 520) {
  const recording = recordKeyboardFrames(page, testId, duration);
  await action();
  return recording;
}

/**
 * A tap whose frames are recorded from *before* the finger lands. The element is scrolled and still
 * first, so the recording covers the slide rather than a page that is still coasting.
 */
async function slideTap(page, cdp, testId, locator, options = {}, duration = 900) {
  const point = await fingerPoint(page, locator, options);
  const recording = recordKeyboardFrames(page, testId, duration);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: point.x, y: point.y, id: 1, radiusX: 5, radiusY: 5, force: 1 }],
  });
  await page.waitForTimeout(options.hold ?? 40);
  await touchUp(page, cdp);
  return recording;
}

/** A slide is a journey: the shell has to be caught between the two edges on the way. */
function assertKeyboardSlide(frames, label, direction, viewportHeight) {
  check(frames.length >= 4, `${label}: no animation frames were captured`);
  const height = frames[frames.length - 1].height;
  check(height > 100, `${label}: the shell measured ${Math.round(height)}px tall`);
  const atRest = viewportHeight - height;
  const offEdge = viewportHeight + height * 0.02;
  const targetY = direction === 'open' ? atRest : offEdge;
  const staged = frames.filter(
    (frame) =>
      frame.state === (direction === 'open' ? 'open' : 'closed') &&
      Math.abs(frame.height - height) <= 2
  );
  check(staged.length >= 3, `${label}: the shell was already at its destination in every frame`);
  const first = staged[0];
  const last = staged[staged.length - 1];
  check(
    Math.abs(last.y - targetY) <= 3,
    `${label}: settled at ${last.y.toFixed(1)}px, not ${targetY.toFixed(1)}px`
  );
  check(
    Math.abs(first.y - targetY) > 6,
    `${label}: the first frame was already at the destination (${first.y.toFixed(1)}px)`
  );
  check(
    staged.some(
      (frame) =>
        frame.y > Math.min(first.y, targetY) + 6 && frame.y < Math.max(first.y, targetY) - 6
    ),
    `${label}: the shell jumped between the edges instead of sliding`
  );
  check(
    direction === 'open' ? last.visibility === 'visible' : last.visibility === 'hidden',
    `${label}: it finished ${last.visibility}`
  );
}

/** Every key's centre must hit that key, not the bar above it or a preview underneath. */
async function assertKeyCentresHit(page, shellTestId, label) {
  const misses = await page.evaluate((testId) => {
    const shell = document.querySelector(`[data-testid="${testId}"]`);
    return [...shell.querySelectorAll('[data-testid^="python-key-"]')].flatMap((key) => {
      const rect = key.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return [];
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      if (hit === key || key.contains(hit)) return [];
      return [
        `${key.getAttribute('data-testid')} is covered by ${
          hit?.getAttribute('data-testid') ?? hit?.tagName ?? 'nothing'
        }`,
      ];
    });
  }, shellTestId);
  check(misses.length === 0, `${label}: ${misses.slice(0, 4).join('; ')}`);
}

async function openTabPicker(page) {
  await page.getByTestId('btn-tab-picker').click();
  await page.getByTestId('tab-picker-sheet').waitFor({ state: 'visible', timeout: 10000 });
}

async function closeSheet(page, testId) {
  await page.getByTestId(`${testId}-close`).click();
  await page.getByTestId(testId).waitFor({ state: 'hidden', timeout: 10000 });
}

async function goToTab(page, id) {
  await openTabPicker(page);
  await page.getByTestId(`tab-picker-item-${id}`).click();
  await page.getByTestId('tab-picker-sheet').waitFor({ state: 'hidden', timeout: 10000 });
}

/**
 * An installed app is only installable if the manifest's icons are actually served. Chrome requires
 * at least a 192 and a 512, iOS reads a different file, and a renamed PNG fails silently: the
 * browser just stops offering the install. So the manifest is read here and every entry is checked
 * against the file and the PNG's own IHDR, not the `sizes` string's promise.
 */
function checkManifestIcons() {
  const manifest = JSON.parse(
    fs.readFileSync(path.join('app', 'public', 'manifest.webmanifest'), 'utf8')
  );
  const seen = new Set();
  for (const icon of manifest.icons ?? []) {
    const file = path.join('app', 'public', icon.src);
    check(fs.existsSync(file), `the manifest names ${icon.src}, which is not in app/public`);
    seen.add(icon.src);
    if (!/^\d+x\d+$/.test(icon.sizes)) continue;
    const [width, height] = icon.sizes.split('x').map(Number);
    const png = fs.readFileSync(file);
    check(
      png.readUInt32BE(16) === width && png.readUInt32BE(20) === height,
      `${icon.src} is ${png.readUInt32BE(16)}x${png.readUInt32BE(20)}, the manifest says ${icon.sizes}`
    );
  }
  for (const required of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png']) {
    check(seen.has(required), `the manifest is missing ${required}`);
  }
  check(
    (manifest.icons ?? []).some((icon) => icon.purpose === 'maskable'),
    'no maskable icon: Android would draw the launcher icon inside a white shape'
  );
  check(manifest.display === 'standalone', 'the installed app must own the display');
  check(
    fs.existsSync(path.join('app', 'public', 'apple-touch-icon.png')),
    'iOS needs apple-touch-icon.png beside the manifest'
  );
}

async function main() {
  checkManifestIcons();
  ok('the manifest icons exist at the sizes it claims');
  const ownServer = process.env.E2E_BASE_URL ? null : await startDevServer(process.cwd());
  const baseUrl = process.env.E2E_BASE_URL ?? ownServer.baseUrl;
  const executablePath = resolveChromiumExecutable();
  const browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    headless: true,
  });

  try {
    // ---- 1-6. One phone, in the order a learner meets it ----
    {
      const context = await browser.newContext({
        viewport: PHONE,
        screen: PHONE,
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
      });
      await seedTourSeen(context);
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.getByTestId('phone-tab-nav').waitFor({ state: 'visible', timeout: 30000 });
      // The app scrolls smoothly; a finger put down mid-scroll is a drag, not a tap, and Chromium
      // never synthesises its click. This gate is about the keyboard, so it scrolls instantly.
      await page.addStyleTag({ content: '*, html { scroll-behavior: auto !important; }' });

      console.log('\nthe phone shell');
      check(
        await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches),
        'the emulated phone must report a coarse pointer, or the touch floors never apply'
      );
      check(
        !(await page.getByTestId('tab-rail').isVisible()),
        'the twelve-tab rail must be gone below 768, replaced by the picker'
      );
      check(
        (await rightEdge(page, 'phone-tab-nav')) <= PHONE.width + 1,
        'the tab picker runs past the right edge'
      );

      // Two rows by design — the brand above the swipeable action strip — and no more. A third row
      // (a wrapped tray, or the course-level links coming back) is what this ceiling catches.
      const header = await page.locator('[data-chrome="header"]').boundingBox();
      check(
        Boolean(header) && header.height <= 112,
        `the header is ${header?.height}px tall on a phone; 112 px is the two-row budget`
      );
      const published = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--header-h').trim()
      );
      check(
        published === `${Math.round(header.height)}px`,
        `--header-h is ${published || 'unset'}, but the header is ${Math.round(header.height)}px tall`
      );
      // The account chip is the one header control that grows with the learner's identity: an email
      // is longer than the tray it sits beside. Below md it is the avatar alone — a 32 px disc, not a
      // 90 px pill — and the words stay in the accessible name for a screen reader.
      const account = await box(page, 'btn-account');
      check(
        account.width <= 40 && Math.abs(account.width - account.height) <= 2,
        `the account chip is ${Math.round(account.width)}x${Math.round(account.height)} at 390 px; the avatar must stand alone`
      );
      check(
        (await page.getByRole('button', { name: 'Sign in', exact: true }).count()) >= 1,
        'the avatar-only account chip lost its accessible name'
      );
      await assertNoSidewaysScroll(page, 'workbench at 390');
      ok('one navigation row, a measured header and no sideways scroll');

      console.log('\nthe tab picker');
      await openTabPicker(page);
      const rows = page.locator('[data-testid^="tab-picker-item-"]');
      check(
        (await rows.count()) === TAB_IDS.length,
        `the picker lists ${await rows.count()} of ${TAB_IDS.length} tabs; every lab must be reachable`
      );
      for (const id of TAB_IDS) {
        const row = await page.getByTestId(`tab-picker-item-${id}`).boundingBox();
        check(Boolean(row) && row.height >= 44, `${id} is only ${row?.height}px tall in the picker`);
      }
      check(
        (await page.evaluate(() => document.body.dataset.sheetOpen)) === '1',
        'an open sheet must lock the page behind it'
      );
      await page.keyboard.press('Escape');
      await page.getByTestId('tab-picker-sheet').waitFor({ state: 'hidden', timeout: 10000 });
      const restored = await page.evaluate(
        () => document.activeElement?.getAttribute('data-testid') ?? ''
      );
      check(
        restored === 'btn-tab-picker',
        `closing the picker left focus on ${restored || 'nothing'}; it must return to the control that opened it`
      );
      await assertNoSidewaysScroll(page, 'after the picker closed');
      ok(`all ${TAB_IDS.length} tabs, 44 px rows, Escape and focus restore`);

      console.log('\na lab at 390');
      await goToTab(page, 'tab-bode');
      await page.getByTestId('btn-plot-expand-bode').waitFor({ state: 'visible', timeout: 15000 });
      await assertNoSidewaysScroll(page, 'the Bode lab at 390');
      await page.getByTestId('btn-plot-expand-bode').click();
      await page.getByTestId('plot-sheet-bode').waitFor({ state: 'visible', timeout: 10000 });
      const image = await page.getByTestId('plot-sheet-bode-image').boundingBox();
      check(Boolean(image) && image.width > 0, 'the expanded plot drew no image');
      const scroller = await page.getByTestId('plot-sheet-bode-scroller').evaluate((node) => ({
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth,
      }));
      check(
        scroller.scrollWidth > scroller.clientWidth,
        'the full-size plot must scroll inside its own frame, not be shrunk to the sheet'
      );
      await closeSheet(page, 'plot-sheet-bode');
      ok('the plot opens at its own resolution and the lab stays 390 px wide');

      console.log('\nthe Study loop');
      await goToTab(page, 'tab-pyodide');
      await page.getByTestId('phone-lesson-strip').waitFor({ state: 'visible', timeout: 20000 });
      check(
        await page.getByTestId('lesson-reader').isVisible(),
        'a phone must open Study on the lesson text'
      );
      check(
        !(await page.getByTestId('editor-panel').isVisible()),
        'the editor must not be mounted on the Lesson surface before the learner asks for it'
      );
      const bar = await box(page, 'phone-bar');
      check(
        Math.abs(bar.y + bar.height - PHONE.height) <= 1,
        `the Study bar ends at ${Math.round(bar.y + bar.height)}px, not the bottom edge (${PHONE.height}px)`
      );
      const run = await box(page, 'btn-phone-run');
      check(run.height >= 44, `the phone Run button is only ${run.height}px tall`);
      await assertNoSidewaysScroll(page, 'the Lesson surface');

      // A sheet owns the screen: the fixed bar steps aside rather than sitting under its last row.
      await openTabPicker(page);
      check(
        !(await page.getByTestId('phone-bar').isVisible()),
        'the Study bar must be hidden while a sheet is open'
      );
      await closeSheet(page, 'tab-picker-sheet');

      await page.getByTestId('phone-surface-code').click();
      await page.getByTestId('phone-code-strip').waitFor({ state: 'visible', timeout: 10000 });
      await page.locator('[data-testid="editor-panel"][data-phone-code="1"]').waitFor({
        state: 'visible',
        timeout: 20000,
      });
      await waitForEditor(page);
      // Every editor view has to be on screen at 390 px: the strip wraps rather than hiding its
      // last tab, and Workflow is the view a phone could not reach while the strip was nowrap.
      const editorTabs = await page.evaluate(() => {
        const list = document.querySelector('[data-testid="editor-viewbar"]');
        const box = list.getBoundingClientRect();
        const tabs = [...list.querySelectorAll('[role="tab"]')].filter(
          (tab) => tab.getBoundingClientRect().width > 0
        );
        return {
          scroll: list.scrollWidth - list.clientWidth,
          wrap: getComputedStyle(list).flexWrap,
          ids: tabs.map((tab) => tab.getAttribute('data-testid')),
          inside: tabs.every((tab) => {
            const rect = tab.getBoundingClientRect();
            return (
              rect.left >= box.left - 1 &&
              rect.right <= box.right + 1 &&
              rect.top >= box.top - 1 &&
              rect.bottom <= box.bottom + 1
            );
          }),
        };
      });
      check(editorTabs.wrap === 'wrap', `the editor tab strip must wrap at 390 px, not ${editorTabs.wrap}`);
      check(
        editorTabs.scroll === 0,
        `the editor tab strip still scrolls ${editorTabs.scroll}px sideways at 390 px`
      );
      check(editorTabs.inside, 'every editor view tab must be inside the strip at 390 px');
      check(
        editorTabs.ids.includes('editor-tab-workflow'),
        `the Workflow view is missing from the phone's editor tabs: ${editorTabs.ids.join(', ')}`
      );
      await page.getByTestId('editor-tab-workflow').click();
      await page.getByTestId('panel-workflow').waitFor({ state: 'visible', timeout: 10000 });
      ok('every editor view is on screen at 390 px, Workflow included');
      // The checklist is advice, not the canvas: on a phone it is a count with the full list one
      // press away, so a warning cannot push the dotted paper a thousand pixels down the page.
      await page.getByTestId('workflow-start-blank').click();
      await page.getByTestId('workflow-checks-toggle').waitFor({ state: 'visible', timeout: 5000 });
      const folded = await page.evaluate(() => {
        const toggle = document.querySelector('[data-testid="workflow-checks-toggle"]');
        const summary = document.querySelector('[data-testid="workflow-checks"]');
        return {
          open: toggle?.getAttribute('aria-expanded'),
          label: toggle?.textContent?.replace(/\s+/g, ' ').trim(),
          summary: summary?.textContent?.replace(/\s+/g, ' ').trim(),
          list: Boolean(document.querySelector('[data-testid="workflow-issues"]')),
        };
      });
      check(folded.open === 'false', `the phone checklist starts open (aria-expanded=${folded.open})`);
      check(!folded.list, 'the full checklist is rendered on a phone before the learner asks for it');
      await assertNoSidewaysScroll(page, 'the phone workflow checklist');
      check(/\d+ open/.test(folded.summary ?? ''), `the compact summary lost its count: ${folded.summary}`);
      const promised = Number((folded.label ?? '').match(/Show (\d+) check/)?.[1]);
      check(promised > 0, `the press does not name what it opens: ${folded.label}`);
      await page.getByTestId('workflow-checks-toggle').click();
      await page.getByTestId('workflow-issues').waitFor({ state: 'visible', timeout: 5000 });
      const listed = await page.locator('[data-testid^="workflow-issue-"]').count();
      check(listed === promised, `the folded count promised ${promised} checks but the list showed ${listed}`);
      check(
        /Step 1 needs a title/.test(await page.getByTestId('workflow-issues').innerText()),
        'the opened list must carry the blank card’s sentence'
      );
      // Fit has to work where the canvas is narrow: six cards are taller than the phone pane, and
      // one press must frame all of them without a sideways scroll.
      for (let index = 0; index < 5; index += 1) await page.getByTestId('workflow-add-given').click();
      await page.waitForTimeout(300);
      const fitButton = page.getByTestId('workflow-fit');
      await fitButton.scrollIntoViewIfNeeded();
      const fitBox = await fitButton.boundingBox();
      check(Boolean(fitBox) && fitBox.height >= 36, `the phone Fit control is only ${fitBox?.height}px tall`);
      await fitButton.click();
      await page.waitForTimeout(350);
      const fitted = await page.evaluate(() => {
        const canvas = document.querySelector('[data-testid="workflow-canvas"]');
        const grid = document.querySelector('[data-testid="workflow-canvas-grid"]');
        const box = canvas.getBoundingClientRect();
        const cards = [...document.querySelectorAll('[data-node-id]')];
        return {
          scale: Number(grid.style.transform.match(/scale\(([\d.]+)\)/)?.[1]),
          button: document.querySelector('[data-testid="workflow-fit"]').textContent.trim(),
          inside: cards.every((card) => {
            const rect = card.getBoundingClientRect();
            return (
              rect.left >= box.left - 1 &&
              rect.right <= box.right + 1 &&
              rect.top >= box.top - 1 &&
              rect.bottom <= box.bottom + 1
            );
          }),
        };
      });
      check(fitted.scale < 0.95, `Fit did not shrink the six-card flow: ${fitted.scale}`);
      check(fitted.inside, 'Fit left a card outside the phone canvas');
      check(fitted.button === '100%', `a fitted phone canvas still says ${fitted.button}`);
      await assertNoSidewaysScroll(page, 'the fitted phone workflow canvas');
      await fitButton.click();
      await page.waitForTimeout(300);
      check(
        (await page.getByTestId('workflow-canvas-grid').evaluate((grid) => grid.style.transform)) === 'scale(1)',
        'the phone 100% press must restore life size'
      );
      await page.getByTestId('workflow-clear').click();
      await page.getByTestId('workflow-clear-yes').click();
      ok('the phone checklist is a count, the full list is one press away, and Fit frames the flow');
      await page.getByTestId('editor-tab-main').click();
      check(
        !(await page.getByTestId('lesson-reader').isVisible()),
        'the Code surface must not keep the lesson text below the editor'
      );
      const keyboard = page.getByTestId('python-keyboard');
      check(await keyboard.isVisible(), 'the Code surface must draw the Python keyboard');
      const keyboardShell = await page.getByTestId('mobile-keyboard-shell').boundingBox();
      check(
        Boolean(keyboardShell) &&
          Math.abs(keyboardShell.y + keyboardShell.height - PHONE.height) <= 1,
        `the Python keyboard must end on the bottom edge, not ${Math.round(
          (keyboardShell?.y ?? 0) + (keyboardShell?.height ?? 0)
        )}px of ${PHONE.height}`
      );
      const barOnKeys = await box(page, 'phone-bar');
      check(
        Math.abs(barOnKeys.y + barOnKeys.height - keyboardShell.y) <= 1,
        `the Study bar must sit on top of the keys, not ${Math.round(
          barOnKeys.y + barOnKeys.height
        )}px vs ${Math.round(keyboardShell.y)}px`
      );
      const keys = page.locator('[data-testid^="python-key-"]');
      const keyCount = await keys.count();
      check(keyCount >= 60, `the Python keyboard has only ${keyCount} keys`);
      for (let index = 0; index < keyCount; index += 1) {
        const key = await keys.nth(index).boundingBox();
        check(
          Boolean(key) && key.height >= 40,
          `keyboard key ${index} is ${key?.width}x${key?.height}, below the 40 px floor`
        );
        check(Boolean(key) && key.width >= 20, `keyboard key ${index} is only ${key?.width}px wide`);
      }
      await assertNoSidewaysScroll(page, 'the Code surface');

      const before = await getEditorCode(page);
      const caret = await page.evaluate(() =>
        window.__mechalabEditors['editor-main'].getCursor()
      );
      await page.getByTestId('python-key-colon').click();
      let after = await getEditorCode(page);
      check(after.length === before.length + 1, 'a punctuation key must insert one character');
      check(after.slice(caret, caret + 1) === ':', 'the colon key did not insert at the caret');
      await page.getByTestId('python-key-backspace').click();
      after = await getEditorCode(page);
      check(after === before, 'Backspace did not remove the character the keyboard inserted');

      await page.getByTestId('python-key-fn').click();
      check(
        (await keyboard.getAttribute('data-fn')) === '1',
        'Fn must change the legends on the action and number rows'
      );
      await page.getByTestId('python-key-q').click();
      after = await getEditorCode(page);
      check(after.slice(caret, caret + 1) === '1', 'Fn must turn the QWERTY row into digits');
      await page.getByTestId('python-key-fn').click();
      await page.getByTestId('python-key-backspace').click();

      await page.getByTestId('python-key-layout').click();
      check((await keyboard.getAttribute('data-page')) === '123', '123 must open the number page');
      await page.getByTestId('python-key-digit-7').click();
      after = await getEditorCode(page);
      check(after.slice(caret, caret + 1) === '7', 'the number page did not insert 7');
      await page.getByTestId('python-key-backspace').click();
      await page.getByTestId('python-key-layout').click();
      check((await keyboard.getAttribute('data-page')) === 'abc', 'ABC must restore the letters');

      const beforeNewline = await getEditorCode(page);
      await page.getByTestId('python-key-newline').click();
      check(
        (await getEditorCode(page)).length > beforeNewline.length,
        'New line must add a line at the caret'
      );
      await page.getByTestId('python-key-undo').click();
      check((await getEditorCode(page)) === beforeNewline, 'Undo must remove the new line');
      await page.getByTestId('python-key-redo').click();
      check(
        (await getEditorCode(page)).length > beforeNewline.length,
        'Redo must put the new line back'
      );
      await page.getByTestId('python-key-undo').click();

      await page.getByTestId('python-key-native').click();
      await keyboard.waitFor({ state: 'hidden', timeout: 5000 });
      check(
        (await page.getByTestId('keyboard-toggle').getAttribute('aria-label') ?? '').includes(
          'phone keyboard'
        ),
        'native mode must leave a way back to the Python keys'
      );
      await page.waitForFunction(
        () =>
          (document
            .querySelector('[data-editor="editor-main"] .cm-content')
            ?.getAttribute('inputmode') ?? null) === null,
        undefined,
        { timeout: 5000 }
      );
      await page.getByTestId('keyboard-toggle').click();
      await keyboard.waitFor({ state: 'visible', timeout: 5000 });
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-editor="editor-main"] .cm-content')
            ?.getAttribute('inputmode') === 'none',
        undefined,
        { timeout: 5000 }
      );

      await page.getByTestId('python-key-done').click();
      await keyboard.waitFor({ state: 'hidden', timeout: 5000 });
      check(
        (await page.getByTestId('keyboard-toggle').getAttribute('aria-label') ?? '').includes(
          'Show the Python keyboard'
        ),
        'Done must leave the way back to the keyboard'
      );
      const barAfterDone = await box(page, 'phone-bar');
      check(
        Math.abs(barAfterDone.y + barAfterDone.height - PHONE.height) <= 1,
        `Done must put the Study bar back on the bottom edge, not at ${Math.round(
          barAfterDone.y + barAfterDone.height
        )}px`
      );
      await page.getByTestId('keyboard-toggle').click();
      await keyboard.waitFor({ state: 'visible', timeout: 5000 });
      ok('lesson → code by choice, a full 60-key keyboard, Fn and 123, native switching, no sideways scroll');

      console.log('\nthe surface survives a reload');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('[data-testid="editor-panel"][data-phone-code="1"]').waitFor({
        state: 'visible',
        timeout: 30000,
      });
      check(
        await page.getByTestId('phone-surface-code').getAttribute('aria-pressed').then((v) => v === 'true'),
        'a reload inside Code must come back to Code'
      );
      await page.getByTestId('phone-surface-lesson').click();
      await page.getByTestId('lesson-reader').waitFor({ state: 'visible', timeout: 10000 });
      check(
        !(await page.getByTestId('editor-panel').isVisible()),
        'switching to Lesson must hide the editor, not leave it on screen'
      );
      ok('Code reopens after a reload, and Lesson hides it without a remount');

      console.log('\nthe lesson sheet');
      await page.getByTestId('btn-lessons').click();
      await page.getByTestId('lesson-sheet').waitFor({ state: 'visible', timeout: 10000 });
      // The chooser carries the corner close a pane has: the header's × belongs to the overlay, this
      // one to the list the learner opened, and it has to put the sheet away and hand focus back.
      const chooserClose = page.getByTestId('lesson-sheet').getByTestId('btn-lessons-close');
      check(await chooserClose.isVisible(), 'the phone lesson sheet has no close of its own');
      await chooserClose.click();
      await page.getByTestId('lesson-sheet').waitFor({ state: 'hidden', timeout: 10000 });
      check(
        (await page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? '')) ===
          'btn-lessons',
        'closing the list did not put focus back on the door that opened it'
      );
      await page.getByTestId('btn-lessons').click();
      await page.getByTestId('lesson-sheet').waitFor({ state: 'visible', timeout: 10000 });
      // The keyboard is the site's, not the editor's: the sheet's own search box gets the same keys,
      // after a tap that suppresses the OS keyboard before the field can focus.
      const fieldKeyboard = page.getByTestId('phone-field-keyboard');
      check(
        !(await fieldKeyboard.isVisible()),
        'a page field must not draw the site keyboard before it is focused'
      );
      // The desktop rail is still in the DOM behind the sheet and draws the same chooser search.
      const search = page.getByTestId('lesson-sheet').getByTestId('input-lesson-search');
      await search.click();
      await fieldKeyboard.waitFor({ state: 'visible', timeout: 5000 });
      check(
        (await search.evaluate((element) => element.getAttribute('inputmode'))) === 'none',
        'a focused page field must suppress the OS keyboard with inputmode=none'
      );
      const fieldKeys = fieldKeyboard.locator('[data-testid^="python-key-"]');
      check((await fieldKeys.count()) >= 60, 'the page keyboard must draw the full key layout');
      await fieldKeyboard.getByTestId('python-key-p').click();
      check(
        (await search.inputValue()) === 'p',
        `the site keyboard did not type into the sheet search (value "${await search.inputValue()}")`
      );
      await fieldKeyboard.getByTestId('python-key-backspace').click();
      check((await search.inputValue()) === '', 'Backspace did not clear the page field');
      const fieldShell = await fieldKeyboard.boundingBox();
      check(
        Boolean(fieldShell) && Math.abs(fieldShell.y + fieldShell.height - PHONE.height) <= 1,
        `the page keyboard must slide to the bottom edge, not ${Math.round(
          (fieldShell?.y ?? 0) + (fieldShell?.height ?? 0)
        )}px of ${PHONE.height}`
      );
      await fieldKeyboard.getByTestId('python-key-done').click();
      await fieldKeyboard.waitFor({ state: 'hidden', timeout: 5000 });
      check(
        (await search.evaluate((element) => element.getAttribute('inputmode'))) === null,
        'Done must hand the field its inputmode back'
      );
      ok('a sheet field gets the site keyboard, types, and folds from Done');
      // Scoped to the sheet: the desktop rail is still in the DOM behind it (hidden at 390), and a
      // second copy of the same row is a strict-mode tie, not a learner-visible duplicate.
      await page
        .getByTestId('lesson-sheet')
        .getByTestId(`lesson-item-${OTHER_LESSON.id}`)
        .click();
      await page.getByTestId('lesson-sheet').waitFor({ state: 'hidden', timeout: 10000 });
      const title = (await page.getByTestId('lesson-title').first().textContent())?.trim();
      check(
        title === OTHER_LESSON.title,
        `choosing ${OTHER_LESSON.id} left the strip on "${title}"`
      );
      check(
        (await page.evaluate(() => document.body.dataset.sheetOpen ?? '')) === '',
        'the page stayed locked after the lesson sheet closed'
      );
      await assertNoSidewaysScroll(page, 'after a lesson change');
      ok(`the chooser closes from its own ×, then opens ${OTHER_LESSON.id} and the strip follows`);

      console.log('\nthe install row');
      await openTabPicker(page);
      check(
        (await page.getByTestId('install-offer').count()) === 0,
        'without a browser prompt and on a non-iOS user agent there is nothing honest to offer'
      );
      await page.evaluate(() => {
        const event = new Event('beforeinstallprompt', { cancelable: true });
        event.prompt = async () => {
          window.__mechalabInstallPrompts = (window.__mechalabInstallPrompts ?? 0) + 1;
        };
        event.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });
        window.dispatchEvent(event);
      });
      await page.getByTestId('install-offer').waitFor({ state: 'visible', timeout: 10000 });
      await page.getByTestId('btn-install-app').click();
      await page.getByTestId('install-offer').waitFor({ state: 'hidden', timeout: 10000 });
      check(
        (await page.evaluate(() => window.__mechalabInstallPrompts)) === 1,
        "the row must call the browser's own prompt exactly once"
      );
      await closeSheet(page, 'tab-picker-sheet');
      ok('the prompt row appears only with an event, and leaves once accepted');

      check(pageErrors.length === 0, `the phone threw: ${pageErrors.join('; ')}`);
      await context.close();
    }

    // ---- 7. iOS has no prompt event: the row gives the Share-sheet words instead ----
    {
      const context = await browser.newContext({
        viewport: PHONE,
        screen: PHONE,
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
        userAgent: IOS_UA,
      });
      await seedTourSeen(context);
      const page = await context.newPage();
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.getByTestId('phone-tab-nav').waitFor({ state: 'visible', timeout: 30000 });
      await openTabPicker(page);
      await page.getByTestId('install-ios-hint').waitFor({ state: 'visible', timeout: 10000 });
      const hint = await page.getByTestId('install-ios-hint').textContent();
      check(
        /Share/.test(hint ?? '') && /Add to Home Screen/.test(hint ?? ''),
        `the iOS hint must name both buttons, got "${hint}"`
      );
      await page.getByTestId('btn-install-dismiss').click();
      await page.getByTestId('install-offer').waitFor({ state: 'hidden', timeout: 10000 });
      await closeSheet(page, 'tab-picker-sheet');
      await openTabPicker(page);
      check(
        (await page.getByTestId('install-offer').count()) === 0,
        'a dismissed offer must stay dismissed for the session'
      );
      await closeSheet(page, 'tab-picker-sheet');
      ok('iOS gets the Share → Add to Home Screen words, and "not now" hides the row');
      await context.close();
    }

    // ---- 8. The handover at 768 and 1024: rail back, picker gone, Predict beside Run ----
    for (const size of [TERMINAL, WIDE]) {
      const context = await browser.newContext({ viewport: size });
      await seedTourSeen(context);
      const page = await context.newPage();
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.getByTestId('tab-rail').waitFor({ state: 'visible', timeout: 30000 });
      // The two buttons are measured, not read: a font that swaps in after the rail renders moves the
      // whole toolbar, and a cold dev server served the swap late enough to fail this once. Waiting
      // for the faces is waiting for the layout the learner sees.
      await page.evaluate(() => document.fonts.ready);
      const account = await box(page, 'btn-account');
      check(
        account.width > 40,
        `at ${size.width}px the account chip hides its words (${Math.round(account.width)}px wide)`
      );
      check(
        !(await page.getByTestId('phone-tab-nav').isVisible()),
        `the phone picker must be gone at ${size.width}px`
      );
      check(
        (await page.getByTestId('phone-field-keyboard').count()) === 0,
        `the site keyboard must not mount at ${size.width}px`
      );
      await assertNoSidewaysScroll(page, `the workbench at ${size.width}`);
      // 2 px is subpixel rounding between a primary and a secondary button, not a second row: a
      // wrap moves Predict down by its own 34 px height plus the row gap, and never resolves.
      const offset = await rowOffset(page, 'btn-run-verify', 'btn-predict');
      check(offset !== null, `the toolbar is missing at ${size.width}px`);
      check(
        offset !== null && Math.abs(offset) <= 2,
        `at ${size.width}px Predict is ${offset}px off Run's row`
      );
      ok(`${size.width}px: the rail is back and Predict shares Run's row`);
      await context.close();
    }

    // ---- 9. The keyboard under a real finger: Chromium touch events, not mouse clicks ----
    {
      const context = await browser.newContext({
        viewport: PHONE,
        screen: PHONE,
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
      });
      await seedTourSeen(context);
      await context.addInitScript(() => {
        window.__touch = { vibrations: [], focus: [], pointers: [] };
        Object.defineProperty(navigator, 'vibrate', {
          configurable: true,
          value: (pattern) => {
            window.__touch.vibrations.push(pattern);
            return true;
          },
        });
        document.addEventListener(
          'focusin',
          (event) => {
            const field = event.target;
            if (!(field instanceof HTMLElement)) return;
            window.__touch.focus.push({
              id: field.dataset.testid ?? field.id ?? field.tagName,
              inputmode: field.getAttribute('inputmode'),
            });
          },
          true
        );
        document.addEventListener(
          'pointerdown',
          (event) => {
            if (event.pointerType) window.__touch.pointers.push(event.pointerType);
          },
          true
        );
      });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.getByTestId('phone-tab-nav').waitFor({ state: 'visible', timeout: 30000 });

      const editorShell = page.getByTestId('mobile-keyboard-shell');
      const fieldShell = page.getByTestId('phone-field-keyboard');
      const press = (keys, id, hold = 40) =>
        touchTap(page, cdp, keys.getByTestId(id), { hold, label: id });
      const vibrations = () => page.evaluate(() => window.__touch.vibrations);
      const clearVibrations = () =>
        page.evaluate(() => {
          window.__touch.vibrations.length = 0;
        });
      const visibleKeyboards = () =>
        page.evaluate(
          () =>
            [...document.querySelectorAll('[data-testid="python-keyboard"]')].filter((element) => {
              const shell = element.closest(
                '[data-testid="mobile-keyboard-shell"], [data-testid="phone-field-keyboard"]'
              );
              return shell?.getAttribute('data-state') === 'open';
            }).length
        );

      console.log('\nthe editor keys under a finger');
      await touchTap(page, cdp, page.getByTestId('btn-tab-picker'), {
        hold: 40,
        label: 'the tab picker',
      });
      await page.getByTestId('tab-picker-sheet').waitFor({ state: 'visible', timeout: 10000 });
      await page.waitForTimeout(250);
      await touchTap(page, cdp, page.getByTestId('tab-picker-item-tab-pyodide'), {
        hold: 40,
        label: 'the Study tab',
      });
      await page.getByTestId('tab-picker-sheet').waitFor({ state: 'hidden', timeout: 10000 });
      await touchTap(page, cdp, page.getByTestId('phone-surface-code'), {
        hold: 40,
        label: 'the Code surface',
      });
      await page.locator('[data-testid="editor-panel"][data-phone-code="1"]').waitFor({
        state: 'visible',
        timeout: 20000,
      });
      await waitForEditor(page);
      await editorShell.waitFor({ state: 'visible', timeout: 10000 });
      await page.waitForTimeout(320);
      const editorBox = await editorShell.boundingBox();
      check(
        Math.abs(editorBox.y + editorBox.height - PHONE.height) <= 1,
        `the editor keyboard ends at ${Math.round(editorBox.y + editorBox.height)}px, not ${PHONE.height}px`
      );
      check((await visibleKeyboards()) === 1, 'the editor surface must draw exactly one keyboard');
      await assertKeyCentresHit(page, 'mobile-keyboard-shell', 'the editor keyboard');

      const baseline = await getEditorCode(page);
      const caret = await page.evaluate(() => window.__mechalabEditors['editor-main'].getCursor());
      await press(editorShell, 'python-key-q');
      let code = await getEditorCode(page);
      check(
        code.length === baseline.length + 1 && code.slice(caret, caret + 1) === 'q',
        'a finger on Q did not type at the caret'
      );
      check(
        await page.evaluate(() => Boolean(document.activeElement?.closest('.cm-editor'))),
        'a finger on a key took the caret away from the editor'
      );
      await press(editorShell, 'python-key-backspace');
      check((await getEditorCode(page)) === baseline, 'Backspace under a finger did not remove the letter');

      await press(editorShell, 'python-key-shift');
      check(
        (await editorShell.getByTestId('python-key-shift').getAttribute('aria-pressed')) === 'true',
        'Shift must arm on a touch'
      );
      await press(editorShell, 'python-key-w');
      code = await getEditorCode(page);
      check(code.slice(caret, caret + 1) === 'W', `Shift + W typed ${JSON.stringify(code.slice(caret, caret + 1))}`);
      check(
        (await editorShell.getByTestId('python-key-shift').getAttribute('aria-pressed')) === 'false',
        'Shift must let go after one letter'
      );
      await press(editorShell, 'python-key-backspace');

      const editorKeyboard = editorShell.getByTestId('python-keyboard');

      // A second quick tap on Shift is the native keyboard's caps lock, and it must not fold the
      // keys or lose the caret: the button changes the keyboard, not the text.
      await press(editorShell, 'python-key-shift');
      await press(editorShell, 'python-key-shift', 25);
      check(
        (await editorKeyboard.getAttribute('data-caps')) === '1',
        'two quick touches on Shift must lock capitals'
      );
      check(
        (await editorShell.getAttribute('data-state')) === 'open',
        'double-tapping Shift folded the keyboard'
      );
      check(
        await page.evaluate(() => Boolean(document.activeElement?.closest('.cm-editor'))),
        'double-tapping Shift took the caret away from the editor'
      );
      await press(editorShell, 'python-key-a');
      await press(editorShell, 'python-key-b');
      code = await getEditorCode(page);
      check(
        code.slice(caret, caret + 2) === 'AB',
        `caps lock typed ${JSON.stringify(code.slice(caret, caret + 2))}, not AB`
      );
      await press(editorShell, 'python-key-shift');
      check(
        (await editorKeyboard.getAttribute('data-caps')) === null,
        'a tap on Shift must let caps lock go'
      );
      await press(editorShell, 'python-key-c');
      code = await getEditorCode(page);
      check(
        code.slice(caret + 2, caret + 3) === 'c',
        `letters stayed ${JSON.stringify(code.slice(caret, caret + 3))} after caps lock was released`
      );
      for (let index = 0; index < 3; index += 1) await press(editorShell, 'python-key-backspace');
      check((await getEditorCode(page)) === baseline, 'the caps-lock letters did not clean up');
      await press(editorShell, 'python-key-fn');
      check((await editorKeyboard.getAttribute('data-fn')) === '1', 'Fn must arm on a touch');
      await press(editorShell, 'python-key-q');
      code = await getEditorCode(page);
      check(code.slice(caret, caret + 1) === '1', 'Fn + Q must type a 1');
      await press(editorShell, 'python-key-fn');
      await press(editorShell, 'python-key-backspace');

      await press(editorShell, 'python-key-layout');
      check(
        (await editorKeyboard.getAttribute('data-page')) === '123',
        '123 must open the numeric page on a touch'
      );
      check(
        (await editorShell.getAttribute('data-state')) === 'open' &&
          (await page.evaluate(() => Boolean(document.activeElement?.closest('.cm-editor')))),
        '123 folded the keyboard instead of switching its page'
      );
      await press(editorShell, 'python-key-digit-7');
      code = await getEditorCode(page);
      check(code.slice(caret, caret + 1) === '7', 'the numeric page did not type a 7');
      await press(editorShell, 'python-key-layout');
      check((await editorKeyboard.getAttribute('data-page')) === 'abc', 'ABC must restore the letters');
      check(
        (await editorShell.getAttribute('data-state')) === 'open' &&
          (await page.evaluate(() => Boolean(document.activeElement?.closest('.cm-editor')))),
        'ABC folded the keyboard instead of switching its page'
      );
      await press(editorShell, 'python-key-backspace');

      await press(editorShell, 'python-key-space');
      code = await getEditorCode(page);
      check(code.slice(caret, caret + 1) === ' ', 'Space must type a space');
      await press(editorShell, 'python-key-backspace');
      await press(editorShell, 'python-key-colon');
      code = await getEditorCode(page);
      check(code.slice(caret, caret + 1) === ':', 'the colon key did not type under a finger');
      await press(editorShell, 'python-key-backspace');

      for (const letter of ['h', 'e', 'l', 'l', 'o']) {
        await press(editorShell, `python-key-${letter}`, 18);
      }
      code = await getEditorCode(page);
      check(
        code.slice(caret, caret + 5) === 'hello',
        `five quick touches typed ${JSON.stringify(code.slice(caret, caret + 5))}`
      );
      for (let index = 0; index < 5; index += 1) await press(editorShell, 'python-key-backspace', 18);
      check((await getEditorCode(page)) === baseline, 'the quick touches did not clean up');

      // Faster than any finger: down and up with no pause between. A keyboard that only works when
      // taps are leisurely is not a keyboard a learner can type on.
      for (const letter of 'typingfast') {
        const key = editorShell.getByTestId(`python-key-${letter}`);
        const keyBox = await key.boundingBox();
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [
            { x: keyBox.x + keyBox.width / 2, y: keyBox.y + keyBox.height / 2, id: 1, force: 1 },
          ],
        });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      }
      await page.waitForTimeout(300);
      code = await getEditorCode(page);
      check(
        code.slice(caret, caret + 10) === 'typingfast',
        `ten uninterrupted touches typed ${JSON.stringify(code.slice(caret, caret + 10))}`
      );
      check(
        (await editorShell.getAttribute('data-state')) === 'open',
        'typing fast folded the keyboard'
      );
      check(
        await page.evaluate(() => Boolean(document.activeElement?.closest('.cm-editor'))),
        'typing fast took the caret away from the editor'
      );
      for (let index = 0; index < 10; index += 1) await press(editorShell, 'python-key-backspace');
      check((await getEditorCode(page)) === baseline, 'the fast touches did not clean up');

      // A held Backspace repeats like a phone's: one delete on the way down, then a steady run.
      for (const letter of 'holddeletetouch') {
        await press(editorShell, `python-key-${letter}`, 10);
      }
      const beforeHold = await getEditorCode(page);
      await fingerDown(page, cdp, editorShell.getByTestId('python-key-backspace'), {
        label: 'the Backspace key',
      });
      await page.waitForTimeout(1000);
      await touchUp(page, cdp);
      await page.waitForTimeout(220);
      const afterHold = await getEditorCode(page);
      check(
        beforeHold.length - afterHold.length >= 6,
        `holding Backspace removed ${beforeHold.length - afterHold.length} characters in a second`
      );
      check(
        (await editorShell.getAttribute('data-state')) === 'open' &&
          (await page.evaluate(() => Boolean(document.activeElement?.closest('.cm-editor')))),
        'holding Backspace folded the keyboard or lost the caret'
      );
      await page.waitForTimeout(220);
      check(
        (await getEditorCode(page)) === afterHold,
        'Backspace kept deleting after the finger lifted'
      );
      const remaining = afterHold.length - baseline.length;
      check(remaining >= 0, 'holding Backspace deleted text that was there before it was held');
      for (let index = 0; index < remaining; index += 1) {
        await press(editorShell, 'python-key-backspace');
      }
      check((await getEditorCode(page)) === baseline, 'the held Backspace did not clean up');

      // The gap between two caps belongs to the keyboard too: it must not move the caret.
      const gapPoints = await page.evaluate(() => {
        const q = document.querySelector('[data-testid="python-key-q"]').getBoundingClientRect();
        const a = document.querySelector('[data-testid="python-key-a"]').getBoundingClientRect();
        return {
          horizontal: { x: q.right + 2, y: q.top + q.height / 2 },
          vertical: { x: q.left + q.width / 2, y: (q.bottom + a.top) / 2 },
        };
      });
      for (const [name, point] of Object.entries(gapPoints)) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x: point.x, y: point.y, id: 1, force: 1 }],
        });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await page.waitForTimeout(220);
        check(
          (await editorShell.getAttribute('data-state')) === 'open',
          `a finger in the ${name} gap folded the keyboard`
        );
        check(
          await page.evaluate(() => Boolean(document.activeElement?.closest('.cm-editor'))),
          `a finger in the ${name} gap took the caret away from the editor`
        );
        await page.evaluate(
          ({ text, at }) => {
            const editor = window.__mechalabEditors['editor-main'];
            editor.set(text);
            editor.setCursor(at);
          },
          { text: baseline, at: caret }
        );
      }

      await fingerDown(page, cdp, editorShell.getByTestId('python-key-a'), { label: 'the A key' });
      await page.waitForTimeout(180);
      const preview = editorShell.getByTestId('python-key-preview');
      check(await preview.isVisible(), 'holding a key must raise its character above the cap');
      check(
        (await preview.textContent())?.trim() === 'a',
        `the held key previewed ${JSON.stringify(await preview.textContent())}`
      );
      check((await getEditorCode(page)) === baseline, 'a held key typed before the finger lifted');
      await touchUp(page, cdp);
      await page.waitForTimeout(140);
      check((await preview.count()) === 0, 'the character preview stayed after the finger lifted');
      code = await getEditorCode(page);
      check(code.slice(caret, caret + 1) === 'a', 'lifting the finger did not type the held letter');
      await press(editorShell, 'python-key-backspace');

      await clearVibrations();
      await press(editorShell, 'python-key-q');
      check(
        JSON.stringify(await vibrations()) === '[8]',
        `a letter asked for ${JSON.stringify(await vibrations())}, not one 8 ms tap`
      );
      await press(editorShell, 'python-key-backspace');
      await clearVibrations();
      await press(editorShell, 'python-key-newline');
      check(
        JSON.stringify(await vibrations()) === '[18]',
        `Return asked for ${JSON.stringify(await vibrations())}, not the medium tap`
      );
      await press(editorShell, 'python-key-backspace');
      check((await getEditorCode(page)) === baseline, 'Return + Backspace did not restore the line');
      await clearVibrations();
      await press(editorShell, 'python-key-layout');
      check(
        JSON.stringify(await vibrations()) === '[[10,24,12]]',
        `the layout key asked for ${JSON.stringify(await vibrations())}, not the confirmation`
      );
      await press(editorShell, 'python-key-layout');

      // Native is a handoff, not a one-way door: after its field is left, touching the code again
      // brings the site's keys back instead of leaving a focused editor with no keyboard. One-shot
      // Shift is transient, so the returning custom keyboard must start unarmed like the OS one.
      await press(editorShell, 'python-key-shift');
      check(
        (await editorShell.getByTestId('python-key-shift').getAttribute('aria-pressed')) === 'true',
        'Shift must arm before the native handoff'
      );
      await press(editorShell, 'python-key-native');
      await page.waitForTimeout(260);
      check(
        (await editorShell.getAttribute('data-state')) === 'closed',
        'the native key did not fold the site keyboard'
      );
      check(
        await page.evaluate(() => Boolean(document.activeElement?.closest('.cm-editor'))),
        'the native key took the caret away from the editor'
      );
      // Android shrinks `innerHeight` together with the visual viewport, so the height remembered at
      // Native is the only baseline that can tell the OS keyboard rose and later went away.
      await page.setViewportSize({ width: PHONE.width, height: 560 });
      await page.waitForTimeout(320);
      const editorShrink = await page.evaluate(() => ({
        inner: window.innerHeight,
        visual: window.visualViewport?.height ?? window.innerHeight,
      }));
      check(
        Math.abs(editorShrink.inner - editorShrink.visual) <= 2 && editorShrink.visual <= 570,
        `the Android shrink did not take both heights together: ${JSON.stringify(editorShrink)}`
      );
      check(
        (await editorShell.getAttribute('data-state')) === 'closed',
        'a viewport shrink reopened the editor keys before the OS keyboard was dismissed'
      );
      await page.setViewportSize(PHONE);
      await page.waitForTimeout(420);
      check(
        (await editorShell.getAttribute('data-state')) === 'open',
        'the editor keys did not return when the visual viewport grew back to the Native baseline'
      );
      check(
        await page.evaluate(() => Boolean(document.activeElement?.closest('.cm-editor'))),
        'the returned editor keys did not keep the caret'
      );
      check(
        (await editorShell.getByTestId('python-key-shift').getAttribute('aria-pressed')) === 'false',
        'armed Shift survived the native handoff and reopened with the custom keys'
      );
      await press(editorShell, 'python-key-native');
      await page.waitForTimeout(260);
      await page.evaluate(() => document.querySelector('.cm-content')?.blur());
      await page.waitForTimeout(180);
      const codeContent = await page.locator('.cm-content').boundingBox();
      check(Boolean(codeContent), 'the code editor has no box to touch after the native handoff');
      const codePoint = { x: codeContent.x + 24, y: codeContent.y + 24 };
      check(
        codePoint.y > 0 && codePoint.y < PHONE.height,
        `the code's first line is off screen at ${Math.round(codePoint.y)}px`
      );
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: codePoint.x, y: codePoint.y, id: 1, force: 1 }],
      });
      await page.waitForTimeout(60);
      await touchUp(page, cdp);
      await page.waitForTimeout(320);
      check(
        (await editorShell.getAttribute('data-state')) === 'open',
        'the site keyboard did not come back after the native field was left'
      );
      check(
        await page.evaluate(() => Boolean(document.activeElement?.closest('.cm-editor'))),
        'touching the code after the native handoff did not restore the caret'
      );

      const pointerTypes = await page.evaluate(() => window.__touch.pointers);
      check(
        pointerTypes.length >= 20 && pointerTypes.every((type) => type === 'touch'),
        `the gate must drive touches, got ${JSON.stringify([...new Set(pointerTypes)])}`
      );

      // Caps lock is transient too: Done folds the keyboard, so the next open starts lowercase even
      // though Fn and the page are remembered.
      await press(editorShell, 'python-key-shift');
      await press(editorShell, 'python-key-shift', 25);
      check(
        (await editorKeyboard.getAttribute('data-caps')) === '1',
        'caps lock must arm before Done'
      );
      await press(editorShell, 'python-key-fn');
      const editorCloseFrames = await sampleKeyboardSlide(page, 'mobile-keyboard-shell', () =>
        touchTap(page, cdp, editorShell.getByTestId('python-key-done'), { hold: 40, label: 'Done' })
      );
      assertKeyboardSlide(editorCloseFrames, 'the editor keyboard folding', 'close', PHONE.height);
      await page.waitForTimeout(220);
      check(
        (await editorKeyboard.getAttribute('data-fn')) === '1',
        'folding the editor keyboard must keep the Fn layer for the next open'
      );
      check(
        (await page.evaluate(() => document.body.style.getPropertyValue('--mobile-keyboard-height'))) === '',
        'a folded keyboard must release the height it lent the page'
      );
      const barHome = await box(page, 'phone-bar');
      check(
        Math.abs(barHome.y + barHome.height - PHONE.height) <= 1,
        `Done must put the Study bar back on the edge, not at ${Math.round(barHome.y + barHome.height)}px`
      );
      const toggle = page.locator('[data-testid="keyboard-toggle"]:visible').first();
      const editorOpenFrames = await slideTap(page, cdp, 'mobile-keyboard-shell', toggle, {
        hold: 40,
        scroll: true,
        label: 'the Python keys button',
      });
      assertKeyboardSlide(editorOpenFrames, 'the editor keyboard rising', 'open', PHONE.height);
      await page.waitForTimeout(220);
      check(
        (await editorKeyboard.getAttribute('data-fn')) === '1',
        'the editor keyboard reopened without the Fn layer it had'
      );
      check(
        (await editorKeyboard.getAttribute('data-caps')) === null,
        'caps lock survived Done and reopened with the custom keys'
      );
      check(
        (await editorShell.getByTestId('python-key-shift').getAttribute('aria-pressed')) === 'false',
        'Shift reopened armed after Done'
      );
      const barOnKeys = await box(page, 'phone-bar');
      const risen = await editorShell.boundingBox();
      check(
        Math.abs(barOnKeys.y + barOnKeys.height - risen.y) <= 1,
        'the Study bar must ride on the editor keyboard as it opens'
      );
      await press(editorShell, 'python-key-fn');
      await press(editorShell, 'python-key-done');
      await page.waitForTimeout(320);
      ok('every editor key answers a touch, holds its preview, types fast, buzzes, and slides both ways');

      console.log('\nthe page keyboard under a finger');
      await touchTap(page, cdp, page.getByTestId('phone-surface-lesson'), {
        hold: 40,
        label: 'the Lesson surface',
      });
      await page.getByTestId('lesson-reader').waitFor({ state: 'visible', timeout: 10000 });
      await touchTap(page, cdp, page.getByTestId('btn-lessons'), {
        hold: 40,
        label: 'the lesson list',
      });
      await page.getByTestId('lesson-sheet').waitFor({ state: 'visible', timeout: 10000 });
      const search = page.getByTestId('lesson-sheet').getByTestId('input-lesson-search');
      await touchTap(page, cdp, search, { hold: 60, scroll: true, label: 'the lesson search' });
      await fieldShell.waitFor({ state: 'visible', timeout: 5000 });
      await page.waitForTimeout(320);
      const firstFieldBox = await fieldShell.boundingBox();
      check(
        Math.abs(firstFieldBox.y + firstFieldBox.height - PHONE.height) <= 1,
        `the page keyboard ends at ${Math.round(firstFieldBox.y + firstFieldBox.height)}px, not ${PHONE.height}px`
      );
      check((await search.getAttribute('inputmode')) === 'none', 'a page field must suppress the OS keyboard');
      const focusedSearch = await page.evaluate(() => window.__touch.focus.at(-1));
      check(
        focusedSearch.id === 'input-lesson-search' && focusedSearch.inputmode === 'none',
        `the OS keyboard was not suppressed before focus: ${JSON.stringify(focusedSearch)}`
      );
      await assertKeyCentresHit(page, 'phone-field-keyboard', 'the page keyboard');

      await press(fieldShell, 'python-key-p');
      check((await search.inputValue()) === 'p', `the page keyboard typed ${JSON.stringify(await search.inputValue())}`);
      await press(fieldShell, 'python-key-backspace');
      check((await search.inputValue()) === '', 'Backspace did not clear the page field');
      await press(fieldShell, 'python-key-fn');
      await press(fieldShell, 'python-key-q');
      check((await search.inputValue()) === '1', 'Fn + Q must type a digit into a page field');
      await press(fieldShell, 'python-key-fn');
      await press(fieldShell, 'python-key-backspace');
      await press(fieldShell, 'python-key-layout');
      check(
        (await fieldShell.getByTestId('python-keyboard').getAttribute('data-page')) === '123',
        '123 must open the numeric page for a page field'
      );
      check(
        (await fieldShell.getAttribute('data-state')) === 'open' &&
          (await search.evaluate((element) => element === document.activeElement)),
        '123 folded the page keyboard instead of switching its page'
      );
      await press(fieldShell, 'python-key-digit-7');
      check((await search.inputValue()) === '7', 'the numeric page did not type 7 into the search');
      await press(fieldShell, 'python-key-layout');
      check(
        (await fieldShell.getByTestId('python-keyboard').getAttribute('data-page')) === 'abc' &&
          (await fieldShell.getAttribute('data-state')) === 'open' &&
          (await search.evaluate((element) => element === document.activeElement)),
        'ABC folded the page keyboard instead of restoring the letters'
      );
      await press(fieldShell, 'python-key-backspace');
      await press(fieldShell, 'python-key-shift');
      await press(fieldShell, 'python-key-s');
      check((await search.inputValue()) === 'S', 'Shift + S must type a capital into a page field');
      check(
        (await fieldShell.getByTestId('python-key-shift').getAttribute('aria-pressed')) === 'false',
        'Shift must let go after one letter in a page field'
      );
      await press(fieldShell, 'python-key-backspace');

      for (const letter of ['s', 'e', 'a', 'r', 'c', 'h']) {
        await press(fieldShell, `python-key-${letter}`, 18);
      }
      check(
        (await search.inputValue()) === 'search',
        `six quick touches typed ${JSON.stringify(await search.inputValue())}`
      );
      for (let index = 0; index < 6; index += 1) await press(fieldShell, 'python-key-backspace', 18);
      check((await search.inputValue()) === '', 'the quick touches did not clear the search');

      // The same held Backspace in a controlled page field: each repeat is a real input event, so
      // React's value and the caret have to keep up with the finger.
      for (const letter of 'holddelete') {
        await press(fieldShell, `python-key-${letter}`, 10);
      }
      await fingerDown(page, cdp, fieldShell.getByTestId('python-key-backspace'), {
        label: 'the page field Backspace',
      });
      await page.waitForTimeout(1000);
      await touchUp(page, cdp);
      await page.waitForTimeout(220);
      const fieldHeld = await search.inputValue();
      check(
        fieldHeld.length <= 5,
        `holding Backspace left ${JSON.stringify(fieldHeld)} in the page field`
      );
      check(
        (await fieldShell.getAttribute('data-state')) === 'open' &&
          (await search.evaluate((element) => element === document.activeElement)),
        'holding Backspace folded the page keyboard or lost its field'
      );
      for (let index = 0; index < fieldHeld.length; index += 1) {
        await press(fieldShell, 'python-key-backspace');
      }
      check((await search.inputValue()) === '', 'the held page Backspace did not clean up');

      // The page field's native handoff has the same return: leave the field, touch it again, and
      // the site keys are back with the OS keyboard suppressed before focus. Caps lock belongs to
      // the open session only, as it does on the OS keyboard.
      await press(fieldShell, 'python-key-shift');
      await press(fieldShell, 'python-key-shift', 25);
      check(
        (await fieldShell.getByTestId('python-keyboard').getAttribute('data-caps')) === '1',
        'caps lock must arm before the page field native handoff'
      );
      await press(fieldShell, 'python-key-native');
      await page.waitForTimeout(200);
      check(
        (await fieldShell.getAttribute('data-state')) === 'closed',
        'the page field native key did not fold the site keyboard'
      );
      check((await search.getAttribute('inputmode')) === null, 'native must hand the inputmode back');
      check(
        await search.evaluate((element) => element === document.activeElement),
        'the page field native key took the caret away from its field'
      );
      // The same Android shrink pattern for a page field: both heights fall together.
      await page.setViewportSize({ width: PHONE.width, height: 560 });
      await page.waitForTimeout(320);
      const fieldShrink = await page.evaluate(() => ({
        inner: window.innerHeight,
        visual: window.visualViewport?.height ?? window.innerHeight,
      }));
      check(
        Math.abs(fieldShrink.inner - fieldShrink.visual) <= 2 && fieldShrink.visual <= 570,
        `the Android shrink did not take both heights together: ${JSON.stringify(fieldShrink)}`
      );
      check(
        (await fieldShell.getAttribute('data-state')) === 'closed',
        'a viewport shrink reopened the page keys before the OS keyboard was dismissed'
      );
      await page.setViewportSize(PHONE);
      await page.waitForTimeout(420);
      check(
        (await fieldShell.getAttribute('data-state')) === 'open',
        'the page keys did not return when the visual viewport grew back to the Native baseline'
      );
      check((await search.getAttribute('inputmode')) === 'none', 'the returning page keys did not suppress the OS keyboard');
      check(
        await search.evaluate((element) => element === document.activeElement),
        'the returned page keys did not keep the field caret'
      );
      check(
        (await fieldShell.getByTestId('python-keyboard').getAttribute('data-caps')) === null,
        'caps lock survived the page field native handoff and reopened with the custom keys'
      );
      check(
        (await fieldShell.getByTestId('python-key-shift').getAttribute('aria-pressed')) === 'false',
        'Shift reopened armed in the page field after the native handoff'
      );
      await press(fieldShell, 'python-key-native');
      await page.waitForTimeout(200);
      await search.evaluate((element) => element.blur());
      await page.waitForTimeout(160);
      await touchTap(page, cdp, search, { hold: 60, label: 'the search after the native handoff' });
      await page.waitForTimeout(320);
      check(
        (await fieldShell.getAttribute('data-state')) === 'open',
        'the page keyboard did not come back after the native field was left'
      );
      check((await search.getAttribute('inputmode')) === 'none', 'the returning page keyboard did not suppress the OS keyboard');
      check(
        await search.evaluate((element) => element === document.activeElement),
        'the returning page keyboard did not restore the field caret'
      );

      await page.setViewportSize({ width: 360, height: 740 });
      await page.waitForTimeout(420);
      const smallBox = await fieldShell.boundingBox();
      check(
        Math.abs(smallBox.y + smallBox.height - 740) <= 2,
        `at 360px the page keyboard ends at ${Math.round(smallBox.y + smallBox.height)}px, not 740px`
      );
      await assertNoSidewaysScroll(page, 'the page keyboard at 360');
      const smallKeys = await page.evaluate(() => {
        const shell = document.querySelector('[data-testid="phone-field-keyboard"]');
        const keys = [...shell.querySelectorAll('[data-testid^="python-key-"]')].map((key) =>
          key.getBoundingClientRect()
        );
        return {
          count: keys.length,
          minHeight: Math.min(...keys.map((rect) => rect.height)),
          minWidth: Math.min(...keys.map((rect) => rect.width)),
        };
      });
      check(smallKeys.count >= 60, `the 360px keyboard has only ${smallKeys.count} keys`);
      check(
        smallKeys.minHeight >= 40 && smallKeys.minWidth >= 20,
        `a 360px key measures ${smallKeys.minWidth}x${smallKeys.minHeight}, below the touch floor`
      );
      await assertKeyCentresHit(page, 'phone-field-keyboard', 'the 360px page keyboard');
      await page.setViewportSize(PHONE);
      await page.waitForTimeout(420);
      const restoredBox = await fieldShell.boundingBox();
      check(
        Math.abs(restoredBox.y + restoredBox.height - PHONE.height) <= 2,
        `back at 390px the page keyboard ends at ${Math.round(restoredBox.y + restoredBox.height)}px`
      );

      const fieldCloseFrames = await sampleKeyboardSlide(page, 'phone-field-keyboard', () =>
        touchTap(page, cdp, fieldShell.getByTestId('python-key-done'), { hold: 40, label: 'Done' })
      );
      assertKeyboardSlide(fieldCloseFrames, 'the page keyboard folding', 'close', PHONE.height);
      await page.waitForTimeout(220);
      check((await search.getAttribute('inputmode')) === null, 'Done must hand the field its inputmode back');
      check(
        await search.evaluate((element) => element !== document.activeElement),
        'Done must put the caret away'
      );
      const fieldOpenFrames = await slideTap(page, cdp, 'phone-field-keyboard', search, {
        hold: 60,
        scroll: true,
        label: 'the lesson search',
      });
      assertKeyboardSlide(fieldOpenFrames, 'the page keyboard rising', 'open', PHONE.height);
      await page.waitForTimeout(220);

      const chip = page.getByTestId('lesson-sheet').locator('[data-testid="track-filters"] button').first();
      await touchTap(page, cdp, chip, { hold: 40, label: 'a track filter' });
      await page.waitForTimeout(320);
      check(
        (await fieldShell.getAttribute('data-state')) === 'closed',
        'a finger outside a field must fold the page keyboard'
      );
      check((await search.getAttribute('inputmode')) === null, 'a press outside must hand the inputmode back');
      await touchTap(page, cdp, page.getByTestId('lesson-sheet-close'), {
        hold: 40,
        label: 'the lesson sheet close',
      });
      await page.getByTestId('lesson-sheet').waitFor({ state: 'hidden', timeout: 10000 });
      const barBack = await box(page, 'phone-bar');
      check(
        Math.abs(barBack.y + barBack.height - PHONE.height) <= 1,
        'the Study bar must be back on the edge once the sheet and its keyboard are gone'
      );
      ok('a page field takes the same keys under a finger, fits 360px, and slides both ways');

      console.log('\ntwo fields under one finger');
      await page.evaluate(() => {
        const tray = document.createElement('div');
        tray.dataset.touchTray = '1';
        tray.style.cssText =
          'position:fixed;left:8px;top:150px;z-index:200;display:flex;gap:8px;padding:6px;background:var(--panel);border:1px solid var(--line)';
        for (const [id, label] of [
          ['touch-field-a', 'A'],
          ['touch-field-b', 'B'],
        ]) {
          const input = document.createElement('input');
          input.id = id;
          input.setAttribute('aria-label', `Test field ${label}`);
          input.style.cssText = 'width:132px;height:44px;border:1px solid var(--line);background:var(--canvas);color:var(--ink)';
          tray.append(input);
        }
        document.body.append(tray);
      });
      const fieldA = page.locator('#touch-field-a');
      const fieldB = page.locator('#touch-field-b');
      await touchTap(page, cdp, fieldA, { hold: 60, scroll: true, label: 'the first test field' });
      await page.waitForTimeout(240);
      const beforeSwap = await fieldShell.boundingBox();
      check((await fieldA.getAttribute('inputmode')) === 'none', 'the first field did not suppress its OS keyboard');
      await touchTap(page, cdp, fieldB, { hold: 60, scroll: true, label: 'the second test field' });
      await page.waitForTimeout(200);
      const afterSwap = await fieldShell.boundingBox();
      check(
        (await fieldShell.getAttribute('data-state')) === 'open',
        'moving to a second field folded the keyboard'
      );
      check(
        Math.abs(afterSwap.y - beforeSwap.y) <= 1,
        `moving to a second field moved the keyboard ${Math.round(afterSwap.y - beforeSwap.y)}px`
      );
      check(
        (await fieldA.getAttribute('inputmode')) === null,
        'the field the finger left must get its inputmode back'
      );
      check((await fieldB.getAttribute('inputmode')) === 'none', 'the field the finger reached must suppress its OS keyboard');
      const focusedSecond = await page.evaluate(() => window.__touch.focus.at(-1));
      check(
        focusedSecond.id === 'touch-field-b' && focusedSecond.inputmode === 'none',
        `the second field was focused before it was suppressed: ${JSON.stringify(focusedSecond)}`
      );
      await press(fieldShell, 'python-key-z');
      check((await fieldB.inputValue()) === 'z', 'the keys did not follow the finger to the second field');
      await press(fieldShell, 'python-key-done');
      await page.waitForTimeout(320);
      await page.evaluate(() => document.querySelector('[data-touch-tray]')?.remove());
      ok('the keys follow a finger from one field to the next without folding');

      console.log('\nthe calculator and the note composer under a finger');
      await touchTap(page, cdp, page.getByTestId('phone-surface-code'), {
        hold: 40,
        label: 'the Code surface',
      });
      await page.locator('[data-testid="editor-panel"][data-phone-code="1"]').waitFor({
        state: 'visible',
        timeout: 20000,
      });
      await waitForEditor(page);
      if ((await editorShell.getAttribute('data-state')) === 'open') {
        await touchTap(page, cdp, editorShell.getByTestId('python-key-done'), {
          hold: 40,
          label: 'Done on the editor keys',
        });
        await page.waitForTimeout(280);
      }
      await touchTap(page, cdp, page.getByTestId('editor-tab-calculator'), {
        hold: 40,
        scroll: true,
        label: 'the Calculator view',
      });
      await page.getByTestId('calculator-pane').waitFor({ state: 'visible', timeout: 10000 });
      const display = page.getByTestId('calculator-display');
      await touchTap(page, cdp, display, { hold: 60, scroll: true, label: 'the calculator display' });
      await fieldShell.waitFor({ state: 'visible', timeout: 5000 });
      await page.waitForTimeout(300);
      check((await display.getAttribute('inputmode')) === 'none', 'the calculator display kept the OS keyboard');
      const focusedDisplay = await page.evaluate(() => window.__touch.focus.at(-1));
      check(
        focusedDisplay.id === 'calculator-display' && focusedDisplay.inputmode === 'none',
        `the calculator was focused before it was suppressed: ${JSON.stringify(focusedDisplay)}`
      );
      await press(fieldShell, 'python-key-fn');
      await press(fieldShell, 'python-key-q');
      await press(fieldShell, 'python-key-w');
      await press(fieldShell, 'python-key-fn');
      await press(fieldShell, 'python-key-plus');
      await press(fieldShell, 'python-key-fn');
      await press(fieldShell, 'python-key-e');
      await press(fieldShell, 'python-key-fn');
      check(
        (await display.inputValue()) === '12+3',
        `the calculator received ${JSON.stringify(await display.inputValue())}`
      );
      // The keypad's = lives under the fixed keys; Done puts them away, the way a finger would.
      await press(fieldShell, 'python-key-done');
      await page.waitForTimeout(320);
      check((await display.getAttribute('inputmode')) === null, 'Done must release the calculator display');
      await touchTap(page, cdp, page.getByTestId('calculator-key-equals'), {
        hold: 40,
        label: 'equals',
      });
      await page.waitForFunction(
        () => document.querySelector('[data-testid="calculator-result"]')?.textContent?.trim() === '15',
        undefined,
        { timeout: 3000 }
      );

      await touchTap(page, cdp, page.getByTestId('phone-surface-lesson'), {
        hold: 40,
        label: 'the Lesson surface',
      });
      await page.getByTestId('lesson-reader').waitFor({ state: 'visible', timeout: 10000 });
      await page.evaluate(() => {
        const reader = document.querySelector('[data-testid="lesson-reader"]');
        const paragraph = reader.querySelector('p') ?? reader;
        const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
        let node = null;
        while ((node = walker.nextNode()) && !node.textContent.trim()) {}
        const range = document.createRange();
        range.setStart(node, 0);
        range.setEnd(node, Math.min(24, node.textContent.length));
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        document.dispatchEvent(new Event('selectionchange'));
      });
      await page.getByTestId('btn-sticky').waitFor({ state: 'visible', timeout: 5000 });
      await touchTap(page, cdp, page.getByTestId('btn-sticky'), {
        hold: 40,
        scroll: true,
        label: 'the Sticky button',
      });
      const note = page.getByTestId('sticky-note-text');
      await note.waitFor({ state: 'visible', timeout: 5000 });
      await touchTap(page, cdp, note, { hold: 60, label: 'the note composer' });
      await page.waitForTimeout(300);
      check((await note.getAttribute('inputmode')) === 'none', 'the note composer kept the OS keyboard');
      const focusedNote = await page.evaluate(() => window.__touch.focus.at(-1));
      check(
        focusedNote.id === 'sticky-note-text' && focusedNote.inputmode === 'none',
        `the note composer was focused before it was suppressed: ${JSON.stringify(focusedNote)}`
      );
      for (const letter of ['n', 'o', 't', 'e']) await press(fieldShell, `python-key-${letter}`, 25);
      check(
        (await note.textContent())?.trim() === 'note',
        `the rich note received ${JSON.stringify(await note.textContent())}`
      );
      await press(fieldShell, 'python-key-backspace');
      check((await note.textContent())?.trim() === 'not', 'Backspace did not edit the rich note');
      for (const letter of ['a', 'b', 'c', 'd']) await press(fieldShell, `python-key-${letter}`, 20);
      await fingerDown(page, cdp, fieldShell.getByTestId('python-key-backspace'), {
        label: 'the note Backspace',
      });
      await page.waitForTimeout(900);
      await touchUp(page, cdp);
      await page.waitForTimeout(220);
      const noteHeld = (await note.textContent())?.trim() ?? '';
      check(
        noteHeld.length <= 4,
        `holding Backspace left ${JSON.stringify(noteHeld)} in the rich note`
      );
      check(
        (await fieldShell.getAttribute('data-state')) === 'open' &&
          (await note.evaluate((element) => element === document.activeElement)),
        'holding Backspace folded the note keyboard or lost the composer'
      );
      await press(fieldShell, 'python-key-done');
      await page.waitForTimeout(320);
      check((await note.getAttribute('inputmode')) === null, 'Done must release the note composer');
      await touchTap(page, cdp, page.getByTestId('btn-sticky-cancel'), {
        hold: 40,
        scroll: true,
        label: 'the note close',
      });
      await page.waitForTimeout(200);
      check((await note.count()) === 0, 'the note composer stayed open after its close');
      ok('the calculator and the rich note composer both take the site keys under a finger');

      check(pageErrors.length === 0, `the touch session threw: ${pageErrors.join('; ')}`);
      await context.close();
    }

    console.log('\nmobile gate green');
  } finally {
    await browser.close();
    // The Vite server keeps the event loop alive: without this the suite prints its last line and
    // then sits there until CI's timeout kills it.
    if (ownServer) await ownServer.viteServer.close();
  }
}

await main();
