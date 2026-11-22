import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Search } from 'lucide-react';
import { blockColors, type BlockAppearance } from './appearance.ts';
import {
  SORT_LABELS,
  TOOLBOX_CATEGORIES,
  type ToolboxCategoryId,
  type ToolboxItem,
  type ToolboxSort,
  toolboxItems,
} from './registry.ts';
import { readBlockSettings, writeBlockSettings } from './settings.ts';

/**
 * The Python Toolbox (`app/src/pythonBlocks/PythonToolbox.tsx`).
 *
 * It belongs to the editor, not the app: every element inserts one complete statement into the
 * program in front of it. Four ways to find one, because a beginner's vocabulary is not the
 * category tree's:
 *
 * - **a dropdown** to jump straight to a category;
 * - **Previous / Next** to walk the nine categories without returning to the list;
 * - **search**, which reads every item's label, Python, keywords and category (typing `print` finds
 *   Print even while Variables is selected);
 * - **sorting** — Recommended (a beginner's sequence), Categories, A–Z and Recently used.
 *
 * The panel collapses to one row so the workspace can take the room; its state is per visit, while
 * the sort and the recent list are remembered on the device (`settings.ts`).
 *
 * **On a phone it is a dock, not a panel.** The blocks live in a sheet pinned under the code, the
 * way the iOS Shortcuts app holds its actions: a grabber at the bottom edge, about a third of the
 * screen when open and one row when folded, a swipe up or down (or a tap) moves it. A learner can
 * always reach the toolbox without scrolling the editor away, which is what the panel at the end of
 * the workspace could not promise on a 390 px screen. At tablet and desktop widths the same catalog
 * stays the inline panel under the workspace, so Visual is not a phone-only face.
 *
 * **Every element can be dragged.** A mouse drag (any direction) or a sideways touch drag on an item
 * carries it over the workspace; the card under the pointer is highlighted by the drop targets the
 * cards publish (`data-drop-body` / `data-drop-index`), and releasing inserts the statement in that
 * body at that index. A tap still inserts at the current insertion point, because that is the
 * gesture that has to keep working for a beginner.
 *
 * **Colourful colours the blocks too.** An item takes the same four colours its card will have
 * (`appearance.ts`), so the toolbox previews the palette the workspace is using instead of looking
 * like a form beside it. Normal leaves every item neutral.
 */

const ALL_CATEGORIES: readonly (ToolboxCategoryId | 'all')[] = [
  'all',
  ...TOOLBOX_CATEGORIES.map((category) => category.id),
];

/** Where a dragged element lands: a suite's body (or the program's own) and an index among them. */
export interface ToolboxDropTarget {
  bodyId: string | null;
  index: number;
}

/** How far a pointer has to travel before a press becomes a drag rather than a tap. */
const DRAG_THRESHOLD = 10;

