/**
 * One fraction bar, two ways to type it (`app/src/bridges/orderOfOperations.ts`).
 *
 * Lesson P.2's Bridge Notes is about a single disappearance: on paper the denominator sits under a
 * horizontal bar, and on one line of Python that bar is gone. The section writes the difference out
 * with its own worked example — a `12.0 V` rail divided by `part_a = 20000 Ω` and
 * `part_b = 10000 Ω` lands on `4.00 V`, and the same three numbers typed left to right give the
 * nonsense the page warns about, because PEMDAS divides before it adds.
 *
 * The lab prints both answers from the same three controls, so the wrong one is not a warning in
 * prose: it is a number the learner can watch move away as `b` grows. Pure functions.
 */
import { formatReading, numberAt, type LabSpec, type LabValues } from './bridgeLab.ts';

/** The lesson's own starter values: `supply_level`, `part_a`, `part_b`. */
export const SUPPLY_V = 12;
export const PART_A_OHM = 20_000;
export const PART_B_OHM = 10_000;

/** `y_in * (b / (a + b))` — the denominator added first, as the fraction bar says. */
export function dividerRight(yIn: number, a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a + b <= 0) {
    throw new Error('the two divider resistors must add up to something positive');
  }
  return (yIn * b) / (a + b);
}

/** `y_in * b / a + b` — what PEMDAS does to the same three names with no parentheses. */
export function dividerWrong(yIn: number, a: number, b: number): number {
  if (!Number.isFinite(a) || a <= 0) throw new Error('the upper resistor must be positive');
  return (yIn * b) / a + b;
}

const yOf = (values: LabValues) => numberAt(values, 'y_in', SUPPLY_V);
const aOf = (values: LabValues) => numberAt(values, 'a', PART_A_OHM);
const bOf = (values: LabValues) => numberAt(values, 'b', PART_B_OHM);

export const orderOfOperationsLab: LabSpec = {
  testid: 'bridge-pemdas',
  title: 'The bar you have to type',
  prompt: '12.0 V across 20 kΩ and 10 kΩ is 4.00 V. Without the bar it is not a divider.',
  controls: [
    {
      kind: 'range',
      id: 'y_in',
      label: 'Supply (y_in)',
      unit: 'V',
      min: 0,
      max: 24,
      step: 0.5,
      start: SUPPLY_V,
    },
    {
      kind: 'range',
      id: 'a',
      label: 'Upper resistor (a)',
      unit: 'Ω',
      min: 1_000,
      max: 100_000,
      step: 1_000,
      start: PART_A_OHM,
    },
    {
      kind: 'range',
      id: 'b',
      label: 'Lower resistor (b)',
      unit: 'Ω',
      min: 1_000,
      max: 100_000,
      step: 1_000,
      start: PART_B_OHM,
    },
  ],
  scale: {
    min: 0,
    max: 1,
    label: 'Ground (0) … rail (1)',
    marks: [
      {
        id: 'fraction',
        at: (values) => bOf(values) / (aOf(values) + bOf(values)),
        caption: (values) => `${bOf(values)} / (${aOf(values)} + ${bOf(values)})`,
      },
    ],
  },
  readouts: [
    {
      id: 'right',
      label: 'With the bar',
      unit: 'V',
      text: (values) => formatReading(dividerRight(yOf(values), aOf(values), bOf(values))),
      note: (values) =>
        `${yOf(values)} * (${bOf(values)} / (${aOf(values)} + ${bOf(values)}))`,
    },
    {
      id: 'wrong',
      label: 'Left to right',
      unit: 'V',
      text: (values) => formatReading(dividerWrong(yOf(values), aOf(values), bOf(values))),
      note: (values) =>
        `${yOf(values)} * ${bOf(values)} / ${aOf(values)} + ${bOf(values)}`,
    },
  ],
};
