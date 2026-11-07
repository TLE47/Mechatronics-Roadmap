/**
 * Which half of a lesson page a reader shows (`app/src/readerScope.ts`).
 *
 * Study and Read are complementary, not a narrow and a wide copy of the same page:
 *
 *  - **Study** starts at `## Learn` and stops before `## Do it yourself`. The Goal,
 *    prerequisites and requirements belong to the workbench; the page beside the editor is the
 *    explanation the learner is working from.
 *  - **Read** keeps the rest of the page — Goal, Prerequisites, the exercise, the recap — but drops
 *    the whole `## Learn` section, which Study already carries.
 *
 * A page without a `## Learn` heading is left whole in Read, and stopped before its exercise in
 * Study if it has one. A missing heading is a page shape this build should tolerate, never a reason
 * to paint an empty pane.
 */
import type { ReaderBlock } from './lessonPage';

export type ReaderScope = 'full' | 'study';

export function blocksForScope(
  blocks: ReaderBlock[],
  scope: ReaderScope
): ReaderBlock[] {
  const learn = blocks.findIndex(
    (block) => block.t === 'h' && block.l === 2 && /^learn\b/i.test(block.x)
  );
  const exercise = blocks.findIndex(
    (block) => block.t === 'h' && block.l === 2 && /^do it yourself\b/i.test(block.x)
  );

  if (scope === 'study') {
    const from = learn === -1 ? 0 : learn;
    return blocks.slice(from, exercise > from ? exercise : blocks.length);
  }

  if (learn === -1) return blocks;
  return [
    ...blocks.slice(0, learn),
    ...blocks.slice(exercise > learn ? exercise : blocks.length),
  ];
}