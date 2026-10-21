// The `.ts` extension is for Node's type stripping (`scripts/test_last_lesson.mjs`), the same way
// `paletteCatalog.ts` imports its registry: no bundler, no resolution rules beyond what the file says.
import { PYTHON_LESSONS } from './data/pythonLessonsData.ts';

/**
 * Where the learner was, so the next visit opens there instead of at Lesson 1.
 *
 * The address bar already remembers a lesson (`?lesson=`), but only for the tab it was typed in: a
 * learner who bookmarks the plain workbench URL, or opens it from the browser's most-visited row,
 * arrives with no query string and was put back on P.1 every time - on their ninth verification as
 * much as their first. The registry knows which lessons exist, so this is the second half of the same
 * promise `lessonRoute.ts` makes: the address carries a deliberate pick, and storage carries the
 * ordinary one.
 *
 * Two deliberate limits:
 *
 * - **Only ids the registry lists.** A hand-edited or stale value is ignored rather than opening an
 *   empty editor, and the workbench falls back to its own first entry.
 * - **Never throws.** Private mode and a blocked third-party context both make `localStorage` throw on
 *   access; a learner in one of those sees P.1, not a blank screen.
 */

export const STORAGE_KEY_LAST_LESSON = 'mechalab_last_lesson_v1';

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** The lesson to reopen, or null when there is none (or it names nothing the runner lists). */
export function readLastLessonId(): string | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(STORAGE_KEY_LAST_LESSON);
    if (!raw) return null;
    return PYTHON_LESSONS.some((lesson) => lesson.id === raw) ? raw : null;
  } catch {
    return null;
  }
}

/** Record the lesson on screen. Called on every selection, including the one a deep link opens. */
export function rememberLastLesson(id: string): void {
  const store = storage();
  if (!store) return;
  if (!PYTHON_LESSONS.some((lesson) => lesson.id === id)) return;
  try {
    store.setItem(STORAGE_KEY_LAST_LESSON, id);
  } catch {
    // A full or disabled store must not break the runner; this visit still works, the next starts at
    // the top.
  }
}
