/**
 * The read-only files a lesson brings to the editor.
 *
 * Most lessons are one file. The Tier 2 and Tier 3 exercises are not: they import the shared arm
 * (`mechalab_plant.py`) that the capstone also uses, and a learner needs to read it to understand
 * what the checks assume. Shipping it as a second, locked tab is what makes the runner a small
 * project rather than a scratch pad, and the worker writes the same files into Pyodide's filesystem
 * so an import works exactly as it would locally.
 *
 * Nothing here is generated: the plant is embedded by `scripts/generate_plant_data.py`, and whether
 * a lesson uses it is read from the lesson's own text, so a lesson that starts importing it gets the
 * tab without a second edit.
 */

import type { PythonLessonItem } from './data/pythonLessonsData';

export interface LessonFile {
  /** The name Python sees: `mechalab_plant.py`. */
  name: string;
  content: string;
  readOnly: boolean;
}

export const MAIN_FILE_NAME = 'main.py';

/** Does this lesson's own text mention the shared plant (starter, solution, hints, tests, output)? */
export function lessonUsesPlant(lesson: PythonLessonItem): boolean {
  const haystack = [
    lesson.starterCode,
    lesson.fullSolution,
    lesson.instructorTests,
    lesson.expectedOutput,
    lesson.hints.join('\n'),
  ].join('\n');
  return haystack.includes('mechalab_plant');
}

/**
 * Helper tabs for one lesson, in tab order. The entry file is not in this list: it is the editor's
 * own document, and listing it would imply two copies of the code that can disagree.
 */
export function helperFilesForLesson(
  lesson: PythonLessonItem,
  plant: { filename: string; source: string }
): LessonFile[] {
  if (!lessonUsesPlant(lesson)) return [];
  return [{ name: plant.filename, content: plant.source, readOnly: true }];
}
