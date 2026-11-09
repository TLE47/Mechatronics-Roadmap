/**
 * The editor's tabs and panes (`app/src/editorPanes.ts`).
 *
 * The editor card used to have one body and one optional strip of output under it: every run pushed
 * the code up, and a split beside the code was a single remembered boolean. That is a workspace with
 * one arrangement and no way to say "show me the expected output and the code, not the actual one".
 * This module is the small state machine behind the tabs that replaced it:
 *
 *  - a **view** is what a pane can show: `main` (the lesson's Python, or its read-only helper),
 *    `requirements` (the pass conditions), `predict` (the forecast gate), `actual` (the last run's
 *    stdout), `expected` (the presentation check), `cases`, `workflow` and `trace`;
 *  - a **pane** is one slot of the editor body. A boundary after each pane says how the next one
 *    joins: a `columns` boundary opens a new column beside it, a `rows` boundary stacks it under it
 *    in the same column. The mixed three-pane body is `columns, rows` (the first pane runs full
 *    height, the next two stack beside it) and four columns are `rows, columns, rows` (a 2×2 grid);
 *  - a **focus** says which slot the next tab press fills. Pressing the tab of a view already open
 *    in another slot focuses that slot instead of opening the same view twice.
 *
 * Four panes is the ceiling. A screen decides how many of those four it can usefully show
 * (`paneCapacity`), and the controls in `EditorPaneArrangement.tsx` never add beyond that: a phone gets
 * two, a laptop three, a large desktop four. The stored arrangement is not rewritten when the window
 * shrinks, so a pane arranged on a monitor comes back when the monitor does.
 *
 * Everything here is pure and validated at the edge, because the two failures that matter are
 * invisible in a happy-path screenshot: a stored pane that no view can fill (a blank editor card on
 * load), and a view open in both slots (two `pre-actual-stdout` nodes, which breaks every reader and
 * every test that asks the page for "the" output). `normalizePanes` is the single door those values
 * go through, and `npm run test:panes` pins it.
 */

export const EDITOR_VIEWS = [
  'main',
  'requirements',
  'predict',
  'actual',
  'expected',
  'cases',
  'workflow',
  'trace',
] as const;

export type EditorView = (typeof EDITOR_VIEWS)[number];

/** What each pane's tab says. `main` is the file's own name, added by the runner. */
export const EDITOR_VIEW_LABELS: Record<EditorView, string> = {
  main: 'main.py',
  requirements: 'Requirements',
  predict: 'Predict',
  actual: 'Run output',
  expected: 'Expected',
  cases: 'Cases',
  workflow: 'Workflow',
  trace: 'Trace',
};

/** Which way the panes divide the body. Columns become a grid at three or more. */
export type PaneAxis = 'columns' | 'rows';

/**
 * One or more slots, which way a split divides, and which slot the next tab press fills.
 *
 * `views[0]` is never absent: a body with no pane is not an arrangement, it is a blank card.
 */
export interface EditorPanes {
  views: EditorView[];
  axis: PaneAxis;
  focus: number;
  /**
   * Share of the width the first column gets when panes sit side by side. A drag writes it; a swap
   * keeps it, because the shape belongs to a slot and the view belongs to a pane.
   */
  colShare?: number;
  /** Height shares of the stacked rows, top to bottom. Empty means equal rows. */
  rowShares?: number[];
  /**
   * How each pane after the first joins the arrangement, one entry per boundary: `columns` opens a
   * new column beside the pane before it, `rows` stacks it under that pane in the same column. The
   * first pane has no boundary of its own, so a body of n panes stores n-1 orientations. Whole-body
   * presets (`axis`) write the boundaries this module calls canonical; a pane's own control
   * overrides just its boundary.
   */
  orientations?: PaneAxis[];
  /** Width shares of three or four columns, left to right. Two columns still use `colShare`. */
  colShares?: number[];
}

export const DEFAULT_PANES: EditorPanes = {
  views: ['main'],
  axis: 'columns',
  focus: 0,
  colShare: 0.5,
  rowShares: [],
  orientations: [],
  colShares: [],
};

/** Where the lesson editor keeps its arrangement. */
export const STORAGE_KEY_EDITOR_PANES = 'mechalab_editor_panes_v1';

