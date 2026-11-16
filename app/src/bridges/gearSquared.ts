/**
 * Fifty to one buys 2,500 on inertia (`app/src/bridges/gearSquared.ts`).
 *
 * Lesson 02.4's Bridge Notes prints `N² = 2,500` for a 50:1 box and says what it is worth: reflected
 * inertia falls with the *square* of the ratio while the output speed falls with the ratio itself.
 * The mistake the page warns about is the linear guess, and the card can show it only by printing
 * the ratio's effect on both at once — speed divided by 50, torque-side inertia divided by 2,500.
 *
 * Pure functions; the page's `N = 50` is the start value and the first rung.
 */
import type { LabSpec, LabValues } from './bridgeLab.ts';
import { numberAt } from './bridgeLab.ts';

/** The page's gearbox. */
export const START_RATIO = 50;

/** `N²`: the factor reflected inertia is divided by. */
export function inertiaFactor(ratio: number): number {
  return ratio ** 2;
}

/** The fraction of the motor's inertia a load at the output presents, seen from the motor. */
export function reflectedFraction(ratio: number): number {
  return 1 / inertiaFactor(ratio);
}

/** The output speed for a motor speed, `ω_out = ω_motor / N`. */
export function outputSpeed(motorSpeed: number, ratio: number): number {
  return motorSpeed / ratio;
}

const ratioOf = (values: LabValues) => numberAt(values, 'ratio', START_RATIO);
const motorOf = (values: LabValues) => numberAt(values, 'w_motor', 50);

export const gearSquaredLab: LabSpec = {
  testid: 'bridge-gear-squared',
  title: 'The square in the gearbox',
  prompt: 'Speed is divided by 50. Reflected inertia is divided by 2,500. Same gearbox.',
  controls: [
    { kind: 'range', id: 'ratio', label: 'gear ratio N:1', unit: ':1', min: 1, max: 100, step: 1, start: START_RATIO },
    {
      kind: 'range',
      id: 'w_motor',
      label: 'motor speed',
      unit: 'rad/s',
      min: 0,
      max: 150,
      step: 5,
      start: 50,
    },
  ],
  readouts: [
    {
      id: 'factor',
      label: 'Inertia factor',
      text: (values) => inertiaFactor(ratioOf(values)).toLocaleString('en-US'),
      note: (values) => `${ratioOf(values)}²`,
    },
    {
      id: 'reflected',
      label: 'Seen from motor',
      text: (values) => reflectedFraction(ratioOf(values)).toFixed(4),
      note: () => 'the fraction of the load inertia the motor has to move',
    },
    {
      id: 'w_out',
      label: 'Output speed',
      text: (values) => outputSpeed(motorOf(values), ratioOf(values)).toFixed(2),
      unit: 'rad/s',
      note: (values) => `${motorOf(values)} / ${ratioOf(values)}`,
    },
  ],
  mark: {
    readout: 'factor',
    value: (values) => inertiaFactor(ratioOf(values)),
    ladder: [2500, 1, 100, 400, 10000],
    tolerance: 60,
    format: (target) => target.toLocaleString('en-US'),
  },
  verdict: (values) => {
    const ratio = ratioOf(values);
    return `${ratio}:1 divides the speed by ${ratio} and the reflected inertia by ${inertiaFactor(
      ratio
    ).toLocaleString('en-US')}: the square is why gearboxes exist.`;
  },
};
