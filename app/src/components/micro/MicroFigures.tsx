/**
 * The picture families behind the micro lessons (`components/micro/MicroFigures.tsx`).
 *
 * Each micro focus used to open with the same shape — a row of labelled chips — so twelve lessons in
 * a row looked like one screen with different words. A learner reading six micro lessons in a
 * sitting needs the *idea* to change shape, not only the labels: a list is a rail of numbered cells,
 * a loop is a cycle through those cells, a function is a machine with a mouth and an exit, an assert
 * is a gate that closes.
 *
 * Every concept is assigned one family here, explicitly, and `visualKind` throws on an unknown id
 * rather than quietly drawing the default: a lesson added without a picture is exactly the kind of
 * gap a hand-maintained map hides. The families are deliberately different in *construction* as well
 * as in colour — CSS boxes, an SVG dial, a plot with axes, a bit grid, a balance beam — so two
 * neighbouring lessons never read as the same diagram recoloured.
 */
import type { MicroFigureKind } from '../../micro/visuals.ts';
import {
  ArrowRight,
  Check,
  CircleDot,
  Layers,
  Repeat,
  ShieldCheck,
  Sigma,
  TriangleAlert,
  X,
} from 'lucide-react';


const CARD = 'rounded-lg border border-line bg-panel/70';

function Notes() {
  return (
    <div className="flex flex-wrap items-start gap-2">
      {[
        { name: 'plant_height', value: '12.60', tone: 'border-amber/40 bg-amber/10 text-amber' },
        { name: 'sticker_count', value: '400', tone: 'border-accent/40 bg-accent/10 text-accent' },
      ].map((note) => (
        <span
          key={note.name}
          className={`relative -rotate-1 rounded-md border px-2.5 pb-2 pt-3 font-mono text-[11.5px] shadow-sm ${note.tone}`}
        >
          <span className="absolute -top-1.5 left-2 h-2.5 w-2.5 rounded-full border border-current bg-panel" />
          <span className="block text-[10px] uppercase tracking-[0.1em] opacity-80">{note.name}</span>
          <span className="text-[15px] font-bold">{note.value}</span>
        </span>
      ))}
      <span className="self-center font-mono text-[11px] text-muted">name → value, one note each</span>
    </div>
  );
}

function Numbers() {
  return (
    <div className="flex flex-wrap items-center gap-2 font-mono text-[12px]">
      <span className="rounded-md border border-accent/40 bg-accent/10 px-2 py-1 text-accent">int 42</span>
      <span className="rounded-md border border-amber/40 bg-amber/10 px-2 py-1 text-amber">float 42.0</span>
      <span className="rounded-md border border-rose/40 bg-rose/10 px-2 py-1 text-rose">bool True</span>
      <span className="text-faint">≠</span>
      <span className="rounded-md border border-line bg-panel px-2 py-1 text-muted">"42"</span>
      <span className="text-[11px] text-muted">different boxes, different rules</span>
    </div>
  );
}

function Strings() {
  return (
    <div className="font-mono text-[12px]">
      <div className="flex items-end gap-1">
        {['"', 'p', 'l', 'a', 'n', 't', '"'].map((char, index) => (
          <span key={index} className="flex flex-col items-center gap-1">
            <span
              className={`flex h-7 w-6 items-center justify-center rounded border ${
                char === '"'
                  ? 'border-purple/40 bg-purple/10 text-purple'
                  : 'border-line bg-panel text-ink'
              }`}
            >
              {char}
            </span>
            <span className="text-[9px] text-faint">{index}</span>
          </span>
        ))}
      </div>
      <p className="mt-1 text-[10.5px] text-muted">the quotes are part of the text, the indices are not</p>
    </div>
  );
}

function ListFigure() {
  return (
    <div className="font-mono text-[12px]">
      <div className="flex items-end gap-1">
        {['17', '23', '4'].map((value, index) => (
          <span key={index} className="flex flex-col items-center gap-1">
            <span className="flex h-8 w-11 items-center justify-center rounded border border-accent/40 bg-accent/10 text-accent">
              {value}
            </span>
            <span className="text-[9.5px] text-faint">[{index}]</span>
          </span>
        ))}
        <span className="ml-1 self-center text-[11px] text-muted">last index is len − 1</span>
      </div>
      <p className="mt-1 text-[10.5px] text-rose">[3] → IndexError</p>
    </div>
  );
}

