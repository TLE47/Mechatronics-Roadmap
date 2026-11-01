/**
 * Derived status: whether a measured value passes, and whether a requirement is met
 * (`app/src/projectStatus.ts`).
 *
 * These are the only rules a view may use to print “met” or “pass”. They read the test's own value,
 * unit, limit and direction, so there is no second place to keep a threshold and no view that can
 * disagree with the generated document. `projectModel.ts` re-exports them for its callers; the kind
 * declaration uses them for a row, and neither owns a copy.
 */

import type { ProjectRequirement, ProjectTest } from './projectModel.ts';

/** A test passes when its measured value sits on the right side of its own limit. */
export function testPasses(test: ProjectTest): boolean {
  return test.check.direction === 'max'
    ? test.check.value <= test.check.limit
    : test.check.value >= test.check.limit;
}

/** The tests that judge one requirement, in document order. */
export function testsForRequirement(
  tests: readonly ProjectTest[],
  requirementId: string
): ProjectTest[] {
  return tests.filter((test) => test.requirementId === requirementId);
}

/**
 * A requirement is met when every test that judges it passes. No test is no evidence, so a
 * requirement the reader let through without one is not met; the strict read refuses that shape.
 */
export function requirementPasses(
  requirement: ProjectRequirement,
  tests: readonly ProjectTest[]
): boolean {
  const own = testsForRequirement(tests, requirement.id);
  return own.length > 0 && own.every(testPasses);
}
