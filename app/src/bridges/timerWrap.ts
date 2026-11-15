/**
 * Five times the speed, and the shaft never moved faster (`app/src/bridges/timerWrap.ts`).
 *
 * Lesson 04.1's Bridge Notes gives the deterministic tick: `0.020 rad / 0.0010 s = 20.0 rad/s`. Then
 * it gives the failure: a slow `Serial.println()` stretches the real loop to `0.0050 s`, the shaft
 * moves `0.100 rad` in that time, the code still divides by the *nominal* `0.0010 s`, and the
 * velocity reads `100.0 rad/s` — a 5× spike that is entirely an arithmetic mistake. The same page
 * shows the 16-bit wrap: `delta = (now - prev) & 0xFFFF`, so one count backwards is 65,535.
 *
 * The card keeps both: the nominal division is a toggle, and the wrap is a constant register line,
 * because they are two different mistakes a beginner will make in the same ISR.
 */
import type { LabSpec, LabValues } from './bridgeLab.ts';
import { numberAt } from './bridgeLab.ts';

/** The page's tick. */
export const NOMINAL_S = 0.001;
export const ACTUAL_S = 0.005;
export const TICK_RAD = 0.02;

/** `Δθ / Δt`, the only honest velocity. */
export function velocity(deltaRad: number, seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return deltaRad / seconds;
}

/** `(now - prev) & 0xFFFF`: one count backwards, as an unsigned 16-bit difference. */
export function wrap16(delta: number): number {
  const span = 0x10000;
  return ((Math.trunc(delta) % span) + span) % span;
}

const deltaOf = (values: LabValues) => numberAt(values, 'delta_rad', TICK_RAD);

export const timerWrapLab: LabSpec = {
  testid: 'bridge-timer-wrap',
  title: 'A spike that is only arithmetic',
  prompt: '0.020 rad in 1.0 ms is 20.0 rad/s. A stalled loop moves 0.100 rad and still divides by 1.0 ms.',
  controls: [
    { kind: 'range', id: 'delta_rad', label: 'shaft moved', unit: 'rad', min: 0, max: 0.12, step: 0.002, start: TICK_RAD },
  ],
  pair: { wrong: 'speed_stalled', right: 'speed_honest', wrongLabel: 'divides by nominal', rightLabel: 'divides by actual' },
  readouts: [
    {
      id: 'speed_honest',
      label: 'Honest velocity',
      text: (values) => velocity(deltaOf(values), NOMINAL_S).toFixed(1),
      unit: 'rad/s',
      note: (values) => `${deltaOf(values)} / 0.0010`,
    },
    {
      id: 'speed_stalled',
      label: 'Nominal division',
      text: (values) => velocity(deltaOf(values) * 5, NOMINAL_S).toFixed(1),
      unit: 'rad/s',
      note: () => '5× the movement, still divided by 1.0 ms',
    },
    {
      id: 'actual',
      label: 'Real elapsed',
      text: () => ACTUAL_S.toFixed(4),
      unit: 's',
      note: () => 'what a clock would have said during the stall',
    },
    {
      id: 'wrap',
      label: 'uint16 wrap',
      text: () => wrap16(-1).toLocaleString('en-US'),
      unit: '',
      note: () => '(now − prev) & 0xFFFF: one count backwards',
    },
  ],
  mark: {
    readout: 'speed_honest',
    value: (values) => velocity(deltaOf(values), NOMINAL_S),
    ladder: [20, 100, 4, 40, 10],
    tolerance: 0.5,
    format: (target) => target.toFixed(1),
  },
  verdict: (values) => {
    const honest = velocity(deltaOf(values), NOMINAL_S);
    return `${deltaOf(values)} rad in 0.0010 s is ${honest.toFixed(
      1
    )} rad/s on every tick. Stall the loop for 5.0 ms, move 5× as far, and the same division prints ${(
      honest * 5
    ).toFixed(1)}: a 5× spike, not a faster motor.`;
  },
};