function LoopFigure() {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-full border border-emerald/40 bg-emerald/10 text-emerald">
        <Repeat className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="flex items-center gap-1 font-mono text-[11px]">
        {['item 0', 'item 1', 'item 2'].map((item) => (
          <span key={item} className="rounded border border-line bg-panel px-1.5 py-1 text-muted">
            {item}
          </span>
        ))}
        <ArrowRight className="h-3.5 w-3.5 text-emerald" aria-hidden="true" />
        <span className="text-[10.5px] text-emerald">back to the top</span>
      </div>
    </div>
  );
}

function FunctionFigure() {
  return (
    <div className="flex flex-wrap items-center gap-2 font-mono text-[11.5px]">
      <span className="rounded-md border border-line bg-panel px-2 py-1 text-muted">argument</span>
      <ArrowRight className="h-3.5 w-3.5 text-faint" aria-hidden="true" />
      <span className="flex flex-col items-center gap-0.5 rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-accent">
        <Layers className="h-4 w-4" aria-hidden="true" />
        def f(x)
      </span>
      <ArrowRight className="h-3.5 w-3.5 text-faint" aria-hidden="true" />
      <span className="rounded-md border border-emerald/40 bg-emerald/10 px-2 py-1 text-emerald">return</span>
      <span className="w-full text-[10.5px] text-muted">one definition, any number of calls</span>
    </div>
  );
}

function AssertFigure() {
  return (
    <div className="flex flex-wrap items-center gap-2 font-mono text-[11.5px]">
      <span className="rounded-md border border-line bg-panel px-2 py-1 text-muted">condition</span>
      <span className="flex items-center gap-1 rounded-md border border-emerald/40 bg-emerald/10 px-2 py-1 text-emerald">
        <Check className="h-3.5 w-3.5" aria-hidden="true" /> True → carry on
      </span>
      <span className="flex items-center gap-1 rounded-md border border-rose/40 bg-rose/10 px-2 py-1 text-rose">
        <X className="h-3.5 w-3.5" aria-hidden="true" /> False → AssertionError
      </span>
    </div>
  );
}

function UnitsFigure() {
  return (
    <div className="flex items-center gap-1.5 font-mono text-[11px]">
      {[
        ['k', '×1000'],
        ['', '×1'],
        ['m', '×0.001'],
      ].map(([prefix, factor], index) => (
        <span key={prefix || 'none'} className="flex items-center gap-1.5">
          {index > 0 ? <span className="text-faint">→</span> : null}
          <span
            className={`rounded-md border px-2 py-1 ${
              index === 1
                ? 'border-accent/40 bg-accent/10 text-accent'
                : 'border-line bg-panel text-muted'
            }`}
          >
            <span className="text-[13px] font-bold">{prefix || 'm / s'}</span>{' '}
            <span className="text-[9.5px]">{prefix ? `m ${factor}` : 'base unit'}</span>
          </span>
        </span>
      ))}
      <span className="text-[10.5px] text-muted">cancel the units, keep the number</span>
    </div>
  );
}

function BitsFigure() {
  return (
    <div className="font-mono text-[11px]">
      <div className="flex gap-1">
        {[8, 4, 2, 1].map((weight, index) => (
          <span key={weight} className="flex flex-col items-center gap-1">
            <span className="flex h-7 w-8 items-center justify-center rounded border border-emerald/40 bg-emerald/10 text-emerald">
              {index < 2 ? '1' : '0'}
            </span>
            <span className="text-[9.5px] text-faint">{weight}</span>
          </span>
        ))}
      </div>
      <p className="mt-1 text-[10.5px] text-muted">8 + 4 = 12; each place doubles</p>
    </div>
  );
}

