import { X } from 'lucide-react';

/**
 * The three-line guide to the workflow tab (`components/HowToCard.tsx`).
 *
 * Whether it should be open — and that dismissing it is remembered — is the panel's policy. The
 * card only draws the instructions and reports the close.
 */
export function HowToCard({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      data-testid="workflow-howto"
      className="mt-2 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-2"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] text-accent">How this works</span>
        <button
          type="button"
          data-testid="workflow-howto-dismiss"
          aria-label="Close the workflow instructions"
          onClick={onDismiss}
          className="flex h-10 w-10 items-center justify-center rounded text-muted hover:text-body sm:h-7 sm:w-7"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-[12px]" style={{ color: 'var(--body)' }}>
        <li>Pick the shape that matches the question — analysis and code are two palettes, not two apps.</li>
        <li>Press a card on the palette to drop it on the grid, then drag it by its header and type straight into it.</li>
        <li>Drag the dot on a card’s edge to the card it feeds to draw the arrow; a Branch card’s condition becomes the label on its arrows. The checklist names what is missing; it never stops you running the code.</li>
      </ol>
    </div>
  );
}
