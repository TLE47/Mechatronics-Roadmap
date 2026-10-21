/**
 * The command palette's catalogue and its search, without React.
 *
 * `⌘K` is only useful if the list it opens contains everything a learner can reach: all 48
 * lessons and exercises, the eleven workbench tabs, and the handful of actions that otherwise hide
 * in the header or a modal. Those three kinds are built here from the same registries the UI reads,
 * so a new lesson appears in the palette the moment it appears in the runner - nothing to add twice.
 *
 * Search is deliberately tiny and predictable: a plain prefix/word-start/substring match, falling
 * back to an in-order subsequence (`pyrun` finds "Python runner"). Scores are integers so the order
 * of equally good matches is the catalogue's order, never the engine's.
 */

export type PaletteKind = 'lesson' | 'tab' | 'action';

export interface PaletteItem {
  /** Stable and unique: `lesson-P.1`, `tab-tab-pyodide`, `action-toggle-theme`. */
  id: string;
  kind: PaletteKind;
  label: string;
  /** The second line: a lesson's track, a tab's plain-English subtitle, an action's shortcut. */
  detail?: string;
  /** Extra words that should find this item without appearing in its label. */
  keywords?: string;
}

export interface PaletteMatch {
  item: PaletteItem;
  score: number;
}

const KIND_LABELS: Record<PaletteKind, string> = {
  lesson: 'Lesson',
  tab: 'Tab',
  action: 'Command',
};

export function paletteKindLabel(kind: PaletteKind): string {
  return KIND_LABELS[kind];
}

/** The order the groups are drawn in: where you can go, then what you can do. */
export const PALETTE_KIND_ORDER: PaletteKind[] = ['lesson', 'tab', 'action'];

/**
 * An in-order subsequence score, for queries that skip letters (`pyrun`).
 *
 * Gaps cost far more than a later start, so "p**y**thon **run**ner" still beats a label that just
 * happens to contain the letters scattered across three words.
 */
function subsequenceScore(haystack: string, query: string): number | null {
  let cursor = 0;
  let gaps = 0;
  let lastHit = -1;
  for (const char of query) {
    const hit = haystack.indexOf(char, cursor);
    if (hit === -1) return null;
    if (lastHit >= 0) gaps += hit - lastHit - 1;
    lastHit = hit;
    cursor = hit + 1;
  }
  return Math.max(1, 300 - gaps * 4 - lastHit);
}

/**
 * How well one field matches, or null when it does not.
 *
 * 1000 band: the label starts with the query as a whole word (`P.1` is `P.1 · ...`, not `P.10`).
 *  940 band: the label starts with the query mid-token (`P.1` is the start of `P.10`).
 *  800 band: a word inside the label starts with the query.
 *  600 band: the query appears later in the field.
 *  300 band: the letters appear in order.
 * Earlier matches win inside a band; `-length` is a small tie-break toward shorter labels.
 */
function fieldScore(text: string, query: string): number | null {
  const haystack = text.toLowerCase();
  if (!haystack) return null;
  const direct = haystack.indexOf(query);
  if (direct === 0) {
    // A prefix that ends on a word boundary is what the learner typed; one that continues a token
    // (`P.1` inside `P.10`) is a coincidence of numbering and must rank below the exact entry.
    const endsToken = haystack.length === query.length || /[\s\-_/.(·:]/.test(haystack[query.length]);
    return (endsToken ? 1000 : 940) - haystack.length;
  }
  if (direct > 0) {
    const boundary = /[\s\-_/.(]/;
    const atWordStart = boundary.test(haystack[direct - 1]);
    return (atWordStart ? 800 : 600) - direct;
  }
  return subsequenceScore(haystack, query);
}

/** A label match outranks a keyword match, and a detail match is weaker than both. */
function itemScore(item: PaletteItem, query: string): number | null {
  const label = fieldScore(item.label, query);
  const keywords = item.keywords ? fieldScore(item.keywords, query) : null;
  const detail = item.detail ? fieldScore(item.detail, query) : null;
  const scores = [
    label === null ? null : label,
    keywords === null ? null : keywords - 50,
    detail === null ? null : detail - 120,
  ].filter((score): score is number => score !== null);
  if (!scores.length) return null;
  return Math.max(...scores);
}

/**
 * The catalogue filtered and ordered for one query.
 *
 * An empty query returns the catalogue as given: the palette then reads as a table of contents
 * rather than a ranked guess about what the learner meant. `limit` bounds the DOM, not the search.
 */
export function rankPalette(items: PaletteItem[], query: string, limit = 200): PaletteMatch[] {
  const wanted = query.trim().toLowerCase();
  if (!wanted) {
    return items.slice(0, limit).map((item) => ({ item, score: 0 }));
  }
  const matches: PaletteMatch[] = [];
  items.forEach((item) => {
    const score = itemScore(item, wanted);
    if (score !== null) matches.push({ item, score });
  });
  // Array.prototype.sort is stable in every engine this ships to, so equal scores keep catalogue
  // order: lessons stay in course order, tabs stay in rail order, actions stay in reading order.
  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, limit);
}

/** Matches split into the groups the palette draws, in `PALETTE_KIND_ORDER`, empty groups dropped. */
export function groupPalette(matches: PaletteMatch[]): { kind: PaletteKind; matches: PaletteMatch[] }[] {
  return PALETTE_KIND_ORDER.map((kind) => ({
    kind,
    matches: matches.filter((match) => match.item.kind === kind),
  })).filter((group) => group.matches.length > 0);
}

/** The lesson id behind a lesson item, or null for tabs and commands. */
export function lessonIdOf(item: PaletteItem): string | null {
  return item.kind === 'lesson' && item.id.startsWith('lesson-') ? item.id.slice('lesson-'.length) : null;
}
