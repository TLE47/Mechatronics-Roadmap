/**
 * The mission's built-bundle checks (`scripts/mission_workbench_audit.mjs`).
 *
 * The unit suites pin the stores and the pure pane state machine. This file answers what only a
 * rendered browser can: the goal and Requirements are the micro lessons' colourful boxes, the
 * chooser's two lists scroll independently and reset one lesson unit, the lesson summary is aligned,
 * the swap menu exchanges two panes on both axes, and the bottom edge resizes the body. The built
 * Pages suite calls it after the existing narrow, column/row and studio audits, so a regression here
 * is a real bundle failure.
 */

import assert from 'node:assert/strict';
import { seedTourSeen } from './tour_seed.mjs';

async function expandEditorBody(page) {
  const toggle = page.locator('[data-testid="btn-toggle-editor"]').first();
  await toggle.waitFor({ state: 'attached', timeout: 10000 });
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
}

/** The rendered body and its visible panes, read from the DOM rather than React state. */
function paneBoxes(page) {
  return page.evaluate(() => {
    const bodyNode = document.querySelector('[data-testid="editor-panes"]');
    if (!bodyNode) return { body: null, panes: [] };
    const rect = bodyNode.getBoundingClientRect();
    // Body-relative, not viewport-relative: Playwright scrolls a pane into view before clicking it,
    // and a viewport coordinate captured before that click would be hundreds of pixels off.
    return {
      body: { x: 0, y: 0, w: rect.width, h: rect.height },
      panes: [...bodyNode.querySelectorAll('[data-pane]')]
        .filter((node) => node.getClientRects().length > 0)
        .map((node) => {
          const box = node.getBoundingClientRect();
          return {
            name: node.getAttribute('data-pane'),
            x: box.x - rect.x,
            y: box.y - rect.y,
            w: box.width,
            h: box.height,
          };
        }),
    };
  });
}

function paneByName(state, paneName) {
  const pane = state.panes.find((entry) => entry.name === paneName);
  assert.ok(pane, `the ${paneName} pane is missing from the rendered body`);
  return pane;
}

/** A swap must move the pane itself; a changed state label alone is not enough. */
function assertSameSlot(actual, expected, label, name, beforeHeight, afterHeight) {
  // The body is content-sized in a preset: a taller view arriving in a slot makes the body grow,
  // so the two body-controlled dimensions are compared as shares of its height.
  const share = (value, body) => (body > 0 ? value / body : value);
  assert.ok(
    Math.abs(actual.x - expected.x) <= 5 &&
      Math.abs(actual.w - expected.w) <= 5 &&
      Math.abs(share(actual.y, afterHeight) - share(expected.y, beforeHeight)) <= 0.04 &&
      Math.abs(share(actual.h, afterHeight) - share(expected.h, beforeHeight)) <= 0.04,
    `${name}: ${label} did not move into the expected slot; got ${JSON.stringify(actual)} ` +
      `instead of ${JSON.stringify(expected)} (body ${beforeHeight} -> ${afterHeight}px)`
  );
}

/** A token is a box only when it has a visible border and fill, not merely coloured text. */
function boxedTokenStyles(elements) {
  return elements.map((element) => {
    const style = getComputedStyle(element);
    const background = style.backgroundColor;
    const transparent = background === 'rgba(0, 0, 0, 0)' || background === 'transparent';
    return {
      background,
      borderWidth: parseFloat(style.borderTopWidth) || 0,
      radius: parseFloat(style.borderTopLeftRadius) || 0,
      boxed: !transparent && (parseFloat(style.borderTopLeftRadius) || 0) > 0,
    };
  });
}

/**
 * The lesson surface: aligned summary, goal in the micro lesson's token boxes, and Requirements as
 * its own colour-coded tab. The old goal was plain prose and the old pass conditions were a
 * bracketed list above the editor; both are visible here as a missing token or card.
 */
