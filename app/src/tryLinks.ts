/**
 * Try-it blocks: the page side (`app/src/tryLinks.ts`, `scripts/generate_try_links.mjs`).
 *
 * A lesson page shows code in a fence. A fence someone has marked with `<!-- try -->` on the line
 * above it is code the reader is meant to *run*, and this module is the whole rule set for turning it
 * into that: where the marked block is, which lesson the page belongs to, what the generated line
 * says, and how a re-run rewrites the page without stacking a second line.
 *
 * Four decisions worth stating, because each is a way the generator could be wrong instead:
 *
 * 1. **The marker is a comment, and it must touch the fence.** `<!-- try -->` on its own line,
 *    directly above the opening fence (blank lines allowed). A marker with prose between it and the
 *    fence is a page that means something else, and it is reported rather than guessed at. Only a
 *    `python` fence qualifies: offering a shell command to a Python runner is not a try-it block.
 * 2. **The lesson comes from the page, not from the marker.** A page already names its workbench
 *    entry in its generated run callout (`generate_run_callouts.py` writes `?lesson=<id>`), and that
 *    is the id this reads. The block cannot open a different entry from the callout above it.
 * 3. **The link is generated, so it cannot rot.** The block's text is replaced from the fence's
 *    current contents on every run: edit the code, re-run the generator, and the link carries the new
 *    code. Nothing in the page states a URL by hand.
 * 4. **Unmarking removes.** Delete the marker and the generated lines go with it, which is what makes
 *    the marker the only thing an author has to think about. A generated region with no marker above
 *    it is removed too - it is a block that no longer has code it stands for.
 *
 * The text logic is here rather than in the script for the same reason `sliderModel.ts` and
 * `cells.ts` are: the rules are pure functions of a string, so they are tested with no file system
 * and no browser (`npm run test:try`), and the script is only the file walk around them.
 */

// Extension-bearing specifiers on purpose: this module is loaded by a Node script as well as by the
// app, and Node's ESM resolver has no bundler to guess an omitted `.ts` (`tsconfig.json` allows it).
import { MAX_SHARE_URL } from './shareLink.ts';
import { tryUrl } from './tryLink.ts';

/** The marker an author writes above a fence they want runnable. */
export const TRY_MARKER = '<!-- try -->';
/** The generated region's own markers, so a re-run replaces its line instead of adding one. */
export const TRY_LINK_START = '<!-- try-link:start -->';
export const TRY_LINK_END = '<!-- try-link:end -->';

const MARKER = /^<!--\s*try\s*-->$/;
const REGION_START = /^<!--\s*try-link:start\s*-->$/;
const REGION_END = /^<!--\s*try-link:end\s*-->$/;
const FENCE_OPEN = /^```\s*([A-Za-z0-9_+-]*)\s*$/;
const FENCE_CLOSE = /^```\s*$/;
const PYTHON_FENCE = /^python3?$/;
const LESSON_IN_LINK = /[?&]lesson=([A-Za-z0-9._~%-]+)/;

export interface TryBlock {
  /** 0-based line of the `<!-- try -->` marker. */
  marker: number;
  /** 0-based line of the opening fence. */
  open: number;
  /** 0-based line of the closing fence. */
  close: number;
  /** The fenced text with no trailing newline: exactly what the payload carries. */
  code: string;
}

/**
 * Every marked python block in a page, in line order.
 *
 * A marker whose fence is missing, unclosed or not Python produces no block; `unmarkedProblems`
 * reports it separately, so a page that meant to be runnable cannot fail silently.
 */
export function tryBlocksIn(markdown: string): TryBlock[] {
  const lines = markdown.split('\n');
  const blocks: TryBlock[] = [];
  for (let at = 0; at < lines.length; at += 1) {
    if (!MARKER.test(lines[at].trim())) continue;
    let open = at + 1;
    while (open < lines.length && lines[open].trim() === '') open += 1;
    const fence = open < lines.length ? FENCE_OPEN.exec(lines[open].trim()) : null;
    if (!fence || !PYTHON_FENCE.test(fence[1])) continue;
    let close = open + 1;
    while (close < lines.length && !FENCE_CLOSE.test(lines[close].trim())) close += 1;
    if (close >= lines.length) continue;
    blocks.push({ marker: at, open, close, code: lines.slice(open + 1, close).join('\n') });
    at = close;
  }
  return blocks;
}

