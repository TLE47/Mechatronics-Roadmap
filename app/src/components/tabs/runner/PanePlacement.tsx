import type { PaneAxis } from '../../../editorPanes';

/**
 * How one pane joins the body (`runner/PanePlacement.tsx`).
 *
 * Two buttons: open a new column beside the pane before this one, or stack under it in that pane's
 * column. The control is its own lazy chunk because it only exists once a body has three panes — a
 * two-pane body's axis is the whole answer — and the editor's entry chunk is at its weight budget.
 */
export function PanePlacement({
  slot,
  boundary,
  onPlace,
}: {
  slot: number;
  boundary: PaneAxis;
  onPlace: (choice: PaneAxis) => void;
}) {
  const button = (choice: PaneAxis) => {
    const selected = boundary === choice;
    return (
      <button
        type="button"
        data-testid={`btn-pane-orient-${slot + 1}-${choice}`}
        aria-pressed={selected}
        aria-label={`Place pane ${slot + 1} ${choice === 'columns' ? 'beside' : 'below'} pane ${slot}`}
        onClick={(event) => {
          event.stopPropagation();
          onPlace(choice);
        }}
        className={`flex h-4 w-4 cursor-pointer items-center justify-center rounded-sm ${
          selected ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-raise hover:text-body'
        }`}
      >
        <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="currentColor" aria-hidden="true">
          <path
            d={
              choice === 'columns'
                ? 'M1 1h3.2v8H1zM5.8 1H9v8H5.8z'
                : 'M1 1h8v3.2H1zM1 5.8h8v3.2H1z'
            }
          />
        </svg>
      </button>
    );
  };
  return (
    <div className="absolute right-14 top-1 z-[1] flex items-center gap-0.5 rounded border border-line bg-canvas/95 p-0.5">
      {button('columns')}
      {button('rows')}
    </div>
  );
}
