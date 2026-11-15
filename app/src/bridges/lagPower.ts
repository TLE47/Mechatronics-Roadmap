/**
 * One time constant is 63.2 %, not 100 % (`app/src/bridges/lagPower.ts`).
 *
 * Lesson 00.1's Bridge Notes prints the two numbers a first-order lag is judged by — 63.2 % at 1τ
 * and 99.3 % at 5τ — and the power identity `P = effort × flow`, where 9.0 V and 0.0 A is 0.0 W. The
 * mistake the page warns about is treating "one time constant" as "done", so the card keeps the
 * 100 % line next to the real fraction and lets the learner drag the clock to five.
 */
import type { LabSpec, LabValues } from './bridgeLab.ts';
import { numberAt } from './bridgeLab.ts';

/** The page's power example. */
export const EFFORT_V = 9;
export const FLOW_A = 0;

/** `1 − e^(−t/τ)` for a unit step into a first-order lag. */
export function stepFraction(tauCount: number): number {
  if (!Number.isFinite(tauCount) || tauCount < 0) return 0;
  return 1 - Math.exp(-tauCount);
}

/** `effort × flow`, in watts. */
export function power(effort: number, flow: number): number {
  return effort * flow;
}

const tauOf = (values: LabValues) => numberAt(values, 'tau_count', 1);
const effortOf = (values: LabValues) => numberAt(values, 'effort', EFFORT_V);
const flowOf = (values: LabValues) => numberAt(values, 'flow', FLOW_A);

export const lagPowerLab: LabSpec = {
  testid: 'bridge-lag-power',
  title: 'Time constants and watts',
  prompt: '1τ is 63.2 % of the way, and 9.0 V with 0.0 A is 0.0 W.',
  controls: [
    { kind: 'range', id: 'tau_count', label: 'time since the step', unit: 'τ', min: 0, max: 5, step: 0.1, start: 1 },
    { kind: 'range', id: 'effort', label: 'effort', unit: 'V', min: 0, max: 12, step: 0.5, start: EFFORT_V },
    { kind: 'range', id: 'flow', label: 'flow', unit: 'A', min: 0, max: 2, step: 0.1, start: FLOW_A },
  ],
  pair: { wrong: 'at_one', right: 'fraction', wrongLabel: 'assumed', rightLabel: 'actual' },
  readouts: [
    {
      id: 'fraction',
      label: 'Reached',
      text: (values) => (stepFraction(tauOf(values)) * 100).toFixed(1),
      unit: '%',
      note: (values) => `1 − e^(−${tauOf(values)})`,
    },
    {
      id: 'at_one',
      label: '1τ treated as done',
      text: () => '100.0',
      unit: '%',
      note: () => 'the number the page warns against',
    },
    {
      id: 'power',
      label: 'Power',
      text: (values) => power(effortOf(values), flowOf(values)).toFixed(2),
      unit: 'W',
      note: (values) => `${effortOf(values)} × ${flowOf(values)}`,
    },
    {
      id: 'steady',
      label: 'At 5τ',
      text: () => (stepFraction(5) * 100).toFixed(1),
      unit: '%',
      note: () => '99.3 %, and the last 0.7 % is the long tail',
    },
  ],
  mark: {
    readout: 'fraction',
    value: (values) => stepFraction(tauOf(values)) * 100,
    ladder: [63.2, 99.3, 86.5, 39.3, 95],
    tolerance: 0.6,
    format: (target) => target.toFixed(1),
  },
  verdict: (values) =>
    `At ${tauOf(values)}τ the lag has reached ${(stepFraction(tauOf(values)) * 100).toFixed(
      1
    )} %: ${power(effortOf(values), flowOf(values)).toFixed(2)} W is moving because flow is ${flowOf(
      values
    )} A.`,
};
