/**
 * A straight line is a jerk at both ends (`app/src/bridges/cubicTrajectory.ts`).
 *
 * Lesson 06.1's Bridge Notes gives the rest-to-rest cubic, `s = clip(t/T, 0, 1)` and
 * `q_d = q0 + (3s² − 2s³)(qf − q0)`, and the velocity that comes with it,
 * `q̇_d = 6s(1 − s)(qf − q0)/T`. The mistake the page warns about is moving at constant speed: a
 * straight line from `q0` to `qf` arrives at the same place, but it starts and stops instantly, and
 * every joint takes that step as a torque spike.
 *
 * The card moves the same travel by both shapes, so the difference is a number: a quarter of the
 * way through, the cubic has covered `0.156` of the distance where the line has covered `0.250` —
 * and the cubic's peak speed is `1.5 ×` the line's, spent where the line is flat.
 *
 * Pure functions; the page's `s = 0.25`, `1.0 rad` travel and `0.5 s` are the start values.
 */
import type { LabSpec, LabValues } from './bridgeLab.ts';
import { numberAt } from './bridgeLab.ts';

export const S_START = 0.25;
export const TRAVEL_RAD = 1.0;
export const DURATION_S = 0.5;

/** A progress fraction, held inside the move. */
function clamped(s: number): number {
  if (!Number.isFinite(s)) return 0;
  return Math.min(1, Math.max(0, s));
}

/** `3s² − 2s³`: the share of the travel covered at `s`. */
export function cubicFraction(s: number): number {
  const u = clamped(s);
  return 3 * u * u - 2 * u * u * u;
}

/** The straight line's share: `s` itself. */
export function linearFraction(s: number): number {
  return clamped(s);
}

/** `6s(1 − s)`: the speed as a fraction of the average speed. */
export function velocityFraction(s: number): number {
  const u = clamped(s);
  return 6 * u * (1 - u);
}

/** The cubic's position, in radians. */
export function positionRad(s: number, travel: number): number {
  return travel * cubicFraction(s);
}

/** The cubic's velocity, in rad/s. */
export function velocityRadPerSecond(s: number, travel: number, durationS: number): number {
  if (!(durationS > 0)) return 0;
  return (velocityFraction(s) * travel) / durationS;
}

/** `1.5 × travel / T`: where the cubic's speed peaks (at `s = 0.5`). */
export function peakVelocityRadPerSecond(travel: number, durationS: number): number {
  if (!(durationS > 0)) return 0;
  return (1.5 * travel) / durationS;
}

const sOf = (values: LabValues) => numberAt(values, 's', S_START);
const travelOf = (values: LabValues) => numberAt(values, 'travel', TRAVEL_RAD);
const durationOf = (values: LabValues) => numberAt(values, 'duration', DURATION_S);

export const cubicTrajectoryLab: LabSpec = {
  testid: 'bridge-cubic-trajectory',
  title: 'Smooth at both ends',
  prompt: 'A cubic covers 0.156 of a 1.0 rad move at a quarter of the way; a straight line has already covered 0.250.',
  controls: [
    { kind: 'range', id: 's', label: 'progress s', unit: '', min: 0, max: 1, step: 0.01, start: S_START },
    { kind: 'range', id: 'travel', label: 'travel', unit: 'rad', min: 0.5, max: 2, step: 0.1, start: TRAVEL_RAD },
    { kind: 'range', id: 'duration', label: 'move time T', unit: 's', min: 0.2, max: 2, step: 0.1, start: DURATION_S },
  ],
  pair: { wrong: 'linear', right: 'cubic', wrongLabel: 'straight line', rightLabel: '3s² − 2s³' },
  readouts: [
    {
      id: 'cubic',
      label: 'Cubic position',
      text: (values) => positionRad(sOf(values), travelOf(values)).toFixed(3),
      unit: 'rad',
      note: (values) => `${cubicFraction(sOf(values)).toFixed(3)} × ${travelOf(values).toFixed(1)} rad`,
    },
    {
      id: 'linear',
      label: 'Line position',
      text: (values) => (linearFraction(sOf(values)) * travelOf(values)).toFixed(3),
      unit: 'rad',
      note: (values) => `${linearFraction(sOf(values)).toFixed(3)} × ${travelOf(values).toFixed(1)} rad`,
    },
    {
      id: 'velocity',
      label: 'Cubic velocity',
      text: (values) => velocityRadPerSecond(sOf(values), travelOf(values), durationOf(values)).toFixed(3),
      unit: 'rad/s',
      note: () => '6s(1 − s)(qf − q0)/T',
    },
    {
      id: 'peak',
      label: 'Peak velocity',
      text: (values) => peakVelocityRadPerSecond(travelOf(values), durationOf(values)).toFixed(3),
      unit: 'rad/s',
      note: (values) => `1.5 × ${travelOf(values).toFixed(1)} / ${durationOf(values).toFixed(1)} s, at s = 0.5`,
    },
  ],
  mark: {
    readout: 'cubic',
    value: (values) => positionRad(sOf(values), travelOf(values)),
    ladder: [0.15625, 0.5, 0.84375, 1, 0],
    tolerance: 0.004,
    format: (target) => target.toFixed(3),
  },
  verdict: (values) => {
    const cubic = cubicFraction(sOf(values)) * travelOf(values);
    const line = linearFraction(sOf(values)) * travelOf(values);
    return `At s = ${sOf(values).toFixed(2)} the cubic is at ${cubic.toFixed(3)} rad and the line at ${line.toFixed(
      3
    )}: the cubic leaves and arrives with zero speed, and pays for it by peaking at ${peakVelocityRadPerSecond(
      travelOf(values),
      durationOf(values)
    ).toFixed(3)} rad/s instead of the line's ${(travelOf(values) / durationOf(values)).toFixed(3)}.`;
  },
};
