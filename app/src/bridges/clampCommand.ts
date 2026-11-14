/**
 * Clamping a command into an 8-bit register (`app/src/bridges/clampCommand.ts`).
 *
 * Lesson P.3's Bridge Notes makes one claim and gives its own numbers for it: a controller that asks
 * for `310` is asking past the top of a register that holds `0 … 255`, and the register does not
 * stop at its top — it wraps, so `310` becomes `54` and the motor is cut exactly when maximum effort
 * was wanted. `-40` wraps the other way, to `216`. The fix is the section's two comparisons, and the
 * e-stop is the third: pressed, the output is `0` whatever arrived.
 *
 * The wrap here is the real one (`raw % 256`, kept positive), not an illustration: that is why the
 * two readings can be compared at all. Pure functions, so the browser check and the unit check read
 * the same arithmetic the card prints.
 */
import { numberAt, toggleAt, type LabSpec, type LabValues } from './bridgeLab.ts';

/** What an 8-bit output register can hold, inclusive — the section's `[0, 255]`. */
export const COMMAND_MIN = 0;
export const COMMAND_MAX = 255;

/** The section's two comparison limits, as one call: `raw < 0 → 0`, `raw > 255 → 255`. */
export function clampCommand(raw: number, min: number = COMMAND_MIN, max: number = COMMAND_MAX): number {
  if (!Number.isFinite(raw)) return min;
  if (raw < min) return min;
  if (raw > max) return max;
  return raw;
}

/**
 * What the register would hold if the command were written without clamping.
 *
 * `%` in Python on a negative number is positive (`-40 % 256 == 216`), which is the wrap a hardware
 * register does; the same expression is written here so the reading is Python's answer, not an
 * illustration of it.
 */
export function registerByte(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  const span = COMMAND_MAX + 1;
  return ((Math.trunc(raw) % span) + span) % span;
}

/** The command the motor actually gets: clamped, and `0` while the e-stop is held. */
export function motorCommand(raw: number, estopPressed: boolean): number {
  return estopPressed ? 0 : clampCommand(raw);
}

const rawOf = (values: LabValues) => numberAt(values, 'raw', 310);
const estopOf = (values: LabValues) => toggleAt(values, 'estop');

export const clampCommandLab: LabSpec = {
  testid: 'bridge-clamp',
  title: 'Clamp before the register',
  prompt: 'Push the request past the ends. 0 … 255 is not a wall: an unclamped write wraps.',
  controls: [
    {
      kind: 'range',
      id: 'raw',
      label: 'Controller asks for',
      unit: 'counts',
      min: -60,
      max: 320,
      step: 1,
      start: 310,
      hint: '310 catches a fall; -45 brakes.',
    },
    { kind: 'toggle', id: 'estop', label: 'E-stop pressed', start: false },
  ],
  readouts: [
    {
      id: 'asked',
      label: 'Before the limits',
      text: (values) => String(Math.trunc(rawOf(values))),
      unit: 'counts',
    },
    {
      id: 'clamped',
      label: 'After clamping',
      text: (values) => String(clampCommand(rawOf(values))),
      unit: 'counts',
      note: (values) => {
        const raw = rawOf(values);
        if (raw > COMMAND_MAX) return 'top stop';
        if (raw < COMMAND_MIN) return 'bottom stop';
        return 'passes through';
      },
    },
    {
      id: 'register',
      label: 'Register if you skip the clamp',
      text: (values) => String(registerByte(rawOf(values))),
      unit: 'counts',
      note: (values) => {
        const wrapped = registerByte(rawOf(values));
        if (wrapped === clampCommand(rawOf(values))) return 'nothing overflowed';
        return `${Math.trunc(rawOf(values))} wraps to ${wrapped}`;
      },
    },
    {
      id: 'output',
      label: 'Motor output',
      text: (values) => String(motorCommand(rawOf(values), estopOf(values))),
      unit: 'counts',
      note: (values) => (estopOf(values) ? 'e-stop: 0 whatever arrived' : ''),
    },
  ],
  verdict: (values) => {
    const raw = rawOf(values);
    if (estopOf(values)) return 'E-stop: the output is 0.';
    if (raw > COMMAND_MAX) return `Held at ${COMMAND_MAX}, not wrapped to ${registerByte(raw)}: full effort.`;
    if (raw < COMMAND_MIN) return `Held at ${COMMAND_MIN}, not wrapped to ${registerByte(raw)}: braking.`;
    return `Inside the range: ${raw} arrives unchanged.`;
  },
};
