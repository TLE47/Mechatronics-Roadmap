import React, {
  Suspense,
  lazy,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  ArrowRight,
  Bold,
  BookOpen,
  ChevronRight,
  EyeOff,
  Highlighter,
  Italic,
  Loader2,
  PanelsTopLeft,
  RotateCcw,
  Sigma,
  StickyNote,
  Trash2,
  Underline,
  X,
} from 'lucide-react';
import { chordMatches } from '../keymap';
import { useKeymap } from '../useKeymap';
import { MathView } from './MathView';
import { InlineMarkdown as Inline, inlinePlainText } from './InlineMarkdown';
import {
  loadLessonPage,
  type LessonPage,
  type ReaderBlock,
} from '../lessonPage';
import { headingAnchors, inlinePlain } from '../readerMarkdown';
import { hasConceptVisual, visualPlacementForConcept } from '../micro/visuals';
import { blocksForScope, type ReaderScope } from '../readerScope';
import {
  clearReadingPosition,
  createReadingSaver,
  readReadingPosition,
  writeReadingPosition,
  type ReadingPosition,
  type ReadingSaver,
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
import { markQuotes, unlocatedQuotes } from '../lessonMarks';
import { RESET_EVENT } from '../resetEvent';
import { lessonPageUrl as sourceUrl } from '../startHere';
import { StudyClockReminder } from './StudyClockReminder';
import StickyNoteEditor, { type StickyNoteEditorHandle } from './StickyNoteEditor';
import { LazyPending } from './LazyPending';
// One dynamic import is all the entry chunk keeps of the Bridge Notes visuals: the table of names
// and the pictures themselves travel in their own chunks (`bridges/bridgeNotesVisual.tsx`).
const BridgeNotesVisual = lazy(() => import('../bridges/bridgeNotesVisual'));
// The figures are 5.6 kB of scene data and SVG renderers that a lesson only needs once it is open,
// so the picture arrives through the same kind of boundary (`visuals/ReaderFigure.tsx`).
const ReaderFigure = lazy(() => import('../visuals/ReaderFigure'));
// The micro-focus scenes are the same components the Micro-learning tab draws. They arrive in their
// own chunk only when a page actually carries a `micro-*` anchored section, so a lesson with no
// micro focus pays no picture code.
const MicroVisual = lazy(() =>
  import('./micro/MicroVisual').then((module) => ({ default: module.MicroVisual }))
);

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
/**
 * The page's drawn words, for asking whether a saved note is on it at all.
 *
 * Built from the payload rather than from the DOM: a scope draws only half the page, and a note
 * written in Read would be accused by Study if the guard looked at what is currently painted. It
 * walks reveals because a note can be written inside an opened hint, and code blocks because a
 * highlight can be taken from one (`markQuotes(..., { loose: true })` draws it).
 */
function pagePlainText(blocks: ReaderBlock[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    switch (block.t) {
      case 'p':
      case 'h':
      case 'quote':
        parts.push(inlinePlainText(block.x));
        break;
      case 'ul':
      case 'ol':
        parts.push(block.items.map((item) => inlinePlainText(item.x)).join(' '));
        break;
      case 'table':
        parts.push(
          [...block.head, ...block.rows.flat()].map((cell) => inlinePlainText(cell)).join(' ')
        );
        break;
      case 'code':
        parts.push(block.text);
        break;
      case 'reveal':
        parts.push(pagePlainText(block.blocks));
        break;
      default:
        break;
    }
  }
  return parts.filter(Boolean).join(' ');
}

/** What a route block says when the page gives no caption of its own. */
const ROUTE_CAPTION = 'Each box is a checkpoint in order; the last one is the verified pass this page ends on.';

/** The one split-view instruction, kept whole so its button tooltip cannot drift from the panel. */
const SPLIT_TIP =
  "Study tip: Open the external resource in a new tab, then use your browser's Split View to display it beside this lesson. Alternatively, drag two windows side by side. Adjust their sizes to give more space to the page you're currently working on.";

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
  /** The card height this placement was measured against, so a late line can trigger a re-place. */
  height: number;
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
  /** A term or prose row's phrase to land on; `nonce` makes the same phrase a fresh request. */
  focus?: { id: string; nonce: number; focus?: string; focusAnchor?: string } | null;
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
   * The phrase was not in this scope: ask once for the other reader preset. Read drops the whole
   * `## Learn` section and Study drops the rest, so a deep link has to be allowed to try both.
   */
  onFocusMiss?: () => void;
  /**
   * The phone's Code surface: the pane keeps its scroll and its mounted page, and is only taken off
   * screen. Unmounting it would fetch the page again and lose the reading position the reader has
   * just carried across a rotation (`readingPosition.ts`).
   */
  hidden?: boolean;
  /** Show the start-the-clock reminder at the top of Study's prose (desktop only). */
  showClock?: boolean;
  /**
   * Study starts at `## Learn` and stops at its `## Do it yourself` heading, because the workbench
   * below is the doing half. Read keeps the rest of the page, without the Learn section Study carries.
   */
  scope?: ReaderScope;
  /**
   * Where the page goes next: Study continues into Read, Read continues into the next lesson.
   *
   * It sits after the last paragraph and before the source link, as a quiet pill rather than a solid
   * button: reaching the end of a page is not a call to action, and a loud control there would
   * compete with the exercise the learner has just read.
   */
  continueAction?: { label: string; title: string; onClick: () => void } | null;
  /**
   * The way back from Read: the pill at the bottom left, mirroring `continueAction` on the right.
   *
   * Read is the one scope that puts the editor and the chooser away, so the pill that led into it
   * is the only route a reader has back to the half of the page they came from without reaching for
   * the header's layout chips.
   */
  backAction?: { label: string; title: string; onClick: () => void } | null;
}

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
                    data-mark-kind={mark?.comment.trim() ? 'sticky' : 'highlight'}
                    className={
                      mark?.comment.trim()
                        ? 'inline cursor-pointer rounded-sm border-b-2 border-amber/70 bg-amber/20 p-0 text-inherit hover:bg-amber/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent'
                        : 'inline cursor-pointer rounded-sm bg-accent/15 p-0 text-inherit underline decoration-accent/70 decoration-dotted underline-offset-2 hover:bg-accent/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent'
                    }
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
  focus = null,
  toolbar,
  panel,
  onJumpToEditor,
  onFocusMiss,
  hidden = false,
  showClock = false,
  scope = 'full',
  continueAction = null,
  backAction = null,
}: LessonReaderProps) {
  /** Whether the reader is showing its one-line split-view suggestion. */
  const [splitTip, setSplitTip] = useState(false);
  /** The lesson text can step out of the grid entirely; the hover tab is the way back. */
  const [collapsed, setCollapsed] = useState(false);
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
  /**
   * The notes that are nowhere on this page any more, named once at the end of the text.
   *
   * This used to be drawn by every inline paragraph, which made a note written on one sentence
   * accuse all the others: each `<Inline>` only knew its own words, so "1 note not on this text"
   * appeared on every paragraph that did not hold it. The check belongs to the page, and so does
   * the sentence.
   */
  const unlocated = useMemo(
    () =>
      page && marks.length > 0
        ? unlocatedQuotes(pagePlainText(page.blocks), marks.map((mark) => mark.quote))
        : [],
    [page, marks]
  );
  /** The passage the popover points at, and where the popover ended up after measuring itself. */
  const [stickyAnchor, setStickyAnchor] = useState<StickyAnchor | null>(null);
  const [stickyPlacement, setStickyPlacement] = useState<StickyPlacement | null>(null);
  const stickyRef = useRef<StickyNoteEditorHandle | null>(null);
  const stickyCardRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const onFocusMissRef = useRef(onFocusMiss);
  onFocusMissRef.current = onFocusMiss;
  /** The request that already asked for the other scope, so a miss cannot bounce forever. */
  const focusMissed = useRef<number | null>(null);
  // The saver belongs to the lesson it was made for: a pending write must not land on the next one.
  const saverRef = useRef<{ lessonId: string; saver: ReadingSaver } | null>(null);
  const saverFor = (id: string): ReadingSaver => {
    if (!saverRef.current || saverRef.current.lessonId !== id) {
      saverRef.current?.saver.flush();
      saverRef.current = {
        lessonId: id,
        saver: createReadingSaver((position) => writeReadingPosition(id, position)),
      };
    }
    return saverRef.current.saver;
  };
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

  // A fragment in the address (`?lesson=P.1#micro-variables`) is a request to land on that passage.
  // The page arrives after the address is read, so the browser's own fragment scroll cannot do it;
  // this is the one explicit scroll the reader performs after a load. An explicit fragment is the
  // more recent request, so it wins over a saved reading position for this visit.
  useEffect(() => {
    if (!page) return;
    const id = decodeURIComponent(window.location.hash.replace(/^#/, ''));
    if (!id) return;
    const container = scrollRef.current;
    if (!container) return;
    const frame = requestAnimationFrame(() => {
      const target = container.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`);
      if (!target) return;
      const top = target.getBoundingClientRect().top - container.getBoundingClientRect().top;
      const furthest = Math.max(0, container.scrollHeight - container.clientHeight);
      container.scrollTop = Math.min(furthest, Math.max(0, container.scrollTop + top - 8));
      pendingRef.current = { anchor: id, at: container.scrollTop };
    });
    return () => cancelAnimationFrame(frame);
  }, [page]);

  // A term or prose row is a request to land on the words it names, not just on the lesson. A prose
  // row also carries its section anchor: the same word can appear earlier, so its paragraph is
  // looked for only between that heading and the next one. The page has to arrive first, then the
  // block is scrolled under the reader's eyes and outlined for a moment so the jump is visible.
  useEffect(() => {
    if (!page || page.path !== path || !focus?.focus || focus.id !== lessonId) return;
    const phrase = focus.focus.trim().toLowerCase();
    const container = scrollRef.current;
    const article = container?.querySelector<HTMLElement>('[data-testid="reader-prose"]');
    if (!phrase || !container || !article) return;
    let marked: HTMLElement | null = null;
    let timer = 0;
    const frame = requestAnimationFrame(() => {
      const matches = (node: HTMLElement) =>
        (node.textContent ?? '').replace(/\s+/g, ' ').toLowerCase().includes(phrase);
      let target: HTMLElement | undefined;
      const anchor = focus.focusAnchor?.trim();
      if (anchor) {
        // Module pages number their headings (`1. Why it matters`) while the prose index strips the
        // number, so an anchor can be the numbered form of the exact one the index knows.
        const heading =
          article.querySelector<HTMLElement>(`[data-reader-anchor="${CSS.escape(anchor)}"]`) ??
          Array.from(article.querySelectorAll<HTMLElement>('[data-reader-anchor]')).find((node) => {
            const value = node.dataset.readerAnchor ?? '';
            return /^\d+-/.test(value) && value.slice(value.indexOf('-') + 1) === anchor;
          });
        if (heading) {
          if (matches(heading)) target = heading;
          else {
            const headings = Array.from(article.querySelectorAll<HTMLElement>('h2, h3, h4'));
            const next = headings[headings.indexOf(heading) + 1];
            target = Array.from(
              article.querySelectorAll<HTMLElement>('[data-reader-block]')
            ).find((node) => {
              if (/^H[1-6]$/.test(node.tagName)) return false;
              if (!(heading.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)) {
                return false;
              }
              if (next && !(node.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING)) {
                return false;
              }
              return matches(node);
            });
          }
        }
      }
      if (!target) {
        // An anchored hit has to be in this scope. If its heading is absent (Read drops Learn),
        // ask once for the other preset and try again. On the retry the phrase fallback still
        // reaches a section whose heading is inside a collapsed reveal.
        if (anchor && focusMissed.current !== focus.nonce) {
          focusMissed.current = focus.nonce;
          onFocusMissRef.current?.();
          return;
        }
        const blocks = Array.from(article.children).filter(
          (node): node is HTMLElement => node instanceof HTMLElement
        );
        target =
          blocks.find((node) => !/^H[1-6]$/.test(node.tagName) && matches(node)) ??
          blocks.find(matches);
        if (!target && focusMissed.current !== focus.nonce) {
          focusMissed.current = focus.nonce;
          onFocusMissRef.current?.();
          return;
        }
      }
      if (!target) return;
      const reveal = target.closest('details');
      if (reveal && !reveal.open) reveal.open = true;
      const top = target.getBoundingClientRect().top - container.getBoundingClientRect().top;
      const furthest = Math.max(0, container.scrollHeight - container.clientHeight);
      container.scrollTop = Math.min(furthest, Math.max(0, container.scrollTop + top - 8));
      marked = target;
      target.style.outline = '2px solid var(--accent)';
      target.style.outlineOffset = '4px';
      target.style.borderRadius = '6px';
      timer = window.setTimeout(() => {
        target.style.outline = '';
        target.style.outlineOffset = '';
        target.style.borderRadius = '';
      }, 2400);
    });
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      if (marked) {
        marked.style.outline = '';
        marked.style.outlineOffset = '';
        marked.style.borderRadius = '';
      }
    };
  }, [page, path, focus, lessonId, scope]);

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
      saverRef.current?.saver.flush();
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
    saverFor(lessonId).remember(position);
  };

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
          height,
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
      setStickyPlacement({ top, left, width, side, caret, height });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    // The card can finish a line after the first measure (a font settles, focus paints the empty
    // editor's placeholder, KaTeX finishes a formula). An observer turns that growth into a fresh
    // placement; otherwise a note that grew by one line can overlap the words it is about.
    const card = stickyCardRef.current;
    const observer =
      typeof ResizeObserver !== 'undefined' && card ? new ResizeObserver(() => place()) : null;
    if (card && observer) observer.observe(card);
    const frame = requestAnimationFrame(place);
    // Opening the popover can restore a scroll or finish a focus layout a frame later; one settle
    // pass after that is what keeps an above-placed card clear of words that moved up under it.
    const settle = window.setTimeout(place, 120);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      observer?.disconnect();
      cancelAnimationFrame(frame);
      clearTimeout(settle);
    };
    // The first measurement can precede the last line of the card. Re-running on the measured
    // height turns that late growth into a second placement instead of a card that overlaps the
    // words it is about.
  }, [stickyOpen, stickyAnchor, stickyText, stickyQuote, stickyEditing, stickyPlacement?.height]);

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

  /**
   * The two mark keys, on the selection the reader is holding.
   *
   * ⌥N and ⌥H by default, rebindable in the shortcut sheet like the doors: the pair is answered by
   * the reader rather than by `App`, because only the reader knows which passage is selected. A
   * press inside a field or the editor is typing and is left alone, and with nothing selected the
   * keys do nothing at all instead of opening an empty note.
   */
  const keymap = useKeymap();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      )
        return;
      if (!selection) return;
      if (chordMatches(keymap.sticky, event)) {
        event.preventDefault();
        openStickyOnSelection();
        return;
      }
      if (chordMatches(keymap.highlight, event)) {
        event.preventDefault();
        pinSelection();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keymap, selection, lessonId]);

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
    // Read the editor itself, not only React state: a save can be pressed in the same task as the
    // last keystroke, and the DOM is the current truth. It is still Markdown, never rendered glyphs.
    const text = stickyRef.current?.getMarkdown() ?? stickyText;
    const saved = stickyEditing
      ? setComment(lessonId, stickyQuote, text)
      : addHighlight(lessonId, stickyQuote, text);
    if (!saved) {
      setStatus('Not saved — storage is blocked or full.');
      return;
    }
    window.getSelection()?.removeAllRanges();
    setSelection('');
    syncMarks();
    setStatus(
      stickyEditing
        ? text.trim()
          ? 'Sticky note updated.'
          : 'Sticky note cleared; the passage is still pinned.'
        : text.trim()
          ? 'Sticky note saved to Notes.'
          : 'Passage pinned to Notes.'
    );
    closeSticky();
  };

  const scrollToTop = () => {
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTop = 0;
    saverFor(lessonId).cancel();
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
        const isBridgeNotes = block.l === 3 && /^bridge notes$/i.test(inlinePlain(block.x));
        const heading = (
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
        // A Bridge Notes section ends a lesson by handing over to the next idea, which is the one
        // place an interactive earns its keep: the paragraph's own worked numbers, made draggable.
        // The page's payload names the visual (`block.v`), so a lesson without one is the heading it
        // always was, and the picture itself is a lazy chunk (`bridges/bridgeNotesVisual.tsx`).
        if (isBridgeNotes && block.v) {
          return (
            <React.Fragment key={key}>
              {heading}
              {/* The empty fallback is still a *state*: the section's text is on screen and the
                  picture is on its way. Hidden, so nothing moves, but in the DOM, so a harness that
                  compares a slow page with a fast one can tell "this lesson has no visual" from
                  "this lesson's visual has not arrived". */}
              <Suspense fallback={<LazyPending what="bridge-visual" />}>
                <BridgeNotesVisual name={block.v} />
              </Suspense>
            </React.Fragment>
          );
        }
        return heading;
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
      case 'anchor':
        // The page's own fragment (`micro-variables`). A heading gets an id from the generated slug;
        // an explicit anchor is the stable name a micro card can link to without guessing the slug.
        return (
          <span
            key={key}
            id={block.id}
            data-reader-anchor={block.id}
            data-reader-block={blockKey}
            className="block scroll-mt-3"
          />
        );
      case 'math':
        return (
          <div key={key} data-reader-block={blockKey} className="my-3 overflow-x-auto">
            <MathView math={block.tex} block />
          </div>
        );
      case 'figure':
        return (
          <div key={key} data-reader-block={blockKey}>
            <Suspense fallback={<LazyPending what="reader-figure" />}>
              <ReaderFigure id={block.id} caption={block.caption} live />
            </Suspense>
          </div>
        );
      case 'route':
        return (
          <div key={key} data-reader-block={blockKey}>
            <Suspense fallback={<LazyPending what="reader-figure" />}>
              <ReaderFigure
                id="route"
                live
                spec={{
                  kind: 'route',
                  title: 'Where this lesson goes',
                  caption: block.caption ?? ROUTE_CAPTION,
                  steps: block.steps,
                }}
              />
            </Suspense>
          </div>
        );
      case 'graph':
        return (
          <div key={key} data-reader-block={blockKey}>
            <Suspense fallback={<LazyPending what="reader-figure" />}>
              <ReaderFigure
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
            </Suspense>
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

  /**
   * One micro-focus, with the same picture the Micro-learning tab draws.
   *
   * The page already separates each focus with an h4 and a stable `micro-*` anchor. The reader groups
   * that heading, anchor and first paragraph so the visual can sit beside the prose instead of
   * becoming a full-width interruption at every width. Side placement starts at `xl`, where the pane
   * has room for both columns; below that the scene takes the full reader width, before the paragraph
   * for a side scene and after it for a bottom one. `flow-root` contains the float, and `space-y-3`
   * keeps the article's rhythm inside the group (the explicit anchor must stay a paragraph-gap below
   * its heading, or the reading-position recorder picks the anchor instead of the heading).
   */
  const renderMicroSection = (
    heading: Extract<ReaderBlock, { t: 'h' }>,
    anchor: Extract<ReaderBlock, { t: 'anchor' }>,
    paragraph: Extract<ReaderBlock, { t: 'p' }>,
    conceptId: string,
    placement: 'left' | 'right' | 'bottom',
    key: string
  ) => {
    const visual = (
      <div
        data-testid={`reader-micro-visual-${conceptId}`}
        data-micro-concept={conceptId}
        data-micro-placement={placement}
        className={
          placement === 'bottom'
            ? 'mt-2'
            : `mb-2 mt-1 xl:w-[17.5rem] ${
                placement === 'left' ? 'xl:float-left xl:mr-4' : 'xl:float-right xl:ml-4'
              }`
        }
      >
        <Suspense fallback={<LazyPending what="micro-visual" />}>
          <MicroVisual conceptId={conceptId} placement={placement} sticky={false} />
        </Suspense>
      </div>
    );
    return (
      <section key={key} data-testid={`reader-micro-${conceptId}`} className="flow-root space-y-3">
        {renderBlock(heading, `${key}.heading`)}
        {renderBlock(anchor, `${key}.anchor`)}
        {placement === 'bottom' ? (
          <>
            {renderBlock(paragraph, `${key}.text`)}
            {visual}
          </>
        ) : (
          <>
            {visual}
            {renderBlock(paragraph, `${key}.text`)}
          </>
        )}
      </section>
    );
  };

  /**
   * The page blocks, with a micro focus promoted to one illustration-plus-text section.
   *
   * A concept with no designed scene (`micro-unsigned` is the page's own extra focus) is left as the
   * heading, anchor and paragraph it was; the reader never borrows another concept's picture.
   */
  const renderReaderBlocks = (blocks: ReaderBlock[], prefix: string): React.ReactNode[] => {
    const nodes: React.ReactNode[] = [];
    for (let index = 0; index < blocks.length; index += 1) {
      const heading = blocks[index];
      const anchor = blocks[index + 1];
      const paragraph = blocks[index + 2];
      if (
        heading?.t === 'h' &&
        heading.l === 4 &&
        anchor?.t === 'anchor' &&
        anchor.id.startsWith('micro-') &&
        paragraph?.t === 'p'
      ) {
        const conceptId = anchor.id.slice('micro-'.length);
        const placement = visualPlacementForConcept(conceptId);
        if (placement && hasConceptVisual(conceptId)) {
          nodes.push(renderMicroSection(heading, anchor, paragraph, conceptId, placement, `${prefix}${index}`));
          index += 2;
          continue;
        }
      }
      nodes.push(renderBlock(blocks[index], `${prefix}${index}`));
    }
    return nodes;
  };

  return (
    <>
    <section
      data-testid="lesson-reader"
      data-reader-path={path}
      data-reader-hidden={hidden || collapsed || undefined}
      // `min-w-0` is what keeps a long code line inside the pane's own scroller: as a flex child
      // the default `min-width: auto` lets its widest `<pre>` widen the whole work area instead.
      className="group/reader flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-[var(--shadow-sm)]"
      style={{ display: hidden || collapsed ? 'none' : undefined }}
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
            title={SPLIT_TIP}
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
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            data-testid="btn-hide-lesson"
            aria-label="Hide the lesson text"
            title="Hide the lesson text and give the work area the full width"
            className="flex items-center gap-1 rounded border border-line-soft bg-canvas px-2 py-1 text-[11px] font-mono text-muted opacity-0 transition-opacity hover:text-ink focus-visible:opacity-100 group-hover/reader:opacity-100 group-focus-within/reader:opacity-100"
          >
            <EyeOff className="h-3 w-3" aria-hidden="true" />
            <span className="hidden xl:inline">Hide lesson</span>
          </button>
        </div>
      </div>

      {panel}

      {splitTip && (
        <p
          data-testid="reader-split-tip"
          className="border-b border-line-soft bg-canvas px-3 py-1.5 text-[12px] leading-snug text-muted"
        >
          {SPLIT_TIP}
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
        {showClock && scope === 'study' && <StudyClockReminder lessonId={lessonId} />}

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
            {renderReaderBlocks(blocksForScope(page.blocks, scope), 'b')}
            {unlocated.length > 0 && (
              <p
                data-testid="sticky-note-unlocated"
                title={`Not on this text any more: ${unlocated.map((quote) => `“${quote}”`).join(' · ')}`}
                className="cursor-help rounded border border-amber/40 bg-amber/10 px-2 py-1 font-mono text-[11px] leading-snug text-amber"
              >
                {unlocated.length} note{unlocated.length === 1 ? '' : 's'} not on this text:{' '}
                {unlocated.map((quote) => `“${quote.length > 48 ? `${quote.slice(0, 45)}…` : quote}”`).join(' · ')}
              </p>
            )}
          </article>
        )}
      </div>

      {(continueAction || backAction) && (
        <div
          data-testid="reader-continue"
          className={`flex px-3 pt-3 pb-1 ${backAction ? 'justify-between gap-2' : 'justify-end'}`}
        >
          {backAction && (
            <button
              type="button"
              data-testid="btn-reader-back"
              onClick={backAction.onClick}
              title={backAction.title}
              className="group flex cursor-pointer items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1.5 font-mono text-[12px] text-muted transition-colors hover:border-accent/60 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <ArrowLeft
                className="h-3 w-3 transition-transform group-hover:-translate-x-0.5"
                aria-hidden="true"
              />
              {backAction.label}
            </button>
          )}
          {continueAction && (
            <button
              type="button"
              data-testid="btn-reader-continue"
              onClick={continueAction.onClick}
              title={continueAction.title}
              className="group ml-auto flex cursor-pointer items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1.5 font-mono text-[12px] text-muted transition-colors hover:border-accent/60 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {continueAction.label}
              <ArrowRight
                className="h-3 w-3 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </button>
          )}
        </div>
      )}

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
                {/* The surface itself is the rendering: a `$…$` becomes its formula and a
                    completed `**…**` becomes bold where it is typed. The stored note is still the
                    Markdown a review card or an export reads. */}
                <div className="flex items-center gap-1" data-testid="sticky-format-bar">
                  {[
                    { style: 'bold' as const, label: 'Bold', hint: 'Bold (⌘B / Ctrl+B) — drawn bold in the note', id: 'btn-sticky-bold', Icon: Bold },
                    { style: 'italic' as const, label: 'Italic', hint: 'Italic (⌘I / Ctrl+I) — drawn italic in the note', id: 'btn-sticky-italic', Icon: Italic },
                    { style: 'underline' as const, label: 'Underline', hint: 'Underline (⌘U / Ctrl+U) — drawn underlined in the note', id: 'btn-sticky-underline', Icon: Underline },
                    { style: 'math' as const, label: 'Maths', hint: 'Inline maths: select a formula, or type $…$, and it renders in this note', id: 'btn-sticky-math', Icon: Sigma },
                  ].map(({ style, label, hint, id, Icon }) => (
                    <button
                      key={id}
                      type="button"
                      data-testid={id}
                      aria-label={label}
                      title={hint}
                      // Keep the selection in the editor: a press that moves focus first would wrap
                      // nothing, which is the one way a Bold button can look broken.
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => stickyRef.current?.applyStyle(style)}
                      className="btn px-1.5 py-1"
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  ))}
                  <span className="ml-1 font-mono text-[10.5px]" style={{ color: 'var(--dim)' }}>
                    Markdown stored · <span title="$…$ renders in place">$…$</span> renders here
                  </span>
                </div>
                <StickyNoteEditor
                  key={stickyEditing ? `edit:${stickyQuote}` : 'new'}
                  ref={stickyRef}
                  initialMarkdown={stickyText}
                  maxLength={MAX_COMMENT_CHARS}
                  onChange={setStickyText}
                  onEscape={closeSticky}
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10.5px]" style={{ color: 'var(--dim)' }}>
                    {stickyText.length}/{MAX_COMMENT_CHARS} · Markdown saved in Notes
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
      {collapsed && !hidden && (
        <div className="fixed right-0 top-1/3 z-30 -translate-y-1/2">
          <button
            type="button"
            data-testid="btn-show-lesson"
            onClick={() => setCollapsed(false)}
            aria-label="Show the lesson text"
            title="Show the lesson text"
            className="flex h-24 w-8 translate-x-6 flex-col items-center justify-center gap-1 rounded-l-lg border border-r-0 border-line bg-panel/95 text-muted opacity-0 shadow-lg backdrop-blur transition-all hover:translate-x-0 hover:text-accent hover:opacity-100 focus-visible:translate-x-0 focus-visible:opacity-100"
          >
            <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="[writing-mode:vertical-rl] font-mono text-[10px] uppercase tracking-[0.14em]">
              Lesson
            </span>
          </button>
        </div>
      )}
    </>
  );
}
