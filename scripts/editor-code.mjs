/**
 * Read and write the learner's code from a browser suite.
 *
 * The editor is CodeMirror now, not a textarea, so `.fill()` / `.inputValue()` no longer exist. The
 * app exposes a two-method bridge per editor (`window.__mechalabEditors['editor-main']`) and these
 * helpers use it: setting through the view means React's `value` and the document change together,
 * which is what the run button reads. Driving the DOM at random offsets would be a test of
 * CodeMirror's internal markup rather than of the workbench.
 */

export const MAIN_EDITOR = 'editor-main';
/** The locked lesson helper (the shared plant); reachable once its tab is selected. */
export const HELPER_EDITOR = 'editor-helper';

/** Resolves once an editor with this key is mounted (it remounts on a lesson change). */
export async function waitForEditor(page, key = MAIN_EDITOR, timeout = 20000) {
  await page.waitForFunction(
    (wanted) => Boolean(window.__mechalabEditors && window.__mechalabEditors[wanted]),
    key,
    { timeout }
  );
}

export async function setEditorCode(page, text, key = MAIN_EDITOR) {
  await waitForEditor(page, key);
  await page.evaluate(
    ({ wanted, value }) => window.__mechalabEditors[wanted].set(value),
    { wanted: key, value: text }
  );
}

export async function getEditorCode(page, key = MAIN_EDITOR) {
  await waitForEditor(page, key);
  return page.evaluate((wanted) => window.__mechalabEditors[wanted].get(), key);
}
