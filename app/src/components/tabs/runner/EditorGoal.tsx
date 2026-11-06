import { Target } from 'lucide-react';
import { EditorRequirements } from './EditorRequirements';

/**
 * The lesson's goal, above its first line of code (`runner/EditorGoal.tsx`).
 *
 * Styled as the micro lessons ask a question: a label, a readable prompt, then the pass conditions
 * as answers. The starter still runs unchanged; this card only explains what the file is for.
 */
export function EditorGoalCard({
  goal,
  requirements,
}: {
  goal: string;
  requirements: string[];
}) {
  return (
    <div className="editor-goal-card">
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-accent/30 bg-accent/10 text-accent">
          <Target className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-accent">
          Goal
        </span>
        <span className="rounded-full border border-accent/25 bg-accent/[0.06] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-accent">
          Starter code · runs as-is
        </span>
      </div>
      <p className="mt-2.5 text-[14.5px] font-semibold leading-relaxed text-ink sm:text-[15.5px]">
        {goal}
      </p>
      <EditorRequirements items={requirements} />
      <p className="mt-2 text-[11.5px] text-muted">
        Fill in the TODOs. The checks grade behaviour, not the shape of your code.
      </p>
    </div>
  );
}
