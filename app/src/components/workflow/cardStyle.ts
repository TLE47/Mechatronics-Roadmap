import type { CardColor, CardSize, CardStep } from '../../workflow.ts';

/**
 * How a card's chosen colour becomes pixels (`components/workflow/cardStyle.ts`).
 *
 * A document stores a theme token, never a hex: `workflow.ts` owns the list of names, and this module
 * owns the one mapping from a name to the variable the stylesheet defines. Both palettes declare
 * every variable, so a card painted in the dark theme is the same card — and keeps its contrast —
 * when the page turns light. The inspector reads the same table for its swatches, so the dot a
 * learner presses and the plate it paints cannot disagree.
 */

/** The variable a token names. The keys are exhaustive by type: a new token must be added here. */
export const CARD_COLOR_VAR: Record<CardColor, string> = {
  accent: 'var(--accent)',
  emerald: 'var(--emerald)',
  amber: 'var(--amber)',
  rose: 'var(--rose)',
  purple: 'var(--purple)',
};

/**
 * A card's plate: the chosen colour mixed forward over the panel surface.
 *
 * 40% names the colour at a glance instead of hinting at it, while the mix still follows the palette
 * (both declare every token) and keeps a default card's words on the contrast they had: the fill is
 * a cue for the reader's eye, not a second text colour. `undefined` leaves the plate the `bg-panel`
 * it has always been.
 */
export function cardFill(fill: CardColor | undefined): string | undefined {
  return fill ? `color-mix(in oklab, ${CARD_COLOR_VAR[fill]} 40%, var(--panel))` : undefined;
}

/** The card's words: the chosen ink, or the panel's own text colour when none was chosen. */
export function cardInk(ink: CardColor | undefined): string {
  return ink ? CARD_COLOR_VAR[ink] : 'var(--text)';
}

/**
 * The old named steps, in pixels: the title and the detail move together, because a card whose
 * heading grew and whose body did not would read as two cards.
 *
 * `md` is what every card had before any scale existed, so an unstyled document draws at exactly the
 * sizes it did (no recorded box moves).
 */
export const CARD_TYPE: Record<CardStep | 'md', { title: number; detail: number }> = {
  sm: { title: 11, detail: 10 },
  md: { title: 12, detail: 11 },
  lg: { title: 14, detail: 12.5 },
};

/**
 * The type a card draws at: a chosen pixel size keeps the detail one pixel under its title, so the
 * same relation the steps use survives a free choice; absent is the normal size.
 */
export function cardType(size: CardSize | undefined): { title: number; detail: number } {
  if (typeof size === 'number') return { title: size, detail: size - 1 };
  return CARD_TYPE[size ?? 'md'];
}
