import { CARD_COLORS, type CardColor } from '../../workflow.ts';
import { CARD_COLOR_VAR } from './cardStyle.ts';

/**
 * One colour row: the theme's own surface first, then the five tokens the model allows
 * (`components/workflow/CardSwatches.tsx`).
 *
 * The swatch *is* the colour (`CARD_COLOR_VAR`, the same table the plate paints from), so the choice
 * on screen and the card it styles cannot disagree. The inspector and the press menu both draw this
 * row — one component, so the colour a learner presses in either place is the same colour. `aria-
 * pressed` rather than a radio group keeps each choice one Tab stop and says which one is on, and the
 * crossed swatch is how a card is put back to the surface it was drawn on.
 *
 * `prefix` keeps the two surfaces' test hooks apart: a card can have its inspector open while the
 * press menu stands over it, and a duplicate hook would make either one ambiguous.
 */
export function CardSwatches({
  label,
  field,
  value,
  onPick,
  prefix = 'workflow',
}: {
  label: string;
  field: 'fill' | 'ink';
  value: CardColor | undefined;
  onPick: (color: CardColor | undefined) => void;
  prefix?: string;
}) {
  return (
    <div role="group" aria-label={`${label} colour`} className="flex items-center gap-1">
      <span className="font-mono text-[10px] text-faint">{label}</span>
      <button
        type="button"
        data-testid={`${prefix}-${field}-default`}
        aria-label={`${label}: theme default`}
        aria-pressed={!value}
        onClick={() => onPick(undefined)}
        className={`h-6 w-6 cursor-pointer rounded-full border border-line text-[10px] text-faint hover:text-body ${
          value ? '' : 'ring-2 ring-accent'
        }`}
      >
        ×
      </button>
      {CARD_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          data-testid={`${prefix}-${field}-${color}`}
          aria-label={`${label}: ${color}`}
          aria-pressed={value === color}
          onClick={() => onPick(color)}
          className={`h-6 w-6 cursor-pointer rounded-full border ${
            value === color ? 'border-accent ring-2 ring-accent' : 'border-line'
          }`}
          style={{ backgroundColor: CARD_COLOR_VAR[color] }}
        />
      ))}
    </div>
  );
}
