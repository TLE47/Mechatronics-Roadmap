/**
 * `sin(0)` is the bug (`app/src/bridges/signFlip.ts`).
 *
 * Lesson 00.3's Bridge Notes makes the modelling point with one line: the holding torque is
 * `+m·g·L·cos θ`, so the controller has to winch *upward*, strongest at θ = 0 and zero at the top.
 * The mistake it warns about is reaching for `sin`: at 0° that returns 0.000, gravity disappears
 * from the model at the exact angle where it pulls hardest, and nothing looks broken until the arm
 * falls.
 *
 * The lesson body prints the three boundary torques the card must reproduce: +1.962 N·m at 0°,
 * +0.981 N·m at 60° and +0.000 N·m at 90°, for a 0.40 kg tip on a 0.5 m link. Those are this
 * file's constants, so the first reading a learner sees is the page's own worked example.
 *
 * The card keeps both formulas live from one angle and prints the sign explicitly: a positive
 * number that has to push up is a reading, not a sign convention to remember.
 *
 * Pure functions, no React.
 */
import type { LabSpec, LabValues } from './bridgeLab.ts';
import { numberAt, toggleAt } from './bridgeLab.ts';

/** The lesson's arm: 0.40 kg at 0.5 m, so `m·g·L` is 1.962 N·m. */
export const MASS_KG = 0.4;
export const LENGTH_M = 0.5;
export const GRAVITY = 9.81;

/** `+m·g·L·cos θ`: the torque the controller must supply, positive meaning "hold it up". */
export function holdTorque(degrees: number): number {
  return MASS_KG * GRAVITY * LENGTH_M * Math.cos((degrees * Math.PI) / 180);
}

/** The same expression with `sin` in place of `cos`: the page's warning, as a number. */
export function sinBug(degrees: number): number {
  return MASS_KG * GRAVITY * LENGTH_M * Math.sin((degrees * Math.PI) / 180);
}

/** How the torque is printed: the sign is the information. */
export function formatTorque(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(3)}`;
}

const degOf = (values: LabValues) => numberAt(values, 'theta_deg', 60);
const bugOf = (values: LabValues) => toggleAt(values, 'sin_bug');

/** Whichever formula the toggle picked, so every reading on the card agrees. */
function model(degrees: number, bug: boolean): number {
  return bug ? sinBug(degrees) : holdTorque(degrees);
}

export const signFlipLab: LabSpec = {
  testid: 'bridge-sign-flip',
  title: 'Which way is up',
  prompt: 'Holding horizontal needs +1.962 N·m. The sin() version says +0.000 there, with nothing to fix.',
  controls: [
    { kind: 'range', id: 'theta_deg', label: 'arm angle', unit: '°', min: 0, max: 90, step: 1, start: 60 },
    { kind: 'toggle', id: 'sin_bug', label: 'use sin() instead', start: false },
  ],
  readouts: [
    {
      id: 'tau_hold',
      label: 'Holding torque',
      text: (values) => formatTorque(model(degOf(values), bugOf(values))),
      unit: 'N·m',
      note: (values) => (bugOf(values) ? 'm g L sin θ — the wrong model' : '+m g L cos θ'),
    },
    {
      id: 'sin_zero',
      label: 'At horizontal',
      text: () => formatTorque(sinBug(0)),
      unit: 'N·m',
      note: () => 'what sin() reports where gravity pulls hardest',
    },
    {
      id: 'direction',
      label: 'Motor must',
      text: (values) =>
        Math.abs(model(degOf(values), bugOf(values))) < 1e-9 ? 'do nothing' : 'push upward',
      note: () => 'sign of the torque, read as a direction',
    },
  ],
  mark: {
    readout: 'tau_hold',
    value: (values) => model(degOf(values), bugOf(values)),
    ladder: [1.962, 0.981, 0, 1.503, 0.606],
    tolerance: 0.03,
    format: formatTorque,
  },
  verdict: (values) => {
    const degrees = degOf(values);
    if (bugOf(values) && degrees === 0) {
      return '`sin(0) = 0` makes gravity vanish at the one angle where it is strongest: +0.000 instead of +1.962.';
    }
    return `At ${degrees}° the model says ${formatTorque(
      model(degrees, bugOf(values))
    )} N·m; the page's three boundaries are +1.962 at 0°, +0.981 at 60° and +0.000 at 90°.`;
  },
};
