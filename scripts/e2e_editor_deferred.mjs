#!/usr/bin/env node
/**
 * The editor's deferred chunk, in a real browser (`scripts/e2e_editor_deferred.mjs`,
 * `npm run test:editor:deferred`).
 *
 * `npm run check:weight` proves the editor is not in the entry — a number in a budget file. It cannot
 * prove what the learner sees while that chunk is in flight, and those are two different promises:
 *
 * - **the chunk arrives late** — the code is already readable as monospace text, the Run button is
 *   enabled, and CodeMirror takes over the same box without a reload (part B, a normal visit);
 * - **the chunk never arrives** — a deploy that replaced the hashed file, or an offline visit serving
 *   an index that names it. Before the boundary in `PythonEditor.tsx` this threw out of the lazy
 *   component, and an app with no other boundary would have unmounted: the lesson, the Run button and
 *   the learner's own code with it. Part A blocks the module at the network and asserts the opposite —
 *   the screen survives, says which half is missing, and Run is still there.
 *
 * The block is a route abort rather than a slow server: a failure that is deterministic is a failure
 * worth pinning, and the "slow" half is what the placeholder is for, which part B walks through.
 */

import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { resolveChromiumExecutable, startDevServer } from './e2e_browser_workbench.mjs';
import { getEditorCode, waitForEditor } from './editor-code.mjs';
import { PYTHON_LESSONS } from '../app/src/data/pythonLessonsData.ts';

/** The lesson the app opens on, and the first line of its starter: what must be readable. */
const LESSON = PYTHON_LESSONS[0];
const FIRST_STARTER_LINE = LESSON.starterCode.split('\n')[0].trim();

/** A phrase from further down the starter, so the check is the file and not one echoed line. */
const LATER_STARTER_LINE = LESSON.starterCode
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line && line !== FIRST_STARTER_LINE)
  .pop();

/** The same modules Vite emits, in dev (source path) and in the built bundle (`assets/…-hash.js`). */
const EDITOR_CHUNK = '**/*pythonEditorImpl*';

/** Where the editor is, as the DOM says it: the shell's placeholder, or CodeMirror's own view. */
async function editorState(page) {
  return page.evaluate(() => ({
    placeholder: Boolean(document.querySelector('[data-editor-ready="false"]')),
    mounted: Boolean(document.querySelector('[data-editor="editor-main"] .cm-editor')),
    bridge: Boolean(window.__mechalabEditors?.['editor-main']),
    preview: document.querySelector('[data-testid="editor-main-preview"]')?.textContent ?? '',
    notice: document.querySelector('[data-testid="editor-main-notice"]')?.textContent ?? '',
  }));
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
    // ---- Part A: the chunk never arrives ----
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      // Only uncaught exceptions: React logs a caught boundary error through `console.error`, and this
      // check is about the app surviving, not about the log it leaves behind.
      const crashed = [];
      page.on('pageerror', (error) => crashed.push(error.message));
      await page.route(EDITOR_CHUNK, (route) => route.abort());

      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => Boolean(document.querySelector('#root *')), undefined, {
        timeout: 30000,
      });

      // The boundary catches the rejection and leaves the placeholder standing. Waiting for its notice
      // is waiting for the failure to have happened, rather than for a timer to have expired.
      await page.waitForSelector('[data-testid="editor-main-notice"]', { timeout: 20000 });
      const failed = await editorState(page);
      assert.equal(failed.mounted, false, 'the editor cannot have mounted: its module was blocked');
      assert.equal(failed.bridge, false, 'the test bridge belongs to the editor and must be absent too');
      assert.match(failed.notice, /could not be loaded/, 'the notice must name what is missing');
      assert.match(failed.notice, /Run still works/, 'and what is not: running the lesson is unaffected');
      assert.ok(
        failed.preview.includes(FIRST_STARTER_LINE) && failed.preview.includes(LATER_STARTER_LINE),
        `the learner's code must still be on screen; preview began: ${failed.preview.slice(0, 80)}`
      );
      // The same text, where a learner without sight of the editor reads it.
      const bodyText = await page.evaluate(() => document.body.innerText);
      assert.ok(
        bodyText.includes(FIRST_STARTER_LINE) && bodyText.includes(LATER_STARTER_LINE),
        'the code must be in the page text, not only in an attribute'
      );

      const run = page.getByTestId('btn-run-verify');
      assert.equal(await run.isVisible(), true, 'Run must survive the editor failing');
      assert.equal(await run.isEnabled(), true, 'and it must be pressable, not a dead button');
      // The lesson around it as well: a boundary that kept the editor and lost the lesson would be a
      // different bug with the same symptom.
      assert.equal(await page.getByTestId('lesson-title').isVisible(), true, 'the lesson must survive');
      assert.deepEqual(crashed, [], `the page threw instead of catching: ${crashed.join(' | ')}`);
      console.log(
        '  ok a blocked editor chunk leaves the code readable, the notice named, Run pressable, and no crash'
      );
      await context.close();
    }

    // ---- Part B: an ordinary visit, the chunk arrives ----
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));

      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => Boolean(document.querySelector('#root *')), undefined, {
        timeout: 30000,
      });

      // The placeholder is on screen first: it is what makes the swap a swap rather than a blank box.
      const early = await editorState(page);
      assert.equal(early.mounted, false, 'the editor is its own chunk: it cannot be there at first paint');
      assert.equal(early.placeholder, true, 'the placeholder must stand in for it');
      assert.ok(
        early.preview.includes(FIRST_STARTER_LINE),
        'the placeholder must show the starter, not a spinner'
      );

      await waitForEditor(page, 'editor-main', 20000);
      await page.waitForSelector('[data-editor-ready="true"]', { timeout: 20000 });
      const ready = await editorState(page);
      assert.equal(ready.mounted, true, 'CodeMirror must take over the box it replaced');
      assert.equal(ready.placeholder, false, 'and the placeholder must be gone, not left underneath');
      assert.equal(ready.notice, '', 'a successful visit must not show the failure notice');
      const code = await getEditorCode(page);
      assert.ok(code.includes(FIRST_STARTER_LINE), 'the document must carry the starter through');

      // The editor is the source of truth for a run: typing through the view must reach the app.
      const marker = '# the deferred editor is live';
      await page.evaluate((text) => window.__mechalabEditors['editor-main'].set(text), `${code}\n${marker}`);
      await page.waitForFunction(
        (wanted) =>
          document.body.innerText.includes(wanted) ||
          (window.__mechalabEditors?.['editor-main']?.get() ?? '').includes(wanted),
        marker,
        { timeout: 10000 }
      );
      assert.ok((await getEditorCode(page)).includes(marker), 'an edit through the view must persist');

      assert.deepEqual(pageErrors, [], `the page threw during a normal visit: ${pageErrors.join(' | ')}`);
      console.log('  ok the placeholder paints the starter, CodeMirror takes over, and edits reach the app');
    }

    console.log('[PASS] Editor deferred: a blocked chunk leaves the code, a named notice and a live Run button; ' +
      'a normal visit swaps the placeholder for the editor and its edits reach the app');
  } finally {
    await browser.close();
    if (ownServer) await ownServer.viteServer.close();
  }
}

main().catch((error) => {
  console.error('[FAIL] Deferred editor checks failed:', error.message);
  process.exit(1);
});
