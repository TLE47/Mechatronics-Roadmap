/**
 * Searching the course's reading pages (`⌘⇧F`, `app/src/proseSearch.ts`).
 *
 * `lessonSearch.ts` reads the text the app already carries: the starter, the hint ladder, the
 * instructor's checks and the expected output. The 66 reading pages — 49 prose lessons and the 17
 * arm modules — are Markdown in the repository, and Pages serves only the built app, so their words
 * are not in the bundle at all. A learner who half-remembers "the page with the anti-windup
 * clamping" could find the lesson by its *name* and could not find the page by a word in its body.
 *
 * This module is the other half. `scripts/generate_prose_index.py` writes the searchable text of
 * those pages to `app/public/prose-index.json` (code fences and tables left out, generated callouts
 * stripped), and the app fetches that file **the first time `⌘⇧F` is opened** — never on a normal
 * visit, and the service worker keeps it after that. 202 kB gzipped for the whole course's prose is
 * a fetch a learner pays once, on purpose, and `npm run check:weight` budgets it as its own metric.
 *
 * Two rules shape the answer:
 *
 * - **A row names its section, and opens the page there.** The index is one entry per heading, so a
 *   hit is not "somewhere in 05.1": it is `§ Integrator anti-windup`, and the anchor is GitHub's
 *   own slug for that heading (`githubSlug` below, including the `-1` suffix a repeated heading
 *   gets). A page with no heading to jump to opens at the top.
 * - **Headings outrank bodies.** A learner typing `encoder` wants the page whose section is called
 *   that before a paragraph that happens to say the word, so a heading hit scores above every body
 *   hit and only the best two sections of one page are kept: a page that says a word forty times is
 *   one page, not forty rows.
 */

// Explicit `.ts` extensions so `node --experimental-strip-types` can import this module directly:
// `scripts/test_prose_search.mjs` runs the search without a bundler, the way `test_lesson_search`
// runs `lessonSearch.ts`.
import { pageUrl } from './pageUrl.ts';
import type { PaletteItem } from './palette.ts';

/** One heading of a page and the prose under it, one paragraph per line. */
export interface ProseSection {
  /** The heading text, without `##`; empty for the paragraph before a page's first subheading. */
  h: string;
  t: string;
}

/** One reading page, as the generator wrote it. */
export interface ProsePage {
  /** The page's own id — `05.1` for a lesson, `05-control.T1.05a` for an arm module. */
  id: string;
  /** The repository path, which is also what the GitHub link and the reading copy share. */
  path: string;
  title: string;
  sections: ProseSection[];
}

export interface ProseHit {
  pageId: string;
  path: string;
  title: string;
  /** The section's heading; empty when the match is before the first one. */
  heading: string;
  /** The section's position in the page, so two hits in one page get distinct row ids. */
  section: number;
  /** GitHub's anchor for that heading, ready for a `#`; empty when there is none. */
  anchor: string;
  /** The matched line, shortened around the match, or the section's first line for a heading hit. */
  snippet: string;
  score: number;
}

/** One letter is in every page, so a query needs two before it is a search. */
export const MIN_PROSE_QUERY = 2;
/** Two sections of one page answer "is this the right page?"; more is the same page again. */
export const MAX_PROSE_HITS_PER_PAGE = 2;
/** The prose share of the palette list, so the whole course cannot bury the lesson hits. */
export const MAX_PROSE_HITS = 15;
/** The schema this reader understands. A different number is not a file to guess at. */
export const PROSE_INDEX_VERSION = 1;
/** A heading hit beats a body hit of any page; the constants keep the bands apart at a glance. */
const HEADING_SCORE = 1000;
const BODY_SCORE = 500;

/**
 * GitHub's heading anchor, which is `github-slugger`'s rule: lower-case, keep letters, numbers,
 * marks, connector punctuation (`_`), hyphens and spaces, then turn the spaces into hyphens.
 *
 * Everything else goes, including `.`, `/`, `(` and em dashes — so `## Idea 1: PD control (K_p)`
 * becomes `idea-1-pd-control-k_p`, and a heading with two spaces left by punctuation keeps two
 * hyphens. That is not a tidier slug than GitHub's; it is the one GitHub answers to.
 */
