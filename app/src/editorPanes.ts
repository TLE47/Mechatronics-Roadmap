/**
 * The editor's tabs and panes (`app/src/editorPanes.ts`).
 *
 * The editor card used to have one body and one optional strip of output under it: every run pushed
 * the code up, and a split beside the code was a single remembered boolean. That is a workspace with
 * one arrangement and no way to say "show me the expected output and the code, not the actual one".
 * This module is the small state machine behind the tabs that replaced it:
 *
 *  - a **view** is what a pane can show: `main` (the lesson's Python, or its read-only helper),
 *    `actual` (the last run's stdout and verdict) and `expected` (the presentation check);
 *  - a **pane** is one slot of the editor body. One slot is the normal editor; a second slot makes
 *    the body a split, side by side (`columns`) or one above the other (`rows`), the way a terminal
 *    multiplexer is arranged;
 *  - a **focus** says which slot the next tab press fills. Pressing the tab of a view already open
 *    in the other slot focuses that slot instead of opening the same view twice.
 *
 * Two panes is the bound, deliberately. Three tabs at a 1280 px window are three 380 px columns of
 * Python, which is narrower than the code's own line length; a third pane would be a feature that
 * looks free in a menu and costs the answer. The tabs themselves are unbounded: every output view is
 * one press away without being on screen.
 *
 * Everything here is pure and validated at the edge, because the two failures that matter are
 * invisible in a happy-path screenshot: a stored pane that no view can fill (a blank editor card on
 * load), and a view open in both slots (two `pre-actual-stdout` nodes, which breaks every reader and
 * every test that asks the page for "the" output). `normalizePanes` is the single door those values
 * go through, and `npm run test:panes` pins it.
 */

export const EDITOR_VIEWS = ['main', 'actual', 'expected'] as const;

export type EditorView = (typeof EDITOR_VIEWS)[number];

/** What each pane's tab says. `main` is the file's own name, added by the runner. */
export const EDITOR_VIEW_LABELS: Record<EditorView, string> = {
  main: 'main.py',
  actual: 'Run output',
  expected: 'Expected',
};

/** Which way two panes divide the body. */
export type PaneAxis = 'columns' | 'rows';

/**
 * One or two slots, which way a split divides, and which slot the next tab press fills.
 *
 * `views[0]` is never null: a body with no pane is not an arrangement, it is a blank card. Slot 1
 * holds the second pane, or null when there is no split.
 */
export interface EditorPanes {
  views: [EditorView, EditorView | null];
  axis: PaneAxis;
  focus: 0 | 1;
}

export const DEFAULT_PANES: EditorPanes = { views: ['main', null], axis: 'columns', focus: 0 };

export const STORAGE_KEY_EDITOR_PANES = 'mechalab_editor_panes_v1';

/** The most panes the body will hold. A split is the feature; a wall of 200 px columns is not. */
export const MAX_PANES = 2;

export function isEditorView(value: unknown): value is EditorView {
  return value === 'main' || value === 'actual' || value === 'expected';
}

export function isPaneAxis(value: unknown): value is PaneAxis {
  return value === 'columns' || value === 'rows';
}

/**
 * A usable arrangement from anything: a stored object, a half-written one, or nothing.
 *
 * Junk is dropped view by view rather than taking the whole object's default, so one bad slot does
 * not also forget the axis and the focus. A duplicate is removed by first occurrence, which is what
 * keeps "the same view in both panes" from ever rendering two outputs; an empty list falls back to
 * the editor, because a card that fills itself with nothing cannot be recovered from inside the UI.
 */
export function normalizePanes(value: unknown): EditorPanes {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const raw = Array.isArray(record.views) ? record.views : [];
  const views: EditorView[] = [];
  for (const entry of raw) {
    if (isEditorView(entry) && !views.includes(entry)) views.push(entry);
    if (views.length === MAX_PANES) break;
  }
  if (views.length === 0) views.push('main');
  const axis: PaneAxis = isPaneAxis(record.axis) ? record.axis : DEFAULT_PANES.axis;
  const split = views.length > 1;
  // A focus on an empty slot would make the next tab press write nowhere; it follows the split.
  const focus: 0 | 1 = split && record.focus === 1 ? 1 : 0;
  return {
    views: [views[0], split ? views[1] : null],
    axis,
    focus,
  };
}

