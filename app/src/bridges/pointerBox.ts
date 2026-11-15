/**
 * The caller's box stays 0.0 forever (`app/src/bridges/pointerBox.ts`).
 *
 * Lesson 04.3's Bridge Notes shows the same update written twice: by value, where C hands the
 * function a photocopy that is destroyed on return (`shoulder.pos_rad stays 0.0 forever`), and by
 * pointer, where `p->pos_rad` is the caller's own struct. The arithmetic is identical in both, which
 * is why the bug survives a code review — the function is right, the parameter is not.
 *
 * The card computes the encoder conversion once (`4096.0f`, `6.2831853f`) and prints both endings
 * from it, so the learner sees that only the address differs.
 */
import type { LabSpec, LabValues } from './bridgeLab.ts';
import { numberAt, toggleAt } from './bridgeLab.ts';

/** The page's encoder and full turn. */
export const COUNTS_PER_REV = 4096;
export const TURN_RAD = 6.2831853;

/** `(new_count / 4096.0f) * 6.2831853f`, exactly as the page writes it. */
export function countsToRadians(counts: number): number {
  return (counts / COUNTS_PER_REV) * TURN_RAD;
}

const countsOf = (values: LabValues) => numberAt(values, 'counts', 1024);
const byPointerOf = (values: LabValues) => toggleAt(values, 'by_pointer');

export const pointerBoxLab: LabSpec = {
  testid: 'bridge-pointer-box',
  title: 'A photocopy and an address',
  prompt: '1024 counts is 1.5708 rad. The by-value version leaves the caller at 0.0000.',
  controls: [
    { kind: 'range', id: 'counts', label: 'enc_count', unit: 'counts', min: 0, max: 4095, step: 1, start: 1024 },
    { kind: 'toggle', id: 'by_pointer', label: 'pass a pointer', start: false },
  ],
  pair: { wrong: 'caller_value', right: 'caller_pointer', wrongLabel: 'by value', rightLabel: 'by pointer' },
  readouts: [
    {
      id: 'caller_value',
      label: 'Caller after by-value',
      text: () => (0).toFixed(4),
      unit: 'rad',
      note: () => 'the copy was updated and destroyed',
    },
    {
      id: 'caller_pointer',
      label: 'Caller after pointer',
      text: (values) => countsToRadians(countsOf(values)).toFixed(4),
      unit: 'rad',
      note: () => 'p->pos_rad is the caller\'s field',
    },
    {
      id: 'new_pos',
      label: 'new_pos',
      text: (values) => countsToRadians(countsOf(values)).toFixed(4),
      unit: 'rad',
      note: (values) => `(${countsOf(values)} / 4096.0) × 6.2831853`,
    },
    {
      id: 'pointer_bytes',
      label: 'Pointer size',
      text: () => '4',
      unit: 'bytes',
      note: () => 'one address, not a second struct',
    },
    {
      id: 'called',
      label: 'update_joint',
      text: (values) => (byPointerOf(values) ? 'update_joint_ptr' : 'update_joint_buggy'),
      note: () => 'the version this card is currently running',
    },
  ],
  mark: {
    readout: 'caller_pointer',
    value: (values) => countsToRadians(countsOf(values)),
    ladder: [1.5708, 0, 0.7854, 3.1416, 4.7124],
    tolerance: 0.02,
    format: (target) => target.toFixed(4),
  },
  verdict: (values) =>
    byPointerOf(values)
      ? `The pointer wrote ${countsToRadians(countsOf(values)).toFixed(4)} rad into the caller's box.`
      : `The copy was updated and destroyed: the caller is still at 0.0000 rad, and nothing looks broken.`,
};
