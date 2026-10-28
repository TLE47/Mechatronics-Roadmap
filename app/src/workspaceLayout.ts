/**
 * The workbench's layout presets (`app/src/workspaceLayout.ts`).
 *
 * `docs/PLAN-2.0-GAP.md` has one flat row here: *"one fixed two-column layout per tab; no docking, no
 * presets."* Docking is a framework; a preset is a decision about which of three regions deserves the
 * screen right now, and a learner makes that decision with one thing in mind:
 *
 *  - **Study** — the lesson text on the left, the editor and its results on the right. What the tab
 *    opens as: the explanation and the code it is about are one screen, which is the whole point of
 *    the reader.
 *  - **Write** — the editor and nothing beside it. The results of the last run are a mirror of code
 *    that has already changed, and the lesson is read once; while drafting an answer, neither is
 *    what the learner is looking at.
 *  - **Read** — the lesson text alone, at a comfortable measure. This is the preset a learner uses
 *    when they are reading rather than typing, and it is also the honest name for it: the old Read
 *    preset showed the *results*, which was a different task wearing the same word.
 *  - **Debug** — the editor and the results side by side, which is where a traceback is read. At
 *    1440 px the stacked work area shows the code and the output one above the other, so a run's
 *    verdict sits off-screen while the line it is about is in view. Debug's divider **drags**: the
 *    share of the width the editor gets is a remembered number (below), because how much code
 *    versus output a learner wants is a judgement about their own screen and the lesson, not a
 *    constant this file can pick.
 *
 * **Read used to mean results-only.** A stored `'split'` or a learner's muscle memory still reaches
 * this file: `readLayout` maps the old id to `debug`, so a browser that chose Split before the
 * rename opens on the same two columns rather than on the default.
 *
 * **Docking** is the other half of that sentence: a panel that is beside another one can sit on
 * either edge. Study's lesson text can be docked right of the editor, and Debug's results can be
 * docked left of the editor — the arrangement a learner wants when the thing they read *after*
 * typing should be where their eyes already are. Both sides are remembered, and neither changes
 * which regions a preset shows; a dock is a side, never a visibility. The stored `list` field of
 * the old chooser dock is read as `lesson`: the panel that sits beside the editor changed, not the
 * preference about which side the reading happens on. The one control is the
 * button that names what it will move in the preset in force, because a second control for the
 * panel that is not on screen is a button that appears to do nothing.
 *
 * The side lives in the arithmetic too. `splitRatio` is always *the editor's share*, so a results
 * column on the left gets the other track, a pointer at `x` is measured from whichever side the
 * editor is on, and `Home`/`End` still put the handle at the edge they name rather than at the
 * smallest number the load-bearing track can take.
 *
 * The rules are a table, and the table is the whole module, which is why it is here rather than
 * inline in the runner: what a preset *hides* is the thing that is wrong when a button produces a
 * blank screen, and it is trivial to pin without a browser (`npm run test:layout`).
 */

export type WorkspaceLayout = 'study' | 'write' | 'read' | 'debug';

export type WorkspaceArrangement = 'stack' | 'columns' | 'workbench';

/** The regions a preset can hide: the lesson text, the editor, and everything that reports on it. */
export type WorkspaceRegion = 'lesson' | 'editor' | 'results';

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
    title: 'Study layout (⌥1): the lesson text beside the editor, with the results below',
    arrangement: 'workbench',
  },
  {
    id: 'write',
    label: 'Write',
    shortcut: '⌥2',
    title: 'Write layout (⌥2): the editor only — the lesson text and the results are hidden',
    arrangement: 'stack',
  },
  {
    id: 'read',
    label: 'Read',
    shortcut: '⌥3',
    title: 'Read layout (⌥3): the lesson text only — the editor and the results are hidden',
    arrangement: 'stack',
  },
  {
    id: 'debug',
    label: 'Debug',
    shortcut: '⌥4',
    title:
      'Debug layout (⌥4): the editor and the results side by side — the results dock on either edge',
    arrangement: 'columns',
  },
];

export const DEFAULT_LAYOUT: WorkspaceLayout = 'study';
export const STORAGE_KEY_LAYOUT = 'mechalab_workspace_layout_v1';

// ---------------------------------------------------------------------------------------------
// Debug's divider: how much of the width the editor gets.
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

/**
 * A ratio that is always usable: a number in range, or the even split for anything else.
 *
 * Snapped to a whole percent, because the separator's `aria-valuenow` is a whole percent and the two
 * numbers have to be the same one. Before this, a drag that landed at 34.5% announced 34 while the
 * editor measured 35: a one-pixel lie of the kind a screen-reader user cannot see. One percent is
 * ~11 px on a 1150 px work area, so a drag does not feel stepped.
 */
