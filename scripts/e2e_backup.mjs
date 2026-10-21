#!/usr/bin/env node
/**
 * Back up, wipe, restore — in a real browser (`scripts/e2e_backup.mjs`, `npm run test:e2e:backup`).
 *
 * The unit suite pins the archive format and the merge rules against a fake store. What it cannot pin
 * is the part a learner actually touches: the header button produces a file the browser is willing to
 * save, the file survives being read back by the app's own reader, and a restore puts state back into
 * the **screen** — not just into `localStorage`. That last one is the real risk in this feature: the
 * App holds its own copy of the progress maps, so a restore that only wrote the stores would show a
 * milestone unticked until the next reload. The suite therefore asserts the tick returns *without*
 * reloading, which is only true if the restore event reached the component.
 *
 * The progress it backs up is made by the UI, not seeded: the suite clicks the first roadmap milestone
 * button, so the flag in the archive is one the app itself wrote. The draft is seeded straight into the
 * store, because typing into CodeMirror is the editor's own test surface, not this one's - and the
 * restore still has to carry it back into the editor, which is checked by selecting that lesson.
 *
 * Finally the negative path: a file that is not a backup must be refused with a sentence, and must
 * leave the browser's own progress exactly where it was.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { getEditorCode, waitForEditor } from './editor-code.mjs';
import { resolveChromiumExecutable, startDevServer } from './e2e_browser_workbench.mjs';
// The app's own reader, so the archive the browser wrote is checked by the code that restores it.
import { readZip, fromUtf8 } from '../app/src/backupZip.ts';

const MILESTONE_SELECTOR = '[data-testid^="btn-milestone-"]';
const DRAFT_LESSON = 'P.3';
const DRAFT_MARKER = 'restored draft line';

async function openRoadmap(page) {
  await page.getByTestId('tab-btn-tab-arch').click();
  await page.waitForSelector(MILESTONE_SELECTOR, { timeout: 20000 });
}

async function milestoneState(page, testId) {
  const button = page.getByTestId(testId);
  await button.waitFor({ timeout: 20000 });
  return (await button.textContent())?.trim() ?? '';
}

/** Wait for a milestone button to read what it should, then hand back its text for the message. */
async function waitForMilestone(page, testId, pattern, timeout = 20000) {
  await page.waitForFunction(
    ({ id, source, flags }) =>
      new RegExp(source, flags).test(
        document.querySelector(`[data-testid="${id}"]`)?.textContent ?? ''
      ),
    { id: testId, source: pattern.source, flags: pattern.flags },
    { timeout }
  );
  return milestoneState(page, testId);
}

