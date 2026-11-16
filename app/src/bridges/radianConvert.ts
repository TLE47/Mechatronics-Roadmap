/**
 * The function wanted radians (`app/src/bridges/radianConvert.ts`).
 *
 * Lesson P.10's Bridge Notes says every language's `cos()` and `sin()` take radians, prints
 * `180° = π ≈ 3.1416` and `360° = 2π ≈ 6.2832`, and gives the RPM conversion. The number that makes
 * a beginner sit up is not π: it is `cos(90) = −0.4481`, which is a plausible-looking answer to the
 * wrong question. So the card keeps both cosines live, side by side, from one degree control.
 *
 * The wrong cosine is not a bug in this file: `Math.cos(deg)` is exactly what the page warns about.
 *
 * Pure functions; the pair and the test read the same three calls.
 */
import type { LabSpec, LabValues } from './bridgeLab.ts';
import { numberAt } from './bridgeLab.ts';

/** `deg × π/180`, the page's first conversion. */
export function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** `cos(radians(deg))`: the right question. */
export function cosRight(degrees: number): number {
  return Math.cos(toRadians(degrees));
}

/** `cos(deg)`: degrees handed to a function that wanted radians. */
export function cosWrong(degrees: number): number {
  return Math.cos(degrees);
}

/** `RPM × 2π/60`, the page's angular-velocity conversion. */
export function rpmToRadPerSecond(rpm: number): number {
  return (rpm * 2 * Math.PI) / 60;
}

const degOf = (values: LabValues) => numberAt(values, 'deg', 90);
const rpmOf = (values: LabValues) => numberAt(values, 'rpm', 30);

export const radianConvertLab: LabSpec = {
  testid: 'bridge-radian-convert',
  title: 'Degrees are not radians',
  prompt: 'cos(90) is −0.4481. cos(radians(90)) is 0.0000. Same function, different question.',
  controls: [
    { kind: 'range', id: 'deg', label: 'angle', unit: '°', min: 0, max: 360, step: 5, start: 90 },
    { kind: 'range', id: 'rpm', label: 'motor speed', unit: 'RPM', min: 0, max: 300, step: 10, start: 30 },
  ],
  pair: { wrong: 'cos_wrong', right: 'cos_right', wrongLabel: 'degrees', rightLabel: 'radians' },
  readouts: [
    {
      id: 'cos_right',
      label: 'cos(radians)',
      text: (values) => cosRight(degOf(values)).toFixed(4),
      note: (values) => `cos(${toRadians(degOf(values)).toFixed(4)})`,
    },
    {
      id: 'cos_wrong',
      label: 'cos(degrees)',
      text: (values) => cosWrong(degOf(values)).toFixed(4),
      note: () => 'the number a degree fed straight in leaves behind',
    },
    {
      id: 'rad',
      label: 'In radians',
      text: (values) => toRadians(degOf(values)).toFixed(4),
      unit: 'rad',
      note: (values) => `${degOf(values)} × π / 180`,
    },
    {
      id: 'omega',
      label: 'Angular speed',
      text: (values) => rpmToRadPerSecond(rpmOf(values)).toFixed(4),
      unit: 'rad/s',
      note: (values) => `${rpmOf(values)} × 2π / 60`,
    },
  ],
  mark: {
    readout: 'cos_right',
    value: (values) => cosRight(degOf(values)),
    ladder: [0, 1, -1, 0.7071, -0.7071],
    tolerance: 0.02,
    format: (target) => target.toFixed(4),
  },
  verdict: (values) => {
    const degrees = degOf(values);
    return `${degrees}° is ${toRadians(degrees).toFixed(4)} rad; the cosine is ${cosRight(degrees).toFixed(
      4
    )}. Hand ${degrees} to cos() and you get ${cosWrong(degrees).toFixed(4)} instead.`;
  },
};
