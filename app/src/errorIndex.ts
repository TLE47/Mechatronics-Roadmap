/**
 * The error index: `docs/ERROR_EXPLAINER.md`, matched to a traceback (`app/src/errorIndex.ts`).
 *
 * The page is the course's own list of the fifteen failures that recur, each with one sentence and
 * the two or three things to check. It was reachable only by leaving the workbench, which is the worst
 * moment to leave it: the learner has the traceback on screen and the explanation somewhere else.
 *
 * The data is generated from the page by `scripts/generate_error_index.py`, so an edit to an entry is a
 * `--check` failure here rather than a card that quietly disagrees with the document a mentor reads.
 * The match comes from the entry's *heading*, which is the symptom the page is organised by:
 *
 * - a heading that quotes an exception and its message (`TypeError: can only concatenate list…`)
 *   matches that class and that message;
 * - a heading that names only a class (`ZeroDivisionError in a rate or average`) matches any message of
 *   that class;
 * - a heading about a wrong number, a swallowed `except` or a printed PASS matches nothing, because no
 *   traceback names it. Those entries stay readable in the page and are never claimed for a failure
 *   they do not describe — a confident wrong diagnosis is worse than none.
 *
 * When two entries share a class, the one whose quoted message occurs in the failure wins; the type
 * alone is the fallback, never a guess about which of two same-class entries the learner meant.
 */

import { ERROR_INDEX, type ErrorIndexEntry, type ErrorIndexMatch } from './data/errorIndex.ts';
import type { ParsedFailure } from './traceback.ts';

export { ERROR_INDEX };
export type { ErrorIndexEntry, ErrorIndexMatch };

/** The heading a card prints: `ZeroDivisionError in a rate or average`. */
export function entryHeadline(entry: ErrorIndexEntry): string {
  return `#${entry.number} · ${entry.title}`;
}

/**
 * The entry that answers this failure, or null when the page has nothing to say about it.
 *
 * Matching is case-insensitive on the message because CPython's wording differs by version in
 * capitalisation and quotes (`can only concatenate list (not "int") to list` is stable, the quoting
 * around a name is not), and it never looks at the frame: an entry describes a failure, not a line.
 */
export function matchError(failure: ParsedFailure | null): ErrorIndexEntry | null {
  if (!failure) return null;
  const type = failure.exception.type;
  if (!type) return null;
  const message = failure.exception.message.toLowerCase();

  const sameClass = ERROR_INDEX.filter((entry) => entry.match?.exception === type);
  if (sameClass.length === 0) return null;

  let best: { entry: ErrorIndexEntry; patternLength: number } | null = null;
  let typeOnly: ErrorIndexEntry | null = null;
  for (const entry of sameClass) {
    const pattern = entry.match?.pattern ?? null;
    if (pattern === null) {
      typeOnly ??= entry;
      continue;
    }
    if (!message.includes(pattern.toLowerCase())) continue;
    if (!best || pattern.length > best.patternLength) best = { entry, patternLength: pattern.length };
  }
  return best?.entry ?? typeOnly;
}

/**
 * How the card refers to the page, for a learner who wants the whole list.
 *
 * The workbench is served on its own, without the Markdown pages beside it, so this is a citation
 * rather than a link: naming the file is what lets the same words be found in the repository.
 */
export const EXPLAINER_CITATION = 'docs/ERROR_EXPLAINER.md';

/** The index entries a failure card can mention at all — the ones a traceback can reach. */
export const MATCHABLE_ENTRIES = ERROR_INDEX.filter((entry) => entry.match !== null);
