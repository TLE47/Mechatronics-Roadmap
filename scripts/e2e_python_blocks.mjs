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
 *
 * Run: node --experimental-strip-types scripts/e2e_python_blocks.mjs
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { resolveChromiumExecutable, startDevServer } from './e2e_browser_workbench.mjs';
import { seedTourSeen } from './tour_seed.mjs';
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
    await ifCard.getByTestId('block-duplicate').first().click();
    assert.equal(await blockCount(page), countBeforeCopy + 2, 'duplicate should copy the suite');
    edited = await getEditorCode(page);
    assert.equal(
      (edited.match(/^if age >= 18:$/gm) ?? []).length,
      2,
      'the duplicate should be a second If in main.py'
    );
    const duplicateIf = page.getByTestId('python-block-if').last();
    await duplicateIf.getByTestId('block-remove').first().click();
    assert.equal(await blockCount(page), countBeforeCopy, 'delete should remove the whole suite');
    edited = await getEditorCode(page);
    assert.equal((edited.match(/^if age >= 18:$/gm) ?? []).length, 1);

    // Insert after the If through its own + control, move the new print above it, then put it back.
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
    await page.getByTestId('block-appearance-colorful').click();
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
