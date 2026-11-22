#!/usr/bin/env node
/**
 * The snap arrow on screen (`scripts/e2e_snap_arrow.mjs`).
 *
 * The block browser suite proves *where* the arrow is in the DOM. This one proves it is **painted**:
 * at desktop and phone widths it holds a drag over a drop target, screenshots the viewport, and
 * diffs the drop area against the same area with the arrow's own `visibility` hidden. Only the
 * arrow's pixels can differ, so a marker that is clipped, covered by the dragged card's chip or
 * painted behind a neighbour fails here even though its rectangle is in the right place.
 *
 * It writes the evidence beside the project's other screenshots (`artifacts/snap-arrow/`): the whole
 * viewport mid-drag, the crop around the gap, and a nearest-neighbour zoom so the arrow can be
 * looked at rather than inferred. `artifacts/` is gitignored; the PNGs are run output, not source.
 *
 * Four pauses are captured, each before the release:
 *
 * 1. desktop, a card held over the gap below another card;
 * 2. desktop, a card held over a suite that has nothing inside it yet;
 * 3. phone, the same gap with a real CDP touch long-press;
 * 4. phone, the same empty suite with that finger.
 *
 * After each release exactly zero arrows must remain. The arrow is accent-coloured, 10×6 CSS px, and
 * inside the viewport in every case.
 *
 * Run: npm run test:e2e:snap-arrow
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { resolveChromiumExecutable, startDevServer } from './e2e_browser_workbench.mjs';
import { seedTourSeen } from './tour_seed.mjs';
import { setEditorCode, waitForEditor } from './editor-code.mjs';
import { createTouch } from './touch_input.mjs';
import { PYTHON_LESSONS } from '../app/src/data/pythonLessonsData.ts';

const SHOT_DIR = path.join(process.cwd(), 'artifacts', 'snap-arrow');
/** A short program so every card in the four cases fits on a phone without scrolling. */
const PROGRAM = ['name = "Alex"', 'age = 15', 'print(name)'].join('\n');
const CARD = '[data-testid="python-workspace-list"] > li[data-block-id]';

async function openVisual(page, baseUrl) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(document.querySelector('#root *')), undefined, {
    timeout: 30000,
  });
  const startHere = page.getByTestId('btn-start-here-run');
  if (await startHere.count()) await startHere.click();
  else {
    const lesson = page.getByTestId(`lesson-item-${PYTHON_LESSONS[0].id}`);
    if (await lesson.count()) await lesson.first().click();
  }
  const tab = page.getByTestId('tab-btn-tab-pyodide');
  if (await tab.count()) await tab.click();
  await page.getByTestId('lesson-item-P.1').waitFor({ timeout: 15000 });
  await page.locator('#python-runner-editor').waitFor({ state: 'visible', timeout: 30000 });
  const guide = page.getByTestId('btn-guide-dismiss');
  if (await guide.isVisible().catch(() => false)) await guide.click();
  const folded = page.locator('[data-testid="btn-toggle-editor"][aria-expanded="false"]');
  if (await folded.count()) await folded.first().click();
  await waitForEditor(page);
  await page.getByTestId('editor-mode-bar').waitFor({ state: 'visible', timeout: 15000 });

  // A known program, so the cards this test drags are the same on every visit.
  await setEditorCode(page, PROGRAM);
  await page.waitForFunction(
    (code) => window.__mechalabEditors['editor-main'].get() === code,
    PROGRAM,
    { timeout: 10000 }
  );
  await page.getByTestId('editor-mode-visual').click();
  await page.getByTestId('python-block-editor').waitFor({ state: 'visible', timeout: 20000 });

  // One empty suite at the end: the second place the arrow has to point at. It is added the way a
  // learner adds it — the end-of-workspace door, then the toolbox item — not by seeding markup.
  await page.getByTestId('block-add-statement').scrollIntoViewIfNeeded();
  await page.getByTestId('block-add-statement').click();
  const ifItem = page.getByTestId('toolbox-item-if');
  await ifItem.scrollIntoViewIfNeeded();
  await ifItem.click();
  await page.getByTestId('python-block-if').last().waitFor({ state: 'visible', timeout: 10000 });
  assert.equal(
    await page.locator(CARD).count(),
    4,
    'the screenshot program should draw three statements and one empty suite'
  );
  // The suite's body is the only drop target with a non-empty iteration id: every card surface
  // publishes its parent body (the root's is `""`), so filtering those out names the body itself.
  return page.locator('[data-drop-body]:not([data-drop-body=""])').last();
}

