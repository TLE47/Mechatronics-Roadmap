/**
 * The authoritative lesson path map shared by the resource panel and the workspace resolver.
 *
 * A relative Markdown link is only an internal lesson when this build actually lists that page; the
 * map is built from the same generated lesson registry the runner uses, so a renamed page becomes an
 * explicit unavailable link rather than a guessed route.
 */

import { PYTHON_LESSONS } from '../../data/pythonLessonsData';

export const LESSON_ID_BY_PATH: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const lesson of PYTHON_LESSONS) {
    for (const path of [lesson.path, lesson.readerPath]) {
      if (path) map.set(path, lesson.id);
    }
  }
  return map;
})();
