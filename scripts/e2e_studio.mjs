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
    await page.getByTestId('trace-next').click();
    assert.equal(
      (await page.getByTestId('trace-code').textContent())?.trim(),
      'b = 2',
      'stepping the trace must move to the next executed line'
    );
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
