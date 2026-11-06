/**
 * The narrow-width workbench audit (`scripts/narrow_workbench_audit.mjs`).
 *
 * This is called by the built-bundle suite, which already owns the deployment and reader checks.
 * The contract has three parts that interact at a phone's width and again at a tablet's:
 *
 *  - P.6's Requirements view is reachable, has its cards, and stays inside its pane;
 *  - a two-pane split mounts the arrangement controls, while the editor tab strip keeps a readable
 *    floor and keeps every tab clear of those controls;
 *  - the reader's saved heading survives a reload;
 *  - the tablet's brief can fold the first-run guide away, and the fold survives a reload.
 *
 * `auditPaneLayouts` is the wide companion: three panes must use both axes with no empty cell, and
 * the dividers between them must move the boundary and remember it after a reload.
 *
 * The header case is the one that regressed: the arrangement controls were fixed-size siblings of a
 * zero-min-width tablist, so at 390 px the strip was squeezed to ~50 px, the tabs stacked one per
 * row, and their overflow drew under the swap menu. The floor + wrapping row in
 * `RunnerEditorCard.tsx` is what this file holds in place. Reverting it must fail here.
 */

import assert from 'node:assert/strict';
import { seedTourSeen } from './tour_seed.mjs';

const NARROW_VIEWPORTS = [
  { label: 'phone', width: 390, height: 844 },
  { label: 'tablet', width: 834, height: 1112 },
];

/** Study opens folded above the phone breakpoint; the split controls need its body expanded. */
async function expandEditorBody(page) {
  const toggle = page.locator('[data-testid="btn-toggle-editor"]').first();
  await toggle.waitFor({ state: 'attached', timeout: 10000 });
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
}

/**
 * Open a two-pane P.6 editor, measure the Requirements tab and header, then scroll and reload the
 * reader at this width.
 */