/**
 * The free-study card's own arrangement: code above the run output, which is what that card drew
 * before it had panes at all. A second surface means a second key, so arranging one editor cannot
 * move the other's split.
 */
export const STORAGE_KEY_STUDIO_PANES = 'mechalab_studio_panes_v1';
export const STUDIO_PANES: EditorPanes = {
  views: ['main', 'actual'],
  axis: 'rows',
  focus: 0,
  colShare: 0.5,
  rowShares: [],
  orientations: ['rows'],
  colShares: [],
};

/** The narrowest a dragged pane may get, so a divider can never erase the pane beside it. */
export const MIN_PANE_SHARE = 0.15;
/** The column divider keeps the first column between these shares. */
export const MIN_COLUMN_SHARE = 0.2;
export const MAX_COLUMN_SHARE = 0.8;

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** Positive row shares, normalized to one, or no shares at all. */
function normalizeShares(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const raw = value.filter(
    (entry): entry is number => typeof entry === 'number' && Number.isFinite(entry) && entry > 0
  );
  if (raw.length < 2) return [];
  // Every pane gets the floor first, and the rest is shared in proportion. Clamping after a plain
  // normalization does not work: dividing the clamped values again pushes the small one back under
  // the floor (0.98/0.01/0.01 came out at 0.117 for the small panes).
  const shares = raw.slice(0, MAX_PANES);
  const total = shares.reduce((sum, entry) => sum + entry, 0);
  const normalized = shares.map((entry) => entry / total);
  const floor = MIN_PANE_SHARE;
  // A drag already keeps every share above the floor, and its proportions should survive a reload
  // untouched. Only a stored value with a sliver (or junk proportions) needs the floor applied, and
  // then the floor comes out first and the remainder is shared in proportion.
  if (normalized.every((entry) => entry >= floor)) return normalized;
  const free = 1 - floor * shares.length;
  if (free <= 0) return shares.map(() => 1 / shares.length);
  return shares.map((entry) => floor + (entry / total) * free);
}

/** The most panes the body will hold. A screen's capacity is at most this, never more. */
export const MAX_PANES = 4;

export function isEditorView(value: unknown): value is EditorView {
  return (EDITOR_VIEWS as readonly unknown[]).includes(value);
}

/**
 * How many panes this screen can show without turning into a column of slivers.
 *
 * Width is the first constraint; height matters once a stacked arrangement is possible. The numbers
 * are deliberately conservative: three panes at 1280 px still leave each one wider than the editor's
 * comfortable line length, and four wait for a 1440 px monitor with room below for the output.
 */
export function paneCapacity(width: number, height: number): number {
  const w = width > 0 ? width : 1280;
  const h = height > 0 ? height : 800;
  if (w >= 1440 && h >= 800) return 4;
  if (w >= 1100 && h >= 700) return 3;
  return 2;
}

/**
 * The result views a preset really has.
 *
 * A preset still owns the regions (`workspaceLayout.ts`), and this is that rule read as tabs. Read
 * shows the editor's bar but none of its results — its job is the page. Write has the views a draft
 * is about: requirements, Predict, Workflow and the cases the draft will be checked against — no run
 * output, because that describes code which has already changed. Study and Debug have them all.
 *
 * Type-only import: the runtime dependency runs the other way (the runner imports this module), and
 * a value import here would close the cycle.
 */
export function viewsForLayout(layout: 'study' | 'write' | 'read' | 'debug'): EditorView[] {
  if (layout === 'read') return [];
  if (layout === 'write') return ['requirements', 'predict', 'cases', 'workflow'];
  return ['requirements', 'predict', 'actual', 'expected', 'cases', 'workflow', 'trace'];
}

export function isPaneAxis(value: unknown): value is PaneAxis {
  return value === 'columns' || value === 'rows';
}

/**
 * The boundaries a whole-body preset writes for `count` panes.
 *
 * These are the layouts the editor drew before a pane had a control of its own, and they stay the
 * canonical answer: `columns` is the mixed body at three panes and the 2×2 grid at four, `rows`
 * stacks every pane. The per-pane control starts from here and overrides one boundary.
 */