function BalanceFigure() {
  return (
    <div className="flex items-center gap-2 font-mono text-[11.5px]">
      <span className="rounded-md border border-accent/40 bg-accent/10 px-2 py-1 text-accent">x + 3</span>
      <span className="flex flex-col items-center gap-0.5 text-muted">
        <Sigma className="h-4 w-4" aria-hidden="true" />
        <span className="text-[9.5px]">do it to both</span>
      </span>
      <span className="rounded-md border border-emerald/40 bg-emerald/10 px-2 py-1 text-emerald">10</span>
      <span className="text-faint">−3</span>
      <span className="rounded-md border border-line bg-panel px-2 py-1 text-muted">x = 7</span>
    </div>
  );
}

function RangeFigure() {
  return (
    <div className="w-full max-w-[280px] font-mono text-[10.5px]">
      <div className="relative h-3 rounded-full border border-line bg-canvas">
        <span className="absolute inset-y-0 left-[20%] right-[20%] rounded-full bg-emerald/25" />
        <span className="absolute left-[20%] top-0 h-3 w-px bg-emerald" />
        <span className="absolute right-[20%] top-0 h-3 w-px bg-emerald" />
        <span className="absolute -top-1 left-[58%] h-5 w-1.5 -translate-x-1/2 rounded-sm bg-accent" />
      </div>
      <div className="mt-1 flex justify-between text-faint">
        <span>min</span>
        <span className="text-emerald">allowed</span>
        <span>max</span>
      </div>
    </div>
  );
}

function AngleFigure() {
  return (
    <svg viewBox="0 0 150 84" className="h-20 w-[150px]" role="img" aria-hidden="true">
      <line x1="18" y1="66" x2="134" y2="66" stroke="var(--line-strong)" strokeWidth="1.5" />
      <line x1="18" y1="66" x2="18" y2="10" stroke="var(--line-strong)" strokeWidth="1.5" />
      <line x1="18" y1="66" x2="112" y2="24" stroke="var(--accent)" strokeWidth="2" />
      <path d="M 54 66 A 36 36 0 0 0 42 44" fill="none" stroke="var(--emerald)" strokeWidth="2" />
      <circle cx="18" cy="66" r="2.5" fill="var(--accent)" />
      <text x="60" y="62" fontSize="9" fill="var(--emerald)" fontFamily="monospace">
        θ
      </text>
      <text x="92" y="36" fontSize="8" fill="var(--muted)" fontFamily="monospace">
        cos
      </text>
      <text x="48" y="22" fontSize="8" fill="var(--muted)" fontFamily="monospace">
        sin
      </text>
    </svg>
  );
}

function PlotFigure() {
  return (
    <svg viewBox="0 0 160 84" className="h-20 w-40" role="img" aria-hidden="true">
      <line x1="16" y1="70" x2="150" y2="70" stroke="var(--line-strong)" strokeWidth="1.2" />
      <line x1="16" y1="70" x2="16" y2="8" stroke="var(--line-strong)" strokeWidth="1.2" />
      <path d="M18 64 L58 50 L94 36 L146 14" fill="none" stroke="var(--accent)" strokeWidth="2" />
      <path d="M18 64 L58 50 L94 36 L146 14 L146 70 L18 70 Z" fill="var(--accent)" opacity="0.12" />
      <line x1="58" y1="50" x2="58" y2="70" stroke="var(--emerald)" strokeDasharray="3 2" />
      <text x="58" y="79" fontSize="7.5" fill="var(--muted)" fontFamily="monospace">
        t
      </text>
      <text x="3" y="14" fontSize="7.5" fill="var(--muted)" fontFamily="monospace">
        y
      </text>
    </svg>
  );
}

function MechanicsFigure() {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-9 w-9 items-center justify-center rounded-md border border-line bg-panel font-mono text-[11px] text-ink">
        m
      </span>
      <span className="text-faint">→</span>
      <span className="flex items-center gap-1 font-mono text-[11px] text-rose">
        <ArrowRight className="h-4 w-4" aria-hidden="true" /> F = m·a
      </span>
      <span className="flex flex-col items-center font-mono text-[9.5px] text-muted">
        <span className="h-5 w-px bg-amber" />
        <span>g</span>
      </span>
      <span className="font-mono text-[9.5px] text-muted">lever arm ⟂ force</span>
    </div>
  );
}

