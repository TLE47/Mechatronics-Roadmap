import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Command, useCommandState } from 'cmdk';
import { CheckCircle2, CornerDownLeft, Search } from 'lucide-react';
import {
  PALETTE_MODE_TEXT,
  groupPalette,
  paletteKindLabel,
  rankPalette,
  type PaletteItem,
  type PaletteMatch,
  type PaletteMode,
} from '../palette';

/**
 * The `↵` on the row cmdk has selected.
 *
 * Read from cmdk's own state rather than from a copy of it, so the mark beside a row and the row
 * `↵` opens can never disagree.
 */
const ActiveHint: React.FC<{ id: string }> = ({ id }) => {
  const active = useCommandState((state) => state.value === id);
  if (!active) return null;
  return <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />;
};

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
 * lesson, and the page you were reading is still there underneath.
 *
 * What is the app's own is only the *ranking* (`app/src/palette.ts`, where a unit suite pins the
 * order): `shouldFilter={false}` hands cmdk the rows already in reading order, so the fuzzy score
 * that decides which lesson is first is still the one this repo tests. Everything a palette has to
 * get right and a lesson list does not — the combobox and listbox wiring, `aria-activedescendant`,
 * arrows that wrap, Enter that opens the active row, keeping it scrolled into view — is cmdk's. The
 * portal, the focus trap, Escape, the restored focus and the labelled modal dialog are Radix's.
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

  const inputRef = useRef<HTMLInputElement | null>(null);
  /**
   * The row cmdk currently has selected, mirrored back into it so `aria-activedescendant` names a
   * row and `↵` opens that same row.
   *
   * cmdk never writes its own selection into a value the caller passed, so this is feedback rather
   * than control: it starts empty (`undefined`), cmdk picks the head it can see, and the id it
   * reports comes back on the next render. A new question clears it, which is how the highlight
   * returns to the new head instead of staying on a row that used to match.
   */
  const [selection, setSelection] = useState<string | undefined>(undefined);
  const lastQuery = useRef<string | null>(null);
  if (lastQuery.current !== query) {
    lastQuery.current = query;
    if (selection !== undefined) setSelection(undefined);
  }
  /**
   * Whatever had the caret when the palette opened.
   *
   * Radix restores focus to a `Dialog.Trigger`, and this dialog has none: it is opened by state —
   * the header's Search button, `⌘K`, `⌘P`, `⌘⇧F` — so the element to return to is whatever was
   * focused at that moment. `onCloseAutoFocus` is Radix's own close hook, so the timing (after the
   * content has unmounted, before the focus guard releases) is the library's, not a `setTimeout`.
   */
  const openerRef = useRef<HTMLElement | null>(null);

  // `search` answers with rows already in reading order and already capped, so it is not ranked
  // again: the index knows which lesson and which line a hit is, and `rankPalette` only knows words.
  const matches = useMemo<PaletteMatch[]>(
    () =>
      mode === 'search' && query.trim() !== ''
        ? (search?.(query) ?? []).map((item) => ({ item, score: 0 }))
        : rankPalette(items, query),
    [mode, search, items, query]
  );
  /**
   * The matches, grouped, with the group holding the best match drawn first.
   *
   * `groupPalette` orders by kind (lessons, pages, tabs, actions), which is the order the palette
   * has always *drawn*; but the row Enter opens is the first row in the list, and cmdk cannot hold a
   * selection on a row that is not drawn first — its `value` and the row it marks `aria-selected`
   * only agree with the document order. So the groups follow the ranking, and within a group so do
   * its rows: `shortcuts` still reaches the sheet, and `p.1` still opens the lesson.
   */
  const groups = useMemo(() => {
    const rank = new Map(matches.map((match, index) => [match.item.id, index]));
    return groupPalette(matches).sort(
      (a, b) => (rank.get(a.matches[0].item.id) ?? 0) - (rank.get(b.matches[0].item.id) ?? 0)
    );
  }, [matches]);
  const text = PALETTE_MODE_TEXT[mode];

  /**
   * The row cmdk has selected, or the head before any key has moved.
   *
   * Handed back to `Command` so its internal value is never empty: that value is what names the
   * active row for a screen reader (`aria-activedescendant`) and what `↵` opens. A list that has
   * only just opened has no value of its own, and the first row *is* the head because the groups
   * are drawn in rank order — so the two agree by construction rather than by coincidence.
   */
  const activeRowId = selection ?? matches[0]?.item.id;

  // A fresh list has a selected row but no `aria-activedescendant`: cmdk writes that attribute only
  // once a key has moved the highlight, and drops it again on the renders where it has no value, so
  // a reader opening `⌘K` hears a combobox with no option to announce. The palette has always named
  // its head, and the name is the id cmdk itself writes as soon as an arrow is pressed —
  // `palette-option-<row id>` — so the same name is set here, after every commit, which is what
  // survives cmdk dropping it.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const id = activeRowId ? `palette-option-${activeRowId}` : '';
    if (id) {
      if (input.getAttribute('aria-activedescendant') !== id) input.setAttribute('aria-activedescendant', id);
    } else if (input.hasAttribute('aria-activedescendant')) {
      input.removeAttribute('aria-activedescendant');
    }
  });

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
    const opener = document.activeElement;
    openerRef.current = opener instanceof HTMLElement ? opener : null;
    setQuery('');
    inputRef.current?.focus();
  }, [isOpen, mode]);

  if (!isOpen) return null;

  const choose = (item: PaletteItem) => {
    onSelect(item);
    onClose();
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/65 backdrop-blur-[1px]" />
        <Dialog.Content
          data-testid="command-palette"
          data-palette-mode={mode}
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            // The one field is the dialog: Radix would otherwise land on the first control it
            // finds, and a palette you have to click into is a menu.
            event.preventDefault();
            inputRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            const opener = openerRef.current;
            if (!opener || !document.contains(opener)) return;
            event.preventDefault();
            opener.focus({ preventScroll: true });
          }}
          className="fixed left-1/2 top-[12vh] z-50 w-[min(42rem,calc(100%-2rem))] -translate-x-1/2 overflow-hidden rounded-[var(--r-lg)] border border-line-strong bg-panel shadow-[var(--shadow-lg)] outline-none max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:w-full max-sm:translate-x-0 max-sm:rounded-b-none max-sm:rounded-t-2xl max-sm:border-x-0 max-sm:border-b-0 max-sm:pb-[env(safe-area-inset-bottom)]"
        >
          <Dialog.Title className="sr-only">
            {mode === 'search' ? 'Search inside the lessons' : 'Command palette'}
          </Dialog.Title>

          {/* `shouldFilter={false}` because the ranking above is the repo's, not cmdk's; with the
              groups drawn in rank order the list's first row *is* the head, which is the row cmdk
              selects and the row `↵` opens. */}
          <Command
            shouldFilter={false}
            loop
            label={text.label}
            value={activeRowId}
            onValueChange={setSelection}
          >
            <div className="flex items-center gap-2 border-b border-line px-3.5 py-3">
              <Search className="h-4 w-4 shrink-0 text-faint" aria-hidden="true" />
              <Command.Input
                ref={inputRef}
                value={query}
                onValueChange={setQuery}
                data-testid="input-palette-search"
                aria-label={text.label}
                placeholder={text.placeholder}
                className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-faint"
              />
              <kbd className="hidden shrink-0 rounded border border-line px-1.5 py-0.5 text-[10px] font-semibold text-faint sm:inline">
                esc
              </kbd>
            </div>

            <Command.List
              // A new question is a new list: remounting it re-registers the rows, so the highlight
              // starts at the new head instead of holding a row that used to match.
              key={query}
              id="palette-results"
              // cmdk names the listbox through `label` (its own default is "Suggestions"); this is
              // the same name the hand-written list had, so a screen reader hears no change.
              label="Palette results"
              className="max-h-[52vh] overflow-y-auto py-1"
            >
              {matches.length === 0 && (
                <p
                  data-testid="palette-empty"
                  className="px-4 py-6 text-center text-[12.5px] text-muted"
                >
                  Nothing matches “{query}”. {text.empty}
                </p>
              )}

              {/* A group is a heading and a `role="group"` name, not an interaction: cmdk's own
                  `Group` names itself through `aria-labelledby` and drops an `aria-label`, but this
                  palette's groups have always been named "Course pages", which is both what a
                  reader announces first and what the suite selects on. The options inside are still
                  cmdk's — the listbox, the arrows and Enter never see this wrapper. */}
              {groups.map((group) => (
                <div
                  key={group.kind}
                  role="group"
                  aria-label={`${paletteKindLabel(group.kind)}s`}
                >
                  <p className="px-3.5 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-faint">
                    {paletteKindLabel(group.kind)}s
                  </p>
                  {group.matches.map(({ item }) => {
                    return (
                      <Command.Item
                        key={item.id}
                        asChild
                        value={item.id}
                        data-palette-id={item.id}
                        data-testid={`palette-item-${item.id}`}
                        // Where a course-page row goes. A row is a control for the keyboard
                        // contract, so the destination rides as data rather than as an anchor
                        // this list does not need; the app opens it in a new tab on Enter.
                        data-href={item.href}
                        onSelect={() => choose(item)}
                      >
                        <button id={`palette-option-${item.id}`} type="button">
                          <span className="w-[4.5rem] shrink-0 text-[10.5px] font-semibold uppercase tracking-wide text-dim">
                            {paletteKindLabel(item.kind)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium">
                              {item.label}
                            </span>
                            {item.detail && (
                              <span className="mt-0.5 block truncate text-[11.5px] text-muted">
                                {item.detail}
                              </span>
                            )}
                          </span>
                          {item.verified && (
                            <span
                              data-testid={`palette-verified-${item.id}`}
                              title="Passed the instructor's behavioural checks"
                              className="flex shrink-0 items-center gap-1 rounded-full border border-emerald/40 bg-emerald/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald"
                            >
                              <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                              Verified
                            </span>
                          )}
                          <ActiveHint id={item.id} />
                        </button>
                      </Command.Item>
                    );
                  })}
                </div>
              ))}
            </Command.List>

            <div className="flex items-center justify-between border-t border-line px-3.5 py-2 text-[11px] text-faint">
              <span>↑ ↓ to move · ↵ to open · esc to close</span>
              <span className="flex items-center gap-2">
                {note && (
                  <span data-testid="palette-note" className="text-faint">
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
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
