import React, { useEffect, useRef, useState } from 'react';
import { GraduationCap, Highlighter, NotebookPen, Trash2 } from 'lucide-react';
import {
  MAX_HIGHLIGHT_CHARS,
  addHighlight,
  cleanQuote,
  readLessonStudy,
  removeHighlight,
  saveNote,
  setComment,
  type Highlight,
} from '../studyNotes';
import { dueCards, nextDueAt, reviewCard, syncCards, type StudyCard } from '../studyCards';
import { STORE_RESTORED_EVENT } from '../backupBundle';
import {
  currentSitting,
  formatDuration,
  readSittings,
  recordSittingEvent,
  sittingSummary,
} from '../sittingClock';
import { DAY_MS, type Grade } from '../fsrs';

/**
 * The lesson's study panel: what the learner wrote down, and the passages they kept.
 *
 * It sits under the editor because that is where the reading and the writing happen, and it is the
 * same card for both shapes: a note box that saves itself, and a "pin selected text" press that turns
 * whatever is selected on the page into a highlight with an optional comment.
 *
 * Three rules this component keeps:
 *
 * 1. **Nothing is lost by clicking away.** The note is written on a short debounce and again when
 *    the lesson changes, so a tab switch mid-sentence keeps the sentence.
 * 2. **A save belongs to the lesson it was typed in.** The lesson id is captured with the text, and a
 *    write only happens when the text differs from what was loaded, so switching lessons cannot
 *    copy one note onto another.
 * 3. **The selection is read, not trusted.** The text is collapsed and capped before it is stored
 *    (`cleanQuote`), so a highlight spanning half a page is a line of text, not a second note.
 */
interface StudyPanelProps {
  lessonId: string;
}

/** The four answers `fsrs.ts` schedules on, in the order the learner sees them. */
const RATINGS: { grade: Grade; label: string; hint: string }[] = [
  { grade: 1, label: 'Again', hint: 'no idea' },
  { grade: 2, label: 'Hard', hint: 'barely' },
  { grade: 3, label: 'Good', hint: 'recalled' },
  { grade: 4, label: 'Easy', hint: 'obvious' },
];

/** "in 6 days" for a card that came back; the panel says when, never an exact timestamp. */
function waitText(ms: number): string {
  const days = Math.round(ms / DAY_MS);
  if (days <= 0) return 'due now';
  return days === 1 ? 'in 1 day' : `in ${days} days`;
}

/**
 * The clock's line: what today cost, and how long this sitting has run.
 *
 * "This sitting" is measured to the last answer, not to now — a learner who opened the panel and read
 * for ten minutes without answering has not been measured doing anything, and a clock that guessed
 * would be the first number in this app nobody could check.
 */
function sittingText(): string {
  const list = readSittings();
  const open = currentSitting(list);
  const summary = sittingSummary(list);
  // With one sitting on record, "today" *is* "this sitting": saying it twice reads like a stutter.
  if (!open || list.length < 2) return summary;
  return `${summary} · this sitting ${formatDuration(open.end - open.start)}`;
}

