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
 *
 * `anchorAt` is where that heading sat when the position was taken, and it is what makes the return
 * exact rather than approximate: restoring to the heading's top alone read a learner who had stopped
 * 900 px into a section back at its first line (the pages suite measured 900 px in, 464 px back). The
 * distance *into* the section — `at - anchorAt` — is the part that belongs to the reader rather than
 * to the page, so it is carried across a reflow that moved the heading.
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
  /**
   * That heading's own offset when the position was taken. Absent in positions written before it
   * existed, which restore to the heading as they always did.
   */
  anchorAt?: number;
  /**
   * The block that was at the top of the pane (`data-reader-block`), and its offset then.
   *
   * A heading is too coarse for a split-view resize: a section can be several screens, and the
   * paragraph a learner was on has to stay under their eyes when the column narrows and everything
   * reflows. The block is the finest thing the page has, and the distance into it is what survives.
   */
  block?: string;
  blockAt?: number;
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
  const clean: ReadingPosition = { anchor, at };
  const raw = record.anchorAt;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    clean.anchorAt = Math.min(MAX_READING_OFFSET, Math.max(0, Math.round(raw)));
  }
  if (typeof record.block === 'string' && record.block) {
    clean.block = record.block.slice(0, 64);
    const blockAt = record.blockAt;
    if (typeof blockAt === 'number' && Number.isFinite(blockAt)) {
      clean.blockAt = Math.min(MAX_READING_OFFSET, Math.max(0, Math.round(blockAt)));
    }
  }
  return clean;
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

/** Every lesson's reading place, for the reset panel's "Where I was" list. */
export function readReadingPositions(): Record<string, ReadingPosition> {
  return readAll();
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

/** A scroll paused for this long is written; one inside the window is written when the window closes. */
export const SAVE_AFTER_MS = 350;

/** The clock a saver uses, injectable so its window can be stepped in a test rather than slept. */
export interface SaveTimers {
  now: () => number;
  set: (fn: () => void, ms: number) => number;
  clear: (handle: number) => void;
}

export interface ReadingSaver {
  /** Offer the latest position. The first one writes now; one inside the window writes at its close. */
  remember: (position: ReadingPosition) => void;
  /** Write a pending position now, if there is one. */
  flush: () => void;
  /** Drop a pending position without writing it, as returning to the top does. */
  cancel: () => void;
}

const LIVE_TIMERS: SaveTimers = {
  now: () => Date.now(),
  set: (fn, ms) => setTimeout(fn, ms) as unknown as number,
  clear: (handle) => clearTimeout(handle),
};

/**
 * One write per pause, and never a dropped scroll.
 *
 * A throttle that only skips a write inside the window loses the last scroll before a reload: the
 * position is then whatever was stored at mount, which is how the pages suite came back 327 px into a
 * section it had left at 1476. An edit inside the window is therefore kept as pending and written
 * when the window closes (or on `flush`), and only the newest position is written.
 */
export function createReadingSaver(
  write: (position: ReadingPosition) => void,
  afterMs = SAVE_AFTER_MS,
  timers: SaveTimers = LIVE_TIMERS
): ReadingSaver {
  // Null until the first write: a clock's zero is a real instant, not "never written".
  let lastSaved: number | null = null;
  let pending: ReadingPosition | null = null;
  let handle: number | null = null;
  const cancel = () => {
    if (handle !== null) {
      timers.clear(handle);
      handle = null;
    }
    pending = null;
  };
  const flush = () => {
    if (handle !== null) {
      timers.clear(handle);
      handle = null;
    }
    if (!pending) return;
    const position = pending;
    pending = null;
    lastSaved = timers.now();
    write(position);
  };
  const remember = (position: ReadingPosition) => {
    pending = position;
    const wait = lastSaved === null ? 0 : Math.max(0, afterMs - (timers.now() - lastSaved));
    if (wait === 0) flush();
    else if (handle === null) handle = timers.set(flush, wait);
  };
  return { remember, flush, cancel };
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
