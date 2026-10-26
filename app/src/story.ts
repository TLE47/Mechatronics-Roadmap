/**
 * The story's one remembered preference (`app/src/story.ts`).
 *
 * It lives here, in a plain module, for two reasons: a Node suite can read the key without loading a
 * TSX component, and the key is a fact about the prologue rather than about the card that draws it.
 *
 * Like the tour's own key it is *not* in the backup: whether a learner has read the four-line
 * prologue is a fact about this browser's first visit, not work to carry between devices.
 */
export const STORY_SEEN_KEY = 'mechalab_prologue_seen_v1';

export function readStorySeen(storage?: Storage | null): boolean {
  try {
    const store = storage ?? (typeof localStorage === 'undefined' ? null : localStorage);
    return store?.getItem(STORY_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

/** Remember that it has been read. Never throws: a disabled store just shows it again. */
export function markStorySeen(storage?: Storage | null): void {
  try {
    const store = storage ?? (typeof localStorage === 'undefined' ? null : localStorage);
    store?.setItem(STORY_SEEN_KEY, '1');
  } catch {
    // No store, no memory, and the card is skippable again.
  }
}