export function defaultOrientations(count: number, axis: PaneAxis): PaneAxis[] {
  if (count < 2) return [];
  if (axis === 'rows') return Array.from({ length: count - 1 }, () => 'rows' as PaneAxis);
  if (count === 2) return ['columns'];
  if (count === 3) return ['columns', 'rows'];
  return (['rows', 'columns', 'rows'] as PaneAxis[]).slice(0, count - 1);
}

/**
 * A usable arrangement from anything: a stored object, a half-written one, or nothing.
 *
 * Junk is dropped view by view rather than taking the whole object's default, so one bad slot does
 * not also forget the axis and the focus. A duplicate is removed by first occurrence, which is what
 * keeps "the same view in both panes" from ever rendering two outputs; an empty list falls back to
 * the editor, because a card that fills itself with nothing cannot be recovered from inside the UI.
 */
export function normalizePanes(value: unknown, fallback: EditorPanes = DEFAULT_PANES): EditorPanes {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const raw = Array.isArray(record.views) ? record.views : [];
  const views: EditorView[] = [];
  for (const entry of raw) {
    if (isEditorView(entry) && !views.includes(entry)) views.push(entry);
    if (views.length === MAX_PANES) break;
  }
  if (views.length === 0) views.push(fallback.views[0] ?? DEFAULT_PANES.views[0]);
  const axis: PaneAxis = isPaneAxis(record.axis) ? record.axis : fallback.axis;
  const focusValue = typeof record.focus === 'number' ? record.focus : fallback.focus;
  const focus = Number.isInteger(focusValue) && focusValue >= 0 && focusValue < views.length ? focusValue : 0;
  const colShare =
    typeof record.colShare === 'number' && Number.isFinite(record.colShare)
      ? clamp(record.colShare, MIN_COLUMN_SHARE, MAX_COLUMN_SHARE)
      : (fallback.colShare ?? 0.5);
  const rowShares = Array.isArray(record.rowShares) ? normalizeShares(record.rowShares) : (fallback.rowShares ?? []);
  // A stored boundary that is missing or junk borrows the canonical one for its slot, so an
  // arrangement written before panes had their own control keeps the layout it was drawn in.
  const canonical = defaultOrientations(views.length, axis);
  const storedOrientations = Array.isArray(record.orientations) ? record.orientations : [];
  const orientations = canonical.map((entry, index) =>
    isPaneAxis(storedOrientations[index]) ? storedOrientations[index] : entry
  );
  const colShares = Array.isArray(record.colShares)
    ? normalizeShares(record.colShares)
    : (fallback.colShares ?? []);
  return { views, axis, focus, colShare, rowShares, orientations, colShares };
}

/** Every view on screen, in slot order. Never empty, never a duplicate. */
export function visibleViews(panes: EditorPanes): EditorView[] {
  return [...panes.views];
}

/** The slot a view occupies, or null when it is not on screen. */
export function slotFor(panes: EditorPanes, view: EditorView): number | null {
  const slot = panes.views.indexOf(view);
  return slot === -1 ? null : slot;
}

/** Whether the body is split into more than one pane. */
export function isSplit(panes: EditorPanes): boolean {
  return panes.views.length > 1;
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
  const target = panes.views.length > 1 && panes.focus < panes.views.length ? panes.focus : 0;
  const views = [...panes.views];
  views[target] = view;
  return normalizePanes({ ...panes, views, focus: target });
}

/**
 * Add a pane, showing `view` (or the next useful view) in the new slot.
 *
 * The first split from the editor opens the run output; from an output it brings the editor back
 * beside it. Later presses add a third or fourth pane rather than replacing one: a learner reaches
 * for Add pane when they want another view on screen, not another tab.
 */
export function splitPane(
  panes: EditorPanes,
  view?: EditorView,
  candidates: readonly EditorView[] = EDITOR_VIEWS
): EditorPanes {
  const views = [...panes.views];
  if (view && views.includes(view)) return { ...normalizePanes(panes), focus: views.indexOf(view) };
  if (views.length >= MAX_PANES) return normalizePanes(panes);
  const preferred = view ?? (views[0] === 'main' ? 'actual' : 'main');
  // The editor is always a legal pane, even when Study's result list does not repeat it. A split
  // from an output therefore brings the code back before it considers another output tab.
  const allowed: readonly EditorView[] = candidates.length ? ['main', ...candidates] : EDITOR_VIEWS;
  if (view && !allowed.includes(view)) return normalizePanes(panes);
  const chosen =
    !views.includes(preferred) && allowed.includes(preferred)
      ? preferred
      : allowed.find((entry) => !views.includes(entry));
  if (!chosen) return normalizePanes(panes);
  // Adding a pane returns to the canonical shape for the new count: the alternative is a body that
  // grows by one arbitrary boundary, which no preset or audit can predict.
  return normalizePanes({
    ...panes,
    views: [...views, chosen],
    focus: views.length,
    orientations: defaultOrientations(views.length + 1, panes.axis),
  });
}

