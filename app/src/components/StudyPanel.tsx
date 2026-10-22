import React, { useEffect, useRef, useState } from 'react';
import { Highlighter, NotebookPen, Trash2 } from 'lucide-react';
import {
  MAX_HIGHLIGHT_CHARS,
  addHighlight,
  cleanQuote,
  readLessonStudy,
  removeHighlight,
  saveNote,
  type Highlight,
} from '../studyNotes';

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

export function StudyPanel({ lessonId }: StudyPanelProps) {
  const [note, setNote] = useState('');
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [selection, setSelection] = useState('');
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
  };

  useEffect(() => {
    reload();
    setStatus('');
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
    addHighlight(lessonId, highlight.quote, value);
    reload();
    setStatus(value.trim() ? 'Comment saved' : 'Comment cleared');
  };

  const drop = (highlight: Highlight) => {
    removeHighlight(lessonId, highlight.quote);
    reload();
    setStatus('Highlight removed');
  };

  return (
    <div data-testid="panel-study" className="bg-panel border border-line rounded-xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-mono text-accent flex items-center gap-1.5">
          <NotebookPen className="w-4 h-4" />
          <span>Study · this lesson's notes</span>
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
