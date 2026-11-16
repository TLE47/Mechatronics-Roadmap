/**
 * A period is a reciprocal, and a count has a top (`app/src/bridges/freqBits.ts`).
 *
 * Lesson P.8's Bridge Notes prints two pairs: `50 Hz → 20 ms` and `1 kHz → 1.0 ms` for the period,
 * and `2^8 − 1 = 255`, `2^10 − 1 = 1023`, `2^12 − 1 = 4095` for the top of a count. They are two
 * different confusions — a reciprocal and an off-by-one — so the card gives each its own reading and
 * lets one control move both facts.
 *
 * The bit width is a `choice` (8, 10, 12) because those are the three widths the page names; a
 * slider would have to invent the sizes in between.
 *
 * Pure functions; `formatReading` is not used because 20.0 ms is one decimal, like the page.
 */
import type { LabSpec, LabValues } from './bridgeLab.ts';
import { choiceAt, numberAt } from './bridgeLab.ts';

/** The page's two example frequencies, kept for the prompt and the test. */
export const SLOW_HZ = 50;
export const FAST_HZ = 1000;

/** `T = 1/f`, in milliseconds. */
export function periodMs(frequency: number): number {
  return 1000 / frequency;
}

/** `2^N` states: the page's 256, 1,024 and 4,096. */
export function states(bits: number): number {
  return 2 ** bits;
}

/** `2^N − 1`: the top of a count that starts at 0. */
export function topOf(bits: number): number {
  return states(bits) - 1;
}

const fOf = (values: LabValues) => numberAt(values, 'f_hz', SLOW_HZ);
const bitsOf = (values: LabValues) => Number(choiceAt(values, 'bits', '10'));

export const freqBitsLab: LabSpec = {
  testid: 'bridge-freq-bits',
  title: 'Period and top',
  prompt: '50 Hz is 20 ms, and 10 bits is 0 to 1023 — never 0 to 1024.',
  controls: [
    {
      kind: 'range',
      id: 'f_hz',
      label: 'frequency',
      unit: 'Hz',
      min: 1,
      max: 2000,
      step: 1,
      start: SLOW_HZ,
    },
    {
      kind: 'choice',
      id: 'bits',
      label: 'register width',
      options: [
        { value: '8', label: '8-bit (255)' },
        { value: '10', label: '10-bit (1023)' },
        { value: '12', label: '12-bit (4095)' },
      ],
      start: '10',
    },
  ],
  readouts: [
    {
      id: 'period_ms',
      label: 'Period',
      text: (values) => periodMs(fOf(values)).toFixed(1),
      unit: 'ms',
      note: (values) => `T = 1 / ${fOf(values)} Hz`,
    },
    {
      id: 'states',
      label: 'States',
      text: (values) => states(bitsOf(values)).toLocaleString('en-US'),
      note: (values) => `2^${bitsOf(values)}`,
    },
    {
      id: 'top',
      label: 'Largest count',
      text: (values) => topOf(bitsOf(values)).toLocaleString('en-US'),
      note: (values) => `2^${bitsOf(values)} − 1, because counting starts at 0`,
    },
  ],
  mark: {
    readout: 'period_ms',
    value: (values) => periodMs(fOf(values)),
    ladder: [20, 1, 50, 2, 0.5],
    tolerance: 0.4,
    format: (target) => target.toFixed(1),
  },
  verdict: (values) => {
    const top = topOf(bitsOf(values));
    return `${states(bitsOf(values)).toLocaleString('en-US')} states, 0 to ${top.toLocaleString(
      'en-US'
    )}: the top is one less than the count, and ${fOf(values)} Hz is ${periodMs(fOf(values)).toFixed(
      1
    )} ms per cycle.`;
  },
};
