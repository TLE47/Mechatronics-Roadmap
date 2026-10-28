import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Bold,
  BookOpen,
  ChevronRight,
  Highlighter,
  Italic,
  Loader2,
  PanelsTopLeft,
  RotateCcw,
  StickyNote,
  Trash2,
  Underline,
  X,
} from 'lucide-react';
import { MathView } from './MathView';
import { InlineMarkdown as Inline } from './InlineMarkdown';
import { Diagram } from '../visuals/Diagram';
import { sceneFor } from '../visuals/scenes';
import {
  loadLessonPage,
  type LessonPage,
  type ReaderBlock,
} from '../lessonPage';
import { headingAnchors, inlinePlain } from '../readerMarkdown';
import {
  clearReadingPosition,
  readReadingPosition,
  writeReadingPosition,
  type ReadingPosition,
} from '../readingPosition';
import {
  MAX_COMMENT_CHARS,
  addHighlight,
  cleanQuote,
  readLessonStudy,
  removeHighlight,
  setComment,
  type Highlight,
} from '../studyNotes';
import { checkId, readTicks, toggleTicked } from '../lessonChecks';
import { STORE_RESTORED_EVENT } from '../backupBundle';
import { markQuotes, wrapSelection } from '../lessonMarks';
import { RESET_EVENT } from '../resetEvent';
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

/**
 * The passage a sticky note is written about.
 *
 * A **cloned range** is the point: pressing the button collapses the document selection (the textarea
 * takes focus), so `window.getSelection()` cannot be asked where the words are afterwards. A clone
 * keeps its position in the DOM and still measures, which is what lets the popup hang off the words
 * and follow them when the reading pane scrolls. A marked passage needs no clone - its own element is
 * the anchor.
 */
type StickyAnchor = { range?: Range; element?: HTMLElement };

/** Where the sticky popover sits, in viewport coordinates, and which side of the passage it hangs from. */
interface StickyPlacement {
  top: number;
  left: number;
  width: number;
  side: 'above' | 'below';
  /** The notch's distance from the popover's left edge, so it points at the words. */
  caret: number;
}

/** The gap between the words and the popover, and the least margin kept from the window's edges. */
const STICKY_GAP = 10;
const STICKY_EDGE = 8;
const STICKY_MAX_WIDTH = 416;

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
  /**
   * Scrolls the workbench to its code editor. Absent when there is no editor on screen (the Read
   * preset), which is what keeps the jump link from promising a door that is not there.
   */
  onJumpToEditor?: () => void;
  /**
   * The phone's Code surface: the pane keeps its scroll and its mounted page, and is only taken off
   * screen. Unmounting it would fetch the page again and lose the reading position the reader has
   * just carried across a rotation (`readingPosition.ts`).
   */
  hidden?: boolean;
}

/** How long a scroll must be still before the position is written: one write per pause, not per pixel. */
const SAVE_AFTER_MS = 350;

/** The page's absolute URL, for the source link a heading or a figure points back to. */
function repoUrl(path: string): string {
  return `https://github.com/TLE47/Mechatronics-Roadmap/blob/main/${path}`;
}

/**
 * A fenced code block, with its highlights drawn where they were taken.
 *
 * A learner highlighting the line that computes `battery_level` is marking the code, not the sentence
 * about it, so the marks have to live inside the `<pre>`: this used to draw plain text, which stored
 * the highlight and never showed it. The comparison is `loose` because a selected snippet keeps one
 * space where the page has a newline.
 */
function CodeBlock({
  block,
  marks,
  onMark,
}: {
  block: Extract<ReaderBlock, { t: 'code' }>;
  marks: Highlight[];
  onMark: (mark: Highlight, anchor?: HTMLElement) => void;
}) {
  const quotes = new Set(marks.map((mark) => mark.quote));
  const pieces = quotes.size > 0 ? markQuotes(block.text, [...quotes], { loose: true }) : null;
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
        <code>
          {pieces === null
            ? block.text
            : pieces.map((piece, index) => {
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
                        ? `Open the note: ${inlinePlain(mark.comment)}`
                        : 'Open this passage in Notes'
                    }
                    onClick={(event) => {
                      event.stopPropagation();
                      if (mark) onMark(mark, event.currentTarget);
                    }}
                    className="inline cursor-pointer rounded-sm bg-amber/15 p-0 text-inherit underline decoration-amber decoration-dotted underline-offset-2 hover:bg-amber/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    {piece.text}
                  </button>
                );
              })}
        </code>
      </pre>
    </div>
  );
}