async function auditAtWidth(browser, baseUrl, name, { label, width, height }) {
  const context = await browser.newContext({ viewport: { width, height } });
  await seedTourSeen(context);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  try {
    await page.goto(`${baseUrl}?lesson=P.6`, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForFunction(() => (document.getElementById('root')?.children.length ?? 0) > 0, {
      timeout: 20000,
    });
    // Do not depend on the context's remembered preset: a Read layout has no Requirements tab and
    // a phone has no Code surface outside Study.
    await page.keyboard.press('Alt+1');
    await page.waitForFunction(
      () => document.querySelector('[data-layout]')?.getAttribute('data-layout') === 'study',
      undefined,
      { timeout: 10000 }
    );

    if (width > 767) {
      // The brief's guide switch is one remembered cell for every lesson. Hide it, prove a reload
      // still has it hidden, then put it back so the rest of the audit is unchanged.
      await page.getByTestId('first-lesson-guide').waitFor({ state: 'visible', timeout: 15000 });
      await page.getByTestId('btn-guide-toggle').click();
      await page.getByTestId('first-lesson-guide').waitFor({ state: 'detached', timeout: 5000 });
      assert.equal(
        await page.evaluate(() => localStorage.getItem('mechalab_guide_hidden_v1')),
        '1',
        `${name}/${label}: hiding the guide did not remember the choice`
      );
      await page.reload({ waitUntil: 'networkidle', timeout: 45000 });
      await page.waitForFunction(() => (document.getElementById('root')?.children.length ?? 0) > 0, {
        timeout: 20000,
      });
      const showGuide = page.getByTestId('btn-guide-toggle');
      await showGuide.waitFor({ state: 'visible', timeout: 20000 });
      assert.equal(
        await page.getByTestId('first-lesson-guide').count(),
        0,
        `${name}/${label}: the guide came back after a reload despite being hidden`
      );
      await showGuide.click();
      await page.getByTestId('first-lesson-guide').waitFor({ state: 'visible', timeout: 10000 });
    }

    if (width <= 767) {
      await page.getByTestId('phone-surface-code').waitFor({ state: 'visible', timeout: 20000 });
      await page.getByTestId('phone-surface-code').click();
    }
    await page.getByTestId('editor-panel').waitFor({ state: 'visible', timeout: 20000 });
    await expandEditorBody(page);

    await page.getByTestId('editor-tab-requirements').waitFor({ state: 'visible', timeout: 10000 });
    await page.getByTestId('editor-tab-requirements').click();
    await page.getByTestId('editor-requirements').waitFor({ state: 'visible', timeout: 20000 });
    const requirements = await page.evaluate(() => {
      const pane = document.querySelector('[data-testid="pane-requirements"]');
      const cards = [...pane.querySelectorAll('.editor-requirement-card')];
      const paneBox = pane.getBoundingClientRect();
      return {
        cards: cards.length,
        text: pane.innerText,
        tokens: pane.querySelectorAll('[data-token]').length,
        columns: new Set(cards.map((card) => Math.round(card.getBoundingClientRect().left))).size,
        outside: cards.filter((card) => {
          const box = card.getBoundingClientRect();
          return box.left < paneBox.left - 1 || box.right > paneBox.right + 1;
        }).length,
        overflow: pane.scrollWidth - pane.clientWidth,
      };
    });
    assert.equal(requirements.cards, 6, `${name}/${label}: P.6 must show all six Requirements cards`);
    assert.ok(
      requirements.tokens >= 2,
      `${name}/${label}: Requirements rendered ${requirements.tokens} tokens; P.6 names two functions in backticks`
    );
    assert.ok(
      requirements.text.includes('the printed output matches the Expected Output block.'),
      `${name}/${label}: the Output requirement does not name the Expected Output block`
    );
    assert.ok(
      !requirements.text.includes('###'),
      `${name}/${label}: a literal ### leaked into the Requirements pane`
    );
    assert.equal(requirements.outside, 0, `${name}/${label}: a Requirements card escaped its pane`);
    assert.equal(requirements.overflow, 0, `${name}/${label}: the Requirements pane scrolls sideways`);
    if (width <= 767) {
      assert.equal(requirements.columns, 1, `${name}/${label}: a phone must lay Requirements out in one column`);
    } else {
      assert.ok(requirements.columns >= 2, `${name}/${label}: a tablet must lay Requirements out in two columns`);
    }

    const split = page.getByTestId('btn-pane-split');
    await split.waitFor({ state: 'visible', timeout: 10000 });
    await split.click();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="editor-panes"]')?.getAttribute('data-count') === '2',
      undefined,
      { timeout: 10000 }
    );
    await page.getByTestId('select-pane-swap').waitFor({ state: 'visible', timeout: 10000 });

    const arrangement = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="editor-panel"]');
      const strip = panel.querySelector('[role="tablist"][aria-label="Editor tabs"]');
      const tabs = [...strip.querySelectorAll('[role="tab"]')].filter((tab) => tab.getClientRects().length);
      const controls = [
        ...panel.querySelectorAll(
          '[data-testid="btn-pane-columns"],[data-testid="btn-pane-rows"],[data-testid="btn-pane-add"],[data-testid="select-pane-swap"],[data-testid="btn-pane-close"],[data-testid="btn-toggle-editor"]'
        ),
      ].filter((node) => node.getClientRects().length);
      const overlaps = [];
      for (const tab of tabs) {
        const a = tab.getBoundingClientRect();
        for (const control of controls) {
          const b = control.getBoundingClientRect();
          if (
            a.left < b.right - 1 &&
            a.right > b.left + 1 &&
            a.top < b.bottom - 1 &&
            a.bottom > b.top + 1
          ) {
            overlaps.push(`${tab.dataset.testid ?? 'tab'}/${control.dataset.testid ?? 'control'}`);
          }
        }
      }
      return {
        count: document.querySelector('[data-testid="editor-panes"]')?.getAttribute('data-count'),
        stripWidth: strip.clientWidth,
        stripScrollWidth: strip.scrollWidth,
        tabs: tabs.length,
        rows: new Set(tabs.map((tab) => Math.round(tab.getBoundingClientRect().top))).size,
        controls: controls.length,
        overlaps,
        add: Boolean(document.querySelector('[data-testid="btn-pane-add"]')),
        pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    });

    assert.equal(arrangement.count, '2', `${name}/${label}: the two-pane split did not mount`);
    assert.ok(
      arrangement.stripWidth >= 192,
      `${name}/${label}: the two-pane tab strip collapsed to ${arrangement.stripWidth}px; the 12rem floor must keep it readable`
    );
    assert.ok(
      arrangement.stripScrollWidth <= arrangement.stripWidth + 1,
      `${name}/${label}: the tab strip clips its own tabs (${arrangement.stripScrollWidth}px of content in ${arrangement.stripWidth}px)`
    );
    assert.ok(
      arrangement.rows < arrangement.tabs,
      `${name}/${label}: ${arrangement.tabs} tabs stacked one per row across ${arrangement.rows} rows`
    );
    assert.ok(arrangement.controls >= 5, `${name}/${label}: only ${arrangement.controls} arrangement controls mounted`);
    assert.deepEqual(
      arrangement.overlaps,
      [],
      `${name}/${label}: a real tab overlaps an arrangement control: ${arrangement.overlaps.join(', ')}`
    );
    assert.equal(
      arrangement.add,
      false,
      `${name}/${label}: Add pane must disappear at the two-pane capacity`
    );
    assert.ok(
      arrangement.pageOverflow <= 0,
      `${name}/${label}: the page scrolls sideways by ${arrangement.pageOverflow}px`
    );

    if (width <= 767) {
      await page.getByTestId('phone-surface-lesson').click();
      await page.getByTestId('lesson-reader').waitFor({ state: 'visible', timeout: 10000 });
    }
    await page.getByTestId('reader-loading').waitFor({ state: 'detached', timeout: 20000 });
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid="lesson-reader"] [data-reader-anchor]').length >= 4,
      undefined,
      { timeout: 15000 }
    );
    const before = await page.evaluate(() => {
      const scroll = document.querySelector('[data-testid="reader-scroll"]');
      const headings = [
        ...document.querySelectorAll('[data-testid="lesson-reader"] [data-reader-anchor]'),
      ].filter((heading) => heading.getClientRects().length);
      const heading = headings[3];
      scroll.scrollTop = heading.offsetTop + 24;
      scroll.dispatchEvent(new Event('scroll'));
      return { anchor: heading.dataset.readerAnchor, at: Math.round(scroll.scrollTop) };
    });
    assert.ok(before.at > 0, `${name}/${label}: the reader did not scroll before the reload`);

    await page.waitForFunction(
      ({ key, lesson, anchor }) => {
        try {
          const stored = JSON.parse(localStorage.getItem(key) || '{}');
          return stored?.[lesson]?.anchor === anchor;
        } catch {
          return false;
        }
      },
      { key: 'mechalab_reading_position_v1', lesson: 'P.6', anchor: before.anchor },
      { timeout: 10000 }
    );
    await page.reload({ waitUntil: 'networkidle', timeout: 45000 });
    await page.getByTestId('lesson-reader').waitFor({ state: 'visible', timeout: 20000 });
    await page.getByTestId('reader-loading').waitFor({ state: 'detached', timeout: 20000 });
    await page.waitForFunction(
      () => (document.querySelector('[data-testid="reader-scroll"]')?.scrollTop ?? 0) > 0,
      undefined,
      { timeout: 8000 }
    );
    const restored = await page.evaluate(() => {
      const scroll = document.querySelector('[data-testid="reader-scroll"]');
      let anchor = '';
      for (const heading of document.querySelectorAll(
        '[data-testid="lesson-reader"] [data-reader-anchor]'
      )) {
        if (heading.offsetTop <= scroll.scrollTop + 8) anchor = heading.dataset.readerAnchor;
        else break;
      }
      return { anchor, at: Math.round(scroll.scrollTop) };
    });
    assert.equal(
      restored.anchor,
      before.anchor,
      `${name}/${label}: the reader came back under "${restored.anchor}", not "${before.anchor}"`
    );
    assert.ok(
      Math.abs(restored.at - before.at) < 160,
      `${name}/${label}: the reader saved ${before.at}px but restored at ${restored.at}px`
    );
    assert.equal(pageErrors.length, 0, `${name}/${label}: page errors: ${pageErrors.join(' | ')}`);

    console.log(
      `  ok ${name}/${label}: P.6 Requirements ${requirements.cards} cards/${requirements.columns} column(s), ` +
        `two-pane header ${arrangement.stripWidth}px/${arrangement.rows} rows with ${arrangement.controls} controls, ` +
        `reader restored "${restored.anchor}" at ${restored.at}px`
    );
  } finally {
    await context.close();
  }
}