/** The point a finger or cursor presses to pick a card up: its own bottom padding. */
async function pressPoint(card) {
  const box = await card.boundingBox();
  assert.ok(box, 'the card to pick up should be laid out');
  return { box, x: box.x + 16, y: box.y + box.height - 3, bottom: box.y + box.height };
}

/**
 * Screenshot the drop area with the arrow on and off, and count what only the arrow could paint.
 *
 * Hiding the arrow (rather than removing it) keeps every neighbour, shadow and dashed outline in
 * exactly the same pixels, so the diff is the arrow itself. That is what makes this a visual check
 * and not a second geometry assertion: a marker hidden behind the drag chip or the next card
 * produces no changed pixels at all.
 */
async function captureArrow(page, name) {
  const arrow = page.getByTestId('block-snap-arrow');
  assert.equal(await arrow.count(), 1, `${name}: exactly one snap arrow should be drawn`);

  const meta = await arrow.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    // Resolve the token the arrow is asked to paint through a canvas, so the comparison is in
    // rendered RGB whatever colour space the palette declares.
    const probe = document.createElement('span');
    probe.style.color = 'var(--accent)';
    document.body.appendChild(probe);
    const accent = getComputedStyle(probe).color;
    probe.remove();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d');
    context.fillStyle = accent;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
    return {
      rect: {
        x: rect.x,
        y: rect.y,
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      },
      painted: style.borderTopColor,
      accent,
      rgb: { r, g, b, a },
      parentId: element.closest('[data-block-id]')?.getAttribute('data-block-id') ?? null,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  });

  assert.equal(meta.painted, meta.accent, `${name}: the arrow should paint --accent`);
  assert.equal(meta.rgb.a, 255, `${name}: the accent should be opaque`);
  assert.ok(
    meta.rect.width >= 9 && meta.rect.width <= 11,
    `${name}: the arrow should be about 10px wide, got ${meta.rect.width}`
  );
  assert.ok(
    meta.rect.height >= 5 && meta.rect.height <= 7,
    `${name}: the arrow should be about 6px tall, got ${meta.rect.height}`
  );
  assert.ok(
    meta.rect.top >= 0 &&
      meta.rect.left >= 0 &&
      meta.rect.bottom <= meta.viewport.height &&
      meta.rect.right <= meta.viewport.width,
    `${name}: the arrow must be inside the viewport, got ${JSON.stringify(meta.rect)}`
  );

  const shot = (suffix) => path.join(SHOT_DIR, `${name}${suffix}`);
  await page.screenshot({ path: shot('.png') });

  const pad = 36;
  const clip = {
    x: Math.max(0, Math.floor(meta.rect.x - pad)),
    y: Math.max(0, Math.floor(meta.rect.y - pad)),
    width: 0,
    height: 0,
  };
  clip.width = Math.min(
    meta.viewport.width - clip.x,
    Math.ceil(meta.rect.right + pad) - clip.x
  );
  clip.height = Math.min(
    meta.viewport.height - clip.y,
    Math.ceil(meta.rect.bottom + pad) - clip.y
  );
  assert.ok(clip.width > 0 && clip.height > 0, `${name}: the zoom crop should have a size`);

  const withArrow = await page.screenshot({ clip });
  await arrow.evaluate((element) => {
    element.style.visibility = 'hidden';
  });
  const withoutArrow = await page.screenshot({ clip });
  await arrow.evaluate((element) => {
    element.style.visibility = '';
  });

  fs.writeFileSync(shot('-crop.png'), withArrow);

  const proof = await diffPixels(page, withArrow, withoutArrow, meta.rgb);
  fs.writeFileSync(shot('-zoom.png'), Buffer.from(proof.zoom.split(',')[1], 'base64'));

  assert.ok(
    proof.changed >= 10,
    `${name}: hiding the arrow should change its pixels; ${proof.changed} changed — it is not painted`
  );
  assert.ok(
    proof.accentChanged >= 8,
    `${name}: the painted pixels should be the accent colour; ${proof.accentChanged} of ${proof.changed} changed pixels match`
  );

  console.log(
    `  shot ${shot('.png')} (arrow ${Math.round(meta.rect.width)}×${Math.round(meta.rect.height)} at ${Math.round(meta.rect.x)},${Math.round(meta.rect.y)}; ${proof.accentChanged}/${proof.changed} changed px are accent)`
  );
  return { ...meta, clip, proof, files: [shot('.png'), shot('-crop.png'), shot('-zoom.png')] };
}