function TableBlock({
  block,
  marks,
  onMark,
}: {
  block: Extract<ReaderBlock, { t: 'table' }>;
  marks: Highlight[];
  onMark: (mark: Highlight, anchor?: HTMLElement) => void;
}) {
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
                <Inline text={cell} marks={marks} onMark={onMark} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="border border-line-soft px-2 py-1.5 align-top text-body">
                  <Inline text={cell} marks={marks} onMark={onMark} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LessonReader({
  lessonId,
  path,
  tall = false,
  toolbar,
  panel,
  onJumpToEditor,
  hidden = false,
}: LessonReaderProps) {
  /** Whether the reader is showing its one-line split-view suggestion. */
  const [splitTip, setSplitTip] = useState(false);
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
  /** True when the popup was opened by pressing a marked passage, so Save updates instead of adds. */
  const [stickyEditing, setStickyEditing] = useState(false);
  /** The lesson's ticks, and the highlights drawn into the prose; both are re-read after a write. */
  const [ticks, setTicks] = useState<string[]>([]);
  const [marks, setMarks] = useState<Highlight[]>([]);
  /** The passage the popover points at, and where the popover ended up after measuring itself. */
  const [stickyAnchor, setStickyAnchor] = useState<StickyAnchor | null>(null);
  const [stickyPlacement, setStickyPlacement] = useState<StickyPlacement | null>(null);
  const stickyRef = useRef<HTMLTextAreaElement | null>(null);
  const stickyCardRef = useRef<HTMLDivElement | null>(null);
  /** Where the caret goes when the next render commits, because a controlled box forgets it. */
  const stickyCaretRef = useRef<{ start: number; end: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastSaveRef = useRef(0);
  const pendingRef = useRef<ReadingPosition | null>(null);
  const anchors = useMemo(() => headingAnchors(page?.blocks ?? []), [page]);

  useEffect(() => {
    let cancelled = false;
    setPage(null);
    setError('');
    setStatus('');
    setSelection('');
    setStickyOpen(false);
    setStickyText('');
    setStickyQuote('');
    setStickyEditing(false);
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

  // The ticks and the marked passages belong to the lesson, not to the page load: switching to the
  // next lesson and back must show what was done, and a reset elsewhere on screen must clear them
  // here too rather than leave a checkbox that reloads unticked.
  useEffect(() => {
    const reread = () => {
      setTicks(readTicks(lessonId));
      setMarks(readLessonStudy(lessonId)?.highlights ?? []);
    };
    reread();
    window.addEventListener(RESET_EVENT, reread);
    // A backup restore writes the ticks store too; without this the open page keeps the old boxes.
    window.addEventListener(STORE_RESTORED_EVENT, reread);
    return () => {
      window.removeEventListener(RESET_EVENT, reread);
      window.removeEventListener(STORE_RESTORED_EVENT, reread);
    };
  }, [lessonId]);

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
    // A resize before the next scroll still has a place to hold: the restored position is the
    // learner's place until they move it.
    pendingRef.current = saved;
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

  // A split-view resize reflows the page under the reader: the paragraph they were reading has to
  // stay under their eyes. The old pixel offset means nothing after a reflow (lines wrap, a reveal
  // can close), so the recorded block is looked up in the new layout and the distance into it is
  // added back on top - which is the same rule the restore uses, applied to a resize instead of a
  // reload.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !page || typeof ResizeObserver === 'undefined') return undefined;
    let frame = 0;
    const holdPlace = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const saved = pendingRef.current;
        if (!saved) return;
        const furthest = Math.max(0, container.scrollHeight - container.clientHeight);
        const block = saved.block
          ? container.querySelector<HTMLElement>(`[data-reader-block="${saved.block}"]`)
          : null;
        if (block && block.getClientRects().length) {
          const into = typeof saved.blockAt === 'number' ? Math.max(0, saved.at - saved.blockAt) : 0;
          const ceiling = Math.max(0, block.offsetHeight - 8);
          container.scrollTop = Math.min(furthest, Math.max(0, block.offsetTop + Math.min(into, ceiling)));
          return;
        }
        const heading = saved.anchor
          ? container.querySelector<HTMLElement>(`[data-reader-anchor="${saved.anchor}"]`)
          : null;
        if (!heading) return;
        const into = typeof saved.anchorAt === 'number' ? Math.max(0, saved.at - saved.anchorAt) : 0;
        container.scrollTop = Math.min(furthest, Math.max(0, heading.offsetTop + into));
      });
    };
    const observer = new ResizeObserver(holdPlace);
    observer.observe(container);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
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

  /**
   * Where the top of the pane is, as a heading *and* as a block.
   *
   * The block is what a split-view resize needs: the heading survives a reflow, but a narrow column
   * moves the paragraph under it, so the place is recorded as the block at the top plus the
   * distance into it. Closed reveals are skipped - their boxes measure zero and would claim the top
   * of every page.
   */
  const currentPosition = (container: HTMLDivElement): ReadingPosition => {
    const top = container.scrollTop + 8;
    let anchor = '';
    let anchorAt: number | undefined;
    for (const heading of container.querySelectorAll<HTMLElement>('[data-reader-anchor]')) {
      if (!heading.getClientRects().length) continue;
      if (heading.offsetTop <= top) {
        anchor = heading.dataset.readerAnchor ?? '';
        anchorAt = heading.offsetTop;
      } else break;
    }
    let block = '';
    let blockAt: number | undefined;
    for (const node of container.querySelectorAll<HTMLElement>('[data-reader-block]')) {
      if (!node.getClientRects().length) continue;
      if (node.offsetTop <= top) {
        block = node.dataset.readerBlock ?? '';
        blockAt = node.offsetTop;
      } else break;
    }
    const position: ReadingPosition = { anchor, at: container.scrollTop };
    if (typeof anchorAt === 'number') position.anchorAt = anchorAt;
    if (block) {
      position.block = block;
      if (typeof blockAt === 'number') position.blockAt = blockAt;
    }
    return position;
  };

  const remember = () => {
    const container = scrollRef.current;
    if (!container || !page) return;
    const position = currentPosition(container);
    pendingRef.current = position;
    const now = Date.now();
    if (now - lastSaveRef.current < SAVE_AFTER_MS) return;
    lastSaveRef.current = now;
    writeReadingPosition(lessonId, position);
  };

  // A controlled textarea loses its selection when React writes the value back. Restoring it in a
  // layout effect (after the commit, before paint) is what lets Bold then Underline nest: the second
  // press has to see the selection the first one left, not a whole box selected from before.
  useLayoutEffect(() => {
    const box = stickyRef.current;
    const caret = stickyCaretRef.current;
    if (!box || !caret) return;
    stickyCaretRef.current = null;
    box.focus();
    try {
      box.setSelectionRange(caret.start, caret.end);
    } catch {
      // A box that went away between the press and the commit has nothing to restore.
    }
  }, [stickyText]);

  /** Re-read the lesson's highlights after a write, so the marks in the prose match the store. */
  const syncMarks = () => setMarks(readLessonStudy(lessonId)?.highlights ?? []);

  const closeSticky = () => {
    setStickyOpen(false);
    setStickyText('');
    setStickyQuote('');
    setStickyEditing(false);
    setStickyAnchor(null);
    setStickyPlacement(null);
  };

  // The note hangs off the passage it is about: below it when there is room, above it when the
  // passage is near the bottom of the window and the room above is the larger of the two. It is a
  // popover, not a window - the page stays readable and clickable behind it - so it is placed in
  // viewport coordinates and re-measured on scroll and on every keystroke (the preview makes the
  // card taller).
  useLayoutEffect(() => {
    if (!stickyOpen) return;
    const place = () => {
      const rect = stickyAnchor?.element?.isConnected
        ? stickyAnchor.element.getBoundingClientRect()
        : stickyAnchor?.range?.getBoundingClientRect();
      const width = Math.min(STICKY_MAX_WIDTH, Math.max(240, window.innerWidth - STICKY_EDGE * 2));
      const height = stickyCardRef.current?.offsetHeight ?? 260;
      // A note with no passage to hang from (nothing measurable was handed in) is centred rather than
      // left invisible: an unplaced popover is hidden, and a hidden editor is a dead button.
      if (!stickyAnchor || !rect || (!rect.width && !rect.height)) {
        if (stickyAnchor) return; // the passage is gone: keep the card where it was
        setStickyPlacement({
          top: Math.max(STICKY_EDGE, (window.innerHeight - height) / 2),
          left: Math.max(STICKY_EDGE, (window.innerWidth - width) / 2),
          width,
          side: 'below',
          caret: width / 2,
        });
        return;
      }
      const roomBelow = window.innerHeight - rect.bottom - STICKY_GAP - STICKY_EDGE;
      const roomAbove = rect.top - STICKY_GAP - STICKY_EDGE;
      // Below by default. Above only when the bottom edge is close and there is more room up there,
      // which is the sentence at the end of a scroll rather than the popup covering the words.
      const side: 'above' | 'below' =
        roomBelow < Math.min(height, 200) && roomAbove > roomBelow ? 'above' : 'below';
      const wanted = side === 'above' ? rect.top - STICKY_GAP - height : rect.bottom + STICKY_GAP;
      const top = Math.max(
        STICKY_EDGE,
        Math.min(window.innerHeight - height - STICKY_EDGE, wanted)
      );
      // Centre on the words, then pull back inside the window instead of letting a passage near an
      // edge push the card off it.
      const left = Math.max(
        STICKY_EDGE,
        Math.min(window.innerWidth - width - STICKY_EDGE, rect.left + rect.width / 2 - width / 2)
      );
      const caret = Math.max(18, Math.min(width - 18, rect.left + rect.width / 2 - left));
      setStickyPlacement({ top, left, width, side, caret });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [stickyOpen, stickyAnchor, stickyText, stickyQuote, stickyEditing]);

  // Not modal: a press anywhere but the card closes it. A press on another marked passage is left
  // alone - that press opens that passage's own note.
  useEffect(() => {
    if (!stickyOpen) return;
    const onPress = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (stickyCardRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest('[data-testid="sticky-mark"]')) return;
      closeSticky();
    };
    document.addEventListener('mousedown', onPress, true);
    return () => document.removeEventListener('mousedown', onPress, true);
  }, [stickyOpen]);

  const pinSelection = () => {
    if (!selection) return;
    const saved = addHighlight(lessonId, selection);
    if (!saved) {
      setStatus('Not saved — storage is blocked or full.');
      return;
    }
    window.getSelection()?.removeAllRanges();
    setSelection('');
    syncMarks();
    setStatus('Highlight pinned to Notes.');
  };

  /**
   * Remove the note the popup is editing, and the passage with it.
   *
   * A highlight's identity is the quote, so deleting the note deletes its mark from the page and its
   * card from the deck at once - there is no second copy to keep in step. The popup is the place a
   * learner realises a note says the wrong thing; making them close it and find the quote in the
   * Study panel to remove it was the one trip this adds no reason for.
   */
  const removeSticky = () => {
    if (!stickyQuote) return;
    removeHighlight(lessonId, stickyQuote);
    window.getSelection()?.removeAllRanges();
    setSelection('');
    syncMarks();
    setStatus('Sticky note removed.');
    closeSticky();
  };

  /** Open the note a marked passage carries; Save then updates that highlight rather than adding. */
  const openMark = (mark: Highlight, anchor?: HTMLElement) => {
    setStickyEditing(true);
    setStickyQuote(mark.quote);
    setStickyText(mark.comment);
    setStickyAnchor(anchor ? { element: anchor } : null);
    // The previous card's place is not this card's place: the first frame stays hidden until this
    // one has been measured, instead of flashing where the last note was.
    setStickyPlacement(null);
    setStickyOpen(true);
  };

  /**
   * Open the popover on the passage that is selected right now.
   *
   * The selection is cloned before the textarea takes focus, because focusing it collapses the
   * document selection and there is nothing left to measure. `fallback` is the button's own box, for
   * the one case a range cannot be had (a synthetic selection that never reached the document).
   */
  const openStickyOnSelection = (fallback?: HTMLElement) => {
    const chosen = typeof window.getSelection === 'function' ? window.getSelection() : null;
    const range = chosen && chosen.rangeCount > 0 ? chosen.getRangeAt(0).cloneRange() : null;
    setStickyAnchor(range ? { range } : fallback ? { element: fallback } : null);
    setStickyEditing(false);
    setStickyText('');
    setStickyQuote(selection);
    setStickyPlacement(null);
    setStickyOpen(true);
  };

  /** Wrap the textarea's selection in a Markdown marker, keeping the selection inside the pair. */
  const applyMarker = (marker: string) => {
    const box = stickyRef.current;
    const start = box?.selectionStart ?? stickyText.length;
    const end = box?.selectionEnd ?? start;
    const wrapped = wrapSelection(stickyText, start, end, marker);
    // The store's comment cap includes the markers: a box that could wrap 400 characters into 404
    // would save 400 and silently lose the closing pair on reload.
    const next = wrapped.text.slice(0, MAX_COMMENT_CHARS);
    // Bold then Underline nests: the layout effect below puts the selection back inside the markers
    // this press wrote, so the next press wraps that range rather than the whole box.
    stickyCaretRef.current = {
      start: Math.min(wrapped.start, next.length),
      end: Math.min(wrapped.end, next.length),
    };
    setStickyText(next);
  };

  const onStickyKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      closeSticky();
      return;
    }
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    const marker = key === 'b' ? '**' : key === 'i' ? '*' : key === 'u' ? '++' : '';
    if (!marker) return;
    event.preventDefault();
    applyMarker(marker);
  };

  /** Tick or untick one bullet. The box is only redrawn from the store after the write lands. */
  const toggleItem = (text: string) => {
    const result = toggleTicked(lessonId, text);
    if (!result.saved) {
      setStatus('Not saved — storage is blocked or full.');
      return;
    }
    setTicks(readTicks(lessonId));
  };

  /**
   * A sticky note: the same pinned passage as a highlight, with the learner's thought attached.
   *
   * The word matters. A highlight is for a passage worth finding again; a sticky is for the sentence
   * that needs one — "this is the gain I keep forgetting", "recompute with the new dt". The comment
   * is also what makes the passage a review card (`studyCards.ts`), so the thought comes back on the
   * day it is due instead of staying on the page it was written on.
   *
   * Opened from a mark in the prose (`openMark`), the same popup edits what is already there and
   * leaves the passage's comment in place of adding a second highlight for the same quote.
   */
  const saveSticky = () => {
    if (!stickyQuote) return;
    const saved = stickyEditing
      ? setComment(lessonId, stickyQuote, stickyText)
      : addHighlight(lessonId, stickyQuote, stickyText);
    if (!saved) {
      setStatus('Not saved — storage is blocked or full.');
      return;
    }
    window.getSelection()?.removeAllRanges();
    setSelection('');
    syncMarks();
    setStatus(
      stickyEditing
        ? stickyText.trim()
          ? 'Sticky note updated.'
          : 'Sticky note cleared; the passage is still pinned.'
        : stickyText.trim()
          ? 'Sticky note saved to Notes.'
          : 'Passage pinned to Notes.'
    );
    closeSticky();
  };

  const scrollToTop = () => {
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTop = 0;
    pendingRef.current = { anchor: '', at: 0 };
    clearReadingPosition(lessonId);
  };

  /**
   * One block of the page, and the same function again for a reveal's children.
   *
   * A `reveal` is the page's own `<details>`: hints, the answers under `Check yourself` and the full
   * solution arrive closed, so the reader meets the question before the answer instead of the answer
   * on the way past. Nested blocks are rendered by this function, not by a second renderer, so a
   * hint's code block is the same code block as the page's.
   *
   * Every block carries `data-reader-block`: the reading position is a block plus the distance into
   * it (`readingPosition.ts`), which is what keeps the paragraph a learner is on under their eyes
   * when a split-view resize reflows the page under it.
   */
  const renderBlock = (block: ReaderBlock, key: React.Key): React.ReactNode => {
    const blockKey = String(key);
    switch (block.t) {
      case 'h': {
        const anchor = anchors.get(block) ?? '';
        const Tag = (block.l === 2 ? 'h2' : block.l === 3 ? 'h3' : 'h4') as 'h2' | 'h3' | 'h4';
        return (
          <Tag
            key={key}
            id={anchor}
            data-reader-anchor={anchor}
            data-reader-block={blockKey}
            className={`scroll-mt-3 font-bold text-ink ${
              block.l === 2 ? 'mt-5 text-[22px]' : 'mt-4 text-[18px]'
            }`}
          >
            <Inline text={block.x} marks={marks} onMark={openMark} />
            {onJumpToEditor && /^do it yourself\b/i.test(inlinePlain(block.x)) && (
              <button
                type="button"
                onClick={onJumpToEditor}
                data-testid="btn-do-it-yourself"
                title="Go straight to the code this section is asking you to write"
                className="ml-2 align-middle text-[12px] font-mono font-normal text-accent underline decoration-dotted underline-offset-2 cursor-pointer"
              >
                Go to the editor ↓
              </button>
            )}
          </Tag>
        );
      }
      case 'p':
        return (
          <p key={key} data-reader-block={blockKey} className="text-[17px] leading-[1.7] text-body">
            <Inline text={block.x} marks={marks} onMark={openMark} />
          </p>
        );
      case 'ul':
      case 'ol': {
        // A bullet list is a list of things to do, so each item is a checkbox that remembers its
        // tick (`lessonChecks.ts`). Ordered lists keep their numbers: a sequence has an order, and a
        // checklist of steps is still read in that order.
        if (block.t === 'ol') {
          return (
            <ol
              key={key}
              data-reader-block={blockKey}
              className="list-decimal space-y-1 pl-5 text-[17px] leading-[1.65] text-body"
            >
              {block.items.map((item, itemIndex) => (
                <li
                  key={itemIndex}
                  style={{ marginLeft: `${item.d * 16}px` }}
                  className={item.d > 0 ? 'list-[circle]' : undefined}
                >
                  <Inline text={item.x} marks={marks} onMark={openMark} />
                </li>
              ))}
            </ol>
          );
        }
        return (
          <ul
            key={key}
            data-testid="reader-checklist"
            data-reader-block={blockKey}
            className="list-none space-y-1.5 pl-0 text-[17px] leading-[1.65] text-body"
          >
            {block.items.map((item, itemIndex) => {
              const itemKey = checkId(item.x);
              const checked = itemKey !== '' && ticks.includes(itemKey);
              return (
                <li
                  key={itemIndex}
                  style={{ marginLeft: `${item.d * 16}px` }}
                  className="flex items-start gap-2.5"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleItem(item.x)}
                    aria-label={inlinePlain(item.x).slice(0, 140)}
                    data-testid={`reader-check-${blockKey}-${itemIndex}`}
                    data-check-key={itemKey}
                    title="Tick this when you have done it. Saved on this device."
                    className="mt-[0.32rem] h-4 w-4 shrink-0 cursor-pointer accent-[var(--accent)]"
                  />
                  <span
                    className={
                      checked ? 'text-faint line-through decoration-line-strong' : undefined
                    }
                  >
                    <Inline text={item.x} marks={marks} onMark={openMark} />
                  </span>
                </li>
              );
            })}
          </ul>
        );
      }
      case 'code':
        return (
          <div key={key} data-reader-block={blockKey}>
            <CodeBlock block={block} marks={marks} onMark={openMark} />
          </div>
        );
      case 'table':
        return (
          <div key={key} data-reader-block={blockKey}>
            <TableBlock block={block} marks={marks} onMark={openMark} />
          </div>
        );
      case 'quote':
        return (
          <blockquote
            key={key}
            data-reader-block={blockKey}
            className="my-3 rounded-r-lg border-l-2 border-amber/70 bg-amber/5 py-2 pl-3 pr-2 text-[15.5px] leading-relaxed text-body"
          >
            <Inline text={block.x} marks={marks} onMark={openMark} />
          </blockquote>
        );
      case 'math':
        return (
          <div key={key} data-reader-block={blockKey} className="my-3 overflow-x-auto">
            <MathView math={block.tex} block />
          </div>
        );
      case 'figure': {
        const spec = sceneFor(block.id);
        if (!spec) {
          return (
            <p
              key={key}
              data-testid="reader-figure-missing"
              data-reader-block={blockKey}
              className="my-3 rounded-lg border border-amber/40 bg-amber/5 px-3 py-2 text-[13px] text-body"
            >
              This build has no figure called <code className="font-mono text-ink">{block.id}</code>.
              The page asks for one; the picture is missing rather than the paragraph that explains it.
            </p>
          );
        }
        return (
          <div key={key} data-reader-block={blockKey}>
            <Diagram
              id={block.id}
              live
              spec={block.caption ? { ...spec, caption: block.caption } : spec}
            />
          </div>
        );
      }
      case 'route':
        return (
          <div key={key} data-reader-block={blockKey}>
            <Diagram
              id="route"
              live
              spec={{
                kind: 'route',
                title: 'Where this lesson goes',
                caption: block.caption ?? ROUTE_CAPTION,
                steps: block.steps,
              }}
            />
          </div>
        );
      case 'graph':
        return (
          <div key={key} data-reader-block={blockKey}>
            <Diagram
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
          </div>
        );
      case 'img':
        return (
          <p key={key} data-reader-block={blockKey} className="my-3 text-[13px] text-muted">
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
      case 'reveal':
        return (
          <details
            key={key}
            data-testid="reader-reveal"
            data-reader-block={blockKey}
            className="group my-3 overflow-hidden rounded-lg border border-line-soft bg-canvas"
          >
            <summary
              data-testid="reader-reveal-label"
              className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-[13px] font-mono text-muted hover:text-ink [&::-webkit-details-marker]:hidden"
            >
              <ChevronRight
                className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-90"
                aria-hidden="true"
              />
              <span className="min-w-0 truncate">
                <Inline text={block.label} />
              </span>
              {/* Decoration, not the toggle's name: a screen reader should hear "Full Solution",
                  not "Full Solution press to open" as if the two were one label. */}
              <span aria-hidden="true" className="ml-auto shrink-0 text-[11px] text-faint">
                press to open
              </span>
            </summary>
            <div className="space-y-3 border-t border-line-soft px-3 py-3">
              {block.blocks.map((child, childIndex) =>
                renderBlock(child, `${blockKey}.${childIndex}`)
              )}
            </div>
          </details>
        );
      default:
        return null;
    }
  };

  return (
    <section
      data-testid="lesson-reader"
      data-reader-path={path}
      data-reader-hidden={hidden || undefined}
      // `min-w-0` is what keeps a long code line inside the pane's own scroller: as a flex child
      // the default `min-width: auto` lets its widest `<pre>` widen the whole work area instead.
      className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-panel"
      style={{ display: hidden ? 'none' : undefined }}
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
              onClick={(event) => openStickyOnSelection(event.currentTarget)}
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
            onClick={() => setSplitTip((open) => !open)}
            aria-expanded={splitTip}
            data-testid="btn-split-tip"
            title="Study tip: put this page beside the editor in split view, so the code and the explanation stay in sight together"
            className="flex items-center gap-1 rounded border border-line-soft bg-canvas px-2 py-1 text-[13px] font-mono text-muted hover:text-ink cursor-pointer"
          >
            <PanelsTopLeft className="h-3 w-3" /> Split view
          </button>
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

      {splitTip && (
        <p
          data-testid="reader-split-tip"
          className="border-b border-line-soft bg-canvas px-3 py-1.5 text-[12px] leading-snug text-muted"
        >
          Study tip: on a wide window, put this page beside the editor — the{' '}
          <span className="font-mono text-body">Study</span> preset does it, and dragging two windows
          side by side works too — so the code and the explanation stay in sight together.
          {onJumpToEditor && (
            <>
              {' '}
              No room to split?{' '}
              <button
                type="button"
                onClick={onJumpToEditor}
                data-testid="btn-split-tip-jump"
                className="font-mono text-accent underline underline-offset-2 cursor-pointer"
              >
                Jump to the editor ↓
              </button>
              {' '}
              — the text keeps its place when you come back.
            </>
          )}
        </p>
      )}

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
            {page.blocks.map((block, index) => renderBlock(block, `b${index}`))}
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

      {/* A portal to <body>: the pane is an overflow-hidden card in a scrolling runner, and a popover
          mounted inside it would be clipped by the very box it is about. It is placed against the
          passage's own rect (the effect above), not centred in the window - and it is not modal, so
          the page behind it stays readable while the note is written. */}
      {stickyOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            data-testid="sticky-note-anchor-box"
            className="fixed z-[60]"
            style={{
              top: stickyPlacement?.top ?? 0,
              left: stickyPlacement?.left ?? 0,
              width: stickyPlacement?.width ?? STICKY_MAX_WIDTH,
              // The first layout pass only measures the card. Painting it at the top-left corner and
              // then jumping into place is worse than not painting it for that one frame.
              visibility: stickyPlacement ? 'visible' : 'hidden',
            }}
          >
            {stickyPlacement && (
              <span
                aria-hidden="true"
                data-testid="sticky-note-caret"
                className="pointer-events-none absolute h-2.5 w-2.5 rotate-45 border bg-panel"
                style={{
                  left: stickyPlacement.caret - 5,
                  borderColor: 'var(--border-strong)',
                  ...(stickyPlacement.side === 'above'
                    ? { bottom: -5, borderTop: 'none', borderLeft: 'none' }
                    : { top: -5, borderBottom: 'none', borderRight: 'none' }),
                }}
              />
            )}
            <div
              ref={stickyCardRef}
              role="dialog"
              aria-labelledby="sticky-note-title"
              data-testid="sticky-note-popup"
              data-anchor-side={stickyPlacement?.side ?? 'below'}
              className="max-h-[min(70vh,34rem)] w-full overflow-y-auto rounded-xl border bg-panel shadow-2xl"
              style={{ borderColor: 'var(--border-strong)' }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.stopPropagation();
                  closeSticky();
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
                  {stickyEditing ? 'Edit sticky note' : 'Sticky note'}
                </p>
                <button
                  type="button"
                  onClick={closeSticky}
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
                {/* The editor stores Markdown, so the shortcuts are the familiar ones and the
                    preview shows what a reader of the note (the review card, the export) sees. */}
                <div className="flex items-center gap-1" data-testid="sticky-format-bar">
                  {[
                    { marker: '**', label: 'Bold', hint: 'Bold (⌘B / Ctrl+B)', id: 'btn-sticky-bold', Icon: Bold },
                    { marker: '*', label: 'Italic', hint: 'Italic (⌘I / Ctrl+I)', id: 'btn-sticky-italic', Icon: Italic },
                    { marker: '++', label: 'Underline', hint: 'Underline (⌘U / Ctrl+U)', id: 'btn-sticky-underline', Icon: Underline },
                  ].map(({ marker, label, hint, id, Icon }) => (
                    <button
                      key={id}
                      type="button"
                      data-testid={id}
                      aria-label={label}
                      title={hint}
                      // Keep the selection in the box: a press that moves focus first would wrap
                      // nothing, which is the one way a Bold button can look broken.
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => applyMarker(marker)}
                      className="btn px-1.5 py-1"
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  ))}
                  <span className="ml-1 font-mono text-[10.5px]" style={{ color: 'var(--dim)' }}>
                    Markdown · ⌘B / ⌘I / ⌘U
                  </span>
                </div>
                <textarea
                  ref={stickyRef}
                  autoFocus
                  value={stickyText}
                  onChange={(event) => setStickyText(event.target.value)}
                  onKeyDown={onStickyKeyDown}
                  maxLength={MAX_COMMENT_CHARS}
                  rows={4}
                  data-testid="sticky-note-text"
                  aria-label="What you want to remember about this passage"
                  placeholder="What do you want to remember? It comes back as a review card."
                  className="w-full resize-y rounded border bg-canvas px-2 py-1.5 text-[13px] leading-snug text-ink"
                  style={{ borderColor: 'var(--border)' }}
                />
                {stickyText.trim() && (
                  <p
                    data-testid="sticky-note-preview"
                    className="max-h-24 overflow-y-auto rounded border border-line-soft bg-canvas px-2 py-1 text-[12.5px] leading-snug text-body"
                  >
                    <Inline text={stickyText} />
                  </p>
                )}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10.5px]" style={{ color: 'var(--dim)' }}>
                    {stickyText.length}/{MAX_COMMENT_CHARS} · saved in Notes
                  </span>
                  <div className="flex items-center gap-1">
                    {stickyEditing && (
                      <button
                        type="button"
                        onClick={removeSticky}
                        data-testid="btn-sticky-delete"
                        title="Delete this note and its highlight"
                        className="btn px-2 py-1 text-[12px] text-rose hover:text-rose"
                      >
                        <Trash2 className="h-3 w-3" aria-hidden="true" /> Remove
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={saveSticky}
                      disabled={!stickyQuote}
                      data-testid="btn-sticky-save"
                      className="btn btn-primary px-2.5 py-1 text-[12px]"
                    >
                      {stickyEditing ? 'Save changes' : 'Save sticky'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </section>
  );
}
