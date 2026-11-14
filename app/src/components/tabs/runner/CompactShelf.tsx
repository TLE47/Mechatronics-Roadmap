import { useState, type ReactNode } from 'react';

/**
 * One module of the Compact dock: its name, the one number worth reading while it is closed, and
 * the panel that opens under the row.
 */
export interface CompactShelfItem {
  id: string;
  label: string;
  /** The summary a closed module still shows, e.g. `12/95` or `0/2`. */
  meta?: string;
  body: ReactNode;
}

/**
 * The Compact preset's dock (`TabPyodideRunner.tsx`, `data-testid="compact-dock"`).
 *
 * Closed, it is one 30 px row: every module's name and its number, so the dock answers the four
 * questions a learner asks of the lesson page without opening anything. Pressing a name opens that
 * module under the row and pressing it again closes it, one at a time, which is what keeps the row
 * from becoming a wall of cards. Nothing scrolls inside the dock — a body that runs long moves the
 * page, and a closed dock is the same height whether the brief is two lines or the report is forty.
 */
export function CompactShelf({ items }: { items: CompactShelfItem[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div data-testid="compact-shelf">
      <div role="tablist" aria-label="Compact dock" className="compact-shelf-bar">
        {items.map((item) => {
          const shown = open === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`compact-tab-${item.id}`}
              aria-selected={shown}
              aria-expanded={shown}
              aria-controls={`compact-panel-${item.id}`}
              data-testid={`compact-tab-${item.id}`}
              onClick={() => setOpen((current) => (current === item.id ? null : item.id))}
              title={`${item.label}${item.meta ? ` — ${item.meta}` : ''}: press to ${shown ? 'close' : 'open'}`}
              className="compact-shelf-tab"
            >
              <span>{item.label}</span>
              {item.meta ? <span className="compact-shelf-meta">{item.meta}</span> : null}
            </button>
          );
        })}
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`compact-panel-${item.id}`}
          aria-labelledby={`compact-tab-${item.id}`}
          data-testid={`compact-panel-${item.id}`}
          className="compact-shelf-panel"
          hidden={open !== item.id}
        >
          {item.body}
        </div>
      ))}
    </div>
  );
}
