import React from 'react';
import { BookOpen } from 'lucide-react';
import { LessonChooser } from '../../LessonChooser';

/**
 * The Study preset's left column (`app/src/components/tabs/runner/LessonChooserRail.tsx`).
 *
 * The chooser is a rail rather than a third column of the work area: the entries stay one click away
 * while the lesson text and the editor share the width it used to take. Its fold is the same
 * remembered choice the tab rail and the lesson list keep (`app/src/fold.ts`).
 *
 * A folded rail is gone, not a strip: the brief above the editor carries the **Show lesson list**
 * button, so the way back sits where the learner is reading instead of in a 48 px column that kept
 * charging the code for width it no longer used.
 */
export function studyGridColumns(folded: boolean): string {
  return folded ? 'lg:grid-cols-[minmax(0,1fr)]' : 'lg:grid-cols-[224px_minmax(0,1fr)]';
}

type ChooserProps = React.ComponentProps<typeof LessonChooser>;

/**
 * The brief's way to the lesson list: one press, and the count says how many entries there are.
 *
 * Study has the rail, so the button toggles it and the folded label is what returns. Read, Write and
 * Debug have no rail column, so the same button opens the lesson sheet the phone uses (`opensSheet`);
 * its label stays "Show lesson list" because nothing about that press hides a list.
 */
export const LessonRailToggle: React.FC<{
  folded: boolean;
  count: number;
  /** This preset has no rail column: the press opens the sheet instead of unfolding one. */
  opensSheet?: boolean;
  onToggle: () => void;
}> = ({ folded, count, opensSheet = false, onToggle }) => (
  <button
    type="button"
    onClick={onToggle}
    data-testid="btn-lessons-toggle"
    aria-expanded={opensSheet ? undefined : !folded}
    aria-controls={opensSheet || folded ? undefined : 'lesson-chooser-rail'}
    aria-haspopup={opensSheet ? 'dialog' : undefined}
    className="mt-1.5 hidden items-center gap-1.5 rounded-lg border border-line bg-canvas px-2.5 py-1 text-[12px] font-semibold text-body transition-colors hover:border-accent/50 hover:text-accent lg:inline-flex"
  >
    <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
    {opensSheet || folded ? 'Show lesson list' : 'Hide lesson list'}
    <span className="font-mono text-[11px] tabular-nums text-faint">{count}</span>
  </button>
);

export const LessonChooserRail: React.FC<{
  chooser: ChooserProps;
  folded: boolean;
  onToggle: () => void;
}> = ({ chooser, folded, onToggle }) => (
  <div
    id="lesson-chooser-rail"
    data-collapsed={folded ? 'true' : 'false'}
    className="hidden lg:block"
  >
    <LessonChooser {...chooser} onCollapse={onToggle} />
  </div>
);
