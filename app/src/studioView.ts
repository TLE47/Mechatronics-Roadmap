/**
 * Which free-study tool is on screen (`app/src/studioView.ts`).
 *
 * The studio has three tools behind one header: the scratch program, the plan canvas and the
 * notebook. On a desktop the note sits beside the work and the header switches between Code and
 * Plan; at 390 px only one fits, so all three are a choice. That choice is a preference, like the tab
 * rail's fold and the editor's arrangement, so it lives in `localStorage` and deliberately not in the
 * studio's store or a backup: a restored archive has no business deciding which pane this device was
 * reading.
 *
 * Two rules, the same ones every preference here keeps:
 *
 * 1. **The store never decides what is on screen.** `readStudioView` is the starting value and
 *    `writeStudioView` a best-effort save; blocked storage costs the memory, never the button.
 * 2. **Only the three words are a view.** Anything else — a missing key, a cleared one, a
 *    hand-edited `output` — reads as Code, because a header with no pressed tab is a workspace that
 *    cannot say what it is showing. `note` is kept even on a desktop, where the notebook is the
 *    aside: the same browser narrowed to a phone should find the page it was last reading.
 */

export const STUDIO_VIEWS = ['code', 'plan', 'note'] as const;

export type StudioView = (typeof STUDIO_VIEWS)[number];

/** Where the free-study header keeps its choice. */
export const STORAGE_KEY_STUDIO_VIEW = 'mechalab_studio_view_v1';

/** A first visit, and every unusable value, opens the program. */
export const DEFAULT_STUDIO_VIEW: StudioView = 'code';

export function isStudioView(value: unknown): value is StudioView {
  return value === 'code' || value === 'plan' || value === 'note';
}

/** A usable view from anything: one of ours, or the program. */
export function normalizeStudioView(value: unknown): StudioView {
  return isStudioView(value) ? value : DEFAULT_STUDIO_VIEW;
}

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** The remembered view, or Code when nothing is stored or the value is not one of ours. */
export function readStudioView(): StudioView {
  const store = storage();
  if (!store) return DEFAULT_STUDIO_VIEW;
  try {
    return normalizeStudioView(store.getItem(STORAGE_KEY_STUDIO_VIEW));
  } catch {
    return DEFAULT_STUDIO_VIEW;
  }
}

/** Remember the choice and return what to render. Blocked storage keeps it for this visit only. */
export function writeStudioView(view: StudioView): StudioView {
  const normalized = normalizeStudioView(view);
  const store = storage();
  if (store) {
    try {
      store.setItem(STORAGE_KEY_STUDIO_VIEW, normalized);
    } catch {
      // Blocked or full: the choice lasts this visit only.
    }
  }
  return normalized;
}
