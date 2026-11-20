/**
 * The Python editor's own preferences (`app/src/editor/editorSettings.ts`).
 *
 * These are properties of the code surface, not of a lesson and not of the whole workbench: a
 * learner who finds the hover cards noisy while typing can put them away without losing completion,
 * linting or inline values. They live on this device, beside the theme and the Vim preference.
 *
 * The one switch today is `tooltips`: it removes the `cm-mechalab-tip` cards (hover help and call
 * signatures) and leaves every other CodeMirror surface untouched. The default is **on**, so a
 * browser that has never opened the editor menu behaves exactly as it did before the switch existed.
 */

export const EDITOR_SETTINGS_EVENT = 'mechalab-editor-settings';
export const EDITOR_SETTINGS_KEY = 'mechalab_editor_settings_v1';

export interface EditorSettings {
  /** Hover cards, call signatures and keyword help. */
  tooltips: boolean;
}

const DEFAULTS: EditorSettings = { tooltips: true };

function store(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readEditorSettings(): EditorSettings {
  try {
    const raw = store()?.getItem(EDITOR_SETTINGS_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULTS };
    const record = parsed as Partial<EditorSettings>;
    return { tooltips: record.tooltips !== false };
  } catch {
    return { ...DEFAULTS };
  }
}

/** Write one preference and tell every mounted editor; returns the settings to render. */
export function writeEditorSettings(next: EditorSettings): EditorSettings {
  const value = { tooltips: next.tooltips !== false };
  try {
    store()?.setItem(EDITOR_SETTINGS_KEY, JSON.stringify(value));
  } catch {
    // A blocked store costs the memory, never the switch.
  }
  try {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(EDITOR_SETTINGS_EVENT));
  } catch {
    // ignore
  }
  return value;
}
