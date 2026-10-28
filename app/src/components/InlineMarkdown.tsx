import React from 'react';
import { MathView } from './MathView';
import { inlinePlain, parseInline } from '../readerMarkdown';
import { markQuotes } from '../lessonMarks';
import type { Highlight } from '../studyNotes';

/**
 * One line of inline Markdown, for the reader and for the notes it keeps (`components/InlineMarkdown.tsx`).
 *
 * The reader passes the lesson's highlights and a handler, so a saved passage is drawn as a pressable
 * mark that reopens the note where it was written; the Study panel passes none, which is how a review
 * answer draws the same `**bold**`, `*italic*` and `++underline++` a learner typed into the popup.
 * Keeping one renderer is what stops the editor and the card from disagreeing about what a note says.
 *
 * A quote that spans two inline runs (half a sentence in bold, say) is not marked: the note is still
 * in Notes, and a mark on the wrong words would be worse than no mark at all.
 */
export function InlineMarkdown({
  text,
  marks = [],
  onMark,
}: {
  text: string;
  marks?: Highlight[];
  onMark?: (mark: Highlight) => void;
}) {
  const quotes = onMark ? marks.map((mark) => mark.quote) : [];
  return (
    <>
      {parseInline(text).map((run, index) => {
        switch (run.k) {
          case 'code':
            return (
              <code
                key={index}
                className="rounded bg-canvas border border-line-soft px-1 py-0.5 font-mono text-[0.87em] text-ink"
              >
                {run.v}
              </code>
            );
          case 'strong':
            return (
              <strong key={index} className="font-bold text-ink">
                <InlineMarkdown text={run.v} marks={marks} onMark={onMark} />
              </strong>
            );
          case 'em':
            return (
              <em key={index} className="italic">
                <InlineMarkdown text={run.v} marks={marks} onMark={onMark} />
              </em>
            );
          case 'u':
            return (
              <u key={index} className="underline underline-offset-2">
                <InlineMarkdown text={run.v} marks={marks} onMark={onMark} />
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
                <InlineMarkdown text={run.v} />
              </a>
            );
          case 'math':
            return <MathView key={index} math={run.v} />;
          default: {
            const pieces = quotes.length > 0 ? markQuotes(run.v, quotes) : [{ text: run.v, quote: null }];
            return (
              <React.Fragment key={index}>
                {pieces.map((piece, pieceIndex) => {
                  if (!piece.quote) {
                    return <React.Fragment key={pieceIndex}>{piece.text}</React.Fragment>;
                  }
                  const mark = marks.find((entry) => entry.quote === piece.quote);
                  return (
                    <button
                      key={pieceIndex}
                      type="button"
                      data-testid="sticky-mark"
                      data-quote={piece.quote}
                      title={
                        mark?.comment
                          ? `Open the note: ${inlinePlain(mark.comment)}`
                          : 'Open this passage in Notes'
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                        if (mark && onMark) onMark(mark);
                      }}
                      className="inline cursor-pointer rounded-sm bg-amber/15 px-0.5 text-inherit underline decoration-amber decoration-dotted underline-offset-2 hover:bg-amber/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      {piece.text}
                    </button>
                  );
                })}
              </React.Fragment>
            );
          }
        }
      })}
    </>
  );
}