export async function auditLessonSurface(browser, baseUrl, name) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  await seedTourSeen(context);
  // The summary row's right side is the verified count. Seed the verdict before the first script
  // reads the stores: storing it after boot needs a reload, and that reload aborts the idle engine
  // import, which Firefox reports as a page error even though it belongs to the document being
  // replaced. This audit gets one document, so a returning learner is the first load.
  await context.addInitScript(() => {
    localStorage.setItem('mechalab_pyodide_verified_v1', JSON.stringify({ 'P.1': true }));
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  try {
    await page.goto(`${baseUrl}?lesson=P.1`, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForFunction(() => (document.getElementById('root')?.children.length ?? 0) > 0, {
      timeout: 20000,
    });
    await page.keyboard.press('Alt+1');
    await page.waitForFunction(
      () => document.querySelector('[data-layout]')?.getAttribute('data-layout') === 'study',
      undefined,
      { timeout: 10000 }
    );
    await page.getByTestId('lesson-list-card').waitFor({ state: 'visible', timeout: 10000 });
    await expandEditorBody(page);

    const summary = await page.getByTestId('lesson-list-summary').evaluate((row) => {
      const style = getComputedStyle(row);
      const rowBox = row.getBoundingClientRect();
      const kids = [...row.children]
        .filter((child) => child.getClientRects().length > 0)
        .map((child) => {
          const box = child.getBoundingClientRect();
          return {
            text: (child.textContent ?? '').trim(),
            left: box.left,
            right: box.right,
            center: box.top + box.height / 2,
          };
        });
      return {
        display: style.display,
        alignItems: style.alignItems,
        gap: parseFloat(style.gap) || 0,
        paddingLeft: parseFloat(style.paddingLeft),
        paddingTop: parseFloat(style.paddingTop),
        paddingBottom: parseFloat(style.paddingBottom),
        left: rowBox.left,
        right: rowBox.right,
        kids,
      };
    });
    assert.equal(summary.display, 'flex', `${name}: the lesson summary must be a flex row`);
    assert.equal(summary.alignItems, 'center', `${name}: the lesson summary must center its two sides`);
    assert.ok(summary.gap >= 7, `${name}: the lesson summary needs its 8px gap, got ${summary.gap}px`);
    assert.ok(
      Math.abs(summary.paddingLeft - 12) <= 1 &&
        Math.abs(summary.paddingTop - 8) <= 1 &&
        Math.abs(summary.paddingBottom - 4) <= 1,
      `${name}: the lesson summary padding changed: ${JSON.stringify(summary)}`
    );
    assert.equal(summary.kids.length, 2, `${name}: expected the Units and verified sides, got ${summary.kids.length}`);
    assert.ok(
      Math.abs(summary.kids[0].center - summary.kids[1].center) <= 1.5,
      `${name}: the lesson summary sides are not vertically aligned: ${JSON.stringify(summary.kids)}`
    );
    assert.ok(
      summary.kids[0].left >= summary.left + 10 && summary.kids[1].right <= summary.right - 10,
      `${name}: the lesson summary children spill past the padding`
    );

    const goal = page.getByTestId('editor-goal');
    await goal.waitFor({ state: 'visible', timeout: 10000 });
    const goalText = (await goal.innerText()).trim();
    assert.match(goalText, /goal/i, `${name}: the goal card must name itself`);
    assert.doesNotMatch(goalText, /`|\*\*/, `${name}: the goal must not expose raw markup`);
    assert.doesNotMatch(
      goalText,
      /The script runs without a Python error|Required end state/,
      `${name}: the goal card must not carry the Requirements list`
    );
    assert.equal(
      await goal.locator('.editor-requirement-card').count(),
      0,
      `${name}: requirement cards belong in their tab, not in the goal`
    );
    const goalTokens = await goal.locator('[data-token]').evaluateAll(boxedTokenStyles);
    const goalBoxes = goalTokens.filter((token) => token.boxed);
    assert.ok(goalBoxes.length >= 2, `${name}: the goal rendered ${goalBoxes.length} boxed variables`);
    // P.1's goal names four variables and nothing else, so its boxes share the palette's name hue.
    // What every box must have is the micro lessons' inline shape: a filled, rounded chip.
    assert.ok(
      goalBoxes.every((token) => token.radius >= 2),
      `${name}: every goal variable must be a rounded box: ${JSON.stringify(goalBoxes)}`
    );

    const requirementsTab = page.getByTestId('editor-tab-requirements');
    assert.equal(await requirementsTab.getAttribute('role'), 'tab', `${name}: Requirements must be a tab`);
    await requirementsTab.click();
    await page.getByTestId('editor-requirements').waitFor({ state: 'visible', timeout: 10000 });
    assert.equal(
      await requirementsTab.getAttribute('aria-selected'),
      'true',
      `${name}: the Requirements tab must report that it is open`
    );
    const requirements = await page.getByTestId('editor-requirements').evaluate((node) => {
      const cards = [...node.querySelectorAll('.editor-requirement-card')];
      return {
        cards: cards.length,
        tokens: [...node.querySelectorAll('[data-token]')].length,
        text: node.innerText,
        cardBorders: [...new Set(cards.map((card) => getComputedStyle(card).borderTopColor))],
      };
    });
    assert.equal(requirements.cards, 7, `${name}: P.1 must show all seven Requirements cards`);
    assert.ok(requirements.tokens >= 2, `${name}: Requirements rendered ${requirements.tokens} tokens`);
    assert.doesNotMatch(requirements.text, /\*\*|`/, `${name}: Requirements must not expose raw markup`);
    assert.ok(
      requirements.cardBorders.length >= 2,
      `${name}: the Requirements cards must keep their colour-coded edges`
    );
    const requirementTokens = await page
      .getByTestId('editor-requirements')
      .locator('[data-token]')
      .evaluateAll(boxedTokenStyles);
    const requirementBoxes = requirementTokens.filter((token) => token.boxed);
    assert.ok(
      requirementBoxes.length >= 2,
      `${name}: Requirements rendered ${requirementBoxes.length} boxed variables`
    );
    assert.ok(
      new Set(requirementBoxes.map((token) => token.background)).size >= 2,
      `${name}: Requirements must keep the micro lessons' colourful token boxes`
    );
    assert.equal(await goal.count(), 1, `${name}: the goal stays in the editor while Requirements is open`);
    assert.equal(pageErrors.length, 0, `${name}: lesson surface page errors: ${pageErrors.join(' | ')}`);

    console.log(
      `  ok ${name}: aligned lesson summary; ${goalBoxes.length} goal and ${requirementBoxes.length} ` +
        `requirement tokens in ${requirements.cards} colour-coded cards`
    );
  } finally {
    await context.close();
  }
}

/**
 * The reset chooser on the built bundle. Micro-learning is grouped by parent lesson, normal lessons
 * are one item per lesson, and both chosen lists must have their own working scrollbar. Resetting
 * P.1 proves the grouping is the unit the learner sees, not an all-or-nothing store clear.
 */
export async function auditResetChooser(browser, baseUrl, name) {
  const units = 18;
  const conceptsPerUnit = 2;
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  await seedTourSeen(context);
  // Seed before the first script reads the stores. Seeding after boot needs a reload, and that
  // reload can abort the idle audio-engine import; Firefox reports the abort as a page error even
  // though it belongs to the document being replaced. The reset chooser gets one document instead.
  await context.addInitScript(
    ({ units, conceptsPerUnit }) => {
      const verified = {};
      for (let index = 1; index <= units; index += 1) verified[`P.${index}`] = true;
      localStorage.setItem('mechalab_pyodide_verified_v1', JSON.stringify(verified));
      const concepts = {};
      for (let index = 1; index <= units; index += 1) {
        for (let concept = 1; concept <= conceptsPerUnit; concept += 1) {
          const conceptId = `P.${index}.seed${concept}`;
          concepts[conceptId] = {
            conceptId,
            revision: 1,
            mastery: 'learning',
            stale: false,
            skipEligible: false,
            successCount: 0,
            dueAt: null,
            lastReviewedAt: null,
            learnCompletedAt: 1000,
            diagnosticCorrect: 2,
            practiceCorrect: true,
          };
        }
      }
      localStorage.setItem(
        'mechalab_micro_progress_v1',
        JSON.stringify({ version: 1, revision: 1, updatedAt: 1000, concepts, events: [] })
      );
    },
    { units, conceptsPerUnit }
  );
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  try {
    await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForFunction(() => (document.getElementById('root')?.children.length ?? 0) > 0, {
      timeout: 20000,
    });

    await page.getByTestId('btn-open-reset').click();
    await page.getByTestId('reset-dialog').waitFor({ state: 'visible', timeout: 10000 });
    assert.match(await page.getByTestId('reset-count-lessons').innerText(), /18 verified/);
    assert.match(await page.getByTestId('reset-count-micro').innerText(), /18 lessons touched/);

    const openChooser = async (area) => {
      await page.getByTestId(`btn-expand-${area}`).click();
      const list = page.getByTestId(`reset-items-${area}`);
      await list.waitFor({ state: 'visible', timeout: 10000 });
      const data = await list.evaluate((node) => {
        const style = getComputedStyle(node);
        const labels = [...node.querySelectorAll(':scope > li')].map(
          (item) => (item.innerText || '').trim().split('\n')[0]
        );
        const rows = labels.length;
        const initial = node.scrollTop;
        node.scrollTop = node.scrollHeight;
        const moved = node.scrollTop;
        node.scrollTop = initial;
        // Playwright's Firefox reports a computed `scrollbar-width` of "none" even for a bare
        // element given `thin` inline, so the keyword alone cannot be read there. The authored
        // rule is still in the sheet; when the computed value is suppressed, prove the rule applies.
        const thinRule = (() => {
          for (const sheet of document.styleSheets) {
            let rules;
            try {
              rules = sheet.cssRules;
            } catch {
              continue;
            }
            for (const rule of rules) {
              if (!rule.style || !rule.selectorText) continue;
              const selectors = rule.selectorText.split(',').map((part) => part.trim());
              if (
                selectors.includes('.reset-item-scroll') &&
                rule.style.getPropertyValue('scrollbar-width') === 'thin'
              ) {
                return true;
              }
            }
          }
          return false;
        })();
        return {
          rows,
          labels,
          overflowY: style.overflowY,
          scrollbarWidth: style.scrollbarWidth,
          thinRule,
          scrollHeight: node.scrollHeight,
          clientHeight: node.clientHeight,
          moved,
        };
      });
      assert.equal(data.rows, units, `${name}: ${area} opened ${data.rows} rows, expected ${units}`);
      assert.equal(data.overflowY, 'scroll', `${name}: ${area} must own a scrollbar`);
      assert.ok(
        data.scrollbarWidth === 'thin' || (data.scrollbarWidth === 'none' && data.thinRule),
        `${name}: ${area} must keep the thin scrollbar style (computed ${data.scrollbarWidth}, ` +
          `authored rule ${data.thinRule ? 'present' : 'missing'})`
      );
      assert.ok(
        data.scrollHeight > data.clientHeight + 1,
        `${name}: ${area} rows do not overflow: ${data.scrollHeight}/${data.clientHeight}`
      );
      assert.ok(data.moved > 0, `${name}: ${area} could not scroll to its last row`);
      return data;
    };

    const lessons = await openChooser('lessons');
    assert.ok(
      lessons.labels.includes('P.1') && lessons.labels.includes('P.2'),
      `${name}: lesson rows are not lesson units`
    );
    const pressAgain = async (testId) => {
      const button = page.getByTestId(testId);
      await button.click();
      await page.waitForFunction(
        (id) => /Again\?/.test(document.querySelector(`[data-testid="${id}"]`)?.textContent ?? ''),
        testId,
        { timeout: 5000 }
      );
      await button.click();
    };
    await pressAgain('btn-reset-item-lessons-P-1');
    await page.waitForFunction(
      () => /17 verified/.test(document.querySelector('[data-testid="reset-count-lessons"]')?.textContent ?? ''),
      undefined,
      { timeout: 10000 }
    );
    const verified = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('mechalab_pyodide_verified_v1') ?? '{}')
    );
    assert.ok(!verified['P.1'], `${name}: resetting the P.1 lesson item left its flag behind`);
    assert.equal(verified['P.2'], true, `${name}: resetting P.1 erased P.2 as well`);

    await page.getByTestId('btn-expand-lessons').click();
    await page.getByTestId('reset-items-lessons').waitFor({ state: 'detached', timeout: 5000 });
    const micro = await openChooser('micro');
    assert.ok(
      micro.labels.includes('P.1') && micro.labels.includes('P.2'),
      `${name}: micro rows are not lesson units`
    );
    assert.match(await page.getByTestId('reset-items-micro').innerText(), /2 concepts in this lesson/);
    await pressAgain('btn-reset-item-micro-micro-P-1');
    await page.waitForFunction(
      () => /17 lessons touched/.test(document.querySelector('[data-testid="reset-count-micro"]')?.textContent ?? ''),
      undefined,
      { timeout: 10000 }
    );
    const microStore = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('mechalab_micro_progress_v1') ?? '{}')
    );
    const leftConcepts = Object.keys(microStore.concepts ?? {});
    assert.ok(
      !leftConcepts.some((conceptId) => conceptId.startsWith('P.1.')),
      `${name}: resetting the P.1 micro unit left its concepts behind`
    );
    assert.ok(
      leftConcepts.some((conceptId) => conceptId.startsWith('P.2.')),
      `${name}: resetting the P.1 micro unit erased P.2 as well`
    );
    assert.equal(pageErrors.length, 0, `${name}: reset chooser page errors: ${pageErrors.join(' | ')}`);

    console.log(
      `  ok ${name}: reset chooser groups ${units} normal lessons and ${units} micro units, ` +
        `each chooser scrolls, and resetting P.1 leaves P.2`
    );
  } finally {
    await context.close();
  }
}