async function main() {
  const ownServer = process.env.E2E_BASE_URL ? null : await startDevServer(process.cwd());
  const baseUrl = process.env.E2E_BASE_URL ?? ownServer.baseUrl;
  const executablePath = resolveChromiumExecutable();
  const browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    headless: true,
  });
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'mechalab-backup-'));
  try {
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(document.querySelector('#root *')), undefined, {
      timeout: 30000,
    });

    // ---- Progress the app itself wrote: one milestone, ticked by the UI ----
    await openRoadmap(page);
    // The plain "Mark done" buttons are a pass's steps; the first ones in the DOM are a bench's, whose
    // label is the track name. `nth(1)` skips the pass's first step on purpose: that card collapses
    // once it is done, and a button that leaves the DOM could not show the tick coming back.
    const candidate = page
      .locator(MILESTONE_SELECTOR, { hasText: 'Mark done (self-reported)' })
      .nth(1);
    const candidateTestId = await candidate.getAttribute('data-testid');
    assert.ok(candidateTestId, 'the roadmap must offer a self-reported milestone to tick');
    const milestoneId = candidateTestId.replace('btn-milestone-', '');
    await page.getByTestId(`btn-milestone-${milestoneId}`).click();
    assert.match(
      await waitForMilestone(page, `btn-milestone-${milestoneId}`, /Marked done/),
      /Marked done/,
      'the milestone click must tick the button before anything is backed up'
    );

    // ---- A draft and a log event, seeded into the stores the backup reads ----
    // The editor text is the editor suite's surface, not this one's; the draft store is a plain map,
    // and what this suite proves is that a restore puts it back where the learner can use it.
    await page.evaluate(
      ({ lesson, marker }) => {
        localStorage.setItem(
          'mechalab_drafts_v1',
          JSON.stringify({ [lesson]: `# worked example\nprint("${marker}")\n` })
        );
        localStorage.setItem(
          'mechalab.learningLog.v1',
          JSON.stringify([{ t: 1_700_000_000_000, kind: 'lesson_open', lesson }])
        );
      },
      { lesson: DRAFT_LESSON, marker: DRAFT_MARKER }
    );

    // ---- One press: a zip the browser saves ----
    const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
    await page.getByTestId('btn-backup-download').click();
    const download = await downloadPromise;
    const zipPath = path.join(scratch, download.suggestedFilename());
    await download.saveAs(zipPath);
    assert.match(
      download.suggestedFilename(),
      /^mechalab-backup-\d{4}-\d{2}-\d{2}\.zip$/,
      `the download must be dated and named as a backup; got ${download.suggestedFilename()}`
    );
    const bytes = new Uint8Array(fs.readFileSync(zipPath));
    assert.ok(bytes.length > 0, 'the backup file must not be empty');

    const read = readZip(bytes);
    assert.equal(read.ok, true, `the app must write an archive it can read back (${read.reason})`);
    const files = new Map(read.entries.map((entry) => [entry.name, fromUtf8(entry.data)]));
    for (const name of ['manifest.json', 'progress.json', 'drafts.json', 'history.json', 'learning-log.json', 'README.txt']) {
      assert.ok(files.has(name), `the archive must carry ${name}`);
    }
    const manifest = JSON.parse(files.get('manifest.json'));
    const progress = JSON.parse(files.get('progress.json'));
    assert.equal(progress.completedMilestones[milestoneId], true, 'the clicked milestone must be in the archive');
    assert.ok(manifest.counts.milestones >= 1, `expected the manifest to count the milestone: ${JSON.stringify(manifest.counts)}`);
    assert.ok(manifest.counts.drafts >= 1, 'the seeded draft must be in the archive');
    assert.ok(manifest.counts.events >= 1, 'the seeded log event must be in the archive');
    assert.match(await page.getByTestId('backup-status').textContent(), /^Backed up · /);
    console.log(
      `  ok one press wrote a readable archive (${bytes.length} bytes, ${read.entries.length} files, ` +
        `manifest counts ${JSON.stringify(manifest.counts)})`
    );

    // ---- Wipe everything, and prove the wipe took ----
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await openRoadmap(page);
    assert.match(
      await waitForMilestone(page, `btn-milestone-${milestoneId}`, /Mark done \(self-reported\)/),
      /Mark done \(self-reported\)/,
      'after the wipe the milestone must read as unticked, or the restore proves nothing'
    );
    console.log('  ok the wipe leaves the milestone unticked');

    // ---- Restore it, and see the tick come back without a reload ----
    await page.getByTestId('input-backup-file').setInputFiles(zipPath);
    const status = page.getByTestId('backup-status');
    await status.waitFor({ timeout: 20000 });
    const statusText = (await status.textContent()).trim();
    assert.match(statusText, /^Restored · /, `the restore must report what it added; got: ${statusText}`);
    assert.match(statusText, /milestone/, `the milestone must be named in the report; got: ${statusText}`);
    assert.match(
      await waitForMilestone(page, `btn-milestone-${milestoneId}`, /Marked done/),
      /Marked done/,
      'the tick must return without a reload — the restore event is what redraws it'
    );
    const restoredFlags = await page.evaluate(
      () => JSON.parse(localStorage.getItem('mechalab_linear_milestones_v1') ?? '{}')
    );
    assert.equal(restoredFlags[milestoneId], true, 'the flag must be back in the store as well as on screen');
    console.log(`  ok restore reports "${statusText}" and the milestone is ticked again, no reload`);

    // ---- The draft arrives in the editor, which is the only place it is useful ----
    await page.getByTestId('tab-btn-tab-pyodide').click();
    await page.getByTestId(`lesson-item-${DRAFT_LESSON}`).click();
    await waitForEditor(page, undefined, 20000);
    await page.waitForFunction(
      (marker) => Boolean(window.__mechalabEditors?.['editor-main']?.get()?.includes(marker)),
      DRAFT_MARKER,
      { timeout: 20000 }
    );
    const code = await getEditorCode(page);
    assert.match(
      code,
      new RegExp(DRAFT_MARKER),
      `selecting the lesson must load the restored draft; editor held: ${code.slice(-120)}`
    );
    console.log(`  ok the restored draft opens in ${DRAFT_LESSON}'s editor`);

    // ---- The negative path: a file that is not a backup, refused with a sentence ----
    const notBackup = path.join(scratch, 'not-a-backup.zip');
    fs.writeFileSync(notBackup, 'this is a shopping list, not a backup\n');
    await page.getByTestId('input-backup-file').setInputFiles(notBackup);
    await page.waitForFunction(
      () =>
        /not a MechaLab backup/.test(
          document.querySelector('[data-testid="backup-status"]')?.textContent ?? ''
        ),
      undefined,
      { timeout: 20000 }
    );
    // The roadmap tab is unmounted here, so the honest check is the store the refused file did not
    // touch: a refusal must not be a half-import.
    const afterRefusal = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('mechalab_linear_milestones_v1') ?? '{}')
    );
    assert.equal(
      afterRefusal[milestoneId],
      true,
      'a refused restore must leave the browser’s own progress exactly as it was'
    );
    console.log('  ok a file that is not a backup is refused and changes nothing');

    assert.deepEqual(pageErrors, [], `the page threw during backup/restore: ${pageErrors.join(' | ')}`);
    console.log(
      `[PASS] Backup: the header wrote a ${bytes.length}-byte archive the app reads back, a wipe was restored ` +
        `to the store and the screen without a reload, the draft reopened in the editor, and a bad file was refused`
    );
  } finally {
    await browser.close();
    if (ownServer) await ownServer.viteServer.close();
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('[FAIL] Backup checks failed:', error.message);
  process.exit(1);
});