/** The workbench id this page names in its own run callout, or null when it names none. */
export function pageLesson(markdown: string): string | null {
  const match = LESSON_IN_LINK.exec(markdown);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/**
 * The generated line for one block, as the page's blockquote.
 *
 * It says what the click does, in the order a reader needs it: which entry opens, that the snippet
 * runs ungraded in a scratch editor, and that their own draft for that lesson is not touched.
 */
export function tryLinkLines(options: {
  lesson: string;
  lines: number;
  url: string;
  tabName: string;
}): string[] {
  const { lesson, lines, url, tabName } = options;
  const what = lines === 1 ? 'this line' : `these ${lines} lines`;
  return [
    TRY_LINK_START,
    `> **Try this in the workbench.** [Open ${what} with \`${lesson}\` loaded](${url}) - it opens on ` +
      'the **' + tabName + '** tab with the snippet in a scratch editor: Run prints what the snippet ' +
      `prints, nothing is graded, and the draft you have for \`${lesson}\` is left alone.`,
    TRY_LINK_END,
  ];
}

/** `Expected output:` and its ```` ```text ```` block, however the page punctuates it. */
const EXPECTED_LABEL = /^\**expected output:?\**$/i;

function skipBlanks(lines: string[], from: number): number {
  let at = from;
  while (at < lines.length && lines[at].trim() === '') at += 1;
  return at;
}

function isRegionStart(lines: string[], at: number): boolean {
  return at < lines.length && REGION_START.test(lines[at].trim());
}

/** The line of the region's end marker, or the last line if it was never closed. */
function regionEnd(lines: string[], start: number): number {
  let at = start;
  while (at < lines.length && !REGION_END.test(lines[at].trim())) at += 1;
  return Math.min(at, lines.length - 1);
}

/**
 * The last line a marked block owns: its fence, the output it prints, and any region a previous run
 * left behind. The fresh region is written after all of it.
 *
 * `Expected output:` and its `text` fence are part of the block because `validate_modules.py` requires
 * that pair to sit directly under the worked example. A link wedged between them would fail the gate
 * and, worse, would separate the code from the output a reader is checking it against. Under the
 * output is also the right place to read it: here is what it prints, run it.
 */
function ownedEnd(lines: string[], block: TryBlock): number {
  let end = block.close;
  let probe = skipBlanks(lines, end + 1);
  if (isRegionStart(lines, probe)) {
    end = regionEnd(lines, probe);
    probe = skipBlanks(lines, end + 1);
  }
  if (probe >= lines.length || !EXPECTED_LABEL.test(lines[probe].trim())) return end;
  const open = skipBlanks(lines, probe + 1);
  if (open >= lines.length || !FENCE_OPEN.test(lines[open].trim())) return end;
  let close = open + 1;
  while (close < lines.length && !FENCE_CLOSE.test(lines[close].trim())) close += 1;
  if (close >= lines.length) return end;
  end = close;
  probe = skipBlanks(lines, end + 1);
  if (isRegionStart(lines, probe)) end = regionEnd(lines, probe);
  return end;
}

export interface TryRewrite {
  /** The page after the rewrite. Equal to the input when nothing was stale. */
  markdown: string;
  changed: boolean;
  /** How many marked blocks carry a generated link now. */
  linked: number;
  /** Author mistakes, one sentence each. A page with any is left as it was at that block. */
  problems: string[];
}

/**
 * Rewrite every try-it block in a page.
 *
 * One pass over the lines: a marked block is copied through together with the `Expected output:` fence
 * that belongs under it, the region it already had (if any) is dropped, and a fresh one is emitted
 * after a blank line below all of it. An unmarked region is dropped with the blank line above it.
 * Everything else is copied verbatim, which is what makes this idempotent - running it twice produces
 * the same bytes, so `--check` can fail on a stale link without ever breaking a clean page.
 */
export function rewriteTryLinks(
  markdown: string,
  options: { href: string; tabName: string }
): TryRewrite {
  const lines = markdown.split('\n');
  const blocks = tryBlocksIn(markdown);
  const lesson = pageLesson(markdown);
  const byOpen = new Map(blocks.map((block) => [block.open, block]));
  const out: string[] = [];
  const problems: string[] = [];
  let linked = 0;

  // A marker that produced no block: say which line, and why nobody can link it.
  const claimed = new Set(blocks.map((block) => block.marker));
  for (let at = 0; at < lines.length; at += 1) {
    if (!MARKER.test(lines[at].trim()) || claimed.has(at)) continue;
    problems.push(
      `line ${at + 1}: \`${TRY_MARKER}\` must sit directly above a \`\`\`python fence (blank lines ` +
        'allowed) - the block under it is not one this generator can link.'
    );
  }
  if (blocks.length && !lesson) {
    for (const block of blocks) {
      problems.push(
        `line ${block.marker + 1}: this page names no workbench entry (its run callout carries no ` +
          '`?lesson=`), so there is nothing for a try-it link to open.'
      );
    }
    return { markdown, changed: false, linked: 0, problems };
  }

  let at = 0;
  while (at < lines.length) {
    const block = byOpen.get(at);
    if (!block) {
      if (REGION_START.test(lines[at].trim())) {
        // A region with no marked fence above it: the marker was deleted, so its link goes too.
        while (at < lines.length && !REGION_END.test(lines[at].trim())) at += 1;
        at += 1;
        if (out.length && out[out.length - 1].trim() === '') out.pop();
        continue;
      }
      out.push(lines[at]);
      at += 1;
      continue;
    }

    const owned = ownedEnd(lines, block);
    const codeLines = block.code === '' ? 0 : block.code.split('\n').length;
    const built = lesson ? tryUrl(options.href, { lesson, code: block.code }) : null;
    if (!built?.ok) {
      // Refused: the page is copied exactly as it stands, its old region included. A page that
      // half-rewrote itself around a block the author still has to fix is worse than a gate failure.
      problems.push(
        built?.reason === 'too-long'
          ? `line ${block.open + 1}: the link for this block would be ${built.characters} characters, ` +
            `over the ${MAX_SHARE_URL} an unbroken URL can carry - shorten the block, or split it in two.`
          : `line ${block.open + 1}: the fence is empty, so there is nothing to run.`
      );
      for (let line = at; line <= owned; line += 1) out.push(lines[line]);
      at = owned + 1;
      continue;
    }
    // Everything the block owns is copied as it stands, except a previous region: that is dropped
    // here and re-emitted from the current code, which is what makes a re-run idempotent.
    for (let line = at; line <= owned; line += 1) {
      if (REGION_START.test(lines[line].trim())) {
        line = regionEnd(lines, line);
        continue;
      }
      out.push(lines[line]);
    }
    at = owned + 1;
    while (out.length && out[out.length - 1].trim() === '') out.pop();
    out.push('', ...tryLinkLines({ lesson: lesson!, lines: codeLines, url: built.url, tabName: options.tabName }));
    linked += 1;
  }

  const next = out.join('\n');
  return { markdown: next, changed: next !== markdown, linked, problems };
}
