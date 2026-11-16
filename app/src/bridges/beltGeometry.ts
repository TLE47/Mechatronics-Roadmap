/**
 * 19.10 mm is the pitch radius, not the pulley's outside (`app/src/bridges/beltGeometry.ts`).
 *
 * Lesson 02.5's Bridge Notes builds the joint around a GT2 belt with `p = 2.0 mm`: the pitch radius
 * is `r_p = N_teeth · p / 2π`, the ratio is `N_driven / N_driver`, and the belt force is `τ / r_p` —
 * the number that decides whether the pin needs two bearings. The beginner mistake is measuring the
 * pulley with calipers and using the outside radius, which understates the force by about 7 %: the
 * page's reason double shear matters, hidden in a rounding-sized difference.
 *
 * The card prints both forces from the same torque.
 */
import type { LabSpec, LabValues } from './bridgeLab.ts';
import { numberAt } from './bridgeLab.ts';

/** The page's GT2 pitch and pulley sizes. */
export const PITCH_MM = 2;
export const DRIVER_TEETH = 20;
export const DRIVEN_TEETH = 60;
export const TORQUE_NM = 1.5;

/** The page's bore and bearing boss. */
export const BORE_MM = 3.2;
export const BOSS_MM = 22.1;

/** `N_teeth · p / (2π)`, in millimetres. */
export function pitchRadiusMm(teeth: number, pitch = PITCH_MM): number {
  return (teeth * pitch) / (2 * Math.PI);
}

/** `N_driven / N_driver`. */
export function ratio(driven: number, driver = DRIVER_TEETH): number {
  return driven / driver;
}

/** `τ / r`, with the torque in N·m and the radius in millimetres. */
export function beltForce(torque: number, radiusMm: number): number {
  if (!Number.isFinite(radiusMm) || radiusMm <= 0) return 0;
  return torque / (radiusMm / 1000);
}

const teethOf = (values: LabValues) => numberAt(values, 'teeth_driven', DRIVEN_TEETH);
const torqueOf = (values: LabValues) => numberAt(values, 'torque', TORQUE_NM);

export const beltGeometryLab: LabSpec = {
  testid: 'bridge-belt-geometry',
  title: 'Pitch radius, not outside',
  prompt: '60 teeth on 2.0 mm pitch is r = 19.10 mm. Calipers read the outside, and the force is wrong.',
  controls: [
    { kind: 'range', id: 'teeth_driven', label: 'driven pulley teeth', unit: '', min: 20, max: 80, step: 1, start: DRIVEN_TEETH },
    { kind: 'range', id: 'torque', label: 'torque', unit: 'N·m', min: 0.5, max: 3, step: 0.1, start: TORQUE_NM },
  ],
  pair: { wrong: 'outside_force', right: 'force', wrongLabel: 'outside radius', rightLabel: 'pitch radius' },
  readouts: [
    {
      id: 'force',
      label: 'Belt force',
      text: (values) => beltForce(torqueOf(values), pitchRadiusMm(teethOf(values))).toFixed(1),
      unit: 'N',
      note: (values) => `${torqueOf(values)} / ${(pitchRadiusMm(teethOf(values)) / 1000).toFixed(5)}`,
    },
    {
      id: 'outside_force',
      label: 'Force, outside radius',
      text: (values) =>
        beltForce(torqueOf(values), pitchRadiusMm(teethOf(values)) + 1.4).toFixed(1),
      unit: 'N',
      note: () => 'the 1.4 mm of tooth the calipers include',
    },
    {
      id: 'r_p',
      label: 'Pitch radius',
      text: (values) => pitchRadiusMm(teethOf(values)).toFixed(2),
      unit: 'mm',
      note: (values) => `${teethOf(values)} × 2.0 / 2π`,
    },
    {
      id: 'ratio',
      label: 'Ratio',
      text: (values) => ratio(teethOf(values)).toFixed(2),
      unit: ':1',
      note: (values) => `${teethOf(values)} / ${DRIVER_TEETH}`,
    },
    {
      id: 'fits',
      label: 'Pin and boss',
      text: () => `${BORE_MM.toFixed(1)} mm bore, ${BOSS_MM.toFixed(1)} mm for the 608`,
      note: () => 'the page\'s two printed fits',
    },
  ],
  mark: {
    readout: 'force',
    value: (values) => beltForce(torqueOf(values), pitchRadiusMm(teethOf(values))),
    ladder: [78.5, 73.2, 39.3, 157, 19.6],
    tolerance: 0.8,
    format: (target) => target.toFixed(1),
  },
  verdict: (values) => {
    const r = pitchRadiusMm(teethOf(values));
    return `r_p is ${r.toFixed(2)} mm, so ${torqueOf(values)} N·m pulls ${beltForce(
      torqueOf(values),
      r
    ).toFixed(1)} N. Measuring the outside instead says ${beltForce(torqueOf(values), r + 1.4).toFixed(
      1
    )} N, and that is the bearing you undersize.`;
  },
};
