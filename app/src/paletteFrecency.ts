/**
 * What the palette has been used for (`app/src/paletteFrecency.ts`).
 *
 * A catalogue of 127 rows is a table of contents, and a table of contents is the wrong first screen
 * for the twentieth visit: the four commands someone actually runs are as far away as the hundred
 * they never will. This remembers the rows that were opened and puts them first — but only on the
 * *empty* query, where the list is a shortcut list anyway. A typed query is still answered by
 * `rankPalette` alone, so `p.1` opens P.1 no matter what was used before.
 *
 * Local, like the rest of the progress stores: no account, no network, no ids leaving the browser.
 * A blocked store reads as "nothing used yet" and never throws into a keystroke.
 */

const KEY = 'mechalab_palette_uses_v1';
/** Enough memory to learn a habit, small enough that the list never becomes its own archive. */
const KEEP = 40;

export type PaletteUses = Record<string, number>;

function canStore(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  } catch {
    return false;
  }
}

export function readPaletteUses(): PaletteUses {
  if (!canStore()) return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const uses: PaletteUses = {};
    for (const [id, count] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof count === 'number' && Number.isFinite(count) && count > 0) {
        uses[id] = Math.min(Math.round(count), 99);
      }
    }
    return uses;
  } catch {
    return {};
  }
}

/** One more use of a row, pruned to the rows worth remembering. */
export function recordPaletteUse(id: string): void {
  if (!canStore() || !id) return;
  try {
    const uses = readPaletteUses();
    uses[id] = Math.min((uses[id] ?? 0) + 1, 99);
    const kept = Object.entries(uses)
      .sort((a, b) => b[1] - a[1])
      .slice(0, KEEP);
    window.localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // A full or blocked store just means the list does not learn this session.
  }
}

/**
 * The sort key for the empty query.
 *
 * Bounded so a row used a hundred times cannot bury the rest of the catalogue: the gain peaks at
 * eight uses, and the stable sort keeps catalogue order among rows with the same habit.
 */
export function paletteBoost(uses: PaletteUses): (id: string) => number {
  return (id: string) => Math.min(uses[id] ?? 0, 8);
}
