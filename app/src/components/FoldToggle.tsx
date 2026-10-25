import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface FoldToggleProps {
  folded: boolean;
  onToggle: () => void;
  /**
   * What is being folded, in the words the card itself uses: `the trail`, `the board card`, `the
   * lesson offer`. It only ever appears in the accessible name and the tooltip, never as text.
   */
  what: string;
  testId?: string;
}

/**
 * One press that folds a roadmap card, shared by all three that fold (`app/src/components/FoldToggle.tsx`).
 *
 * A button and not a chevron in the corner: `aria-expanded` carries the state for a screen reader,
 * the accessible name begins with the word on screen (`Show the trail` / `Hide the trail`, WCAG
 * 2.5.3), and the arrow is `aria-hidden` because it repeats what the name already says. The state a
 * test reads is the card's `data-collapsed`, not a class.
 */
export const FoldToggle: React.FC<FoldToggleProps> = ({ folded, onToggle, what, testId }) => (
  <button
    type="button"
    onClick={onToggle}
    data-testid={testId}
    aria-expanded={!folded}
    aria-label={`${folded ? 'Show' : 'Hide'} ${what}`}
    title={
      folded
        ? `Unfold ${what}: its detail is still here, behind one press`
        : `Fold ${what} to its summary, keeping the line that says what it is`
    }
    className="shrink-0 cursor-pointer rounded-[var(--r-sm)] border border-line-soft px-2 py-1 inline-flex items-center gap-1 text-[11px] font-mono uppercase tracking-wider text-muted hover:text-ink hover:border-line transition-colors"
  >
    {folded ? (
      <ChevronRight className="w-3 h-3" aria-hidden="true" />
    ) : (
      <ChevronDown className="w-3 h-3" aria-hidden="true" />
    )}
    {folded ? 'Show' : 'Hide'}
  </button>
);
