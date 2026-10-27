import React from 'react';
import { ArrowRight, Highlighter, NotebookPen } from 'lucide-react';
import type { HomeNoteRow } from '../../homeData';

export interface ReviewPanelProps {
  due: number;
  notes: readonly HomeNoteRow[];
  onReview: () => void;
  onOpenLesson: (id: string) => void;
}

/**
 * What is due, and what was written down (`components/home/ReviewPanel.tsx`).
 *
 * The deck itself stays in the runner's Study panel: two review UIs would be two schedules to keep
 * in step, and the cards are answered where a lesson is already on screen. Home's job is to say how
 * many are waiting, prove the notes exist, and be one click from either.
 */
export const ReviewPanel: React.FC<ReviewPanelProps> = ({ due, notes, onReview, onOpenLesson }) => (
  <section data-testid="home-review" className="rounded-xl border border-line bg-panel p-4 space-y-2.5">
    <h2 className="flex items-center gap-1.5 text-sm font-bold text-ink">
      <NotebookPen className="h-4 w-4 text-accent" aria-hidden="true" />
      Review &amp; notes
    </h2>
    <p className="text-sm text-ink" data-testid="home-due">
      {due === 0 ? 'Nothing due right now.' : `${due} card${due === 1 ? '' : 's'} due for review.`}
    </p>
    <button
      onClick={onReview}
      data-testid="btn-home-review"
      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-raise px-3 py-1.5 text-xs font-semibold text-ink cursor-pointer hover:bg-elevate"
    >
      Review now
      <ArrowRight className="h-3 w-3" aria-hidden="true" />
    </button>
    {notes.length === 0 ? (
      <p className="text-[11px] text-muted">
        No notes yet. Highlight a sentence while reading and it will wait here.
      </p>
    ) : (
      <ul className="space-y-1.5 border-t border-line-soft pt-2.5">
        {notes.map((row) => (
          <li key={row.id}>
            <button
              onClick={() => onOpenLesson(row.id)}
              data-testid={`home-note-${row.id}`}
              className="group flex w-full items-start gap-2 text-left cursor-pointer"
            >
              <Highlighter className="mt-0.5 h-3 w-3 shrink-0 text-muted" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block truncate text-[11.5px] font-semibold text-ink group-hover:text-accent">
                  {row.title}
                </span>
                <span className="block text-[11px] leading-snug text-muted">{row.snippet}</span>
                {row.highlights > 0 && (
                  <span className="mt-0.5 block text-[11px] text-faint">
                    {row.highlights} highlight{row.highlights === 1 ? '' : 's'}
                    {row.hasNote ? ' · note' : ''}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    )}
  </section>
);
