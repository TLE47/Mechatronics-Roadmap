import React from 'react';
import { MathView } from './MathView';
import { parseInline } from '../readerMarkdown';
import { markRanges, unlocatedQuotes, type MarkRange } from '../lessonMarks';
import type { Highlight } from '../studyNotes';

/**
 * One line of inline Markdown, for the reader and for the notes it keeps (`components/InlineMarkdown.tsx`).
 *
 * The reader passes the lesson's highlights and a handler, so a saved passage is drawn as a pressable
 * mark that reopens the note where it was written; the Study panel passes none, which is how a review
 * answer draws the same `**bold**`, `*italic*` and `++underline++` a learner typed into the popup.
 * Keeping one renderer is what stops the editor and the card from disagreeing about what a note says.
 *
 * **Marks are found in the paragraph, not in a run.** The old rule cut each run on its own, so a note
 * whose words crossed a bold or a code span matched nothing and simply did not highlight — the note
 * was in Notes, the sentence was on screen, and nothing connected them. Now the paragraph's drawn text
 * is assembled first, `markRanges` finds the passage in it, and each run is cut by the ranges that
 * overlap it: a mark can start in plain text, cross a `battery_level` span, and end after it, and the
 * words on both sides are still drawn with their own formatting.
 *
 * A note whose words are no longer on this text is named once, after the paragraph, rather than
 * silently missing: wording changes under a note and the learner should be told which one moved.
 */
function plainOf(run: ReturnType<typeof parseInline>[number]): string {
  switch (run.k) {
    case 'strong':
    case 'em':
    case 'u':
    case 'link':
      return parseInline(run.v).map(plainOf).join('');
    default:
      return run.v;
  }
}

/** The paragraph's drawn characters, which is what a stored quote was selected from. */
export function inlinePlainText(text: string): string {
  return parseInline(text).map(plainOf).join('');
}

function MarkedRange({
  text,
  ranges,
  offset,
  marks,
  onMark,
}: {
  text: string;
  /** The paragraph's marks, in paragraph offsets. */
  ranges: readonly MarkRange[];
  /** Where this run starts in the paragraph. */
  offset: number;
  marks: Highlight[];
  onMark?: (mark: Highlight, anchor?: HTMLElement) => void;
}) {
  if (!onMark || ranges.length === 0) return <>{text}</>;
  const end = offset + text.length;
  const pieces: { text: string; quote: string | null }[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.end <= offset || range.start >= end) continue;
    const from = Math.max(0, range.start - offset);
    const to = Math.min(text.length, range.end - offset);
    if (to <= cursor) continue;
    if (from > cursor) pieces.push({ text: text.slice(cursor, from), quote: null });
    pieces.push({ text: text.slice(from, to), quote: range.quote });
    cursor = to;
  }
  if (cursor < text.length) pieces.push({ text: text.slice(cursor), quote: null });
  return (
    <>
      {pieces.map((piece, index) => {
        if (!piece.quote) return <React.Fragment key={index}>{piece.text}</React.Fragment>;
        const mark = marks.find((entry) => entry.quote === piece.quote);
        return (
          <button
            key={index}
            type="button"
            data-testid="sticky-mark"
            data-quote={piece.quote}
            title={
              mark?.comment
                ? `Open the note: ${inlineText(mark.comment)}`
                : 'Open this passage in Notes'
            }
            onClick={(event) => {
              event.stopPropagation();
              if (mark && onMark) onMark(mark, event.currentTarget);
            }}
            className="inline cursor-pointer rounded-sm bg-amber/15 px-0.5 text-inherit underline decoration-amber decoration-dotted underline-offset-2 hover:bg-amber/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            {piece.text}
          </button>
        );
      })}
    </>
  );
}

/** `strip` of the note's own Markdown, for the mark's tooltip. */
function inlineText(text: string): string {
  return inlinePlainText(text);
}

/**
 * One paragraph's runs, drawn with the paragraph's marks cut across them.
 *
 * `offset` is where `text` starts inside the paragraph the ranges were measured on, so the recursion
 * into `strong`, `em` and `u` keeps the same coordinate system instead of re-scanning a fragment.
 */
function InlineRuns({
  text,
  ranges,
  offset,
  marks,
  onMark,
}: {
  text: string;
  ranges: readonly MarkRange[];
  offset: number;
  marks: Highlight[];
  onMark?: (mark: Highlight, anchor?: HTMLElement) => void;
}) {
  let cursor = offset;
  return (
    <>
      {parseInline(text).map((run, index) => {
        const start = cursor;
        cursor += plainOf(run).length;
        switch (run.k) {
          case 'code':
            return (
              <code
                key={index}
                className="rounded bg-canvas border border-line-soft px-1 py-0.5 font-mono text-[0.87em] text-ink"
              >
                <MarkedRange
                  text={run.v}
                  ranges={ranges}
                  offset={start}
                  marks={marks}
                  onMark={onMark}
                />
              </code>
            );
          case 'strong':
            return (
              <strong key={index} className="font-bold text-ink">
                <InlineRuns text={run.v} ranges={ranges} offset={start} marks={marks} onMark={onMark} />
              </strong>
            );
          case 'em':
            return (
              <em key={index} className="italic">
                <InlineRuns text={run.v} ranges={ranges} offset={start} marks={marks} onMark={onMark} />
              </em>
            );
          case 'u':
            return (
              <u key={index} className="underline underline-offset-2">
                <InlineRuns text={run.v} ranges={ranges} offset={start} marks={marks} onMark={onMark} />
              </u>
            );
          case 'link':
            return (
              <a
                key={index}
                href={run.href}
                target="_blank"
                rel="noreferrer"
                className="text-accent underline underline-offset-2 hover:text-accent-strong"
              >
                <InlineRuns text={run.v} ranges={ranges} offset={start} marks={[]} />
              </a>
            );
          case 'math':
            return <MathView key={index} math={run.v} />;
          default:
            return (
              <MarkedRange
                key={index}
                text={run.v}
                ranges={ranges}
                offset={start}
                marks={marks}
                onMark={onMark}
              />
            );
        }
      })}
    </>
  );
}

export function InlineMarkdown({
  text,
  marks = [],
  onMark,
}: {
  text: string;
  marks?: Highlight[];
  onMark?: (mark: Highlight, anchor?: HTMLElement) => void;
}) {
  const live = marks.filter((mark) => mark.quote.trim().length > 0);
  if (!onMark || live.length === 0) {
    return <InlineRuns text={text} ranges={[]} offset={0} marks={[]} />;
  }
  const whole = inlinePlainText(text);
  const quotes = live.map((mark) => mark.quote);
  const ranges = markRanges(whole, quotes);
  const missing = unlocatedQuotes(whole, quotes);
  return (
    <>
      <InlineRuns text={text} ranges={ranges} offset={0} marks={live} onMark={onMark} />
      {missing.length > 0 && (
        // The guard: a note anchored to words this paragraph no longer has is named, not dropped.
        <span
          data-testid="sticky-note-unlocated"
          title={`Not on this text any more: ${missing.map((quote) => `“${quote}”`).join(' · ')}`}
          className="ml-1 cursor-help rounded border border-amber/40 bg-amber/10 px-1 font-mono text-[10.5px] text-amber"
        >
          {missing.length} note{missing.length === 1 ? '' : 's'} not on this text
        </span>
      )}
    </>
  );
}