/** Run the same narrow-width contract in both supported viewport shapes. */
export async function auditNarrowWorkbench(browser, baseUrl, name) {
  for (const viewport of NARROW_VIEWPORTS) {
    await auditAtWidth(browser, baseUrl, name, viewport);
  }
}

/** Geometry of the three-pane body, read from the page rather than from the arrangement state. */
function paneBoxes(page) {
  return page.evaluate(() => {
      const bodyNode = document.querySelector('[data-testid="editor-panes"]');
      if (!bodyNode) return { body: null, panes: [] };
      const rect = bodyNode.getBoundingClientRect();
      return {
        body: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
        panes: [...bodyNode.querySelectorAll('[data-pane]')]
          .filter((node) => node.getClientRects().length > 0)
          .map((node) => {
            const pane = node.getBoundingClientRect();
            return {
              name: node.getAttribute('data-pane'),
              x: pane.x,
              y: pane.y,
              w: pane.width,
              h: pane.height,
            };
          }),
      };
    });
}

/**
 * A wide screen's mixed layout (`runner/EditorPaneBody.tsx`). Three panes use both axes: the first is
 * full height on the left, the other two stack on the right. Without that, the third pane sat under a
 * two-column grid with an empty fourth cell beside it. The drag and the reload are measured as
 * geometry: a share that only lived in React state would come back at half.
 */
