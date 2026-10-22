/**
 * Vim keys in the editor: the preference, and the word for the mode (`app/src/vimMode.ts`).
 *
 * The plan's row was "Themes, contrast, reduced motion, keyboard", and the only keyboard gap it named
 * was the one a learner brings with them: *"No keymap (Vim/Emacs)."* CodeMirror's default keymap
 * already carries the emacs-style line motions (`Ctrl-a/e/f/b/n/p`), so the real work is Vim — and it
 * is a **dependency**, not something to re-implement: [`@replit/codemirror-vim`](../package.json) is
 * the CM5 Vim emulation ported to CM6, and a hand-written subset would be a different editor half the
 * time. It lives in `pythonEditorImpl.tsx`, i.e. inside the editor's own lazily loaded chunk, so a
 * visit that never opens the editor still pays nothing for it.
 *
 * Three rules, and the tests in `scripts/test_vim.mjs` exist to keep them:
 *
 * 1. **Off unless the learner said so, and remembered once they did.** Vim's normal mode reads every
 *    keystroke as a command: a beginner who typed `i` and saw nothing appear would decide the editor
 *    is broken. The choice is stored like focus mode and watch mode, and blocked storage costs the
 *    memory of the choice, never the toggle.
 * 2. **The mode is on screen.** When the keys are commands, the screen has to say which mode is
 *    reading them, or "why did my typing not appear?" has no answer the learner can see. The badge is
 *    the same fact the rest of the app states in words: what is happening, not what to do about it.
 * 3. **Turning it off leaves nothing behind.** The editor is the same editor with the extension
 *    removed — the document, the undo history and the caret are untouched, because the Vim plugin is a
 *    compartment of the existing state, not a new editor.
 */

export const STORAGE_KEY_VIM = 'mechalab_vim_v1';

/** The toolbar control's label, the same words whether it is on or off. */
export const VIM_LABEL = 'Vim keys';

/** What the toolbar control's title promises, in the state it is in. */
export function vimHint(on: boolean): string {
  return on
    ? 'Vim keys are on. Press E to leave them: the editor goes back to typing straight into the file.'
    : 'Read the editor like Vim: Escape for normal mode, then i to type, dd to delete a line, u to undo.';
}

/** The badge's words for the mode the plugin is in: `normal` -> `NORMAL`. */
export function vimModeLabel(mode: string | null | undefined): string {
  const name = (mode ?? '').trim();
  // Vim starts in normal mode and the plugin reports nothing until the first change, so an absent
  // mode is not "unknown": it is the mode the editor opens in.
  if (!name) return 'NORMAL';
  // `visual line` and `visual block` arrive as two words; one line reads better than a stray space.
  return name.toUpperCase().replace(/\s+/g, ' ');
}

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** The remembered preference: off when nothing is stored or the value is not one of ours. */
export function readVim(): boolean {
  const store = storage();
  if (!store) return false;
  try {
    return store.getItem(STORAGE_KEY_VIM) === 'on';
  } catch {
    return false;
  }
}

/**
 * Remember the preference and return what to render.
 *
 * Returns the argument rather than what was stored, for the same reason the layout presets do: with
 * storage blocked there is nothing stored, and the control still has to work for this visit.
 */
export function writeVim(on: boolean): boolean {
  const store = storage();
  if (store) {
    try {
      store.setItem(STORAGE_KEY_VIM, on ? 'on' : 'off');
    } catch {
      // Blocked or full: the choice lasts this visit only.
    }
  }
  return on;
}
