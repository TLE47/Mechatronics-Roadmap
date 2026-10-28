/**
 * Inline Markdown, and the anchors a heading gets (`app/src/readerMarkdown.ts`).
 *
 * The block structure is parsed once, at build time (`scripts/generate_lesson_pages.py`). Emphasis,
 * code spans, links and `$…$` maths are left as text in the payload and parsed here, because they
 * are about *rendering* rather than structure — and because doing it once in TypeScript means the
 * generator never grows a second, weaker Markdown implementation.
 *
 * The anchor rule is `proseSearch.ts`'s, not a second one: `githubSlug` is what GitHub answers to,
 * so the reader's `#goal` and the "View source" link's `#goal` are the same anchor, and a reading
 * position stored against a heading still lands on that heading after a reload.
 */

// The extension is explicit so `node --experimental-strip-types` resolves it for `test:reader`;
// Vite accepts the same specifier, and `allowImportingTsExtensions` is on for this reason.
import { githubSlug, sectionAnchors } from './proseSearch.ts';
import type { ReaderBlock } from './lessonPage';

export type InlineRun =
  | { k: 'text'; v: string }
  | { k: 'code'; v: string }
  | { k: 'strong'; v: string }
  | { k: 'em'; v: string }
  | { k: 'u'; v: string }
  | { k: 'link'; href: string; v: string }
  | { k: 'math'; v: string };

/**
 * One line of Markdown as runs the renderer can draw.
 *
 * Links and emphasis keep their label's **raw** Markdown, because a label can hold code
 * (`` [`x`](…) ``) and the renderer parses it again; `inlinePlain` is the one that flattens a label
 * for a slug or a title. An unmatched delimiter stays literal text: `2 * 3` is arithmetic, not an
 * unclosed emphasis, and `$5 and $6` is money.
 */
/**
 * A link starting at `offset`, with balanced parentheses in its URL.
 *
 * `[a](https://x/a_(b))` is a real link to a page whose name holds a parenthesis; the naive
 * `\([^)]+\)` stops at the first `)` and leaves the rest of the URL in the sentence as text.
 */
