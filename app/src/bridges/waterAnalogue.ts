/**
 * Pressure without flow does nothing (`app/src/bridges/waterAnalogue.ts`).
 *
 * Lesson S0.0's Bridge Notes is the table that maps the water loop onto the circuit: pump push is
 * effort (V), stream rate is flow (A), the constriction is opposition (Ω), and the return tank is
 * the 0 V / 0 Pa reference. The card turns the table into one loop the learner can open: with the
 * pump pushing 9.0 V and the pipe broken, the flow is 0.000 A and the power is 0.00 W, which is the
 * page's "pressure without flow" claim as a number.
 */
import type { LabSpec, LabValues } from './bridgeLab.ts';
import { numberAt, toggleAt } from './bridgeLab.ts';

/** The page's water-model numbers. */
export const EFFORT_V = 9;
export const OPPOSITION_OHM = 100;

/** `effort / opposition`, or zero when the loop is open. */
export function flowAmps(effort: number, opposition: number, open: boolean): number {
  if (open) return 0;
  if (!Number.isFinite(opposition) || opposition <= 0) return 0;
  return effort / opposition;
}

/** `effort × flow`: watts, or the water analogue of it. */
export function powerWatts(effort: number, flow: number): number {
  return effort * flow;
}

const effortOf = (values: LabValues) => numberAt(values, 'effort_v', EFFORT_V);
const oppositionOf = (values: LabValues) => numberAt(values, 'opposition_ohm', OPPOSITION_OHM);
const openOf = (values: LabValues) => toggleAt(values, 'open_loop');

export const waterAnalogueLab: LabSpec = {
  testid: 'bridge-water-analogue',
  title: 'Pressure, flow, and work',
  prompt: '9.0 V with 0.0 A is 0.0 W: the pump pushes and nothing moves.',
  controls: [
    { kind: 'range', id: 'effort_v', label: 'pump push', unit: 'V', min: 0, max: 12, step: 0.5, start: EFFORT_V },
    { kind: 'range', id: 'opposition_ohm', label: 'constriction', unit: 'Ω', min: 1, max: 1000, step: 1, start: OPPOSITION_OHM },
    { kind: 'toggle', id: 'open_loop', label: 'break the pipe', start: false },
  ],
  pair: { wrong: 'power_no_flow', right: 'power_w', wrongLabel: 'pressure only', rightLabel: 'flowing' },
  readouts: [
    {
      id: 'flow_a',
      label: 'Flow',
      text: (values) => flowAmps(effortOf(values), oppositionOf(values), openOf(values)).toFixed(3),
      unit: 'A',
      note: (values) => `V / R = ${effortOf(values)} / ${oppositionOf(values)}`,
    },
    {
      id: 'power_w',
      label: 'Power',
      text: (values) =>
        powerWatts(
          effortOf(values),
          flowAmps(effortOf(values), oppositionOf(values), openOf(values))
        ).toFixed(2),
      unit: 'W',
      note: () => 'effort × flow',
    },
    {
      id: 'power_no_flow',
      label: 'Pressure alone',
      text: () => '0.00',
      unit: 'W',
      note: () => 'voltage is not work until charge moves',
    },
    {
      id: 'reference',
      label: 'Return tank',
      text: () => '0',
      unit: 'V',
      note: () => '0 Pa in the water model: the reference everything is measured against',
    },
  ],
  mark: {
    readout: 'power_w',
    value: (values) =>
      powerWatts(effortOf(values), flowAmps(effortOf(values), oppositionOf(values), openOf(values))),
    ladder: [0.81, 0, 1.62, 0.41, 4.86],
    tolerance: 0.02,
    format: (target) => target.toFixed(2),
  },
  verdict: (values) => {
    const flow = flowAmps(effortOf(values), oppositionOf(values), openOf(values));
    if (openOf(values)) {
      return 'Open: the pump still pushes 9.0 V, the flow is 0.000 A, and 0.00 W is being done.';
    }
    return `${effortOf(values)} V across ${oppositionOf(values)} Ω is ${flow.toFixed(
      3
    )} A, so ${(effortOf(values) * flow).toFixed(2)} W is moving.`;
  },
};
