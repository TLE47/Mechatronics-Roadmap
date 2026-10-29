import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, Search } from 'lucide-react';
import {
  PALETTE_MODE_TEXT,
  groupPalette,
  paletteKindLabel,
  rankPalette,
  type PaletteItem,
  type PaletteMatch,
  type PaletteMode,
} from '../palette';

interface CommandPaletteProps {
  isOpen: boolean;
  items: PaletteItem[];
  /** Which door opened it: `⌘K`, `⌘P` or `⌘⇧F` (`app/src/palette.ts`). */
  mode?: PaletteMode;
  /**
   * The results for `search` mode, computed from the query on every keystroke.
   *
   * Passed in rather than imported so the dialog stays a view: the indexing rules and their caps
   * live in `app/src/lessonSearch.ts`, where a unit suite pins them without a browser.
   */
  search?: (query: string) => PaletteItem[];
  /**
   * What the footer says about the results themselves — `course pages loading…`, or that they could
   * not be fetched. Absent when there is nothing to report.
   */
  note?: string | null;
  onClose: () => void;
  onSelect: (item: PaletteItem) => void;
}

/**
 * `⌘K`: one input over every lesson, tab and command.
 *
 * A dialog rather than a route, because it is a detour: open it, type four letters, land on the
 * lesson, and the page you were reading is still there underneath. The keyboard contract is the
 * one every palette trains - arrows move, Enter opens, Escape leaves - and every option is a real
 * `role="option"`, so a screen reader reads the list the sighted learner sees.
 */
