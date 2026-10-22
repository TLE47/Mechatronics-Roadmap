/**
 * What the learner writes down (`app/src/studyNotes.ts`).
 *
 * The workbench can already say what was *run*; it cannot say what was *understood*, and that is
 * where a term of self-paced study is lost — the note that made a tolerance click, and the passage
 * that was still fuzzy three days later, both used to live on paper beside the laptop.
 *
 * One store, two shapes, because they are the same act:
 *
 * - **A note** is free text per lesson: what clicked, what is still fuzzy. One per lesson, edited in
 *   place, because a second note box is a second place to look.
 * - **A highlight** is a quoted passage plus an optional comment. The quote is the identity: saving
 *   the same passage twice updates what was said about it rather than growing a duplicate list.
 *
 * Bounded, because a note store with no ceiling is one that eventually makes every write, export and
 * backup pay for it - the caps are what keep the archive small and the fallback (`localStorage`, for a
 * browser that refuses IndexedDB) inside 5 MB:
 * `MAX_NOTE_CHARS` per note, `MAX_HIGHLIGHTS` per lesson, `MAX_NOTE_LESSONS` lessons. Eviction is by
 * last write, so the notes a learner is actually using survive and the ones from a month ago go
 * first — and a lesson that loses its last note and highlight is removed entirely, so an empty entry
 * never pins a lesson in the store.
 *
 * Never throws: private mode and blocked storage both make `localStorage` throw on access, and a
 * learner in one of those still gets a working lesson, just without notes.
 */

import { bulkStorage } from './bulkStorage.ts';

export const STORAGE_KEY_STUDY = 'mechalab_study_notes_v1';
export const MAX_NOTE_CHARS = 4_000;
export const MAX_HIGHLIGHTS = 20;
export const MAX_HIGHLIGHT_CHARS = 400;
/** A highlight's comment is a margin note, not a second essay: the bucket has to hold 20 per lesson. */
export const MAX_COMMENT_CHARS = 400;
export const MAX_NOTE_LESSONS = 25;

export interface Highlight {
  /** The quoted text, whitespace collapsed: the identity of the highlight. */
  quote: string;
  /** What the learner said about it, if anything. */
  comment: string;
  /** When it was first saved, so the list can sort and the merge can pick a winner. */
  at: number;
}

export interface LessonStudy {
  note: string;
  highlights: Highlight[];
  /** Last write: the eviction order, and what tells an untouched lesson from an edited one. */
  updatedAt: number;
}

/** Lesson id -> what was written about it. */
export type StudyStore = Record<string, LessonStudy>;

function storage(): Storage | null {
  // IndexedDB when the browser has it (`bulkStorage.ts`), the bucket otherwise.
  return bulkStorage();
}

/** A selection across three lines reads as one line: the quote is for reading back, not for diffing. */
export function cleanQuote(text: string): string {
  if (typeof text !== 'string') return '';
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_HIGHLIGHT_CHARS);
}

/** Notes keep their own line breaks and indentation; only the ends are trimmed. */
export function cleanNote(text: string): string {
  if (typeof text !== 'string') return '';
  return text.replace(/^\s+|\s+$/g, '').slice(0, MAX_NOTE_CHARS);
}

/** A comment is held to the smaller cap, so a lesson's twenty highlights cannot fill the bucket. */
export function cleanComment(text: string): string {
  return cleanNote(text).slice(0, MAX_COMMENT_CHARS);
}

function asHighlight(value: unknown): Highlight | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Record<string, unknown>;
  const quote = cleanQuote(typeof entry.quote === 'string' ? entry.quote : '');
  if (!quote) return null;
  const at = Number(entry.at);
  return {
    quote,
    comment: cleanComment(typeof entry.comment === 'string' ? entry.comment : ''),
    at: Number.isFinite(at) && at >= 0 ? at : 0,
  };
}

function asLesson(value: unknown): LessonStudy | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Record<string, unknown>;
  const highlights: Highlight[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(entry.highlights) ? entry.highlights : []) {
    const highlight = asHighlight(raw);
    if (!highlight || seen.has(highlight.quote)) continue;
    seen.add(highlight.quote);
    highlights.push(highlight);
  }
  const note = cleanNote(typeof entry.note === 'string' ? entry.note : '');
  if (!note && highlights.length === 0) return null;
  const updatedAt = Number(entry.updatedAt);
  return {
    note,
    highlights: highlights.slice(-MAX_HIGHLIGHTS),
    updatedAt: Number.isFinite(updatedAt) && updatedAt >= 0 ? updatedAt : 0,
  };
}

