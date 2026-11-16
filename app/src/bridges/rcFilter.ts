/**
 * One `2π` between the filter and the noise (`app/src/bridges/rcFilter.ts`).
 *
 * Lesson 01.4's Bridge Notes prints the passive low-pass: `R = 1 kΩ`, `C = 1.0 µF`,
 * `τ = RC = 1.0 ms`, so `fc = 1/(2πRC) ≈ 159.15 Hz`. A 2 Hz knob turn passes at `99.99 %`;
 * 20 kHz motor PWM is crushed to `0.008` (`0.8 %`). The page's warning is arithmetic, not taste:
 * the cutoff is `1/(2πRC)`, and a learner who writes `1/RC` gets `1000 Hz` and lets `5 %` of the
 * switching noise through where `0.8 %` belongs.
 *
 * The card keeps both cutoffs live from the same R and C, and reads the gain at the frequency the
 * learner picked, so the two numbers differ by the 2π in the denominator rather than by a sentence.
 *
 * Pure functions; the page's resistor, capacitor and 20 kHz PWM are the start values.
 */
import type { LabSpec, LabValues } from './bridgeLab.ts';
import { choiceAt, numberAt } from './bridgeLab.ts';

/** The page's filter. */
export const RESISTANCE_OHM = 1000;
export const CAPACITANCE_UF = 1.0;

/** The two frequencies the page works through, plus the two a robot meets between them. */
export const FREQUENCIES_HZ = [
  { value: '2', label: '2 Hz knob' },
  { value: '60', label: '60 Hz mains' },
  { value: '1000', label: '1 kHz loop' },
  { value: '20000', label: '20 kHz PWM' },
] as const;

/** The page's headline noise: 20 kHz motor PWM. */
export const START_FREQUENCY = '20000';

/** `τ = RC`, in seconds (C is given in microfarads). */
export function tauSeconds(resistanceOhm: number, capacitanceMicro: number): number {
  if (!(resistanceOhm > 0) || !(capacitanceMicro > 0)) return 0;
  return resistanceOhm * capacitanceMicro * 1e-6;
}

/** `fc = 1/(2πRC)`, in hertz. */
export function cutoffHz(resistanceOhm: number, capacitanceMicro: number): number {
  const tau = tauSeconds(resistanceOhm, capacitanceMicro);
  return tau > 0 ? 1 / (2 * Math.PI * tau) : 0;
}

/** `1/RC`: the cutoff a learner gets when the 2π is left out. */
export function cutoffNoTwoPi(resistanceOhm: number, capacitanceMicro: number): number {
  const tau = tauSeconds(resistanceOhm, capacitanceMicro);
  return tau > 0 ? 1 / tau : 0;
}

/** `Ratio(f) = 1 / √(1 + (f/fc)²)`: the fraction of the input amplitude that survives. */
export function gainAt(frequencyHz: number, cutoff: number): number {
  if (!(cutoff > 0) || !Number.isFinite(frequencyHz)) return 0;
  return 1 / Math.sqrt(1 + (frequencyHz / cutoff) ** 2);
}

const resistanceOf = (values: LabValues) => numberAt(values, 'resistance', RESISTANCE_OHM);
const capacitanceOf = (values: LabValues) => numberAt(values, 'capacitance', CAPACITANCE_UF);
const frequencyOf = (values: LabValues) => Number(choiceAt(values, 'frequency', START_FREQUENCY));

export const rcFilterLab: LabSpec = {
  testid: 'bridge-rc-filter',
  title: 'What the filter keeps',
  prompt: '1 kΩ and 1.0 µF is τ = 1.0 ms and fc = 159.15 Hz. At 20 kHz it keeps 0.008 of the noise.',
  controls: [
    { kind: 'range', id: 'resistance', label: 'resistor R', unit: 'Ω', min: 100, max: 10000, step: 100, start: RESISTANCE_OHM },
    { kind: 'range', id: 'capacitance', label: 'capacitor C', unit: 'µF', min: 0.1, max: 10, step: 0.1, start: CAPACITANCE_UF },
    { kind: 'choice', id: 'frequency', label: 'noise frequency', options: FREQUENCIES_HZ, start: START_FREQUENCY },
  ],
  pair: { wrong: 'gain_no_2pi', right: 'gain', wrongLabel: 'fc = 1/RC', rightLabel: 'fc = 1/(2πRC)' },
  readouts: [
    {
      id: 'tau',
      label: 'Time constant',
      text: (values) => (tauSeconds(resistanceOf(values), capacitanceOf(values)) * 1000).toFixed(2),
      unit: 'ms',
      note: (values) => `${resistanceOf(values)} Ω × ${capacitanceOf(values)} µF`,
    },
    {
      id: 'fc',
      label: 'Cutoff',
      text: (values) => cutoffHz(resistanceOf(values), capacitanceOf(values)).toFixed(2),
      unit: 'Hz',
      note: () => 'where the output is 0.707 of the input',
    },
    {
      id: 'fc_no_2pi',
      label: 'Cutoff without 2π',
      text: (values) => cutoffNoTwoPi(resistanceOf(values), capacitanceOf(values)).toFixed(2),
      unit: 'Hz',
      note: () => '6.28× too high, so the filter looks faster than it is',
    },
    {
      id: 'gain',
      label: 'Kept at the chosen f',
      text: (values) =>
        gainAt(frequencyOf(values), cutoffHz(resistanceOf(values), capacitanceOf(values))).toFixed(4),
      unit: '',
      note: (values) =>
        `${(
          gainAt(frequencyOf(values), cutoffHz(resistanceOf(values), capacitanceOf(values))) * 100
        ).toFixed(2)} % of the noise survives`,
    },
    {
      id: 'gain_no_2pi',
      label: 'Kept with 1/RC',
      text: (values) =>
        gainAt(frequencyOf(values), cutoffNoTwoPi(resistanceOf(values), capacitanceOf(values))).toFixed(4),
      unit: '',
      note: (values) =>
        `${(
          gainAt(frequencyOf(values), cutoffNoTwoPi(resistanceOf(values), capacitanceOf(values))) * 100
        ).toFixed(2)} % — the same parts, a looser filter`,
    },
  ],
  mark: {
    readout: 'fc',
    value: (values) => cutoffHz(resistanceOf(values), capacitanceOf(values)),
    ladder: [159.15494309189535, 1591.5494309189535, 15.915494309189535, 318.3098861837907, 79.57747154594767],
    tolerance: 2,
    format: (target) => target.toFixed(2),
  },
  verdict: (values) => {
    const fc = cutoffHz(resistanceOf(values), capacitanceOf(values));
    const kept = gainAt(frequencyOf(values), fc);
    return `τ = ${(tauSeconds(resistanceOf(values), capacitanceOf(values)) * 1000).toFixed(
      2
    )} ms, fc = ${fc.toFixed(2)} Hz, and ${frequencyOf(values)} Hz passes at ${kept.toFixed(
      4
    )}. With fc = 1/RC = ${cutoffNoTwoPi(resistanceOf(values), capacitanceOf(values)).toFixed(
      2
    )} Hz the same noise reads ${gainAt(
      frequencyOf(values),
      cutoffNoTwoPi(resistanceOf(values), capacitanceOf(values))
    ).toFixed(4)}: the 2π is the difference between a filter and a suggestion.`;
  },
};