/**
 * Close every pane after the first.
 *
 * The first slot is kept, not the focused one: closing a pane should leave the editor where it was,
 * and a tab that was only open in the pane being closed is one press away again.
 */
export function closeSplit(panes: EditorPanes): EditorPanes {
  return normalizePanes({ ...panes, views: [panes.views[0]], focus: 0 });
}

/**
 * Take one view off the screen, keeping the other half of a split.
 *
 * Closing a split and closing a tab are different intents: the first says "one pane", the second
 * says "not this view". With several panes open, closing one leaves the rest in order; closing the
 * only view falls back to the editor, because a body with no view is a blank card.
 */
export function closeView(panes: EditorPanes, view: EditorView): EditorPanes {
  const slot = panes.views.indexOf(view);
  const kept = panes.views.filter((entry) => entry !== view);
  if (kept.length === 0) return { ...panes, views: ['main'], focus: 0 };
  // The pane takes its own boundary with it: the one after it, or the last one when it was last.
  const orientations = [...(panes.orientations ?? [])];
  if (slot !== -1 && orientations.length > 0) {
    orientations.splice(Math.min(slot, orientations.length - 1), 1);
  }
  return normalizePanes({ ...panes, views: kept, focus: 0, orientations });
}

/**
 * Choose which way the whole body divides. Remembered even while there is only one pane.
 *
 * A preset also resets the per-pane boundaries to the canonical shape for the current count: that
 * is the one control a learner has for putting a hand-arranged body back the way it started.
 */
export function setAxis(panes: EditorPanes, axis: PaneAxis): EditorPanes {
  return normalizePanes({
    ...panes,
    axis,
    orientations: defaultOrientations(panes.views.length, axis),
    // Three- and four-column widths belong to the layout they were dragged in.
    colShares: [],
  });
}

/**
 * Place one pane relative to the pane before it, leaving every other boundary alone.
 *
 * `slot` is the pane's own slot (1..n-1); the first pane has nothing before it, so it has no
 * boundary and this is a no-op for slot 0. `columns` opens a new column beside the previous pane,
 * `rows` stacks it under that pane — the two choices a per-pane control offers.
 */
export function setPaneOrientation(panes: EditorPanes, slot: number, orientation: PaneAxis): EditorPanes {
  if (!Number.isInteger(slot) || slot < 1 || slot >= panes.views.length) return normalizePanes(panes);
  const orientations = [
    ...(panes.orientations ?? defaultOrientations(panes.views.length, panes.axis)),
  ];
  orientations[slot - 1] = orientation;
  return normalizePanes({ ...panes, orientations });
}

/**
 * The panes grouped into the columns the body draws, left to right.
 *
 * A `columns` boundary starts a new group; a `rows` boundary appends to the group before it. The
 * slots are the arrangement's own indices, so a caller showing a subset passes those indices and a
 * hidden pane cannot leave an empty column behind.
 */
export function paneColumns(panes: EditorPanes, slots?: readonly number[]): number[][] {
  const order = slots ?? panes.views.map((_, index) => index);
  const columns: number[][] = [];
  for (const slot of order) {
    if (!Number.isInteger(slot) || slot < 0 || slot >= panes.views.length) continue;
    if (columns.length === 0) {
      columns.push([slot]);
      continue;
    }
    const boundary =
      panes.orientations?.[slot - 1] ?? (panes.axis === 'rows' ? 'rows' : 'columns');
    if (boundary === 'rows') columns[columns.length - 1].push(slot);
    else columns.push([slot]);
  }
  return columns;
}

/**
 * Width shares for `count` columns: two columns keep the dragged `colShare`, three or four use their
 * own stored widths and fall back to equal columns.
 */
