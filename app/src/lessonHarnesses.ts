/**
 * The lessons whose pass condition is a graded harness, keyed by lesson id.
 *
 * Adding a capstone to this registry is all it takes for its "Run & Verify Output" to require every
 * harness metric at target: the runner sends the source, parses the report against the units, and
 * gates the pass on the verdict. A lesson that is not here keeps the behaviour-plus-output pass.
 */

import type { LessonHarness } from './harnessGrading.ts';
import { FAULT_BENCH_HARNESS } from './faultBenchGrading.ts';
import { T3_HARNESS } from './capstoneBudgets.ts';

export const LESSON_HARNESSES: Record<string, LessonHarness> = {
  [FAULT_BENCH_HARNESS.lessonId]: FAULT_BENCH_HARNESS,
  [T3_HARNESS.lessonId]: T3_HARNESS,
};

/** The harness that grades this lesson, or `null` when the pass is behaviour and output alone. */
export function harnessForLesson(lessonId: string): LessonHarness | null {
  return LESSON_HARNESSES[lessonId] ?? null;
}

/** The Python a run sends for this lesson, or `''` when there is no harness to run. */
export function harnessSourceForLesson(lessonId: string): string {
  return harnessForLesson(lessonId)?.source ?? '';
}
