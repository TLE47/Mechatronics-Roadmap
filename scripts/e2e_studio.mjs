#!/usr/bin/env node
/**
 * The free-study studio, in a real browser (`scripts/e2e_studio.mjs`, `npm run test:e2e:studio`).
 *
 * The unit suites pin the store, the runner's wrapper and the worker protocol; what only a browser
 * can answer is whether the workspace is reachable from Home, whether Run really executes a program
 * nobody graded, whether a run that ends early leaves a sentence the learner can read, whether Stop
 * recovers to a fresh interpreter, and whether the code, the notebook and the plan survive both a
 * reload and a backup round trip — the promises the tab makes in its own copy.
 *
 * The budgets are not proved again here, because a browser is the most expensive place to prove
 * them: the worker's loop budget is the runner's browser gate (`e2e_browser_workbench.mjs` drives it
 * through an infinite loop), and the page's kill clock is `test:worker` and `test:studio`. This
 * suite's job starts at the sentence the learner reads. The code is read back from the store after
 * the stop, because "your editor code is preserved" is a claim the learner sees in the error and a
 * killed run is exactly when it matters.
 *
 * The workflow half needs no lesson: it drives the same canvas the lesson tab draws, under the
 * reserved `studio` document key, reloads to prove the diagram came back from the store, and then
 * exports a backup, wipes the browser, restores it and opens the plan again. That round trip is the
 * proof that the studio's plan rides the backup rather than a second document format.
 *
 * A phone gets the same three tools one at a time; at 390 px the suite proves that by counting the
 * panes rather than by trusting the class names.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { resolveChromiumExecutable, startDevServer } from './e2e_browser_workbench.mjs';
import { getEditorCode, setEditorCode, waitForEditor } from './editor-code.mjs';
import { seedTourSeen } from './tour_seed.mjs';
import { clearBulk } from './bulk_store_page.mjs';
import { fromUtf8, readZip } from '../app/src/backupZip.ts';
import {
  FEATURE_WALKTHROUGH,
  FEATURE_WALKTHROUGH_STORAGE_KEY,
  FEATURE_WALKTHROUGH_VERSION,
} from '../app/src/featureWalkthrough.ts';

const STUDIO_EDITOR = 'editor-studio';
const PHONE = { width: 390, height: 844 };
const PLAN_TITLE = 'Studio e2e plan card';

function ok(message) {
  console.log(`  ok   ${message}`);
}

/** Home's studio card is the door this suite exists to prove. */
async function openFromHome(page, baseUrl) {
  await page.goto(`${baseUrl}?view=home`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('home-dashboard').waitFor({ timeout: 30000 });
  const heroMotion = await page.getByTestId('home-dashboard').evaluate((dashboard) => {
    const hero = dashboard.querySelector('.home-hero');
    const headline = hero?.querySelector('.home-gradient-text');
    return {
      headline: headline ? getComputedStyle(headline).animationName : 'none',
      scan: hero ? getComputedStyle(hero, '::after').animationName : 'none',
    };
  });
  assert.notEqual(heroMotion.headline, 'none', 'Home’s hero headline must carry its own motion');
  assert.notEqual(heroMotion.scan, 'none', 'Home’s hero must carry the one soft scan');
  ok('Home’s hero carries its own motion');
  await page.getByTestId('home-studio').waitFor({ timeout: 10000 });
  assert.match(
    (await page.getByTestId('home-studio').textContent()) ?? '',
    /no grading/i,
    'the card must say what makes this workspace different from a lab'
  );
  assert.equal(
    await page.getByTestId('home-lab-tab-studio').count(),
    1,
    'the studios must also be in the labs grid, which is the complete index'
  );
  await page.getByTestId('home-studio-open').click();
  await page.getByTestId('studio').waitFor({ timeout: 30000 });
}

/** After a reload the workbench may open its remembered tab; the rail is always the door. */
async function reopenStudio(page) {
  await page
    .locator('[data-testid="studio"], [data-testid="tab-btn-tab-studio"]')
    .first()
    .waitFor({ timeout: 30000 });
  if ((await page.getByTestId('studio').count()) === 0) {
    await page.getByTestId('tab-btn-tab-studio').click();
  }
  await page.getByTestId('studio').waitFor({ timeout: 30000 });
}

/** The debounced studio write has landed, not merely the idle "saved on this device" line. */
async function waitForStudioSaved(page) {
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="studio-note-status"]')?.textContent?.trim() === 'Saved',
    null,
    { timeout: 10000 }
  );
}

async function runProgram(page, code) {
  await setEditorCode(page, code, STUDIO_EDITOR);
  await page.getByTestId('studio-run').click();
}

/**
 * Count the implicit layer's own pixels. WebGL is the only place an implicit curve exists, so a
 * canvas that merely exists proves nothing: the buffer has to carry ink. The renderer keeps its
 * drawing buffer (`preserveDrawingBuffer`), which is what lets this read the frame that was painted
 * instead of the empty one compositing leaves behind.
 */
async function implicitInk(page, minimum, timeout = 5000) {
  try {
    await page.waitForFunction(
      (floor) => {
        const canvas = document.querySelector('[data-testid="graph-implicit-canvas"]');
        const gl = canvas?.getContext('webgl2');
        if (!canvas || !gl || !canvas.width || !canvas.height) return false;
        const pixels = new Uint8Array(canvas.width * canvas.height * 4);
        gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        let lit = 0;
        for (let index = 3; index < pixels.length; index += 4) {
          if (pixels[index] > 24) lit += 1;
        }
        return lit >= floor;
      },
      minimum,
      { timeout }
    );
  } catch {
    // Fall through to the read below: its count is what the failing assertion quotes.
  }
  return page.getByTestId('graph-implicit-canvas').evaluate((canvas) => {
    const gl = canvas.getContext('webgl2');
    if (!gl) return { available: false, lit: 0, width: canvas.width, height: canvas.height };
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let lit = 0;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] > 24) lit += 1;
    }
    return { available: true, lit, width: canvas.width, height: canvas.height };
  });
}

async function waitForStderr(page, pattern, timeout = 120000) {
  await page.waitForFunction(
    ({ source, flags }) =>
      new RegExp(source, flags).test(
        document.querySelector('[data-testid="studio-stderr"]')?.textContent ?? ''
      ),
    { source: pattern.source, flags: pattern.flags },
    { timeout }
  );
}

