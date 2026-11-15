/**
 * Text glues, numbers add (`app/src/bridges/stringSum.ts`).
 *
 * Lesson P.1's Bridge Notes makes one point with two statements: `"12" + "5"` prints `125` because
 * `+` on two strings concatenates them, and `int("12") + int("5")` is `17` because only a number
 * knows how to add. A beginner reads that and nods; the card makes them watch the two answers leave
 * each other as they drag one control.
 *
 * The lesson's own numbers are the start values and the first rung of the ladder (12, 5, 125, 17).
 * Pure functions, no React: the readouts and `scripts/test_bridge_visuals.mjs` read the same three
 * calls.
 */
import type { LabSpec, LabValues } from './bridgeLab.ts';
import { numberAt, toggleAt } from './bridgeLab.ts';

/** The page's two variables. */
export const LEFT = 12;
export const RIGHT = 5;

/** `str(left) + str(right)`: what Python prints for two strings added with `+`. */
export function typed(left: number, right: number): string {
  return `${left}${right}`;
}

/** `int(left) + int(right)`: the sum the page wants. */
export function summed(left: number, right: number): number {
  return left + right;
}

const leftOf = (values: LabValues) => numberAt(values, 'left', LEFT);
const rightOf = (values: LabValues) => numberAt(values, 'right', RIGHT);

export const stringSumLab: LabSpec = {
  testid: 'bridge-string-sum',
  title: 'Two ways to add',
  prompt: '12 and 5 are two numbers, or two pieces of text. The plus sign does what the type says.',
  controls: [
    { kind: 'range', id: 'left', label: 'first value', unit: '', min: 0, max: 99, step: 1, start: LEFT },
    { kind: 'range', id: 'right', label: 'second value', unit: '', min: 0, max: 99, step: 1, start: RIGHT },
    { kind: 'toggle', id: 'as_text', label: 'keep them as text', start: true },
  ],
  pair: { wrong: 'typed', right: 'sum', wrongLabel: 'the text', rightLabel: 'the number' },
  readouts: [
    {
      id: 'typed',
      label: 'As typed',
      text: (values) => `"${typed(leftOf(values), rightOf(values))}"`,
      note: (values) =>
        toggleAt(values, 'as_text')
          ? `"${leftOf(values)}" + "${rightOf(values)}" glues the digits`
          : 'converted first: the quote marks are gone',
    },
    {
      id: 'sum',
      label: 'As numbers',
      text: (values) => String(summed(leftOf(values), rightOf(values))),
      note: (values) => `int(${leftOf(values)}) + int(${rightOf(values)})`,
    },
    {
      id: 'digits',
      label: 'Characters',
      text: (values) => String(typed(leftOf(values), rightOf(values)).length),
      note: () => 'the length of the text, not its value',
    },
  ],
  mark: {
    readout: 'sum',
    value: (values) => summed(leftOf(values), rightOf(values)),
    ladder: [17, 0, 5, 12, 20],
    tolerance: 0.5,
    format: (target) => String(Math.round(target)),
  },
  verdict: (values) => {
    const text = typed(leftOf(values), rightOf(values));
    const total = summed(leftOf(values), rightOf(values));
    return text === String(total)
      ? `"${text}" and ${total} agree here, which is exactly why this bug survives a test.`
      : `"${text}" is ${text.length} characters; the numbers add to ${total}.`;
  },
};
