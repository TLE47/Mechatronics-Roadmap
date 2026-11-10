import React from 'react';
import { CheckCircle2, NotebookPen, Sparkles, X } from 'lucide-react';
import { PYTHON_LESSONS } from '../data/pythonLessonsData';
import { predictionFor } from '../predictGate';
import { readLessonStudy } from '../studyNotes';

/**
 * Review mode (`components/ReviewModePanel.tsx`).
 *
 * One place to reread what this device has already been through: every lesson the learner verified,
 * in course order, with the guesses they committed and the notes they kept. It is a door back into
 * the lesson, not a second quiz — the spaced-repetition deck keeps its own home in the Study panel.
 */
export const ReviewModePanel: React.FC<{
  open: boolean;
  onClose: () => void;
  verified: Record<string, boolean>;
  onOpen: (lessonId: string) => void;
}> = ({ open, onClose, verified, onOpen }) => {
  const closeRef = React.useRef<HTMLButtonElement | null>(null);
  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    closeRef.current?.focus({ preventScroll: true });
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const learned = PYTHON_LESSONS.filter((lesson) => verified[lesson.id]).map((lesson) => {
    const prediction = predictionFor(lesson.id);
    const study = readLessonStudy(lesson.id);
    return {
      lesson,
      prediction,
      highlights: study?.highlights.length ?? 0,
      hasNote: Boolean(study?.note.trim()),
    };
  });

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-black/60 p-4 pt-[8vh] max-sm:items-end max-sm:p-0"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Review mode"
        data-testid="review-mode"
        className="w-full max-w-2xl overflow-hidden rounded-xl border shadow-2xl max-sm:max-h-[92dvh] max-sm:rounded-b-none"
        style={{ borderColor: 'var(--border-strong)', backgroundColor: 'var(--panel)', color: 'var(--text)' }}
      >
        <div className="flex items-center justify-between gap-2 border-b px-3.5 py-2.5" style={{ borderColor: 'var(--border)' }}>
          <span className="flex items-center gap-2 text-[13px] font-semibold">
            <NotebookPen className="h-4 w-4" style={{ color: 'var(--accent)' }} aria-hidden="true" />
            Review mode · what you have learned
          </span>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            data-testid="btn-review-close"
            aria-label="Close review mode"
            className="rounded border px-2 py-0.5"
            style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
        <div className="max-h-[72vh] overflow-y-auto p-3.5">
          {learned.length === 0 ? (
            <p data-testid="review-empty" className="text-[12.5px]" style={{ color: 'var(--muted)' }}>
              Nothing verified yet. Run a lesson's checks and it will wait here, with the guess you
              committed and the notes you kept.
            </p>
          ) : (
            <>
              <p className="mb-2 font-mono text-[11px]" style={{ color: 'var(--dim)' }}>
                {learned.length} verified lesson{learned.length === 1 ? '' : 's'} on this device
              </p>
              <ul className="space-y-1.5">
                {learned.map(({ lesson, prediction, highlights, hasNote }) => (
                  <li key={lesson.id}>
                    <button
                      type="button"
                      data-testid={`review-lesson-${lesson.id}`}
                      onClick={() => onOpen(lesson.id)}
                      className="flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-left"
                      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--canvas)' }}
                    >
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: 'var(--emerald)' }} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-semibold">{lesson.title}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[10.5px]" style={{ color: 'var(--muted)' }}>
                          <span>{lesson.id}</span>
                          {prediction && (
                            <span className="flex items-center gap-1">
                              <Sparkles className="h-3 w-3" aria-hidden="true" />
                              {prediction.skipped ? 'prediction skipped' : `predicted: ${prediction.verdict}`}
                            </span>
                          )}
                          <span>{hasNote ? 'note saved' : 'no note'}</span>
                          {highlights > 0 && <span>{highlights} highlight{highlights === 1 ? '' : 's'}</span>}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