async function main() {
  const ownServer = process.env.E2E_BASE_URL ? null : await startDevServer(process.cwd());
  const baseUrl = process.env.E2E_BASE_URL ?? ownServer.baseUrl;
  const executablePath = resolveChromiumExecutable();
  const browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    // Implicit curves are the one thing only the GPU process can prove. Force SwiftShader so a
    // headless machine with no device still paints them; the suite then reads the pixels rather
    // than trusting that the layer exists.
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    headless: true,
  });
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'mechalab-studio-'));
  try {
    const context = await browser.newContext({ acceptDownloads: true });
    await seedTourSeen(context);
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    // ---- 1. Home introduces the workspace, and the card is a door ----
    await openFromHome(page, baseUrl);
    assert.equal(
      await page.getByTestId('tab-btn-tab-studio').getAttribute('aria-current'),
      'page',
      'the card must open the studio tab, not merely a page that looks like it'
    );
    assert.equal(
      await page.getByTestId('runner-verified-count').count(),
      0,
      'the studio is ungraded: it must not show the runner tally'
    );
    ok('Home’s Free study card opens the studio tab, ungraded');

    // ---- 1b. The action tray is a second door to the same tab ----
    await page.goto(`${baseUrl}?view=home`, { waitUntil: 'domcontentloaded' });
    const headerStudio = page.getByTestId('btn-open-studio');
    await headerStudio.waitFor({ timeout: 30000 });
    const trayOrder = await headerStudio.evaluate((button) => {
      const tray = button.closest('[role="group"]');
      return tray
        ? [...tray.querySelectorAll('button[data-testid]')].map((item) =>
            item.getAttribute('data-testid')
          )
        : [];
    });
    assert.deepEqual(
      trayOrder.slice(0, 6),
      ['btn-home', 'btn-open-review', 'btn-open-lessons', 'btn-open-studio', 'btn-open-micro', 'btn-open-palette'],
      'Lessons, Free study and micro-learning must sit between Home and Search in the Navigate tray'
    );
    await headerStudio.click();
    await page.getByTestId('studio').waitFor({ timeout: 30000 });
    assert.equal(
      await page.getByTestId('tab-btn-tab-studio').getAttribute('aria-current'),
      'page',
      'the header tray must open the studio tab too'
    );
    ok('the header’s Free study button sits between Home and Search and opens the studio');

    await page.goto(`${baseUrl}?view=home`, { waitUntil: 'domcontentloaded' });
    const trayDoor = page.getByTestId('btn-home-studio-top');
    await trayDoor.waitFor({ timeout: 30000 });
    assert.match(
      (await trayDoor.textContent()) ?? '',
      /free study/i,
      'the top-right button must name the workspace it opens'
    );
    await trayDoor.click();
    await page.getByTestId('studio').waitFor({ timeout: 30000 });
    assert.equal(
      await page.getByTestId('tab-btn-tab-studio').getAttribute('aria-current'),
      'page',
      'the action tray must open the studio tab, not another page'
    );
    ok('Home’s action tray opens the studio tab too');

    // ---- 1c. The palette marks a lesson that has passed ----
    // A second page, not a reload of the studio page: seeding progress and reloading this page would
    // race the studio store's own hydration with the run below.
    const palettePage = await context.newPage();
    try {
      await palettePage.addInitScript(() =>
        localStorage.setItem('mechalab_pyodide_verified_v1', JSON.stringify({ 'P.1': true }))
      );
      await palettePage.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      // The header's Search door opens text search now; ⌘K is the palette that carries commands,
      // and it is the one that marks a passed lesson.
      await palettePage.getByTestId('btn-open-palette').waitFor({ timeout: 30000 });
      await palettePage.keyboard.press('Control+k');
      await palettePage.getByTestId('command-palette').waitFor({ timeout: 30000 });
      await palettePage.getByTestId('input-palette-search').fill('P.1');
      const verifiedMark = palettePage.getByTestId('palette-verified-lesson-P.1');
      await verifiedMark.waitFor({ timeout: 5000 });
      assert.match((await verifiedMark.textContent()) ?? '', /Verified/, 'the row must say Verified');
      assert.match(
        (await verifiedMark.getAttribute('class')) ?? '',
        /emerald/,
        'the verified mark must be the green pill, not the ordinary row'
      );
      await palettePage.keyboard.press('Escape');
      await palettePage.getByTestId('command-palette').waitFor({ state: 'detached', timeout: 5000 });
    } finally {
      await palettePage.close();
    }
    ok('⌘K marks a passed lesson with a green Verified badge');

    // ---- 2. Run prints the program, and Stop recovers to a fresh interpreter ----
    await waitForEditor(page, STUDIO_EDITOR, 30000);
    assert.match(
      await getEditorCode(page, STUDIO_EDITOR),
      /Hello from the studio/,
      'a first visit starts from the studio’s own starter, not an empty box'
    );
    await runProgram(page, 'print("studio e2e", 6 * 7)\n');
    await page
      .getByTestId('studio-output')
      .filter({ hasText: 'studio e2e 42' })
      .waitFor({ timeout: 120000 });
    ok('Run executes a scratch program and prints its output');

    // The find panel is the editor's own, not CodeMirror's stock white one: it has to wrap inside a
    // narrow pane, and its buttons have to be readable in the palette they are drawn in.
    await page.locator('[data-editor="editor-studio"] .cm-content').click();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+f' : 'Control+f');
    await page.locator('.cm-search').waitFor({ timeout: 5000 });
    const searchTheme = await page.locator('.cm-search').evaluate((panel) => {
      const style = getComputedStyle(panel);
      const button = panel.querySelector('button');
      const buttonStyle = button ? getComputedStyle(button) : null;
      const effectiveBackground = (node) => {
        let at = node;
        while (at) {
          const bg = getComputedStyle(at).backgroundColor;
          if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
          at = at.parentElement;
        }
        return getComputedStyle(document.body).backgroundColor;
      };
      const channel = (value) => {
        const part = value / 255;
        return part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
      };
      const luminance = (rgb) => {
        const [r, g, b] = (rgb.match(/[\d.]+/g) ?? ['0', '0', '0']).slice(0, 3).map(Number);
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
      };
      const background = button ? effectiveBackground(button) : style.backgroundColor;
      const color = buttonStyle?.color ?? style.color;
      const [bright, dark] =
        luminance(background) > luminance(color)
          ? [luminance(background), luminance(color)]
          : [luminance(color), luminance(background)];
      return {
        display: style.display,
        wrap: style.flexWrap,
        contrast: (bright + 0.05) / (dark + 0.05),
        background,
        color,
      };
    });
    assert.match(searchTheme.display, /flex/, 'the find panel must lay itself out as a flex row');
    assert.equal(searchTheme.wrap, 'wrap', 'the find panel must wrap inside a narrow pane');
    assert.ok(
      searchTheme.contrast >= 4.5,
      `the find buttons must be readable (contrast ${searchTheme.contrast.toFixed(2)}, ${searchTheme.color} on ${searchTheme.background})`
    );
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.cm-search'), undefined, {
      timeout: 5000,
    });
    ok('the editor find panel wraps and keeps its buttons readable');

    // ---- 2b. The editor is the runner's own card ----
    // The program and the run output are panes, the split controls belong to the card, and the
    // editor's own settings (Vim) are the card's too — so a learner who moved between the lesson tab
    // and this one finds the same editor, not a plainer copy of it.
    assert.equal(
      await page.getByTestId('editor-panes').getAttribute('data-split'),
      'split',
      'the studio opens the code above the run output'
    );
    assert.equal(
      await page.getByTestId('editor-tab-actual').count(),
      1,
      'the run output is one of the card’s views'
    );
    await page.getByTestId('btn-pane-columns').click();
    assert.equal(
      await page.getByTestId('editor-panes').getAttribute('data-axis'),
      'columns',
      'the split can be turned side by side'
    );
    await page.getByTestId('btn-pane-rows').click();
    assert.equal(
      await page.getByTestId('editor-panes').getAttribute('data-axis'),
      'rows',
      'and back above the output'
    );
    // A laptop-sized viewport can hold a third pane. Add chooses a view this studio really has,
    // then the swap menu exchanges slots without duplicating either view.
    await page.getByTestId('btn-pane-add').click();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="editor-panes"]')?.getAttribute('data-count') === '3',
      undefined,
      { timeout: 5000 }
    );
    const threeViews = await page.getByTestId('editor-panes').getAttribute('data-views');
    assert.equal(threeViews, 'main,actual,workflow', 'Add pane must use a view the studio offers');
    await page.getByTestId('pane-main').click();
    await page.getByTestId('select-pane-swap').selectOption('2');
    assert.equal(
      await page.getByTestId('editor-panes').getAttribute('data-views'),
      'workflow,actual,main',
      'the first pane must be able to swap with the third'
    );
    await page.getByTestId('select-pane-swap').selectOption('2');
    assert.equal(
      await page.getByTestId('editor-panes').getAttribute('data-views'),
      'main,actual,workflow',
      'the swap menu must be reversible'
    );
    await page.getByTestId('studio-vim').click();
    assert.equal(
      await page.getByTestId('studio-vim').getAttribute('aria-pressed'),
      'true',
      'the editor’s own settings live in the card’s toolbar'
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    await reopenStudio(page);
    await page.getByTestId('studio-vim').waitFor({ timeout: 30000 });
    assert.equal(
      await page.getByTestId('studio-vim').getAttribute('aria-pressed'),
      'true',
      'the Vim choice survives a reload'
    );
    await page.getByTestId('studio-vim').click();
    ok('the studio editor is the runner’s card: split panes and a remembered Vim choice');

    // ---- 2b.1 The graph keeps its sheet when the calculator changes faces ----
    // The scientific pad and the graph are one tab now. Switching faces used to remount the graph,
    // which threw away the learner's expressions and their zoom; both faces stay mounted, and the
    // graph measures only while it is visible. The keypad writes at the active line's caret.
    await page.getByTestId('editor-tab-calculator').click();
    await page.getByTestId('calculator-pane').waitFor({ state: 'visible', timeout: 5000 });
    await page.getByTestId('calculator-mode-graphing').click();
    const graph = page.getByTestId('graphing-pane');
    await graph.waitFor({ state: 'visible', timeout: 5000 });
    const graphExpression = page.getByTestId('graph-expression-input').first();
    await graphExpression.fill('x^2 - 3');
    await page.waitForFunction(
      () => (document.querySelector('[data-testid="graph-canvas"]')?.clientWidth ?? 0) > 100,
      undefined,
      { timeout: 5000 }
    );

    // The divider is the list's own edge. Drag it left to prove the list gives way, then right to
    // prove it takes the room back; the sheet must stay drawable at both widths. A narrow split pane
    // may already be at the maximum list width, so the shrink-first order is the one that can always
    // move; `hover()` puts the pointer on the divider and scrolls it into view before measuring.
    const resizer = page.getByTestId('graph-list-resizer');
    await resizer.hover();
    const beforeResize = await page.getByTestId('graph-expression-list').boundingBox();
    const resizeHandle = await resizer.boundingBox();
    assert.ok(
      beforeResize && resizeHandle,
      'the graph must expose its expression list and resize handle'
    );
    await page.mouse.down();
    await page.mouse.move(
      resizeHandle.x + resizeHandle.width / 2 - 64,
      resizeHandle.y + resizeHandle.height / 2,
      { steps: 10 }
    );
    await page.mouse.up();
    const narrowed = await page.getByTestId('graph-expression-list').boundingBox();
    assert.ok(
      narrowed && narrowed.width <= beforeResize.width - 40,
      `dragging the divider left must narrow the expression panel: ${beforeResize.width} → ${narrowed?.width}`
    );
    await resizer.hover();
    const narrowedHandle = await resizer.boundingBox();
    await page.mouse.down();
    await page.mouse.move(
      narrowedHandle.x + narrowedHandle.width / 2 + 64,
      narrowedHandle.y + narrowedHandle.height / 2,
      { steps: 10 }
    );
    await page.mouse.up();
    const widened = await page.getByTestId('graph-expression-list').boundingBox();
    assert.ok(
      widened && widened.width >= narrowed.width + 40,
      `dragging the divider right must widen it again: ${narrowed.width} → ${widened?.width}`
    );
    assert.ok(
      (await page.getByTestId('graph-canvas').evaluate((canvas) => canvas.clientWidth)) > 100,
      'the sheet must keep a usable width after the list takes the room back'
    );
    ok('the graph’s expression panel resizes by dragging both ways, and the plot keeps its sheet');

    await page.getByTestId('graph-zoom-in').click();
    await page.getByTestId('graph-zoom-in').click();
    const zoomedView = await graph.getAttribute('data-view');
    assert.ok(zoomedView, 'the graph must expose the window its sheet is showing');
    await page.getByTestId('calculator-mode-scientific').click();
    assert.equal(await graph.isVisible(), false, 'the graph hides when the scientific face is up');
    await page.getByTestId('calculator-mode-graphing').click();
    assert.equal(
      await graphExpression.inputValue(),
      'x^2 - 3',
      'switching faces must not throw away the expressions'
    );
    assert.equal(
      await graph.getAttribute('data-view'),
      zoomedView,
      'switching faces must not reset the zoom or the pan window'
    );

    await graphExpression.fill('');
    await page.getByTestId('graph-key-sin').click();
    await page.getByTestId('graph-key-x').click();
    await page.getByTestId('graph-key-rparen').click();
    assert.equal(
      await graphExpression.inputValue(),
      'sin(x)',
      'the graphing keypad must insert functions and the variable at the caret'
    );
    assert.equal(
      await page.getByTestId('graph-expression-error').count(),
      0,
      'the expression built from the keypad must be one the graph can read'
    );

    // The live line above the input is the same AST the renderer plots: a fraction has to arrive
    // as a stacked fraction, not as `1/x` source. This is the graph's own typesetter, not the
    // scientific face's.
    await graphExpression.fill('y = 1/x');
    const graphPreview = page.getByTestId('graph-typeset').first();
    await graphPreview.locator('.mfrac').first().waitFor({ timeout: 5000 });
    assert.equal(
      await graphPreview.locator('.mfrac').count(),
      1,
      'a graph line must typeset its equation preview from the grapher AST'
    );
    assert.equal(
      await page.getByTestId('graph-expression-error').count(),
      0,
      'a typeset graph equation must still be one the graph can read'
    );

    // The second renderer is the browser's own: an implicit equation is not an explicit y of x, so
    // the row must classify as implicit and the transparent WebGL2 layer must exist above the paper.
    await page.getByTestId('graph-add-row').click();
    const implicitInput = page.getByTestId('graph-expression-input').last();
    await implicitInput.fill('x^2 + y^2 = 9');
    const implicitRow = page.getByTestId('graph-expression-row').last();
    assert.equal(
      await implicitRow.getAttribute('data-kind'),
      'implicit',
      'a line with x and y on both sides must be an implicit curve'
    );
    await page.getByTestId('graph-implicit-canvas').waitFor({ state: 'attached', timeout: 5000 });
    const circleInk = await implicitInk(page, 100);
    assert.ok(
      circleInk.available,
      'the implicit layer needs WebGL2; without it an implicit curve has nowhere to be drawn'
    );
    assert.ok(
      circleInk.width > 100 && circleInk.height > 100,
      `the implicit layer must be sized with the plot: ${circleInk.width}×${circleInk.height}`
    );
    assert.ok(
      circleInk.lit > 100,
      `x^2 + y^2 = 9 must paint the circle's pixels, not merely exist as a canvas: ${circleInk.lit} lit`
    );
    assert.ok(
      circleInk.lit < circleInk.width * circleInk.height * 0.5,
      'a curve is a line, not a filled sheet'
    );

    // An inequality is the same implicit shader with its region flag on: the wash must cover the
    // interior, not merely stroke the boundary. Remove it before the synthetic shader failure so
    // the circle remains the one curve that has to survive that failure.
    await page.getByTestId('graph-add-row').click();
    await page.getByTestId('graph-expression-input').last().fill('x^2 + y^2 <= 9');
    const inequalityRow = page.getByTestId('graph-expression-row').last();
    await page.waitForFunction(
      () =>
        document.querySelectorAll('[data-testid="graph-expression-row"][data-kind="inequality"]').length === 1,
      undefined,
      { timeout: 5000 }
    );
    assert.equal(
      await inequalityRow.getAttribute('data-kind'),
      'inequality',
      'an inequality must be classified as a region, not a curve'
    );
    const filledInk = await implicitInk(page, 5000);
    assert.ok(
      filledInk.available && filledInk.lit > circleInk.lit * 2,
      `an inequality must shade its interior, not only stroke its boundary: ${circleInk.lit} -> ${filledInk.lit}`
    );
    await page.getByTestId('graph-remove-expression').last().click();

    // A shader that will not compile has to be a sentence on the sheet. The browser is asked to
    // reject the fragment shader and the next implicit line is the one that fails; the circle
    // already on the sheet must keep painting while the rejection is shown.
    await page.evaluate(() => {
      const proto = WebGL2RenderingContext.prototype;
      const compileStatus = proto.getShaderParameter;
      const infoLog = proto.getShaderInfoLog;
      window.__mechalabRestoreShader = () => {
        proto.getShaderParameter = compileStatus;
        proto.getShaderInfoLog = infoLog;
        delete window.__mechalabRestoreShader;
      };
      proto.getShaderParameter = function (shader, pname) {
        if (pname === this.COMPILE_STATUS) return false;
        return compileStatus.call(this, shader, pname);
      };
      proto.getShaderInfoLog = () => 'synthetic swiftshader rejection';
    });
    await page.getByTestId('graph-add-row').click();
    await page.getByTestId('graph-expression-input').last().fill('x^2 - y^2 = 4');
    const glNotice = page.getByTestId('graph-gl-notice');
    await glNotice.waitFor({ timeout: 5000 });
    assert.match(
      (await glNotice.textContent()) ?? '',
      /could not compile: synthetic swiftshader rejection/,
      'a refused shader must name its failure on the sheet instead of leaving a blank layer'
    );
    const afterFailure = await implicitInk(page, 100);
    assert.ok(
      afterFailure.lit > 100,
      'one refused shader must not take the curves that did compile down with it'
    );
    await page.evaluate(() => window.__mechalabRestoreShader?.());
    await page.getByTestId('graph-remove-expression').last().click();
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="graph-gl-notice"]'),
      undefined,
      { timeout: 5000 }
    );

    // A Python run can add a curve and a point row without the calculator losing the sheet above.
    await runProgram(page, 'plot("cos(x)")\nplot_points([(0, 0), (1, 1)])\n');
    await page.getByTestId('graph-points-row').waitFor({ timeout: 120000 });
    assert.match(
      (await page.getByTestId('graph-points-row').textContent()) ?? '',
      /2 points/,
      'plot_points must put the Python points in the expression list'
    );

    // `# @slider` is the one parameter syntax the editor and the graph share. The graph reads the
    // source's own range, so the same Kp/L1 the file runs is the one the graph draws.
    await setEditorCode(
      page,
      'L1 = 0.15  # @slider 0.05 0.40 0.01\nprint(L1)\n',
      STUDIO_EDITOR
    );
    await page.getByTestId('graph-python-slider-L1').waitFor({ timeout: 5000 });
    assert.equal(
      await page.getByTestId('graph-python-slider-L1').getAttribute('min'),
      '0.05',
      'the graph slider must keep the source slider’s range'
    );

    // Adding lines is a list action, not a resize. Fill the list past its scroll area first; the
    // next rows then have to leave the sheet exactly as they found it. Before the cap, every row
    // stretched the plot and its resize fit re-derived y, which made the graph expand forever.
    for (let index = 0; index < 6; index += 1) {
      await page.getByTestId('graph-add-row').click();
    }
    await page.getByTestId('graph-expression-input').last().fill('y = x');
    await page.waitForTimeout(200);
    const sheetAtCap = await graph.boundingBox();
    const windowAtCap = await graph.getAttribute('data-view');
    for (let index = 0; index < 6; index += 1) {
      await page.getByTestId('graph-add-row').click();
    }
    await page.waitForTimeout(200);
    const sheetAfter = await graph.boundingBox();
    assert.ok(
      sheetAtCap && sheetAfter && Math.abs(sheetAfter.height - sheetAtCap.height) <= 2,
      `once the list scrolls, more rows must not grow the sheet: ${sheetAtCap?.height} -> ${sheetAfter?.height}`
    );
    assert.equal(
      await graph.getAttribute('data-view'),
      windowAtCap,
      'once the list scrolls, more rows must not re-fit the sheet'
    );
    const scroller = await page.getByTestId('graph-expression-list').evaluate((node) => ({
      client: node.clientHeight,
      scroll: node.scrollHeight,
    }));
    assert.ok(
      scroller.scroll > scroller.client + 20,
      `the list must scroll once it fills the card: ${scroller.scroll} > ${scroller.client}`
    );
    ok('the expression list scrolls inside the card; rows past its cap do not grow or re-fit the sheet');

    // ---- 2b.2 General settings is the only door back into the guide, and turning the guide off is
    // a pause rather than a restart. Walk two steps, come back one, leave it on step two, then open
    // it again from the same button and demand the same step. This is the resume promise a learner
    // reads in the settings copy, exercised against real storage rather than component state.
    await page.getByTestId('btn-general-settings').click();
    await page.getByTestId('general-settings').waitFor({ state: 'visible', timeout: 5000 });
    await page.getByTestId('btn-open-new-learner-guide').click();
    await page.getByTestId('learner-guide').waitFor({ state: 'visible', timeout: 5000 });
    await page.getByTestId('general-settings').waitFor({ state: 'detached', timeout: 5000 });
    assert.match(
      (await page.getByTestId('guide-progress').innerText()).trim(),
      /^0?1 \/ \d+$/,
      'a fresh guide must open on its first step'
    );
    const firstGuideTitle = (await page.getByTestId('guide-step-title').innerText()).trim();
    await page.getByTestId('guide-next').click();
    assert.match(
      (await page.getByTestId('guide-progress').innerText()).trim(),
      /^0?2 \/ \d+$/,
      'Next must advance one step'
    );
    const secondGuideTitle = (await page.getByTestId('guide-step-title').innerText()).trim();
    assert.notEqual(secondGuideTitle, firstGuideTitle, 'the second step must be its own page');
    await page.getByTestId('guide-prev').click();
    assert.match(
      (await page.getByTestId('guide-progress').innerText()).trim(),
      /^0?1 \/ \d+$/,
      'Previous must go back one step'
    );
    assert.equal(
      (await page.getByTestId('guide-step-title').innerText()).trim(),
      firstGuideTitle,
      'Previous must return to the page it came from'
    );
    await page.getByTestId('guide-next').click();
    const pausedGuideTitle = (await page.getByTestId('guide-step-title').innerText()).trim();
    await page.getByTestId('guide-turn-off').click();
    await page.getByTestId('learner-guide').waitFor({ state: 'detached', timeout: 5000 });
    await page.getByTestId('btn-general-settings').click();
    await page.getByTestId('general-settings').waitFor({ state: 'visible', timeout: 5000 });
    await page.getByTestId('btn-open-new-learner-guide').click();
    await page.getByTestId('learner-guide').waitFor({ state: 'visible', timeout: 5000 });
    assert.match(
      (await page.getByTestId('guide-progress').innerText()).trim(),
      /^0?2 \/ \d+$/,
      'turning the guide off on step 2 must reopen on step 2'
    );
    assert.equal(
      (await page.getByTestId('guide-step-title').innerText()).trim(),
      pausedGuideTitle,
      'the reopened guide must be the page it was left on'
    );
    await page.getByTestId('guide-close').click();
    await page.getByTestId('learner-guide').waitFor({ state: 'detached', timeout: 5000 });
    ok('General settings opens the guide, Next/Previous walk it, and turn-off resumes on the same step');

    // ---- 2b.3 The guide's second mode is a tooltip that points at the real controls ----
    // It is not a slideshow behind the dialog: the guide closes, the workbench is dimmed, and each
    // Next moves the card to another control — including opening the tab the feature lives in.
    await page.getByTestId('btn-general-settings').click();
    await page.getByTestId('general-settings').waitFor({ state: 'visible', timeout: 5000 });
    await page.getByTestId('btn-open-new-learner-guide').click();
    await page.getByTestId('learner-guide').waitFor({ state: 'visible', timeout: 5000 });
    await page.getByTestId('guide-mode-walkthrough').click();
    await page.getByTestId('feature-walkthrough').waitFor({ state: 'visible', timeout: 5000 });
    await page.getByTestId('learner-guide').waitFor({ state: 'detached', timeout: 5000 });
    // The first spotlight is measured after the card mounts, so it is a separate paint: waiting
    // for the card alone would race a slow CI runner and assert before the anchor exists.
    const spotlight = page.getByTestId('walkthrough-spotlight');
    await spotlight.waitFor({ state: 'visible', timeout: 5000 });
    assert.equal(
      await spotlight.count(),
      1,
      'the tooltip mode must spotlight a real control, not draw a card in a vacuum'
    );
    assert.match(
      (await page.getByTestId('walkthrough-progress').innerText()).trim(),
      /^0?1 \/ \d+ · /,
      'the walkthrough starts from its first feature'
    );
    const firstFeature = (await page.getByTestId('walkthrough-title').innerText()).trim();
    // A stop is a task now: only its exact control may tick it. Pressing a different real header
    // control is an action, but not this mission's action, so the box must stay empty.
    assert.equal(
      await page.getByTestId('walkthrough-next').isDisabled(),
      true,
      'Next must wait for the checklist'
    );
    await page.evaluate(() => {
      document.querySelector('[data-testid="btn-theme-toggle"]')?.click();
    });
    await page.waitForTimeout(100);
    assert.equal(
      await page.getByTestId('walkthrough-checklist').getAttribute('data-done'),
      'false',
      'a different control must not check the stop'
    );
    // Do it is a shortcut for the same gesture, not a score button. The wordmark must really open
    // the introduction, and only then may the checklist tick.
    await page.getByTestId('walkthrough-do-it').click();
    await page.getByTestId('intro-page').waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="walkthrough-checklist"]')?.getAttribute('data-done') ===
        'true',
      undefined,
      { timeout: 2000 }
    );
    assert.equal(
      await page.getByTestId('walkthrough-next').isEnabled(),
      true,
      'the real action must unlock Next'
    );
    ok('only the named control checks a stop; Do it performs that control’s real action');

    // The next stop is a new, unchecked mission: Next must move the card, and the card must not be
    // able to move again until that second action is done. Previous returns to the earned tick.
    await page.getByTestId('walkthrough-next').click();
    await page.waitForFunction(
      (previous) =>
        document.querySelector('[data-testid="walkthrough-title"]')?.textContent?.trim() !== previous,
      firstFeature,
      { timeout: 5000 }
    );
    assert.equal(
      await page.getByTestId('walkthrough-next').isDisabled(),
      true,
      'an unchecked stop must not be skipped'
    );
    await page.getByTestId('walkthrough-prev').click();
    await page.waitForFunction(
      (expected) =>
        document.querySelector('[data-testid="walkthrough-title"]')?.textContent?.trim() === expected,
      firstFeature,
      { timeout: 5000 }
    );
    ok('Next/Previous move the card, and a fresh stop keeps Next locked until its own action');

    // The first ten stops open settings, reset, account and search dialogs. Rather than leave four
    // overlays stacked to reach the runner, keep the one tick the browser just earned and resume the
    // stored tour at the first Python feature. The walkthrough itself still owns the jump: this is
    // the same saved state a learner returns to, not a click route through the card.
    await page.getByTestId('walkthrough-close').click();
    await page.getByTestId('feature-walkthrough').waitFor({ state: 'detached', timeout: 5000 });
    await page.evaluate(
      ({ key, version, completed, index }) => {
        const raw = JSON.parse(localStorage.getItem(key) ?? '{}');
        localStorage.setItem(
          key,
          JSON.stringify({ ...raw, version, status: 'active', index, completed, updatedAt: Date.now() })
        );
        // The lesson-list stop's action is the chooser's fold button, which the Study preset owns.
        localStorage.setItem('mechalab_workspace_layout_v1', 'study');
      },
      {
        key: FEATURE_WALKTHROUGH_STORAGE_KEY,
        version: FEATURE_WALKTHROUGH_VERSION,
        completed: FEATURE_WALKTHROUGH.slice(0, 10).map((stop) => stop.id),
        index: 10,
      }
    );
    await page.goto(`${baseUrl}?view=home`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('home-dashboard').waitFor({ timeout: 30000 });
    await page.getByTestId('btn-general-settings').click();
    await page.getByTestId('general-settings').waitFor({ state: 'visible', timeout: 5000 });
    await page.getByTestId('btn-open-new-learner-guide').click();
    await page.getByTestId('learner-guide').waitFor({ state: 'visible', timeout: 5000 });
    await page.getByTestId('guide-mode-walkthrough').click();
    await page.getByTestId('feature-walkthrough').waitFor({ state: 'visible', timeout: 5000 });
    await page.getByTestId('walkthrough-spotlight').waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="tab-btn-tab-pyodide"]')?.getAttribute('aria-current') ===
        'page',
      undefined,
      { timeout: 5000 }
    );
    assert.match(
      (await page.getByTestId('walkthrough-progress').innerText()).trim(),
      /^11 \/ \d+ · Python runner/,
      'the stored tour must resume at the first runner feature'
    );
    // The runner's own main.py tab is a real control, but it is not this stop's action.
    await page.evaluate(() => {
      document.querySelector('[data-testid="editor-tab-main"]')?.click();
    });
    await page.waitForTimeout(100);
    assert.equal(
      await page.getByTestId('walkthrough-checklist').getAttribute('data-done'),
      'false',
      'a neighbouring editor tab must not check the lesson-list stop'
    );
    await page.getByTestId('walkthrough-do-it').click();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="walkthrough-checklist"]')?.getAttribute('data-done') ===
        'true',
      undefined,
      { timeout: 2000 }
    );
    await page.getByTestId('walkthrough-close').click();
    await page.getByTestId('feature-walkthrough').waitFor({ state: 'detached', timeout: 5000 });
    await page.getByTestId('tab-btn-tab-studio').click();
    await page.getByTestId('studio').waitFor({ state: 'visible', timeout: 30000 });
    ok('a walkthrough stop opens the tab it describes, and closing it leaves the workbench usable');

    await page.getByTestId('editor-tab-main').click();
    ok(
      'the graph keeps its expressions and viewport across faces, paints implicit curves, surfaces a shader failure, and takes Python plots and sliders'
    );

    // ---- 2c. The arrangement is this card's own, and it is remembered ----
    // A closed output pane is a chosen layout, not a reset: it has to come back after a reload. And
    // the studio writes its own key, so arranging this card cannot move the lesson editor's split.
    const lessonPanesBefore = await page.evaluate(() =>
      localStorage.getItem('mechalab_editor_panes_v1')
    );
    await page.getByTestId('btn-pane-close').click();
    assert.equal(
      await page.getByTestId('editor-panes').getAttribute('data-split'),
      'single',
      'closing the output pane leaves one pane'
    );
    await page.waitForFunction(
      () => (localStorage.getItem('mechalab_studio_panes_v1') ?? '').includes('["main"]'),
      undefined,
      { timeout: 5000 }
    );
    assert.equal(
      await page.evaluate(() => localStorage.getItem('mechalab_editor_panes_v1')),
      lessonPanesBefore,
      'the studio wrote its own key, not the lesson editor’s'
    );

    await page.reload({ waitUntil: 'domcontentloaded' });
    await reopenStudio(page);
    await page.getByTestId('editor-panes').waitFor({ timeout: 30000 });
    assert.equal(
      await page.getByTestId('editor-panes').getAttribute('data-split'),
      'single',
      'a closed output pane survives a reload'
    );
    assert.equal(
      await page.getByTestId('pane-actual').isVisible(),
      false,
      'the reloaded card draws no output pane it was not asked for'
    );
    await page.getByTestId('btn-pane-split').click();
    assert.equal(
      await page.getByTestId('editor-panes').getAttribute('data-split'),
      'split',
      'the way back is the same control'
    );
    await page.getByTestId('pane-actual').waitFor({ timeout: 5000 });
    ok('the editor arrangement is the studio’s own, and survives a reload');

    // ---- 2d. Trace and breakpoints belong to the studio too ----
    await page.getByTestId('studio-more').click();
    await page.getByTestId('studio-breakpoints').click();
    await page.getByTestId('breakpoint-panel').waitFor({ timeout: 5000 });
    assert.equal(
      await page.getByTestId('breakpoint-panel-empty').count(),
      1,
      'the More action must open the breakpoint panel before a dot exists'
    );
    const bpCode = 'a = 1\nb = 2\nprint(a + b)\n';
    await setEditorCode(page, bpCode, STUDIO_EDITOR);
    await page.getByTestId('breakpoint-slot-3').waitFor({ timeout: 5000 });
    await page.getByTestId('breakpoint-slot-3').click();
    await page.getByTestId('breakpoint-row-3').waitFor({ timeout: 5000 });
    await page.getByTestId('studio-run').click();
    await page.getByTestId('studio-paused').waitFor({ timeout: 120000 });
    assert.match(
      (await page.getByTestId('studio-paused').textContent()) ?? '',
      /line 3/,
      'the park must name the line that was armed'
    );
    await page.getByTestId('studio-continue').click();
    await page.getByTestId('studio-output').filter({ hasText: '3' }).waitFor({ timeout: 120000 });
    assert.equal(
      (await page.getByTestId('studio-output').textContent())?.trim(),
      '3',
      'Continue must finish the parked run'
    );
    await page.getByTestId('editor-tab-trace').click();
    await page.getByTestId('trace-panel').waitFor({ timeout: 5000 });
    assert.ok(
      Number(await page.getByTestId('trace-panel').getAttribute('data-trace-steps')) >= 3,
      'the studio trace must record the lines the run executed'
    );
    assert.equal(
      (await page.getByTestId('trace-code').textContent())?.trim(),
      'a = 1',
      'the trace must quote the program the run executed'
    );
    const traceBox = () =>
      page.evaluate(
        () =>
          document
            .querySelector('[data-testid="pane-main"] .cm-robot-trace-line')
            ?.textContent?.trim() ?? null
      );
    assert.equal(
      await traceBox(),
      'a = 1',
      'the open Trace tab must mark the line it quotes in the editor'
    );
    await page.getByTestId('trace-next').click();
    assert.equal(
      (await page.getByTestId('trace-code').textContent())?.trim(),
      'b = 2',
      'stepping the trace must move to the next executed line'
    );
    assert.equal(await traceBox(), 'b = 2', 'and the mark must move with the step');
    await page.getByTestId('editor-tab-main').click();
    await page.getByTestId('btn-clear-breakpoint-3').click();
    await page.getByTestId('studio-more').click();
    await page.getByTestId('studio-breakpoints').click();
    ok('a breakpoint in More parks the studio run, and Trace replays it line by line');

    // The interpreter is loaded now, so this is a stop in the middle of a loop rather than a stop
    // that happened to win the race with Pyodide's first download.
    const interruptCode = 'import time\nfor i in range(50):\n    time.sleep(0.1)\nprint("should not print")\n';
    await runProgram(page, interruptCode);
    await page.waitForTimeout(1000);
    await page.getByTestId('studio-stop').click();
    await waitForStderr(page, /^Stopped\./);
    assert.equal(
      await page.getByTestId('studio-output').textContent(),
      '',
      'a stopped run must not print the line it never reached'
    );
    ok('Stop ends a run mid-loop with its own sentence');

    // ---- 3. The killed run's code is still saved on this device ----
    await waitForStudioSaved(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await reopenStudio(page);
    await waitForEditor(page, STUDIO_EDITOR, 30000);
    assert.equal(
      await getEditorCode(page, STUDIO_EDITOR),
      interruptCode,
      'the code from a killed run must be saved, not lost with the worker'
    );
    ok('the code from a killed run survives a reload');

    // ---- 4. A runtime error is the learner's traceback, and the next Run recovers ----
    await runProgram(page, 'raise ValueError("studio e2e boom")\n');
    await waitForStderr(page, /ValueError: studio e2e boom/);
    await runProgram(page, 'print("fresh run")\n');
    await page
      .getByTestId('studio-output')
      .filter({ hasText: 'fresh run' })
      .waitFor({ timeout: 120000 });
    ok('a runtime error shows its traceback, and the next Run still executes');

    // ---- 5. The note and the code survive a reload ----
    await page.getByTestId('studio-note').fill('The tolerance is on the angle, not the position.');
    // "Saved on this device" is the idle line, so only the write's own "Saved" proves the debounce
    // landed; waiting for the idle sentence would reload before the store had the note.
    await waitForStudioSaved(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await reopenStudio(page);
    assert.equal(
      await page.getByTestId('studio-note').inputValue(),
      'The tolerance is on the angle, not the position.',
      'the notebook is saved on this device, so a reload must bring the sentence back'
    );
    assert.match(
      await getEditorCode(page, STUDIO_EDITOR),
      /fresh run/,
      'the code is saved beside the note, not only in the editor’s memory'
    );
    ok('the note and the code come back after a reload');

    // ---- 5b. The header reopens the page it was left on ----
    // The choice is a preference, not a run's state: a learner who works from the plan should not
    // land on the program on every reload, and a phone should not forget the page it was reading.
    await page.getByTestId('studio-view-plan').click();
    await page.getByTestId('studio-plan').waitFor({ timeout: 10000 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await reopenStudio(page);
    assert.equal(
      await page.getByTestId('studio-view-plan').getAttribute('aria-pressed'),
      'true',
      'a reload must reopen Plan when Plan was the page on screen'
    );
    await page.getByTestId('studio-plan').waitFor({ timeout: 10000 });
    assert.equal(
      await page.getByTestId('studio-code').count(),
      0,
      'Plan is a page of its own; the editor must not also be drawn on a desktop'
    );
    await page.getByTestId('studio-view-code').click();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await reopenStudio(page);
    await waitForEditor(page, STUDIO_EDITOR, 30000);
    assert.equal(
      await page.getByTestId('studio-plan').count(),
      0,
      'choosing Code is remembered too, not only the first choice'
    );
    ok('the header reopens on Code or Plan after a reload');

    // ---- 6. A plan drawn with no lesson also survives ----
    await page.getByTestId('studio-view-plan').click();
    await page.getByTestId('panel-workflow').waitFor({ timeout: 30000 });
    await page.getByTestId('workflow-start-blank').click();
    await page.getByTestId('workflow-add-given').click();

    // ---- 6a. The words grow with the plate ----
    // Dragging the corner used to make a bigger box holding the same 12 px sentence, so a card
    // resized to twice its height read as a stretched rectangle rather than a bigger card.
    const handle = page.locator('[data-testid^="workflow-node-resize-"]').first();
    const nodeIndex = (await handle.getAttribute('data-testid')).replace('workflow-node-resize-', '');
    const nodeTitle = page.getByTestId(`workflow-node-title-${nodeIndex}`);
    const fontSize = async () =>
      Number.parseFloat(
        await nodeTitle.evaluate((element) => getComputedStyle(element).fontSize).catch(() => '0')
      );
    const beforeSize = await fontSize();
    const box = await handle.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 140, box.y + box.height / 2 + 160, { steps: 14 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    const afterSize = await fontSize();
    assert.ok(
      afterSize > beforeSize,
      `resizing a card bigger must grow its text, saw ${beforeSize}px → ${afterSize}px`
    );
    assert.ok(
      afterSize <= 24 && afterSize > beforeSize,
      `a resized card's text stays inside the inspector's own 9–24 px range, saw ${afterSize}px`
    );
    ok(`corner resize scaled the text ${beforeSize}px → ${afterSize}px`);

    const titles = page.locator('[data-testid^="workflow-node-title-"]');
    await titles.last().waitFor({ timeout: 10000 });
    const cards = await titles.count();
    await titles.last().fill(PLAN_TITLE);
    // The workflow's write is on a 500 ms debounce; this is the wait for that write, not for paint.
    await page.waitForTimeout(900);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await reopenStudio(page);
    await page.getByTestId('studio-view-plan').click();
    await page.locator('[data-testid^="workflow-node-title-"]').last().waitFor({ timeout: 30000 });
    assert.equal(
      await page.locator('[data-testid^="workflow-node-title-"]').count(),
      cards,
      'the plan is a real workflow document: every card must come back'
    );
    assert.equal(
      await page.locator('[data-testid^="workflow-node-title-"]').last().inputValue(),
      PLAN_TITLE,
      'a plan under the reserved studio key must survive a reload like a lesson’s plan'
    );
    ok('a plan drawn with no lesson survives a reload');

    // ---- 7. The plan is in the backup, and comes back after a wipe and a restore ----
    // The backup lives in General settings now: open the dialog the way a learner does before the
    // press that saves the archive.
    await page.getByTestId('btn-general-settings').click();
    await page.getByTestId('general-settings').waitFor({ state: 'visible', timeout: 20000 });
    const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
    await page.getByTestId('btn-backup-download').click();
    const download = await downloadPromise;
    const zipPath = path.join(scratch, download.suggestedFilename());
    await download.saveAs(zipPath);
    const bytes = new Uint8Array(fs.readFileSync(zipPath));
    const read = readZip(bytes);
    assert.equal(read.ok, true, `the backup must be a readable archive (${read.reason})`);
    const files = new Map(read.entries.map((entry) => [entry.name, fromUtf8(entry.data)]));
    const workflowArchive = JSON.parse(files.get('workflow.json') ?? '{}');
    assert.ok(
      workflowArchive.workflows?.studio,
      'workflow.json must carry the studio plan under its reserved key'
    );
    assert.ok(
      workflowArchive.workflows.studio.nodes.some((node) => node.title === PLAN_TITLE),
      'the card drawn in the studio must be the card in the archive'
    );
    ok('one press writes the studio plan into the backup archive');

    await page.evaluate(() => localStorage.clear());
    await clearBulk(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await reopenStudio(page);
    await page.getByTestId('studio-view-plan').click();
    await page.getByTestId('workflow-start-blank').waitFor({ timeout: 30000 });
    assert.equal(
      await page.locator('[data-testid^="workflow-node-title-"]').count(),
      0,
      'the wipe must leave the studio plan empty, or the restore proves nothing'
    );

    // Back on a fresh page the dialog is closed: the restore lives behind the gear now.
    await page.getByTestId('btn-general-settings').click();
    await page.getByTestId('general-settings').waitFor({ state: 'visible', timeout: 20000 });
    await page.getByTestId('input-backup-file').setInputFiles(zipPath);
    const status = page.getByTestId('backup-status');
    await status.waitFor({ timeout: 20000 });
    const statusText = ((await status.textContent()) ?? '').trim();
    assert.match(statusText, /^Restored · /, `the restore must report what it added; got: ${statusText}`);
    assert.match(statusText, /workflow/, `the studio plan must be named in the report; got: ${statusText}`);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await reopenStudio(page);
    await page.getByTestId('studio-view-plan').click();
    await page.locator('[data-testid^="workflow-node-title-"]').last().waitFor({ timeout: 30000 });
    assert.equal(
      await page.locator('[data-testid^="workflow-node-title-"]').last().inputValue(),
      PLAN_TITLE,
      'a restored backup must put the studio plan back on the canvas'
    );
    ok('the studio plan survives a backup, wipe and restore');

    // ---- 8. A phone gets one pane at a time ----
    await page.setViewportSize(PHONE);
    await page.waitForTimeout(200);
    await page.getByTestId('studio-view-code').click();
    assert.equal(
      await page.getByTestId('studio-note-pane').count(),
      0,
      'at 390 px the note must not be squeezed beside the code'
    );
    assert.equal(await page.getByTestId('studio-view-note').count(), 1, 'a phone needs its Note button');
    await page.getByTestId('studio-view-note').click();
    await page.getByTestId('studio-note').waitFor({ timeout: 10000 });
    assert.equal(
      await page.getByTestId('studio-code').count(),
      0,
      'a phone shows Note instead of Code, never both'
    );
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    assert.ok(overflow <= 1, `the studio must not scroll sideways at 390 px (by ${overflow} px)`);
    ok('a phone shows Code, Plan or Note one at a time, with no sideways scroll');

    assert.deepEqual(pageErrors, [], `the studio threw during the walk: ${pageErrors.join(' | ')}`);
    console.log(
      '[PASS] Studio: Home opens it; Run, Stop and a runtime error each leave their own sentence, and a fresh Run recovers; killed code, the note and the plan survive reloads; and the plan survives a backup, wipe and restore; its editor is the runner’s card, with split panes and a remembered Vim choice, and its own arrangement surviving a reload; and its Code or Plan page returning after one'
    );
    await context.close();
  } finally {
    await browser.close();
    if (ownServer) await ownServer.viteServer.close();
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('[FAIL] Studio checks failed:', error.message);
  process.exit(1);
});
