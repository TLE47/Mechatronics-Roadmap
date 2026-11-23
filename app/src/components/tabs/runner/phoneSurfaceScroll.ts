/**
 * Where a phone's page sits when Study switches surfaces (`phoneSurfaceScroll.ts`).
 *
 * The lesson text and the editor are panels in one page, so a switch moves the page to the chosen
 * one. Once the Python keys are open the editor pane owns that position instead: `EditorCodePane`
 * puts the mode bar under the header and sizes the code band above the keys. A scroll to the card's
 * top after that would undo it and leave the mode bar half a screen down — the scrollbar moving on
 * its own while a learner types. The tab asks these helpers instead of repeating the rule.
 */

import type { PhoneSurface } from '../../../phoneSurface';

const PYTHON_KEYS_UP = '[data-testid="mobile-keyboard-shell"][data-state="open"]';

/** True while the phone's Python keys are open, because then the editor pane owns the page. */
export function pythonKeysOwnThePage(): boolean {
  return typeof document !== 'undefined' && document.querySelector(PYTHON_KEYS_UP) !== null;
}

/**
 * Move the page to the surface just chosen, after the switch has drawn. The offset comes from
 * `scroll-margin-top` in `index.css`, so the sticky header and tab picker do not cover its title.
 */
export function revealPhoneSurface(surface: PhoneSurface): void {
  if (typeof window === 'undefined') return;
  window.setTimeout(() => {
    if (surface === 'code' && pythonKeysOwnThePage()) return;
    const target =
      surface === 'code'
        ? document.getElementById('python-runner-editor')
        : document.querySelector<HTMLElement>('[data-testid="lesson-reader"]');
    target?.scrollIntoView({ block: 'start' });
  }, 80);
}

/**
 * Move a stored Code surface to the editor once the lazy editor's first mount gives the card its
 * height. Returns the cleanup the mount effect owes.
 */
export function revealStoredPhoneCode(): () => void {
  if (typeof window === 'undefined') return () => {};
  const timer = window.setTimeout(() => {
    if (pythonKeysOwnThePage()) return;
    document.getElementById('python-runner-editor')?.scrollIntoView({ block: 'start' });
  }, 180);
  return () => window.clearTimeout(timer);
}
