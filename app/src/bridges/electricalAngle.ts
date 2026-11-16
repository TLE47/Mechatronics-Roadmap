/**
 * Degrees of shaft, degrees of magnet (`app/src/bridges/electricalAngle.ts`).
 *
 * Lesson 03.2's Bridge Notes says `θe = Np · θm` and then spends the rest of the section on the
 * commutation: the drive leads the rotor's electrical angle by `90°` (`π/2`), because torque goes
 * as `sin(Δθe)` — so a `90°` lead gives `100 %` of the torque and a `0°` lead gives `0 %`.
 *
 * The mistake the page warns about is using the mechanical angle where the electrical one belongs.
 * At `Np = 4` and `θm = 30°` the correct electrical angle is `120°`, the drive is `210°`, and the
 * lead is still `90°`; the mechanical-only code drives at `120°` instead, the lead is `0°`, and the
 * motor makes no torque while the windings heat. Both readings come from the same controls.
 *
 * Pure functions; the page's four-pole-pair motor at `30°` of shaft is the start.
 */
import type { LabSpec, LabValues } from './bridgeLab.ts';
import { choiceAt, numberAt } from './bridgeLab.ts';

/** Pole pairs a beginner meets: a gimbal, a small drone motor, the page's, a hub motor. */
export const POLE_PAIRS = [
  { value: '1', label: '1 pair' },
  { value: '2', label: '2 pairs' },
  { value: '4', label: '4 pairs (page)' },
  { value: '7', label: '7 pairs' },
] as const;

export const START_POLES = '4';
export const START_MECH_DEG = 30;

/** The page's commutation lead. */
export const TORQUE_LEAD_DEG = 90;

/** `θe = Np · θm`, in degrees. */
export function electricalAngle(mechDeg: number, polePairs: number): number {
  if (!Number.isFinite(mechDeg) || !(polePairs > 0)) return 0;
  return mechDeg * polePairs;
}

/** The same angle inside one electrical revolution, `0 … 360°`. */
export function wrapDegrees(angle: number): number {
  if (!Number.isFinite(angle)) return 0;
  return ((angle % 360) + 360) % 360;
}

/** The page's drive command: the electrical angle plus the 90° lead. */
export function driveElectricalDeg(mechDeg: number, polePairs: number): number {
  return electricalAngle(mechDeg, polePairs) + TORQUE_LEAD_DEG;
}

/** The drive a program computes when it uses the mechanical angle and forgets `Np`. */
export function driveMechanicalDeg(mechDeg: number): number {
  return mechDeg + TORQUE_LEAD_DEG;
}

/** Torque per amp as a fraction of the available torque: `sin(Δθe)`. */
export function torqueFraction(deltaDeg: number): number {
  if (!Number.isFinite(deltaDeg)) return 0;
  return Math.sin((deltaDeg * Math.PI) / 180);
}

/** The lead the correct drive leaves: always the page's 90°. */
export function leadElectricalDeg(mechDeg: number, polePairs: number): number {
  return driveElectricalDeg(mechDeg, polePairs) - electricalAngle(mechDeg, polePairs);
}

/** The lead the mechanical-only drive leaves: `90° − (Np − 1)·θm`, which cancels at θm = 90/(Np−1). */
export function leadMechanicalDeg(mechDeg: number, polePairs: number): number {
  return driveMechanicalDeg(mechDeg) - electricalAngle(mechDeg, polePairs);
}

const polesOf = (values: LabValues) => Number(choiceAt(values, 'poles', START_POLES));
const mechOf = (values: LabValues) => numberAt(values, 'mech_deg', START_MECH_DEG);

export const electricalAngleLab: LabSpec = {
  testid: 'bridge-electrical-angle',
  title: 'The angle the magnets see',
  prompt: '4 pole pairs turn 30° of shaft into 120° electrical. The drive leads by 90° — or by nothing.',
  controls: [
    { kind: 'range', id: 'mech_deg', label: 'shaft angle', unit: '°', min: 0, max: 360, step: 5, start: START_MECH_DEG },
    { kind: 'choice', id: 'poles', label: 'pole pairs Np', options: POLE_PAIRS, start: START_POLES },
  ],
  pair: { wrong: 'torque_mech', right: 'torque', wrongLabel: 'drive = θm + 90°', rightLabel: 'drive = θe + 90°' },
  readouts: [
    {
      id: 'theta_e',
      label: 'Electrical angle',
      text: (values) => electricalAngle(mechOf(values), polesOf(values)).toFixed(1),
      unit: '°',
      note: (values) => `${polesOf(values)} × ${mechOf(values)}°`,
    },
    {
      id: 'theta_e_wrapped',
      label: 'Inside one e-rev',
      text: (values) => wrapDegrees(electricalAngle(mechOf(values), polesOf(values))).toFixed(1),
      unit: '°',
      note: () => 'what a table of sine values is indexed by',
    },
    {
      id: 'torque',
      label: 'Torque per amp',
      text: (values) => (torqueFraction(leadElectricalDeg(mechOf(values), polesOf(values))) * 100).toFixed(1),
      unit: '%',
      note: (values) => `lead = ${leadElectricalDeg(mechOf(values), polesOf(values)).toFixed(1)}°`,
    },
    {
      id: 'torque_mech',
      label: 'Torque with θm in the drive',
      text: (values) => (torqueFraction(leadMechanicalDeg(mechOf(values), polesOf(values))) * 100).toFixed(1),
      unit: '%',
      note: (values) => `lead = ${leadMechanicalDeg(mechOf(values), polesOf(values)).toFixed(1)}° — current with no torque`,
    },
  ],
  mark: {
    readout: 'theta_e',
    value: (values) => electricalAngle(mechOf(values), polesOf(values)),
    ladder: [120, 0, 180, 360, 40],
    tolerance: 3,
    format: (target) => target.toFixed(1),
  },
  verdict: (values) => {
    const right = torqueFraction(leadElectricalDeg(mechOf(values), polesOf(values))) * 100;
    const wrong = torqueFraction(leadMechanicalDeg(mechOf(values), polesOf(values))) * 100;
    return `θe = ${polesOf(values)} × ${mechOf(values)}° = ${electricalAngle(mechOf(values), polesOf(values)).toFixed(
      1
    )}°. Leading it by 90° gives ${right.toFixed(1)} % torque; leading the mechanical angle gives ${wrong.toFixed(
      1
    )} % — the same current, ${Math.abs(right - wrong) < 0.05 ? 'and the same result here, because the shaft is at 0°' : 'and only heat in the windings'}.`;
  },
};
