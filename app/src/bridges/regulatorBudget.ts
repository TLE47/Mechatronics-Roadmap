/**
 * An LDO turns the difference into heat (`app/src/bridges/regulatorBudget.ts`).
 *
 * Lesson 01.3's Bridge Notes compares the same 12.0 V → 5.0 V, 0.50 A job two ways: the linear
 * regulator passes the full load current and burns the 7.0 V drop as `3.50 W`, while the 90 % buck
 * draws `0.231 A` from the pack and wastes `0.28 W`. The card prints both losses side by side from
 * one load, so the 12.5× difference is a number the learner moves rather than a claim they agree
 * with.
 */
import type { LabSpec, LabValues } from './bridgeLab.ts';
import { numberAt } from './bridgeLab.ts';

/** The page's rail, load and converter efficiency. */
export const V_IN = 12;
export const V_OUT = 5;
export const I_LOAD = 0.5;
export const EFFICIENCY = 0.9;

/** `(Vin − Vout) · Iload`: all of it becomes heat in the pass transistor. */
export function ldoHeat(vin: number, vout: number, load: number): number {
  return Math.max(0, vin - vout) * load;
}

/** `Vout · Iload / (η · Vin)`: what the pack actually supplies to the buck. */
export function buckInputCurrent(vin: number, vout: number, load: number, eta = EFFICIENCY): number {
  if (!Number.isFinite(vin) || vin <= 0) return 0;
  return (vout * load) / (eta * vin);
}

/** `Vin · Iin − Vout · Iload`: the converter's own loss, the rest went to the load. */
export function buckHeat(vin: number, vout: number, load: number, eta = EFFICIENCY): number {
  return vin * buckInputCurrent(vin, vout, load, eta) - vout * load;
}

const loadOf = (values: LabValues) => numberAt(values, 'i_load', I_LOAD);
const vinOf = (values: LabValues) => numberAt(values, 'v_in', V_IN);

export const regulatorBudgetLab: LabSpec = {
  testid: 'bridge-regulator-budget',
  title: 'Heat is a budget line',
  prompt: '12.0 V to 5.0 V at 0.50 A: the LDO burns 3.50 W, the buck wastes 0.28 W.',
  controls: [
    { kind: 'range', id: 'i_load', label: 'load current', unit: 'A', min: 0.1, max: 1, step: 0.05, start: I_LOAD },
    { kind: 'range', id: 'v_in', label: 'pack', unit: 'V', min: 6, max: 24, step: 0.5, start: V_IN },
  ],
  pair: { wrong: 'ldo_w', right: 'buck_w', wrongLabel: 'LDO heat', rightLabel: 'buck loss' },
  readouts: [
    {
      id: 'ldo_w',
      label: 'LDO heat',
      text: (values) => ldoHeat(vinOf(values), V_OUT, loadOf(values)).toFixed(2),
      unit: 'W',
      note: (values) => `(${vinOf(values)} − 5.0) × ${loadOf(values)}`,
    },
    {
      id: 'buck_w',
      label: 'Buck loss',
      text: (values) => buckHeat(vinOf(values), V_OUT, loadOf(values)).toFixed(2),
      unit: 'W',
      note: () => 'the rest of the pack current reaches the load',
    },
    {
      id: 'buck_i_in',
      label: 'Buck pack current',
      text: (values) => buckInputCurrent(vinOf(values), V_OUT, loadOf(values)).toFixed(3),
      unit: 'A',
      note: () => 'η = 90 %',
    },
    {
      id: 'pack_a',
      label: 'Motor + rail',
      text: (values) => (3 + buckInputCurrent(vinOf(values), V_OUT, loadOf(values))).toFixed(3),
      unit: 'A',
      note: () => 'the 3.0 A motor plus this rail',
    },
  ],
  mark: {
    readout: 'ldo_w',
    value: (values) => ldoHeat(vinOf(values), V_OUT, loadOf(values)),
    ladder: [3.5, 0.28, 1.75, 7, 0],
    tolerance: 0.04,
    format: (target) => target.toFixed(2),
  },
  verdict: (values) => {
    const heat = ldoHeat(vinOf(values), V_OUT, loadOf(values));
    const buck = buckHeat(vinOf(values), V_OUT, loadOf(values));
    return `${heat.toFixed(2)} W in the regulator is ${(heat / Math.max(buck, 1e-9)).toFixed(
      1
    )}× the buck's ${buck.toFixed(2)} W: the pack pays for the difference.`;
  },
};
