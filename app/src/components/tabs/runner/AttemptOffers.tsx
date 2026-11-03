/**
 * Two offers of code that is not the learner's (`runner/AttemptOffers.tsx`).
 *
 * A pair session's attempt and a share link's attempt are the same rule with two doors: offered,
 * never applied. The card says what the button replaces before it replaces it, and when the code
 * belongs to another lesson it names that lesson and offers the switch rather than dropping one
 * lesson's work into another's draft. They were ~95 lines of JSX in the tab, interleaved with the
 * scratch banner and the run history; they are one component now, and the tab hands them the two
 * offers and the three decisions.
 *
 * No state lives here: `pairAttempt` is the pair session's, `sharedAttempt` is the address bar's,
 * and loading either is the tab's (it also clears the run's verdict).
 */
import { attemptLines, lessonLabel } from '../../../pairing';
import type { SharedAttempt } from '../../../shareLink';

interface AttemptOffersProps {
  /** The lesson on screen: an offer for another one is named, not applied. */
  lessonId: string;
  pairAttempt: { lesson: string; code: string } | null;
  sharedAttempt: SharedAttempt | null | undefined;
  onLoadPair: () => void;
  onOpenPairLesson: (lesson: string) => void;
  onDismissPair: () => void;
  onLoadShared: () => void;
  onDismissShared?: () => void;
}

export function AttemptOffers({
  lessonId,
  pairAttempt,
  sharedAttempt,
  onLoadPair,
  onOpenPairLesson,
  onDismissPair,
  onLoadShared,
  onDismissShared,
}: AttemptOffersProps) {
  return (
    <>
      {/* An attempt from a pair session: the same rule as a shared link — offered, never applied.
          When it is for another lesson, the card says which one and offers the switch, so loading
          can never drop a lesson's code into another lesson's draft. */}
      {pairAttempt && (
        <div
          data-testid="pair-attempt-card"
          className="mt-2 rounded-lg border border-accent/50 bg-accent/10 px-3 py-2.5"
        >
          <p className="eyebrow">From your pair session</p>
          {pairAttempt.lesson === lessonId ? (
            <p className="mt-1 text-[12.5px]" style={{ color: 'var(--body)' }}>
              They sent their attempt for this lesson — {attemptLines(pairAttempt.code)} lines.
              Loading it replaces the draft in this editor; your own work is here until you press
              the button.
            </p>
          ) : (
            <p className="mt-1 text-[12.5px]" style={{ color: 'var(--body)' }}>
              They sent {attemptLines(pairAttempt.code)} lines for{' '}
              {lessonLabel(pairAttempt.lesson)}, and this editor is on {lessonId}. Open their lesson
              first — their code will not be dropped into yours.
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {pairAttempt.lesson === lessonId ? (
              <button
                onClick={onLoadPair}
                data-testid="btn-load-pair-attempt"
                className="btn btn-primary px-2.5 py-1.5 text-[12px]"
              >
                Load their code
              </button>
            ) : (
              <button
                onClick={() => onOpenPairLesson(pairAttempt.lesson)}
                data-testid="btn-open-pair-lesson"
                className="btn px-2.5 py-1.5 text-[12px]"
              >
                Open {lessonLabel(pairAttempt.lesson)}
              </button>
            )}
            <button
              onClick={onDismissPair}
              data-testid="btn-dismiss-pair-attempt"
              className="btn px-2.5 py-1.5 text-[12px]"
            >
              Keep mine
            </button>
          </div>
        </div>
      )}

      {/* A shared attempt is offered, never applied. The learner's own draft is the work; the card
          says what the button replaces before it replaces it. */}
      {sharedAttempt && sharedAttempt.lesson === lessonId && (
        <div
          data-testid="shared-attempt-card"
          className="mt-2 rounded-lg border border-accent/50 bg-accent/10 px-3 py-2.5"
        >
          <p className="eyebrow">Shared attempt</p>
          <p className="mt-1 text-[12.5px]" style={{ color: 'var(--body)' }}>
            Someone sent you their code for this lesson — {sharedAttempt.code.split('\n').length}{' '}
            lines. Loading it replaces the draft in this editor; your own work is here until you
            press the button.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              onClick={onLoadShared}
              data-testid="btn-load-shared-attempt"
              className="btn btn-primary px-2.5 py-1.5 text-[12px]"
            >
              Load their code
            </button>
            <button
              onClick={() => onDismissShared?.()}
              data-testid="btn-keep-own-code"
              className="btn px-2.5 py-1.5 text-[12px]"
            >
              Keep mine
            </button>
          </div>
        </div>
      )}
    </>
  );
}