/**
 * Swapping the first pane with the third, on both axes, and the screen-sized split ceiling. The
 * assertion reads rendered geometry, not the stored arrangement: the two panes must exchange slots.
 */
export async function auditPaneSwapsAndCapacity(browser, baseUrl, name) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  await seedTourSeen(context);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  const body = () => page.getByTestId('editor-panes');
  const waitForViews = (views) =>
    page.waitForFunction(
      (expected) => document.querySelector('[data-testid="editor-panes"]')?.getAttribute('data-views') === expected,
      views,
      { timeout: 10000 }
    );
  /** Drag a pane's header grip onto another pane; returns whether the target was marked mid-drag. */
  const dragPane = async (fromSlot, targetView) => {
    const handle = page.getByTestId(`pane-drag-${fromSlot + 1}`);
    await handle.waitFor({ state: 'visible', timeout: 10000 });
    // A bounded body can be taller than the viewport, so a full-height target pane's center may be
    // off-screen even while its top is visible. Scroll the page (not the pane's own scroller) so the
    // body's top is just below any sticky header, then aim near the target's top; the exchange is
    // slot-based, so any visible point inside the target is the same drop.
    await page.evaluate(() => {
      const body = document.querySelector('[data-testid="editor-panes"]');
      if (!body) return;
      const top = body.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: Math.max(0, top - 100), behavior: 'instant' });
    });
    await page.waitForTimeout(150);
    const from = await handle.boundingBox();
    const to = await page.locator(`[data-pane="${targetView}"]`).boundingBox();
    assert.ok(from && to, `${name}: the drag needs a visible grip and target pane`);
    const viewport = page.viewportSize();
    assert.ok(viewport, `${name}: the drag needs a viewport`);
    const targetX = to.x + to.width / 2;
    const targetY = Math.min(
      viewport.height - 12,
      Math.max(12, to.y + Math.min(to.height / 2, 80))
    );
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetX, targetY, { steps: 8 });
    const marked = await page.locator(`[data-pane="${targetView}"]`).getAttribute('data-pane-drop');
    await page.mouse.up();
    return marked;
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
    await page.getByTestId('pane-requirements').waitFor({ state: 'visible', timeout: 10000 });
    // The Requirements tab is a lazy boundary: measuring the body before its cards render records a
    // shorter pane than the one the swap is about to move.
    await page
      .locator('[data-testid="pane-requirements"] .editor-requirement-card')
      .first()
      .waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(300);
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
    assert.equal(await body().getAttribute('data-axis'), 'columns', `${name}: the first fixture must be a column split`);
    assert.equal(await body().getAttribute('data-views'), 'requirements,main,predict', `${name}: wrong starting slots`);

    const columnsBefore = await paneBoxes(page);
    const requirementsSlot = paneByName(columnsBefore, 'requirements');
    const predictSlot = paneByName(columnsBefore, 'predict');
    await page.locator('[data-pane="requirements"]').click();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="editor-panes"]')?.getAttribute('data-focus') === '0',
      undefined,
      { timeout: 5000 }
    );
    await page.getByTestId('select-pane-swap').selectOption('2');
    await waitForViews('predict,main,requirements');
    const columnsAfter = await paneBoxes(page);
    assertSameSlot(
      paneByName(columnsAfter, 'predict'),
      requirementsSlot,
      'the third column pane',
      name,
      columnsBefore.body.h,
      columnsAfter.body.h
    );
    assertSameSlot(
      paneByName(columnsAfter, 'requirements'),
      predictSlot,
      'the first column pane',
      name,
      columnsBefore.body.h,
      columnsAfter.body.h
    );
    assertSameSlot(
      paneByName(columnsAfter, 'main'),
      paneByName(columnsBefore, 'main'),
      'the untouched middle pane',
      name,
      columnsBefore.body.h,
      columnsAfter.body.h
    );

    // The header grip is the pointer path to the same exchange the menu just made: drag pane 1 onto
    // pane 3, then back, so the row fixture below starts from the slots it expects.
    assert.equal(
      await dragPane(0, 'requirements'),
      'true',
      `${name}: hovering a pane during a drag must mark it as the drop target`
    );
    await waitForViews('requirements,main,predict');
    await dragPane(0, 'predict');
    await waitForViews('predict,main,requirements');
    await page.getByTestId('pane-drag-1').waitFor({ state: 'visible', timeout: 10000 });

    await page.getByTestId('btn-pane-rows').click();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="editor-panes"]')?.getAttribute('data-axis') === 'rows',
      undefined,
      { timeout: 5000 }
    );
    await page.waitForTimeout(250);
    const rowsBefore = await paneBoxes(page);
    const topRow = paneByName(rowsBefore, 'predict');
    const bottomRow = paneByName(rowsBefore, 'requirements');
    assert.ok(topRow.y + topRow.h <= bottomRow.y + 2, `${name}: Predict must start in the top row`);
    await page.locator('[data-pane="predict"]').click();
    await page.getByTestId('select-pane-swap').selectOption('2');
    await waitForViews('requirements,main,predict');
    await page.waitForTimeout(250);
    const rowsAfter = await paneBoxes(page);
    // A content-sized body lets each stacked pane keep its own content height, so the row swap is
    // read as order and column, not as the pixel height the other view happened to have.
    const rowRequirements = paneByName(rowsAfter, 'requirements');
    const rowMain = paneByName(rowsAfter, 'main');
    const rowPredict = paneByName(rowsAfter, 'predict');
    assert.ok(
      rowRequirements.y < rowMain.y && rowMain.y < rowPredict.y,
      `${name}: a row swap must move Requirements to the top and Predict to the bottom ` +
        `(${[rowRequirements.y, rowMain.y, rowPredict.y].map((y) => Math.round(y)).join('/')})`
    );
    assert.ok(
      Math.abs(rowRequirements.x - rowPredict.x) <= 3 &&
        Math.abs(rowRequirements.w - rowPredict.w) <= 3,
      `${name}: the swapped rows must stay in one column`
    );

    assert.equal(
      await page.getByTestId('btn-pane-add').count(),
      1,
      `${name}: a 1440px screen with three panes must still offer a fourth`
    );
    await page.getByTestId('btn-pane-add').click();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="editor-panes"]')?.getAttribute('data-count') === '4',
      undefined,
      { timeout: 10000 }
    );
    assert.equal(await page.getByTestId('btn-pane-add').count(), 0, `${name}: 1440px must cap the body at four panes`);
    await page.getByTestId('btn-pane-close').click();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="editor-panes"]')?.getAttribute('data-count') === '1',
      undefined,
      { timeout: 10000 }
    );

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(350);
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
    assert.equal(await page.getByTestId('btn-pane-add').count(), 0, `${name}: 1280px must cap the body at three panes`);
    await page.setViewportSize({ width: 1440, height: 950 });
    await page.waitForTimeout(350);
    assert.equal(
      await page.getByTestId('btn-pane-add').count(),
      1,
      `${name}: growing back to 1440px must offer the fourth pane again`
    );
    assert.equal(pageErrors.length, 0, `${name}: pane swap page errors: ${pageErrors.join(' | ')}`);

    console.log(
      `  ok ${name}: first pane swapped with third on columns and rows; split ceiling follows 1440/1280`
    );
  } finally {
    await context.close();
  }
}

