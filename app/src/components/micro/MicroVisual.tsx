import {
  ArrowRight,
  Braces,
  CircleHelp,
  Equal,
  Quote,
  Sparkles,
  ToggleLeft,
  TriangleAlert,
} from 'lucide-react';
import type { PrimitiveSample } from '../../micro/randomize.ts';

/**
 * A tiny, concept-specific picture for micro-learning (`components/micro/MicroVisual.tsx`).
 *
 * The visual is deliberately literal: one idea, a handful of labels, and no interaction. It gives a
 * learner something to look at before the explanation and a second route to the same meaning.
 */

const TONE: Record<string, { border: string; bg: string; text: string; label: string }> = {
  variables: {
    border: 'border-accent/40',
    bg: 'bg-accent/10',
    text: 'text-accent',
    label: 'A name, a value, and a little arrow',
  },
  'assignment-order': {
    border: 'border-emerald/40',
    bg: 'bg-emerald/10',
    text: 'text-emerald',
    label: 'Read right, then write left',
  },
  'int-float': {
    border: 'border-amber/40',
    bg: 'bg-amber/10',
    text: 'text-amber',
    label: 'Two boxes for two kinds of number',
  },
  strings: {
    border: 'border-purple/40',
    bg: 'bg-purple/10',
    text: 'text-purple',
    label: 'Quotes turn a word into text',
  },
  booleans: {
    border: 'border-rose/40',
    bg: 'bg-rose/10',
    text: 'text-rose',
    label: 'A yes-or-no answer',
  },
  'mixed-types': {
    border: 'border-amber/40',
    bg: 'bg-amber/10',
    text: 'text-amber',
    label: 'Text and number do not add silently',
  },
  'f-strings': {
    border: 'border-accent/40',
    bg: 'bg-accent/10',
    text: 'text-accent',
    label: 'A sentence with a fill-in-the-blank',
  },
  operators: {
    border: 'border-accent/40',
    bg: 'bg-accent/10',
    text: 'text-accent',
    label: 'Each arithmetic symbol has one job',
  },
  'floor-division': {
    border: 'border-emerald/40',
    bg: 'bg-emerald/10',
    text: 'text-emerald',
    label: 'Whole groups, remainder dropped',
  },
  'order-of-operations': {
    border: 'border-amber/40',
    bg: 'bg-amber/10',
    text: 'text-amber',
    label: 'Brackets first, then powers',
  },
  comparisons: {
    border: 'border-accent/40',
    bg: 'bg-accent/10',
    text: 'text-accent',
    label: 'A question with a yes-or-no answer',
  },
  clamping: {
    border: 'border-rose/40',
    bg: 'bg-rose/10',
    text: 'text-rose',
    label: 'Pinned to the nearest limit',
  },
  logic: {
    border: 'border-purple/40',
    bg: 'bg-purple/10',
    text: 'text-purple',
    label: 'Two questions, one answer',
  },
  lists: {
    border: 'border-emerald/40',
    bg: 'bg-emerald/10',
    text: 'text-emerald',
    label: 'One name, many ordered values',
  },
  'for-loops': {
    border: 'border-amber/40',
    bg: 'bg-amber/10',
    text: 'text-amber',
    label: 'One pass per item',
  },
  'index-error': {
    border: 'border-rose/40',
    bg: 'bg-rose/10',
    text: 'text-rose',
    label: 'The last index is one less than the count',
  },
  functions: {
    border: 'border-accent/40',
    bg: 'bg-accent/10',
    text: 'text-accent',
    label: 'A named block that hands a value back',
  },
  'while-loops': {
    border: 'border-emerald/40',
    bg: 'bg-emerald/10',
    text: 'text-emerald',
    label: 'Test, body, test again',
  },
  none: {
    border: 'border-amber/40',
    bg: 'bg-amber/10',
    text: 'text-amber',
    label: 'No answer at all',
  },
  imports: {
    border: 'border-purple/40',
    bg: 'bg-purple/10',
    text: 'text-purple',
    label: 'A toolbox reached by its name',
  },
  asserts: {
    border: 'border-rose/40',
    bg: 'bg-rose/10',
    text: 'text-rose',
    label: 'A known answer checked in code',
  },
  'assert-message': {
    border: 'border-rose/40',
    bg: 'bg-rose/10',
    text: 'text-rose',
    label: 'A failure that says why',
  },
  'si-units': {
    border: 'border-accent/40',
    bg: 'bg-accent/10',
    text: 'text-accent',
    label: 'Convert first, then calculate',
  },
  'metric-prefixes': {
    border: 'border-emerald/40',
    bg: 'bg-emerald/10',
    text: 'text-emerald',
    label: 'A multiplier in front of the unit',
  },
  'unit-cancel': {
    border: 'border-amber/40',
    bg: 'bg-amber/10',
    text: 'text-amber',
    label: 'The unit that survives the arithmetic',
  },
  'frequency-period': {
    border: 'border-purple/40',
    bg: 'bg-purple/10',
    text: 'text-purple',
    label: 'Two ways to say the same tick',
  },
  'binary-bits': {
    border: 'border-accent/40',
    bg: 'bg-accent/10',
    text: 'text-accent',
    label: 'Each bit doubles the states',
  },
  'place-values': {
    border: 'border-emerald/40',
    bg: 'bg-emerald/10',
    text: 'text-emerald',
    label: 'Sum the places that are on',
  },
  rearranging: {
    border: 'border-amber/40',
    bg: 'bg-amber/10',
    text: 'text-amber',
    label: 'Undo an operation on both sides',
  },
  'linear-scaling': {
    border: 'border-purple/40',
    bg: 'bg-purple/10',
    text: 'text-purple',
    label: 'A fraction of full scale',
  },
  'scale-output': {
    border: 'border-rose/40',
    bg: 'bg-rose/10',
    text: 'text-rose',
    label: 'The board sets the top',
  },
};

