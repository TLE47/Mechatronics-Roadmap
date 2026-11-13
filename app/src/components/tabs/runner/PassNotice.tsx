import React from 'react';
import { showCard } from '../../../toastPolicy';
import { Check } from 'lucide-react';

/**
 * The card a verified run earns (`runner/PassNotice.tsx`).
 *
 * The words are this app's — the lesson, both halves of the verdict, the door to the next lesson —
 * and the toast around them is sonner's: the stack, the live region, the six-second hold and the
 * dismissal are the library's rules. It lives here rather than in the tab because the tab has a
 * line budget and this is a view, not part of the run.
 */
export interface PassNoticeInput {
  /** The lesson that just passed. */
  lessonId: string;
  /** The lesson after it, when there is one. */
  nextId: string | null;
  /** Opens that lesson on the workbench. */
  onNext: (() => void) | null;
}

export function showPassNotice({ lessonId, nextId, onNext }: PassNoticeInput): void {
  showCard('pass', () => (
      <div
        data-testid="pass-toast"
        className="pointer-events-auto flex items-center gap-3 rounded-[var(--r-full)] border py-2 pl-2.5 pr-2 shadow-[var(--shadow-lg)]"
        style={{
          borderColor: 'color-mix(in srgb, var(--emerald) 45%, transparent)',
          backgroundColor: 'var(--panel-2)',
        }}
      >
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
          style={{ backgroundColor: 'var(--emerald)', color: 'var(--inverse)' }}
          aria-hidden="true"
        >
          <Check className="h-4 w-4" strokeWidth={3} />
        </span>
        <div className="pr-1">
          <p className="text-[12.5px] font-semibold" style={{ color: 'var(--text)' }}>
            Lesson {lessonId} passed
          </p>
          <p className="text-[12px]" style={{ color: 'var(--dim)' }}>
            Behavioural checks and output both green
          </p>
        </div>
        {nextId && onNext && (
          <button onClick={onNext} className="btn btn-primary px-3 py-1.5 text-[13px]">
            Next lesson →
          </button>
        )}
      </div>
    ));
}
