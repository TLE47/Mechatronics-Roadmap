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
      () => (localStorage.getItem('mechalab_studio_panes_v1') ?? '').includes('["main",null]'),
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
      '[PASS] Studio: Home opens it; Run, Stop and a runtime error each leave their own sentence, and a fresh Run recovers; killed code, the note and the plan survive reloads; and the plan survives a backup, wipe and restore; its editor is the runner’s card, with split panes and a remembered Vim choice, and its own arrangement surviving a reload'
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