/** A store written by another version, or by hand, reads as the part of itself that still parses. */
export function parseStudy(raw: string | null): StudyStore {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const store: StudyStore = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      const lesson = asLesson(value);
      if (lesson) store[id] = lesson;
    }
    return store;
  } catch {
    return {};
  }
}

/**
 * Write the store back, newest last, capped.
 *
 * The cap is applied here rather than at every call site: a lesson that went over its highlight
 * limit, or a store that went over its lesson limit, is trimmed by the same rule no matter which
 * function put the entry in.
 */
function writeStudy(store: Storage, study: StudyStore): void {
  const ids = Object.keys(study).sort(
    (a, b) => (study[a].updatedAt ?? 0) - (study[b].updatedAt ?? 0)
  );
  for (const stale of ids.slice(0, Math.max(0, ids.length - MAX_NOTE_LESSONS))) delete study[stale];
  try {
    store.setItem(STORAGE_KEY_STUDY, JSON.stringify(study));
  } catch {
    // A full or blocked bucket keeps this session's notes in memory and loses the write; the
    // alternative - throwing into a React render - would take the lesson down with it.
  }
}

/**
 * Replace the whole store, used after a restore has merged this browser's notes with another's.
 *
 * The same caps apply: a restored file is reviewed data, not a licence to fill the bucket.
 */
export function replaceStudy(study: StudyStore): void {
  const store = storage();
  if (!store) return;
  writeStudy(store, { ...study });
}

/** Every lesson with something written about it. */
export function readStudy(): StudyStore {
  const store = storage();
  if (!store) return {};
  try {
    return parseStudy(store.getItem(STORAGE_KEY_STUDY));
  } catch {
    return {};
  }
}

/** One lesson's note and highlights, or null when nothing was written. */
export function readLessonStudy(id: string): LessonStudy | null {
  const study = readStudy();
  return study[id] ?? null;
}

/**
 * Store a lesson's note, or forget it when the box is empty.
 *
 * Empty means empty: a note cleared back to nothing removes the entry (and the lesson itself when
 * it has no highlights), so "no note" stays the same state as "never wrote one" instead of an entry
 * whose text happens to be blank.
 */
export function saveNote(id: string, text: string, now: number = Date.now()): void {
  const store = storage();
  if (!store) return;
  const study = readStudy();
  const note = cleanNote(text);
  const existing = study[id];
  if (!note) {
    if (!existing) return;
    existing.note = '';
    if (existing.highlights.length === 0) delete study[id];
    else existing.updatedAt = now;
    writeStudy(store, study);
    return;
  }
  study[id] = { note, highlights: existing?.highlights ?? [], updatedAt: now };
  writeStudy(store, study);
}

/**
 * Save a quoted passage, optionally with a comment. Returns what was stored, or null for nothing.
 *
 * The same passage saved twice is one highlight: the comment is replaced when the second one has
 * something to say, and the original timestamp is kept, because the learner's first sighting is the
 * useful one.
 */
export function addHighlight(
  id: string,
  quote: string,
  comment = '',
  now: number = Date.now()
): Highlight | null {
  const store = storage();
  const cleaned = cleanQuote(quote);
  if (!store || !cleaned) return null;
  const study = readStudy();
  const lesson = study[id] ?? { note: '', highlights: [], updatedAt: now };
  const found = lesson.highlights.find((highlight) => highlight.quote === cleaned);
  const cleanedComment = cleanComment(comment);
  if (found) {
    if (cleanedComment) found.comment = cleanedComment;
  } else {
    lesson.highlights.push({ quote: cleaned, comment: cleanedComment, at: now });
  }
  lesson.highlights = lesson.highlights.slice(-MAX_HIGHLIGHTS);
  lesson.updatedAt = now;
  study[id] = lesson;
  writeStudy(store, study);
  return lesson.highlights.find((highlight) => highlight.quote === cleaned) ?? null;
}