/** Every view on screen, in slot order. Never empty, never a duplicate. */
export function visibleViews(panes: EditorPanes): EditorView[] {
  return panes.views[1] ? [panes.views[0], panes.views[1]] : [panes.views[0]];
}

/** The slot a view occupies, or null when it is not on screen. */
export function slotFor(panes: EditorPanes, view: EditorView): 0 | 1 | null {
  if (panes.views[0] === view) return 0;
  if (panes.views[1] === view) return 1;
  return null;
}

/** Whether the body is split into two panes. */
export function isSplit(panes: EditorPanes): boolean {
  return panes.views[1] !== null;
}

/** The view to offer for a new pane: the next one that is not the editor's own. */
export function nextView(current: EditorView): EditorView {
  const index = EDITOR_VIEWS.indexOf(current);
  return EDITOR_VIEWS[(index + 1) % EDITOR_VIEWS.length];
}

/** Put a view on screen without opening the same view twice. */
export function showView(panes: EditorPanes, view: EditorView): EditorPanes {
  const slot = slotFor(panes, view);
  if (slot !== null) return { ...panes, focus: slot };
  const target = panes.views[1] && panes.focus === 1 ? 1 : 0;
  const views: [EditorView, EditorView | null] =
    target === 1 && panes.views[1]
      ? [panes.views[0], view]
      : [view, panes.views[1]];
  return normalizePanes({ ...panes, views, focus: target });
}

/**
 * Open a second pane, showing `view` (or a sensible next view) beside the editor's.
 *
 * Pressed with no view in mind it offers the pair that makes a split useful: from the editor, the
 * run output; from an output, the editor. Pressed while already split, it only focuses the second
 * pane when the requested view is the one it already shows; asking for a different view replaces
 * that pane's view rather than stacking a third.
 */
export function splitPane(panes: EditorPanes, view?: EditorView): EditorPanes {
  const wanted = view && view !== panes.views[0] ? view : null;
  if (panes.views[1]) {
    if (!wanted || wanted === panes.views[1]) return { ...panes, focus: 1 };
    return normalizePanes({ ...panes, views: [panes.views[0], wanted], focus: 1 });
  }
  // From the editor, a split opens on the run output; from an output, it opens on the editor. The
  // pair a learner asks for when they press Split is code-and-result, whichever half they were
  // looking at, not whichever view happens to be next in the list.
  const second = wanted ?? (panes.views[0] === 'main' ? 'actual' : 'main');
  return normalizePanes({ ...panes, views: [panes.views[0], second], focus: 1 });
}

/**
 * Close the second pane.
 *
 * The first slot is kept, not the focused one: closing a pane should leave the editor where it was,
 * and a tab that was only open in the pane being closed is one press away again.
 */
export function closeSplit(panes: EditorPanes): EditorPanes {
  return normalizePanes({ ...panes, views: [panes.views[0], null], focus: 0 });
}

/** Choose which way two panes divide. Remembered even while there is no split. */
export function setAxis(panes: EditorPanes, axis: PaneAxis): EditorPanes {
  return normalizePanes({ ...panes, axis });
}

/** Focus a slot that exists; a focus on an empty slot is not a state. */
export function focusSlot(panes: EditorPanes, slot: 0 | 1): EditorPanes {
  if (slot === 1 && !panes.views[1]) return panes;
  return { ...panes, focus: slot };
}

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** The remembered panes, or the editor alone when nothing stored or the value is unusable. */
export function readPanes(): EditorPanes {
  const store = storage();
  if (!store) return { ...DEFAULT_PANES };
  try {
    const raw = store.getItem(STORAGE_KEY_EDITOR_PANES);
    if (raw === null || raw.trim() === '') return { ...DEFAULT_PANES };
    return normalizePanes(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_PANES };
  }
}

/** Remember an arrangement and return the normalized value to render. */
export function writePanes(panes: EditorPanes): EditorPanes {
  const normalized = normalizePanes(panes);
  const store = storage();
  if (store) {
    try {
      store.setItem(STORAGE_KEY_EDITOR_PANES, JSON.stringify(normalized));
    } catch {
      // Blocked or full: the arrangement lasts this visit only.
    }
  }
  return normalized;
}
