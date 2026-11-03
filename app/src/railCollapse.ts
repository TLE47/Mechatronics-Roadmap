/**
 * The tab rail's fold (`app/src/railCollapse.ts`).
 *
 * At `xl` the rail is an activity bar down the left edge: twelve tabs at 196 px, on every lesson and
 * every simulator. That width is worth paying on the first visit, when the names are how a learner
 * finds their way, and worth reclaiming afterwards, when the icons already say which tab is which.
 *
 * Three rules, the same three the cards' folds follow (`app/src/fold.ts`):
 *
 * 1. **The fold is a preference.** It lives in `localStorage` beside the layout and the palette, so a
 *    learner who folds the rail keeps it folded across a reload and a lesson switch.
 * 2. **The way back is in the same place.** The toggle is the rail's own first row, so a folded rail
 *    is not a hidden rail: the button that folded it is the button that unfolds it.
 * 3. **The store never decides what is on screen.** `readRailCollapsed` is the starting value and
 *    `writeRailCollapsed` a best-effort save; blocked storage costs the memory, never the toggle.
 *
 * Below `xl` the rail is a horizontal strip whose labels are the whole point of the row, so there is
 * nothing to fold and the toggle is not rendered.
 */

export const STORAGE_KEY_RAIL_COLLAPSED = 'mechalab_rail_collapsed_v1';

/** The stored fold; a missing or unreadable key reads as expanded, which is where a first visit starts. */
export function readRailCollapsed(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(STORAGE_KEY_RAIL_COLLAPSED) === '1';
  } catch {
    return false;
  }
}

/** Files the fold. A store that refuses leaves the rail folded for this visit only. */
export function writeRailCollapsed(collapsed: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY_RAIL_COLLAPSED, collapsed ? '1' : '0');
  } catch {
    // Nothing to say: the rail holds its state until the page is reloaded, and nothing is lost.
  }
}