export function PythonToolbox({
  onInsert,
  recent,
  appearance = 'normal',
  dock = false,
  onDropItem,
}: {
  onInsert: (item: ToolboxItem) => void;
  /** Toolbox item ids, most recently inserted first. */
  recent: readonly string[];
  /** The workspace's look, so the items preview the card colours Colorful will draw. */
  appearance?: BlockAppearance;
  /** The phone's sheet: pinned under the code, with a grabber and a swipe. */
  dock?: boolean;
  /** A dragged element released over a card. Missing, drags resolve to nothing and taps still work. */
  onDropItem?: (item: ToolboxItem, target: ToolboxDropTarget) => void;
}) {
  const [open, setOpen] = useState(true);
  const [category, setCategory] = useState<ToolboxCategoryId | 'all'>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<ToolboxSort>(() => readBlockSettings().sort);
  const [ghost, setGhost] = useState<{ label: string; x: number; y: number } | null>(null);
  /** The phone's own Study bar, which the dock sits above rather than under. */
  const [barHeight, setBarHeight] = useState(0);

  useEffect(() => {
    if (!dock) return;
    const measure = () => {
      const bar = document.querySelector<HTMLElement>('[data-phone-bar]');
      setBarHeight(bar ? Math.round(bar.getBoundingClientRect().height) : 0);
    };
    // The bar is a sibling that mounts with the editor and is hidden while a sheet is open; a first
    // paint and a resize are the two moments its height can change.
    measure();
    const frame = window.requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
    };
  }, [dock]);

  /** A press on an item, promoted to a drag once the pointer has travelled far enough. */
  const dragRef = useRef<{
    item: ToolboxItem;
    x: number;
    y: number;
    active: boolean;
  } | null>(null);
  /** True between a drag's release and the click the browser synthesises after it. */
  const draggedRef = useRef(false);
  /** The grabber's own gesture, so a swipe does not also read as a tap. */
  const swipeRef = useRef<{ y: number; handled: boolean } | null>(null);

  const items = toolboxItems({ category, query, sort, recent });

  const stepCategory = (direction: -1 | 1) => {
    const index = ALL_CATEGORIES.indexOf(category);
    const next = (index + direction + ALL_CATEGORIES.length) % ALL_CATEGORIES.length;
    setCategory(ALL_CATEGORIES[next]);
  };

  const changeSort = (next: ToolboxSort) => {
    setSort(next);
    writeBlockSettings({ sort: next });
  };

  const toggleOpen = () => setOpen((value) => !value);

  const onGrabberDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    swipeRef.current = { y: event.clientY, handled: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onGrabberUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const gesture = swipeRef.current;
    swipeRef.current = null;
    if (!gesture) return;
    const dy = event.clientY - gesture.y;
    if (Math.abs(dy) < 18) return;
    gesture.handled = true;
    draggedRef.current = true;
    setOpen(dy < 0);
  };

  const onGrabberClick = () => {
    // A swipe that already changed the sheet must not be undone by the click that follows it.
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    toggleOpen();
  };

  const onItemDown = (event: ReactPointerEvent<HTMLButtonElement>, item: ToolboxItem) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    // A new press is a new gesture: the guard left by the previous drag must not swallow a tap.
    draggedRef.current = false;
    dragRef.current = { item, x: event.clientX, y: event.clientY, active: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onItemMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.active) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      // A touch's vertical drag is the list scrolling, not a block leaving the toolbox. A sideways
      // drag is unambiguous, which is why the items declare `touch-action: pan-y`.
      if (event.pointerType !== 'mouse' && Math.abs(dx) <= Math.abs(dy)) {
        dragRef.current = null;
        return;
      }
      drag.active = true;
      draggedRef.current = true;
    }
    setGhost({ label: drag.item.label, x: event.clientX, y: event.clientY });
  };

  const endDrag = (event: ReactPointerEvent<HTMLButtonElement>, dropped: boolean) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setGhost(null);
    if (!drag?.active) {
      draggedRef.current = false;
      return;
    }
    if (dropped && onDropItem) {
      const target = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest('[data-drop-body]');
      if (target) {
        const rawBody = target.getAttribute('data-drop-body');
        const rawIndex = Number(target.getAttribute('data-drop-index'));
        onDropItem(drag.item, {
          bodyId: rawBody ? rawBody : null,
          index: Number.isFinite(rawIndex) ? rawIndex : 0,
        });
      }
    }
    // The click that follows the release belongs to the drag, not to the item. The flag is cleared
    // by the next press (or by that click), never on a timer: a timer can run before the click the
    // pointer capture retargets at the item, and then one drop inserts twice.
    draggedRef.current = true;
  };

  const onItemClick = (item: ToolboxItem) => {
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    onInsert(item);
  };

  const searching = query.trim() !== '';
  const grouped = sort === 'categories' && !searching;
  let lastCategory: ToolboxCategoryId | null = null;

  return (
    <section
      data-testid="python-toolbox"
      data-dock={dock ? '1' : undefined}
      data-appearance={appearance}
      aria-label="Python toolbox"
      style={dock ? { bottom: barHeight } : undefined}
      className={
        dock
          ? 'fixed inset-x-0 bottom-0 z-30 rounded-t-xl border-t border-line-soft bg-canvas/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_30px_rgba(0,0,0,0.28)] backdrop-blur'
          : 'border-t border-line-soft bg-canvas'
      }
    >
      {dock && (
        <button
          type="button"
          data-testid="toolbox-grabber"
          aria-expanded={open}
          aria-controls={open ? 'python-toolbox-body' : undefined}
          aria-label={open ? 'Hide the Python toolbox' : 'Show the Python toolbox'}
          onPointerDown={onGrabberDown}
          onPointerUp={onGrabberUp}
          onPointerCancel={() => {
            swipeRef.current = null;
          }}
          onClick={onGrabberClick}
          className="flex w-full cursor-grab touch-none flex-col items-center gap-0.5 pb-0.5 pt-1.5 active:cursor-grabbing"
        >
          <span aria-hidden="true" className="h-1 w-10 rounded-full bg-line" />
          <span className="font-mono text-[10px] text-faint">
            {open ? 'Swipe down to hide' : 'Swipe up for blocks'}
          </span>
        </button>
      )}

      <div className="flex min-w-0 flex-wrap items-center gap-1 px-2 py-1.5">
        <button
          type="button"
          data-testid="toolbox-toggle"
          aria-expanded={open}
          // The id only exists while the body is drawn; a reference to a missing id is invalid ARIA.
          aria-controls={open ? 'python-toolbox-body' : undefined}
          onClick={toggleOpen}
          className="flex min-h-8 cursor-pointer items-center gap-1 rounded-lg border border-line-soft bg-panel px-2 font-mono text-[12px] font-semibold text-body transition-colors hover:border-accent/40 hover:text-accent"
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          Python Toolbox
          <span className="font-normal text-muted">({items.length})</span>
        </button>
        <p className="min-w-0 flex-1 truncate text-[11px] text-muted">
          Tap to insert, or drag a block onto the code.
        </p>
      </div>

      {open && (
        <div
          id="python-toolbox-body"
          data-testid="python-toolbox-body"
          className={
            dock
              ? 'max-h-[36vh] overflow-y-auto overscroll-contain px-2 pb-2'
              : 'px-2 pb-2'
          }
        >
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            <button
              type="button"
              data-testid="toolbox-prev"
              aria-label="Previous toolbox category"
              title="Previous category"
              onClick={() => stepCategory(-1)}
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-line-soft bg-panel text-muted transition-colors hover:border-accent/40 hover:text-accent"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <select
              data-testid="toolbox-category"
              aria-label="Toolbox category"
              value={category}
              onChange={(event) => setCategory(event.target.value as ToolboxCategoryId | 'all')}
              className="h-8 min-w-0 max-w-full flex-1 cursor-pointer rounded-lg border border-line-soft bg-panel px-2 font-mono text-[12px] text-body"
            >
              <option value="all">All categories</option>
              {TOOLBOX_CATEGORIES.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              data-testid="toolbox-next"
              aria-label="Next toolbox category"
              title="Next category"
              onClick={() => stepCategory(1)}
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-line-soft bg-panel text-muted transition-colors hover:border-accent/40 hover:text-accent"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
            <label className="relative flex min-w-0 flex-1 items-center">
              <Search
                className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-faint"
                aria-hidden="true"
              />
              <input
                type="search"
                data-testid="toolbox-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search print, loop, input…"
                aria-label="Search the Python toolbox"
                className="h-8 w-full min-w-0 rounded-lg border border-line-soft bg-panel pl-7 pr-2 text-[12px] text-body"
              />
            </label>
            <select
              data-testid="toolbox-sort"
              aria-label="Sort the Python toolbox"
              value={sort}
              onChange={(event) => changeSort(event.target.value as ToolboxSort)}
              className="h-8 cursor-pointer rounded-lg border border-line-soft bg-panel px-1.5 font-mono text-[11.5px] text-body"
            >
              {(Object.keys(SORT_LABELS) as ToolboxSort[]).map((key) => (
                <option key={key} value={key}>
                  {SORT_LABELS[key]}
                </option>
              ))}
            </select>
          </div>

          {items.length === 0 ? (
            <p
              data-testid="toolbox-empty"
              className="mt-2 rounded-lg border border-dashed border-line px-2 py-2 text-[12px] text-muted"
            >
              No element matches “{query}”. Try a Python name such as <code>print</code> or{' '}
              <code>for</code>, or clear the search.
            </p>
          ) : (
            <div className="mt-1.5 grid grid-cols-1 gap-1 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((item) => {
                const heading = grouped && item.category !== lastCategory;
                lastCategory = item.category;
                const colors = blockColors(item.template.kind, appearance);
                return (
                  <div key={item.id} className={heading ? 'sm:col-span-2 xl:col-span-3' : undefined}>
                    {heading && (
                      <p className="mb-0.5 mt-1.5 px-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-faint">
                        {TOOLBOX_CATEGORIES.find((entry) => entry.id === item.category)?.label}
                      </p>
                    )}
                    <button
                      type="button"
                      data-testid={`toolbox-item-${item.id}`}
                      data-toolbox-kind={item.template.kind}
                      onClick={() => onItemClick(item)}
                      onPointerDown={(event) => onItemDown(event, item)}
                      onPointerMove={onItemMove}
                      onPointerUp={(event) => endDrag(event, true)}
                      onPointerCancel={(event) => endDrag(event, false)}
                      title={`${item.snippet}\n\nTap to insert, or drag onto a block`}
                      style={
                        {
                          background: colors.background,
                          borderColor: colors.border,
                          borderLeft: `3px solid ${colors.rule}`,
                          touchAction: 'pan-y',
                        } as CSSProperties
                      }
                      className="block w-full min-w-0 cursor-grab rounded-lg border px-2 py-1.5 text-left transition-[filter] hover:brightness-105 active:cursor-grabbing"
                    >
                      <span
                        className="block text-[12px] font-semibold leading-tight"
                        style={{ color: colors.ink }}
                      >
                        {item.label}
                      </span>
                      <code className="mt-0.5 block truncate font-mono text-[11px] text-muted">
                        {item.snippet.replace(/\n+/g, ' · ')}
                      </code>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {ghost && (
        <div
          aria-hidden="true"
          data-testid="toolbox-drag-ghost"
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-accent bg-panel px-2 py-1 font-mono text-[11px] font-semibold text-accent shadow-lg"
          style={{ left: ghost.x, top: ghost.y }}
        >
          {ghost.label}
        </div>
      )}
    </section>
  );
}
