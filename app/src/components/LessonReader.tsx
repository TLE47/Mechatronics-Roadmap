import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, Highlighter, Loader2, RotateCcw, StickyNote, X } from 'lucide-react';
import { MathView } from './MathView';
import { Diagram } from '../visuals/Diagram';
import { sceneFor } from '../visuals/scenes';
import {
  loadLessonPage,
  type LessonPage,
  type ReaderBlock,
} from '../lessonPage';
import { headingAnchors, parseInline } from '../readerMarkdown';
import {
  clearReadingPosition,
  readReadingPosition,
  writeReadingPosition,
  type ReadingPosition,
} from '../readingPosition';
import { addHighlight, cleanQuote } from '../studyNotes';
import { lessonPageUrl as sourceUrl } from '../startHere';

/**
 * The lesson text, beside the code it is about (`app/src/components/LessonReader.tsx`).
 *
 * The pane answers three questions the GitHub page could not answer from inside the workbench: what
 * does this lesson say, where was I when I left, and which passage did I want to keep. So the
 * payload is fetched per lesson, the heading at the top of the pane is remembered per lesson, and a
 * selection can be pinned to the notes without leaving the screen that made it.
 *
 * A page can also carry a **figure**: a line `<!-- figure: id | caption -->` in its Markdown becomes
 * a `figure` block, and the picture is drawn from the app's own scene library (`visuals/scenes.ts`).
 * That is the answer to a wall of paragraphs — the chain, the loop or the timing a section describes,
 * drawn above it — and it costs the payload a dozen bytes instead of an image. An id this build does
 * not know is stated in the pane, because a diagram that silently vanishes reads as a page that never
 * had one.
 *
 * The other picture is the page's own: a single-chain Mermaid `flowchart` becomes a `route` block, so
 * the "where this lesson goes" map every module already writes is drawn as numbered steps instead of
 * being dropped, and a flowchart that branches becomes a `graph` block with the same nodes and
 * arrows. Redrawing a graph as a list would be a different diagram; drawing it as a graph is not.
 *
 * It is deliberately *read-only*. The full solution is not in the payload
 * (`scripts/generate_lesson_pages.py` skips it), the code in the editor is the code that runs, and
 * the one link out is the source page, kept for copying, printing and filing an issue.
 */
/** What a route block says when the page gives no caption of its own. */
const ROUTE_CAPTION = 'Each box is a checkpoint in order; the last one is the verified pass this page ends on.';

interface LessonReaderProps {
  /** The registry id: the reading position and highlights are keyed by it, not by the page. */
  lessonId: string;
  /** The Markdown page the payload was generated from; '' when the entry has no page. */
  path: string;
  /** Read layout: the pane is the page, so it gets the window's height instead of a card's. */
  tall?: boolean;
  /** Controls the runner draws in the header, after Top. */
  toolbar?: React.ReactNode;
  /** The lesson chooser, when the runner has it open; between the header and the text. */
  panel?: React.ReactNode;
}

/** How long a scroll must be still before the position is written: one write per pause, not per pixel. */
const SAVE_AFTER_MS = 350;

function Inline({ text }: { text: string }) {
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
                <Inline text={run.v} />
              </strong>
            );
          case 'em':
            return (
              <em key={index} className="italic">
                <Inline text={run.v} />
              </em>
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
                <Inline text={run.v} />
              </a>
            );
          case 'math':
            return <MathView key={index} math={run.v} />;
          default:
            return <React.Fragment key={index}>{run.v}</React.Fragment>;
        }
      })}
    </>
  );
}

/** The page's absolute URL, for the source link a heading or a figure points back to. */
function repoUrl(path: string): string {
  return `https://github.com/TLE47/Mechatronics-Roadmap/blob/main/${path}`;
}

function CodeBlock({ block }: { block: Extract<ReaderBlock, { t: 'code' }> }) {
  return (
    <div className="my-3 overflow-hidden rounded-lg border border-line-soft bg-canvas">
      <div className="border-b border-line-soft px-3 py-1 font-mono text-[12px] uppercase tracking-wider text-faint">
        {block.lang || 'text'}
      </div>
      {/* `tabIndex` because a long line scrolls this element and a keyboard has no other way to reach
          that scroll: axe's `scrollable-region-focusable`, which only sees the pane once it is styled. */}
      <pre
        tabIndex={0}
        aria-label={`${block.lang || 'text'} code`}
        className="overflow-x-auto p-3 font-mono text-[12.5px] leading-relaxed text-body"
      >
        <code>{block.text}</code>
      </pre>
    </div>
  );
}

