/**
 * Where a learner stopped reading (`app/src/readingPosition.ts`).
 *
 * A position is not a draft, and the store is deliberately separate from `lessonDraft.ts`: opening a
 * lesson must not make the list call it edited, and clearing a draft must not send the reader back
 * to the top. It is also *cache*, not authored work — losing it costs a scroll, never a keystroke —
 * which is why it lives in `localStorage` beside the other per-browser preferences instead of in
 * IndexedDB.
 *
 * The stored position is a heading anchor plus the pixel offset it was read at. The anchor is what
 * survives a reload: a page generated after the sentence changed keeps its headings, while a raw
 * scroll offset would land in a paragraph that moved. The offset is the fallback when the heading is
 * gone (a lesson rearranged between visits) and the precision when the anchor is the page's top.
 */

export const STORAGE_KEY_READING = 'mechalab_reading_position_v1';

/** The anchor a heading can carry, and the offset a scroll container can hold. */
export const MAX_ANCHOR_CHARS = 120;
export const MAX_READING_OFFSET = 5_000_000;

export interface ReadingPosition {
  /** The GitHub anchor of the heading at the top of the pane; '' when none is above it. */
  anchor: string;
  /** The pane's `scrollTop` when it was read, in pixels. */
  at: number;
}

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function sanitize(position: unknown): ReadingPosition | null {
  if (!position || typeof position !== 'object') return null;
  const record = position as Record<string, unknown>;
  if (typeof record.at !== 'number' || !Number.isFinite(record.at)) return null;
  const at = Math.min(MAX_READING_OFFSET, Math.max(0, Math.round(record.at)));
  const anchor = typeof record.anchor === 'string' ? record.anchor.slice(0, MAX_ANCHOR_CHARS) : '';
  return { anchor, at };
}

/** The whole store, or an empty object when nothing is stored or the value is not an object. */
function readAll(): Record<string, ReadingPosition> {
  const store = storage();
  if (!store) return {};
  try {
    const raw = store.getItem(STORAGE_KEY_READING);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const clean: Record<string, ReadingPosition> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      const position = sanitize(value);
      if (id && position) clean[id] = position;
    }
    return clean;
  } catch {
    return {};
  }
}

/** Where this lesson was left, or null when it has never been read here. */
export function readReadingPosition(lessonId: string): ReadingPosition | null {
  if (!lessonId) return null;
  return readAll()[lessonId] ?? null;
}

/**
 * Remember a position, and answer with what was stored (the clamp, not the attempt).
 *
 * A refused write still returns the position: the pane has already scrolled there, and a store that
 * is blocked costs the memory, never the visit.
 */
export function writeReadingPosition(lessonId: string, position: ReadingPosition): ReadingPosition {
  const clean = sanitize(position) ?? { anchor: '', at: 0 };
  if (!lessonId) return clean;
  const store = storage();
  if (store) {
    try {
      const all = readAll();
      all[lessonId] = clean;
      store.setItem(STORAGE_KEY_READING, JSON.stringify(all));
    } catch {
      // Blocked or full: the position lasts this visit only.
    }
  }
  return clean;
}

/** Forget one lesson's position, as the reader's "Top" control does after scrolling to the start. */
export function clearReadingPosition(lessonId: string): void {
  const store = storage();
  if (!store || !lessonId) return;
  try {
    const all = readAll();
    if (!(lessonId in all)) return;
    delete all[lessonId];
    store.setItem(STORAGE_KEY_READING, JSON.stringify(all));
  } catch {
    // Blocked or full: nothing to forget.
  }
}
