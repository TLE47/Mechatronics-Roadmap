/**
 * Three runs, one spring (`app/src/bridges/pidWindup.ts`).
 *
 * Lesson 05.1's Bridge Notes lifts a `0.60 N·m` gravity load against a `1.20 N·m` actuator limit
 * with `Kp = 4.0` and gives the three numbers: pure PD sags to `0.850 rad` (`0.150 rad` of sag),
 * unclamped `Ki = 12.0` overshoots by `0.372 rad`, and the same integral clamped to the actuator
 * limit overshoots by `0.047 rad` — nearly eight times less, with no sag.
 *
 * The card makes the sag arithmetic the page's own — `τg / Kp` — and treats the overshoot the way
 * the page's numbers do: a fixed torque of wound-up integral, divided by the spring that has to
 * absorb it. At `Kp = 4.0` that is `1.488 / 4.0 = 0.372` unclamped and `0.188 / 4.0 = 0.047`
 * clamped, so a stiffer spring shrinks both, and the clamped one stays about eight times smaller.
 *
 * Pure functions; the page's `Kp` is the start value and the first rung.
 */
import type { LabSpec, LabValues } from './bridgeLab.ts';
import { numberAt } from './bridgeLab.ts';

/** The page's plant. */
export const TARGET_RAD = 1.0;
export const GRAVITY_TORQUE = 0.6;
export const TORQUE_LIMIT = 1.2;
export const KP_START = 4;

/** The wound-up integral, in N·m: the page's `0.372 rad × 4.0 N·m/rad`. */
export const WINDUP_TORQUE = 1.488;

/** What survives the clamp, in N·m: the page's `0.047 rad × 4.0 N·m/rad`. */
export const CLAMPED_WINDUP_TORQUE = 0.188;

/** PD holds where spring torque balances gravity: `sag = τg / Kp`. */
export function sagRad(kp: number): number {
  if (!(kp > 0)) return 0;
  return GRAVITY_TORQUE / kp;
}

/** The integral that kept integrating: `1.488 / Kp` radians of overshoot. */
export function overshootUnclamped(kp: number): number {
  if (!(kp > 0)) return 0;
  return WINDUP_TORQUE / kp;
}

/** The integral that stopped at the limit: `0.188 / Kp` radians. */
export function overshootClamped(kp: number): number {
  if (!(kp > 0)) return 0;
  return CLAMPED_WINDUP_TORQUE / kp;
}

/** How many times smaller the clamped overshoot is. */
export function windupRatio(kp: number): number {
  const clamped = overshootClamped(kp);
  return clamped > 0 ? overshootUnclamped(kp) / clamped : 0;
}

const kpOf = (values: LabValues) => numberAt(values, 'kp', KP_START);

export const pidWindupLab: LabSpec = {
  testid: 'bridge-pid-windup',
  title: 'The integral that keeps going',
  prompt: 'Kp = 4.0 sags 0.150 rad. Unclamped Ki overshoots 0.372 rad; clamped to 1.20 N·m it overshoots 0.047.',
  controls: [
    { kind: 'range', id: 'kp', label: 'Kp', unit: 'N·m/rad', min: 1, max: 8, step: 0.5, start: KP_START },
  ],
  pair: { wrong: 'overshoot_unclamped', right: 'overshoot_clamped', wrongLabel: 'unclamped', rightLabel: 'clamped' },
  readouts: [
    {
      id: 'sag',
      label: 'PD sag',
      text: (values) => sagRad(kpOf(values)).toFixed(3),
      unit: 'rad',
      note: () => `τg / Kp = 0.60 / Kp`,
    },
    {
      id: 'overshoot_unclamped',
      label: 'Overshoot, no clamp',
      text: (values) => overshootUnclamped(kpOf(values)).toFixed(3),
      unit: 'rad',
      note: () => 'the integral ran on while the actuator was saturated',
    },
    {
      id: 'overshoot_clamped',
      label: 'Overshoot, clamped',
      text: (values) => overshootClamped(kpOf(values)).toFixed(3),
      unit: 'rad',
      note: () => 'the integral stopped at ±1.20 N·m',
    },
    {
      id: 'ratio',
      label: 'Windup reduced',
      text: (values) => windupRatio(kpOf(values)).toFixed(1),
      unit: '×',
      note: () => 'unclamped ÷ clamped',
    },
  ],
  mark: {
    readout: 'sag',
    value: (values) => sagRad(kpOf(values)),
    ladder: [0.15, 0.6, 0.075, 0.12, 0.2],
    tolerance: 0.003,
    format: (target) => target.toFixed(3),
  },
  verdict: (values) => {
    const kp = kpOf(values);
    return `Kp = ${kp.toFixed(1)}: PD holds ${(TARGET_RAD - sagRad(kp)).toFixed(3)} rad, ${sagRad(
      kp
    ).toFixed(3)} below the target. The same integral overshoots ${overshootUnclamped(kp).toFixed(
      3
    )} rad unclamped and ${overshootClamped(kp).toFixed(3)} clamped: ${windupRatio(kp).toFixed(
      1
    )}× less, because the accumulator can no longer grow past the torque the motor can deliver.`;
  },
};
