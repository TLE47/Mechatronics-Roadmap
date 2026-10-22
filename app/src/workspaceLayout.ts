/**
 * The workbench's layout presets (`app/src/workspaceLayout.ts`).
 *
 * `docs/PLAN-2.0-GAP.md` has one flat row here: *"one fixed two-column layout per tab; no docking, no
 * presets."* Docking is a framework; a preset is a decision about which of three regions deserves the
 * screen right now, and a learner makes that decision with one thing in mind:
 *
 *  - **Study** — everything: the lesson list, the editor, the results. What the tab opens as.
 *  - **Write** — the editor and nothing beside it. The results of the last run are half the height of
 *    the work area, and while drafting an answer they are a mirror of code that has already changed.
 *  - **Read** — the results, with the editor out of the way: a learner rereading a traceback on a
 *    laptop should not scroll past 300 px of code to see where it stopped.
 *
 * Three, not the plan's four: the work area stacks the editor over the results rather than setting
 * them side by side, so there is no fourth arrangement to name. Docking, an activity bar and a
 * side-by-side split are still absent and stay listed as such.
 *
 * The rules are a table, and the table is the whole module, which is why it is here rather than
 * inline in the runner: what a preset *hides* is the thing that is wrong when a button produces a
 * blank screen, and it is trivial to pin without a browser (`npm run test:layout`).
 */

export type WorkspaceLayout = 'study' | 'write' | 'read';

/** The regions a preset can hide. `list` and `editor` are single elements; `results` is the output. */
export type WorkspaceRegion = 'list' | 'editor' | 'results';

export interface LayoutOption {
  id: WorkspaceLayout;
  label: string;
  /** The keyboard shortcut, as the button prints it. */
  shortcut: string;
  /** What the button promises, for a reader who hovers or listens to a screen reader. */
  title: string;
}

export const LAYOUTS: LayoutOption[] = [
  {
    id: 'study',
    label: 'Study',
    shortcut: '⌥1',
    title: 'Study layout (⌥1): the lesson list, the editor and the results',
  },
  {
    id: 'write',
    label: 'Write',
    shortcut: '⌥2',
    title: 'Write layout (⌥2): the editor only — the lesson list and the results are hidden',
  },
  {
    id: 'read',
    label: 'Read',
    shortcut: '⌥3',
    title: 'Read layout (⌥3): the results only — the editor and the lesson list are hidden',
  },
];

export const DEFAULT_LAYOUT: WorkspaceLayout = 'study';
export const STORAGE_KEY_LAYOUT = 'mechalab_workspace_layout_v1';

const SHOWN: Record<WorkspaceLayout, Record<WorkspaceRegion, boolean>> = {
  // Study is the app as it always was; every other preset is defined by what it takes away.
  study: { list: true, editor: true, results: true },
  write: { list: false, editor: true, results: false },
  read: { list: false, editor: false, results: true },
};

export function isLayout(value: unknown): value is WorkspaceLayout {
  return value === 'study' || value === 'write' || value === 'read';
}

/** Does this preset show that region? The one function the runner's three `display` rules call. */
export function layoutShows(layout: WorkspaceLayout, region: WorkspaceRegion): boolean {
  return SHOWN[layout][region];
}

/**
 * The preset a key names: `1` is the first, and anything else is no shortcut at all.
 *
 * Accepts a `KeyboardEvent.code` (`Digit2`) as well as a key (`2`), because ⌥2 on a Mac types `™` and
 * the shorthand is defined by the physical key, not by the character Option composes.
 */
export function layoutShortcutFor(key: string): WorkspaceLayout | null {
  const digit = /^(?:Digit)?([1-9])$/.exec(key)?.[1];
  if (!digit) return null;
  return LAYOUTS[Number(digit) - 1]?.id ?? null;
}

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** The remembered preset, or the default when nothing is stored or the value is not one of ours. */
export function readLayout(): WorkspaceLayout {
  const store = storage();
  if (!store) return DEFAULT_LAYOUT;
  try {
    const raw = store.getItem(STORAGE_KEY_LAYOUT);
    return isLayout(raw) ? raw : DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

/**
 * Remember a preset and return the one to render.
 *
 * Returns the argument rather than what was stored, for the same reason focus mode does: with
 * storage blocked there is nothing stored, and the button still has to work for this visit.
 */
export function writeLayout(layout: WorkspaceLayout): WorkspaceLayout {
  const store = storage();
  if (store) {
    try {
      store.setItem(STORAGE_KEY_LAYOUT, layout);
    } catch {
      // Blocked or full: the choice lasts this visit only.
    }
  }
  return layout;
}
