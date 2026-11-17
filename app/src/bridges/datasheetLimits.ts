/**
 * Recommended is a limit; absolute maximum is a dare (`app/src/bridges/datasheetLimits.ts`).
 *
 * Lesson P.13's Bridge Notes prints both columns for the two drivers a beginner will hold: the
 * `DRV8833` recommends 2.7–10.8 V and dies at 11.8 V, while the `TB6612FNG` recommends 4.5–13.5 V
 * and dies at 15.0 V. A 12.0 V pack is 1.2 V past the first driver's recommended top *and* past its
 * absolute maximum, and comfortably inside the second's — which is why the page's answer is "read
 * the table, then pick the part".
 *
 * The card shows both gaps at once, because the beginner trap is reading the bigger number as the
 * only limit.
 */
import type { LabSpec, LabValues } from './bridgeLab.ts';
import { choiceAt, numberAt } from './bridgeLab.ts';

/** The two tables the page compares, in volts. */
export const DRIVERS = {
  drv8833: { label: 'DRV8833', min: 2.7, recommended: 10.8, absolute: 11.8 },
  tb6612: { label: 'TB6612FNG', min: 4.5, recommended: 13.5, absolute: 15 },
} as const;

export type Driver = keyof typeof DRIVERS;

/** The page's supply. */
export const SUPPLY_V = 12;

/** Signed headroom against a limit: positive is inside it. */
export function headroom(supply: number, limit: number): number {
  return limit - supply;
}

/** Whether a supply is inside the recommended band. */
export function inRecommended(supply: number, driver: Driver): boolean {
  const table = DRIVERS[driver];
  return supply >= table.min && supply <= table.recommended;
}

const supplyOf = (values: LabValues) => numberAt(values, 'supply', SUPPLY_V);
const driverOf = (values: LabValues): Driver =>
  choiceAt(values, 'driver', 'tb6612') === 'drv8833' ? 'drv8833' : 'tb6612';

export const datasheetLimitsLab: LabSpec = {
  testid: 'bridge-datasheet-limits',
  title: 'Two limits, one column apart',
  prompt: '12.0 V is 1.2 V past the DRV8833 recommended top, and past its 11.8 V absolute maximum.',
  controls: [
    { kind: 'range', id: 'supply', label: 'supply', unit: 'V', min: 3, max: 16, step: 0.1, start: SUPPLY_V },
    {
      kind: 'choice',
      id: 'driver',
      label: 'driver',
      options: [
        { value: 'drv8833', label: 'DRV8833' },
        { value: 'tb6612', label: 'TB6612FNG' },
      ],
      start: 'tb6612',
    },
  ],
  pair: { wrong: 'recommended_gap', right: 'absolute_gap', wrongLabel: 'recommended', rightLabel: 'absolute max' },
  readouts: [
    {
      id: 'recommended_gap',
      label: 'To recommended',
      text: (values) => headroom(supplyOf(values), DRIVERS[driverOf(values)].recommended).toFixed(1),
      unit: 'V',
      note: (values) => `top ${DRIVERS[driverOf(values)].recommended} V`,
    },
    {
      id: 'absolute_gap',
      label: 'To absolute max',
      text: (values) => headroom(supplyOf(values), DRIVERS[driverOf(values)].absolute).toFixed(1),
      unit: 'V',
      note: (values) => `top ${DRIVERS[driverOf(values)].absolute} V — the destruction rating`,
    },
    {
      id: 'state',
      label: 'Verdict',
      text: (values) => {
        const supply = supplyOf(values);
        const table = DRIVERS[driverOf(values)];
        if (supply > table.absolute) return 'over absolute maximum';
        if (supply > table.recommended) return 'over recommended';
        if (supply < table.min) return 'under recommended minimum';
        return 'recommended';
      },
      note: () => 'read down the two columns, not across one',
    },
    {
      id: 'minimum',
      label: 'Recommended min',
      text: (values) => DRIVERS[driverOf(values)].min.toFixed(1),
      unit: 'V',
      note: () => 'the other end of the recommended band',
    },
  ],
  mark: {
    readout: 'recommended_gap',
    value: (values) => headroom(supplyOf(values), DRIVERS[driverOf(values)].recommended),
    ladder: [1.5, -1.2, 0, 0.6, 3],
    tolerance: 0.15,
    format: (target) => target.toFixed(1),
  },
  verdict: (values) => {
    const supply = supplyOf(values);
    const table = DRIVERS[driverOf(values)];
    if (supply > table.absolute) {
      return `${supply.toFixed(1)} V is over the ${table.label}'s ${table.absolute} V absolute maximum: that is the destruction rating, not a margin.`;
    }
    if (supply > table.recommended) {
      return `${supply.toFixed(1)} V is ${(supply - table.recommended).toFixed(
        1
      )} V past the ${table.label}'s recommended top, with ${(table.absolute - supply).toFixed(
        1
      )} V left before absolute maximum.`;
    }
    return `${supply.toFixed(1)} V is inside the ${table.label}'s ${table.min}–${table.recommended} V band.`;
  },
};
