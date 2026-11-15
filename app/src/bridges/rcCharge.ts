/**
 * Sixty-three percent, then eighty-six, then ninety-nine (`app/src/bridges/rcCharge.ts`).
 *
 * Lesson S0.6's Bridge Notes works one capacitor: `R = 10 kΩ` into `C = 100 µF` is `τ = RC = 1.0 s`,
 * and on a `5.0 V` rail that is `3.16 V` after one second (`63.2 %`), `4.32 V` after two (`86.5 %`)
 * and `4.97 V` after five (`99.3 %`). The page's warning is the shape: a capacitor does not ramp —
 * it charges fastest at the start and takes forever to finish, which is why the last percent of an
 * ADC reading settles so slowly.
 *
 * The card draws the exponential and the straight line from the same tau and time, so the
 * difference is a reading: at `t = τ` the real capacitor is at `63.2 %` while the line claims
 * `100 %`, and the mark follows the page's own three points.
 *
 * Pure functions; the page's `10 kΩ`, `100 µF`, `5.0 V` and one second are the start values.
 */
import type { LabSpec, LabValues } from './bridgeLab.ts';
import { numberAt } from './bridgeLab.ts';

/** The page's charging circuit. */
export const RESISTANCE_OHM = 10_000;
export const CAPACITANCE_UF = 100;
export const SUPPLY_V = 5;
export const TIME_S = 1;

/** `τ = R · C`, in seconds (the capacitor is given in microfarads). */
export function timeConstant(resistanceOhm: number, capacitanceMicro: number): number {
  if (!(resistanceOhm > 0) || !(capacitanceMicro > 0)) return 0;
  return resistanceOhm * capacitanceMicro * 1e-6;
}

/** `1 − e^(−t/τ)`: the fraction of the supply the plates have reached. */
export function chargeFraction(elapsedS: number, tauS: number): number {
  if (!(tauS > 0) || !Number.isFinite(elapsedS)) return 0;
  return 1 - Math.exp(-elapsedS / tauS);
}

/** The capacitor's voltage, in volts. */
export function capacitorVolts(elapsedS: number, tauS: number, supplyV: number): number {
  if (!Number.isFinite(supplyV)) return 0;
  return supplyV * chargeFraction(elapsedS, tauS);
}

/** The straight-line guess `t/τ`, held at 1: what a learner expects before seeing the curve. */
export function linearEstimate(elapsedS: number, tauS: number): number {
  if (!(tauS > 0) || !Number.isFinite(elapsedS)) return 0;
  return Math.min(1, Math.max(0, elapsedS / tauS));
}

const resistanceOf = (values: LabValues) => numberAt(values, 'resistance', RESISTANCE_OHM);
const capacitanceOf = (values: LabValues) => numberAt(values, 'capacitance', CAPACITANCE_UF);
const timeOf = (values: LabValues) => numberAt(values, 'time_s', TIME_S);
const tauOf = (values: LabValues) => timeConstant(resistanceOf(values), capacitanceOf(values));
const fractionOf = (values: LabValues) => chargeFraction(timeOf(values), tauOf(values));

export const rcChargeLab: LabSpec = {
  testid: 'bridge-rc-charge',
  title: 'The curve, not the ramp',
  prompt: '10 kΩ and 100 µF is τ = 1.00 s: 63.2 % at one second, 86.5 % at two, 99.3 % at five.',
  controls: [
    { kind: 'range', id: 'resistance', label: 'resistor R', unit: 'Ω', min: 1000, max: 47000, step: 1000, start: RESISTANCE_OHM },
    { kind: 'range', id: 'capacitance', label: 'capacitor C', unit: 'µF', min: 10, max: 470, step: 10, start: CAPACITANCE_UF },
    { kind: 'range', id: 'time_s', label: 'time since switch', unit: 's', min: 0, max: 5, step: 0.1, start: TIME_S },
  ],
  pair: { wrong: 'linear', right: 'curve', wrongLabel: 'straight line', rightLabel: '1 − e^(−t/τ)' },
  readouts: [
    {
      id: 'tau',
      label: 'Time constant',
      text: (values) => tauOf(values).toFixed(2),
      unit: 's',
      note: (values) => `${resistanceOf(values)} Ω × ${capacitanceOf(values)} µF`,
    },
    {
      id: 'curve',
      label: 'Charged, exponential',
      text: (values) => (fractionOf(values) * SUPPLY_V).toFixed(2),
      unit: 'V',
      note: (values) => `${(fractionOf(values) * 100).toFixed(1)} % of ${SUPPLY_V.toFixed(1)} V`,
    },
    {
      id: 'linear',
      label: 'Charged, straight line',
      text: (values) => (linearEstimate(timeOf(values), tauOf(values)) * SUPPLY_V).toFixed(2),
      unit: 'V',
      note: (values) => `${(linearEstimate(timeOf(values), tauOf(values)) * 100).toFixed(1)} % — the guess that arrives on time`,
    },
    {
      id: 'percent',
      label: 'Each τ adds',
      text: (values) => (fractionOf(values) * 100).toFixed(1),
      unit: '%',
      note: () => '63.2 % → 86.5 % → 99.3 %: the steps shrink, the target never quite arrives',
    },
  ],
  mark: {
    readout: 'percent',
    value: (values) => fractionOf(values) * 100,
    ladder: [63.2, 86.5, 99.3, 39.3, 77.7],
    tolerance: 0.5,
    format: (target) => `${target.toFixed(1)} %`,
  },
  verdict: (values) => {
    const tau = tauOf(values);
    return `τ = ${tau.toFixed(2)} s, so at t = ${timeOf(values).toFixed(1)} s the capacitor is at ${(
      fractionOf(values) * 100
    ).toFixed(1)} % (${capacitorVolts(timeOf(values), tau, SUPPLY_V).toFixed(2)} V). A straight line would claim ${(
      linearEstimate(timeOf(values), tau) * 100
    ).toFixed(1)} %: the exponential is fastest first, which is why the last percent of a reading takes seconds.`;
  },
};