export function paneWidths(panes: EditorPanes, count: number): number[] {
  if (count < 2) return [1];
  if (count === 2) {
    const first = clamp(panes.colShare ?? 0.5, MIN_COLUMN_SHARE, MAX_COLUMN_SHARE);
    return [first, 1 - first];
  }
  const stored = panes.colShares ?? [];
  if (stored.length === count) return [...stored];
  return Array.from({ length: count }, () => 1 / count);
}

/** One drag of the divider between the columns, written as a share of the body's width. */
export function resizeColumn(panes: EditorPanes, share: number): EditorPanes {
  return normalizePanes({ ...panes, colShare: clamp(share, MIN_COLUMN_SHARE, MAX_COLUMN_SHARE) });
}

/** One drag between two columns of a three- or four-column body, written as every column's width. */
export function resizeColumns(panes: EditorPanes, shares: readonly number[]): EditorPanes {
  const widths = normalizeShares(shares);
  if (widths.length < 2) return normalizePanes(panes);
  return normalizePanes({ ...panes, colShares: widths, colShare: widths[0] });
}

/** One drag of a divider between stacked panes, written as the new row heights. */
export function resizeRows(panes: EditorPanes, shares: readonly number[]): EditorPanes {
  return normalizePanes({ ...panes, rowShares: [...shares] });
}

/** Focus a slot that exists; a focus on an empty slot is not a state. */
export function focusSlot(panes: EditorPanes, slot: number): EditorPanes {
  if (!Number.isInteger(slot) || slot < 0 || slot >= panes.views.length) return panes;
  return { ...panes, focus: slot };
}

/**
 * Exchange two panes without moving the focus.
 *
 * The controls name the slots ("Pane 1 ↔ Pane 3") rather than the views, because that is what a
 * learner is looking at. Keeping the focus on the same slot means the next tab press still changes
 * the pane the pointer last selected; the view that was there simply moved.
 */
export function swapPanes(panes: EditorPanes, a: number, b: number): EditorPanes {
  if (a === b || !Number.isInteger(a) || !Number.isInteger(b)) return normalizePanes(panes);
  if (a < 0 || b < 0 || a >= panes.views.length || b >= panes.views.length) return normalizePanes(panes);
  const views = [...panes.views];
  [views[a], views[b]] = [views[b], views[a]];
  return normalizePanes({ ...panes, views });
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
 * Whether a parsed value is an arrangement at all: an object with at least one view a pane can show.
 *
 * This is the difference between "a half-written arrangement" (normalize it field by field) and "no
 * arrangement here" (keep the surface's own default). Without it, `{}` or `{"views":[]}` would land
 * on `DEFAULT_PANES` — the lesson editor's one-pane layout — and a studio opening would silently lose
 * the code-above-output card it starts with.
 */
function holdsAnArrangement(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const views = (value as Record<string, unknown>).views;
  return Array.isArray(views) && views.some(isEditorView);
}

/**
 * The remembered panes for one surface, or that surface's default when nothing is stored or the
 * value is unusable. The key and the default are the caller's, so two editors hold two arrangements.
 */
export function readPanes(
  key: string = STORAGE_KEY_EDITOR_PANES,
  fallback: EditorPanes = DEFAULT_PANES
): EditorPanes {
  const store = storage();
  if (!store) return normalizePanes(fallback, fallback);
  try {
    const raw = store.getItem(key);
    if (raw === null || raw.trim() === '') return normalizePanes(fallback, fallback);
    const parsed: unknown = JSON.parse(raw);
    if (!holdsAnArrangement(parsed)) return normalizePanes(fallback, fallback);
    return normalizePanes(parsed, fallback);
  } catch {
    return normalizePanes(fallback, fallback);
  }
}

/** Remember an arrangement and return the normalized value to render. */
export function writePanes(
  panes: EditorPanes,
  key: string = STORAGE_KEY_EDITOR_PANES
): EditorPanes {
  const normalized = normalizePanes(panes);
  const store = storage();
  if (store) {
    try {
      store.setItem(key, JSON.stringify(normalized));
    } catch {
      // Blocked or full: the arrangement lasts this visit only.
    }
  }
  return normalized;
}
