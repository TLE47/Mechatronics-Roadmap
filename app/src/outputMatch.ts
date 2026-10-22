/**
 * Output Presentation Matching (`app/src/outputMatch.ts`)
 *
 * The workbench grades a lesson twice over: the *Instructor Behavioral Tests* decide whether the
 * physics/code is right, and the presentation check decides whether the printed `stdout` is what the
 * lesson promised. Those two questions are separate, so this module keeps formatting out of the
 * behavioural verdict:
 *
 * - `normalized` (the default) compares the learner's *text*: whitespace is ignored entirely, so
 *   indentation, column padding, a missing pad and blank lines cannot block a behaviourally correct
 *   solution - `raw=   0` and `raw=0` are the same run. Line breaks still matter, so two data items
 *   printed on one line are not the two lines the lesson asked for. Leading/trailing blank lines and
 *   trailing spaces per line are ignored in both modes.
 * - `exact` (declared per lesson with `output_match: "exact"` in the front matter) keeps interior
 *   padding and indentation significant. It is reserved for the lessons whose Expected Output *is* a
 *   column-aligned table, i.e. where the format genuinely is part of the answer.
 *
 * Numbers are never relaxed by either mode: only whitespace is.
 */

export type OutputMatchMode = 'normalized' | 'exact';

export const OUTPUT_MATCH_MODES: readonly OutputMatchMode[] = ['normalized', 'exact'];

export interface OutputComparison {
  /** True when the two runs agree under the lesson's declared mode. */
  matched: boolean;
  /** The mode that decided it. */
  mode: OutputMatchMode;
  /**
   * True when the runs agree only because formatting was ignored - the same text, different
   * whitespace. Always false for an `exact` lesson. The UI uses it to say so out loud.
   */
  formattingDiffers: boolean;
  /** 1-based line number of the first difference, or null when the runs agree. */
  firstDiffLine: number | null;
  /**
   * The two lines that differ, so a caller can say what went wrong without re-reading both texts —
   * the announcement does, and the panel could. `null` when the runs agree.
   */
  firstDiff: { expected: string; actual: string } | null;
}

/** Narrow an unknown value (e.g. generated lesson data) to a valid mode, defaulting to normalized. */
export function asOutputMatchMode(value: unknown): OutputMatchMode {
  return value === 'exact' ? 'exact' : 'normalized';
}

function toLines(text: string): string[] {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
}

/**
 * Canonical form of a stdout run under `mode`.
 *
 * `exact`: trailing spaces per line removed, leading/trailing blank lines dropped - interior
 * spacing, indentation and blank lines stay significant.
 *
 * `normalized`: additionally drops blank lines and all whitespace inside each line, leaving the
 * sequence of text per line - the least formatting can be wrong while still being the same output.
 */
export function normalizeStdout(text: string, mode: OutputMatchMode = 'normalized'): string {
  return linePairs(text, mode)
    .map((pair) => pair.normalized)
    .join('\n');
}

/**
 * Each line of a run, in the form it is compared and in the form a person reads it.
 *
 * The comparison strips whitespace in `normalized` mode, and that stripped form is unreadable as a
 * quote - `and a second` becomes `andasecond`, which is what the first version of the run announcement
 * said out loud. Both forms are kept so the verdict is decided on the normalised line and reported with
 * the original.
 */
function linePairs(text: string, mode: OutputMatchMode): { normalized: string; original: string }[] {
  const pairs = toLines(text).map((line) => {
    const original = line.replace(/\s+$/, '');
    return { normalized: mode === 'exact' ? original : original.replace(/\s+/g, ''), original };
  });
  if (mode === 'normalized') return pairs.filter((pair) => pair.normalized !== '');
  while (pairs.length > 0 && pairs[0].original.trim() === '') pairs.shift();
  while (pairs.length > 0 && pairs[pairs.length - 1].original.trim() === '') pairs.pop();
  return pairs;
}

/** Compare a learner's stdout with the lesson's Expected Output under the lesson's mode. */
export function compareStdout(
  actual: string,
  expected: string,
  mode: OutputMatchMode = 'normalized'
): OutputComparison {
  const actualNormalized = normalizeStdout(actual, mode);
  const expectedNormalized = normalizeStdout(expected, mode);
  const matched = actualNormalized === expectedNormalized;

  let firstDiffLine: number | null = null;
  let firstDiff: { expected: string; actual: string } | null = null;
  if (!matched) {
    const actualLines = linePairs(actual, mode);
    const expectedLines = linePairs(expected, mode);
    const lineCount = Math.max(actualLines.length, expectedLines.length);
    for (let index = 0; index < lineCount; index += 1) {
      if (actualLines[index]?.normalized !== expectedLines[index]?.normalized) {
        firstDiffLine = index + 1;
        firstDiff = {
          expected: expectedLines[index]?.original ?? '(no line: the output ends here)',
          actual: actualLines[index]?.original ?? '(no line: the output ends here)',
        };
        break;
      }
    }
  }

  const exactMatched =
    normalizeStdout(actual, 'exact') === normalizeStdout(expected, 'exact');

  return {
    matched,
    mode,
    formattingDiffers: matched && !exactMatched,
    firstDiffLine,
    firstDiff,
  };
}
