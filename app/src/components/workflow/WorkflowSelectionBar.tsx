import { LayoutGrid, Scaling, Trash2, WrapText } from 'lucide-react';

/**
 * Actions for a multiple-card selection (`components/workflow/WorkflowSelectionBar.tsx`).
 *
 * The single-card inspector is intentionally not reused: it names one card's lesson and note, and
 * pretending a note belongs to eight cards is how a selection feature becomes a surprise. This bar
 * only offers things that are true of the set — fit the text, toggle wrapping, lay every selected
 * card out, or remove them together.
 */

export function WorkflowSelectionBar({
  count,
  onFit,
  wrap,
  onWrap,
  onLayout,
  onRemove,
}: {
  count: number;
  onFit: () => void;
  /** True when every selected card wraps today. */
  wrap: boolean;
  onWrap: () => void;
  onLayout: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      data-testid="workflow-multi-selection"
      role="group"
      aria-label={`${count} cards selected`}
      className="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/[0.06] px-2 py-1.5"
    >
      <span className="font-mono text-[11px] text-accent">{count} cards selected</span>
      <span className="text-[10.5px] text-faint">Ctrl/⌘-click to add or remove one</span>
      <span className="ml-auto flex flex-wrap gap-1">
        <button
          type="button"
          data-testid="workflow-selection-fit"
          onClick={onFit}
          className="flex min-h-8 cursor-pointer items-center gap-1 rounded border border-line bg-panel px-1.5 font-mono text-[10.5px] text-muted hover:border-accent hover:text-accent"
        >
          <Scaling className="h-3 w-3" aria-hidden="true" /> Fit text
        </button>
        <button
          type="button"
          data-testid="workflow-selection-wrap"
          aria-pressed={wrap}
          onClick={onWrap}
          className={`flex min-h-8 cursor-pointer items-center gap-1 rounded border px-1.5 font-mono text-[10.5px] ${
            wrap ? 'border-accent/50 bg-accent/10 text-accent' : 'border-line bg-panel text-muted hover:border-accent'
          }`}
        >
          <WrapText className="h-3 w-3" aria-hidden="true" /> Wrap
        </button>
        <button
          type="button"
          data-testid="workflow-selection-layout"
          onClick={onLayout}
          className="flex min-h-8 cursor-pointer items-center gap-1 rounded border border-line bg-panel px-1.5 font-mono text-[10.5px] text-muted hover:border-accent hover:text-accent"
        >
          <LayoutGrid className="h-3 w-3" aria-hidden="true" /> Layout all
        </button>
        <button
          type="button"
          data-testid="workflow-selection-remove"
          onClick={onRemove}
          className="flex min-h-8 cursor-pointer items-center gap-1 rounded border border-line bg-panel px-1.5 font-mono text-[10.5px] text-rose hover:border-rose"
        >
          <Trash2 className="h-3 w-3" aria-hidden="true" /> Remove
        </button>
      </span>
    </div>
  );
}
