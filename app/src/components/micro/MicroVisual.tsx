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
};

function Variables() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">name</p>
        <p className="mt-0.5 font-mono text-[15px] font-bold text-ink">plant_height</p>
      </div>
      <ArrowRight className="h-4 w-4 text-accent" aria-hidden="true" />
      <div className="rounded-lg border border-emerald/40 bg-emerald/10 px-3 py-2 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-emerald">value</p>
        <p className="mt-0.5 font-mono text-[15px] font-bold text-ink">12.60</p>
      </div>
      <span className="rounded-full border border-line bg-panel px-2 py-1 font-mono text-[10px] text-muted">
        “twelve point six”
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

function IntFloat() {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="rounded-lg border border-amber/40 bg-amber/10 p-2.5">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-amber">int · whole</p>
        <p className="font-mono text-xl font-bold text-ink">400</p>
      </div>
      <div className="rounded-lg border border-accent/40 bg-accent/10 p-2.5">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">float · decimal</p>
        <p className="font-mono text-xl font-bold text-ink">12.60</p>
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

export function MicroVisual({ conceptId }: { conceptId: string }) {
  const tone = TONE[conceptId] ?? TONE.variables;
  const body =
    conceptId === 'assignment-order' ? (
      <AssignmentOrder />
    ) : conceptId === 'int-float' ? (
      <IntFloat />
    ) : conceptId === 'strings' ? (
      <Strings />
    ) : conceptId === 'booleans' ? (
      <Booleans />
    ) : conceptId === 'mixed-types' ? (
      <MixedTypes />
    ) : conceptId === 'f-strings' ? (
      <FStrings />
    ) : (
      <Variables />
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
