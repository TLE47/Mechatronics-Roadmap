/**
 * What a project object kind *is* (`app/src/projectKinds.ts`).
 *
 * One entry per kind says which collection it is read from, how one entry is parsed once the read
 * has claimed its id, what a chip prints for it, how it matches a query and how it groups. The
 * strict read, the picker's data and the pure queries all walk this table; none of them names a
 * kind again.
 *
 * This module is model, not presentation. It imports no React value, no icon and no row class, so
 * the Node generator can read the document without loading a UI library. What a kind looks like
 * (label, plural, glyph, door), what its row and browse box print, and where its badge opens live
 * beside this table in `projectPresentation.ts` (entry-safe) and `projectRows.ts` (lazy views).
 *
 * The read context is a collection map, not three named arrays: a kind's reader asks for the
 * collections read before it by name, and `readProject` fills the map from this declaration. That
 * is what lets a test register a fourth kind and read it through the same path without editing the
 * read's shape.
 */

import type { ProjectObjectKind } from './projectRef.ts';
import type {
  EngineeringProject,
  ProjectComponent,
  ProjectRequirement,
  ProjectTest,
} from './projectModel.ts';
import { testsForRequirement } from './projectStatus.ts';
import { amount, flag, readCheck, text, whole, type ProjectEntry } from './projectRead.ts';
import {
  COMPONENT_KINDS,
  REQUIREMENT_KINDS,
  componentKind,
  type ComponentKind,
  type RequirementKind,
} from './projectVocabulary.ts';

export type ProjectItem = ProjectComponent | ProjectRequirement | ProjectTest;

/** What a reader may ask for: collections already read, in declaration order. */
export interface ProjectReadContext {
  /** The objects of a collection read before this kind; an unknown name is an empty list. */
  read<T>(collection: string): T[];
}

interface ProjectGroup<T> {
  key: string;
  label: string;
  items: T[];
}

export interface ProjectKindSpec<T extends { id: string } = ProjectItem> {
  /** The id a reference stores. It is a string so a new kind is a table entry, not a type edit. */
  kind: ProjectObjectKind;
  /** The document field this kind is read from, and the project field it is read back from. */
  collection: string;
  /** The word an ownership error prints before the id; empty for a component. */
  noun: string;
  objectLabel(item: T): string;
  /** Parse one claimed entry's fields. The read stamps its claimed id; a different id is refused. */
  read(entry: ProjectEntry, index: number, context: ProjectReadContext): Omit<T, 'id'>;
  /** A rule that can only be checked once every collection is read. */
  verify?(project: EngineeringProject): void;
  match(item: T, query: string, project: EngineeringProject): boolean;
  groups(items: readonly T[], project: EngineeringProject): ProjectGroup<T>[];
}

/** A spec's own item type is checked at the entry; the table itself is heterogeneous. */
function defineKind<T extends { id: string }>(spec: ProjectKindSpec<T>): ProjectKindSpec {
  return spec as unknown as ProjectKindSpec;
}

function labelOf(
  vocabulary: readonly { id: string; label: string }[],
  id: string
): string {
  return vocabulary.find((meta) => meta.id === id)?.label ?? id;
}

/** One empty query matches everything: a search that hides the list until a key is pressed has no handle. */
function matchesQuery(needle: string, values: readonly string[]): boolean {
  const query = needle.trim().toLowerCase();
  if (!query) return true;
  return values.some((value) => value.toLowerCase().includes(query));
}

function groupsBy<T>(
  items: readonly T[],
  vocabulary: readonly { id: string; label: string }[],
  key: (item: T) => string
): ProjectGroup<T>[] {
  return vocabulary
    .map((meta) => ({
      key: meta.id,
      label: meta.label,
      items: items.filter((item) => key(item) === meta.id),
    }))
    .filter((group) => group.items.length > 0);
}

function readComponent(entry: ProjectEntry, index: number): Omit<ProjectComponent, 'id'> {
  const where = `components[${index}]`;
  const kind = text(entry.kind, `${where}.kind`) as ComponentKind;
  if (!COMPONENT_KINDS.some((meta) => meta.id === kind)) {
    throw new Error(`project: ${where}.kind is ${kind}, which is not a component kind`);
  }
  return {
    refDes: text(entry.refDes, `${where}.refDes`),
    qty: whole(entry.qty, `${where}.qty`),
    kind,
    category: text(entry.category, `${where}.category`),
    mpn: text(entry.mpn, `${where}.mpn`),
    description: text(entry.description, `${where}.description`),
    rating: text(entry.rating, `${where}.rating`),
    derated: flag(entry.derated, `${where}.derated`),
    unitCostUsd: amount(entry.unitCostUsd, `${where}.unitCostUsd`),
  };
}

