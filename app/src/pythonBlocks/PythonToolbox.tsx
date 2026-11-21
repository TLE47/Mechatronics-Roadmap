import { useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Search } from 'lucide-react';
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
 */

const ALL_CATEGORIES: readonly (ToolboxCategoryId | 'all')[] = [
  'all',
  ...TOOLBOX_CATEGORIES.map((category) => category.id),
];

export function PythonToolbox({
  onInsert,
  recent,
}: {
  onInsert: (item: ToolboxItem) => void;
  /** Toolbox item ids, most recently inserted first. */
  recent: readonly string[];
}) {
  const [open, setOpen] = useState(true);
  const [category, setCategory] = useState<ToolboxCategoryId | 'all'>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<ToolboxSort>(() => readBlockSettings().sort);

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

  const searching = query.trim() !== '';
  const grouped = sort === 'categories' && !searching;
  let lastCategory: ToolboxCategoryId | null = null;

  return (
    <section
      data-testid="python-toolbox"
      aria-label="Python toolbox"
      className="border-t border-line-soft bg-canvas"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-1 px-2 py-1.5">
        <button
          type="button"
          data-testid="toolbox-toggle"
          aria-expanded={open}
          // The id only exists while the body is drawn; a reference to a missing id is invalid ARIA.
          aria-controls={open ? 'python-toolbox-body' : undefined}
          onClick={() => setOpen((value) => !value)}
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
          Tap an element to insert it into the workspace.
        </p>
      </div>

      {open && (
        <div id="python-toolbox-body" className="px-2 pb-2">
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
            <div className="mt-1.5 grid grid-cols-1 gap-1 sm:grid-cols-2">
              {items.map((item) => {
                const heading = grouped && item.category !== lastCategory;
                lastCategory = item.category;
                return (
                  <div key={item.id} className={heading ? 'sm:col-span-2' : undefined}>
                    {heading && (
                      <p className="mb-0.5 mt-1.5 px-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-faint">
                        {TOOLBOX_CATEGORIES.find((entry) => entry.id === item.category)?.label}
                      </p>
                    )}
                    <button
                      type="button"
                      data-testid={`toolbox-item-${item.id}`}
                      onClick={() => onInsert(item)}
                      title={item.snippet}
                      className="block w-full min-w-0 cursor-pointer rounded-lg border border-line-soft bg-panel px-2 py-1.5 text-left transition-colors hover:border-accent/45 hover:bg-raise"
                    >
                      <span className="block text-[12px] font-semibold leading-tight text-body">
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
    </section>
  );
}
