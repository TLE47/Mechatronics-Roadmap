import { MECHALAB_PLANT_FILENAME, MECHALAB_PLANT_PY } from '../../../data/mechalabPlant';
import type { LessonFile } from '../../../lessonFiles';

/**
 * The text a parked line is quoted from.
 *
 * A park names its own file because a Step in can land in a helper tab or the shared plant: quoting
 * main.py's line 116 for a line of the plant would be a sentence about a different program. The
 * learner's file is the text the run executed (so an edit made while parked cannot rewrite the
 * quote), while a helper and the plant are quoted from the same copies their tabs show.
 */
export function sourceForPark(
  file: string | undefined,
  runCode: string,
  helperFiles: readonly LessonFile[]
): string {
  if (!file || file === '<lesson_editor>') return runCode;
  const helper = helperFiles.find((entry) => entry.name === file);
  if (helper) return helper.content;
  // The plant is written into every run, whether or not this lesson's own text mentions it, so a
  // learner can import it anywhere and step into it there.
  return file === MECHALAB_PLANT_FILENAME ? MECHALAB_PLANT_PY : '';
}
