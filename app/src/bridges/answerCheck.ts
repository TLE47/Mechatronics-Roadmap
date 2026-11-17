/**
 * The arithmetic is right and the answer is incomplete (`app/src/bridges/answerCheck.ts`).
 *
 * Lesson P.14's Bridge Notes runs the given / unknown / model / compute / check / answer order and
 * prints the case that makes the `check` step earn its place: 12 V across 2.4 Ω is `5.0 A`, the
 * driver passes `3.2 A`, so the workflow takes the failure branch, clamps, and writes an answer that
 * *names the limit*.
 *
 * The card keeps the computed value and the clamped one side by side from one set of controls,
 * because the lesson's point is that the second number is not a correction to the first — it is the
 * answer to a question the first one did not ask.
 */
import type { LabSpec, LabValues } from './bridgeLab.ts';
import { numberAt } from './bridgeLab.ts';

/** The page's given values. */
export const SUPPLY_V = 12;
export const RESISTANCE_OHM = 2.4;
export const DRIVER_LIMIT_A = 3.2;

/** `V / R`, with a zero resistance refused rather than divided by. */
export function ohmsCurrent(volts: number, ohms: number): number {
  if (!Number.isFinite(ohms) || ohms <= 0) return 0;
  return volts / ohms;
}

/** What the workflow is allowed to command: the computed value, held at the driver's limit. */
export function withinLimit(amps: number, limit: number): number {
  return Math.min(amps, limit);
}

const voltsOf = (values: LabValues) => numberAt(values, 'v', SUPPLY_V);
const ohmsOf = (values: LabValues) => numberAt(values, 'r', RESISTANCE_OHM);
const limitOf = (values: LabValues) => numberAt(values, 'limit', DRIVER_LIMIT_A);

export const answerCheckLab: LabSpec = {
  testid: 'bridge-answer-check',
  title: 'Check before you answer',
  prompt: '12 V across 2.4 Ω is 5.0 A. The driver passes 3.2 A. The answer is not 5.0.',
  controls: [
    { kind: 'range', id: 'v', label: 'supply', unit: 'V', min: 5, max: 24, step: 0.1, start: SUPPLY_V },
    { kind: 'range', id: 'r', label: 'resistance', unit: 'Ω', min: 1, max: 10, step: 0.1, start: RESISTANCE_OHM },
    { kind: 'range', id: 'limit', label: 'driver limit', unit: 'A', min: 1, max: 6, step: 0.1, start: DRIVER_LIMIT_A },
  ],
  pair: { wrong: 'computed', right: 'commanded', wrongLabel: 'compute', rightLabel: 'answer' },
  readouts: [
    {
      id: 'computed',
      label: 'Computed',
      text: (values) => ohmsCurrent(voltsOf(values), ohmsOf(values)).toFixed(2),
      unit: 'A',
      note: (values) => `${voltsOf(values)} / ${ohmsOf(values)}`,
    },
    {
      id: 'commanded',
      label: 'Commanded',
      text: (values) =>
        withinLimit(
          ohmsCurrent(voltsOf(values), ohmsOf(values)),
          limitOf(values)
        ).toFixed(2),
      unit: 'A',
      note: (values) => `min(${ohmsCurrent(voltsOf(values), ohmsOf(values)).toFixed(2)}, ${limitOf(values)})`,
    },
    {
      id: 'ratio',
      label: 'Over the limit',
      text: (values) =>
        `${(
          ohmsCurrent(voltsOf(values), ohmsOf(values)) / limitOf(values)
        ).toFixed(2)}×`,
      note: () => 'the number the answer has to mention',
    },
    {
      id: 'branches',
      label: 'Branches written',
      text: (values) =>
        String(1 + (ohmsCurrent(voltsOf(values), ohmsOf(values)) > limitOf(values) ? 1 : 0)),
      note: () => 'the failure branch is the one that names the limit',
    },
  ],
  mark: {
    readout: 'computed',
    value: (values) => ohmsCurrent(voltsOf(values), ohmsOf(values)),
    ladder: [5, 3.2, 2.4, 4, 6],
    tolerance: 0.05,
    format: (target) => target.toFixed(2),
  },
  verdict: (values) => {
    const amps = ohmsCurrent(voltsOf(values), ohmsOf(values));
    const limit = limitOf(values);
    return amps > limit
      ? `${amps.toFixed(2)} A is ${(amps / limit).toFixed(2)}× the ${limit.toFixed(
          1
        )} A limit: the answer names the limit and commands ${limit.toFixed(1)} A.`
      : `${amps.toFixed(2)} A is inside the ${limit.toFixed(1)} A limit: the compute step is the answer.`;
  },
};
