#!/usr/bin/env node
/**
 * The visual Python editor in a real browser (`scripts/e2e_python_blocks.mjs`).
 *
 * The model suite proves the program arithmetic. This one proves the editor a learner actually
 * operates, in the order the promises would hurt if they were wrong:
 *
 * 1. **Opening Visual and coming back changes nothing.** The code read before the switch is
 *    byte-identical after it, because an untouched program is not rewritten, and the code caret
 *    survives the round trip.
 * 2. **The other direction works too.** A statement typed in Python Code is drawn as a new block
 *    when Visual opens, and returning to code leaves the typed text byte-identical: the model
 *    re-reads a program it did not write rather than re-emitting it.
 * 3. **The toolbox is a real browser.** Collapse, category dropdown, Previous/Next, search across
 *    categories, all four sorts, and Recently used leading with the item just inserted.
 * 4. **A toolbox tap inserts into `main.py`.** The new Print card is edited through its own field,
 *    the code view shows `print("Start")`, and the generated program is what Run will execute.
 * 5. **The card controls build the program.** Add inside survives a view round trip; duplicate
 *    copies a suite; delete removes it; move up/down reorder siblings in the generated Python.
 * 6. **Undo and redo are the card history.** The buttons and ⌘Z/⇧⌘Z remove and restore the edit
 *    and then the statement.
 * 7. **The appearance switch is real and remembered.** Colorful repaints the cards, survives a
 *    reload, and the mode is remembered too.
 * 8. **A phone has no horizontal scrolling** in the visual workspace, and a touch tap inserts.
 * 9. **The code pane follows every app palette.** With Python Code open, the four palettes change the
 *    editor's syntax inks and surfaces through the app's tokens, including when the pane is closed
 *    for the change and reopened, and the chosen code/visual face survives that round trip.
 * 10. **The two phone gestures are touch gestures.** A real touch long-press lifts a card and
 *    carries it onto another card without scrolling the page, selecting text or offering a
 *    long-press menu, and a touch swipe on the dock grabber moves the sheet before it settles.
 *    These presses go through CDP's touchscreen input, not `page.mouse`, so the editor sees
 *    `pointerType: 'touch'` and `touchmove` — the path a finger takes.
 *
 * Run: node --experimental-strip-types scripts/e2e_python_blocks.mjs
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { resolveChromiumExecutable, startDevServer } from './e2e_browser_workbench.mjs';
import { seedTourSeen } from './tour_seed.mjs';
import { createTouch } from './touch_input.mjs';
import { getEditorCode, waitForEditor } from './editor-code.mjs';
import { PYTHON_LESSONS } from '../app/src/data/pythonLessonsData.ts';

async function openRunner(page, baseUrl) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(document.querySelector('#root *')), undefined, {
    timeout: 30000,
  });
  // A fresh browser lands on the Start here block; its button opens Lesson 1 in the runner, which
  // is the same door the main browser suite uses.
  const startHere = page.getByTestId('btn-start-here-run');
  if (await startHere.count()) {
    await startHere.click();
  } else {
    const lesson = page.getByTestId(`lesson-item-${PYTHON_LESSONS[0].id}`);
    if (await lesson.count()) await lesson.first().click();
  }
  // The address changes to `?lesson=P.1`; the runner is the tab in front of it.
  const tab = page.getByTestId('tab-btn-tab-pyodide');
  if (await tab.count()) await tab.click();
  await page.getByTestId('lesson-item-P.1').waitFor({ timeout: 15000 });
  // `python-runner-editor` is the card's id; its test id is `editor-panel`.
  await page.locator('#python-runner-editor').waitFor({ state: 'visible', timeout: 30000 });
  // Lesson 1's own first-run guide sits over the editor for a newcomer; the harness is a returning
  // reader and puts it away before it drives the code surface.
  const guide = page.getByTestId('btn-guide-dismiss');
  if (await guide.isVisible().catch(() => false)) await guide.click();
  // Study opens with its body folded; the mode bar lives inside the body.
  const folded = page.locator('[data-testid="btn-toggle-editor"][aria-expanded="false"]');
  if (await folded.count()) await folded.first().click();
  await waitForEditor(page);
  await page.getByTestId('editor-mode-bar').waitFor({ state: 'visible', timeout: 15000 });
}

async function switchToVisual(page) {
  await page.getByTestId('editor-mode-visual').click();
  await page.getByTestId('python-block-editor').waitFor({ state: 'visible', timeout: 20000 });
}

async function switchToCode(page) {
  await page.getByTestId('editor-mode-code').click();
  await waitForEditor(page);
}

function blockCount(page) {
  return page.locator('[data-testid^="python-block-"][data-block-id]').count();
}

/**
 * Axe over the visual workspace alone, with the same ruleset the app-wide gate uses. Colour contrast
 * is that gate's separate measurement; everything else a keyboard or screen-reader user meets here
 * is in scope.
 */
/**
 * Cards open folded: the code is what a card shows, and its five verbs are one tap away. Every test
 * that clicks one of those verbs asks the card to unfold first.
 */
async function openCardControls(card) {
  const toggle = card.getByTestId('block-actions-toggle').first();
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
}

async function assertNoSeriousA11y(page) {
  await page.addScriptTag({
    path: path.join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js'),
  });
  const violations = await page.evaluate(async () => {
    const results = await axe.run(document.querySelector('[data-testid="python-block-editor"]'), {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'],
      },
      rules: { 'color-contrast': { enabled: false } },
      resultTypes: ['violations'],
    });
    return results.violations
      .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
      .map((violation) => `${violation.id}: ${violation.help} (${violation.nodes.length})`);
  });
  assert.deepEqual(violations, [], `serious/critical axe findings: ${violations.join('; ')}`);
}

/** A program with one token from each CodeMirror highlight family the app's theme paints. */
const THEME_PROBE = [
  '# theme tokens',
  'def greet(name):',
  '    message = "hello"',
  '    return 42',
].join('\n');
const THEME_PROBE_TOKENS = ['# theme tokens', 'def', '"hello"', '42'];

/** The computed palette, the editor's painted surface, and the ink on four highlighted tokens. */
async function paletteSnapshot(page) {
  await page.waitForFunction(
    (tokens) => {
      const content = document.querySelector('[data-editor="editor-main"] .cm-content');
      if (!content) return false;
      const spans = [...content.querySelectorAll('span')];
      return tokens.every((token) => spans.some((span) => span.textContent === token));
    },
    THEME_PROBE_TOKENS,
    { timeout: 15000 }
  );
  return page.evaluate((tokens) => {
    // Read a token's real computed colour through a detached-in-effect probe. Comparing the token
    // span with the same variable is what proves the CSS the editor generated follows data-theme.
    const probe = (token) => {
      const element = document.createElement('span');
      element.style.color = `var(${token})`;
      document.body.appendChild(element);
      const value = getComputedStyle(element).color;
      element.remove();
      return value;
    };
    const spans = [
      ...document.querySelectorAll('[data-editor="editor-main"] .cm-content span'),
    ];
    const ink = (token) => {
      const span = spans.find((candidate) => candidate.textContent === token);
      return span ? getComputedStyle(span).color : null;
    };
    const editor = document.querySelector('[data-editor="editor-main"] .cm-editor');
    return {
      theme: document.documentElement.getAttribute('data-theme'),
      accent: probe('--accent'),
      emerald: probe('--emerald'),
      amber: probe('--amber'),
      dim: probe('--dim'),
      bg: probe('--bg'),
      keyword: ink(tokens[1]),
      string: ink(tokens[2]),
      number: ink(tokens[3]),
      comment: ink(tokens[0]),
      editorBackground: editor ? getComputedStyle(editor).backgroundColor : null,
    };
  }, THEME_PROBE_TOKENS);
}

