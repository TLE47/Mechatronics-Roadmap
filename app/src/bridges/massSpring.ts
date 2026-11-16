/**
 * The 2 in `2√(mk)` is the classification (`app/src/bridges/massSpring.ts`).
 *
 * Lesson 00.2's Bridge Notes prints one plant three times: `m = 1.0 kg`, `k = 100 N/m`, and
 * `b = 4.0 / 20.0 / 40.0 N·s/m`, which give `ωn = 10.0 rad/s` and `ζ = 0.20 / 1.00 / 2.00` —
 * underdamped, critically damped, overdamped. The page's claim is the boundary itself:
 * `b_crit = 2√(mk)` is exactly `20.0` here, and that 2 is what a learner drops.
 *
 * The card prints both ratios from the same controls, so the mistake is a number rather than a
 * warning: at `b = 20` the correct ratio is `1.00` (critical) and the one without the 2 is `2.00`
 * (overdamped) — the same damper, a different sentence about how it moves.
 *
 * Pure functions; the page's `m` and `k` are the start values, and its three `b` are the first
 * rungs of the ladder.
 */
import type { LabSpec, LabValues } from './bridgeLab.ts';
import { numberAt } from './bridgeLab.ts';

/** The page's plant. */
export const MASS_KG = 1.0;
export const STIFFNESS_N_PER_M = 100;

/** The page's three damper settings, in the order it prints them. */
export const PAGE_B = [4, 20, 40] as const;

/** The middle setting: exactly critical for this plant. */
export const START_B = 20;

/** `ωn = √(k/m)`, in rad/s. */
export function naturalFrequency(massKg: number, stiffness: number): number {
  if (!(massKg > 0) || !(stiffness > 0)) return 0;
  return Math.sqrt(stiffness / massKg);
}

/** `b_crit = 2√(mk)`: the damping that stops at the target without overshooting. */
export function criticalDamping(massKg: number, stiffness: number): number {
  if (!(massKg > 0) || !(stiffness > 0)) return 0;
  return 2 * Math.sqrt(massKg * stiffness);
}

/** `ζ = b / (2√(mk))`: the page's ratio. */
export function dampingRatio(massKg: number, stiffness: number, damping: number): number {
  const critical = criticalDamping(massKg, stiffness);
  return critical > 0 ? damping / critical : 0;
}

/** `b / √(mk)`: the ratio with the critical damping's 2 left out — 2× too big, every time. */
export function ratioWithoutTwo(massKg: number, stiffness: number, damping: number): number {
  const base = Math.sqrt(massKg * stiffness);
  return base > 0 ? damping / base : 0;
}

/** The page's three words, with the boundary read at print precision (two decimals). */
export type Regime = 'underdamped' | 'critically_damped' | 'overdamped';

export function regimeOf(zeta: number): Regime {
  if (!Number.isFinite(zeta) || Math.abs(zeta - 1) < 0.005) return 'critically_damped';
  return zeta < 1 ? 'underdamped' : 'overdamped';
}

const massOf = (values: LabValues) => numberAt(values, 'mass', MASS_KG);
const stiffnessOf = (values: LabValues) => numberAt(values, 'stiffness', STIFFNESS_N_PER_M);
const dampingOf = (values: LabValues) => numberAt(values, 'damping', START_B);
const ratioOf = (values: LabValues) => dampingRatio(massOf(values), stiffnessOf(values), dampingOf(values));

export const massSpringLab: LabSpec = {
  testid: 'bridge-mass-spring',
  title: 'Ring, stop, or crawl',
  prompt: '1.0 kg on 100 N/m: ζ = b / (2√(mk)). Drop the 2 and the same damper reads twice as damped.',
  controls: [
    { kind: 'range', id: 'mass', label: 'mass m', unit: 'kg', min: 0.5, max: 5, step: 0.1, start: MASS_KG },
    { kind: 'range', id: 'stiffness', label: 'spring k', unit: 'N/m', min: 20, max: 200, step: 5, start: STIFFNESS_N_PER_M },
    { kind: 'range', id: 'damping', label: 'damper b', unit: 'N·s/m', min: 0, max: 60, step: 1, start: START_B },
  ],
  pair: { wrong: 'zeta_no_two', right: 'zeta', wrongLabel: 'b / √(mk)', rightLabel: 'b / (2√(mk))' },
  readouts: [
    {
      id: 'omega',
      label: 'Natural frequency',
      text: (values) => naturalFrequency(massOf(values), stiffnessOf(values)).toFixed(1),
      unit: 'rad/s',
      note: (values) => `√(${stiffnessOf(values)} / ${massOf(values)})`,
    },
    {
      id: 'zeta',
      label: 'Damping ratio',
      text: (values) => ratioOf(values).toFixed(2),
      unit: '',
      note: (values) => `${regimeOf(ratioOf(values)).replace('_', ' ')} — b_crit = ${criticalDamping(massOf(values), stiffnessOf(values)).toFixed(1)}`,
    },
    {
      id: 'zeta_no_two',
      label: 'Ratio without the 2',
      text: (values) => ratioWithoutTwo(massOf(values), stiffnessOf(values), dampingOf(values)).toFixed(2),
      unit: '',
      note: (values) => `${regimeOf(ratioWithoutTwo(massOf(values), stiffnessOf(values), dampingOf(values))).replace('_', ' ')} — the same b, called more damped`,
    },
  ],
  mark: {
    readout: 'zeta',
    value: (values) => ratioOf(values),
    ladder: [1, 0.2, 2, 0.4, 0.6],
    tolerance: 0.02,
    format: (target) => target.toFixed(2),
  },
  verdict: (values) => {
    const zeta = ratioOf(values);
    const critical = criticalDamping(massOf(values), stiffnessOf(values));
    return `b = ${dampingOf(values)} N·s/m is ${zeta.toFixed(2)} of critical (${critical.toFixed(
      1
    )} N·s/m): ${regimeOf(zeta).replace('_', ' ')}. Without the 2 the same damper reads ${ratioWithoutTwo(
      massOf(values),
      stiffnessOf(values),
      dampingOf(values)
    ).toFixed(2)}.`;
  },
};