/** Count the pixels that vanish when the arrow is hidden, and zoom the crop for a human look. */
async function diffPixels(page, withArrow, withoutArrow, accent) {
  const decoder = await page.context().newPage();
  try {
    return await decoder.evaluate(
      async ({ withUrl, withoutUrl, accent }) => {
        const decode = async (url) => {
          const image = new Image();
          image.src = url;
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          canvas.getContext('2d').drawImage(image, 0, 0);
          return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
        };
        const a = await decode(withUrl);
        const b = await decode(withoutUrl);
        if (a.width !== b.width || a.height !== b.height) {
          throw new Error(`screenshots differ in size: ${a.width}×${a.height} vs ${b.width}×${b.height}`);
        }
        let changed = 0;
        let accentChanged = 0;
        for (let i = 0; i < a.data.length; i += 4) {
          const delta =
            Math.abs(a.data[i] - b.data[i]) +
            Math.abs(a.data[i + 1] - b.data[i + 1]) +
            Math.abs(a.data[i + 2] - b.data[i + 2]) +
            Math.abs(a.data[i + 3] - b.data[i + 3]);
          if (delta <= 12) continue;
          changed += 1;
          const dr = a.data[i] - accent.r;
          const dg = a.data[i + 1] - accent.g;
          const db = a.data[i + 2] - accent.b;
          if (dr * dr + dg * dg + db * db <= 60 * 60) accentChanged += 1;
        }

        // A 6× nearest-neighbour zoom of the crop, so the PNG is readable at a glance.
        const source = document.createElement('canvas');
        source.width = a.width;
        source.height = a.height;
        source.getContext('2d').putImageData(a, 0, 0);
        const zoom = document.createElement('canvas');
        zoom.width = a.width * 6;
        zoom.height = a.height * 6;
        const context = zoom.getContext('2d');
        context.imageSmoothingEnabled = false;
        context.drawImage(source, 0, 0, zoom.width, zoom.height);
        return { changed, accentChanged, zoom: zoom.toDataURL('image/png') };
      },
      {
        withUrl: `data:image/png;base64,${withArrow.toString('base64')}`,
        withoutUrl: `data:image/png;base64,${withoutArrow.toString('base64')}`,
        accent,
      }
    );
  } finally {
    await decoder.close();
  }
}

function assertGap(proof, targetBox, targetId, name) {
  assert.equal(proof.parentId, targetId, `${name}: the arrow should sit under the card being pointed at`);
  assert.ok(
    proof.rect.top >= targetBox.y + targetBox.height - 1 &&
      proof.rect.bottom <= targetBox.y + targetBox.height + 8,
    `${name}: the arrow should be in the gap below the card, got ${JSON.stringify(proof.rect)} for card bottom ${targetBox.y + targetBox.height}`
  );
}

function assertInsideSuite(proof, bodyBox, suiteId, name) {
  assert.equal(proof.parentId, suiteId, `${name}: the arrow should be drawn by the target suite`);
  assert.ok(
    Math.abs(proof.rect.top - (bodyBox.y - 9)) <= 1,
    `${name}: the arrow should point into the top of the empty suite, got ${proof.rect.top} vs body top ${bodyBox.y}`
  );
}

