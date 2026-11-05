/**
 * The micro-learning catalogue (`app/src/micro/catalog.ts`).
 *
 * P.1 is the only lesson in this release. The catalogue is intentionally ordered: prerequisites are
 * advisory, but the Learn queue uses this order so a learner always sees variables before assignment
 * order and before mixed types.
 */

import { MICRO_LESSONS } from '../data/microLessons.ts';
import type { MicroConcept, MicroQuestion } from '../data/microLessons.ts';

export const MICRO_CATALOG = MICRO_LESSONS;
export const MICRO_CONCEPTS: MicroConcept[] = MICRO_LESSONS.concepts;

export const MICRO_BY_ID: ReadonlyMap<string, MicroConcept> = new Map(
  MICRO_CONCEPTS.map((concept) => [concept.id, concept])
);

export function conceptById(id: string): MicroConcept | undefined {
  return MICRO_BY_ID.get(id);
}

export function conceptIndex(id: string): number {
  return MICRO_CONCEPTS.findIndex((concept) => concept.id === id);
}

export function questionById(id: string): MicroQuestion | undefined {
  for (const concept of MICRO_CONCEPTS) {
    const all = [...concept.diagnostics, concept.practice, ...concept.reviewPool, concept.challenge];
    const question = all.find((entry) => entry.id === id);
    if (question) return question;
  }
  return undefined;
}

/** The parent lesson a concept is allowed to cite. P.1 is the only micro parent today. */
export function parentFor(concept: MicroConcept): string {
  return concept.parentLessonId;
}
