/**
 * The two text operations the lesson page needs (`app/src/lessonMarks.ts`).
 *
 * They are here, apart from React, because both are the kind of rule that is easy to get subtly
 * wrong and cheap to pin: which passage a saved note is anchored to, and what a Bold press does to
 * the characters around a textarea's selection.
 *
 * **Marks.** A highlight stores its quote, not an offset. The renderer asks this module to cut one
 * text run into plain and marked pieces, so a sticky note shows up on the page it was written on
 * instead of only in the Notes panel. The longest matching quote wins where two overlap, and pieces
 * are emitted in reading order; a quote that spans two inline runs (half a sentence in bold) is not
 * marked rather than marked wrongly, and the note is still reachable from Notes.
 *
 * **Wrapping.** The note editor stores Markdown, not HTML: `**bold**` for strong, `*italic*` for
 * emphasis, `++underline++` for the one mark Markdown has no syntax for. Wrapping the selection
 * keeps the selection inside the markers, so Bold then Underline nests instead of replacing, and an
 * empty selection leaves the caret between the markers ready for typing.
 */

export interface MarkPiece {
  /** The characters to draw. */
  text: string;
  /** The stored quote this piece is, or null for ordinary text. */
  quote: string | null;
}

/**
 * Cut one text run into plain and marked pieces for the quotes it contains.
 *
 * Quotes are compared as stored (already whitespace-collapsed by `cleanQuote`). The scan moves left
 * to right and, at each position, tries the longest quote first, so `the gain` inside `the gain term`
 * marks the longer phrase and the shorter one never produces a second, overlapping button. A quote
 * not found in this run contributes nothing; the caller keeps looking at the other runs.
 *
 * `loose` compares words rather than characters, so any run of whitespace in the text matches the
 * single space a stored quote has. A code block needs it: `cleanQuote` collapses the newlines of a
 * selected snippet, and a highlight of three lines would otherwise be stored and never drawn.
 */
export function markQuotes(
  text: string,
  quotes: readonly string[],
  options: { loose?: boolean } = {}
): MarkPiece[] {
  if (!text) return [];
  const unique = [...new Set(quotes.map((quote) => quote.trim()).filter(Boolean))].sort(
    (a, b) => b.length - a.length
  );
  if (unique.length === 0) return [{ text, quote: null }];

  // A quote is a phrase, not a regex: escape it, then let any whitespace run stand in for the one
  // space `cleanQuote` left in it. A newline in the code is the same passage as that space. Sticky
  // (`y`) so a match is tried at the cursor and nowhere else: no slicing, no second scan.
  const matchers = unique.map((quote) => ({
    quote,
    pattern: options.loose
      ? new RegExp(
          quote
            .split(/\s+/)
            .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('\\s+'),
          'y'
        )
      : null,
  }));

  const pieces: MarkPiece[] = [];
  let plain = '';
  let index = 0;
  while (index < text.length) {
    // The stored quote names the mark; the drawn characters are what the page holds, which may be a
    // newline where the quote has a space. The click handler looks the note up by the stored quote.
    let hit: { text: string; quote: string } | null = null;
    for (const matcher of matchers) {
      if (matcher.pattern) {
        matcher.pattern.lastIndex = index;
        const match = matcher.pattern.exec(text);
        if (match) {
          hit = { text: match[0], quote: matcher.quote };
          break;
        }
      } else if (text.startsWith(matcher.quote, index)) {
        hit = { text: matcher.quote, quote: matcher.quote };
        break;
      }
    }
    if (!hit) {
      plain += text[index];
      index += 1;
      continue;
    }
    if (plain) {
      pieces.push({ text: plain, quote: null });
      plain = '';
    }
    pieces.push(hit);
    index += hit.text.length;
  }
  if (plain) pieces.push({ text: plain, quote: null });
  return pieces.length > 0 ? pieces : [{ text, quote: null }];
}

export interface WrappedSelection {
  /** The whole new value for the box. */
  text: string;
  /** Where the selection starts after the wrap: inside the opening marker. */
  start: number;
  /** Where it ends: before the closing marker. */
  end: number;
}

/**
 * Wrap the selected characters in a marker pair, or insert the pair at the caret.
 *
 * An empty selection gets the word `text` between the markers and selected, because `****` alone
 * looks like a typo and types nothing useful. Ranges are clamped to the string rather than trusted:
 * a React textarea and its `selectionStart` are two different objects, and a state update between
 * reading one and reading the other can leave a stale index.
 */
export function wrapSelection(
  text: string,
  start: number,
  end: number,
  marker: string
): WrappedSelection {
  const safeStart = Math.max(0, Math.min(Number.isFinite(start) ? start : 0, text.length));
  const safeEnd = Math.max(safeStart, Math.min(Number.isFinite(end) ? end : safeStart, text.length));
  const selected = text.slice(safeStart, safeEnd) || 'text';
  return {
    text: `${text.slice(0, safeStart)}${marker}${selected}${marker}${text.slice(safeEnd)}`,
    start: safeStart + marker.length,
    end: safeStart + marker.length + selected.length,
  };
}
