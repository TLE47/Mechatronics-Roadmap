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
 *  - **Split** — the editor on the left, the results on the right. The plan's fourth arrangement, and
 *    the one a wide screen has been asking for since Read shipped: at 1440 px the stacked work area
 *    shows the code and the output one above the other, so a run's verdict sits off-screen while the
 *    line it is about is in view. Split's divider **drags**: the share of the width the editor gets
 *    is a remembered number (below), because how much code versus output a learner wants is a
 *    judgement about their own screen and the lesson, not a constant this file can pick. Docking
 *    (moving a panel to another edge) and an activity bar are still absent.
 *
 * The rules are a table, and the table is the whole module, which is why it is here rather than
 * inline in the runner: what a preset *hides* is the thing that is wrong when a button produces a
 * blank screen, and it is trivial to pin without a browser (`npm run test:layout`).
 */

export type WorkspaceLayout = 'study' | 'write' | 'read' | 'split';

/** How the regions that are left are arranged on a wide screen: one column, or two. */
export type WorkspaceArrangement = 'stack' | 'columns';

/** The regions a preset can hide. `list` and `editor` are single elements; `results` is the output. */
export type WorkspaceRegion = 'list' | 'editor' | 'results';

export interface LayoutOption {
  id: WorkspaceLayout;
  label: string;
  /** The keyboard shortcut, as the button prints it. */
  shortcut: string;
  /** What the button promises, for a reader who hovers or listens to a screen reader. */
  title: string;
  /** Which way the remaining regions sit once the width is wide enough for two. */
  arrangement: WorkspaceArrangement;
}

export const LAYOUTS: LayoutOption[] = [
  {
    id: 'study',
    label: 'Study',
    shortcut: '⌥1',
    title: 'Study layout (⌥1): the lesson list, the editor and the results',
    arrangement: 'stack',
  },
  {
    id: 'write',
    label: 'Write',
    shortcut: '⌥2',
    title: 'Write layout (⌥2): the editor only — the lesson list and the results are hidden',
    arrangement: 'stack',
  },
  {
    id: 'read',
    label: 'Read',
    shortcut: '⌥3',
    title: 'Read layout (⌥3): the results only — the editor and the lesson list are hidden',
    arrangement: 'stack',
  },
  {
    id: 'split',
    label: 'Split',
    shortcut: '⌥4',
    title: 'Split layout (⌥4): the editor on the left and the results on the right, side by side',
    arrangement: 'columns',
  },
];

export const DEFAULT_LAYOUT: WorkspaceLayout = 'study';
export const STORAGE_KEY_LAYOUT = 'mechalab_workspace_layout_v1';

// ---------------------------------------------------------------------------------------------
// Split's divider: how much of the width the editor gets.
//
// Stored as a **share of the work area**, not as pixels, because the same learner moves between a
// laptop and a monitor: 42% of 1150 px and 42% of 1800 px are both the arrangement they chose, while
// 480 px is two different amounts of code.
// ---------------------------------------------------------------------------------------------
export const STORAGE_KEY_SPLIT_RATIO = 'mechalab_split_ratio_v1';
export const DEFAULT_SPLIT_RATIO = 0.5;

/**
 * Neither column may fall below 30% of the work area.
 *
 * At 1440 px the area is about 1150 px, so 30% is a 345 px editor: a line of Python, its line number
 * and the breakpoint gutter, still without wrapping. A 15/85 drag looks like it works until the code
 * starts wrapping, at which point the learner has changed what their program looks like in order to
 * see the output, which is the opposite of what the divider is for.
 */
export const SPLIT_MIN_RATIO = 0.3;
export const SPLIT_MAX_RATIO = 0.7;

/** One arrow key moves the divider 2% of the width; with Shift, 10%. */
export const SPLIT_KEY_STEP = 0.02;
export const SPLIT_KEY_STEP_SHIFT = 0.1;

/** A ratio that is always usable: a number in range, or the even split for anything else. */
export function clampSplitRatio(value: unknown): number {
  const ratio = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(ratio)) return DEFAULT_SPLIT_RATIO;
  return Math.min(SPLIT_MAX_RATIO, Math.max(SPLIT_MIN_RATIO, ratio));
}