/**
 * Replace a highlight's comment, including with nothing.
 *
 * `addHighlight` deliberately refuses a blank overwrite: pinning the same passage again must not wipe
 * the thought attached to it. Clearing the box on purpose is a different act, and it is now the way a
 * review card is retired (a card exists exactly while its highlight has a comment), so it gets a door
 * of its own instead of loosening that rule.
 */
export function setComment(
  id: string,
  quote: string,
  comment: string,
  now: number = Date.now()
): Highlight | null {
  const store = storage();
  const cleaned = cleanQuote(quote);
  if (!store || !cleaned) return null;
  const study = readStudy();
  const lesson = study[id];
  const found = lesson?.highlights.find((highlight) => highlight.quote === cleaned);
  if (!lesson || !found) return null;
  found.comment = cleanComment(comment);
  lesson.updatedAt = now;
  writeStudy(store, study);
  return found;
}

/** Remove one highlight; the lesson goes with it when nothing is left. */
export function removeHighlight(id: string, quote: string, now: number = Date.now()): void {
  const store = storage();
  if (!store) return;
  const study = readStudy();
  const lesson = study[id];
  if (!lesson) return;
  const cleaned = cleanQuote(quote);
  const next = lesson.highlights.filter((highlight) => highlight.quote !== cleaned);
  if (next.length === lesson.highlights.length) return;
  lesson.highlights = next;
  if (!lesson.note && next.length === 0) delete study[id];
  else lesson.updatedAt = now;
  writeStudy(store, study);
}

/** What a backup should say about the store: lessons with something in them, and how much. */
export function studyCounts(study: StudyStore = readStudy()): {
  lessons: number;
  notes: number;
  highlights: number;
} {
  const lessons = Object.values(study);
  return {
    lessons: lessons.length,
    notes: lessons.filter((lesson) => lesson.note.length > 0).length,
    highlights: lessons.reduce((total, lesson) => total + lesson.highlights.length, 0),
  };
}

/**
 * Merge a restored store into this one - the rule the backup promises: **never deletes**.
 *
 * - A note already written here wins; an empty one is filled from the file. The text on this machine
 *   is the text being edited, so it is by definition the newer draft.
 * - Highlights union by quote. For the same quote the newer `at` carries the comment, so restoring
 *   an older backup cannot erase a comment written after it.
 * - The result is written back through the same caps as any other write.
 *
 * Returns what actually arrived, which is what the restore report counts.
 */
export function mergeStudy(
  local: StudyStore,
  incoming: StudyStore
): { store: StudyStore; addedLessons: number; addedNotes: number; addedHighlights: number } {
  const merged: StudyStore = {};
  for (const [id, lesson] of Object.entries(local)) {
    merged[id] = { ...lesson, highlights: lesson.highlights.map((highlight) => ({ ...highlight })) };
  }
  let addedLessons = 0;
  let addedNotes = 0;
  let addedHighlights = 0;
  for (const [id, incomingLesson] of Object.entries(incoming)) {
    const here = merged[id];
    if (!here) {
      merged[id] = {
        note: incomingLesson.note,
        highlights: incomingLesson.highlights.map((highlight) => ({ ...highlight })),
        updatedAt: incomingLesson.updatedAt,
      };
      addedLessons += 1;
      if (incomingLesson.note) addedNotes += 1;
      addedHighlights += incomingLesson.highlights.length;
      continue;
    }
    let touched = false;
    if (!here.note && incomingLesson.note) {
      here.note = incomingLesson.note;
      addedNotes += 1;
      touched = true;
    }
    for (const incomingHighlight of incomingLesson.highlights) {
      const existing = here.highlights.find((highlight) => highlight.quote === incomingHighlight.quote);
      if (!existing) {
        here.highlights.push({ ...incomingHighlight });
        addedHighlights += 1;
        touched = true;
      } else if (incomingHighlight.at > existing.at && incomingHighlight.comment) {
        existing.comment = incomingHighlight.comment;
        existing.at = incomingHighlight.at;
        touched = true;
      }
    }
    if (touched) {
      addedLessons += 1;
      here.highlights = here.highlights.slice(-MAX_HIGHLIGHTS);
      here.updatedAt = Math.max(here.updatedAt, incomingLesson.updatedAt);
    }
  }
  return { store: merged, addedLessons, addedNotes, addedHighlights };
}
