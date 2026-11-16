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
  prompt: 'Push the request past the ends: 0 … 255 has no wall, so a raw write wraps.',
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
    },
    { kind: 'toggle', id: 'estop', label: 'E-stop pressed', start: false },
  ],
  scale: {
    min: COMMAND_MIN,
    max: COMMAND_MAX,
    label: '0 … 255',
    marks: [
      {
        id: 'clamped',
        at: (values) => clampCommand(rawOf(values)),
        caption: (values) => `clamp: ${Math.trunc(rawOf(values))} → ${clampCommand(rawOf(values))}`,
      },
      {
        id: 'wrapped',
        at: (values) => registerByte(rawOf(values)),
        caption: (values) => `wrap: ${Math.trunc(rawOf(values))} % 256 = ${registerByte(rawOf(values))}`,
      },
    ],
  },
  readouts: [
    {
      id: 'clamped',
      label: 'Clamped',
      text: (values) => String(clampCommand(rawOf(values))),
      unit: 'counts',
      note: (values) => {
        const raw = rawOf(values);
        if (raw > COMMAND_MAX) return `if ${raw} > 255: motor_cmd = 255`;
        if (raw < COMMAND_MIN) return `elif ${raw} < 0: motor_cmd = 0`;
        return 'inside the range: unchanged';
      },
    },
    {
      id: 'register',
      label: 'Unclamped register',
      text: (values) => String(registerByte(rawOf(values))),
      unit: 'counts',
      note: (values) => `${Math.trunc(rawOf(values))} % 256 = ${registerByte(rawOf(values))}`,
    },
    {
      id: 'output',
      label: 'Output',
      text: (values) => String(motorCommand(rawOf(values), estopOf(values))),
      unit: 'counts',
      note: (values) => (estopOf(values) ? 'e-stop: 0 whatever arrived' : ''),
    },
  ],
  verdict: (values) => {
    const raw = rawOf(values);
    if (estopOf(values)) return 'E-stop: 0, whatever arrived.';
    if (raw > COMMAND_MAX) return `Held at ${COMMAND_MAX}, not wrapped to ${registerByte(raw)}.`;
    if (raw < COMMAND_MIN) return `Held at ${COMMAND_MIN}, not wrapped to ${registerByte(raw)}.`;
    return `Inside the range: ${raw} arrives unchanged.`;
  },
};