export async function auditPaneLayouts(browser, baseUrl, name) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  await seedTourSeen(context);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));


  try {
    await page.goto(`${baseUrl}?lesson=P.6`, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForFunction(() => (document.getElementById('root')?.children.length ?? 0) > 0, {
      timeout: 20000,
    });
    await page.keyboard.press('Alt+1');
    await expandEditorBody(page);
    await page.getByTestId('btn-pane-split').click();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="editor-panes"]')?.getAttribute('data-count') === '2',
      undefined,
      { timeout: 10000 }
    );
    await page.getByTestId('btn-pane-add').click();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="editor-panes"]')?.getAttribute('data-count') === '3',
      undefined,
      { timeout: 10000 }
    );

    const mixed = await paneBoxes(page);
    assert.equal(mixed.panes.length, 3, `${name}: the three-pane body drew ${mixed.panes.length} panes`);
    const first = mixed.panes.find((pane) => pane.name === 'main');
    const right = mixed.panes.filter((pane) => pane.name !== 'main').sort((a, b) => a.y - b.y);
    assert.ok(first, `${name}: the main pane is missing`);
    assert.equal(right.length, 2, `${name}: the right column holds ${right.length} panes`);
    const [second, third] = right;
    assert.ok(
      first.h >= mixed.body.h - 5,
      `${name}: the first pane is ${first.h}px in a ${mixed.body.h}px body; it must span both rows`
    );
    assert.ok(
      Math.abs(second.y - mixed.body.y) < 3 && third.y >= second.y + second.h - 3,
      `${name}: the second and third panes must stack in the right column (${second.y}+${second.h} vs ${third.y})`
    );
    assert.ok(
      second.h + third.h >= mixed.body.h - 5,
      `${name}: the right column leaves ${Math.round(mixed.body.h - second.h - third.h)}px empty`
    );
    assert.ok(
      Math.abs(second.w - third.w) < 3 && Math.abs(second.x - (first.x + first.w)) < 4,
      `${name}: the mixed layout did not give the first pane its own column ` +
        `(first ${first.x}+${first.w}, right ${second.x}/${third.x} at ${second.w}/${third.w})`
    );

    const divider = page.getByTestId('pane-divider-column');
    await divider.scrollIntoViewIfNeeded();
    const handle = await divider.boundingBox();
    assert.ok(handle, `${name}: the three-pane body has no column divider`);
    const viewport = page.viewportSize();
    // The divider is as tall as the body; its middle can be below the window even after the body is
    // scrolled into view, and the row divider crosses it at mid-height. Grab it near its top edge so
    // the pointer is on the column boundary, not on the crossing.
    const dragY = Math.min(Math.max(handle.y + 40, 20), viewport.height - 20);
    const target = mixed.body.x + mixed.body.w * 0.35;
    await page.mouse.move(handle.x + handle.width / 2, dragY);
    await page.mouse.down();
    await page.mouse.move(target, dragY, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const dragged = await paneBoxes(page);
    const mainAfter = dragged.panes.find((pane) => pane.name === 'main');
    const share = mainAfter.w / dragged.body.w;
    assert.ok(
      Math.abs(share - 0.35) < 0.06,
      `${name}: dragging to 35% left the first pane at ${(share * 100).toFixed(1)}%`
    );

    const rowDivider = page.getByTestId('pane-divider-row');
    await rowDivider.scrollIntoViewIfNeeded();
    const rowHandle = await rowDivider.boundingBox();
    assert.ok(rowHandle, `${name}: the three-pane body has no row divider`);
    const rowY = Math.min(Math.max(rowHandle.y + rowHandle.height / 2, 20), viewport.height - 20);
    await page.mouse.move(rowHandle.x + 20, rowY);
    await page.mouse.down();
    await page.mouse.move(
      rowHandle.x + 20,
      Math.min(Math.max(dragged.body.y + dragged.body.h * 0.3, 20), viewport.height - 20),
      { steps: 10 }
    );
    await page.mouse.up();
    await page.waitForTimeout(200);
    const rowDragged = await paneBoxes(page);
    const rightRows = rowDragged.panes
      .filter((pane) => pane.name !== 'main')
      .sort((a, b) => a.y - b.y);
    const topShare = rightRows[0].h / (rightRows[0].h + rightRows[1].h);
    assert.ok(
      Math.abs(topShare - 0.3) < 0.06,
      `${name}: dragging the row divider to 30% left the top pane at ${(topShare * 100).toFixed(1)}%`
    );

    await page.reload({ waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForFunction(() => (document.getElementById('root')?.children.length ?? 0) > 0, {
      timeout: 20000,
    });
    await page.keyboard.press('Alt+1');
    await expandEditorBody(page);
    await page.waitForFunction(
      () => document.querySelector('[data-testid="editor-panes"]')?.getAttribute('data-count') === '3',
      undefined,
      { timeout: 10000 }
    );
    const restored = await paneBoxes(page);
    const restoredMain = restored.panes.find((pane) => pane.name === 'main');
    assert.ok(
      Math.abs(restoredMain.w / restored.body.w - 0.35) < 0.08,
      `${name}: the column share did not survive the reload`
    );
    const restoredRows = restored.panes
      .filter((pane) => pane.name !== 'main')
      .sort((a, b) => a.y - b.y);
    const restoredStack = restoredRows[0].h / (restoredRows[0].h + restoredRows[1].h);
    assert.ok(Math.abs(restoredStack - 0.3) < 0.08, `${name}: the row share did not survive the reload`);
    assert.equal(pageErrors.length, 0, `${name}: page errors: ${pageErrors.join(' | ')}`);

    console.log(
      `  ok ${name}: three panes mix axes (first ${Math.round(restoredMain.w)}px full-height, ` +
        `stack ${(restoredStack * 100).toFixed(0)}%) and both divider shares survive a reload`
    );
  } finally {
    await context.close();
  }
}

/** The actual split between the two stacked panes, read from the rendered boxes. */
function rowSplitBoxes(page) {
  return page.evaluate(() => {
    const bodyNode = document.querySelector('[data-testid="editor-panes"]');
    const rect = (node) => {
      const box = node.getBoundingClientRect();
      return { x: box.x, y: box.y, w: box.width, h: box.height };
    };
    const divider = document.querySelector('[data-testid="pane-divider-row"]');
    return {
      body: {
        ...rect(bodyNode),
        views: bodyNode.getAttribute('data-views'),
      },
      panes: [...bodyNode.querySelectorAll('[data-pane]')]
        .filter((node) => node.getClientRects().length > 0)
        .map((node) => ({ name: node.getAttribute('data-pane'), ...rect(node) })),
      divider: divider ? rect(divider) : null,
    };
  });
}

/**
 * The swapped mixed layout: Requirements full height, the code and Predict stacked beside it.
 *
 * The first audit above gives the full-height slot to `main`, where the stacked output panes are short
 * enough that their content minima never disagree with the stored share. The learner can swap those
 * views, and with the code in the stack its editor minimum used to win over the share: the handle
 * moved but the two panes did not. This test holds the rendered geometry to the share, not just the
 * stored value, and drags the handle with a real pointer.
 */
export async function auditStackedCodeRows(browser, baseUrl, name) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  await seedTourSeen(context);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  const assertBoundary = (state, label) => {
    const main = state.panes.find((pane) => pane.name === 'main');
    const predict = state.panes.find((pane) => pane.name === 'predict');
    assert.ok(main, `${name}: ${label}: the stacked code pane is missing`);
    assert.ok(predict, `${name}: ${label}: the stacked Predict pane is missing`);
    assert.ok(state.divider, `${name}: ${label}: the stacked pane divider is missing`);
    const boundary = main.y + main.h;
    const dividerCenter = state.divider.y + state.divider.h / 2;
    assert.ok(
      Math.abs(dividerCenter - boundary) <= 2,
      `${name}: ${label}: the divider is at ${dividerCenter.toFixed(1)}px but the panes meet at ` +
        `${boundary.toFixed(1)}px`
    );
    return { main, predict };
  };

  try {
    await page.goto(`${baseUrl}?lesson=P.6`, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForFunction(() => (document.getElementById('root')?.children.length ?? 0) > 0, {
      timeout: 20000,
    });
    await page.keyboard.press('Alt+1');
    await page.waitForFunction(
      () => document.querySelector('[data-layout]')?.getAttribute('data-layout') === 'study',
      undefined,
      { timeout: 10000 }
    );
    await expandEditorBody(page);
    await page.getByTestId('editor-tab-requirements').click();
    await page.getByTestId('pane-requirements').waitFor({ state: 'visible', timeout: 15000 });
    await page.getByTestId('btn-pane-split').click();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="editor-panes"]')?.getAttribute('data-count') === '2',
      undefined,
      { timeout: 10000 }
    );
    await page.getByTestId('btn-pane-add').click();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="editor-panes"]')?.getAttribute('data-count') === '3',
      undefined,
      { timeout: 10000 }
    );
    const columns = page.getByTestId('btn-pane-columns');
    if ((await columns.getAttribute('aria-pressed')) !== 'true') await columns.click();
    await page.waitForTimeout(250);

    const before = await rowSplitBoxes(page);
    assert.equal(
      before.body.views,
      'requirements,main,predict',
      `${name}: the swapped fixture must keep Requirements, the code and Predict in that order`
    );
    const requirements = before.panes.find((pane) => pane.name === 'requirements');
    assert.ok(requirements, `${name}: the full-height Requirements pane is missing`);
    assert.ok(
      requirements.h >= before.body.h - 5,
      `${name}: Requirements is ${requirements.h}px in a ${before.body.h}px body; it must stay full height`
    );
    const beforeRows = assertBoundary(before, 'at rest');
    assert.ok(
      Math.abs(beforeRows.main.w - beforeRows.predict.w) < 3 &&
        Math.abs(beforeRows.main.x - beforeRows.predict.x) < 3,
      `${name}: the code and Predict panes must share the right-hand column`
    );
    assert.ok(
      beforeRows.predict.y >= beforeRows.main.y + beforeRows.main.h - 3,
      `${name}: Predict must sit below the code pane`
    );

    const divider = page.getByTestId('pane-divider-row');
    await page.getByTestId('editor-panes').scrollIntoViewIfNeeded();
    await divider.scrollIntoViewIfNeeded();
    const handle = await divider.boundingBox();
    assert.ok(handle, `${name}: the stacked pane divider has no pointer handle`);
    const scrolledBody = await page.getByTestId('editor-panes').boundingBox();
    assert.ok(scrolledBody, `${name}: the stacked pane body has no box after scrolling`);
    const x = handle.x + 20;
    const startY = handle.y + handle.height / 2;
    // Read the body again after scrolling: the page can move by hundreds of pixels, and a target
    // captured before it would put the pointer below the viewport.
    const targetY = Math.min(
      Math.max(scrolledBody.y + scrolledBody.height * 0.32, 20),
      page.viewportSize().height - 20
    );
    await page.mouse.move(x, startY);
    await page.mouse.down();
    await page.mouse.move(x, targetY, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(250);

    const after = await rowSplitBoxes(page);
    const afterRows = assertBoundary(after, 'after the drag');
    const topShare = afterRows.main.h / (afterRows.main.h + afterRows.predict.h);
    assert.ok(
      Math.abs(topShare - 0.32) < 0.06,
      `${name}: dragging to 32% left the code pane at ${(topShare * 100).toFixed(1)}%`
    );
    assert.ok(
      beforeRows.main.h - afterRows.main.h > 60 &&
        afterRows.predict.h - beforeRows.predict.h > 60,
      `${name}: the row drag moved the divider but not both panes ` +
        `(${beforeRows.main.h.toFixed(1)}/${beforeRows.predict.h.toFixed(1)} -> ` +
        `${afterRows.main.h.toFixed(1)}/${afterRows.predict.h.toFixed(1)})`
    );
    assert.ok(
      Math.min(afterRows.main.h, afterRows.predict.h) >= before.body.h * 0.15 - 3,
      `${name}: the drag left a pane below the 15% usability floor`
    );

    await page.reload({ waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForFunction(() => (document.getElementById('root')?.children.length ?? 0) > 0, {
      timeout: 20000,
    });
    await page.keyboard.press('Alt+1');
    await expandEditorBody(page);
    await page.waitForFunction(
      () => document.querySelector('[data-testid="editor-panes"]')?.getAttribute('data-count') === '3',
      undefined,
      { timeout: 10000 }
    );
    const restored = await rowSplitBoxes(page);
    const restoredRows = assertBoundary(restored, 'after the reload');
    const restoredShare = restoredRows.main.h / (restoredRows.main.h + restoredRows.predict.h);
    assert.ok(
      Math.abs(restoredShare - topShare) < 0.06,
      `${name}: the stacked row share did not survive the reload ` +
        `(${(topShare * 100).toFixed(1)}% -> ${(restoredShare * 100).toFixed(1)}%)`
    );
    assert.equal(pageErrors.length, 0, `${name}: stacked row page errors: ${pageErrors.join(' | ')}`);

    console.log(
      `  ok ${name}: swapped stacks keep Requirements full height and drag the code/predict ` +
        `boundary to ${(restoredShare * 100).toFixed(0)}% with the handle on it`
    );
  } finally {
    await context.close();
  }
}
