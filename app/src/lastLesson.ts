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

/** The two progress flags the roadmap already reads, as plain maps. */
export interface LessonProgress {
  verified: Record<string, boolean>;
  completed: Record<string, boolean>;
}

/** Which lesson to offer, and why that one. */
export interface LessonOffer {
  id: string;
  /** `resume` = the lesson they stopped on; `next` = the first one still to do. */
  reason: 'resume' | 'next';
}

/**
 * The lesson the roadmap should offer, or null when it has nothing to say.
 *
 * "Continue" has to mean forward progress. Offering back the lesson that was last *opened* is only
 * right while it is unfinished: the moment it is verified, pointing at it again asks the learner to
 * redo the thing they just did, on the one screen whose job is to say what is next. So the offer is
 * the stopped-on lesson while it is unverified, and otherwise the first lesson after it that is
 * neither verified nor self-marked - wrapping to the earliest gap once the end is reached, because a
 * learner who skipped something early should still be shown it before the course is called done.
 *
 * Two cases produce no card at all:
 *
 * - **Nothing remembered** - a first visit belongs to the landing page's own "Start here" block.
 * - **An untouched first entry** - the runner mounts on the first lesson and remembers it, so without
 *   this rule a brand-new learner would be invited to resume a lesson they never started.
 */
export function lessonOffer(
  storedId: string | null,
  lessons: readonly string[],
  progress: LessonProgress
): LessonOffer | null {
  if (!storedId) return null;
  const at = lessons.indexOf(storedId);
  // The registry that lists the ids is the same one `readLastLessonId` validated against; a miss here
  // means a caller passed a different list, and "nothing to offer" is the only safe answer.
  if (at < 0) return null;
  const verified = !!progress.verified[storedId];
  const completed = !!progress.completed[storedId];
  if (!verified && at === 0 && !completed) return null;
  // Self-marking is a note the learner wrote, not a pass: on the lesson they stopped on it keeps the
  // offer here (and the card prints "marked complete by you"), because it is still unverified.
  if (!verified) return { id: storedId, reason: 'resume' };
  // Looking forward, that same note does count as done - a lesson the learner has declared finished
  // is not what they should be sent to next.
  const order = [...lessons.slice(at + 1), ...lessons.slice(0, at + 1)];
  const next = order.find((id) => !progress.verified[id] && !progress.completed[id]);
  return next ? { id: next, reason: 'next' } : null;
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
