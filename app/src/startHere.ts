import * as startHere from './data/startHere.json';
import { PYTHON_LESSONS } from './data/pythonLessonsData';

// One source for the words: `app/src/data/startHere.json`. The README block is generated from the
// same file by `scripts/generate_start_here.py`, so the two doors a newcomer can arrive at open
// with the same heading, Lesson 1 link and promise without a copy that can drift.
export const START_HERE_HEADING = startHere.heading;
export const START_HERE_LINK_LABEL = startHere.linkLabel;
export const START_HERE_NOTE = startHere.note;

/** Once the collapsed strip is dismissed, this is what keeps it gone until the roadmap restores it. */
export const STORAGE_KEY_START_HERE_DISMISSED = 'mechalab_start_here_dismissed_v1';

/** The lesson's page in the repo, read from the same generated dataset the runner uses. */
export const START_HERE_LESSON_PATH =
  (PYTHON_LESSONS.find((lesson) => lesson.id === startHere.lessonId) ?? PYTHON_LESSONS[0]).path;

/**
 * The README links Lesson 1 relatively. Pages serves only the built app, not the Markdown pages,
 * so the workbench links the identical path on GitHub and keeps the lesson open here.
 */
export const START_HERE_LESSON_URL = `https://github.com/TLE47/Mechatronics-Roadmap/blob/main/${START_HERE_LESSON_PATH}`;