export function githubSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\p{M}\p{Pc}\- ]/gu, '')
    .replace(/ /g, '-');
}

/**
 * Every section's anchor, in order, with the suffix GitHub adds to a repeated heading.
 *
 * `github-slugger` numbers the *second* occurrence `-1`, not `-2`: the first heading owns the bare
 * slug, and each later copy takes the next number. A page that repeats `## Summary` therefore has
 * `#summary` and `#summary-1`, and the anchor is computed from the headings before it rather than
 * from the text alone, which is why this is a function over the list.
 */
export function sectionAnchors(sections: { h: string }[]): string[] {
  const seen = new Map<string, number>();
  return sections.map(({ h }) => {
    const base = githubSlug(h);
    const count = seen.get(base);
    if (count === undefined) {
      seen.set(base, 0);
      return base;
    }
    const next = count + 1;
    seen.set(base, next);
    return `${base}-${next}`;
  });
}

/** The page on GitHub, at one of its sections when the anchor is known. */
export function prosePageUrl(path: string, anchor?: string): string {
  return pageUrl(path, anchor || undefined);
}

/** A line as a snippet: one line, trimmed, with an ellipsis only where text was actually cut. */
function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/**
 * The matched line, with ~100 characters of context and the match kept whole.
 *
 * Cut from a window centred on the match rather than from the front: the word a learner typed is
 * the part they need to see, and a snippet that started 300 characters earlier would not contain it.
 */
function snippetAround(line: string, wanted: string, max = 104): string {
  const text = line.replace(/\s+/g, ' ').trim();
  const at = text.toLowerCase().indexOf(wanted);
  if (at < 0) return clip(text, max);
  const room = Math.max(0, max - wanted.length);
  const start = Math.max(0, at - Math.floor(room / 2));
  const end = Math.min(text.length, start + max);
  const body = text.slice(start, end).trim();
  return `${start > 0 ? '…' : ''}${body}${end < text.length ? '…' : ''}`;
}

/** Is the match at `at` the start of a word, rather than the middle of one? */
function startsWord(text: string, at: number): boolean {
  if (at === 0) return true;
  return !/[\p{L}\p{N}]/u.test(text[at - 1]);
}

/**
 * Every hit for one query, best first.
 *
 * The course order is the tie-break (the sort is stable and the pages are visited in route order),
 * so two equally good body hits read in the order the learner will meet them. Nothing here searches
 * code: the index does not carry it, by design — a code hit in the runner is a line the editor can
 * put the caret on, and a fenced block on a reading page is not.
 */
export function searchProse(
  query: string,
  pages: ProsePage[],
  options: { perPage?: number; limit?: number } = {}
): ProseHit[] {
  const wanted = query.trim().toLowerCase();
  if (wanted.length < MIN_PROSE_QUERY) return [];
  const perPage = Math.max(1, options.perPage ?? MAX_PROSE_HITS_PER_PAGE);
  const limit = Math.max(1, options.limit ?? MAX_PROSE_HITS);

  const hits: ProseHit[] = [];
  for (const page of pages) {
    const anchors = sectionAnchors(page.sections);
    const found: ProseHit[] = [];
    page.sections.forEach((section, sectionIndex) => {
      const heading = section.h.toLowerCase();
      const base = {
        pageId: page.id,
        path: page.path,
        title: page.title,
        heading: section.h,
        section: sectionIndex,
        anchor: anchors[sectionIndex],
      };
      const inHeading = heading ? heading.indexOf(wanted) : -1;
      if (inHeading >= 0) {
        const firstLine = section.t.split('\n')[0] ?? '';
        found.push({
          ...base,
          snippet: clip(firstLine, 100),
          score: HEADING_SCORE + (startsWord(heading, inHeading) ? 40 : 0) - sectionIndex,
        });
        return;
      }
      const line = section.t.split('\n').find((text) => text.toLowerCase().includes(wanted));
      if (line === undefined) return;
      found.push({ ...base, snippet: snippetAround(line, wanted), score: BODY_SCORE - sectionIndex });
    });
    found.sort((left, right) => right.score - left.score);
    hits.push(...found.slice(0, perPage));
  }
  hits.sort((left, right) => right.score - left.score);
  return hits.slice(0, limit);
}

