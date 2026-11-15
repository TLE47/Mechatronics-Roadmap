/**
 * A 3–4–5 triangle passes; 0.30000000000000004 does not (`app/src/bridges/assertGuard.ts`).
 *
 * Lesson P.6's Bridge Notes shows an `assert` doing its job on `distance_2d(3.0, 4.0) == 5.0`, and
 * then the case where the same habit goes wrong: `0.1 + 0.2` is `0.30000000000000004`, so an exact
 * comparison fails on arithmetic that is right. The fix is the page's own `round(value, 4)`.
 *
 * The card prints both assertions from one pair of controls, so the learner sees that the failing
 * one is not a wrong distance — it is a wrong tolerance.
 */
import type { LabSpec, LabValues } from './bridgeLab.ts';
import { numberAt, toggleAt } from './bridgeLab.ts';

/** The page's right triangle, in metres. */
export const LEG_X = 3;
export const LEG_Y = 4;

/** The float tail the page prints in full. */
export const FLOAT_TAIL = 0.1 + 0.2;

/** `math.sqrt(x**2 + y**2)`. */
export function distance2d(x: number, y: number): number {
  return Math.sqrt(x ** 2 + y ** 2);
}

/** `round(value, 4)`: the page's tolerance, not a fudge factor. */
export function rounded(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}

const xOf = (values: LabValues) => numberAt(values, 'x', LEG_X);
const yOf = (values: LabValues) => numberAt(values, 'y', LEG_Y);

export const assertGuardLab: LabSpec = {
  testid: 'bridge-assert-guard',
  title: 'The assert that fails on purpose',
  prompt: '3–4–5 passes an exact assert. 0.1 + 0.2 does not, and the distance was never wrong.',
  controls: [
    { kind: 'range', id: 'x', label: 'x', unit: 'm', min: 0, max: 10, step: 0.5, start: LEG_X },
    { kind: 'range', id: 'y', label: 'y', unit: 'm', min: 0, max: 10, step: 0.5, start: LEG_Y },
    { kind: 'toggle', id: 'rounded', label: 'compare to 4 places', start: true },
  ],
  pair: { wrong: 'strict', right: 'tolerant', wrongLabel: 'exact', rightLabel: 'round(…, 4)' },
  readouts: [
    {
      id: 'strict',
      label: 'raw == 0.3',
      text: () => String(FLOAT_TAIL === 0.3),
      note: () => '0.30000000000000004 is not 0.3',
    },
    {
      id: 'tolerant',
      label: 'round(raw, 4) == 0.3',
      text: () => String(rounded(FLOAT_TAIL) === 0.3),
      note: () => 'the page\'s comparison, and it passes',
    },
    {
      id: 'distance',
      label: 'distance_2d',
      text: (values) => distance2d(xOf(values), yOf(values)).toFixed(2),
      unit: 'm',
      note: (values) => `sqrt(${xOf(values)}² + ${yOf(values)}²)`,
    },
    {
      id: 'raw',
      label: '0.1 + 0.2',
      text: () => FLOAT_TAIL.toFixed(17),
      note: () => 'the whole tail, not a rounded print',
    },
    {
      id: 'passes',
      label: 'assert distance',
      text: (values) =>
        toggleAt(values, 'rounded')
          ? String(rounded(distance2d(xOf(values), yOf(values))) === 5)
          : String(distance2d(xOf(values), yOf(values)) === 5),
      note: () => '3.0 and 4.0 give exactly 5.0',
    },
  ],
  mark: {
    readout: 'distance',
    value: (values) => distance2d(xOf(values), yOf(values)),
    ladder: [5, 0, 3, 4, 6.4],
    tolerance: 0.02,
    format: (target) => target.toFixed(2),
  },
  verdict: (values) =>
    `The distance is ${distance2d(xOf(values), yOf(values)).toFixed(2)} m. The failing assertion is 0.1 + 0.2 = ${FLOAT_TAIL.toFixed(
      17
    )}, which is right and does not equal 0.3.`,
};