/** One literal row per concept that has no hand-drawn figure of its own. */
const PICTURE: Record<string, { chips: string[]; note: string }> = {
  comparisons: { chips: ['12 > 80', 'False'], note: 'a comparison answers True or False' },
  clamping: { chips: ['310', '255 (limit)'], note: 'the nearest allowed value' },
  logic: { chips: ['True and False', 'False'], note: 'both sides must agree' },
  lists: { chips: ['[12.1, 11.9]', '[0] = 12.1'], note: 'counting starts at zero' },
  'for-loops': { chips: ['for value in readings:', 'each once'], note: 'the body runs per item' },
  'index-error': { chips: ['len = 3', 'last index 2'], note: 'one less than the count' },
  functions: { chips: ['double(4)', '8'], note: 'return hands the value back' },
  'while-loops': { chips: ['step < 3', 'body, then test'], note: 'the update ends the loop' },
  none: { chips: ['print(7)', 'None'], note: 'printing is not returning' },
  imports: { chips: ['import math', 'math.sqrt(25)'], note: 'module name, dot, function' },
  asserts: { chips: ['assert 2 + 2 == 4', 'silent'], note: 'a known case checked in code' },
  'assert-message': { chips: ['assert x < 10', '"too large"'], note: 'the rule travels with the error' },
  'si-units': { chips: ['250 mm', '0.25 m'], note: 'convert before the formula' },
  'metric-prefixes': { chips: ['15 mA', '0.015 A'], note: 'milli is a thousandth' },
  'unit-cancel': { chips: ['m / s', 'm/s'], note: 'the unit is part of the answer' },
  'frequency-period': { chips: ['50 Hz', '0.02 s'], note: 'T = 1 / f' },
  'binary-bits': { chips: ['8 bits', '256 states'], note: '2 to the power of the bits' },
  'place-values': { chips: ['1011', '8 + 2 + 1'], note: 'sum the places that are on' },
  rearranging: { chips: ['d = s * t', 's = d / t'], note: 'the same operation on both sides' },
  'linear-scaling': { chips: ['512 / 1023', 'about 0.5'], note: 'the fraction of full scale' },
  'scale-output': { chips: ['full scale', '3.3 V'], note: 'the output range sets the top' },
};