export function clampSplitRatio(value: unknown): number {
  const ratio = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(ratio)) return DEFAULT_SPLIT_RATIO;
  const clamped = Math.min(SPLIT_MAX_RATIO, Math.max(SPLIT_MIN_RATIO, ratio));
  return Math.round(clamped * 100) / 100;
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
export function splitGridTemplate(ratio: number, resultsSide: DockSide = 'right'): string {
  const editor = Math.round(clampSplitRatio(ratio) * 1000) / 1000;
  const results = Math.round((1 - editor) * 1000) / 1000;
  const [first, second] = resultsSide === 'left' ? [results, editor] : [editor, results];
  return `minmax(0, ${first}fr) minmax(0, ${second}fr)`;
}

/**
 * Where a pointer at `clientX` puts the divider.
 *
 * `width` is the **free space** the two columns share, which is the container minus its gap: the
 * tracks divide what is left after the gap, so measuring against the full width would put the
 * boundary half a gap behind the pointer for every drag.
 */
export function splitRatioAt(
  clientX: number,
  left: number,
  width: number,
  resultsSide: DockSide = 'right'
): number | null {
  if (!Number.isFinite(clientX) || !Number.isFinite(left) || !Number.isFinite(width) || width <= 0) {
    return null;
  }
  // Measured from the container's left edge, then read as the editor's share: with the results
  // docked left the editor is the track on the right, so the distance from the left edge is the
  // results' share and the editor's is what is left.
  const fromLeft = (clientX - left) / width;
  return clampSplitRatio(resultsSide === 'left' ? 1 - fromLeft : fromLeft);
}

/**
 * The share a key asks for, or null for a key the divider does not answer.
 *
 * Left and Right move the divider the way it looks like it should move: a vertical separator whose
 * left column is the editor, so Right hands the editor more room. Home and End are the two extremes
 * a keyboard user otherwise cannot reach by holding an arrow.
 */
