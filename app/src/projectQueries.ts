/**
 * The questions a project view asks of its objects (`app/src/projectQueries.ts`).
 *
 * The declaration says what a kind is; these functions ask it. Search and the one-object lookup
 * are one generic implementation over `PROJECT_KINDS`, and a requirement's cited parts are read in
 * citation order, so a new kind inherits the queries from its entry.
 *
 * Pure and browser-free: `npm run test:project` pins every answer without a DOM.
 */

import type { ProjectObjectKind } from './projectRef.ts';
import {
  PROJECT_KINDS,
  projectKind,
  type ProjectItem,
  type ProjectKindSpec,
} from './projectKinds.ts';
import {
  collectionOf,
  type EngineeringProject,
  type ProjectComponent,
  type ProjectRequirement,
} from './projectModel.ts';

/** The objects of one kind whose own words match the query; an empty query matches every one. */
export function filterProjectObjects<T extends ProjectItem>(
  kind: ProjectObjectKind,
  project: EngineeringProject,
  query: string,
  kinds: readonly ProjectKindSpec[] = PROJECT_KINDS
): T[] {
  const spec = projectKind(kind, kinds);
  if (!spec) return [];
  return collectionOf<T>(project, spec).filter((item) => spec.match(item, query, project)) as T[];
}

/** The parts a requirement cites, in citation order; generated ids are BOM lines, not row order. */
export function partsForRequirement(
  requirement: ProjectRequirement,
  components: readonly ProjectComponent[]
): ProjectComponent[] {
  return requirement.partIds.flatMap((id) =>
    components.filter((component) => component.id === id)
  );
}

/** The one object of a kind an id names, or null when the id belongs to another kind. */
export function findProjectObject<T extends ProjectItem>(
  project: EngineeringProject,
  kind: ProjectObjectKind,
  id: string | null | undefined,
  kinds: readonly ProjectKindSpec[] = PROJECT_KINDS
): T | null {
  if (!id) return null;
  const spec = projectKind(kind, kinds);
  if (!spec) return null;
  return collectionOf<T>(project, spec).find((item) => item.id === id) ?? null;
}
