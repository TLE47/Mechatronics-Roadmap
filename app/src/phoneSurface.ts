/**
 * Which half of Study a phone is looking at (`app/src/phoneSurface.ts`).
 *
 * On a phone the lesson text and the editor cannot share the screen: 390 px gives each of them a
 * column narrower than a Python line, and the keyboard then hides half of what is left. So Study
 * becomes one surface at a time, switched from the bottom bar. The choice is remembered per lesson
 * so closing the tab mid-code and coming back lands in the code, not at the top of the prose.
 *
 * The record names the lesson it belongs to. A stored "code" for P.1 must not open P.2 in the
 * editor — a new lesson starts on its text, which is the thing a learner has not read yet. That
 * mismatch check is the whole reason the record carries the id rather than a bare `'lesson'|'code'`.
 *
 * Pure apart from the two storage functions, so `npm run test:phone` can pin the migration and the
 * default without a browser.
 */

export type PhoneSurface = 'lesson' | 'code';

export const PHONE_SURFACE_KEY = 'mechalab_phone_surface_v1';

export interface PhoneSurfaceRecord {
  lesson: string;
  surface: PhoneSurface;
}

/** A value that is not one of the two surfaces is the reading surface, never the editor. */
export function normalizePhoneSurface(value: unknown): PhoneSurface {
  return value === 'code' ? 'code' : 'lesson';
}

/** The surface a lesson opens on when nothing has been stored for it: the text. */
export function defaultPhoneSurface(): PhoneSurface {
  return 'lesson';
}

/**
 * The stored record, or null when there is none or it is unusable.
 *
 * Shape-checked one field at a time: a store from an older build (or a hand-edited one) must not
 * throw a learner out of their lesson, so anything unexpected reads as "no record".
 */
export function parsePhoneSurface(raw: string | null): PhoneSurfaceRecord | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const entry = parsed as Record<string, unknown>;
    if (typeof entry.lesson !== 'string' || !entry.lesson) return null;
    if (entry.surface !== 'lesson' && entry.surface !== 'code') return null;
    return { lesson: entry.lesson, surface: entry.surface };
  } catch {
    return null;
  }
}

function bucket(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * The surface to show for `lessonId`.
 *
 * A record for another lesson is deliberately ignored rather than reused: `'code'` describes code
 * the learner was writing, and carrying it into a lesson they have never opened would hide the text
 * they came to read.
 */
export function readPhoneSurface(lessonId: string, store: Storage | null = bucket()): PhoneSurface {
  if (!store || !lessonId) return defaultPhoneSurface();
  try {
    const record = parsePhoneSurface(store.getItem(PHONE_SURFACE_KEY));
    if (!record || record.lesson !== lessonId) return defaultPhoneSurface();
    return record.surface;
  } catch {
    return defaultPhoneSurface();
  }
}

/** Store the surface for this lesson and return it, so a caller can use the value it just wrote. */
export function writePhoneSurface(
  lessonId: string,
  surface: PhoneSurface,
  store: Storage | null = bucket()
): PhoneSurface {
  const next = normalizePhoneSurface(surface);
  if (!store || !lessonId) return next;
  try {
    store.setItem(PHONE_SURFACE_KEY, JSON.stringify({ lesson: lessonId, surface: next }));
  } catch {
    // Blocked storage leaves the switch working for this visit, which is the part that matters.
  }
  return next;
}

/** The other surface, for a two-way toggle. */
export function togglePhoneSurface(surface: PhoneSurface): PhoneSurface {
  return surface === 'code' ? 'lesson' : 'code';
}
