import { useCallback, useState } from 'react';

/**
 * A card's fold, and where the choice is remembered (`app/src/fold.ts`).
 *
 * Three cards on the roadmap grow tall once a learner has done something: the resume card once a
 * draft is half-written, the trail once a few days are on it, the board card always (a sketch and a
 * prediction box side by side). All three fold the same way — one press in the header keeps the line
 * that says what the card is and puts the detail behind it — so they share the store, the hook and
 * the toggle rather than three copies of the same fifteen lines.
 *
 * A fold is a **preference**, like the layout or the palette, so it lives in `localStorage` beside
 * them and deliberately not in a backup: a learner who folds a card on a phone wants it folded here
 * too, and a restored archive has no business deciding which cards this device has open.
 */

/** The two stored words. A key that is absent or unreadable is `open`, which is where a first visit starts. */
const FOLDED = '1';
const OPEN = '0';

/** Where each card's fold is kept. One key per card, so folding the trail cannot fold the board. */
export const STORAGE_KEY_RESUME_COLLAPSED = 'mechalab_resume_collapsed_v1';
export const STORAGE_KEY_TRAIL_COLLAPSED = 'mechalab_trail_collapsed_v1';
export const STORAGE_KEY_BOARD_COLLAPSED = 'mechalab_board_collapsed_v1';

/** The stored fold, or open. A blocked store reads as open rather than throwing at mount. */
export function readFold(key: string): boolean {
  try {
    return localStorage.getItem(key) === FOLDED;
  } catch {
    return false;
  }
}

/** Files the fold. A store that refuses leaves the card folded for this visit only. */
export function writeFold(key: string, folded: boolean): void {
  try {
    localStorage.setItem(key, folded ? FOLDED : OPEN);
  } catch {
    // Nothing to say: the card holds its state until the page is reloaded, and nothing is lost.
  }
}

/** A card's fold and the press that flips it, remembered under `key`. */
export function useFold(key: string): { folded: boolean; toggle: () => void } {
  const [folded, setFolded] = useState<boolean>(() => readFold(key));
  const toggle = useCallback(() => {
    const next = !folded;
    setFolded(next);
    writeFold(key, next);
  }, [folded, key]);
  return { folded, toggle };
}