function LimitsFigure() {
  return (
    <div className={`${CARD} w-full max-w-[300px] overflow-hidden font-mono text-[10.5px]`}>
      <div className="flex justify-between border-b border-line-soft bg-canvas px-2 py-1 text-faint">
        <span>symbol</span>
        <span>min</span>
        <span>max</span>
      </div>
      <div className="flex justify-between px-2 py-1 text-body">
        <span>V_GS</span>
        <span>−0.5 V</span>
        <span className="text-rose">20 V</span>
      </div>
      <p className="border-t border-line-soft px-2 py-1 text-[9.5px] text-amber">
        <TriangleAlert className="mr-1 inline h-3 w-3" aria-hidden="true" />
        recommended ≠ destruction limit
      </p>
    </div>
  );
}

function AnswerFigure() {
  return (
    <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10.5px]">
      {['given', 'model', 'check', 'answer'].map((step, index) => (
        <span key={step} className="flex items-center gap-1.5">
          {index > 0 ? <ArrowRight className="h-3 w-3 text-faint" aria-hidden="true" /> : null}
          <span
            className={`flex items-center gap-1 rounded-md border px-2 py-1 ${
              step === 'check'
                ? 'border-emerald/40 bg-emerald/10 text-emerald'
                : 'border-line bg-panel text-muted'
            }`}
          >
            {step === 'check' ? <ShieldCheck className="h-3 w-3" aria-hidden="true" /> : null}
            {step}
          </span>
        </span>
      ))}
    </div>
  );
}

function BranchFigure() {
  return (
    <div className="flex items-center gap-2 font-mono text-[11px]">
      <span className="flex items-center gap-1 rounded-md border border-accent/40 bg-accent/10 px-2 py-1 text-accent">
        <CircleDot className="h-3 w-3" aria-hidden="true" /> condition
      </span>
      <span className="flex flex-col gap-1 text-[10px]">
        <span className="rounded border border-emerald/40 bg-emerald/10 px-1.5 py-0.5 text-emerald">
          True → this path
        </span>
        <span className="rounded border border-rose/40 bg-rose/10 px-1.5 py-0.5 text-rose">
          False → that path
        </span>
      </span>
      <span className="text-[10px] text-muted">and / or / not join questions</span>
    </div>
  );
}

function OperatorsFigure() {
  return (
    <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
      {[
        ['+', 'add'],
        ['-', 'subtract'],
        ['*', 'multiply'],
        ['/', 'divide'],
        ['%', 'remainder'],
      ].map(([symbol, meaning]) => (
        <span key={symbol} className="rounded-md border border-line bg-panel px-1.5 py-1">
          <span className="text-[13px] font-bold text-accent">{symbol}</span>{' '}
          <span className="text-[9.5px] text-muted">{meaning}</span>
        </span>
      ))}
    </div>
  );
}

/** One picture family, drawn. Props are optional so every family can share one signature. */
export function MicroFigure({ kind }: { kind: MicroFigureKind }) {
  switch (kind) {
    case 'assert':
      return <AssertFigure />;
    case 'balance':
      return <BalanceFigure />;
    case 'bits':
      return <BitsFigure />;
    case 'branch':
      return <BranchFigure />;
    case 'function':
      return <FunctionFigure />;
    case 'limits':
      return <LimitsFigure />;
    case 'list':
      return <ListFigure />;
    case 'loop':
      return <LoopFigure />;
    case 'mechanics':
      return <MechanicsFigure />;
    case 'numbers':
      return <Numbers />;
    case 'operators':
      return <OperatorsFigure />;
    case 'plot':
      return <PlotFigure />;
    case 'angle':
      return <AngleFigure />;
    case 'range':
      return <RangeFigure />;
    case 'strings':
      return <Strings />;
    case 'units':
      return <UnitsFigure />;
    case 'answer':
      return <AnswerFigure />;
    default:
      return <Notes />;
  }
}
