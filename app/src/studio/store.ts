/**
 * What the free-study studio keeps (`app/src/studio/store.ts`).
 *
 * One workspace, not one entry per lesson: the studio is the place a learner writes a program that
 * belongs to no exercise, sketches a workflow for no problem set, and keeps a note that no lesson
 * owns. So the store is one record behind one key rather than a map — there is exactly one studio.
 *
 * Two honest limits, the same two the rest of the app keeps:
 *
 * - **The bucket can refuse a write.** Private mode, a blocked store and a full bucket all make
 *   `setItem` throw. `saveStudio` returns `false` and the tab says "Not saved", because a box that
 *   claims to have kept a program it did not is worse than one that says so.
 * - **Stored bytes are not trusted.** A hand-edited value, a build from an older shape, or a
 *   half-written record reads as whatever still parses; a record with nothing in it is not a record.
 *   The caps bound one studio, not the number of studios, because there is only one.
 *
 * An empty studio removes its key rather than storing `{code:"",note:""}`: "never wrote anything"
 * and "wrote, then cleared everything" are the same state, and the next visit gets the starter back.
 */

import { bulkStorage } from '../bulkStorage.ts';

export const STORAGE_KEY_STUDIO = 'mechalab_studio_v1';
export const MAX_STUDIO_CODE_CHARS = 20_000;
export const MAX_STUDIO_NOTE_CHARS = 4_000;

/** The first program a learner sees. Nothing is graded, so it is a demonstration rather than a brief. */
export const STARTER_CODE = 'print("Hello from the studio")\n';

export interface StudioDoc {
  /** The scratch program, exactly as typed (ends preserved: a trailing newline is the learner's). */
  code: string;
  /** The free note, trimmed at the ends like every other note in the app. */
  note: string;
  /** Last write, for a restore or a merge to order by. Zero when the starter is on screen. */
  updatedAt: number;
}

export const EMPTY_STUDIO: StudioDoc = { code: STARTER_CODE, note: '', updatedAt: 0 };

function storage(): Storage | null {
  return bulkStorage();
}

/** A note keeps its own line breaks; only the ends are trimmed, and only the cap is applied. */
export function cleanStudioNote(text: string): string {
  if (typeof text !== 'string') return '';
  return text.replace(/^\s+|\s+$/g, '').slice(0, MAX_STUDIO_NOTE_CHARS);
}

/** Code is not trimmed: leading indentation and a final newline are part of the program. */
export function cleanStudioCode(text: string): string {
  if (typeof text !== 'string') return '';
  return text.slice(0, MAX_STUDIO_CODE_CHARS);
}

function asStudio(value: unknown): StudioDoc | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entry = value as Record<string, unknown>;
  const code = cleanStudioCode(typeof entry.code === 'string' ? entry.code : '');
  const note = cleanStudioNote(typeof entry.note === 'string' ? entry.note : '');
  const at = Number(entry.updatedAt);
  return {
    code,
    note,
    updatedAt: Number.isFinite(at) && at >= 0 ? at : 0,
  };
}

/** The stored studio, or the starter when nothing is stored or the value is junk. */
export function readStudio(): StudioDoc {
  const store = storage();
  if (!store) return { ...EMPTY_STUDIO };
  try {
    const raw = store.getItem(STORAGE_KEY_STUDIO);
    if (raw === null || raw.trim() === '') return { ...EMPTY_STUDIO };
    return asStudio(JSON.parse(raw)) ?? { ...EMPTY_STUDIO };
  } catch {
    return { ...EMPTY_STUDIO };
  }
}

/**
 * Write the studio and return whether the bytes landed.
 *
 * A patch rather than a whole document so the two boxes cannot overwrite each other: the note's
 * debounce and the code's debounce both read the record first, and a field the caller did not touch
 * keeps the value the other box just wrote.
 */
export function saveStudio(
  patch: Partial<Pick<StudioDoc, 'code' | 'note'>>,
  now: number = Date.now()
): boolean {
  const store = storage();
  if (!store) return false;
  const current = readStudio();
  const next: StudioDoc = {
    code: cleanStudioCode(patch.code ?? current.code),
    note: cleanStudioNote(patch.note ?? current.note),
    updatedAt: now,
  };
  try {
    if (!next.code && !next.note) {
      store.removeItem(STORAGE_KEY_STUDIO);
      return true;
    }
    store.setItem(STORAGE_KEY_STUDIO, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}
