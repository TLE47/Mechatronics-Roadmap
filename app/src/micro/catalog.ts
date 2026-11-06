/**
 * The micro-learning catalogue (`app/src/micro/catalog.ts`).
 *
 * Each parent lesson authors its own slice (`micro/P.1.json`, `micro/P.2.json`), and the generator
 * concatenates them into one ordered list. The order is deliberate: prerequisites are advisory, but
 * the Learn queue uses it so a learner meets variables before assignment order, and operators before
 * floor division.
 */

import { MICRO_LESSONS } from '../data/microLessons.ts';
import type { MicroConcept, MicroParent, MicroQuestion } from '../data/microLessons.ts';

export const MICRO_CATALOG = MICRO_LESSONS;
export const MICRO_CONCEPTS: MicroConcept[] = MICRO_LESSONS.concepts;
export const MICRO_PARENTS: MicroParent[] = MICRO_LESSONS.parents;

export const MICRO_BY_ID: ReadonlyMap<string, MicroConcept> = new Map(
  MICRO_CONCEPTS.map((concept) => [concept.id, concept])
);

export function conceptById(id: string): MicroConcept | undefined {
  return MICRO_BY_ID.get(id);
}

export function conceptIndex(id: string): number {
  return MICRO_CONCEPTS.findIndex((concept) => concept.id === id);
}

export function conceptsFor(parentLessonId: string): MicroConcept[] {
  return MICRO_CONCEPTS.filter((concept) => concept.parentLessonId === parentLessonId);
}

export function questionById(id: string): MicroQuestion | undefined {
  for (const concept of MICRO_CONCEPTS) {
    const all = [...concept.diagnostics, concept.practice, ...concept.reviewPool, concept.challenge];
    const question = all.find((entry) => entry.id === id);
    if (question) return question;
  }
  return undefined;
}

/** The parent lesson a concept cites, with the path its anchored section lives on. */
export function parentOf(concept: MicroConcept): MicroParent {
  return (
    MICRO_PARENTS.find((parent) => parent.parentLessonId === concept.parentLessonId) ?? MICRO_PARENTS[0]
  );
}

export function parentFor(concept: MicroConcept): string {
  return concept.parentLessonId;
}
