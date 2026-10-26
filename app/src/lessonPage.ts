/**
 * The lesson text the reader renders (`app/src/lessonPage.ts`).
 *
 * The payloads are generated at build time by `scripts/generate_lesson_pages.py` from the same
 * Markdown the pages ship, one file per page, served beside the bundle and fetched the first time a
 * lesson is opened. They are **not** imported by the app: 92 pages of prose is 1.8 MB, and a visit
 * should pay for the lesson it reads and nothing else.
 *
 * The format is deliberately a small block list rather than HTML. The renderer is React and the
 * maths is the same KaTeX every other tab uses, so a payload of blocks cannot smuggle markup into
 * the page, and a block this build does not know is refused instead of painted raw.
 */

/**
 * The payload shape this build reads.
 *
 * Bumped to 2 when `figure` blocks arrived: a service worker can serve an older app beside a newer
 * payload (or the reverse), and `isLessonPage` refusing a version it does not know is what turns that
 * into "the lesson text is in a format this build cannot read" instead of a pane that renders half a
 * page. Version 1 payloads are refused rather than guessed at, because a figure-less page and a page
 * whose figures were dropped look identical once the blocks are filtered.
 *
 * Bumped to 3 when `route` blocks arrived (the page's own Mermaid `flowchart`, drawn as numbered
 * steps). Same rule: a version 2 payload has no route and a version 3 one whose routes were dropped
 * look identical once blocks are filtered, so the shape is named rather than guessed.
 */
export const LESSON_PAGE_VERSION = 3;

export type ReaderCodeLanguage = string;

export type ReaderBlock =
  | { t: 'h'; l: number; x: string }
  | { t: 'p'; x: string }
  | { t: 'ul' | 'ol'; items: { x: string; d: number }[] }
  | { t: 'code'; lang: ReaderCodeLanguage; text: string }
  | { t: 'table'; head: string[]; rows: string[][] }
  | { t: 'quote'; x: string }
  | { t: 'math'; tex: string }
  | { t: 'img'; src: string; alt: string }
  /**
   * A named picture from `visuals/scenes.ts`. The payload carries the id and an optional caption;
   * the drawing is the app's, so a figure can move, be restyled or be replaced without touching a
   * lesson's Markdown — and an id this build does not know is visible as a missing figure, never a
   * blank space where a diagram should be.
   */
  | { t: 'figure'; id: string; caption: string }
  /**
   * The page's own route: its Mermaid `flowchart` when it is a single chain, already flattened into
   * ordered steps. Drawn vertically (`Diagram`'s `route` kind), because the labels are page titles.
   */
  | { t: 'route'; steps: string[]; caption?: string };

export interface LessonPage {
  v: number;
  /** The Markdown page it was generated from, relative to the repository root. */
  path: string;
  title: string;
  blocks: ReaderBlock[];
}

function isText(value: unknown): value is string {
  return typeof value === 'string';
}

function isBlock(value: unknown): value is ReaderBlock {
  if (!value || typeof value !== 'object') return false;
  const block = value as Record<string, unknown>;
  switch (block.t) {
    case 'h':
      return Number.isInteger(block.l) && Number(block.l) >= 1 && Number(block.l) <= 6 && isText(block.x);
    case 'p':
    case 'quote':
      return isText(block.x);
    case 'math':
      return isText(block.tex);
    case 'ul':
    case 'ol':
      return (
        Array.isArray(block.items) &&
        block.items.length > 0 &&
        block.items.every(
          (item) =>
            !!item &&
            typeof item === 'object' &&
            isText((item as { x?: unknown }).x) &&
            Number.isInteger((item as { d?: unknown }).d) &&
            Number((item as { d?: unknown }).d) >= 0
        )
      );
    case 'code':
      return isText(block.lang) && isText(block.text);
    case 'table':
      return (
        Array.isArray(block.head) &&
        block.head.every(isText) &&
        Array.isArray(block.rows) &&
        block.rows.every((row) => Array.isArray(row) && row.every(isText))
      );
    case 'img':
      return isText(block.src) && isText(block.alt);
    case 'figure':
      return isText(block.id) && /^[a-z0-9][a-z0-9-]*$/.test(block.id) && isText(block.caption);
    case 'route':
      return (
        Array.isArray(block.steps) &&
        block.steps.length >= 2 &&
        block.steps.every((step) => isText(step) && step.trim().length > 0)
      );
    default:
      return false;
  }
}

/** A payload this build can render: the version it knows, and every block of a type it has. */
export function isLessonPage(value: unknown): value is LessonPage {
  if (!value || typeof value !== 'object') return false;
  const page = value as Record<string, unknown>;
  return (
    page.v === LESSON_PAGE_VERSION &&
    isText(page.path) &&
    isText(page.title) &&
    Array.isArray(page.blocks) &&
    page.blocks.every(isBlock)
  );
}

/**
 * Where a page's payload is served.
 *
 * `BASE_URL`, not `document.baseURI`: the file sits beside the built assets, so it moves with the
 * same base they do (`/Mechatronics-Roadmap/` on Pages, `/` in development). `import.meta.env` is
 * read at call time so the unit suite can import this module under
 * `node --experimental-strip-types`, where no bundler replaces it.
 */
export function lessonPageUrl(path: string): string {
  const env = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env;
  const file = path.replace(/\.md$/, '.json').replace(/^\/+/, '');
  return `${env?.BASE_URL ?? '/'}lesson-pages/${file}`;
}

const cache = new Map<string, Promise<LessonPage>>();

/** Forget every fetched page. The suite's door; a visit never needs it. */
export function clearLessonPageCache(): void {
  cache.clear();
}

/**
 * Fetch one page's payload, once.
 *
 * A failed fetch is forgotten rather than cached, so pressing Retry after a dropped connection
 * tries again; two panes asking for the same lesson share one request. A 200 whose body is not a
 * payload (an SPA fallback serving `index.html`) is a failure too, because painting the document
 * into the pane is worse than saying the text could not be loaded.
 */
export function loadLessonPage(
  path: string,
  options: { fetch?: typeof fetch } = {}
): Promise<LessonPage> {
  const key = path;
  const hit = cache.get(key);
  if (hit) return hit;

  const attempt = (async (): Promise<LessonPage> => {
    const fetcher = options.fetch ?? (typeof fetch === 'function' ? fetch : null);
    if (!fetcher) throw new Error('this browser cannot fetch the lesson text');
    const response = await fetcher(lessonPageUrl(path));
    if (!response.ok) throw new Error(`the lesson text answered ${response.status}`);
    const contentType = response.headers?.get?.('content-type') ?? '';
    if (contentType.includes('text/html')) throw new Error('the lesson text was not found');
    const payload: unknown = await response.json();
    if (!isLessonPage(payload)) throw new Error('the lesson text is in a format this build cannot read');
    return payload;
  })();

  // The map holds the pending promise, so a second pane does not start a second request; a failure
  // removes it so the next attempt is a real one.
  const guarded = attempt.catch((error: unknown) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, guarded);
  return guarded;
}