export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  items,
  mode = 'all',
  search,
  note = null,
  onClose,
  onSelect,
}) => {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // `search` answers with rows already in reading order and already capped, so it is not ranked
  // again: the index knows which lesson and which line a hit is, and `rankPalette` only knows words.
  const matches = useMemo<PaletteMatch[]>(
    () =>
      mode === 'search'
        ? (search?.(query) ?? []).map((item) => ({ item, score: 0 }))
        : rankPalette(items, query),
    [mode, search, items, query]
  );
  const groups = useMemo(() => groupPalette(matches), [matches]);
  const text = PALETTE_MODE_TEXT[mode];

  // A fresh open — or a different door while it is open (`⌘P` after `⌘K`) — is a fresh question:
  // an old query would hide the thing being looked for, and `quadrature` typed for a text search is
  // not a query for the tab list.
  //
  // A **layout** effect, because this clears the field: a passive effect runs after paint, so a
  // keystroke that arrives between the dialog appearing and the reset would be erased — which is
  // what a driven browser does on purpose and a fast typist can do by accident. Before paint, the
  // field is empty by the time anyone can type into it.
  useLayoutEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setActiveIndex(0);
    inputRef.current?.focus();
  }, [isOpen, mode]);

  // The arrow keys move a highlight; keep it on screen when the list is longer than the panel.
  useEffect(() => {
    if (!isOpen) return;
    const active = matches[activeIndex]?.item;
    if (!active) return;
    const option = listRef.current?.querySelector<HTMLElement>(`[data-palette-id="${active.id}"]`);
    option?.scrollIntoView({ block: 'nearest' });
  }, [isOpen, activeIndex, matches]);

  if (!isOpen) return null;

  const choose = (item: PaletteItem) => {
    onSelect(item);
    onClose();
  };

  const move = (delta: number) => {
    if (!matches.length) return;
    setActiveIndex((prev) => (prev + delta + matches.length) % matches.length);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(-1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(Math.max(0, matches.length - 1));
    } else if (event.key === 'Enter') {
      const chosen = matches[activeIndex]?.item;
      if (!chosen) return;
      event.preventDefault();
      choose(chosen);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'Tab') {
      // One field, one list: Tab would only walk out of the dialog and leave it open behind.
      event.preventDefault();
    }
  };

  const activeId = matches[activeIndex]?.item.id;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/65 p-4 pt-[12vh] max-sm:items-end max-sm:p-0 max-sm:pt-0"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'search' ? 'Search inside the lessons' : 'Command palette'}
        data-testid="command-palette"
        data-palette-mode={mode}
        onKeyDown={onKeyDown}
        className="w-full max-w-2xl overflow-hidden rounded-[var(--r-lg)] border shadow-2xl max-sm:max-h-[92dvh] max-sm:rounded-b-none max-sm:rounded-t-2xl max-sm:border-x-0 max-sm:border-b-0 max-sm:pb-[env(safe-area-inset-bottom)]"
        style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border-strong)' }}
      >
        <div
          className="flex items-center gap-2 border-b px-3.5 py-3"
          style={{ borderColor: 'var(--border)' }}
        >
          <Search className="h-4 w-4 shrink-0" style={{ color: 'var(--dim)' }} aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            data-testid="input-palette-search"
            placeholder={text.placeholder}
            aria-label={text.label}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
            aria-autocomplete="list"
            aria-activedescendant={activeId ? `palette-option-${activeId}` : undefined}
            className="w-full bg-transparent text-[14px] outline-none"
            style={{ color: 'var(--text)' }}
          />
          <kbd
            className="hidden shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold sm:inline"
            style={{ borderColor: 'var(--border)', color: 'var(--dim)' }}
          >
            esc
          </kbd>
        </div>

        <div
          ref={listRef}
          id="palette-results"
          role="listbox"
          aria-label="Palette results"
          className="max-h-[52vh] overflow-y-auto py-1"
        >
          {matches.length === 0 && (
            <p
              data-testid="palette-empty"
              className="px-4 py-6 text-center text-[12.5px]"
              style={{ color: 'var(--muted)' }}
            >
              Nothing matches “{query}”. {text.empty}
            </p>
          )}

          {groups.map((group) => (
            <div key={group.kind} role="group" aria-label={`${paletteKindLabel(group.kind)}s`}>
              <p
                className="px-3.5 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.14em]"
                style={{ color: 'var(--dim)' }}
              >
                {paletteKindLabel(group.kind)}s
              </p>
              {group.matches.map(({ item }) => {
                const index = matches.findIndex((match) => match.item.id === item.id);
                const isActive = index === activeIndex;
                return (
                  <button
                    key={item.id}
                    id={`palette-option-${item.id}`}
                    data-palette-id={item.id}
                    data-testid={`palette-item-${item.id}`}
                    // Where a course-page row goes. A row is a button for the keyboard contract,
                    // so the destination rides as data rather than as an anchor this list does not
                    // need; the app opens it in a new tab on Enter.
                    data-href={item.href}
                    role="option"
                    aria-selected={isActive}
                    type="button"
                    onMouseMove={() => setActiveIndex(index)}
                    onClick={() => choose(item)}
                    className="flex w-full items-center gap-3 px-3.5 py-2 text-left"
                    style={{
                      backgroundColor: isActive ? 'var(--accent-soft)' : 'transparent',
                      color: 'var(--text)',
                    }}
                  >
                    <span
                      className="w-[4.5rem] shrink-0 text-[10.5px] font-semibold uppercase tracking-wide"
                      style={{ color: isActive ? 'var(--accent)' : 'var(--dim)' }}
                    >
                      {paletteKindLabel(item.kind)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{item.label}</span>
                      {item.detail && (
                        <span className="mt-0.5 block truncate text-[11.5px]" style={{ color: 'var(--muted)' }}>
                          {item.detail}
                        </span>
                      )}
                    </span>
                    {isActive && (
                      <CornerDownLeft
                        className="h-3.5 w-3.5 shrink-0"
                        style={{ color: 'var(--accent)' }}
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div
          className="flex items-center justify-between border-t px-3.5 py-2 text-[11px]"
          style={{ borderColor: 'var(--border)', color: 'var(--dim)' }}
        >
          <span>↑ ↓ to move · ↵ to open · esc to close</span>
          <span className="flex items-center gap-2">
            {note && (
              <span data-testid="palette-note" style={{ color: 'var(--dim)' }}>
                {note}
              </span>
            )}
            <span data-testid="palette-match-count" data-palette-mode={mode}>
              {mode === 'search'
                ? `${matches.length} hit${matches.length === 1 ? '' : 's'}`
                : `${matches.length} of ${items.length}`}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
};
