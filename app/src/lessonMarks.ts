/**
 * The two text operations the lesson page needs (`app/src/lessonMarks.ts`).
 *
 * They are here, apart from React, because both are the kind of rule that is easy to get subtly
 * wrong and cheap to pin: which passage a saved note is anchored to, and what a Bold press does to
 * the characters around a textarea's selection.
 *
 * **Marks.** A highlight stores its quote, not an offset. The renderer asks this module to find the
 * passage in the paragraph's own text and then cut each inline run by those character ranges, so a
 * sticky note shows up on the page it was written on instead of only in the Notes panel. The longest
 * matching quote wins where two overlap, and ranges are emitted in reading order. Because the scan is
 * over the paragraph rather than one run, a quote that spans a bold word or a code span is marked
 * too — the mark is drawn piece by piece across the runs it covers. `unlocatedQuotes` is the guard:
 * a note whose words are not on this screen any more is named rather than silently absent.
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
/** Where a stored quote sits in a paragraph's text. */
export interface MarkRange {
  /** Offset of the first drawn character, in the text the scan was given. */
  start: number;
  /** Offset one past the last drawn character. */
  end: number;
  /** The stored quote this range is: the note's own key, not the drawn characters. */
  quote: string;
}

/**
 * Every place the quotes appear in `text`, in reading order.
 *
 * This is the scan `markQuotes` used to do per run, lifted out so a caller that has a whole paragraph
 * (the reader, whose paragraph is several inline runs) can find a passage that crosses a run
 * boundary. At each position the longest quote is tried first, so `the gain` inside `the gain term`
 * is one range rather than two overlapping ones, and no two ranges overlap.
 */
export function markRanges(
  text: string,
  quotes: readonly string[],
  options: { loose?: boolean } = {}
): MarkRange[] {
  if (!text) return [];
  const unique = [...new Set(quotes.map((quote) => quote.trim()).filter(Boolean))].sort(
    (a, b) => b.length - a.length
  );
  if (unique.length === 0) return [];

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

  const ranges: MarkRange[] = [];
  let index = 0;
  while (index < text.length) {
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
      index += 1;
      continue;
    }
    ranges.push({ start: index, end: index + hit.text.length, quote: hit.quote });
    index += hit.text.length;
  }
  return ranges;
}

/**
 * Cut one text run into plain and marked pieces for the quotes it contains.
 *
 * Quotes are compared as stored (already whitespace-collapsed by `cleanQuote`). The scan moves left
 * to right and, at each position, tries the longest quote first, so `the gain` inside `the gain term`
 * marks the longer phrase and the shorter one never produces a second, overlapping button. A quote
 * not found in this run contributes nothing; a caller with more than one run should use
 * `markRanges` over the paragraph and cut each run by the ranges instead.
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
  const ranges = markRanges(text, quotes, options);
  if (ranges.length === 0) return [{ text, quote: null }];
  const pieces: MarkPiece[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) pieces.push({ text: text.slice(cursor, range.start), quote: null });
    pieces.push({ text: text.slice(range.start, range.end), quote: range.quote });
    cursor = range.end;
  }
  if (cursor < text.length) pieces.push({ text: text.slice(cursor), quote: null });
  return pieces;
}

/**
 * The quotes this text cannot find — the guard behind the reader's "not on this text" line.
 *
 * A note keeps its quote forever; the lesson it was written on does not. Wording gets edited, a card
 * is rewritten, a passage moves to another section, and the note would then be listed in Notes while
 * the page it belongs to says nothing. Naming the missing ones is what turns that silence into a
 * fact a learner can act on.
 */
export function unlocatedQuotes(
  text: string,
  quotes: readonly string[],
  options: { loose?: boolean } = {}
): string[] {
  const unique = [...new Set(quotes.map((quote) => quote.trim()).filter(Boolean))];
  if (unique.length === 0) return [];
  const located = new Set(markRanges(text, unique, options).map((range) => range.quote));
  return unique.filter((quote) => !located.has(quote));
}

/** What a marker pair did to the box, as the textarea needs to hear it. */
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
