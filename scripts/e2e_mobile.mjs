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
 *   4. Study is one surface at a time. Lesson opens on the text, Code mounts the editor, a punctuation
 *      key inserts at the caret, every key is at least 40 px, the fixed bar sits on the bottom edge
 *      with a 44 px Run, and a sheet hides that bar instead of covering its last row.
 *   5. A reload inside Code comes back to Code; switching to Lesson hides the editor without
 *      losing it.
 *   6. The lesson sheet is the chooser: another entry opens, the sheet closes, the title follows.
 *   7. The install row appears only when it can act (a browser prompt event, or iOS's Share sheet),
 *      calls the browser's prompt once, and leaves after the learner accepts.
 *   8. At 768 and 1024 the rail returns, the picker goes, and Predict still shares Run's row.
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

async function waitForEditor(page) {
  await page.waitForFunction(
    () => Boolean(window.__mechalabEditors && window.__mechalabEditors['editor-main']),
    undefined,
    { timeout: 30000 }
  );
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
      check(
        !(await page.getByTestId('lesson-reader').isVisible()),
        'the Code surface must not keep the lesson text below the editor'
      );
      const keys = page.locator('[data-testid^="python-key-"]');
      check((await keys.count()) >= 10, `the punctuation strip has only ${await keys.count()} keys`);
      for (let index = 0; index < (await keys.count()); index += 1) {
        const key = await keys.nth(index).boundingBox();
        check(
          Boolean(key) && key.height >= 40 && key.width >= 40,
          `punctuation key ${index} is ${key?.width}x${key?.height}, below the 40 px floor`
        );
      }
      const before = await getEditorCode(page);
      await page.getByTestId('python-key-colon').click();
      const after = await getEditorCode(page);
      check(after.length === before.length + 1, 'a punctuation key must insert one character');
      check(after.includes(':'), 'the colon key did not insert a colon');
      await assertNoSidewaysScroll(page, 'the Code surface');
      ok('lesson → code by choice, 40 px keys, a bottom Run bar, no sideways scroll');

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
      ok(`the chooser opens ${OTHER_LESSON.id}, closes, and the strip follows`);

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
      await assertNoSidewaysScroll(page, `the workbench at ${size.width}`);
      const run = await page.getByTestId('btn-run-verify').boundingBox();
      const predict = await page.getByTestId('btn-predict').boundingBox();
      check(Boolean(run) && Boolean(predict), `the toolbar is missing at ${size.width}px`);
      // 2 px is subpixel rounding between a primary and a secondary button, not a second row: a
      // wrap moves Predict down by its own 34 px height plus the row gap.
      check(
        Math.abs(run.y - predict.y) <= 2,
        `at ${size.width}px Predict is ${Math.round(predict.y - run.y)}px off Run's row`
      );
      ok(`${size.width}px: the rail is back and Predict shares Run's row`);
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
