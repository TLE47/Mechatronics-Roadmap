/**
 * A rotation is a multiplication (`app/src/bridges/arrowMultiply.ts`).
 *
 * Lesson R.5's Bridge Notes reduces every AC quantity to one arrow per frequency: `|z|` is a length
 * and can never be negative, and `cmath.phase` hands back radians unless you convert. The two
 * beginner bugs are exactly those — a degrees/radians mix-up and a sign read as a length — so the
 * card prints the arrow's real and imaginary parts next to the degrees-fed-straight-in cosine.
 */
import type { LabSpec, LabValues } from './bridgeLab.ts';
import { numberAt, toggleAt } from './bridgeLab.ts';

/** The page's example arrow. */
export const MAG = 2;
export const PHASE_DEG = 90;

/** `deg × π/180`, the conversion `cmath.phase` already did for you. */
export function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** The real part of the arrow, after converting the angle. */
export function realPart(mag: number, degrees: number): number {
  return mag * Math.cos(toRadians(degrees));
}

/** The imaginary part of the arrow, after converting the angle. */
export function imaginaryPart(mag: number, degrees: number): number {
  return mag * Math.sin(toRadians(degrees));
}

/** `cos(deg)` with degrees handed to a function that wanted radians: the page's warning. */
export function mixedCosine(mag: number, degrees: number): number {
  return mag * Math.cos(degrees);
}

const magOf = (values: LabValues) => numberAt(values, 'mag', MAG);
const phaseOf = (values: LabValues) => numberAt(values, 'phase_deg', PHASE_DEG);

export const arrowMultiplyLab: LabSpec = {
  testid: 'bridge-arrow-multiply',
  title: 'One arrow, two parts',
  prompt: '2.0 at 90° is 0.000 + 2.000j. Hand 90 to cos() and the arrow points the wrong way.',
  controls: [
    { kind: 'range', id: 'mag', label: 'length', unit: '', min: 0, max: 5, step: 0.1, start: MAG },
    { kind: 'range', id: 'phase_deg', label: 'angle', unit: '°', min: -180, max: 180, step: 5, start: PHASE_DEG },
    { kind: 'toggle', id: 'convert', label: 'convert to radians', start: true },
  ],
  pair: { wrong: 'mixed', right: 'real', wrongLabel: 'degrees in', rightLabel: 'radians in' },
  readouts: [
    {
      id: 'real',
      label: 'Real part',
      text: (values) => realPart(magOf(values), phaseOf(values)).toFixed(3),
      note: () => '|z| · cos(phase)',
    },
    {
      id: 'mixed',
      label: 'Real, degrees in',
      text: (values) => mixedCosine(magOf(values), phaseOf(values)).toFixed(3),
      note: () => 'cos(90) is −0.448, not 0',
    },
    {
      id: 'imag',
      label: 'Imaginary part',
      text: (values) => imaginaryPart(magOf(values), phaseOf(values)).toFixed(3),
      note: () => '|z| · sin(phase)',
    },
    {
      id: 'length',
      label: 'Length',
      text: (values) => Math.hypot(realPart(magOf(values), phaseOf(values)), imaginaryPart(magOf(values), phaseOf(values))).toFixed(3),
      note: () => 'abs(z): never negative',
    },
    {
      id: 'phase',
      label: 'Phase in radians',
      text: (values) => toRadians(phaseOf(values)).toFixed(4),
      unit: 'rad',
      note: (values) => `${phaseOf(values)} × π / 180`,
    },
    {
      id: 'converted',
      label: 'Conversion',
      text: (values) => (toggleAt(values, 'convert') ? 'on' : 'off'),
      note: () => 'the switch the two real parts differ by',
    },
  ],
  mark: {
    readout: 'imag',
    value: (values) => imaginaryPart(magOf(values), phaseOf(values)),
    ladder: [2, 0, 1.414, -2, 1],
    tolerance: 0.02,
    format: (target) => target.toFixed(3),
  },
  verdict: (values) =>
    `The arrow is ${realPart(magOf(values), phaseOf(values)).toFixed(3)} + ${imaginaryPart(
      magOf(values),
      phaseOf(values)
    ).toFixed(3)}j; its length stays ${Math.hypot(
      realPart(magOf(values), phaseOf(values)),
      imaginaryPart(magOf(values), phaseOf(values))
    ).toFixed(3)} and its phase is radians.`,
};