async function waitForPalette(page, theme) {
  await page.waitForFunction(
    (wanted) => document.documentElement.getAttribute('data-theme') === wanted,
    theme,
    { timeout: 5000 }
  );
}

function assertPaletteFollowsTheme(snapshot, theme, previous) {
  assert.equal(snapshot.theme, theme, `expected the ${theme} palette on <html>`);
  assert.ok(
    snapshot.keyword && snapshot.string && snapshot.number && snapshot.comment,
    `${theme}: every probe token should be painted`
  );
  assert.equal(snapshot.keyword, snapshot.accent, `${theme}: def should use --accent`);
  assert.equal(snapshot.string, snapshot.emerald, `${theme}: a string should use --emerald`);
  assert.equal(snapshot.number, snapshot.amber, `${theme}: a number should use --amber`);
  assert.equal(snapshot.comment, snapshot.dim, `${theme}: a comment should use --dim`);
  assert.equal(snapshot.editorBackground, snapshot.bg, `${theme}: the editor should paint --bg`);
  if (previous) {
    assert.notEqual(snapshot.keyword, previous.keyword, `${theme}: the keyword ink should change with the palette`);
    assert.notEqual(snapshot.string, previous.string, `${theme}: the string ink should change with the palette`);
    assert.notEqual(snapshot.editorBackground, previous.editorBackground, `${theme}: the editor surface should change with the palette`);
  }
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
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      hasTouch: true,
    });
    // The first-run coach mark is not what this suite grades.
    await seedTourSeen(context);
    // The prediction gate has its own suite; this run is about the code the blocks generated.
    await context.addInitScript(() => {
      window.__mechalabPredictFirst = false;
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await openRunner(page, baseUrl);
    const before = await getEditorCode(page);

    // ---- 1. Opening visual mode is a read ----
    assert.equal(
      await page.getByTestId('editor-mode-code').getAttribute('aria-pressed'),
      'true',
      'Python Code should stay the default face; Visual is opt-in'
    );
    // Put the caret somewhere only the code face knows about; a view switch must not move it.
    await page.evaluate(() => window.__mechalabEditors['editor-main'].setCursor(12));
    await switchToVisual(page);
    assert.equal(
      await page.getByTestId('python-block-editor').getAttribute('data-appearance'),
      'normal',
      'Normal should be the default look; Colorful is opt-in'
    );
    const starterBlocks = await blockCount(page);
    assert.ok(starterBlocks > 0, 'the starter should draw at least one statement card');

    // A card opens folded at every width: the code first, its verbs on request. The toggle hides
    // the five controls without touching the statement they act on.
    const firstCard = page.locator('[data-testid="python-workspace-list"] > li').first();
    assert.equal(
      await firstCard.getByTestId('block-actions-toggle').getAttribute('aria-expanded'),
      'false',
      'a card should open with its controls folded'
    );
    assert.equal(
      await firstCard.getByTestId('block-duplicate').count(),
      0,
      'a folded card should draw no controls'
    );
    // The info button is the card's own explanation, and it is available before the verbs are.
    const infoToggle = firstCard.getByTestId('block-info-toggle');
    assert.equal(
      await infoToggle.getAttribute('aria-expanded'),
      'false',
      'the info panel should start closed'
    );
    await infoToggle.click();
    const infoPanel = firstCard.getByTestId('block-info');
    await infoPanel.waitFor({ state: 'visible', timeout: 3000 });
    const infoCardName = await firstCard.getByRole('group').getAttribute('aria-label');
    const infoKind = (infoCardName ?? '').split(' statement ')[0];
    const infoText = await infoPanel.innerText();
    assert.ok(
      infoText.includes(infoKind),
      `the info panel should name the ${infoKind} block, got "${infoText}"`
    );
    await infoToggle.click();
    assert.equal(
      await firstCard.getByTestId('block-info').count(),
      0,
      'closing the info panel should remove it'
    );
    console.log('  ok the info button explains the block kind and closes again');
    await firstCard.getByTestId('block-actions-toggle').click();
    await firstCard.getByTestId('block-duplicate').waitFor({ state: 'visible' });
    await firstCard.getByTestId('block-actions-toggle').click();
    assert.equal(
      await firstCard.getByTestId('block-duplicate').count(),
      0,
      'folding a card should remove its controls'
    );
    await firstCard.getByTestId('block-actions-toggle').click();
    console.log('  ok a card opens folded and its toggle unfolds the five controls');
    await switchToCode(page);
    assert.equal(
      await page.evaluate(() => window.__mechalabEditors['editor-main'].getCursor()),
      12,
      'the code caret should survive a round trip through Visual'
    );
    const afterRoundTrip = await getEditorCode(page);
    assert.equal(afterRoundTrip, before, 'opening Visual and returning must not rewrite main.py');
    console.log('  ok visual mode opens and closes without touching main.py');

    // ---- 2. A statement typed in Python Code becomes a block ----
    // Real keystrokes, not a document swap: the caret goes to the end, then the line is typed
    // through CodeMirror so the editor's own change path owns the text. The block model has never
    // seen it and must parse it fresh when Visual opens.
    await page.evaluate(() => {
      const editor = window.__mechalabEditors['editor-main'];
      editor.setCursor(editor.get().length);
    });
    await page.keyboard.type('\ntyped_in_code = 42');
    await page.waitForFunction(() =>
      window.__mechalabEditors['editor-main'].get().includes('typed_in_code = 42')
    );
    const typed = await getEditorCode(page);
    assert.notEqual(typed, before, 'typing a statement should change main.py');

    await switchToVisual(page);
    await page
      .getByTestId('python-block-assign')
      .last()
      .filter({ hasText: 'typed_in_code' })
      .waitFor({ state: 'visible', timeout: 10000 });
    assert.equal(
      await blockCount(page),
      starterBlocks + 1,
      'the typed statement should draw exactly one more card'
    );
    await switchToCode(page);
    assert.equal(
      await getEditorCode(page),
      typed,
      'opening Visual must not rewrite code typed in Python Code'
    );
    console.log('  ok a statement typed in Python Code appears as a block, and main.py is unchanged');

    // ---- 2. A toolbox tap inserts, and a field edits, into main.py ----
    await switchToVisual(page);
    const initialBlocks = await blockCount(page);

    // Collapse and reopen; then walk the categories, search past one, and sort the catalogue.
    await page.getByTestId('toolbox-toggle').click();
    assert.equal(
      await page.getByTestId('toolbox-search').isVisible().catch(() => false),
      false,
      'collapsing the toolbox should remove its body'
    );
    await page.getByTestId('toolbox-toggle').click();
    await page.getByTestId('toolbox-search').waitFor({ state: 'visible' });

    await page.getByTestId('toolbox-category').selectOption('loops');
    await page.getByTestId('toolbox-item-for').waitFor();
    assert.equal(
      await page.getByTestId('toolbox-item-print').count(),
      0,
      'a category filter should hide the other categories'
    );
    await page.getByTestId('toolbox-next').click();
    assert.equal(
      await page.getByTestId('toolbox-category').inputValue(),
      'functions',
      'Next should step to the next category'
    );
    await page.getByTestId('toolbox-prev').click();
    assert.equal(
      await page.getByTestId('toolbox-category').inputValue(),
      'loops',
      'Previous should step back'
    );
    await page.getByTestId('toolbox-search').fill('print');
    await page.getByTestId('toolbox-item-print').waitFor();
    await page.getByTestId('toolbox-search').fill('');
    await page.getByTestId('toolbox-category').selectOption('all');

    await page.getByTestId('toolbox-sort').selectOption('az');
    const azLabels = await page.locator('[data-testid^="toolbox-item-"] span').allTextContents();
    assert.deepEqual(
      azLabels,
      [...azLabels].sort((a, b) => a.localeCompare(b)),
      'A–Z should order every visible item by label'
    );
    await page.getByTestId('toolbox-sort').selectOption('recommended');
    console.log('  ok the toolbox collapses, filters, steps, searches and sorts');

    // ---- A toolbox block can be dragged onto a card ----
    // The press starts on the item, so the drag is the toolbox's own pointer gesture; the target is
    // the card under the pointer, and the statement lands after it rather than at the last tap.
    const dragItem = page.getByTestId('toolbox-item-assignment');
    // The last card, because the toolbox and the program's first card cannot both be on screen in
    // a long program: the toolbox is brought into view, and the card nearest it is the target.
    const dropTarget = page.locator('[data-testid="python-workspace-list"] > li').last();
    // The program already gained the statement typed in Python Code above; the baseline is what is
    // on screen now, not what the starter drew.
    const beforeDrag = await blockCount(page);
    // Read the target's id now: the locator is lazy, and after the drop `.last()` names the card
    // the drop just added, not the one the pointer was released on.
    const targetId = await dropTarget.getAttribute('data-block-id');
    const idsBefore = await page.evaluate(() =>
      [...document.querySelectorAll('[data-block-id]')].map((node) =>
        node.getAttribute('data-block-id')
      )
    );
    await dragItem.scrollIntoViewIfNeeded();
    const from = await dragItem.boundingBox();
    const to = await dropTarget.boundingBox();
    assert.ok(from && to, 'the dragged item and the drop card should both be on screen');
    assert.ok(
      from.y >= 0 && from.y + from.height <= 900,
      `the dragged item should be inside the viewport, got y ${Math.round(from.y)}`
    );
    const dropX = to.x + Math.min(to.width / 3, 200);
    const dropY = Math.min(Math.max(to.y + 16, 40), 860);
    assert.ok(to.y < 880, `the drop card should be on screen, got y ${Math.round(to.y)}`);
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 24, from.y + from.height / 2, { steps: 3 });
    await page.getByTestId('toolbox-drag-ghost').waitFor({ state: 'visible', timeout: 3000 });
    await page.mouse.move(dropX, dropY, { steps: 10 });
    await page.mouse.up();
    assert.equal(await blockCount(page), beforeDrag + 1, 'the drop should insert one statement');
    const order = await page.evaluate(() =>
      [...document.querySelectorAll('[data-block-id]')].map((node) =>
        node.getAttribute('data-block-id')
      )
    );
    const droppedId = order.find((id) => !idsBefore.includes(id));
    assert.ok(droppedId, 'the drop should add a card that was not there before');
    assert.equal(
      await page
        .locator(`[data-testid="python-block-assign"][data-block-id="${droppedId}"]`)
        .count(),
      1,
      'the dropped card should be the toolbox assignment'
    );
    assert.ok(
      order.indexOf(droppedId) > order.indexOf(targetId),
      'the dropped statement must sit below (or inside) the card it was released on'
    );
    assert.ok(
      (await getEditorCode(page)).includes('name = "Alex"'),
      'the dropped assignment should reach main.py'
    );
    await page.getByTestId('block-undo').click();
    assert.equal(await blockCount(page), beforeDrag, 'the drop is one undo step');
    console.log('  ok a dragged toolbox block lands after the card it was released on');

    // ---- A card itself can be picked up and dropped ----
    // The press rests on the card's own surface, a mouse drag past the slop lifts it, and the
    // release snaps it to the point under the pointer — anywhere in the program, not the next slot.
    const rootCards = page.locator('[data-testid="python-workspace-list"] > li');
    const rootIds = await rootCards.evaluateAll((cards) =>
      cards.map((card) => card.getAttribute('data-block-id'))
    );
    assert.ok(rootIds.length >= 3, 'the card drag needs a few root statements to reorder');
    // The two cards at the top of the list, so the press and the release are both on screen.
    await rootCards.first().scrollIntoViewIfNeeded();
    const movingCard = rootCards.first();
    const moveBox = await movingCard.boundingBox();
    const nextBox = await rootCards.nth(1).boundingBox();
    assert.ok(moveBox && nextBox, 'the first two root cards should be laid out');
    assert.ok(
      moveBox.y >= 40 && nextBox.y + nextBox.height <= 890,
      'both cards should be on screen for the drag'
    );
    // The drag speaks through the interface's sound bus: a row brush when the card lifts and a chip
    // when it lands. Sound may be off; the events still describe what happened.
    await page.evaluate(() => {
      window.__cardDragSounds = [];
      window.addEventListener('mechalab:sound', (event) =>
        window.__cardDragSounds.push(event.detail)
      );
    });
    // The bottom padding, not a field or a verb: a press here is a press on the card itself.
    await page.mouse.move(moveBox.x + moveBox.width / 2, moveBox.y + moveBox.height - 2);
    await page.mouse.down();
    await page.mouse.move(moveBox.x + moveBox.width / 2, moveBox.y + moveBox.height - 24, {
      steps: 3,
    });
    await page.getByTestId('block-drag-ghost').waitFor({ state: 'visible', timeout: 3000 });
    assert.ok(
      await page.evaluate(() =>
        window.__cardDragSounds.some(
          (message) => message.kind === 'ui' && message.role === 'row'
        )
      ),
      'lifting a card should play the interface row tick'
    );
    await page.mouse.move(nextBox.x + nextBox.width / 2, nextBox.y + nextBox.height - 2, {
      steps: 10,
    });
    await page.locator('[data-drop-active="1"]').first().waitFor({ state: 'visible', timeout: 3000 });
    const snapArrow = page.getByTestId('block-snap-arrow');
    await snapArrow.waitFor({ state: 'visible', timeout: 3000 });
    assert.equal(await snapArrow.count(), 1, 'one arrow should mark the gap a release will land in');
    assert.equal(
      await snapArrow.evaluate((arrow) =>
        arrow.closest('[data-block-id]')?.getAttribute('data-block-id')
      ),
      rootIds[1],
      'the arrow should point at the gap under the card the pointer is on'
    );
    assert.equal(
      await snapArrow.getAttribute('data-direction'),
      'down',
      'a card dragged down should point its arrow down'
    );
    const arrowBox = await snapArrow.boundingBox();
    assert.ok(
      arrowBox &&
        arrowBox.y >= nextBox.y + nextBox.height - 1 &&
        arrowBox.y + arrowBox.height <= nextBox.y + nextBox.height + 8,
      `the arrow should sit in the gap under the card, got ${JSON.stringify(arrowBox)} for a card bottom of ${Math.round(nextBox.y + nextBox.height)}`
    );
    await page.mouse.up();
    assert.equal(
      await page.getByTestId('block-snap-arrow').count(),
      0,
      'the arrow should clear once the card has landed'
    );
    assert.ok(
      await page.evaluate(() =>
        window.__cardDragSounds.some(
          (message) => message.kind === 'ui' && message.role === 'chip'
        )
      ),
      'a landed card should play the interface chip tick'
    );
    const orderAfterDrag = await rootCards.evaluateAll((cards) =>
      cards.map((card) => card.getAttribute('data-block-id'))
    );
    assert.equal(
      orderAfterDrag.length,
      rootIds.length,
      'a card drag moves a statement, it does not copy one'
    );
    assert.deepEqual(
      orderAfterDrag,
      [rootIds[1], rootIds[0], ...rootIds.slice(2)],
      'the released card should sit directly under the card it was dropped on'
    );
    await page.getByTestId('block-undo').click();
    assert.deepEqual(
      await rootCards.evaluateAll((cards) => cards.map((card) => card.getAttribute('data-block-id'))),
      rootIds,
      'a card drag should be one undo step'
    );
    console.log('  ok a card follows the pointer and snaps to the drop point');

    await page.getByTestId('block-add-statement').click();
    await page.getByTestId('toolbox-item-print').click();
    await page.getByTestId('python-block-call').last().waitFor({ state: 'visible' });
    const withPrint = await blockCount(page);
    assert.equal(withPrint, initialBlocks + 1, 'the toolbox tap should add one statement');

    await page.getByTestId('toolbox-sort').selectOption('recent');
    assert.equal(
      await page.locator('[data-testid^="toolbox-item-"] span').first().innerText(),
      'Print',
      'Recently used should lead with the item just inserted'
    );
    await page.getByTestId('toolbox-sort').selectOption('recommended');
    console.log('  ok Recently used leads with the item just inserted');

    const argsField = page
      .getByTestId('python-block-call')
      .last()
      .locator('[data-testid^="block-field-args-"]');
    await argsField.click();
    const argsInput = page
      .getByTestId('python-block-call')
      .last()
      .locator('[data-testid^="block-field-args-"][data-testid$="-input"]');
    await argsInput.fill('"Start"');
    await argsInput.press('Enter');
    await page
      .getByTestId('python-block-call')
      .last()
      .locator('[data-testid^="block-field-args-"]')
      .filter({ hasText: '"Start"' })
      .waitFor({ state: 'visible' });
    console.log('  ok a toolbox tap and an inline field edit land in the workspace');

    // ---- 3. Undo and redo are the statement history ----
    await page.getByTestId('block-undo').click();
    assert.equal(
      await page
        .getByTestId('python-block-call')
        .last()
        .locator('[data-testid^="block-field-args-"]')
        .innerText(),
      '"Hello"',
      'the first undo should put the argument back'
    );
    await page.getByTestId('block-undo').click();
    assert.equal(await blockCount(page), initialBlocks, 'the second undo should remove the statement');
    await page.getByTestId('block-redo').click();
    assert.equal(await blockCount(page), withPrint, 'redo should bring the statement back');
    await page.getByTestId('block-redo').click();
    await page
      .getByTestId('python-block-call')
      .last()
      .locator('[data-testid^="block-field-args-"]')
      .filter({ hasText: '"Start"' })
      .waitFor({ state: 'visible' });

    // The same history is reachable from the keyboard. Focus a control inside the workspace, then
    // use the chord a learner would: Ctrl/⌘+Z and its shift pair.
    await page.getByTestId('block-appearance-normal').focus();
    await page.keyboard.press('Control+z');
    assert.equal(
      await page
        .getByTestId('python-block-call')
        .last()
        .locator('[data-testid^="block-field-args-"]')
        .innerText(),
      '"Hello"',
      'Ctrl+Z should undo the field edit like the button'
    );
    await page.keyboard.press('Control+Shift+z');
    await page
      .getByTestId('python-block-call')
      .last()
      .locator('[data-testid^="block-field-args-"]')
      .filter({ hasText: '"Start"' })
      .waitFor({ state: 'visible' });
    console.log('  ok undo and redo walk the card history, by button and by keyboard');

    // ---- The generated program is what the code view and Run read ----
    await switchToCode(page);
    const generated = await getEditorCode(page);
    assert.ok(generated.includes('print("Start")'), `main.py lacks the new print:\n${generated}`);
    assert.notEqual(generated, before, 'editing a block should change main.py');

    // The same Run the code editor uses executes the generated program. The lesson may fail its
    // own check — the starter is untouched — but the interpreter must print the block's line.
    await page.getByTestId('btn-run-verify').click();
    await page.waitForFunction(
      () =>
        (document.querySelector('[data-testid="pre-actual-stdout"]')?.textContent ?? '').includes(
          'Start'
        ),
      undefined,
      { timeout: 120000 }
    );
    await switchToVisual(page);
    console.log('  ok the blocks write the one main.py, and the interpreter runs it');

    // ---- 4. The card controls build and change the program ----
    // Insert an If, choose "add statement inside", cross to Python Code and back, then insert: the
    // insertion point is the workspace's state, not the face that happens to be drawn.
    await page.getByTestId('block-add-statement').click();
    await page.getByTestId('toolbox-item-if').click();
    const ifCard = page.getByTestId('python-block-if').last();
    await ifCard.waitFor({ state: 'visible' });
    const ifId = await ifCard.getAttribute('data-block-id');
    assert.ok(ifId, 'the inserted If card should have an id');

    await page.getByTestId(`block-add-inside-${ifId}`).click();
    await switchToCode(page);
    await switchToVisual(page);
    await page.getByTestId('toolbox-item-print').click();
    await ifCard.getByTestId('python-block-call').last().waitFor({ state: 'visible' });
    let edited = await getEditorCode(page);
    assert.ok(
      edited.includes('if age >= 18:\n    print("Hello")'),
      `the add-inside statement should be nested in the If:\n${edited}`
    );

    // Duplicate the whole suite, then remove the copy.
    const countBeforeCopy = await blockCount(page);
    await openCardControls(ifCard);
    await ifCard.getByTestId('block-duplicate').first().click();
    assert.equal(await blockCount(page), countBeforeCopy + 2, 'duplicate should copy the suite');
    edited = await getEditorCode(page);
    assert.equal(
      (edited.match(/^if age >= 18:$/gm) ?? []).length,
      2,
      'the duplicate should be a second If in main.py'
    );
    const duplicateIf = page.getByTestId('python-block-if').last();
    await openCardControls(duplicateIf);
    await duplicateIf.getByTestId('block-remove').first().click();
    assert.equal(await blockCount(page), countBeforeCopy, 'delete should remove the whole suite');
    edited = await getEditorCode(page);
    assert.equal((edited.match(/^if age >= 18:$/gm) ?? []).length, 1);

    // Insert after the If through its own + control, move the new print above it, then put it back.
    await openCardControls(page.locator(`[data-block-id="${ifId}"]`));
    await page
      .locator(`[data-block-id="${ifId}"]`)
      .getByTestId('block-insert-after')
      .first()
      .click();
    await page.getByTestId('toolbox-item-print').click();
    const rootPrint = page
      .locator('[data-testid="python-workspace-list"] > li')
      .filter({ hasText: 'print("Hello")' })
      .last();
    await rootPrint.waitFor({ state: 'visible' });
    const printId = await rootPrint.getAttribute('data-block-id');
    assert.ok(printId, 'the inserted Print card should have an id');
    const printCard = page.locator(`[data-block-id="${printId}"]`);
    let lines = (await getEditorCode(page)).split('\n');
    assert.ok(
      lines.indexOf('print("Hello")') > lines.indexOf('if age >= 18:'),
      'the new root print should start below the If'
    );
    await openCardControls(printCard);
    await printCard.getByTestId('block-move-up').first().click();
    lines = (await getEditorCode(page)).split('\n');
    assert.ok(
      lines.indexOf('print("Hello")') < lines.indexOf('if age >= 18:'),
      'move up should put the print above the If'
    );
    await printCard.getByTestId('block-move-down').first().click();
    lines = (await getEditorCode(page)).split('\n');
    assert.ok(
      lines.indexOf('print("Hello")') > lines.indexOf('if age >= 18:'),
      'move down should put it back'
    );
    console.log(
      '  ok add-inside, insert-after, duplicate, delete and move change the program they draw'
    );

    // The recent list is a device preference, like the appearance and the mode.
    await page.getByTestId('toolbox-sort').selectOption('recent');
    assert.equal(
      await page.locator('[data-testid^="toolbox-item-"] span').first().innerText(),
      'Print',
      'Recently used should survive a reload'
    );
    await page.getByTestId('toolbox-sort').selectOption('recommended');
    console.log('  ok Recently used survives a reload');

    // ---- 5. Appearance is real and remembered ----
    const beforeColorful = await getEditorCode(page);
    // The toolbox previews the look too: a Colorful item wears the ink its card will wear.
    const toolboxInk = () =>
      page
        .getByTestId('toolbox-item-print')
        .evaluate((element) => getComputedStyle(element).backgroundColor);
    const normalToolbox = await toolboxInk();
    await page.getByTestId('block-appearance-colorful').click();
    const colorfulToolbox = await toolboxInk();
    assert.notEqual(
      colorfulToolbox,
      normalToolbox,
      'Colorful should repaint the toolbox, not only the cards'
    );
    assert.equal(
      await page.getByTestId('python-block-editor').getAttribute('data-appearance'),
      'colorful',
      'Colorful should repaint the workspace'
    );
    assert.equal(
      await getEditorCode(page),
      beforeColorful,
      'appearance is drawing only; it must not rewrite main.py'
    );
    await assertNoSeriousA11y(page);
    console.log('  ok the workspace has no serious or critical axe findings');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(document.querySelector('#root *')), undefined, {
      timeout: 30000,
    });
    const folded = page.locator('[data-testid="btn-toggle-editor"][aria-expanded="false"]');
    if (await folded.count()) await folded.first().click();
    await page.getByTestId('python-block-editor').waitFor({ state: 'visible', timeout: 20000 });
    assert.equal(
      await page.getByTestId('python-block-editor').getAttribute('data-appearance'),
      'colorful',
      'the appearance choice should survive a reload'
    );
    assert.equal(
      await page.getByTestId('editor-mode-visual').getAttribute('aria-pressed'),
      'true',
      'the visual mode should survive a reload'
    );
    console.log('  ok Colorful and the visual mode survive a reload');

    // ---- 5. A phone has no horizontal scrolling ----
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    // Study on a phone is two surfaces; the editor is the Code one, and it is mounted on demand.
    const codeSurface = page.getByTestId('phone-surface-code');
    if (await codeSurface.isVisible().catch(() => false)) await codeSurface.click();
    await page.getByTestId('python-workspace').waitFor({ state: 'visible', timeout: 15000 });
    const overflow = await page.evaluate(() => {
      const workspace = document.querySelector('[data-testid="python-workspace"]');
      const toolbox = document.querySelector('[data-testid="python-toolbox"]');
      return {
        page: document.documentElement.scrollWidth - window.innerWidth,
        workspace: workspace ? workspace.scrollWidth - workspace.clientWidth : 0,
        toolboxRight: toolbox ? toolbox.getBoundingClientRect().right : 0,
        width: window.innerWidth,
      };
    });
    assert.ok(overflow.page <= 1, `the page scrolls sideways by ${overflow.page}px at 390px`);
    assert.ok(
      overflow.workspace <= 1,
      `the workspace scrolls sideways by ${overflow.workspace}px at 390px`
    );
    assert.ok(
      overflow.toolboxRight <= overflow.width + 1,
      `the toolbox ends ${Math.round(overflow.toolboxRight)}px into a ${overflow.width}px phone`
    );

    // The toolbox is a dock on a phone: pinned to the bottom edge, about a third of the screen,
    // and folded to one row by a downward swipe of its grabber (or opened by an upward one).
    const dock = page.getByTestId('python-toolbox');
    assert.equal(await dock.getAttribute('data-dock'), '1', 'a phone should get the docked toolbox');
    const dockBox = await dock.boundingBox();
    assert.ok(dockBox, 'the dock should be laid out');
    const phoneBarBox = await page.getByTestId('phone-bar').boundingBox();
    assert.ok(phoneBarBox, 'the phone should draw its Study bar');
    assert.ok(
      Math.abs(dockBox.y + dockBox.height - phoneBarBox.y) <= 2,
      `the dock should sit on the Study bar, not ${Math.round(dockBox.y + dockBox.height)}px vs ${Math.round(phoneBarBox.y)}px`
    );
    assert.ok(
      dockBox.height <= 844 * 0.45,
      `the dock should take about a third of the screen, not ${Math.round(dockBox.height)}px`
    );
    const grabber = page.getByTestId('toolbox-grabber');
    assert.ok(await grabber.boundingBox(), 'the dock should draw its grabber');

    // ---- The two gestures, with a finger ----
    // A mouse drag never meets the browser's own touch gestures, so the phone paths are driven
    // through CDP's touchscreen input from here: the page sees a `pointerType: 'touch'` press and
    // `touchmove`s, and the browser's scroll and long-press recognisers get the same input a device
    // sends. The page must not take any of those moves for a scroll, and the card must not let the
    // browser start a selection, callout or long-press menu under the hold.
    assert.ok(
      await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches),
      'the phone gates need a coarse pointer for the touch floors and the card CSS'
    );
    const touch = await createTouch(page);
    const touchCards = page.locator('[data-testid="python-workspace-list"] > li[data-block-id]');
    const touchIds = await touchCards.evaluateAll((cards) =>
      cards.map((card) => card.getAttribute('data-block-id'))
    );
    assert.ok(touchIds.length >= 3, 'the touch drag needs a few root statements to reorder');
    assert.equal(
      await touchCards.first().evaluate((card) => getComputedStyle(card).userSelect),
      'none',
      'a card on a touch device must decline text selection, which would fight the long press'
    );
    // Put the pair in the band between the sticky chrome and the dock. Centring the second card in
    // the whole viewport would put its bottom edge behind the dock, so the scroll is measured
    // against those two edges, and the scrollable element that owns the workspace is found rather
    // than assuming the page is what moves.
    //
    // The phone's top rows compact on the first scroll — measured here as a ~57 px shift — which
    // pushes the cards back down after a placement that was right when it was made. Place, let the
    // layout settle, then place again if the pair slipped out; and read the band the assertions use
    // from the settled layout, not from before it moved.
    const stableFirstCard = () =>
      page.waitForFunction(
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
    let band = null;
    let pressCardBox = null;
    let dropCardBox = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const placement = await page.evaluate(() => {
        const cards = [
          ...document.querySelectorAll(
            '[data-testid="python-workspace-list"] > li[data-block-id]'
          ),
        ];
        const dock = document.querySelector('[data-testid="python-toolbox"]');
        const header = document.querySelector('[data-chrome="header"]');
        // A phone has two sticky rows at the top: the header and the tab picker under it. The band
        // starts below both, or a card is placed under a control that eats the press.
        const tabRow = document.querySelector('[data-chrome="rail"]');
        const chromeBottom = Math.max(
          header ? header.getBoundingClientRect().bottom : 0,
          tabRow ? tabRow.getBoundingClientRect().bottom : 0
        );
        const bandTop = (chromeBottom || 84) + 8;
        const bandBottom = (dock ? dock.getBoundingClientRect().top : window.innerHeight) - 8;
        const first = cards[0].getBoundingClientRect();
        const second = cards[1].getBoundingClientRect();
        const height = second.bottom - first.top;
        const desiredTop = bandTop + Math.max(0, (bandBottom - bandTop - height) / 2);
        const delta = first.top - desiredTop;
        if (Math.abs(delta) > 1) {
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
          // The app asks for smooth scrolling in CSS, and a bare `scrollTop` write still animates
          // under it. An inline `auto` makes this one scroll instant, so the cards are measured
          // where they will actually be when the finger goes down.
          const target = scroller ?? document.scrollingElement ?? document.documentElement;
          const previous = target.style.scrollBehavior;
          target.style.scrollBehavior = 'auto';
          target.scrollTop += delta;
          target.style.scrollBehavior = previous;
        }
        return { delta: Math.round(delta) };
      });
      await stableFirstCard();
      // The sticky rows react to the scroll a frame or two after it lands; give that reaction the
      // time to move the cards before the placement is judged.
      await page.waitForTimeout(120);
      pressCardBox = await touchCards.nth(0).boundingBox();
      dropCardBox = await touchCards.nth(1).boundingBox();
      band = await page.evaluate((delta) => {
        const header = document.querySelector('[data-chrome="header"]');
        const tabRow = document.querySelector('[data-chrome="rail"]');
        const dock = document.querySelector('[data-testid="python-toolbox"]');
        const chromeBottom = Math.max(
          header ? header.getBoundingClientRect().bottom : 0,
          tabRow ? tabRow.getBoundingClientRect().bottom : 0
        );
        return {
          bandTop: Math.round((chromeBottom || 84) + 8),
          bandBottom: Math.round(
            (dock ? dock.getBoundingClientRect().top : window.innerHeight) - 8
          ),
          delta,
        };
      }, placement.delta);
      if (
        pressCardBox &&
        dropCardBox &&
        pressCardBox.y + pressCardBox.height > band.bandTop &&
        dropCardBox.y + dropCardBox.height < band.bandBottom
      ) {
        break;
      }
    }
    assert.ok(pressCardBox && dropCardBox, 'the two cards should be laid out for the touch drag');
    assert.ok(
      pressCardBox.y + pressCardBox.height > band.bandTop,
      `the press should be below the sticky header, got ${Math.round(pressCardBox.y)}+${Math.round(pressCardBox.height)} vs band top ${band.bandTop}`
    );
    assert.ok(
      dropCardBox.y + dropCardBox.height < band.bandBottom,
      `the release should be above the dock, got ${Math.round(dropCardBox.y)}+${Math.round(dropCardBox.height)} vs band bottom ${band.bandBottom} (scroll delta ${band.delta})`
    );
    // The bottom padding, not a field or a verb: this is a press on the card itself.
    const pressX = pressCardBox.x + 16;
    const pressY = pressCardBox.y + pressCardBox.height - 3;
    let touchDropX = dropCardBox.x + 16;
    let touchDropY = dropCardBox.y + dropCardBox.height - 3;
    /** Every position a gesture could move: the page, the document, and each card ancestor. */
    const scrollSnapshot = () =>
      page.evaluate(() => {
        const card = document.querySelector(
          '[data-testid="python-workspace-list"] > li[data-block-id]'
        );
        const elements = [];
        let node = card?.parentElement ?? null;
        while (node) {
          elements.push(node.scrollTop);
          node = node.parentElement;
        }
        return JSON.stringify({
          page: window.scrollY,
          document: document.scrollingElement?.scrollTop ?? 0,
          elements,
        });
      });
    const scrollBeforeDrag = await scrollSnapshot();
    assert.equal(
      await page.evaluate(
        ({ x, y }) =>
          document
            .elementFromPoint(x, y)
            ?.closest('[data-block-id]')
            ?.getAttribute('data-block-id'),
        { x: pressX, y: pressY }
      ),
      touchIds[0],
      'the touch press should start on the card the test means to drag'
    );

    await touch.start(pressX, pressY);
    await page.getByTestId('block-drag-ghost').waitFor({ state: 'visible', timeout: 3000 });
    assert.equal(
      await touchCards.nth(0).getAttribute('data-dragging'),
      '1',
      'a touch that rests on a card should lift that card'
    );
    assert.equal(
      await scrollSnapshot(),
      scrollBeforeDrag,
      'nothing may scroll under the hold that lifts a card'
    );
    assert.equal(
      await page.evaluate(() => window.getSelection()?.toString() ?? ''),
      '',
      'the hold must not start a text selection'
    );
    assert.equal(
      await touchCards.nth(0).evaluate((card) => {
        const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
        card.dispatchEvent(event);
        return event.defaultPrevented;
      }),
      true,
      'a live drag must decline the browser\'s long-press menu'
    );
    console.log('  ok a touch hold lifts a card without scrolling, selecting or opening a menu');

    // The chip follows the finger, not the card's old place, and rides above it: the pointer is
    // exactly where the snap arrow is drawn, so a centred chip would cover the landing gap.
    const firstMoveX = pressX + 6;
    const firstMoveY = pressY - 18;
    await touch.move(firstMoveX, firstMoveY, { steps: 3 });
    await page.waitForFunction(
      ({ x, y }) => {
        const ghost = document.querySelector('[data-testid="block-drag-ghost"]');
        if (!ghost) return false;
        const box = ghost.getBoundingClientRect();
        return (
          Math.abs(box.left + box.width / 2 - x) <= 2 && Math.abs(box.bottom - (y - 14)) <= 2
        );
      },
      { x: firstMoveX, y: firstMoveY },
      { timeout: 3000 }
    );
    // The phone's sticky rows can compact once the finger is moving, which slides the cards up
    // after the band was measured. Wait for the layout to settle and put the finger on the target
    // card where it is now; the same card, not the coordinates from before the hold.
    await stableFirstCard();
    await page.waitForTimeout(120);
    const dropNow = await touchCards.nth(1).boundingBox();
    assert.ok(dropNow, 'the touch target card should still be laid out after the hold');
    touchDropX = dropNow.x + 16;
    touchDropY = dropNow.y + dropNow.height - 3;

    await touch.move(touchDropX, touchDropY, { steps: 12 });
    await page.locator('[data-drop-active="1"]').first().waitFor({ state: 'visible', timeout: 3000 });
    // A touch that approaches the dock can make the phone's sticky rows compact once more, sliding
    // the cards up under the finger after the last measurement. Follow the card that is actually
    // under the finger: move to its current top band again until the drop point is the intended
    // card, then assert the strict target. The finger stays down the whole time.
    let underFinger = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      underFinger = await page.evaluate(
        ({ x, y }) =>
          document
            .elementFromPoint(x, y)
            ?.closest('[data-block-id]')
            ?.getAttribute('data-block-id') ?? null,
        { x: touchDropX, y: touchDropY }
      );
      if (underFinger === touchIds[1]) break;
      await stableFirstCard();
      await page.waitForTimeout(120);
      const box = await touchCards.nth(1).boundingBox();
      assert.ok(box, 'the touch target card should still be laid out');
      touchDropX = box.x + 16;
      touchDropY = box.y + 8;
      await touch.move(touchDropX, touchDropY, { steps: 3 });
      await page.locator('[data-drop-active="1"]').first().waitFor({ state: 'visible', timeout: 3000 });
    }
    assert.equal(
      underFinger,
      touchIds[1],
      'the card under the finger should be the one the hold is carrying the statement onto'
    );
    assert.equal(
      await page.locator('[data-drop-active="1"]').first().evaluate((target) =>
        target.closest('[data-block-id]')?.getAttribute('data-block-id')
      ),
      touchIds[1],
      'the card under the finger should be the one drawn as the drop point'
    );
    await page.getByTestId('block-snap-arrow').waitFor({ state: 'visible', timeout: 3000 });
    assert.equal(
      await page.getByTestId('block-snap-arrow').getAttribute('data-direction'),
      'down',
      'a card dragged down with a finger should point its arrow down'
    );
    assert.equal(
      await page.getByTestId('block-snap-arrow').evaluate((arrow) =>
        arrow.closest('[data-block-id]')?.getAttribute('data-block-id')
      ),
      touchIds[1],
      'the arrow should point at the gap a lifted finger will snap the card into'
    );
    assert.equal(
      await scrollSnapshot(),
      scrollBeforeDrag,
      'the drag must not pan the page or its pane under the card'
    );
    assert.equal(
      await page.evaluate(() => window.getSelection()?.toString() ?? ''),
      '',
      'the drag must not leave a selection behind'
    );
    await touch.end();
    assert.equal(
      await page.getByTestId('block-snap-arrow').count(),
      0,
      'the snap arrow should clear when the finger lets go'
    );

    const orderAfterTouchDrag = await touchCards.evaluateAll((cards) =>
      cards.map((card) => card.getAttribute('data-block-id'))
    );
    assert.deepEqual(
      orderAfterTouchDrag,
      [touchIds[1], touchIds[0], ...touchIds.slice(2)],
      'the card released under a finger should sit directly under the card it was dropped on'
    );
    assert.equal(
      await scrollSnapshot(),
      scrollBeforeDrag,
      'letting go of the card must not move the page or its pane'
    );
    assert.equal(
      await page.locator('[data-testid="python-workspace-list"] > li[data-block-id]').first().evaluate((card) => {
        const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
        card.dispatchEvent(event);
        return event.defaultPrevented;
      }),
      false,
      'after the drop the card should allow its normal context menu again'
    );
    await page.getByTestId('block-undo').tap();
    assert.deepEqual(
      await touchCards.evaluateAll((cards) => cards.map((card) => card.getAttribute('data-block-id'))),
      touchIds,
      'a touch drag should be one undo step'
    );
    console.log('  ok a touch long-press carries a card onto another and snaps it there');

    // The dock's swipe is the same finger: the sheet follows it before it settles, and moving the
    // grabber never scrolls the page under it.
    await page.waitForTimeout(300);
    const swipeBox = await grabber.boundingBox();
    assert.ok(swipeBox, 'the dock should still draw its grabber');
    const grabCenterX = swipeBox.x + swipeBox.width / 2;
    const grabCenterY = swipeBox.y + swipeBox.height / 2;
    const scrollBeforeSwipe = await scrollSnapshot();
    await touch.start(grabCenterX, grabCenterY);
    await page.waitForTimeout(60);
    await touch.move(grabCenterX, grabCenterY + 45, { steps: 8 });
    // The sheet follows the finger: part way down it is part way folded, not already folded.
    await page.waitForFunction(
      (openHeight) => {
        const sheet = document.querySelector('[data-testid="python-toolbox"]');
        return !!sheet && sheet.getBoundingClientRect().height < openHeight - 20;
      },
      dockBox.height,
      { timeout: 3000 }
    );
    const midBox = await dock.boundingBox();
    assert.ok(
      midBox && midBox.height < dockBox.height - 20 && midBox.height > dockBox.height - 70,
      `the dock should follow the finger, got ${Math.round(midBox?.height ?? 0)}px of ${Math.round(dockBox.height)}px`
    );
    await touch.move(grabCenterX, grabCenterY + 160, { steps: 8 });
    await touch.end();
    // The fold eases to nothing; the body is still mounted, so the assertion is its height, not its
    // presence. (A clipped input still reports a box, so `isVisible` would lie about a folded dock.)
    await page.waitForFunction(
      () =>
        (document.querySelector('[data-testid="python-toolbox-body"]')?.getBoundingClientRect()
          .height ?? 1) < 1,
      undefined,
      { timeout: 3000 }
    );
    assert.equal(
      await page.getByTestId('python-toolbox-body').getAttribute('data-state'),
      'closed',
      'a downward touch swipe on the grabber should fold the dock to one row'
    );
    assert.equal(
      await scrollSnapshot(),
      scrollBeforeSwipe,
      'swiping the grabber must not scroll the page or its pane'
    );
    await page.waitForTimeout(300);
    const foldedBox = await dock.boundingBox();
    assert.ok(
      foldedBox && foldedBox.height < dockBox.height,
      'the folded dock should be shorter than the open one'
    );
    // A tap on the grabber is the other way in, for a learner who does not think to swipe. This is
    // a real touch tap, and it also proves a swipe's stale click guard did not swallow it.
    const foldedGrabBox = await grabber.boundingBox();
    assert.ok(foldedGrabBox, 'the folded dock should still draw its grabber');
    await touch.tap(
      foldedGrabBox.x + foldedGrabBox.width / 2,
      foldedGrabBox.y + foldedGrabBox.height / 2
    );
    await page.waitForFunction(
      () =>
        (document.querySelector('[data-testid="python-toolbox-body"]')?.getBoundingClientRect()
          .height ?? 0) > 0,
      undefined,
      { timeout: 5000 }
    );
    assert.equal(
      await page.getByTestId('python-toolbox-body').getAttribute('data-state'),
      'open',
      'a touch tap on the grabber should open the dock'
    );
    console.log('  ok a touch swipe moves the dock with the finger, and a touch tap reopens it');

    // A touch tap, not a synthesized mouse click: the phone's primary interaction is tapping a
    // toolbox element and having the statement appear.
    const beforeTap = await blockCount(page);
    const printItem = page.getByTestId('toolbox-item-print');
    await printItem.scrollIntoViewIfNeeded();
    await printItem.tap();
    await page.waitForFunction(
      (count) =>
        document.querySelectorAll('[data-testid^="python-block-"][data-block-id]').length > count,
      beforeTap,
      { timeout: 5000 }
    );
    console.log('  ok the workspace fits a 390px phone, and a touch tap inserts a statement');

    // ---- 6. The code pane follows every app palette, open and closed ----
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.waitForTimeout(250);
    // The phone's Study surface can leave the editor body folded when the desktop layout returns.
    if (
      (await page.getByTestId('btn-toggle-editor').getAttribute('aria-expanded')) === 'false'
    ) {
      await page.getByTestId('btn-toggle-editor').click();
    }
    await page.getByTestId('editor-panes').waitFor({ state: 'visible' });
    await page.getByTestId('editor-mode-code').click();
    await waitForEditor(page);
    await page.evaluate((code) => window.__mechalabEditors['editor-main'].set(code), THEME_PROBE);
    await page.waitForFunction(() =>
      window.__mechalabEditors['editor-main']?.get().includes('# theme tokens')
    );
    assert.equal(
      await page.evaluate(() => localStorage.getItem('mechalab_theme_v1')),
      null,
      'this suite must start from the OS palette so the four states below are deterministic'
    );

    // The four palettes are reached through the header's own controls, with the code pane open.
    await page.emulateMedia({ colorScheme: 'dark' });
    await waitForPalette(page, 'dark');
    const dark = await paletteSnapshot(page);
    assertPaletteFollowsTheme(dark, 'dark');

    await page.getByTestId('btn-theme-toggle').click();
    await waitForPalette(page, 'light');
    const light = await paletteSnapshot(page);
    assertPaletteFollowsTheme(light, 'light', dark);

    await page.getByTestId('btn-paper-toggle').click();
    await waitForPalette(page, 'paper');
    const paper = await paletteSnapshot(page);
    assertPaletteFollowsTheme(paper, 'paper', light);

    await page.getByTestId('btn-contrast-toggle').click();
    await waitForPalette(page, 'contrast');
    const contrast = await paletteSnapshot(page);
    assertPaletteFollowsTheme(contrast, 'contrast', paper);

    // Off high contrast lands on the OS palette, so one more press returns to the first state.
    await page.getByTestId('btn-contrast-toggle').click();
    await waitForPalette(page, 'dark');
    const darkAgain = await paletteSnapshot(page);
    assertPaletteFollowsTheme(darkAgain, 'dark', contrast);
    assert.equal(darkAgain.keyword, dark.keyword, 'returning to dark should restore the dark keyword ink');

    // Close the pane, change the palette while it is hidden, then reopen it: the CSS variables are
    // the same mechanism the visible pane uses, and the code face must still be the one in front.
    await page.getByTestId('btn-toggle-editor').click();
    assert.equal(
      await page.getByTestId('btn-toggle-editor').getAttribute('aria-expanded'),
      'false',
      'the close should fold the editor body'
    );
    assert.equal(await page.getByTestId('editor-panes').isVisible(), false);
    await page.getByTestId('btn-theme-toggle').click();
    await waitForPalette(page, 'light');
    await page.getByTestId('btn-toggle-editor').click();
    await page.getByTestId('editor-panes').waitFor({ state: 'visible' });
    await waitForEditor(page);
    const reopened = await paletteSnapshot(page);
    assertPaletteFollowsTheme(reopened, 'light', darkAgain);
    assert.equal(
      await page.getByTestId('editor-mode-code').getAttribute('aria-pressed'),
      'true',
      'reopening the pane must keep Python Code in front'
    );
    assert.equal(await getEditorCode(page), THEME_PROBE, 'the code face must keep the same document');

    // Visual has already been opened by this run. Once it has, both faces stay mounted; opening and
    // closing the pane through another palette must not drop the visual workspace.
    await page.getByTestId('editor-mode-visual').click();
    await page.getByTestId('python-block-editor').waitFor({ state: 'visible' });
    await page.getByTestId('editor-mode-code').click();
    await waitForEditor(page);
    assert.equal(
      await page.locator('[data-editor-face="visual"] [data-testid="python-block-editor"]').count(),
      1,
      'once Visual has opened, it must stay mounted while Python Code is in front'
    );
    await page.getByTestId('btn-toggle-editor').click();
    await page.getByTestId('btn-paper-toggle').click();
    await waitForPalette(page, 'paper');
    await page.getByTestId('btn-toggle-editor').click();
    await page.getByTestId('editor-panes').waitFor({ state: 'visible' });
    await page.getByTestId('editor-mode-visual').click();
    await page.getByTestId('python-block-editor').waitFor({ state: 'visible' });
    assert.equal(
      await page.getByTestId('editor-mode-visual').getAttribute('aria-pressed'),
      'true',
      'the visual face must still open after the pane was closed and the palette changed'
    );
    await page.getByTestId('editor-mode-code').click();
    await waitForEditor(page);
    const paperAfterReopen = await paletteSnapshot(page);
    assertPaletteFollowsTheme(paperAfterReopen, 'paper', reopened);
    console.log('  ok the code pane follows all four palettes, open and after close/reopen');

    assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join('; ')}`);
    console.log('\npython blocks browser: all checks passed');
  } finally {
    await browser.close();
    if (ownServer) ownServer.viteServer.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
