import { PYTHON_LESSONS } from './data/pythonLessonsData';

// The README's opening block, word for word. `scripts/check_consistency.py` fails when these and
// README.md disagree, so a newcomer who opens the workbench gets the same first instruction.
export const START_HERE_HEADING = 'Start here — your first 2 hours';
export const START_HERE_LINK_LABEL = 'Open Lesson 1: Variables and data types →';
export const START_HERE_NOTE =
  'One lesson, one editor, one Run button. No install, no account, nothing to buy.';

/** The lesson's page in the repo, read from the same generated dataset the runner uses. */
export const START_HERE_LESSON_PATH =
  (PYTHON_LESSONS.find((lesson) => lesson.id === 'P.1') ?? PYTHON_LESSONS[0]).path;

/**
 * The README links Lesson 1 relatively. Pages serves only the built app, not the Markdown pages,
 * so the workbench links the identical path on GitHub and keeps the lesson open here.
 */
export const START_HERE_LESSON_URL = `https://github.com/TLE47/Mechatronics-Roadmap/blob/main/${START_HERE_LESSON_PATH}`;