function Variables({ sample }: { sample?: PrimitiveSample }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">name</p>
        <p className="mt-0.5 font-mono text-[15px] font-bold text-ink">plant_height</p>
      </div>
      <ArrowRight className="h-4 w-4 text-accent" aria-hidden="true" />
      <div className="rounded-lg border border-emerald/40 bg-emerald/10 px-3 py-2 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-emerald">value</p>
        <p className="mt-0.5 font-mono text-[15px] font-bold text-ink">{sample?.floatText ?? '12.60'}</p>
      </div>
      <span className="rounded-full border border-line bg-panel px-2 py-1 font-mono text-[10px] text-muted">
        a float value
      </span>
    </div>
  );
}

function AssignmentOrder() {
  return (
    <div className="flex flex-wrap items-center gap-2 font-mono text-[13px]">
      <span className="rounded-md border border-line bg-panel px-2 py-1 text-muted">old x</span>
      <span className="text-faint">→</span>
      <span className="rounded-md border border-emerald/40 bg-emerald/10 px-2 py-1 text-emerald">x + 1</span>
      <span className="text-faint">→</span>
      <span className="rounded-md border border-accent/40 bg-accent/10 px-2 py-1 font-bold text-accent">
        new x
      </span>
    </div>
  );
}

function IntFloat({ sample }: { sample?: PrimitiveSample }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="rounded-lg border border-amber/40 bg-amber/10 p-2.5">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-amber">int · whole</p>
        <p className="font-mono text-xl font-bold text-ink">{sample?.intText ?? '400'}</p>
      </div>
      <div className="rounded-lg border border-accent/40 bg-accent/10 p-2.5">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">float · decimal</p>
        <p className="font-mono text-xl font-bold text-ink">{sample?.floatText ?? '12.60'}</p>
      </div>
    </div>
  );
}

function Strings() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Quote className="h-4 w-4 text-purple" aria-hidden="true" />
      <span className="rounded-lg border border-purple/40 bg-purple/10 px-3 py-2 font-mono text-[15px] text-ink">
        &quot;sunny&quot;
      </span>
      <span className="text-[12px] text-muted">the word, not the weather itself</span>
    </div>
  );
}

function Booleans() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded-full border border-emerald/40 bg-emerald/10 px-3 py-1.5 font-mono text-[14px] font-bold text-emerald">
        True
      </span>
      <span className="text-faint">or</span>
      <span className="rounded-full border border-rose/40 bg-rose/10 px-3 py-1.5 font-mono text-[14px] font-bold text-rose">
        False
      </span>
      <ToggleLeft className="h-5 w-5 text-rose" aria-hidden="true" />
    </div>
  );
}

function MixedTypes() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded-md border border-purple/40 bg-purple/10 px-2.5 py-1.5 font-mono text-[13px] text-ink">
        &quot;12&quot;
      </span>
      <span className="text-[16px] text-faint">+</span>
      <span className="rounded-md border border-amber/40 bg-amber/10 px-2.5 py-1.5 font-mono text-[13px] text-ink">5</span>
      <span className="text-faint">→</span>
      <span className="inline-flex items-center gap-1 rounded-md border border-rose/40 bg-rose/10 px-2.5 py-1.5 font-mono text-[12px] text-rose">
        <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" /> TypeError
      </span>
    </div>
  );
}

function FStrings() {
  return (
    <div className="flex flex-wrap items-center gap-2 font-mono text-[13px]">
      <Braces className="h-4 w-4 text-accent" aria-hidden="true" />
      <span className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-ink">
        f&quot;Plant: <span className="rounded bg-accent/20 px-1 text-accent">{'{'}height{'}'}</span> cm&quot;
      </span>
      <span className="text-faint">→</span>
      <span className="rounded-md border border-emerald/40 bg-emerald/10 px-2 py-1 text-emerald">
        Plant: 12.15 cm
      </span>
    </div>
  );
}

function Operators() {
  return (
    <div className="flex flex-wrap items-center gap-2 font-mono text-[13px]">
      {[
        ['*', 'multiply'],
        ['/', 'float divide'],
        ['**', 'power'],
      ].map(([symbol, meaning]) => (
        <span
          key={symbol}
          className="inline-flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1.5"
        >
          <span className="text-[15px] font-bold text-accent">{symbol}</span>
          <span className="text-[11px] text-muted">{meaning}</span>
        </span>
      ))}
    </div>
  );
}

