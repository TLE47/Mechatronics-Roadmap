import React from 'react';
import { BookOpen } from 'lucide-react';
import { LessonChooser } from '../../LessonChooser';

/**
 * The Study preset's left column (`app/src/components/tabs/runner/LessonChooserRail.tsx`).
 *
 * The chooser is a rail rather than a third column of the work area: the entries stay one click away
 * while the lesson text and the editor share the width it used to take. Its fold is the same
 * remembered choice the tab rail and the lesson list keep (`app/src/fold.ts`), and a folded rail is a
 * strip rather than nothing: the count still says how many lessons are behind it, and the strip is
 * the way back. Read, Write and Debug hide the rail entirely, because each of them is about one panel.
 */
export function studyGridColumns(folded: boolean): string {
  return folded ? 'lg:grid-cols-[48px_minmax(0,1fr)]' : 'lg:grid-cols-[224px_minmax(0,1fr)]';
}

type ChooserProps = React.ComponentProps<typeof LessonChooser>;

export const LessonChooserRail: React.FC<{
  chooser: ChooserProps;
  folded: boolean;
  onToggle: () => void;
  count: number;
}> = ({ chooser, folded, onToggle, count }) => (
  <div
    id="lesson-chooser-rail"
    data-collapsed={folded ? 'true' : 'false'}
    className="hidden lg:block"
  >
    {folded ? (
      // The strip is the way back, in the same column the card was: folded is not hidden, and the
      // count keeps saying how many entries are behind the press.
      <button
        type="button"
        onClick={onToggle}
        data-testid="btn-lessons-unfold"
        aria-expanded={false}
        aria-controls="lesson-chooser-rail"
        aria-label="Show the lesson list"
        title="Show the lesson list: every lesson, its filters and its search come back"
        className="flex w-full cursor-pointer flex-col items-center gap-1 rounded-xl border border-line bg-panel py-2 text-muted transition-colors hover:border-line-strong hover:text-ink"
      >
        <BookOpen className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="[writing-mode:vertical-rl] font-mono text-[10px] uppercase tracking-[0.14em]">
          Lessons
        </span>
        <span className="font-mono text-[10px] tabular-nums text-faint">{count}</span>
      </button>
    ) : (
      <LessonChooser {...chooser} onCollapse={onToggle} />
    )}
  </div>
);