function readRequirement(
  entry: ProjectEntry,
  index: number,
  context: ProjectReadContext
): Omit<ProjectRequirement, 'id'> {
  const where = `requirements[${index}]`;
  const ref = text(entry.ref, `${where}.ref`);
  if (!/^REQ-[A-Z0-9]+-\d+$/.test(ref)) {
    throw new Error(`project: requirement ${ref} is not a stable reference like REQ-THERM-01`);
  }
  const kind = text(entry.kind, `${where}.kind`) as RequirementKind;
  if (!REQUIREMENT_KINDS.some((meta) => meta.id === kind)) {
    throw new Error(`project: ${where}.kind is ${kind}, which is not a requirement kind`);
  }
  if (!Array.isArray(entry.partIds) || entry.partIds.length === 0) {
    throw new Error(`project: ${where}.partIds names no part`);
  }
  const components = context.read<ProjectComponent>('components');
  const partIds: string[] = [];
  for (const [at, value] of entry.partIds.entries()) {
    const partId = text(value, `${where}.partIds[${at}]`);
    if (!components.some((component) => component.id === partId)) {
      throw new Error(`project: ${ref} cites part ${partId}, which no component has`);
    }
    if (partIds.includes(partId)) {
      throw new Error(`project: ${ref} cites ${partId} twice`);
    }
    partIds.push(partId);
  }
  return {
    ref,
    kind,
    title: text(entry.title, `${where}.title`),
    statement: text(entry.statement, `${where}.statement`),
    partIds,
  };
}

function readTest(
  entry: ProjectEntry,
  index: number,
  context: ProjectReadContext
): Omit<ProjectTest, 'id'> {
  const where = `tests[${index}]`;
  const ref = text(entry.ref, `${where}.ref`);
  if (!/^TEST-[A-Z0-9]+-\d+$/.test(ref)) {
    throw new Error(`project: test ${ref} is not a stable reference like TEST-THERM-01`);
  }
  const requirementId = text(entry.requirementId, `${where}.requirementId`);
  const requirements = context.read<ProjectRequirement>('requirements');
  if (!requirements.some((requirement) => requirement.id === requirementId)) {
    throw new Error(`project: ${ref} judges ${requirementId}, which no requirement has`);
  }
  return {
    ref,
    title: text(entry.title, `${where}.title`),
    method: text(entry.method, `${where}.method`),
    check: readCheck(entry.check, where),
    requirementId,
  };
}

const component: ProjectKindSpec<ProjectComponent> = {
  kind: 'component',
  collection: 'components',
  noun: '',
  objectLabel: (item) => `${item.refDes} · ${item.mpn}`,
  read: readComponent,
  match: (item, query) =>
    matchesQuery(query, [
      item.id,
      item.refDes,
      item.mpn,
      item.category,
      labelOf(COMPONENT_KINDS, item.kind),
      item.description,
    ]),
  groups: (items) => groupsBy(items, COMPONENT_KINDS, (item) => item.kind),
};

const requirement: ProjectKindSpec<ProjectRequirement> = {
  kind: 'requirement',
  collection: 'requirements',
  noun: 'requirement ',
  objectLabel: (item) => `${item.ref} · ${item.title}`,
  read: readRequirement,
  verify: (project) => {
    for (const item of project.requirements) {
      if (!project.tests.some((test) => test.requirementId === item.id)) {
        throw new Error(`project: ${item.ref} has no test, so nothing judges it`);
      }
    }
  },
  match: (item, query, project) => {
    const parts = item.partIds.flatMap((id) => {
      const part = project.components.find((component) => component.id === id);
      return part ? [part.id, part.refDes, part.mpn] : [];
    });
    const tests = testsForRequirement(project.tests, item.id).flatMap((test) => [
      test.id,
      test.ref,
      test.title,
      test.method,
    ]);
    return matchesQuery(query, [
      item.id,
      item.ref,
      item.title,
      item.statement,
      labelOf(REQUIREMENT_KINDS, item.kind),
      ...item.partIds,
      ...parts,
      ...tests,
    ]);
  },
  groups: (items) => groupsBy(items, REQUIREMENT_KINDS, (item) => item.kind),
};

const test: ProjectKindSpec<ProjectTest> = {
  kind: 'test',
  collection: 'tests',
  noun: 'test ',
  objectLabel: (item) => `${item.ref} · ${item.title}`,
  read: readTest,
  match: (item, query) =>
    matchesQuery(query, [item.id, item.ref, item.title, item.method, item.check.unit]),
  groups: (items, project) =>
    project.requirements
      .filter((item) => items.some((test) => test.requirementId === item.id))
      .map((item) => ({
        key: item.id,
        label: item.ref,
        items: items.filter((test) => test.requirementId === item.id),
      })),
};

export const PROJECT_KINDS: readonly ProjectKindSpec[] = [
  defineKind(component),
  defineKind(requirement),
  defineKind(test),
];

/** The one place a kind id becomes its entry; the table's order is the read order. */
export function projectKind(
  kind: ProjectObjectKind,
  kinds: readonly ProjectKindSpec[] = PROJECT_KINDS
): ProjectKindSpec | undefined {
  return kinds.find((spec) => spec.kind === kind);
}