async function assertGone(page, name) {
  assert.equal(
    await page.getByTestId('block-snap-arrow').count(),
    0,
    `${name}: the arrow must be gone after release`
  );
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}-after.png`) });
  console.log(`  ok ${name}: the arrow clears on release`);
}

async function main() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const ownServer = process.env.E2E_BASE_URL ? null : await startDevServer(process.cwd());
  const baseUrl = process.env.E2E_BASE_URL ?? ownServer.baseUrl;
  const executablePath = resolveChromiumExecutable();
  const browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    headless: true,
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      hasTouch: true,
    });
    await seedTourSeen(context);
    await context.addInitScript(() => {
      window.__mechalabPredictFirst = false;
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    const suiteBody = await openVisual(page, baseUrl);
    const cards = page.locator(CARD);

    // ---- 1. Desktop: a card held below another card ----
    const first = await pressPoint(cards.nth(0));
    const secondBox = await cards.nth(1).boundingBox();
    assert.ok(secondBox, 'the desktop target card should be laid out');
    const secondId = await cards.nth(1).getAttribute('data-block-id');
    await page.mouse.move(first.x, first.y);
    await page.mouse.down();
    await page.mouse.move(first.x + 12, first.y - 16, { steps: 3 });
    await page.getByTestId('block-drag-ghost').waitFor({ state: 'visible', timeout: 3000 });
    // Near the target card's left edge, where the dragged card's chip used to cover the arrow.
    await page.mouse.move(secondBox.x + 22, secondBox.y + secondBox.height - 2, { steps: 10 });
    await page.locator('[data-drop-active="1"]').first().waitFor({ state: 'visible', timeout: 3000 });
    const desktopGap = await captureArrow(page, 'desktop-gap');
    assertGap(desktopGap, secondBox, secondId, 'desktop gap');
    await page.mouse.up();
    await assertGone(page, 'desktop-gap');
    await page.getByTestId('block-undo').click();
    await page.waitForTimeout(100);

    // ---- 2. Desktop: a card held over a suite that is empty ----
    const suiteId = await page.getByTestId('python-block-if').last().getAttribute('data-block-id');
    const bodyBox = await suiteBody.boundingBox();
    assert.ok(bodyBox, 'the empty suite body should be laid out');
    const firstAgain = await pressPoint(cards.nth(0));
    await page.mouse.move(firstAgain.x, firstAgain.y);
    await page.mouse.down();
    await page.mouse.move(firstAgain.x + 12, firstAgain.y - 16, { steps: 3 });
    await page.getByTestId('block-drag-ghost').waitFor({ state: 'visible', timeout: 3000 });
    await page.mouse.move(bodyBox.x + bodyBox.width / 2, bodyBox.y + 14, { steps: 10 });
    await page.locator('[data-drop-active="1"]').first().waitFor({ state: 'visible', timeout: 3000 });
    const desktopSuite = await captureArrow(page, 'desktop-empty-suite');
    assertInsideSuite(desktopSuite, bodyBox, suiteId, 'desktop empty suite');
    await page.mouse.up();
    await assertGone(page, 'desktop-empty-suite');
    await page.getByTestId('block-undo').click();
    await page.waitForTimeout(100);

    // ---- 3. Phone: the same gap, held by a real finger ----
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    const codeSurface = page.getByTestId('phone-surface-code');
    if (await codeSurface.isVisible().catch(() => false)) await codeSurface.click();
    await page.getByTestId('python-workspace').waitFor({ state: 'visible', timeout: 15000 });
    // Centre the cards in the band the header and the dock leave, with the same instant scroll the
    // blocks gate uses: a smooth scroll still animating when the boxes are measured would put the
    // press on whichever card slid under it.
    await page.evaluate(() => {
      const cards = [
        ...document.querySelectorAll(
          '[data-testid="python-workspace-list"] > li[data-block-id]'
        ),
      ];
      const header = document.querySelector('[data-chrome="header"]');
      // A phone has a second sticky row under the header: the tab picker. The band starts below
      // both, or the cards are positioned under a control that will eat the press.
      const tabRow = document.querySelector('[data-chrome="rail"]');
      const chromeBottom = Math.max(
        header ? header.getBoundingClientRect().bottom : 0,
        tabRow ? tabRow.getBoundingClientRect().bottom : 0
      );
      const dock = document.querySelector('[data-testid="python-toolbox"]');
      const top = (chromeBottom || 84) + 8;
      const bottom = (dock ? dock.getBoundingClientRect().top : window.innerHeight) - 8;
      const first = cards[0].getBoundingClientRect();
      const last = cards[cards.length - 1].getBoundingClientRect();
      const desired = top + Math.max(0, (bottom - top - (last.bottom - first.top)) / 2);
      const delta = first.top - desired;
      let node = cards[0].parentElement;
      let scroller = null;
      while (node && node !== document.body) {
        const overflow = getComputedStyle(node).overflowY;
        if (
          (overflow === 'auto' || overflow === 'scroll') &&
          node.scrollHeight > node.clientHeight + 1
        ) {
          scroller = node;
          break;
        }
        node = node.parentElement;
      }
      const target = scroller ?? document.scrollingElement ?? document.documentElement;
      const previous = target.style.scrollBehavior;
      target.style.scrollBehavior = 'auto';
      target.scrollTop += delta;
      target.style.scrollBehavior = previous;
    });
    await page.waitForFunction(
      () =>
        new Promise((resolve) => {
          const card = document.querySelector(
            '[data-testid="python-workspace-list"] > li[data-block-id]'
          );
          if (!card) return resolve(false);
          const before = card.getBoundingClientRect().top;
          requestAnimationFrame(() =>
            requestAnimationFrame(() =>
              resolve(Math.abs(card.getBoundingClientRect().top - before) < 0.5)
            )
          );
        }),
      undefined,
      { timeout: 3000 }
    );
    const touch = await createTouch(page);
    const phoneCards = page.locator(CARD);
    const phoneFirst = await pressPoint(phoneCards.nth(0));
    const phoneSecondBox = await phoneCards.nth(1).boundingBox();
    assert.ok(phoneSecondBox, 'the phone target card should be laid out');
    const phoneSecondId = await phoneCards.nth(1).getAttribute('data-block-id');
    const phoneFirstId = await phoneCards.nth(0).getAttribute('data-block-id');
    const pressUnder = await page.evaluate(
      ({ x, y }) => {
        const element = document.elementFromPoint(x, y);
        return {
          block: element?.closest('[data-block-id]')?.getAttribute('data-block-id') ?? null,
          testId: element?.closest('[data-testid]')?.getAttribute('data-testid') ?? null,
          tag: element?.tagName ?? null,
        };
      },
      { x: phoneFirst.x, y: phoneFirst.y }
    );
    assert.equal(
      pressUnder.block,
      phoneFirstId,
      `the phone press should start on the first card, got ${JSON.stringify(pressUnder)} at ${Math.round(phoneFirst.x)},${Math.round(phoneFirst.y)}`
    );
    await touch.start(phoneFirst.x, phoneFirst.y);
    await page.getByTestId('block-drag-ghost').waitFor({ state: 'visible', timeout: 3000 });
    // The worst case: the finger is at the target's left edge, where its label chip sits over the gap.
    await touch.move(phoneSecondBox.x + 22, phoneSecondBox.y + phoneSecondBox.height - 2, {
      steps: 10,
    });
    await page.locator('[data-drop-active="1"]').first().waitFor({ state: 'visible', timeout: 3000 });
    const phoneGap = await captureArrow(page, 'phone-gap');
    assertGap(phoneGap, phoneSecondBox, phoneSecondId, 'phone gap');
    await touch.end();
    await assertGone(page, 'phone-gap');
    // No undo tap here: on a phone the workspace toolbar can sit under the sticky chrome, and the
    // order this test leaves behind is irrelevant — the empty suite is still the last card, and the
    // next press uses whichever card is first now.

    // The resize remounted the visual editor, which re-read the emitted code: the suite that was
    // visually empty now holds the generated `pass` as a raw line. Clear it the way a learner would
    // so the phone case really points at an empty suite.
    const rawPass = page.getByTestId('python-block-raw').last();
    if (await rawPass.count()) {
      const rawToggle = rawPass.getByTestId('block-actions-toggle').first();
      await rawToggle.scrollIntoViewIfNeeded();
      await rawToggle.tap();
      await rawPass.getByTestId('block-remove').tap();
      await page.waitForTimeout(100);
    }

    // ---- 4. Phone: the same empty suite ----
    const phoneSuiteBody = await suiteBody.boundingBox();
    assert.ok(phoneSuiteBody, 'the phone empty suite body should be laid out');
    const phoneFirstAgain = await pressPoint(page.locator(CARD).nth(0));
    await touch.start(phoneFirstAgain.x, phoneFirstAgain.y);
    await page.getByTestId('block-drag-ghost').waitFor({ state: 'visible', timeout: 3000 });
    await touch.move(phoneSuiteBody.x + phoneSuiteBody.width / 2, phoneSuiteBody.y + 14, {
      steps: 10,
    });
    await page.locator('[data-drop-active="1"]').first().waitFor({ state: 'visible', timeout: 3000 });
    const phoneSuite = await captureArrow(page, 'phone-empty-suite');
    assertInsideSuite(phoneSuite, phoneSuiteBody, suiteId, 'phone empty suite');
    await touch.end();
    await assertGone(page, 'phone-empty-suite');

    assert.deepEqual(pageErrors, [], `the page threw: ${pageErrors.join('; ')}`);
    console.log(`snap arrow on screen: 4 paused drags captured in ${SHOT_DIR}`);
  } finally {
    await browser.close();
    if (ownServer) await ownServer.viteServer.close();
  }
}

await main();
