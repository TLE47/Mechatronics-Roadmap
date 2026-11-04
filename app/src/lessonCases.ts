/**
 * The cases a lesson's behavioural checks substitute (`app/src/lessonCases.ts`).
 *
 * A lesson's instructor tests do not ask one question: they replace the starter's variables with
 * several values — a normal reading, a boundary, a negative — and each replacement is a separate
 * claim about the code. The workbench used to report that set as a single pass/fail badge, which is
 * the wrong shape for the one moment it matters: a learner whose code works for `425` but not for
 * `1000` needs to see *which* case is open, not that "the behavioural check" failed.
 *
 * The summary the lesson ships is already a list of those claims (`instructorTestSummary`), one
 * sentence each, with the values it substitutes written into the sentence. This module reads that
 * list into cases and decides what the last run proved about each one.
 *
 * **What a run can and cannot prove.** The instructor tests are one program of sequential
 * assertions: it stops at the first failed assert. So a failure proves every earlier case passed and
 * leaves the later ones unchecked — that is arithmetic on the assertion order, not a guess. The
 * failing case itself is the one whose own values appear in the failure message. When the message
 * names no case, nothing is attributed: the panel keeps the message and the cases read "not
 * checked", because a wrong guess about which case broke is worse than saying it is unknown.
 */

import type { PythonLessonItem } from './data/pythonLessonsData.ts';

/** What the last run proved about one case. */
export type LessonCaseState = 'passed' | 'failed' | 'unchecked' | 'untested';

export interface LessonCase {
  /** Stable within one lesson: `c1`, `c2`, … so React and the tab can key by it. */
  id: string;
  /** The lesson's own sentence for this case. */
  label: string;
  /** The numbers the sentence substitutes, in the order they appear. */
  values: string[];
  state: LessonCaseState;
}

export interface LessonCaseInput {
  passStatus: string;
  /** The instructor's own failure text, as the runner received it. */
  instructorError: string;
}

const NUMBER = /-?\d+(?:\.\d+)?/g;

/** The numbers a case's sentence names; the ones a failure message can quote back. */
export function caseValues(label: string): string[] {
  const found = label.match(NUMBER) ?? [];
  return [...new Set(found)];
}

/** The numeric tokens in a failure message, normalized so `-0.0` and `0.0` compare equal. */
function messageValues(message: string): Set<string> {
  const values = new Set<string>();
  for (const token of message.match(NUMBER) ?? []) {
    values.add(String(Number(token)));
  }
  return values;
}

/** How many of a case's values the message quotes. */
function overlap(values: readonly string[], message: Set<string>): number {
  let hits = 0;
  for (const value of values) if (message.has(String(Number(value)))) hits += 1;
  return hits;
}

/**
 * The lesson's cases, with what the last run proved about each.
 *
 * With no run the cases are `untested`; a pass marks every case passed. A behavioural failure marks
 * the attributed case failed, the ones before it passed (the assertions ran in order), and the ones
 * after it unchecked. "Attributed" means the failure walks a practice input — no case is blamed
 * merely because it is first.
 */
export function lessonCases(
  lesson: Pick<PythonLessonItem, 'instructorTestSummary'>,
  run: LessonCaseInput
): LessonCase[] {
  const labels = (lesson.instructorTestSummary ?? []).map((label) => label.trim()).filter(Boolean);
  const cases: LessonCase[] = labels.map((label, index) => ({
    id: `c${index + 1}`,
    label,
    values: caseValues(label),
    state: 'untested' as LessonCaseState,
  }));
  if (cases.length === 0) return cases;

  if (run.passStatus === 'passed') {
    for (const entry of cases) entry.state = 'passed';
    return cases;
  }
  if (run.passStatus !== 'behavior_failed') return cases;

  const message = messageValues(run.instructorError ?? '');
  if (message.size > 0) {
    let best = -1;
    let bestHits = 0;
    cases.forEach((entry, index) => {
      const hits = overlap(entry.values, message);
      // A later case that quotes more values wins: a boundary failure repeats the boundary's own
      // numbers, and the first case often shares the starter's reading.
      if (hits > bestHits) {
        best = index;
        bestHits = hits;
      }
    });
    if (best >= 0) {
      cases.forEach((entry, index) => {
        entry.state = index < best ? 'passed' : index === best ? 'failed' : 'unchecked';
      });
      return cases;
    }
  }
  for (const entry of cases) entry.state = 'unchecked';
  return cases;
}

/** The one-line count the panel and the tab print above the list. */
export function caseSummary(cases: readonly LessonCase[]): string {
  if (cases.length === 0) return 'No cases';
  const failed = cases.filter((entry) => entry.state === 'failed').length;
  const passed = cases.filter((entry) => entry.state === 'passed').length;
  const untested = cases.every((entry) => entry.state === 'untested');
  if (untested) return `${cases.length} case${cases.length === 1 ? '' : 's'} · not run yet`;
  if (failed > 0) return `${cases.length} cases · ${failed} failed · ${passed} passed`;
  if (passed === cases.length) return `${cases.length} case${cases.length === 1 ? '' : 's'} · all passed`;
  return `${cases.length} cases · ${passed} passed · ${cases.length - passed} not checked`;
}

/** The word a case row prints for its state. */
export const CASE_STATE_LABEL: Record<LessonCaseState, string> = {
  passed: 'Passed',
  failed: 'Failed',
  unchecked: 'Not checked',
  untested: 'Not run',
};
