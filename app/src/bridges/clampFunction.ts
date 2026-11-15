/**
 * `print` answers nothing (`app/src/bridges/clampFunction.ts`).
 *
 * Lesson P.5's Bridge Notes wraps P.3's clamp in a function and prints the one failure that looks
 * like success: a function that `print`s instead of `return`s still shows `255` on screen, and the
 * *next* line still raises `TypeError`, because the value the caller received was `None`. Twenty
 * copy-pasted clamps is the page's other number.
 *
 * The card keeps both versions live from one command, so the failure is a reading rather than a
 * sentence: `via_print` says `None` while the screen says 255, and `after_math` turns that into the
 * exception Python actually raises.
 */
import type { LabSpec, LabValues } from './bridgeLab.ts';
import { numberAt, toggleAt } from './bridgeLab.ts';

/** What P.3's `if / elif` block holds a command inside. */
export const COMMAND_MIN = 0;
export const COMMAND_MAX = 255;

/** The command the section pushes past the top. */
export const START_CMD = 310;

/** The page's twenty call sites. */
export const CALL_SITES = 20;

/** `if cmd > 255: 255; elif cmd < 0: 0; else cmd` — the function's body, unchanged. */
export function clampCommand(cmd: number): number {
  if (!Number.isFinite(cmd)) return COMMAND_MIN;
  return Math.min(COMMAND_MAX, Math.max(COMMAND_MIN, cmd));
}

const cmdOf = (values: LabValues) => numberAt(values, 'cmd', START_CMD);
const returnsOf = (values: LabValues) => toggleAt(values, 'returns');

export const clampFunctionLab: LabSpec = {
  testid: 'bridge-clamp-function',
  title: 'Return, or print',
  prompt: '310 clamps to 255. A function that prints it hands back None, and the next line raises.',
  controls: [
    { kind: 'range', id: 'cmd', label: 'command', unit: '', min: -60, max: 320, step: 1, start: START_CMD },
    { kind: 'toggle', id: 'returns', label: 'return the value', start: true },
  ],
  pair: { wrong: 'via_print', right: 'via_return', wrongLabel: 'print', rightLabel: 'return' },
  readouts: [
    {
      id: 'via_return',
      label: 'return cmd',
      text: (values) => String(clampCommand(cmdOf(values))),
      unit: 'counts',
      note: () => 'what the caller can use',
    },
    {
      id: 'via_print',
      label: 'print(cmd)',
      text: () => 'None',
      note: () => 'the screen shows 255; the caller still got None',
    },
    {
      id: 'after_math',
      label: 'result * 1.0',
      text: (values) =>
        returnsOf(values) ? clampCommand(cmdOf(values)).toFixed(1) : 'TypeError',
      note: (values) =>
        returnsOf(values)
          ? 'the clamped value, because it came back'
          : "unsupported operand type(s) for *: 'NoneType' and 'float'",
    },
    {
      id: 'call_sites',
      label: 'Call sites saved',
      text: () => String(CALL_SITES - 1),
      note: () => 'twenty copies of six lines, minus the one function',
    },
  ],
  mark: {
    readout: 'via_return',
    value: (values) => clampCommand(cmdOf(values)),
    ladder: [255, 0, 17, 100, 200],
    tolerance: 1,
    format: (target) => String(Math.round(target)),
  },
  verdict: (values) =>
    returnsOf(values)
      ? `The function answers ${clampCommand(cmdOf(values))}: the caller can add to it.`
      : 'None is not 255: the function answered, and the answer was nothing.',
};
