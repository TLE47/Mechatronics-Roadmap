/**
 * The narrow-width workbench audit (`scripts/narrow_workbench_audit.mjs`).
 *
 * This is called by the built-bundle suite, which already owns the deployment and reader checks.
 * The contract has three parts that interact at a phone's width and again at a tablet's:
 *
 *  - P.6's Requirements view is reachable, has its cards, and stays inside its pane;
 *  - a two-pane split mounts the arrangement controls, while the editor tab strip keeps a readable
 *    floor and keeps every tab clear of those controls;
 *  - the reader's saved heading survives a reload.
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
    assert.ok(requirements.tokens >= 5, `${name}/${label}: Requirements rendered ${requirements.tokens} tokens, not the five the page carries`);
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