/**
 * Each pane's own placement control, on the built bundle.
 *
 * The default three-pane body is the mixed layout: one full-height column and a stack of two beside
 * it. Pane 3's chip can open a third column, which is measured as three full-height panes with equal
 * widths; the choice must survive a reload as state, not a class. Pane 2's chip then stacks pane 2
 * under pane 1 while pane 3 keeps its column, proving each boundary moves on its own.
 */
export async function auditPaneOrientations(browser, baseUrl, name) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  await seedTourSeen(context);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  const waitForOrientations = (expected) =>
    page.waitForFunction(
      (value) =>
        document.querySelector('[data-testid="editor-panes"]')?.getAttribute('data-orientations') ===
        value,
      expected,
      { timeout: 10000 }
    );
  const waitForCount = (count) =>
    page.waitForFunction(
      (value) =>
        document.querySelector('[data-testid="editor-panes"]')?.getAttribute('data-count') ===
        String(value),
      count,
      { timeout: 10000 }
    );
  const pane = (state, paneName) => paneByName(state, paneName);
  const restoreThreePanes = async () => {
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
    await waitForCount(3);
  };
  /**
   * Press a pane's placement chip.
   *
   * The chip is anchored to the top of its pane, and a pane moves while the body settles: the
   * Requirements cards arrive through a lazy boundary, and a three-column body is shorter than the
   * mixed one. Playwright scrolls the chip into view and then clicks the box it measured; on a slow
   * runner the body can move between the scroll and the press, and the click lands on the pane
   * instead (which only focuses it). Wait for a box the page has held for a frame and that sits
   * fully in the viewport, then press that one.
   */
  const pressPaneChip = async (testId) => {
    const chip = page.getByTestId(testId);
    await chip.scrollIntoViewIfNeeded();
    await page.waitForFunction(
      (id) => {
        const element = document.querySelector(`[data-testid="${id}"]`);
        if (!element) return false;
        const box = element.getBoundingClientRect();
        const previous = window.__paneChipBox;
        window.__paneChipBox = { id, x: box.x, y: box.y };
        return (
          previous?.id === id &&
          Math.abs(previous.x - box.x) < 1 &&
          Math.abs(previous.y - box.y) < 1 &&
          box.top >= 0 &&
          box.bottom <= window.innerHeight
        );
      },
      testId,
      { timeout: 10000 }
    );
    await chip.click();
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
    await page.getByTestId('pane-requirements').waitFor({ state: 'visible', timeout: 10000 });
    // The Requirements tab is a lazy boundary: measuring the body before its cards render records a
    // shorter pane than the one the swap is about to move.
    await page
      .locator('[data-testid="pane-requirements"] .editor-requirement-card')
      .first()
      .waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(300);
    await page.getByTestId('btn-pane-split').click();
    await waitForCount(2);
    await page.getByTestId('btn-pane-add').click();
    await waitForCount(3);
    const columnsButton = page.getByTestId('btn-pane-columns');
    if ((await columnsButton.getAttribute('aria-pressed')) !== 'true') await columnsButton.click();
    await waitForOrientations('columns,rows');
    await page.waitForTimeout(250);

    const mixed = await paneBoxes(page);
    const mixedRequirements = pane(mixed, 'requirements');
    const mixedMain = pane(mixed, 'main');
    assert.ok(
      mixedRequirements.h >= mixed.body.h - 5,
      `${name}: the default three-pane body must keep pane 1 full height ` +
        `(${mixedRequirements.h}px in ${mixed.body.h}px)`
    );
    assert.ok(
      mixedMain.x >= mixedRequirements.x + mixedRequirements.w - 3,
      `${name}: panes 2 and 3 must sit beside pane 1 in the mixed layout`
    );

    await pressPaneChip('btn-pane-orient-3-columns');
    await waitForOrientations('columns,columns');
    await page.waitForTimeout(250);
    const three = await paneBoxes(page);
    const threePanes = ['requirements', 'main', 'predict'].map((paneName) => pane(three, paneName));
    for (const entry of threePanes) {
      assert.ok(
        entry.h >= three.body.h - 5,
        `${name}: a three-column pane is ${entry.h}px in ${three.body.h}px; it must span the body`
      );
    }
    const tops = threePanes.map((entry) => entry.y);
    assert.ok(
      Math.max(...tops) - Math.min(...tops) <= 3,
      `${name}: three columns must share one row: ${JSON.stringify(tops)}`
    );
    for (const entry of threePanes) {
      const share = entry.w / three.body.w;
      assert.ok(
        share >= 0.27 && share <= 0.39,
        `${name}: a three-column pane takes ${(share * 100).toFixed(1)}% of the body, expected a third`
      );
    }
    assert.ok(
      threePanes[1].x > threePanes[0].x && threePanes[2].x > threePanes[1].x,
      `${name}: the three columns are not left to right`
    );
    assert.equal(
      await page.getByTestId('btn-pane-orient-3-columns').getAttribute('aria-pressed'),
      'true',
      `${name}: pane 3's chip must report its column placement`
    );
    assert.equal(
      await page.getByTestId('btn-pane-orient-3-rows').getAttribute('aria-pressed'),
      'false',
      `${name}: pane 3's chip must not report both placements`
    );

    // The placement is arrangement state: a reload must draw the same three columns.
    await page.reload({ waitUntil: 'networkidle', timeout: 45000 });
    await restoreThreePanes();
    await waitForOrientations('columns,columns');
    await page.waitForTimeout(250);
    const restored = await paneBoxes(page);
    const restoredPanes = ['requirements', 'main', 'predict'].map((paneName) => pane(restored, paneName));
    for (const entry of restoredPanes) {
      assert.ok(
        entry.h >= restored.body.h - 5,
        `${name}: the reload did not restore the three-column body (${entry.h}px of ${restored.body.h}px)`
      );
    }
    assert.ok(
      restoredPanes[1].x > restoredPanes[0].x && restoredPanes[2].x > restoredPanes[1].x,
      `${name}: the restored columns are not left to right`
    );

    // Pane 2 chooses to stack under pane 1; pane 3 keeps the column it opened.
    await pressPaneChip('btn-pane-orient-2-rows');
    await waitForOrientations('rows,columns');
    await page.waitForTimeout(250);
    const stacked = await paneBoxes(page);
    const stackRequirements = pane(stacked, 'requirements');
    const stackMain = pane(stacked, 'main');
    const stackPredict = pane(stacked, 'predict');
    assert.ok(
      stackPredict.h >= stacked.body.h - 5,
      `${name}: pane 3 must stay full height after pane 2 flips (${stackPredict.h}px)`
    );
    assert.ok(
      stackMain.y >= stackRequirements.y + stackRequirements.h - 3,
      `${name}: pane 2 must stack under pane 1 (${stackRequirements.y}+${stackRequirements.h} vs ${stackMain.y})`
    );
    assert.ok(
      Math.abs(stackRequirements.x - stackMain.x) <= 3,
      `${name}: the flipped pane 2 must share pane 1's column`
    );

    // Each chip sets one boundary back, and the whole-body control still stacks everything.
    await pressPaneChip('btn-pane-orient-2-columns');
    await waitForOrientations('columns,columns');
    await page.getByTestId('btn-pane-rows').click();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="editor-panes"]')?.getAttribute('data-axis') === 'rows',
      undefined,
      { timeout: 5000 }
    );
    await waitForOrientations('rows,rows');
    await page.waitForTimeout(250);
    const rows = await paneBoxes(page);
    const rowPanes = ['requirements', 'main', 'predict'].map((paneName) => pane(rows, paneName));
    assert.ok(
      rowPanes[1].y >= rowPanes[0].y + rowPanes[0].h - 3 &&
        rowPanes[2].y >= rowPanes[1].y + rowPanes[1].h - 3,
      `${name}: the rows control must stack every pane (${JSON.stringify(rowPanes.map((entry) => entry.y))})`
    );
    assert.equal(pageErrors.length, 0, `${name}: pane placement page errors: ${pageErrors.join(' | ')}`);

    console.log(
      `  ok ${name}: pane 3 opened a third column, pane 2 stacked alone under pane 1, ` +
        `and the three-column body survived a reload`
    );
  } finally {
    await context.close();
  }
}

