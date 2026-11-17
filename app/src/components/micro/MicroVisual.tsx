import type { PrimitiveSample } from '../../micro/randomize.ts';
import { MicroConceptVisual } from './MicroConceptVisual.tsx';

/**
 * The framed micro-learning picture (`components/micro/MicroVisual.tsx`).
 *
 * The frame is shared: one caption, one border tone, one placement. The scene inside is not — every
 * concept has its own component in `MicroConceptVisual.tsx`, so the explanation and the picture meet
 * on the same specific example instead of falling back to a family shared with another lesson.
 */

type ToneName = 'accent' | 'emerald' | 'rose' | 'amber' | 'purple';

const TONE_CLASS: Record<ToneName, { border: string; bg: string; text: string }> = {
  accent: {
    border: 'border-accent/45',
    bg: 'bg-panel bg-gradient-to-br from-accent/10 via-panel to-panel',
    text: 'text-accent',
  },
  emerald: {
    border: 'border-emerald/45',
    bg: 'bg-panel bg-gradient-to-br from-emerald/10 via-panel to-panel',
    text: 'text-emerald',
  },
  rose: {
    border: 'border-rose/45',
    bg: 'bg-panel bg-gradient-to-br from-rose/10 via-panel to-panel',
    text: 'text-rose',
  },
  amber: {
    border: 'border-amber/45',
    bg: 'bg-panel bg-gradient-to-br from-amber/10 via-panel to-panel',
    text: 'text-amber',
  },
  purple: {
    border: 'border-purple/45',
    bg: 'bg-panel bg-gradient-to-br from-purple/10 via-panel to-panel',
    text: 'text-purple',
  },
};

const META: Record<string, { tone: ToneName; label: string }> = {
  variables: { tone: 'accent', label: 'A name, a value, and a little arrow' },
  'assignment-order': { tone: 'emerald', label: 'Read right, then write left' },
  'int-float': { tone: 'amber', label: 'Two boxes for two kinds of number' },
  strings: { tone: 'purple', label: 'Quotes turn a word into text' },
  booleans: { tone: 'rose', label: 'A yes-or-no answer' },
  'mixed-types': { tone: 'amber', label: 'Text and number do not add silently' },
  'f-strings': { tone: 'accent', label: 'A sentence with a fill-in-the-blank' },
  operators: { tone: 'accent', label: 'Each arithmetic symbol has one job' },
  'floor-division': { tone: 'emerald', label: 'Whole groups, remainder dropped' },
  'order-of-operations': { tone: 'amber', label: 'Brackets first, then powers' },
  comparisons: { tone: 'accent', label: 'A question with a yes-or-no answer' },
  clamping: { tone: 'rose', label: 'Pinned to the nearest limit' },
  logic: { tone: 'purple', label: 'Two questions, one answer' },
  lists: { tone: 'emerald', label: 'One name, many ordered values' },
  'for-loops': { tone: 'amber', label: 'One pass per item' },
  'index-error': { tone: 'rose', label: 'The last index is one less than the count' },
  functions: { tone: 'accent', label: 'A named block that hands a value back' },
  'while-loops': { tone: 'emerald', label: 'Test, body, test again' },
  none: { tone: 'amber', label: 'No answer at all' },
  imports: { tone: 'purple', label: 'A toolbox reached by its name' },
  asserts: { tone: 'rose', label: 'A known answer checked in code' },
  'assert-message': { tone: 'rose', label: 'A failure that says why' },
  'si-units': { tone: 'accent', label: 'Convert first, then calculate' },
  'metric-prefixes': { tone: 'emerald', label: 'A multiplier in front of the unit' },
  'unit-cancel': { tone: 'amber', label: 'The unit that survives the arithmetic' },
  'frequency-period': { tone: 'purple', label: 'Two ways to say the same tick' },
  'binary-bits': { tone: 'accent', label: 'Each bit doubles the states' },
  'place-values': { tone: 'emerald', label: 'Sum the places that are on' },
  rearranging: { tone: 'amber', label: 'Undo an operation on both sides' },
  'linear-scaling': { tone: 'purple', label: 'A fraction of full scale' },
  'scale-output': { tone: 'rose', label: 'The board sets the top' },
  radians: { tone: 'accent', label: 'A half-turn is pi radians' },
  'trig-reach': { tone: 'emerald', label: 'One link, two shadows' },
  atan2: { tone: 'purple', label: 'A point turned back into an angle' },
  'graph-slope': { tone: 'amber', label: 'Rise over run is the rate' },
  'area-under-curve': { tone: 'emerald', label: 'Slices add up to the journey' },
  'graph-units': { tone: 'accent', label: 'The axes carry the units' },
  force: { tone: 'rose', label: 'Mass times acceleration is force' },
  weight: { tone: 'amber', label: 'Gravity turns mass into weight' },
  torque: { tone: 'purple', label: 'Torque needs the perpendicular lever arm' },
  'datasheet-units': { tone: 'accent', label: 'The number and its unit' },
  'datasheet-bounds': { tone: 'rose', label: 'A band with two edges' },
  'datasheet-conditions': { tone: 'amber', label: 'Typ is a usual part, not a promise' },
  'given-unknown': { tone: 'emerald', label: 'Name the givens and the unknown' },
  'answer-check': { tone: 'accent', label: 'A number becomes an answer after the check' },
  'bounds-check': { tone: 'rose', label: 'Clamp to the limit and name it' },
};

export function MicroVisual({
  conceptId,
  sample,
  placement = 'bottom',
  sticky = true,
}: {
  conceptId: string;
  sample?: PrimitiveSample;
  /** Where the reader put it: left or right of the explanation, or underneath it. */
  placement?: 'left' | 'right' | 'bottom';
  /**
   * The Micro-learning stage keeps a side picture in view while its walkthrough scrolls. The reader
   * lays the same scene inside prose, where a sticky figure would leave its paragraph behind, so it
   * asks for the frame without that behaviour.
   */
  sticky?: boolean;
}) {
  const meta = META[conceptId] ?? META.variables;
  const tone = TONE_CLASS[meta.tone];
  return (
    <figure
      role="img"
      aria-label={meta.label}
      data-testid={`micro-visual-${conceptId}`}
      data-placement={placement}
      className={`rounded-2xl border ${tone.border} ${tone.bg} p-3.5 shadow-sm ${
        placement === 'bottom' || !sticky ? 'w-full' : 'w-full lg:sticky lg:top-3'
      }`}
    >
      <figcaption className={`mb-2 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] ${tone.text}`}>
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
        {meta.label}
      </figcaption>
      <MicroConceptVisual conceptId={conceptId} sample={sample} />
    </figure>
  );
}
