/**
 * Optional "Go deeper" resources (`app/src/micro/resources.ts`).
 *
 * Essential resources are already cited by the parent page; these cards never gate completion and
 * never invent a citation. Empty is a valid answer.
 */

import type { MicroConcept, MicroResource } from '../data/microLessons.ts';

export function resourcesFor(concept: MicroConcept): MicroResource[] {
  return [...concept.resources].sort((a, b) => {
    if (a.role === b.role) return a.title.localeCompare(b.title);
    return a.role === 'primary' ? -1 : 1;
  });
}

export function optionalResources(concept: MicroConcept): MicroResource[] {
  return resourcesFor(concept).filter((resource) => resource.role === 'optional');
}