function FloorDivision() {
  return (
    <div className="flex flex-wrap items-center gap-2 font-mono text-[13px]">
      <span className="rounded-md border border-line bg-panel px-2 py-1 text-muted">1023</span>
      <span className="text-[15px] font-bold text-emerald">//</span>
      <span className="rounded-md border border-line bg-panel px-2 py-1 text-muted">4</span>
      <span className="text-faint">→</span>
      <span className="rounded-md border border-emerald/40 bg-emerald/10 px-2 py-1 text-emerald">255</span>
      <span className="text-[11px] text-muted">whole groups; 3 left over</span>
    </div>
  );
}

function OrderOfOperations() {
  return (
    <div className="flex flex-wrap items-center gap-2 font-mono text-[13px]">
      <span className="rounded-md border border-accent/40 bg-accent/10 px-2 py-1 text-accent">( )</span>
      <span className="text-faint">→</span>
      <span className="rounded-md border border-amber/40 bg-amber/10 px-2 py-1 text-amber">**</span>
      <span className="text-faint">→</span>
      <span className="rounded-md border border-emerald/40 bg-emerald/10 px-2 py-1 text-emerald">* /</span>
      <span className="text-faint">→</span>
      <span className="rounded-md border border-line bg-panel px-2 py-1 text-muted">+ -</span>
      <span className="text-[11px] text-muted">left to right</span>
    </div>
  );
}

function Picture({ conceptId }: { conceptId: string }) {
  const picture = PICTURE[conceptId];
  return (
    <div className="flex flex-wrap items-center gap-2 font-mono text-[12px]">
      {picture.chips.map((chip, index) => (
        <span key={`${chip}-${index}`} className="flex items-center gap-2">
          {index > 0 ? <span className="text-faint">→</span> : null}
          <span className="rounded-md border border-line bg-panel px-2 py-1 text-ink">{chip}</span>
        </span>
      ))}
      <span className="text-[11px] text-muted">{picture.note}</span>
    </div>
  );
}

export function MicroVisual({ conceptId, sample }: { conceptId: string; sample?: PrimitiveSample }) {
  const tone = TONE[conceptId] ?? TONE.variables;
  const body =
    conceptId === 'assignment-order' ? (
      <AssignmentOrder />
    ) : conceptId === 'int-float' ? (
      <IntFloat sample={sample} />
    ) : conceptId === 'strings' ? (
      <Strings />
    ) : conceptId === 'booleans' ? (
      <Booleans />
    ) : conceptId === 'mixed-types' ? (
      <MixedTypes />
    ) : conceptId === 'f-strings' ? (
      <FStrings />
    ) : conceptId === 'operators' ? (
      <Operators />
    ) : conceptId === 'floor-division' ? (
      <FloorDivision />
    ) : conceptId === 'order-of-operations' ? (
      <OrderOfOperations />
    ) : PICTURE[conceptId] ? (
      <Picture conceptId={conceptId} />
    ) : (
      <Variables sample={sample} />
    );
  return (
    <figure
      role="img"
      aria-label={tone.label}
      data-testid={`micro-visual-${conceptId}`}
      className={`rounded-xl border ${tone.border} ${tone.bg} p-3.5`}
    >
      <div className="mb-2 flex items-center gap-1.5">
        {conceptId === 'mixed-types' ? (
          <CircleHelp className={`h-3.5 w-3.5 ${tone.text}`} aria-hidden="true" />
        ) : conceptId === 'f-strings' ? (
          <Sparkles className={`h-3.5 w-3.5 ${tone.text}`} aria-hidden="true" />
        ) : conceptId === 'booleans' ? (
          <Equal className={`h-3.5 w-3.5 ${tone.text}`} aria-hidden="true" />
        ) : null}
        <figcaption className={`font-mono text-[10px] uppercase tracking-[0.14em] ${tone.text}`}>
          {tone.label}
        </figcaption>
      </div>
      {body}
    </figure>
  );
}
