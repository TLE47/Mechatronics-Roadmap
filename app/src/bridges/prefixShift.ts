/**
 * A prefix is a factor, not a decoration (`app/src/bridges/prefixShift.ts`).
 *
 * Lesson P.7's Bridge Notes prints three conversions: `15 mm = 0.015 m`, `500 µs = 0.0005 s`, and
 * `4.7 kΩ = 4,700 Ω`. The factor is the whole lesson, and a factor is exactly what a paragraph
 * cannot make you *feel*: the card keeps the typed number (15) fixed in the control and shows the
 * base unit it becomes, with the multiplier spelled out beside it.
 *
 * Milli and micro are the two states the page contrasts, so they are a `choice` rather than a range:
 * dragging past 1,000 to reach micro would teach the wrong thing about the prefix.
 *
 * Pure functions; the card, the test and the page's own numbers all come from here.
 */
import { formatBaseUnit, type LabSpec, type LabValues } from './bridgeLab.ts';
import { choiceAt, numberAt } from './bridgeLab.ts';

/** The page's two prefixed examples, and the unit each becomes in base units. */
export const PREFIXES = {
  milli: { factor: 1e-3, times: '× 1,000', unit: 'm' },
  micro: { factor: 1e-6, times: '× 1,000,000', unit: 's' },
} as const;

export type Prefix = keyof typeof PREFIXES;

/** The page's other prefix in the same table: the ohm example that is *not* a conversion. */
export const KILO_EXAMPLE = 4_700;

/** The number the page starts from. */
export const START_VALUE = 15;

/** `value × factor`, in base units. */
export function toBase(value: number, prefix: Prefix): number {
  return value * PREFIXES[prefix].factor;
}

const valueOf = (values: LabValues) => numberAt(values, 'value', START_VALUE);
const prefixOf = (values: LabValues): Prefix =>
  choiceAt(values, 'prefix', 'milli') === 'micro' ? 'micro' : 'milli';

export const prefixShiftLab: LabSpec = {
  testid: 'bridge-prefix-shift',
  title: 'Milli and micro',
  prompt: '15 is not 0.015; 15 mm is. The prefix is the factor, and the factor is the answer.',
  controls: [
    {
      kind: 'range',
      id: 'value',
      label: 'the number you read',
      unit: '',
      min: 1,
      max: 999,
      step: 1,
      start: START_VALUE,
    },
    {
      kind: 'choice',
      id: 'prefix',
      label: 'prefix',
      options: [
        { value: 'milli', label: 'milli (m)' },
        { value: 'micro', label: 'micro (µ)' },
      ],
      start: 'milli',
    },
  ],
  readouts: [
    {
      id: 'base',
      label: 'In base units',
      text: (values) => formatBaseUnit(toBase(valueOf(values), prefixOf(values))),
      unit: PREFIXES.milli.unit,
      note: (values) =>
        `${valueOf(values)} ${prefixOf(values) === 'micro' ? 'µ' : 'm'}${PREFIXES[prefixOf(values)].unit}`,
    },
    {
      id: 'times',
      label: 'The factor',
      text: (values) => PREFIXES[prefixOf(values)].times,
      note: () => 'dividing by the prefix, not by the number',
    },
    {
      id: 'kilo',
      label: '4.7 kΩ',
      text: () => KILO_EXAMPLE.toLocaleString('en-US'),
      unit: 'Ω',
      note: () => 'kilo goes the other way: × 1,000',
    },
  ],
  mark: {
    readout: 'base',
    value: (values) => toBase(valueOf(values), prefixOf(values)),
    ladder: [0.015, 0.0005, 0.02, 0.005, 0.47],
    tolerance: 0.0004,
    format: formatBaseUnit,
  },
  verdict: (values) => {
    const base = toBase(valueOf(values), prefixOf(values));
    const prefix = prefixOf(values);
    return `${valueOf(values)} ${prefix === 'micro' ? 'µ' : 'm'} is ${formatBaseUnit(base)} ${
      PREFIXES[prefix].unit
    }: ${PREFIXES[prefix].times} smaller than the number you typed.`;
  },
};
