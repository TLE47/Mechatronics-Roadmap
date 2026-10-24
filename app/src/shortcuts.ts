/**
 * Every key the workbench answers, in one table (`app/src/shortcuts.ts`).
 *
 * A shortcut nobody can find is a secret, and a list of shortcuts written by hand in a modal goes
 * stale the first time a key changes. This table is the modal's only source, it is exported so a
 * unit suite can pin that no two keys claim one action and no action is listed twice, and it is in
 * the palette (`Keyboard shortcuts`), so `⌘K` finds the sheet that explains `⌘K`.
 *
 * The `keys` text is what the learner types, not a code: `⌘` and `⌥` are the Macs the shortcuts were
 * chosen for, and Windows/Linux readers get the same physical keys under Ctrl/Alt.
 *
 * Six rows carry a `keymapAction` and can be rebound in the sheet ([`keymap.ts`](keymap.ts)); their
 * keys are read from the map when one is passed. The rest are fixed on purpose: the four presets are
 * a positional family, F9/F12 belong to the caret, Escape and Tab belong to dialogs, and the palette
 * and divider keys move a highlight rather than doing something.
 */

// The `.ts` extension is for Node's type stripping (`scripts/test_keymap.mjs`).
import { formatChord, type Keymap, type KeymapAction } from './keymap.ts';

export interface ShortcutRow {
  /** How the key is written on a Mac keyboard, e.g. `⌘⇧F`. */
  keys: string;
  /** What it does, in one sentence a beginner can act on. */
  action: string;
  /** The app-wide action this row's key can be changed for, when it can be. */
  keymapAction?: KeymapAction;
}

export const SHORTCUT_ROWS: ShortcutRow[] = [
  {
    keys: '⌘K',
    action: 'The palette: every lesson, tab and command. The same key closes it.',
    keymapAction: 'palette',
  },
  {
    keys: '⌘P',
    action: 'Open a lesson by its id, its title or one of its two ideas.',
    keymapAction: 'lessons',
  },
  {
    keys: '⌘⇧F',
    action: 'Search inside the lessons: starter code, hints, checks and expected output.',
    keymapAction: 'search',
  },
  {
    keys: '?',
    action: 'This sheet — the key itself must be typed outside an editor or a field.',
    keymapAction: 'sheet',
  },
  {
    keys: '⌘↵',
    action: 'Run the lesson in the editor, or check the answer the predict gate is holding.',
    keymapAction: 'run',
  },
  {
    keys: 'F9',
    action: 'Breakpoint on the caret’s line; press it again to arm it off.',
  },
  {
    keys: 'F12',
    action: 'Go to the line that defines the name under the caret (or ⌘-click the name).',
  },
  {
    keys: '⌥1 – ⌥4',
    action:
      'Study, Write, Read or Debug — the lesson text and the code, the editor alone, the text alone, or the editor beside its results.',
  },
  {
    keys: '⌘.',
    action: 'Focus mode on or off: the chrome out of the way, the work left.',
    keymapAction: 'focus',
  },
  {
    keys: '← →  Home  End',
    action: 'Move Debug’s divider when it has focus; ⇧ moves it in bigger steps.',
  },
  {
    keys: '↑ ↓  ↵  Esc',
    action: 'In the palette: move the highlight, open the row, leave without opening.',
  },
  {
    keys: 'Esc',
    action: 'Also closes this sheet, and leaves focus mode when a dialog is not open.',
  },
];

/**
 * The sheet's rows, grouped by nothing: the order above is a reading order, not a ranking.
 *
 * With a keymap, the six remappable rows print the key that is actually bound; without one the
 * table is the shipped list, which is what the unit suites pin.
 */
export function shortcutRows(keymap?: Keymap): ShortcutRow[] {
  if (!keymap) return SHORTCUT_ROWS;
  return SHORTCUT_ROWS.map((row) =>
    row.keymapAction ? { ...row, keys: formatChord(keymap[row.keymapAction]) } : row
  );
}