function TableBlock({ block }: { block: Extract<ReaderBlock, { t: 'table' }> }) {
  return (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-[13px] leading-snug">
        <thead>
          <tr>
            {block.head.map((cell, index) => (
              <th
                key={index}
                scope="col"
                className="border border-line-soft bg-canvas px-2 py-1.5 text-left font-mono text-[13px] text-ink"
              >
                <Inline text={cell} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="border border-line-soft px-2 py-1.5 align-top text-body">
                  <Inline text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LessonReader({ lessonId, path, tall = false, toolbar, panel }: LessonReaderProps) {
  const [page, setPage] = useState<LessonPage | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [selection, setSelection] = useState('');
  const [status, setStatus] = useState('');
  /** The sticky-note popup: what the learner is writing about the passage they selected. */
  const [stickyOpen, setStickyOpen] = useState(false);
  const [stickyText, setStickyText] = useState('');
  /**
   * The passage itself, taken when the popup opens.
   *
   * The live `selection` cannot be the quote: clicking the button (or the textarea) collapses the
   * document selection, and `saveSticky` would then be asked to pin an empty string. Capturing it at
   * the moment the learner asked for the note is also what the popup shows back to them.
   */
  const [stickyQuote, setStickyQuote] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastSaveRef = useRef(0);
  const pendingRef = useRef<ReadingPosition | null>(null);
  const anchors = useMemo(() => (page ? headingAnchors(page.blocks) : []), [page]);

  useEffect(() => {
    let cancelled = false;
    setPage(null);
    setError('');
    setStatus('');
    setSelection('');
    setStickyOpen(false);
    setStickyText('');
    setStickyQuote('');
    if (!path) {
      setError('This entry has no reading page of its own.');
      return;
    }
    loadLessonPage(path)
      .then((loaded) => {
        if (!cancelled) setPage(loaded);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : 'the lesson text could not be loaded');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [path, attempt]);

  // Restore where this lesson was left. The anchor is tried first: a page regenerated after the
  // sentence changed still has its headings, and a raw offset would land in a paragraph that moved.
  // The distance read *into* that heading is added back on top (`anchorAt`), so a learner who stopped
  // mid-section returns mid-section rather than at its first line.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !page) return;
    const saved = readReadingPosition(lessonId);
    if (!saved || saved.at <= 0) {
      container.scrollTop = 0;
      return;
    }
    const frame = requestAnimationFrame(() => {
      const target = saved.anchor
        ? container.querySelector<HTMLElement>(`[data-reader-anchor="${saved.anchor}"]`)
        : null;
      const furthest = Math.max(0, container.scrollHeight - container.clientHeight);
      if (target) {
        const top = target.getBoundingClientRect().top - container.getBoundingClientRect().top;
        const into = typeof saved.anchorAt === 'number' ? Math.max(0, saved.at - saved.anchorAt) : 0;
        container.scrollTop = Math.min(furthest, Math.max(0, container.scrollTop + top - 8 + into));
      } else {
        container.scrollTop = Math.min(furthest, saved.at);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [page, lessonId]);

  // The last position is flushed when the pane goes away: switching lessons mid-page must not lose
  // the place the learner was reading, and `scroll` may not fire again before unmount.
  useEffect(() => {
    return () => {
      const pending = pendingRef.current;
      if (pending) writeReadingPosition(lessonId, pending);
    };
  }, [lessonId]);

  useEffect(() => {
    const read = () => {
      const container = scrollRef.current;
      const chosen = typeof window.getSelection === 'function' ? window.getSelection() : null;
      const text = chosen?.toString() ?? '';
      if (
        !container ||
        !chosen ||
        chosen.rangeCount === 0 ||
        !text ||
        !chosen.anchorNode ||
        !container.contains(chosen.anchorNode) ||
        (chosen.focusNode && !container.contains(chosen.focusNode))
      ) {
        setSelection('');
        return;
      }
      setSelection(cleanQuote(text));
    };
    document.addEventListener('selectionchange', read);
    return () => document.removeEventListener('selectionchange', read);
  }, [page]);

  const remember = () => {
    const container = scrollRef.current;
    if (!container || !page) return;
    let anchor = '';
    let anchorAt: number | undefined;
    const top = container.scrollTop + 8;
    for (const heading of container.querySelectorAll<HTMLElement>('[data-reader-anchor]')) {
      if (heading.offsetTop <= top) {
        anchor = heading.dataset.readerAnchor ?? '';
        anchorAt = heading.offsetTop;
      } else break;
    }
    const position: ReadingPosition = { anchor, at: container.scrollTop };
    if (typeof anchorAt === 'number') position.anchorAt = anchorAt;
    pendingRef.current = position;
    const now = Date.now();
    if (now - lastSaveRef.current < SAVE_AFTER_MS) return;
    lastSaveRef.current = now;
    writeReadingPosition(lessonId, position);
  };

  const pinSelection = () => {
    if (!selection) return;
    const saved = addHighlight(lessonId, selection);
    if (!saved) {
      setStatus('Not saved — storage is blocked or full.');
      return;
    }
    window.getSelection()?.removeAllRanges();
    setSelection('');
    setStatus('Highlight pinned to Notes.');
  };

  /**
   * A sticky note: the same pinned passage as a highlight, with the learner's thought attached.
   *
   * The word matters. A highlight is for a passage worth finding again; a sticky is for the sentence
   * that needs one — "this is the gain I keep forgetting", "recompute with the new dt". The comment
   * is also what makes the passage a review card (`studyCards.ts`), so the thought comes back on the
   * day it is due instead of staying on the page it was written on.
   */
  const saveSticky = () => {
    if (!stickyQuote) return;
    const saved = addHighlight(lessonId, stickyQuote, stickyText);
    if (!saved) {
      setStatus('Not saved — storage is blocked or full.');
      return;
    }
    window.getSelection()?.removeAllRanges();
    setSelection('');
    setStickyOpen(false);
    setStickyText('');
    setStickyQuote('');
    setStatus(stickyText.trim() ? 'Sticky note saved to Notes.' : 'Passage pinned to Notes.');
  };

  const scrollToTop = () => {
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTop = 0;
    pendingRef.current = { anchor: '', at: 0 };
    clearReadingPosition(lessonId);
  };

  return (
    <section
      data-testid="lesson-reader"
      data-reader-path={path}
      // `min-w-0` is what keeps a long code line inside the pane's own scroller: as a flex child
      // the default `min-width: auto` lets its widest `<pre>` widen the whole work area instead.
      className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-panel"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft bg-canvas px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <BookOpen className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
          <span className="eyebrow">Lesson text</span>
          <span className="truncate font-mono text-[12px] text-faint" title={path}>
            {path || 'no page'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {selection && (
            <button
              type="button"
              onClick={() => {
                setStickyText('');
                setStickyQuote(selection);
                setStickyOpen(true);
              }}
              data-testid="btn-sticky"
              title="Write a note on the selected passage — it comes back as a review card"
              className="flex items-center gap-1 rounded border border-amber/50 bg-amber/10 px-2 py-1 text-[13px] font-mono text-amber hover:bg-amber/20 cursor-pointer"
            >
              <StickyNote className="h-3 w-3" /> Sticky
            </button>
          )}
          {selection && (
            <button
              type="button"
              onClick={pinSelection}
              data-testid="btn-highlight"
              title={`Pin “${selection.length > 60 ? `${selection.slice(0, 57)}…` : selection}” to this lesson's notes`}
              className="flex items-center gap-1 rounded border border-accent/50 bg-accent/10 px-2 py-1 text-[13px] font-mono text-accent hover:bg-accent/20 cursor-pointer"
            >
              <Highlighter className="h-3 w-3" /> Highlight
            </button>
          )}
          <button
            type="button"
            onClick={scrollToTop}
            data-testid="btn-reader-top"
            title="Back to the top of the lesson text"
            className="flex items-center gap-1 rounded border border-line-soft bg-canvas px-2 py-1 text-[13px] font-mono text-muted hover:text-ink cursor-pointer"
          >
            <RotateCcw className="h-3 w-3" /> Top
          </button>
          {toolbar}
        </div>
      </div>

      {panel}

      {status && (
        <p
          role="status"
          data-testid="reader-status"
          className="border-b border-line-soft bg-panel px-3 py-1.5 text-[12px] text-body"
        >
          {status}
        </p>
      )}

      <div
        ref={scrollRef}
        onScroll={remember}
        data-testid="reader-scroll"
        className={`relative min-w-0 overflow-y-auto px-4 py-4 sm:px-6 ${
          tall ? 'max-h-[calc(100vh-11rem)]' : 'max-h-[760px]'
        }`}
      >
        {!page && !error && (
          <p className="flex items-center gap-2 text-[13px] text-muted" data-testid="reader-loading">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading the lesson text…
          </p>
        )}

        {error && (
          <div data-testid="reader-error" className="space-y-2 text-[13px] text-body">
            <p className="font-mono text-[12px] text-amber">Lesson text unavailable</p>
            <p>{error}</p>
            <p>
              The page itself is still on GitHub —{' '}
              <a
                href={repoUrl(path || 'README.md')}
                target="_blank"
                rel="noreferrer"
                className="text-accent underline underline-offset-2"
              >
                open the source ↗
              </a>
            </p>
            {path && (
              <button
                type="button"
                onClick={() => setAttempt((count) => count + 1)}
                data-testid="btn-reader-retry"
                className="btn px-2.5 py-1 text-[13px]"
              >
                Try again
              </button>
            )}
          </div>
        )}

        {page && (
          <article
            data-testid="reader-prose"
            className={tall ? 'mx-auto max-w-[68ch] space-y-3' : 'space-y-3'}
          >
            {page.blocks.map((block, index) => {
              switch (block.t) {
                case 'h': {
                  const anchor = anchors[index] ?? '';
                  const Tag = (block.l === 2 ? 'h2' : block.l === 3 ? 'h3' : 'h4') as
                    | 'h2'
                    | 'h3'
                    | 'h4';
                  return (
                    <Tag
                      key={index}
                      id={anchor}
                      data-reader-anchor={anchor}
                      className={`scroll-mt-3 font-bold text-ink ${
                        block.l === 2 ? 'mt-5 text-[22px]' : 'mt-4 text-[18px]'
                      }`}
                    >
                      <Inline text={block.x} />
                    </Tag>
                  );
                }
                case 'p':
                  return (
                    <p key={index} className="text-[17px] leading-[1.7] text-body">
                      <Inline text={block.x} />
                    </p>
                  );
                case 'ul':
                case 'ol': {
                  const List = block.t === 'ul' ? 'ul' : 'ol';
                  return (
                    <List
                      key={index}
                      className={`space-y-1 text-[17px] leading-[1.65] text-body ${
                        block.t === 'ul' ? 'list-disc' : 'list-decimal'
                      } pl-5`}
                    >
                      {block.items.map((item, itemIndex) => (
                        <li
                          key={itemIndex}
                          style={{ marginLeft: `${item.d * 16}px` }}
                          className={item.d > 0 ? 'list-[circle]' : undefined}
                        >
                          <Inline text={item.x} />
                        </li>
                      ))}
                    </List>
                  );
                }
                case 'code':
                  return <CodeBlock key={index} block={block} />;
                case 'table':
                  return <TableBlock key={index} block={block} />;
                case 'quote':
                  return (
                    <blockquote
                      key={index}
                      className="my-3 rounded-r-lg border-l-2 border-amber/70 bg-amber/5 py-2 pl-3 pr-2 text-[15.5px] leading-relaxed text-body"
                    >
                      <Inline text={block.x} />
                    </blockquote>
                  );
                case 'math':
                  return (
                    <div key={index} className="my-3 overflow-x-auto">
                      <MathView math={block.tex} block />
                    </div>
                  );
                case 'figure': {
                  const spec = sceneFor(block.id);
                  if (!spec) {
                    return (
                      <p
                        key={index}
                        data-testid="reader-figure-missing"
                        className="my-3 rounded-lg border border-amber/40 bg-amber/5 px-3 py-2 text-[13px] text-body"
                      >
                        This build has no figure called <code className="font-mono text-ink">{block.id}</code>.
                        The page asks for one; the picture is missing rather than the paragraph that explains it.
                      </p>
                    );
                  }
                  return (
                    <Diagram
                      key={index}
                      id={block.id}
                      live
                      spec={block.caption ? { ...spec, caption: block.caption } : spec}
                    />
                  );
                }
                case 'route':
                  return (
                    <Diagram
                      key={index}
                      id="route"
                      live
                      spec={{
                        kind: 'route',
                        title: 'Where this lesson goes',
                        caption: block.caption ?? ROUTE_CAPTION,
                        steps: block.steps,
                      }}
                    />
                  );
                case 'graph':
                  return (
                    <Diagram
                      key={index}
                      id="graph"
                      live
                      spec={{
                        kind: 'graph',
                        title: 'How this page fits together',
                        caption: block.caption ?? '',
                        direction: block.direction,
                        nodes: block.nodes.map((node) => ({ id: node.id, label: node.label })),
                        edges: block.edges,
                      }}
                    />
                  );
                case 'img':
                  return (
                    <p key={index} className="my-3 text-[13px] text-muted">
                      Figure: {block.alt || 'image'} —{' '}
                      <a
                        href={repoUrl(block.src)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent underline underline-offset-2"
                      >
                        open the source ↗
                      </a>
                    </p>
                  );
                default:
                  return null;
              }
            })}
          </article>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft bg-canvas px-3 py-1.5">
        <p className="text-[12px] text-faint">
          The full solution and the graded checks are the workbench&apos;s own controls — this pane
          is the reading copy.
        </p>
        <a
          data-testid="link-lesson-source"
          href={sourceUrl(path || 'README.md')}
          target="_blank"
          rel="noreferrer"
          title="The repository page, for copying, printing or filing an issue. The lesson is the pane above."
          className="whitespace-nowrap text-[12.5px] font-mono text-muted underline underline-offset-2 hover:text-accent"
        >
          View source on GitHub ↗
        </a>
      </div>

      {/* A portal to <body>: the pane is an overflow-hidden card in a scrolling runner, and a popup
          mounted inside it would be clipped by the very box it is about. */}
      {stickyOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[60] flex items-end justify-center p-3 sm:items-center"
            style={{ backgroundColor: 'color-mix(in srgb, #04060a 62%, transparent)' }}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setStickyOpen(false);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="sticky-note-title"
              data-testid="sticky-note-popup"
              className="w-full max-w-[26rem] rounded-xl border bg-panel shadow-2xl"
              style={{ borderColor: 'var(--border-strong)' }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.stopPropagation();
                  setStickyOpen(false);
                }
              }}
            >
              <div
                className="flex items-center justify-between gap-2 border-b px-3 py-2"
                style={{ borderColor: 'var(--border)' }}
              >
                <p
                  id="sticky-note-title"
                  className="flex items-center gap-1.5 text-[12.5px] font-bold"
                  style={{ color: 'var(--text)' }}
                >
                  <StickyNote className="h-3.5 w-3.5" style={{ color: 'var(--amber)' }} aria-hidden="true" />
                  Sticky note
                </p>
                <button
                  type="button"
                  onClick={() => setStickyOpen(false)}
                  data-testid="btn-sticky-cancel"
                  aria-label="Close the sticky note"
                  className="btn px-2 py-1"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </div>
              <div className="space-y-2 px-3 py-2">
                <p
                  data-testid="sticky-note-quote"
                  className="max-h-20 overflow-y-auto rounded border-l-2 bg-canvas px-2 py-1 text-[12px] leading-snug text-muted"
                  style={{ borderColor: 'var(--amber)' }}
                >
                  {stickyQuote}
                </p>
                <textarea
                  autoFocus
                  value={stickyText}
                  onChange={(event) => setStickyText(event.target.value)}
                  maxLength={400}
                  rows={4}
                  data-testid="sticky-note-text"
                  aria-label="What you want to remember about this passage"
                  placeholder="What do you want to remember? It comes back as a review card."
                  className="w-full resize-y rounded border bg-canvas px-2 py-1.5 text-[13px] leading-snug text-ink"
                  style={{ borderColor: 'var(--border)' }}
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10.5px]" style={{ color: 'var(--dim)' }}>
                    {stickyText.length}/400 · saved in Notes
                  </span>
                  <button
                    type="button"
                    onClick={saveSticky}
                    disabled={!stickyQuote}
                    data-testid="btn-sticky-save"
                    className="btn btn-primary px-2.5 py-1 text-[12px]"
                  >
                    Save sticky
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </section>
  );
}
