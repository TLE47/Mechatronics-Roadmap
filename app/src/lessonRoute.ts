import { PYTHON_LESSONS } from './data/pythonLessonsData';

/**
 * A lesson's own address: `?lesson=P.1`.
 *
 * The pages link into the workbench (`scripts/generate_run_callouts.py` writes that link), so the
 * entry a reader is told to run has to survive the click instead of leaving them to retype an id in
 * the search box. The workbench is one static page on GitHub Pages - no router - so the address is
 * the query string: it needs no server to answer it, and it survives a reload and a shared link.
 */

export const LESSON_QUERY_KEY = 'lesson';

/** The id in a query string, or null when it is absent or names nothing the runner lists. */
export function lessonIdFromSearch(search: string): string | null {
  const wanted = new URLSearchParams(search).get(LESSON_QUERY_KEY);
  if (!wanted) return null;
  const found = PYTHON_LESSONS.find((lesson) => lesson.id === wanted);
  return found ? found.id : null;
}

/**
 * The lesson named by the address bar, or null when there is no address to read.
 *
 * The server-rendered smoke test installs a `window` with no `location`, so this is the guard that
 * keeps `?lesson=` from crashing a render that has no URL.
 */
export function lessonIdFromLocation(): string | null {
  if (typeof window === 'undefined' || !window.location) return null;
  return lessonIdFromSearch(window.location.search || '');
}

/** The query a lesson's address uses, ids included: `?lesson=EX.05-control.T2.05a`. */
export function lessonSearch(id: string): string {
  return `?${LESSON_QUERY_KEY}=${encodeURIComponent(id)}`;
}

/**
 * Keep the address bar on the lesson in the editor, so copying the URL reopens it.
 *
 * `replaceState`, not `pushState`: picking a lesson is a choice inside one screen, not a page the
 * back button should return to. Guarded for the server-rendered smoke test, where there is no
 * window and no address to write.
 */
export function rememberLessonInUrl(id: string): void {
  if (typeof window === 'undefined' || !window.location || !window.history?.replaceState) return;
  const { pathname, hash } = window.location;
  window.history.replaceState(null, '', `${pathname}${lessonSearch(id)}${hash}`);
}
