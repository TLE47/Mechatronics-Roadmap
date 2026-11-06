/**
 * The lesson a stored micro concept belongs to (`app/src/micro/resetUnits.ts`).
 *
 * Micro progress is stored per concept because that is what the scheduler reviews, but a learner
 * resets by lesson: erasing P.1 should take every concept the P.1 lesson introduced, not one word
 * at a time. The catalogue's concept ids are `<parentLessonId>.<concept>`, and the parent id always
 * has one dot (`P.1`, `P.12`), so the first two segments are the stable unit both the row count and
 * the chooser use.
 */
export function microLessonId(conceptId: string): string {
  const parts = conceptId.split('.');
  return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : conceptId;
}
