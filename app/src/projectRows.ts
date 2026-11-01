/**
 * The row and browse copy of a project view (`app/src/projectRows.ts`).
 *
 * Project Mode and the register draw the same list; the words and the values a row prints belong to
 * the kind, not to either view. This module is view-only: only the two lazy tabs import it, so the
 * requirement and test copy does not ride first paint beside the workflow canvas.
 *
 * A kind id is data. A kind with no row prints nothing rather than crashing the list, and a test-only
 * kind can supply its own row builder without editing a view.
 */

import type { EngineeringProject, ProjectComponent, ProjectRequirement, ProjectTest } from './projectModel.ts';
import { requirementPasses, testPasses, testsForRequirement } from './projectStatus.ts';
import type { ProjectObjectKind } from './projectRef.ts';

export interface ProjectRow {
  testId: string;
  data: Record<string, string>;
  primary: string;
  secondary: string;
  trailing: string;
  primaryClass: string;
  secondaryClass: string;
  trailingClass: string;
}

interface ProjectBrowse {
  sectionLabel: string;
  findLabel: string;
  placeholder: string;
  noun: string;
  listLabel: string;
  countTestId: string;
  emptyTestId: string;
  groupTestId: string;
  empty(query: string): string;
}

type ProjectRowBuilder = (
  item: unknown,
  index: number,
  project: EngineeringProject
) => ProjectRow;

const MUTED = 'text-[10px] text-faint';
const MONO = 'font-mono';

function componentRow(item: unknown, index: number): ProjectRow {
  const part = item as ProjectComponent;
  return {
    testId: `project-row-${index}`,
    data: { 'data-part-id': part.id },
    primary: part.refDes,
    secondary: `${part.mpn} · ${part.category}`,
    trailing: `${part.qty}×`,
    primaryClass: 'text-[12px] font-semibold text-ink',
    secondaryClass: `${MONO} ${MUTED}`,
    trailingClass: 'font-mono text-[10.5px] text-muted',
  };
}

function requirementRow(
  item: unknown,
  index: number,
  project: EngineeringProject
): ProjectRow {
  const requirement = item as ProjectRequirement;
  const test = testsForRequirement(project.tests, requirement.id)[0];
  return {
    testId: `requirement-row-${index}`,
    data: { 'data-requirement-id': requirement.id },
    primary: `${requirement.ref} · ${requirement.title}`,
    secondary: test ? `${test.ref} · ${test.check.value} ${test.check.unit}` : 'no test',
    trailing: requirementPasses(requirement, project.tests) ? 'met' : 'missed',
    primaryClass: 'text-[12px] text-body',
    secondaryClass: `${MONO} ${MUTED}`,
    trailingClass: 'font-mono text-[10px] text-muted',
  };
}

function testRow(item: unknown, index: number): ProjectRow {
  const test = item as ProjectTest;
  const comparator = test.check.direction === 'max' ? '≤' : '≥';
  return {
    testId: `test-row-${index}`,
    data: { 'data-test-id': test.id },
    primary: `${test.ref} · ${test.title}`,
    secondary: `${test.check.value} ${test.check.unit} ${comparator} ${test.check.limit} ${test.check.unit}`,
    trailing: testPasses(test) ? 'pass' : 'fail',
    primaryClass: 'text-[12px] text-body',
    secondaryClass: `${MONO} ${MUTED}`,
    trailingClass: 'font-mono text-[10px] text-muted',
  };
}

const PROJECT_ROWS: Record<string, ProjectRowBuilder> = {
  component: componentRow,
  requirement: requirementRow,
  test: testRow,
};

export const PROJECT_BROWSE: Record<string, ProjectBrowse> = {
  component: {
    sectionLabel: 'Project parts',
    findLabel: 'Find a part',
    placeholder: 'refDes, part number, category or id',
    noun: 'parts',
    listLabel: 'Project parts',
    countTestId: 'project-count',
    emptyTestId: 'project-empty',
    groupTestId: 'project-group',
    empty: (query) => `No part matches “${query}”.`,
  },
  requirement: {
    sectionLabel: 'Project requirements',
    findLabel: 'Find a requirement',
    placeholder: 'REQ reference, title, kind, part or id',
    noun: 'requirements',
    listLabel: 'Project requirements',
    countTestId: 'requirements-count',
    emptyTestId: 'requirements-empty',
    groupTestId: 'requirements-group',
    empty: (query) => `No requirement matches “${query}”.`,
  },
  test: {
    sectionLabel: 'Project tests',
    findLabel: 'Find a test',
    placeholder: 'TEST reference, method, unit or id',
    noun: 'tests',
    listLabel: 'Project tests',
    countTestId: 'tests-count',
    emptyTestId: 'tests-empty',
    groupTestId: 'tests-group',
    empty: (query) => `No test matches “${query}”.`,
  },
};

export function projectRow(
  kind: ProjectObjectKind,
  item: unknown,
  index: number,
  project: EngineeringProject
): ProjectRow | undefined {
  return PROJECT_ROWS[kind]?.(item, index, project);
}