/**
 * The same hits as palette rows.
 *
 * The detail names the section first: two hits on one page are told apart by where they are, not by
 * which page they are on, and the trailing `GitHub ↗` says the row leaves the workbench (the runner
 * stays open underneath, in its own tab).
 */
export function proseSearchItems(query: string, pages: ProsePage[]): PaletteItem[] {
  return searchProse(query, pages).map((hit) => ({
    id: `prose-${hit.pageId}-${hit.section}`,
    kind: 'page',
    label: `${hit.pageId} · ${hit.title}`,
    detail: `${hit.heading ? `§ ${hit.heading} — ` : ''}${hit.snippet} · GitHub ↗`,
    href: prosePageUrl(hit.path, hit.anchor),
  }));
}

/**
 * The file as pages, or null when it is not the file this build understands.
 *
 * A malformed entry is dropped rather than the file refused: one page with a bad field should cost
 * that page's hits, not the whole search. A file with no usable page at all is null, so the palette
 * can say the pages are unavailable instead of showing a search that quietly returns nothing.
 */
export function readProseIndex(raw: unknown): ProsePage[] | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as { v?: unknown; pages?: unknown };
  if (data.v !== PROSE_INDEX_VERSION || !Array.isArray(data.pages)) return null;
  const pages: ProsePage[] = [];
  for (const entry of data.pages) {
    if (!entry || typeof entry !== 'object') continue;
    const candidate = entry as { id?: unknown; path?: unknown; title?: unknown; sections?: unknown };
    if (typeof candidate.id !== 'string' || !candidate.id) continue;
    if (typeof candidate.path !== 'string' || !candidate.path) continue;
    if (typeof candidate.title !== 'string' || !candidate.title) continue;
    if (!Array.isArray(candidate.sections)) continue;
    const sections: ProseSection[] = [];
    for (const section of candidate.sections) {
      if (!section || typeof section !== 'object') continue;
      const { h, t } = section as { h?: unknown; t?: unknown };
      if (typeof h !== 'string' || typeof t !== 'string') continue;
      sections.push({ h, t });
    }
    if (!sections.length) continue;
    pages.push({
      id: candidate.id,
      path: candidate.path,
      title: candidate.title,
      sections,
    });
  }
  return pages.length ? pages : null;
}

let cached: Promise<ProsePage[] | null> | null = null;

/**
 * Where the index is served.
 *
 * Vite's `BASE_URL`, not `document.baseURI`: the file lives beside the built assets, so it moves
 * with the same base they do — `/Mechatronics-Roadmap/` on Pages, `/` in development. The document's
 * own URL is not that base: a local server can serve the app at a path the build does not know
 * about (this repository's own browser suite does exactly that), and a relative fetch from it then
 * asks for a file that does not exist and gets the SPA fallback's HTML with a 200. `import.meta.env`
 * is read at call time, not at import time, so `node --experimental-strip-types` can import this
 * module for the unit suite, where there is no bundler to replace it.
 */
function proseIndexUrl(): string {
  const env = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env;
  return `${env?.BASE_URL ?? '/'}prose-index.json`;
}

/**
 * Fetch the index once, and answer from memory after that.
 *
 * A failed fetch is forgotten, so reopening the palette tries again: a learner who opened `⌘⇧F` on
 * a train and later has signal gets the pages without a reload. A response that is HTML rather
 * than the index is a failure too — `readProseIndex` refuses it — because a 200 from an SPA
 * fallback is not the file.
 */
export function loadProseIndex(): Promise<ProsePage[] | null> {
  if (cached) return cached;
  const attempt = (async (): Promise<ProsePage[] | null> => {
    if (typeof document === 'undefined' || typeof fetch !== 'function') return null;
    try {
      const response = await fetch(proseIndexUrl());
      if (!response.ok) return null;
      const type = response.headers.get('content-type') ?? '';
      if (type.includes('text/html')) return null;
      return readProseIndex(await response.json());
    } catch {
      return null;
    }
  })().then((pages) => {
    if (!pages) cached = null;
    return pages;
  });
  cached = attempt;
  return attempt;
}