function linkAt(rest: string, offset = 0): { label: string; href: string; length: number } | null {
  if (rest[offset] !== '[') return null;
  const close = rest.indexOf('](', offset + 1);
  if (close < 0) return null;
  const label = rest.slice(offset + 1, close);
  if (label.includes('\n')) return null;
  let depth = 1;
  let index = close + 2;
  for (; index < rest.length; index += 1) {
    const char = rest[index];
    if (char === '\n') return null;
    if (char === '(') depth += 1;
    else if (char === ')') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  if (depth !== 0) return null;
  // A link title (`url "why"`) is not part of the URL the browser opens.
  const href = rest.slice(close + 2, index).trim().split(/\s+/)[0] ?? '';
  if (!href) return null;
  return { label, href, length: index + 1 - offset };
}

export function parseInline(text: string): InlineRun[] {
  const runs: InlineRun[] = [];
  let buffer = '';

  const flush = () => {
    if (buffer) {
      runs.push({ k: 'text', v: buffer });
      buffer = '';
    }
  };

  let index = 0;
  while (index < text.length) {
    const rest = text.slice(index);

    const escaped = /^\\([\\`*_{}[\]()#+\-.!$>])/.exec(rest);
    if (escaped) {
      buffer += escaped[1];
      index += escaped[0].length;
      continue;
    }

    const code = /^(`+)([\s\S]*?)\1(?!`)/.exec(rest);
    if (code) {
      flush();
      runs.push({ k: 'code', v: code[2].trim() });
      index += code[0].length;
      continue;
    }

    // An inline image has no box to draw in a paragraph: its alt text is the honest fallback, and
    // a page whose image *is* the paragraph was already lifted to an `img` block by the generator.
    if (rest[0] === '!' && rest[1] === '[') {
      const image = linkAt(rest, 1);
      if (image) {
        buffer += image.label;
        index += image.length + 1;
        continue;
      }
    }

    const link = linkAt(rest);
    if (link) {
      flush();
      runs.push({ k: 'link', href: link.href, v: link.label });
      index += link.length;
      continue;
    }

    const autolink = /^<(https?:\/\/[^>\s]+)>/.exec(rest);
    if (autolink) {
      flush();
      runs.push({ k: 'link', href: autolink[1], v: autolink[1] });
      index += autolink[0].length;
      continue;
    }

    // CommonMark's flanking rule, at the only two lengths this corpus uses: the text inside may
    // not begin or end with a space. Without it `2 * 3 * 4` is italic ` 3 `, which is arithmetic
    // a page shows as a formula it never wrote.
    const strong = /^\*\*([^*]+)\*\*/.exec(rest);
    if (strong && !/^\s|\s$/.test(strong[1])) {
      flush();
      runs.push({ k: 'strong', v: strong[1] });
      index += strong[0].length;
      continue;
    }

    const emphasis = /^\*([^*\n]+?)\*/.exec(rest);
    if (emphasis && !/^\s|\s$/.test(emphasis[1])) {
      flush();
      runs.push({ k: 'em', v: emphasis[1] });
      index += emphasis[0].length;
      continue;
    }

    // Markdown has no underline, and `_` is already an identifier character in this corpus
    // (`K_p`), so the note editor writes `++…++` and this is the one reader that renders it.
    const underline = /^\+\+([^+\n]+?)\+\+/.exec(rest);
    if (underline && !/^\s|\s$/.test(underline[1])) {
      flush();
      runs.push({ k: 'u', v: underline[1] });
      index += underline[0].length;
      continue;
    }

    const maths = /^\$([^$\n]+?)\$/.exec(rest);
    if (maths) {
      const tex = maths[1];
      // GitHub's own rule: the opening `$` may not be followed by space and the closing one may
      // not be preceded by space, which is what keeps "$5 and $6" from becoming one formula.
      if (tex.length > 0 && !/^\s/.test(tex) && !/\s$/.test(tex)) {
        flush();
        runs.push({ k: 'math', v: tex });
        index += maths[0].length;
        continue;
      }
    }

    buffer += text[index];
    index += 1;
  }
  flush();
  return runs;
}

/** The words of a line, with every delimiter gone: what a slug, a title or a snippet reads. */
export function inlinePlain(text: string): string {
  return parseInline(text)
    .map((run) => {
      if (run.k === 'code' || run.k === 'text' || run.k === 'math') return run.v;
      return inlinePlain(run.v);
    })
    .join('');
}

/**
 * The heading anchor of every heading in the page, keyed by the block itself.
 *
 * A map rather than an array aligned to the top-level list: a `reveal` block owns headings of its
 * own, and an index into the flat array stops meaning the right block the moment one nests. Keying
 * by the block object is stable for the life of a payload, because the renderer walks that same
 * object. Repeated headings get `-1`, `-2` from `sectionAnchors`, exactly as GitHub numbers them.
 */
export function headingAnchors(blocks: ReaderBlock[]): Map<ReaderBlock, string> {
  const headings: Extract<ReaderBlock, { t: 'h' }>[] = [];
  const walk = (list: ReaderBlock[]) => {
    for (const block of list) {
      if (block.t === 'h') headings.push(block);
      else if (block.t === 'reveal') walk(block.blocks);
    }
  };
  walk(blocks);
  const anchors = sectionAnchors(headings.map((block) => ({ h: inlinePlain(block.x) })));
  const map = new Map<ReaderBlock, string>();
  headings.forEach((block, index) => map.set(block, anchors[index]));
  return map;
}

/** A heading's anchor from its own text, for a link that knows the heading but not its page. */
export function anchorFor(heading: string): string {
  return githubSlug(inlinePlain(heading));
}
