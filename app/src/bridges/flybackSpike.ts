/**
 * Five hundred volts where the diode should be (`app/src/bridges/flybackSpike.ts`).
 *
 * Lesson 01.1's Bridge Notes gives two numbers from the same coil: switching `2.0 A` off in
 * `2.0 µs` through `0.5 mH` on a `12.0 V` rail makes `500.0 V` of inductive kickback, so the Drain
 * sees `512.0 V` — and a `60 V` MOSFET does not survive it. The flyback diode gives that current a
 * loop and clamps the same node at `12.0 + 0.7 = 12.7 V`. The page's third number is the cost of
 * leaving the MOSFET on: `I² R_DS(on) = 80.0 mW` at `2.0 A` through `0.02 Ω`.
 *
 * The card keeps the spike and the clamp side by side from one set of controls, so the pair is the
 * page's own warning: the same coil, the same current, a destroyed part or a safe one depending on
 * one diode. The mark chases the conduction heat, which is the number the learner can lower by
 * choosing a better MOSFET.
 *
 * Pure functions; the page's `0.5 mH`, `2.0 A`, `2.0 µs` and `12.0 V` are the start values.
 */
import type { LabSpec, LabValues } from './bridgeLab.ts';
import { numberAt } from './bridgeLab.ts';

/** The page's switching case. */
export const SUPPLY_V = 12;
export const INDUCTANCE_MH = 0.5;
export const CURRENT_A = 2;
export const SWITCH_OFF_US = 2;
export const RDS_ON_OHM = 0.02;
export const DIODE_DROP_V = 0.7;

/** The part the page says the unclamped spike destroys. */
export const MOSFET_LIMIT_V = 60;

/** `V_Drain = V_supply + L · ΔI/Δt`, in volts. A zero switch time is not a measurement. */
export function inductiveKickbackVoltage(
  supplyV: number,
  inductanceH: number,
  currentA: number,
  switchOffS: number
): number {
  if (!(switchOffS > 0) || !Number.isFinite(supplyV) || !Number.isFinite(inductanceH) || !Number.isFinite(currentA)) {
    return 0;
  }
  return supplyV + inductanceH * (currentA / switchOffS);
}

/** `V_supply + V_f`: where the flyback diode holds the Drain. */
export function clampVoltage(supplyV: number): number {
  if (!Number.isFinite(supplyV)) return 0;
  return supplyV + DIODE_DROP_V;
}

/** `I² R_DS(on)`: the heat the MOSFET makes while it is on, in watts. */
export function conductionLoss(currentA: number, rdsOnOhm: number): number {
  if (!Number.isFinite(currentA) || !Number.isFinite(rdsOnOhm)) return 0;
  return currentA * currentA * rdsOnOhm;
}

/** Whether a part rated `limitV` survives the node voltage. */
export function survives(voltage: number, limitV: number): boolean {
  return Number.isFinite(voltage) && voltage <= limitV;
}

const inductanceOf = (values: LabValues) => numberAt(values, 'inductance_mh', INDUCTANCE_MH) * 1e-3;
const currentOf = (values: LabValues) => numberAt(values, 'current', CURRENT_A);
const switchOffOf = (values: LabValues) => numberAt(values, 'switch_off_us', SWITCH_OFF_US) * 1e-6;
const supplyOf = (values: LabValues) => numberAt(values, 'supply', SUPPLY_V);
const spikeOf = (values: LabValues) =>
  inductiveKickbackVoltage(supplyOf(values), inductanceOf(values), currentOf(values), switchOffOf(values));

export const flybackSpikeLab: LabSpec = {
  testid: 'bridge-flyback-spike',
  title: 'The spike and the clamp',
  prompt: '0.5 mH at 2.0 A switched off in 2.0 µs is 512.0 V on the Drain. The diode holds it at 12.7 V.',
  controls: [
    { kind: 'range', id: 'supply', label: 'supply', unit: 'V', min: 5, max: 24, step: 1, start: SUPPLY_V },
    { kind: 'range', id: 'inductance_mh', label: 'coil L', unit: 'mH', min: 0.1, max: 2, step: 0.1, start: INDUCTANCE_MH },
    { kind: 'range', id: 'current', label: 'current at turn-off', unit: 'A', min: 0.5, max: 5, step: 0.1, start: CURRENT_A },
    { kind: 'range', id: 'switch_off_us', label: 'switch-off time', unit: 'µs', min: 0.5, max: 5, step: 0.5, start: SWITCH_OFF_US },
  ],
  pair: { wrong: 'spike', right: 'clamp', wrongLabel: 'no diode', rightLabel: 'flyback' },
  readouts: [
    {
      id: 'spike',
      label: 'Drain at turn-off',
      text: (values) => spikeOf(values).toFixed(1),
      unit: 'V',
      note: (values) =>
        `${MOSFET_LIMIT_V} V part: ${survives(spikeOf(values), MOSFET_LIMIT_V) ? 'survives' : 'destroyed'}`,
    },
    {
      id: 'clamp',
      label: 'With flyback diode',
      text: (values) => clampVoltage(supplyOf(values)).toFixed(1),
      unit: 'V',
      note: () => 'supply + the diode’s 0.7 V drop',
    },
    {
      id: 'loss',
      label: 'MOSFET heat on',
      text: (values) => (conductionLoss(currentOf(values), RDS_ON_OHM) * 1000).toFixed(1),
      unit: 'mW',
      note: (values) => `${currentOf(values).toFixed(1)}² × ${RDS_ON_OHM} Ω`,
    },
  ],
  mark: {
    readout: 'loss',
    value: (values) => conductionLoss(currentOf(values), RDS_ON_OHM),
    ladder: [0.08, 0.5, 0.02, 0.18, 0.32],
    tolerance: 0.002,
    format: (target) => `${(target * 1000).toFixed(1)} mW`,
  },
  verdict: (values) => {
    const spike = spikeOf(values);
    return `${spike.toFixed(1)} V at turn-off against a ${MOSFET_LIMIT_V} V part: ${
      survives(spike, MOSFET_LIMIT_V) ? 'inside the rating' : 'the part fails'
    }. The diode holds the same node at ${clampVoltage(supplyOf(values)).toFixed(1)} V, and the coil's ${currentOf(
      values
    ).toFixed(1)} A costs ${(conductionLoss(currentOf(values), RDS_ON_OHM) * 1000).toFixed(1)} mW of heat while it flows.`;
  },
};