/**
 * The pane area's bottom edge, on the built bundle.
 *
 * A bounded split gives the body a height floor, but the editor used to stop at its own 360px
 * theme cap, leaving a dead strip under it. The bottom grip resizes the whole body; reset returns
 * it to the floor. This measures the rendered CodeMirror box, not its wrapper: the test id is on
 * `.cm-content`, so `[data-editor="editor-main"] .cm-editor` is the node that has to reach the
 * bottom. The grip drag is a real pointer sequence, because an attribute alone would not prove the
 * border moves.
 */
export async function auditPaneBottomResize(browser, baseUrl, name) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await seedTourSeen(context);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  const read = () =>
    page.evaluate(() => {
      const rect = (node) => {
        if (!node) return null;
        const box = node.getBoundingClientRect();
        return { x: box.x, y: box.y, w: box.width, h: box.height, bottom: box.bottom };
      };
      const body = document.querySelector('[data-testid="editor-panes"]');
      return {
        body: rect(body),
        mainBody: rect(document.querySelector('[data-pane="main"] [data-pane-main-body]')),
        editor: rect(document.querySelector('[data-editor="editor-main"] .cm-editor')),
        bar: rect(document.querySelector('[data-testid="pane-divider-bottom"]')),
        reset: rect(document.querySelector('[data-testid="btn-pane-reset"]')),
        resized: Boolean(body?.hasAttribute('data-pane-resized')),
        split: body?.getAttribute('data-split'),
        bounded: body?.getAttribute('data-bounded'),
      };
    });

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
    const body = page.getByTestId('editor-panes');
    await body.waitFor({ state: 'visible', timeout: 10000 });
    if ((await body.getAttribute('data-split')) !== 'split') {
      await page.getByTestId('btn-pane-split').click();
    }
    await page.waitForFunction(
      () => document.querySelector('[data-testid="editor-panes"]')?.getAttribute('data-split') === 'split',
      undefined,
      { timeout: 10000 }
    );
    await page
      .locator('[data-editor="editor-main"] .cm-editor')
      .waitFor({ state: 'visible', timeout: 20000 });
    await page.getByTestId('pane-divider-bottom').waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(250);

    const before = await read();
    assert.ok(before.body && before.editor && before.mainBody, `${name}: the split body or its editor is missing`);
    assert.equal(before.bounded, 'true', `${name}: the P.6 body must be a bounded preset`);
    assert.equal(before.resized, false, `${name}: a fresh body must not start resized`);
    assert.ok(before.bar && before.bar.h > 0 && before.bar.h <= 16, `${name}: the bottom grip is not on the body edge`);
    assert.ok(before.reset && before.reset.h >= 12, `${name}: the bottom bar has no reset control`);
    // The editor's content node used to stop at 360px while the pane went on below it.
    assert.ok(
      Math.abs(before.editor.bottom - before.body.bottom) <= 2 &&
        Math.abs(before.editor.bottom - before.mainBody.bottom) <= 2,
      `${name}: the editor leaves a gap under it (editor ${before.editor.bottom.toFixed(1)}, ` +
        `body ${before.body.bottom.toFixed(1)}, pane ${before.mainBody.bottom.toFixed(1)})`
    );
    assert.ok(
      before.editor.h >= before.body.h - 4,
      `${name}: the editor is ${before.editor.h.toFixed(1)}px in a ${before.body.h.toFixed(1)}px body`
    );

    /**
     * Press the bottom grip at a box the page has held for a frame, then drag it up.
     *
     * The body can be taller than the viewport, so the grip starts below the fold. Center it with an
     * instant scroll: the page uses smooth scrolling, and coordinates read during that motion point
     * at where the bar used to be. Even after the scroll the panes can settle late, and a press on
     * the box measured before that lands on the editor instead of the grip.
     */
    const dragBottomGrip = async (travel) => {
      await page.evaluate(() => {
        document
          .querySelector('[data-testid="pane-divider-bottom"]')
          ?.scrollIntoView({ block: 'center', behavior: 'instant' });
      });
      await page.waitForFunction(
        () => {
          const element = document.querySelector('[data-testid="pane-divider-bottom"]');
          if (!element) return false;
          const box = element.getBoundingClientRect();
          const previous = window.__gripBox;
          window.__gripBox = { x: box.x, y: box.y };
          return (
            previous !== undefined &&
            Math.abs(previous.x - box.x) < 1 &&
            Math.abs(previous.y - box.y) < 1 &&
            box.top >= 0 &&
            box.bottom <= window.innerHeight
          );
        },
        undefined,
        { timeout: 10000 }
      );
      // A transient overlay (a toast, the split tip) can sit over part of the grip on a loaded runner,
      // and it hides the point being dragged from rather than the grip. Hover the row first, then take
      // the first point along it where the divider really is the topmost thing: a 691 px grip is still
      // grabbable with a card over its middle. The check fails only when no point along it is free, and
      // names what is over the centre when it does.
      //
      // Every poll re-reads the rect rather than trusting one boundingBox(): on a loaded runner a lazy
      // chunk or a font can still settle after the stability wait above and scroll the page, which
      // moves the grip out from under coordinates measured a moment earlier (Run 657 lost the press
      // to a CodeMirror line sitting exactly where the grip had been). A moved-away grip is scrolled
      // back and re-measured; the point that is returned is one this poll hit-tested.
      const measure = () =>
        page.evaluate(() => {
          const element = document.querySelector('[data-testid="pane-divider-bottom"]');
          if (!element) return null;
          const box = element.getBoundingClientRect();
          if (box.width <= 0 || box.height <= 0) return null;
          if (box.top < 0 || box.bottom > window.innerHeight) {
            element.scrollIntoView({ block: 'end', behavior: 'instant' });
            return null;
          }
          return { left: box.left, right: box.right, py: box.top + box.height / 2 };
        });
      await measure().then((box) => box && page.mouse.move((box.left + box.right) / 2, box.py));
      const point = await page
        .waitForFunction(
          () => {
            const element = document.querySelector('[data-testid="pane-divider-bottom"]');
            if (!element) return null;
            const box = element.getBoundingClientRect();
            if (box.width <= 0 || box.height <= 0) return null;
            if (box.top < 0 || box.bottom > window.innerHeight) {
              element.scrollIntoView({ block: 'end', behavior: 'instant' });
              return null;
            }
            const py = box.top + box.height / 2;
            for (let px = box.left + 8; px <= box.right - 8; px += 16) {
              const hit = document.elementFromPoint(px, py);
              if (hit?.closest('[data-testid="pane-divider-bottom"]')) return { px, py };
            }
            return null;
          },
          undefined,
          { timeout: 15000, polling: 100 }
        )
        .then((handle) => handle.jsonValue())
        .catch(() => null);
      if (!point) {
        const blocker = await page.evaluate(() => {
          const element = document.querySelector('[data-testid="pane-divider-bottom"]');
          if (!element) return { box: null, blocked: 'no grip in the document' };
          const box = element.getBoundingClientRect();
          const centre = document.elementFromPoint(
            box.left + box.width / 2,
            box.top + box.height / 2
          );
          if (!centre) return { box, blocked: 'nothing' };
          const testid = centre.getAttribute('data-testid');
          // A bare wrapper still has to be identifiable in the failure, so the class list is the name.
          const label = testid ?? (centre.getAttribute('class') ?? '').slice(0, 60);
          return {
            box: { x: box.x, y: box.y, width: box.width, height: box.height },
            blocked: `${centre.tagName}[${label}]`,
          };
        });
        assert.fail(
          `${name}: no point along the bottom grip is the topmost element; its centre at ` +
            `(${Math.round((blocker.box?.x ?? 0) + (blocker.box?.width ?? 0) / 2)}, ` +
            `${Math.round((blocker.box?.y ?? 0) + (blocker.box?.height ?? 0) / 2)}) hits ` +
            `${blocker.blocked} (box ${JSON.stringify(blocker.box)})`
        );
      }
      const gripX = point.px;
      await page.mouse.move(gripX, point.py);
      await page.mouse.down();
      await page.mouse.move(gripX, point.py - travel, { steps: 10 });
      await page.mouse.up();
    };
    const resizedFlag = () =>
      page.evaluate(() =>
        document.querySelector('[data-testid="editor-panes"]')?.hasAttribute('data-pane-resized')
      );
    await dragBottomGrip(90);
    // A slow runner can lose the press to a scroll that begins between the hit test and the drag.
    // One re-press after a fresh measurement is the driver retrying its gesture, not a weaker check:
    // every assertion below still grades the body the drag produced.
    if (!(await resizedFlag())) {
      await page.waitForTimeout(400);
      await dragBottomGrip(90);
    }
    await page.waitForFunction(
      () => document.querySelector('[data-testid="editor-panes"]')?.hasAttribute('data-pane-resized'),
      undefined,
      { timeout: 5000 }
    );
    const resized = await read();
    assert.equal(resized.resized, true, `${name}: dragging the bottom edge did not mark the body resized`);
    // The page scrolls while the body shrinks under the pointer, so the rendered delta is smaller
    // than the pointer travel. A third of the drag is still a real move, not a rounding wobble.
    assert.ok(
      resized.body.h <= before.body.h - 30,
      `${name}: the drag did not shrink the pane area (${before.body.h.toFixed(1)} -> ${resized.body.h.toFixed(1)})`
    );
    assert.ok(
      resized.editor && Math.abs(resized.editor.bottom - resized.body.bottom) <= 2,
      `${name}: the editor stopped filling the resized body`
    );

    await page.getByTestId('btn-pane-reset').click();
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="editor-panes"]')?.hasAttribute('data-pane-resized'),
      undefined,
      { timeout: 5000 }
    );
    const reset = await read();
    assert.equal(reset.resized, false, `${name}: reset left the resize flag behind`);
    // The natural height is content- and scroll-dependent, so reset must grow back from the
    // dragged height and land near the default, not reproduce the pre-drag pixel exactly.
    assert.ok(
      reset.body.h > resized.body.h + 30 &&
        Math.abs(reset.body.h - before.body.h) <= 80,
      `${name}: reset returned ${reset.body.h.toFixed(1)}px (dragged ${resized.body.h.toFixed(1)}, ` +
        `default ${before.body.h.toFixed(1)})`
    );
    assert.ok(
      reset.editor && Math.abs(reset.editor.bottom - reset.body.bottom) <= 2,
      `${name}: the editor stopped filling the body after reset`
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid="pane-divider-bottom"]').length === 0,
      undefined,
      { timeout: 5000 }
    );
    assert.equal(pageErrors.length, 0, `${name}: bottom resize page errors: ${pageErrors.join(' | ')}`);

    console.log(
      `  ok ${name}: the editor fills the ${Math.round(before.body.h)}px body, the bottom grip resized it, ` +
        `and reset restored it`
    );
  } finally {
    await context.close();
  }
}
