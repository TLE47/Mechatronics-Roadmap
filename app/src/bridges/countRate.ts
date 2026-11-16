/**
 * One count is 0.00153 rad, and at 1 ms that is 1.53 rad/s of nothing (`app/src/bridges/countRate.ts`).
 *
 * Lesson R.1's Bridge Notes divides a single encoder count by a single millisecond and gets a speed
 * that looks like motion: `2π / 4096 = 0.00153 rad`, and `0.00153 / 0.001 = 1.53 rad/s`. The card
 * prints the per-count constant beside the rate, so the learner can see that the 1.53 is the count's
 * size showing through the sampling interval, not the shaft's speed.
 */
import type { LabSpec, LabValues } from './bridgeLab.ts';
import { numberAt } from './bridgeLab.ts';

/** One revolution in counts. */
export const COUNTS_PER_REV = 4096;

/** `2π / 4096`, in radians. */
export function radiansPerCount(): number {
  return (2 * Math.PI) / COUNTS_PER_REV;
}

/** `counts × rad/count ÷ seconds`. */
export function rateRadPerSecond(counts: number, seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return (counts * radiansPerCount()) / seconds;
}

const countsOf = (values: LabValues) => numberAt(values, 'counts', 1);
const dtOf = (values: LabValues) => numberAt(values, 'dt_ms', 1);

export const countRateLab: LabSpec = {
  testid: 'bridge-count-rate',
  title: 'One count is not a speed',
  prompt: '0.00153 rad per count, divided by 1 ms, reads 1.53 rad/s with the shaft barely moving.',
  controls: [
    { kind: 'range', id: 'counts', label: 'counts moved', unit: '', min: 1, max: 10, step: 1, start: 1 },
    { kind: 'range', id: 'dt_ms', label: 'over', unit: 'ms', min: 1, max: 20, step: 1, start: 1 },
  ],
  pair: { wrong: 'per_ms', right: 'rate', wrongLabel: 'divided by ms', rightLabel: 'divided by s' },
  readouts: [
    {
      id: 'rate',
      label: 'Rate',
      text: (values) => rateRadPerSecond(countsOf(values), dtOf(values) / 1000).toFixed(3),
      unit: 'rad/s',
      note: (values) => `${countsOf(values)} × 0.001534 / ${(dtOf(values) / 1000).toFixed(3)}`,
    },
    {
      id: 'per_ms',
      label: 'Rate, ms left in',
      text: (values) => rateRadPerSecond(countsOf(values), dtOf(values)).toFixed(4),
      unit: 'rad/ms',
      note: () => 'the 1,000× that turns 1.53 into 0.0015',
    },
    {
      id: 'per_count',
      label: 'One count',
      text: () => radiansPerCount().toFixed(6),
      unit: 'rad',
      note: () => '2π / 4096',
    },
    {
      id: 'ticks',
      label: 'Counts per turn',
      text: () => COUNTS_PER_REV.toLocaleString('en-US'),
      note: () => 'the number the 0.00153 comes from',
    },
  ],
  mark: {
    readout: 'rate',
    value: (values) => rateRadPerSecond(countsOf(values), dtOf(values) / 1000),
    ladder: [1.534, 0.767, 3.068, 0.383, 0.192],
    tolerance: 0.02,
    format: (target) => target.toFixed(3),
  },
  verdict: (values) =>
    `${countsOf(values)} count(s) is ${(countsOf(values) * radiansPerCount()).toFixed(
      5
    )} rad; over ${dtOf(values)} ms that is ${rateRadPerSecond(
      countsOf(values),
      dtOf(values) / 1000
    ).toFixed(3)} rad/s — the count's size showing through the interval, not the shaft's speed.`,
};