/** The share as the whole percent a separator announces (`aria-valuenow`), never a fraction. */
export function splitRatioPercent(ratio: number): number {
  return Math.round(clampSplitRatio(ratio) * 100);
}

/**
 * The container's two tracks, as a grid template.
 *
 * Fractions rather than percentages: the 16 px gap between the columns comes out of the free space
 * before either track is sized, so a 50/50 split is exactly two equal columns. Percentages would
 * make the pair 100% wide plus the gap, and the row would scroll sideways.
 */
export function splitGridTemplate(ratio: number): string {
  const left = Math.round(clampSplitRatio(ratio) * 1000) / 1000;
  const right = Math.round((1 - left) * 1000) / 1000;
  return `minmax(0, ${left}fr) minmax(0, ${right}fr)`;
}

/**
 * Where a pointer at `clientX` puts the divider.
 *
 * `width` is the **free space** the two columns share, which is the container minus its gap: the
 * tracks divide what is left after the gap, so measuring against the full width would put the
 * boundary half a gap behind the pointer for every drag.
 */
export function splitRatioAt(clientX: number, left: number, width: number): number | null {
  if (!Number.isFinite(clientX) || !Number.isFinite(left) || !Number.isFinite(width) || width <= 0) {
    return null;
  }
  return clampSplitRatio((clientX - left) / width);
}

/**
 * The share a key asks for, or null for a key the divider does not answer.
 *
 * Left and Right move the divider the way it looks like it should move: a vertical separator whose
 * left column is the editor, so Right hands the editor more room. Home and End are the two extremes
 * a keyboard user otherwise cannot reach by holding an arrow.
 */
export function splitRatioAfterKey(ratio: number, key: string, shift = false): number | null {
  const step = shift ? SPLIT_KEY_STEP_SHIFT : SPLIT_KEY_STEP;
  switch (key) {
    case 'ArrowLeft':
      return clampSplitRatio(ratio - step);
    case 'ArrowRight':
      return clampSplitRatio(ratio + step);
    case 'Home':
      return SPLIT_MIN_RATIO;
    case 'End':
      return SPLIT_MAX_RATIO;
    default:
      return null;
  }
}

const SHOWN: Record<WorkspaceLayout, Record<WorkspaceRegion, boolean>> = {
  // Study is the app as it always was; every other preset is defined by what it takes away.
  study: { list: true, editor: true, results: true },
  write: { list: false, editor: true, results: false },
  read: { list: false, editor: false, results: true },
  // Split hides one thing (the chooser) and arranges the rest in two columns.
  split: { list: false, editor: true, results: true },
};

export function isLayout(value: unknown): value is WorkspaceLayout {
  return value === 'study' || value === 'write' || value === 'read' || value === 'split';
}

/**
 * How the regions a preset keeps are laid out.
 *
 * A separate question from *which* regions show: Split shows the same two as a stacked Study with the
 * chooser hidden, and the whole difference is the container's grid. Keeping the two rules apart is
 * what lets the tests pin them apart.
 */
export function layoutArrangement(layout: WorkspaceLayout): WorkspaceArrangement {
  return LAYOUTS.find((option) => option.id === layout)?.arrangement ?? 'stack';
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
// The divider's reader and writer sit beside the preset's, for the same reason: a stored value is
// validated rather than trusted, and a blocked store costs the memory, never the drag.
export function readSplitRatio(): number {
  const store = storage();
  if (!store) return DEFAULT_SPLIT_RATIO;
  try {
    const raw = store.getItem(STORAGE_KEY_SPLIT_RATIO);
    if (raw === null || raw.trim() === '') return DEFAULT_SPLIT_RATIO;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? clampSplitRatio(parsed) : DEFAULT_SPLIT_RATIO;
  } catch {
    return DEFAULT_SPLIT_RATIO;
  }
}

/** Remember the divider and return the share to render (the clamp, not what was asked for). */
export function writeSplitRatio(ratio: number): number {
  const clamped = clampSplitRatio(ratio);
  const store = storage();
  if (store) {
    try {
      store.setItem(STORAGE_KEY_SPLIT_RATIO, String(clamped));
    } catch {
      // Blocked or full: the drag lasts this visit only.
    }
  }
  return clamped;
}

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
