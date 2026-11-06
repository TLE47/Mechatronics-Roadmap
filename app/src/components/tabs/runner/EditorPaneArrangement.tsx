import { useEffect, useState } from 'react';
import { ArrowLeftRight, Columns2, Plus, Rows2, X } from 'lucide-react';
import {
  closeSplit,
  paneCapacity,
  setAxis,
  splitPane,
  swapPanes,
  visibleViews,
  type EditorPanes,
  type EditorView,
} from '../../../editorPanes';
import { resultTabMeta } from './resultTabMeta';

/**
 * What a split adds beside its Split door (`runner/EditorPaneArrangement.tsx`).
 *
 * The two axes, Add pane, the swap menu and Close are loaded only once a second pane exists. The
 * swap menu names slots the way the screen draws them — "Pane 1 with pane 3" — and works identically
 * for a side-by-side grid and a stacked one, because it exchanges the views in the state machine
 * rather than moving pixels.
 */
export function EditorPaneArrangement({
  panes,
  onPanes,
  candidates,
}: {
  panes: EditorPanes;
  onPanes: (next: EditorPanes) => void;
  candidates: readonly EditorView[];
}) {
  const [maxPanes, setMaxPanes] = useState(() => paneCapacity(window.innerWidth, window.innerHeight));
  useEffect(() => {
    const settle = () => setMaxPanes(paneCapacity(window.innerWidth, window.innerHeight));
    window.addEventListener('resize', settle);
    return () => window.removeEventListener('resize', settle);
  }, []);
  const views = visibleViews(panes);
  const focused = Math.min(panes.focus, views.length - 1);
  const others = views
    .map((view, index) => ({ view, index, label: resultTabMeta(view).label }))
    .filter((entry) => entry.index !== focused);

  return (
    <>
      <button
        type="button"
        data-testid="btn-pane-columns"
        aria-pressed={panes.axis === 'columns'}
        aria-label="Divide the panes horizontally"
        onClick={() => onPanes(setAxis(panes, 'columns'))}
        title="Divide the panes horizontally; three or more use a two-column grid"
        className={`cursor-pointer rounded border px-1.5 py-0.5 ${
          panes.axis === 'columns'
            ? 'border-accent/60 bg-accent/10 text-accent'
            : 'border-line bg-canvas text-muted hover:bg-raise'
        }`}
      >
        <Columns2 className="h-3 w-3" aria-hidden="true" />
        <span className="sr-only">Horizontal split</span>
      </button>
      <button
        type="button"
        data-testid="btn-pane-rows"
        aria-pressed={panes.axis === 'rows'}
        aria-label="Divide the panes vertically"
        onClick={() => onPanes(setAxis(panes, 'rows'))}
        title="Divide the panes vertically, one above the other"
        className={`cursor-pointer rounded border px-1.5 py-0.5 ${
          panes.axis === 'rows'
            ? 'border-accent/60 bg-accent/10 text-accent'
            : 'border-line bg-canvas text-muted hover:bg-raise'
        }`}
      >
        <Rows2 className="h-3 w-3" aria-hidden="true" />
        <span className="sr-only">Vertical split</span>
      </button>
      {views.length < maxPanes && (
        <button
          type="button"
          data-testid="btn-pane-add"
          onClick={() => onPanes(splitPane(panes, undefined, candidates))}
          title={`Add pane ${views.length + 1} of ${maxPanes} this screen can show`}
          aria-label={`Add pane ${views.length + 1} of ${maxPanes}`}
          className="flex cursor-pointer items-center rounded border border-line bg-canvas px-1.5 py-0.5 text-[12px] font-mono text-muted hover:bg-raise hover:text-body"
        >
          <Plus className="h-3 w-3" aria-hidden="true" />
          <span className="sr-only">Add pane</span>
        </button>
      )}
      {others.length > 0 && (
        <label className="flex items-center gap-0.5 rounded border border-line bg-canvas px-1 py-0.5 text-[12px] text-muted">
          <ArrowLeftRight className="h-3 w-3 shrink-0" aria-hidden="true" />
          <select
            data-testid="select-pane-swap"
            value=""
            aria-label={`Swap pane ${focused + 1} with`}
            title={`Swap pane ${focused + 1} with another pane; it keeps every view and its content`}
            onChange={(event) => {
              const target = Number(event.currentTarget.value);
              if (Number.isInteger(target) && target >= 0 && target < views.length) {
                onPanes(swapPanes(panes, focused, target));
              }
              event.currentTarget.value = '';
            }}
            className="max-w-[9.5rem] cursor-pointer bg-transparent text-[12px] text-body outline-none"
          >
            <option value="">Swap {focused + 1} with…</option>
            {others.map((entry) => (
              <option key={entry.view} value={entry.index}>
                {entry.index + 1}: {entry.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <button
        type="button"
        data-testid="btn-pane-close"
        onClick={() => onPanes(closeSplit(panes))}
        title="Close every pane except the first"
        aria-label="Close every pane except the first"
        className="cursor-pointer rounded border border-line bg-canvas px-1.5 py-0.5 text-muted hover:bg-raise hover:text-body"
      >
        <X className="h-3 w-3" aria-hidden="true" />
      </button>
    </>
  );
}