export function splitRatioAfterKey(
  ratio: number,
  key: string,
  shift = false,
  resultsSide: DockSide = 'right'
): number | null {
  const step = shift ? SPLIT_KEY_STEP_SHIFT : SPLIT_KEY_STEP;
  // The keys move the handle, not the number: with the results docked left, `←` gives the editor
  // (on the right) more room and `Home` puts the handle at the container's left edge, where the
  // editor is at its widest. The announcement is still the editor's share, whichever side it is on.
  const left = resultsSide === 'left';
  switch (key) {
    case 'ArrowLeft':
      return clampSplitRatio(left ? ratio + step : ratio - step);
    case 'ArrowRight':
      return clampSplitRatio(left ? ratio - step : ratio + step);
    case 'Home':
      return left ? SPLIT_MAX_RATIO : SPLIT_MIN_RATIO;
    case 'End':
      return left ? SPLIT_MIN_RATIO : SPLIT_MAX_RATIO;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Docking: which edge a panel that sits beside another one takes.
// ---------------------------------------------------------------------------------------------
export type DockSide = 'left' | 'right';

/** The two panels that can have a panel beside them, and the side each one is docked to. */
export interface WorkspaceDock {
  lesson: DockSide;
  results: DockSide;
}

export const DEFAULT_DOCK: WorkspaceDock = { lesson: 'left', results: 'right' };
export const STORAGE_KEY_DOCK = 'mechalab_workspace_dock_v1';

export function isDockSide(value: unknown): value is DockSide {
  return value === 'left' || value === 'right';
}

/**
 * A stored dock, field by field: one junk side is that field's default, not the whole object's.
 *
 * A build that once wrote `'top'` for the results should not also forget that the learner had
 * docked the chooser on the right.
 */
export function normalizeDock(value: unknown): WorkspaceDock {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  // `list` is the old chooser dock, stored before the reader took that edge; the side carries over
  // because it is a preference about where reading happens, and the reading pane is what changed.
  const lesson = record.lesson ?? record.list;
  return {
    lesson: isDockSide(lesson) ? lesson : DEFAULT_DOCK.lesson,
    results: isDockSide(record.results) ? record.results : DEFAULT_DOCK.results,
  };
}

/** The region whose side this preset can change, or null when nothing sits beside anything. */
export function dockTarget(layout: WorkspaceLayout): 'lesson' | 'results' | null {
  if (layout === 'study') return 'lesson';
  if (layout === 'debug') return 'results';
  return null;
}

/** The dock with the panel this preset can move on its other edge; other presets are unchanged. */
export function flippedDock(dock: WorkspaceDock, layout: WorkspaceLayout): WorkspaceDock {
  const region = dockTarget(layout);
  if (!region) return dock;
  return { ...dock, [region]: dock[region] === 'left' ? 'right' : 'left' };
}

export interface DockControl {
  region: 'lesson' | 'results';
  /** The side the panel would move to. */
  side: DockSide;
  /** The button's own text: an action, in the preset in force. */
  label: string;
  /** What the button promises, for a reader who hovers or listens to a screen reader. */
  title: string;
}

/**
 * The one dock button's words, or null when this preset has nothing beside a panel.
 *
 * Write hides everything but the editor and Read hides everything but the lesson text, so in both
 * there is no second edge to move anything to; a button there would be a control whose press changes
 * nothing on screen.
 */
export function dockControl(
  dock: WorkspaceDock,
  layout: WorkspaceLayout
): DockControl | null {
  const region = dockTarget(layout);
  if (!region) return null;
  const side: DockSide = dock[region] === 'left' ? 'right' : 'left';
  if (region === 'lesson') {
    return {
      region,
      side,
      label: side === 'right' ? 'Lesson → Right' : 'Lesson → Left',
      title: `Move the lesson text to the ${side} of the editor. Remembered for this browser.`,
    };
  }
  return {
    region,
    side,
    label: side === 'left' ? 'Results → Left' : 'Results → Right',
    title: `Move the results to the ${side} of the editor. Remembered for this browser.`,
  };
}

/** The remembered dock, or the defaults when nothing is stored or the value is not a dock. */
export function readDock(): WorkspaceDock {
  const store = storage();
  if (!store) return { ...DEFAULT_DOCK };
  try {
    const raw = store.getItem(STORAGE_KEY_DOCK);
    if (raw === null || raw.trim() === '') return { ...DEFAULT_DOCK };
    return normalizeDock(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_DOCK };
  }
}

/** Remember a dock and return what to render (normalized, not what was asked for). */
export function writeDock(dock: WorkspaceDock): WorkspaceDock {
  const normalized = normalizeDock(dock);
  const store = storage();
  if (store) {
    try {
      store.setItem(STORAGE_KEY_DOCK, JSON.stringify(normalized));
    } catch {
      // Blocked or full: the side lasts this visit only.
    }
  }
  return normalized;
}

const SHOWN: Record<WorkspaceLayout, Record<WorkspaceRegion, boolean>> = {
  // Study is the app as it always was; every other preset is defined by what it takes away.
  study: { lesson: true, editor: true, results: true },
  write: { lesson: false, editor: true, results: false },
  read: { lesson: true, editor: false, results: false },
  // Debug hides the lesson text and arranges the editor and the results in two columns.
  debug: { lesson: false, editor: true, results: true },
};

export function isLayout(value: unknown): value is WorkspaceLayout {
  return value === 'study' || value === 'write' || value === 'read' || value === 'debug';
}

/**
 * How the regions a preset keeps are laid out.
 *
 * A separate question from *which* regions show: Debug shows the same two as a stacked Study with the
 * chooser and the lesson text hidden, and the whole difference is the container's grid. Keeping the
 * two rules apart is what lets the tests pin them apart.
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

/**
 * A stored preset, including the one this build renamed.
 *
 * `split` was the editor-and-results preset before `debug` took the name and the slot. A browser
 * that saved it should open on those two columns, not be reset to Study because a string changed.
 */
export function normalizeLayout(value: unknown): WorkspaceLayout {
  if (value === 'split') return 'debug';
  return isLayout(value) ? value : DEFAULT_LAYOUT;
}

/** The remembered preset, or the default when nothing is stored or the value is not one of ours. */
export function readLayout(): WorkspaceLayout {
  const store = storage();
  if (!store) return DEFAULT_LAYOUT;
  try {
    return normalizeLayout(store.getItem(STORAGE_KEY_LAYOUT));
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

/**
 * Whether the output sits beside the code or under it (`mechalab_results_split_v1`).
 *
 * One boolean, and a layout preference rather than a preset: the editor and the run's output are the
 * two things a reader moves their eyes between, so the split is a property of that card instead of
 * a fifth preset. Under the editor by default — a narrow window has no side to put it on — and
 * remembered, because a learner who asked for the terminal beside the code asked once.
 */
export const STORAGE_KEY_RESULTS_SPLIT = 'mechalab_results_split_v1';

export function readResultsSplit(): boolean {
  const store = storage();
  if (!store) return false;
  try {
    return store.getItem(STORAGE_KEY_RESULTS_SPLIT) === 'split';
  } catch {
    return false;
  }
}

/** Remember the choice and return the value to render; a blocked store costs the memory only. */
export function writeResultsSplit(split: boolean): boolean {
  const store = storage();
  if (store) {
    try {
      store.setItem(STORAGE_KEY_RESULTS_SPLIT, split ? 'split' : 'stacked');
    } catch {
      // Blocked or full: the choice lasts this visit only.
    }
  }
  return split;
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
