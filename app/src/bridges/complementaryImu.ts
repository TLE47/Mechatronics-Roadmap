/**
 * Two percent of gravity is a tether (`app/src/bridges/complementaryImu.ts`).
 *
 * Lesson 05.2's Bridge Notes writes the filter in two lines and then reads the knob:
 * `τc = α·Δt / (1 − α)`. At `Δt = 0.010 s` and `α = 0.98` that is `0.490 s` — fast motion comes
 * `98 %` from the gyro, slow drift is anchored by gravity. It also gives the number the page cares
 * about: with a constant gyro bias `bg`, the steady-state error stops growing and sits at
 * `τc · bg` instead.
 *
 * The card prints both futures from the same bias: the pure integrator's `60 s × bg` walk, and the
 * filter's `τc × bg` bound. At the page's `1.0 °/s` that is `60.0°` of drift against `0.49°` — the
 * difference between a balancing robot and a robot that has fallen over.
 *
 * Pure functions; the page's `α` and `Δt` are the start values.
 */
import type { LabSpec, LabValues } from './bridgeLab.ts';
import { choiceAt, numberAt } from './bridgeLab.ts';

export const ALPHA_START = 0.98;
export const DT_CHOICES = [
  { value: '0.001', label: '1 ms (1 kHz)' },
  { value: '0.004', label: '4 ms (250 Hz)' },
  { value: '0.010', label: '10 ms (100 Hz)' },
  { value: '0.020', label: '20 ms (50 Hz)' },
] as const;
export const DT_START = '0.010';
export const BIAS_START = 1.0;
export const HORIZON_S = 60;

/** `τc = αΔt / (1 − α)`, in seconds. */
export function crossoverSeconds(alpha: number, dtSeconds: number): number {
  if (!(alpha > 0) || alpha >= 1 || !(dtSeconds > 0)) return 0;
  return (alpha * dtSeconds) / (1 - alpha);
}

/** How much of a sample is the gyro: the page's `α`, as a percentage. */
export function gyroSharePercent(alpha: number): number {
  if (!Number.isFinite(alpha)) return 0;
  return Math.min(100, Math.max(0, alpha * 100));
}

/** The filter's bounded error with a constant bias: `Δθss = τc · bg`. */
export function biasErrorDeg(alpha: number, dtSeconds: number, biasDegPerS: number): number {
  if (!Number.isFinite(biasDegPerS)) return 0;
  return crossoverSeconds(alpha, dtSeconds) * biasDegPerS;
}

/** The pure integrator's error after `seconds`: `bg · t`, with nothing to pull it back. */
export function gyroDriftDeg(biasDegPerS: number, seconds = HORIZON_S): number {
  if (!Number.isFinite(biasDegPerS) || !(seconds > 0)) return 0;
  return biasDegPerS * seconds;
}

const alphaOf = (values: LabValues) => numberAt(values, 'alpha', ALPHA_START);
const dtOf = (values: LabValues) => Number(choiceAt(values, 'dt', DT_START));
const biasOf = (values: LabValues) => numberAt(values, 'bias', BIAS_START);

export const complementaryImuLab: LabSpec = {
  testid: 'bridge-complementary-imu',
  title: 'Where the drift stops',
  prompt: 'α = 0.98 at 100 Hz is τc = 0.490 s. A 1.0 °/s gyro bias walks 60.0° in a minute; the filter holds 0.49°.',
  controls: [
    { kind: 'range', id: 'alpha', label: 'blend α', unit: '', min: 0.8, max: 0.995, step: 0.005, start: ALPHA_START },
    { kind: 'choice', id: 'dt', label: 'sample period', options: DT_CHOICES, start: DT_START },
    { kind: 'range', id: 'bias', label: 'gyro bias', unit: '°/s', min: 0, max: 5, step: 0.1, start: BIAS_START },
  ],
  pair: { wrong: 'drift', right: 'bias_error', wrongLabel: 'gyro only, 60 s', rightLabel: 'filter bound' },
  readouts: [
    {
      id: 'tau_c',
      label: 'Crossover time',
      text: (values) => crossoverSeconds(alphaOf(values), dtOf(values)).toFixed(3),
      unit: 's',
      note: () => 'αΔt / (1 − α): the memory the accelerometer has',
    },
    {
      id: 'share',
      label: 'Gyro share',
      text: (values) => gyroSharePercent(alphaOf(values)).toFixed(1),
      unit: '%',
      note: () => 'motion faster than τc comes from the gyro',
    },
    {
      id: 'drift',
      label: 'Gyro drift after 60 s',
      text: (values) => gyroDriftDeg(biasOf(values)).toFixed(1),
      unit: '°',
      note: (values) => `${biasOf(values).toFixed(1)} °/s × 60 s, with nothing to pull it back`,
    },
    {
      id: 'bias_error',
      label: 'Filter steady-state error',
      text: (values) => biasErrorDeg(alphaOf(values), dtOf(values), biasOf(values)).toFixed(3),
      unit: '°',
      note: () => 'τc · bg: bounded, not removed',
    },
  ],
  mark: {
    readout: 'tau_c',
    value: (values) => crossoverSeconds(alphaOf(values), dtOf(values)),
    ladder: [0.49, 0.09, 0.19, 0.99, 1.99],
    tolerance: 0.01,
    format: (target) => target.toFixed(3),
  },
  verdict: (values) => {
    const tau = crossoverSeconds(alphaOf(values), dtOf(values));
    return `α = ${alphaOf(values).toFixed(3)} at ${(dtOf(values) * 1000).toFixed(
      0
    )} ms is τc = ${tau.toFixed(3)} s. A ${biasOf(values).toFixed(
      1
    )} °/s bias is ${gyroDriftDeg(biasOf(values)).toFixed(1)}° of drift after a minute alone, and ${biasErrorDeg(
      alphaOf(values),
      dtOf(values),
      biasOf(values)
    ).toFixed(3)}° with the accelerometer holding it: the filter does not remove the bias, it stops it at τc · bg.`;
  },
};