export function StudyPanel({ lessonId }: StudyPanelProps) {
  const [note, setNote] = useState('');
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [selection, setSelection] = useState('');
  // The deck is course-wide: a card pinned in one lesson is due on its own schedule, and a learner
  // opening any lesson should be able to clear today's reviews from there.
  const [cards, setCards] = useState<StudyCard[]>([]);
  const [reviewing, setReviewing] = useState<StudyCard | null>(null);
  const [revealed, setRevealed] = useState(false);
  // What the clock says, read on the same beats as the deck: a sitting is written when a card is
  // answered, so the panel's own numbers change exactly when it re-reads.
  const [sitting, setSitting] = useState('');
  // What the store holds right now, and whether the learner has typed since: a write happens for a
  // keystroke, never for a value the component loaded. That distinction is what keeps React's
  // double-mount in development from writing an empty box over a real note - the mount load must not
  // be mistaken for an edit that emptied it.
  const savedRef = useRef('');
  const dirtyRef = useRef(false);
  const [status, setStatus] = useState('');

  const reload = () => {
    const study = readLessonStudy(lessonId);
    setNote(study?.note ?? '');
    setHighlights(study?.highlights ?? []);
    savedRef.current = study?.note ?? '';
    dirtyRef.current = false;
    setCards(syncCards());
    setSitting(sittingText());
  };

  useEffect(() => {
    reload();
    setStatus('');
    // A restore reads the deck behind this panel's back, so the count it is showing would be stale
    // until the next lesson switch: re-read on the event the rest of the app re-reads on.
    const onRestored = () => reload();
    window.addEventListener(STORE_RESTORED_EVENT, onRestored);
    return () => window.removeEventListener(STORE_RESTORED_EVENT, onRestored);
    // `reload` is render-local; the only input it reads is the lesson id in this list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId]);

  // The note saves once the learner pauses rather than on every keystroke.
  useEffect(() => {
    if (!dirtyRef.current) return;
    const timer = window.setTimeout(() => {
      saveNote(lessonId, note);
      savedRef.current = note;
      dirtyRef.current = false;
      setStatus(note.trim() ? 'Note saved' : 'Note cleared');
    }, 500);
    return () => window.clearTimeout(timer);
  }, [lessonId, note]);

  // The debounce above is what a pause gets; this is what leaving gets. The lesson id and the text
  // are captured when the effect is set up, so the cleanup writes the note under the lesson it was
  // typed in - the render that changed the lesson has already happened by then, and using the prop
  // would file one lesson's note under the next one's id.
  const noteRef = useRef(note);
  noteRef.current = note;
  useEffect(() => {
    const owner = lessonId;
    return () => {
      if (!dirtyRef.current) return;
      saveNote(owner, noteRef.current);
      savedRef.current = noteRef.current;
      dirtyRef.current = false;
    };
  }, [lessonId]);

  // A selection is a mouse gesture, so the text is read from the document rather than from a ref to
  // one panel: the learner may select the brief, a hint, or a line of their own code.
  useEffect(() => {
    const update = () => {
      const text = typeof window.getSelection === 'function' ? window.getSelection()?.toString() ?? '' : '';
      setSelection(cleanQuote(text));
    };
    document.addEventListener('selectionchange', update);
    return () => document.removeEventListener('selectionchange', update);
  }, []);

  const pin = () => {
    if (!selection) return;
    addHighlight(lessonId, selection);
    window.getSelection()?.removeAllRanges();
    setSelection('');
    reload();
    setStatus('Highlight saved');
  };

  const comment = (highlight: Highlight, value: string) => {
    if (value === highlight.comment) return;
    // `setComment`, not `addHighlight`: clearing the box is how a card is retired, and the pin path
    // refuses a blank overwrite on purpose.
    setComment(lessonId, highlight.quote, value);
    reload();
    setStatus(value.trim() ? 'Comment saved' : 'Comment cleared');
  };

  const drop = (highlight: Highlight) => {
    removeHighlight(lessonId, highlight.quote);
    reload();
    setStatus('Highlight removed');
  };

  // Opening the deck is the moment the schedule is synced: new cards are added and orphans pruned
  // here rather than on every keystroke in the note box.
  const openReview = () => {
    const list = syncCards();
    setCards(list);
    const first = dueCards(list)[0] ?? null;
    setReviewing(first);
    setRevealed(false);
    if (first) return setStatus('');
    const soonest = nextDueAt(list);
    setStatus(soonest === null ? 'No cards yet: comment on a highlight' : `Nothing due, next ${waitText(soonest - Date.now())}`);
  };

  const rate = (grade: Grade) => {
    if (!reviewing) return;
    // One answer is one review in the sitting: the clock's unit is a card taken, not a page opened.
    recordSittingEvent({ at: Date.now(), kind: 'review', lesson: reviewing.lesson });
    const next = reviewCard(reviewing.id, grade);
    const list = syncCards();
    setCards(list);
    // The next card is the next *due* one that is not this one: rating a card must never show it
    // again in the same sitting, even if its next due date rounds to today.
    const remaining = dueCards(list).filter((card) => card.id !== reviewing.id);
    setReviewing(remaining[0] ?? null);
    setRevealed(false);
    setSitting(sittingText());
    setStatus(next ? `Rated · back ${waitText(next.due - Date.now())}` : 'Rated');
  };

  const dueCount = dueCards(cards).length;
  const soonestDue = nextDueAt(cards);

  return (
    <div data-testid="panel-study" className="bg-panel border border-line rounded-xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-mono text-accent flex items-center gap-1.5">
          <NotebookPen className="w-4 h-4" />
          <span>Study · notes, highlights and review</span>
        </div>
        <span className="text-[10.5px] font-mono text-faint" data-testid="study-status">
          {status || (highlights.length ? `${highlights.length} highlight${highlights.length === 1 ? '' : 's'}` : 'nothing kept yet')}
        </span>
      </div>

      <label htmlFor="study-note" className="mt-2.5 block text-[11px] text-muted">
        What clicked, what is still fuzzy. Saved as you type, on this device only.
      </label>
      <textarea
        id="study-note"
        data-testid="study-note"
        value={note}
        onChange={(event) => {
          setNote(event.target.value);
          dirtyRef.current = true;
        }}
        rows={3}
        placeholder="e.g. The tolerance is on the angle, not the position — that is why 5 mm passed."
        className="mt-1.5 w-full resize-y rounded-lg border px-2.5 py-2 font-mono text-xs outline-none"
        style={{
          borderColor: 'var(--border)',
          backgroundColor: 'var(--canvas)',
          color: 'var(--text)',
        }}
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="btn-pin-selection"
          onClick={pin}
          disabled={!selection}
          title={
            selection
              ? 'Keep the selected text with this lesson'
              : 'Select a passage (or a line of code) first'
          }
          className="btn btn-ghost text-[11px] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Highlighter className="w-3.5 h-3.5" />
          Pin selected text
        </button>
        {selection && (
          <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-faint" data-testid="study-selection">
            “{selection.slice(0, 90)}
            {selection.length > 90 ? '…' : ''}”
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-2.5" data-testid="study-deck">
        <button
          type="button"
          data-testid="btn-review-deck"
          onClick={openReview}
          disabled={cards.length === 0}
          title={
            cards.length === 0
              ? 'Comment on a pinned passage to turn it into a review card'
              : 'Work through the cards due today'
          }
          className="btn btn-ghost text-[11px] disabled:opacity-50 disabled:cursor-not-allowed"
          data-card-count={cards.length}
          data-due-count={dueCount}
        >
          <GraduationCap className="w-3.5 h-3.5" />
          Review {cards.length > 0 ? `(${dueCount} due)` : ''}
        </button>
        <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-faint" data-testid="study-deck-note">
          {cards.length === 0
            ? 'every commented highlight is a card'
            : `${cards.length} card${cards.length === 1 ? '' : 's'} across the course${dueCount === 0 && soonestDue !== null ? ` · next ${waitText(soonestDue - Date.now())}` : ''}`}
        </span>
        {/* The measured half of the study layer: what today cost, and how long this sitting is. */}
        <span
          data-testid="study-sitting"
          title="Measured on this device: a sitting ends after five minutes without a run or an answer, and is capped at three hours."
          className="font-mono text-[10.5px] text-faint"
        >
          {sitting || 'No sittings recorded yet'}
        </span>
      </div>

      {reviewing && (
        <div data-testid="review-card" className="mt-2 rounded-lg border border-line bg-canvas p-2.5">
          <div className="flex items-center justify-between gap-2 font-mono text-[10px] text-faint">
            <span data-testid="review-source" className="min-w-0 truncate">
              {reviewing.lesson}
            </span>
            <span>{reviewing.schedule.reps === 0 ? 'new card' : `seen ${reviewing.schedule.reps}x`}</span>
          </div>
          <p data-testid="review-front" className="mt-1 font-mono text-[11.5px] text-body break-words">
            {reviewing.quote}
          </p>
          {revealed ? (
            <div data-testid="review-answer" className="mt-2 border-t border-line pt-2">
              <p className="text-[11.5px] text-body break-words">{reviewing.comment}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {RATINGS.map((rating) => (
                  <button
                    key={rating.grade}
                    type="button"
                    data-testid={`btn-rate-${rating.grade}`}
                    onClick={() => rate(rating.grade)}
                    title={rating.hint}
                    className="btn btn-ghost text-[11px]"
                  >
                    {rating.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <button
              type="button"
              data-testid="btn-show-answer"
              onClick={() => setRevealed(true)}
              className="btn btn-ghost mt-2 text-[11px]"
            >
              Show answer
            </button>
          )}
        </div>
      )}

      {highlights.length > 0 && (
        <ul className="mt-3 space-y-2">
          {highlights.map((highlight, index) => (
            <li
              key={highlight.quote}
              data-testid={`study-highlight-${index}`}
              className="rounded-lg border border-line bg-canvas px-2.5 py-2"
            >
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 font-mono text-[11px] text-body break-words">
                  {highlight.quote.slice(0, MAX_HIGHLIGHT_CHARS)}
                </p>
                <button
                  type="button"
                  aria-label={`Remove highlight ${index + 1}`}
                  data-testid={`btn-remove-highlight-${index}`}
                  onClick={() => drop(highlight)}
                  className="shrink-0 rounded p-1 text-faint hover:text-rose"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <input
                key={`${highlight.quote}:${highlight.comment}`}
                defaultValue={highlight.comment}
                data-testid={`study-highlight-comment-${index}`}
                aria-label={`Comment on highlight ${index + 1}`}
                placeholder="Why this matters (optional)"
                onBlur={(event) => comment(highlight, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
                }}
                className="mt-1.5 w-full rounded border px-2 py-1 text-[11px] outline-none"
                style={{
                  borderColor: 'var(--border)',
                  backgroundColor: 'var(--panel)',
                  color: 'var(--text)',
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
