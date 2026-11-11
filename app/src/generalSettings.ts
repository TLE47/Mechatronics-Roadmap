/**
 * General settings (`app/src/generalSettings.ts`).
 *
 * The action tray is icon-first so it fits a narrow window, but an icon is a guess: a learner who
 * does not know the funnel means "format" pays a tooltip on every visit. This switch keeps the small
 * text labels on the tray buttons even at compact widths. Off by default, because the icons plus the
 * hover names are the dense layout most people asked for; on is a reading preference, remembered on
 * this device the same way the theme and the fold keys are.
 */

export const GENERAL_SETTINGS_EVENT = 'mechalab-general-settings';

/**
 * Fired when a control outside the header asks for General settings (the sound door). The dialog is
 * mounted once with the header, so a press on the speaker's detail button opens the same surface
 * the gear does instead of a second popover with its own copy of the audio controls.
 */
export const OPEN_GENERAL_SETTINGS_EVENT = 'mechalab-open-general-settings';

export function openGeneralSettings(): void {
  try {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(OPEN_GENERAL_SETTINGS_EVENT));
  } catch {
    // A blocked event costs the press, never the page.
  }
}
export const SHOW_ACTION_LABELS_KEY = 'mechalab_show_action_labels_v1';

function store(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readShowActionLabels(): boolean {
  try {
    return store()?.getItem(SHOW_ACTION_LABELS_KEY) === '1';
  } catch {
    return false;
  }
}

/** Write the switch and tell every mounted header; returns what to render. */
export function writeShowActionLabels(on: boolean): boolean {
  try {
    const bucket = store();
    if (bucket) bucket.setItem(SHOW_ACTION_LABELS_KEY, on ? '1' : '0');
  } catch {
    // A blocked store costs the memory, never the switch.
  }
  try {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(GENERAL_SETTINGS_EVENT));
  } catch {
    // ignore
  }
  return on;
}
