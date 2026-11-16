/**
 * One designed scene per micro focus (`components/micro/MicroConceptVisual.tsx`).
 *
 * The previous renderer grouped concepts into eighteen shared picture families, so many neighbouring
 * lessons opened with the same diagram. Each function here is deliberately about one idea: a conveyor
 * for assignment, a grouping tray for floor division, a quadrant for atan2, a lever for torque. They
 * share only small primitives (a tile, a chip, an arrow), never a whole picture.
 */
import type { ReactNode } from 'react';
import type { PrimitiveSample } from '../../micro/randomize.ts';
import { CONCEPT_VISUAL_SCENES, type ConceptVisualId } from '../../micro/visuals.ts';

type Props = { sample?: PrimitiveSample };

const mono = 'font-mono';

function Tile({
  title,
  value,
  note,
  className = 'border-line bg-panel/70 text-muted',
}: {
  title: string;
  value: ReactNode;
  note?: string;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border px-2.5 py-2 ${className}`}>
      <p className="font-mono text-[9px] uppercase tracking-[0.14em] opacity-75">{title}</p>
      <p className={`mt-0.5 ${mono} text-[12.5px] font-bold text-ink`}>{value}</p>
      {note ? <p className="mt-0.5 text-[10px] leading-snug text-muted">{note}</p> : null}
    </div>
  );
}

function Chip({ children, className = 'border-line bg-panel text-muted' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${className}`}>
      {children}
    </span>
  );
}

function Arrow({ children = '→', className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <span className={`shrink-0 text-[15px] text-faint ${className}`} aria-hidden="true">
      {children}
    </span>
  );
}

function VariablesVisual({ sample }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative -rotate-1 rounded-md border border-amber/40 bg-amber/10 px-3 py-2 shadow-sm">
        <span className="absolute -top-1 left-2 h-2 w-2 rounded-full border border-amber/50 bg-panel" />
        <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-amber">name</p>
        <p className="mt-0.5 font-mono text-[13px] font-bold text-ink">plant_height</p>
      </div>
      <Arrow />
      <div className="rounded-lg border-2 border-dashed border-accent/50 bg-accent/5 px-3 py-2">
        <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-accent">value</p>
        <p className="mt-0.5 font-mono text-[14px] font-bold text-ink">{sample?.floatText ?? '12.60'}</p>
      </div>
      <Chip className="border-accent/30 bg-accent/10 text-accent">one name · one value</Chip>
    </div>
  );
}

function AssignmentOrderVisual() {
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center">
        <Tile title="old x" value="4" className="border-line bg-canvas text-muted" />
        <Arrow />
        <Tile
          title="right side first"
          value="x + 1 = 5"
          note="read and evaluate"
          className="border-emerald/40 bg-emerald/10 text-emerald"
        />
        <Arrow />
        <Tile
          title="new x"
          value="5"
          note="write back"
          className="border-accent/40 bg-accent/10 text-accent"
        />
      </div>
      <p className="text-[10.5px] text-muted">The old value is read before the new one lands.</p>
    </div>
  );
}

function IntFloatVisual({ sample }: Props) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Tile
        title="int · whole"
        value={sample?.intText ?? '400'}
        note="no decimal point"
        className="rounded-sm border-amber/40 bg-amber/10 text-amber"
      />
      <Tile
        title="float · decimal"
        value={sample?.floatText ?? '12.60'}
        note="the decimal point is part of the type"
        className="rounded-2xl border-accent/40 bg-accent/10 text-accent"
      />
    </div>
  );
}

function StringsVisual() {
  return (
    <div>
      <div className="flex items-end gap-1">
        {['"', 'p', 'l', 'a', 'n', 't', '"'].map((char, index) => (
          <span key={`${char}-${index}`} className="flex flex-col items-center gap-1">
            <span
              className={`flex h-7 w-6 items-center justify-center rounded border font-mono text-[12px] ${
                char === '"'
                  ? 'border-purple/40 bg-purple/10 text-purple'
                  : 'border-line bg-panel text-ink'
              }`}
            >
              {char}
            </span>
            <span className="font-mono text-[8px] text-faint">{index}</span>
          </span>
        ))}
      </div>
      <p className="mt-1 text-[10.5px] text-muted">Quotes are the container; the letters are the value.</p>
    </div>
  );
}

function BooleansVisual() {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="flex items-center gap-2 rounded-lg border border-emerald/40 bg-emerald/10 p-2.5">
        <span className="grid h-7 w-7 place-items-center rounded-full border-2 border-emerald bg-panel font-mono text-[12px] font-bold text-emerald">
          1
        </span>
        <div>
          <p className="font-mono text-[12px] font-bold text-emerald">True</p>
          <p className="text-[10px] text-muted">on · yes</p>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-rose/40 bg-rose/10 p-2.5">
        <span className="grid h-7 w-7 place-items-center rounded-full border-2 border-rose bg-panel font-mono text-[12px] font-bold text-rose">
          0
        </span>
        <div>
          <p className="font-mono text-[12px] font-bold text-rose">False</p>
          <p className="text-[10px] text-muted">off · no</p>
        </div>
      </div>
    </div>
  );
}

function MixedTypesVisual() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative rounded-l-lg border border-purple/40 bg-purple/10 px-2.5 py-2 font-mono text-[13px] text-ink">
        &quot;12&quot;
        <span className="absolute -right-1 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-purple/50 bg-panel" />
      </div>
      <span className="text-[16px] text-faint">+</span>
      <div className="relative rounded-r-lg border border-amber/40 bg-amber/10 px-2.5 py-2 font-mono text-[13px] text-ink">
        5
        <span className="absolute -left-1 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-amber/50 bg-panel" />
      </div>
      <Arrow />
      <span className="inline-flex items-center gap-1 rounded-md border border-rose/40 bg-rose/10 px-2 py-1 font-mono text-[11px] text-rose">
        TypeError: shapes do not fit
      </span>
    </div>
  );
}

function FStringsVisual() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-2 font-mono text-[12px] text-ink">
        f&quot;Plant:{' '}
        <span className="rounded border border-accent/50 bg-accent/20 px-1 text-accent">{'{height}'}</span>{' '}
        cm&quot;
      </div>
      <Arrow />
      <div className="rounded-md border border-emerald/40 bg-emerald/10 px-2.5 py-1.5 font-mono text-[12px] text-emerald">
        Plant: 12.15 cm
      </div>
      <p className="w-full text-[10.5px] text-muted">The braces are a labelled slot, not literal text.</p>
    </div>
  );
}

function OperatorsVisual() {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {[
          ['+', 'add'],
          ['-', 'subtract'],
          ['*', 'multiply'],
          ['/', 'divide'],
          ['**', 'power'],
        ].map(([symbol, meaning]) => (
          <span
            key={symbol}
            className="inline-flex items-center gap-1 rounded-md border border-accent/40 bg-accent/10 px-2 py-1"
          >
            <span className="font-mono text-[14px] font-bold text-accent">{symbol}</span>
            <span className="text-[9.5px] text-muted">{meaning}</span>
          </span>
        ))}
      </div>
      <p className="font-mono text-[12px] text-ink">2 * 3 → 6</p>
    </div>
  );
}

function FloorDivisionVisual() {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Tile title="reading" value="1023" className="border-line bg-canvas text-muted" />
        <span className="font-mono text-[16px] font-bold text-emerald">//</span>
        <Tile title="groups" value="4" className="border-line bg-canvas text-muted" />
        <Arrow />
        <div className="flex gap-1">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="flex h-10 w-7 items-end rounded border border-emerald/40 bg-emerald/5 p-0.5">
              <span className="h-full w-full rounded-sm bg-emerald/25" />
            </div>
          ))}
        </div>
        <Tile title="each group" value="255" className="border-emerald/40 bg-emerald/10 text-emerald" />
      </div>
      <div className="flex items-center gap-1 text-[10px] text-muted">
        <span>left over:</span>
        {[0, 1, 2].map((dot) => (
          <span key={dot} className="h-1.5 w-1.5 rounded-full bg-amber" />
        ))}
        <span>3 · dropped</span>
      </div>
    </div>
  );
}

function OrderOfOperationsVisual() {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-accent/30 bg-accent/5 p-2.5 font-mono text-[12px]">
        <span className="rounded border border-accent/50 bg-panel px-1.5 py-1 text-accent">(</span>
        <span className="text-ink">2 +</span>
        <span className="rounded border border-amber/50 bg-amber/10 px-1.5 py-1 text-amber">
          3 * 4
        </span>
        <span className="rounded border border-accent/50 bg-panel px-1.5 py-1 text-accent">)</span>
        <Arrow />
        <span className="rounded border border-emerald/40 bg-emerald/10 px-1.5 py-1 text-emerald">14</span>
      </div>
      <p className="text-[10.5px] text-muted">Inner group first: 3 × 4 = 12, then 2 + 12.</p>
    </div>
  );
}

function ComparisonsVisual() {
  return (
    <div className="space-y-2">
      <div className="relative mx-auto h-16 w-full max-w-[240px]">
        <div className="absolute left-2 right-2 top-5 h-0.5 rotate-[-4deg] rounded bg-line" />
        <div className="absolute left-2 top-1 rounded border border-line bg-panel px-2 py-1 font-mono text-[11px]">
          12
        </div>
        <div className="absolute right-2 top-7 rounded border border-line bg-panel px-2 py-1 font-mono text-[11px]">
          80
        </div>
        <div className="absolute left-1/2 top-10 h-0 w-0 -translate-x-1/2 border-x-8 border-t-[10px] border-x-transparent border-t-accent" />
      </div>
      <div className="flex items-center justify-center gap-2 font-mono text-[12px]">
        <span className="text-ink">12 &gt; 80</span>
        <Arrow />
        <span className="rounded-full border border-rose/40 bg-rose/10 px-2 py-0.5 font-bold text-rose">
          False
        </span>
      </div>
    </div>
  );
}

function ClampingVisual() {
  return (
    <div className="space-y-2">
      <div className="relative h-16 overflow-hidden rounded-lg border border-line bg-canvas px-3">
        <div className="absolute left-3 right-3 top-5 h-2 rounded-full bg-line">
          <div className="h-full w-[64%] rounded-full bg-emerald/50" />
        </div>
        <span className="absolute left-3 top-9 font-mono text-[9px] text-faint">0</span>
        <span className="absolute left-[64%] top-9 -translate-x-1/2 font-mono text-[9px] text-emerald">
          255
        </span>
        <span className="absolute right-2 top-2 rounded border border-rose/40 bg-rose/10 px-1.5 py-0.5 font-mono text-[10px] text-rose">
          310
        </span>
        <span className="absolute right-8 top-9 font-mono text-[9px] text-rose">too high →</span>
        <div className="absolute left-[64%] top-3 h-6 w-0.5 -translate-x-1/2 bg-emerald" />
      </div>
      <p className="font-mono text-[11px] text-ink">min(310, 255) → 255</p>
    </div>
  );
}

function LogicVisual() {
  return (
    <div className="space-y-1">
      <svg viewBox="0 0 240 82" className="h-20 w-full text-purple" role="presentation">
        <path d="M78 18 H126 A30 30 0 0 1 126 64 H78 Z" fill="none" stroke="currentColor" strokeWidth="2" />
        <line x1="28" y1="30" x2="78" y2="30" stroke="currentColor" strokeWidth="2" />
        <line x1="28" y1="52" x2="78" y2="52" stroke="currentColor" strokeWidth="2" />
        <line x1="156" y1="41" x2="214" y2="41" stroke="currentColor" strokeWidth="2" />
        <text x="4" y="34" fill="currentColor" fontSize="10">True</text>
        <text x="4" y="56" fill="currentColor" fontSize="10">False</text>
        <text x="88" y="45" fill="currentColor" fontSize="10">AND</text>
        <text x="178" y="36" fill="currentColor" fontSize="10">False</text>
      </svg>
      <p className="text-center text-[10.5px] text-muted">Both sides must be true; one false closes the gate.</p>
    </div>
  );
}

function ListsVisual() {
  return (
    <div>
      <div className="flex items-stretch gap-1">
        <span className="self-center font-mono text-[24px] leading-none text-emerald">[</span>
        {[
          ['0', '12.1'],
          ['1', '11.9'],
          ['2', '11.8'],
        ].map(([index, value]) => (
          <div key={index} className="min-w-14 rounded border border-emerald/30 bg-emerald/5 px-2 py-1.5 text-center">
            <p className="font-mono text-[9px] text-faint">index {index}</p>
            <p className="font-mono text-[12px] font-bold text-ink">{value}</p>
          </div>
        ))}
        <span className="self-center font-mono text-[24px] leading-none text-emerald">]</span>
      </div>
      <p className="mt-1 text-[10.5px] text-muted">One name, three ordered slots; each slot has an index.</p>
    </div>
  );
}

function ForLoopsVisual() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1">
        {['12.1', '11.9', '11.8'].map((value) => (
          <span key={value} className="rounded border border-amber/40 bg-amber/10 px-1.5 py-1 font-mono text-[10px] text-amber">
            {value}
          </span>
        ))}
      </div>
      <Arrow />
      <div className="relative grid h-14 w-14 place-items-center rounded-full border-2 border-dashed border-amber/60 bg-amber/5">
        <span className="font-mono text-[10px] font-bold text-amber">for</span>
        <span className="absolute -right-2 top-2 font-mono text-[14px] text-amber">↻</span>
      </div>
      <Arrow />
      <div className="rounded border border-line bg-panel px-2 py-1.5 font-mono text-[10.5px] text-ink">
        print(value)
        <p className="mt-0.5 text-[9px] text-muted">one item per pass</p>
      </div>
    </div>
  );
}

function IndexErrorVisual() {
  return (
    <div className="space-y-2">
      <div className="flex items-end gap-1">
        {[
          ['0', '12.1'],
          ['1', '11.9'],
          ['2', '11.8'],
        ].map(([index, value]) => (
          <div key={index} className="rounded border border-emerald/30 bg-emerald/5 px-2 py-1.5 text-center">
            <p className="font-mono text-[9px] text-faint">{index}</p>
            <p className="font-mono text-[11.5px] font-bold text-ink">{value}</p>
          </div>
        ))}
        <span className="pb-2 text-faint">→</span>
        <div className="rounded border border-dashed border-rose/50 bg-rose/10 px-2 py-1.5 text-center">
          <p className="font-mono text-[9px] text-rose">index 3</p>
          <p className="font-mono text-[13px] font-bold text-rose">✕</p>
        </div>
      </div>
      <p className="font-mono text-[10.5px] text-ink">len = 3 · last index = 2</p>
    </div>
  );
}

function FunctionsVisual() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Tile title="call" value="double(4)" className="border-line bg-canvas text-muted" />
      <Arrow />
      <div className="rounded-xl border-2 border-accent/40 bg-accent/5 px-3 py-2">
        <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-accent">function</p>
        <p className="font-mono text-[12px] font-bold text-ink">double(value)</p>
        <p className="mt-0.5 font-mono text-[10px] text-muted">return value * 2</p>
      </div>
      <Arrow />
      <Tile title="return" value="8" className="border-emerald/40 bg-emerald/10 text-emerald" />
      <p className="w-full text-[10.5px] text-muted">The returned value can be used, called again, or stored.</p>
    </div>
  );
}

function WhileLoopsVisual() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="rounded-full border border-emerald/40 bg-emerald/10 px-2.5 py-1 font-mono text-[9.5px] text-emerald">
        test step &lt; 3
      </div>
      <Arrow>→</Arrow>
      <div className="rounded-lg border border-line bg-panel px-2.5 py-1 font-mono text-[9.5px] text-ink">
        body
      </div>
      <Arrow>→</Arrow>
      <div className="rounded-lg border border-amber/40 bg-amber/10 px-2.5 py-1 font-mono text-[9.5px] text-amber">
        step += 1
      </div>
      <span className="font-mono text-[14px] text-emerald">↻</span>
      <p className="w-full text-[10.5px] text-muted">Test before every pass; the update is what lets it stop.</p>
    </div>
  );
}

function NoneVisual() {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="rounded-lg border border-dashed border-amber/40 bg-amber/5 p-2.5">
        <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-amber">return tray</p>
        <p className="mt-1 font-mono text-[13px] font-bold text-amber">None</p>
        <p className="text-[10px] text-muted">nothing was handed back</p>
      </div>
      <div className="rounded-lg border border-line bg-panel p-2.5">
        <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-faint">print receipt</p>
        <p className="mt-1 font-mono text-[13px] font-bold text-ink">print(7) → 7</p>
        <p className="text-[10px] text-muted">printed, not returned</p>
      </div>
    </div>
  );
}

function ImportsVisual() {
  return (
    <div className="overflow-hidden rounded-lg border border-purple/40 bg-purple/5">
      <div className="flex items-center justify-between border-b border-purple/30 bg-purple/10 px-2.5 py-1.5 font-mono text-[10.5px] text-purple">
        <span>import math</span>
        <span className="text-[9px]">toolbox</span>
      </div>
      <div className="flex flex-wrap gap-1 p-2">
        {['sqrt', 'sin', 'cos', 'pi'].map((tool) => (
          <Chip key={tool} className="border-purple/30 bg-panel text-purple">
            math.{tool}
          </Chip>
        ))}
      </div>
      <p className="px-2 pb-2 text-[10px] text-muted">A module name, a dot, then one of its tools.</p>
    </div>
  );
}

function AssertsVisual() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-2 rounded-lg border border-emerald/40 bg-emerald/5 px-2.5 py-2">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald/15 font-mono text-[14px] font-bold text-emerald">
          ✓
        </span>
        <div>
          <p className="font-mono text-[11px] text-ink">assert 2 + 2 == 4</p>
          <p className="text-[9.5px] text-muted">checkpoint passes silently</p>
        </div>
      </div>
      <Arrow />
      <Chip className="border-emerald/40 bg-emerald/10 text-emerald">continue</Chip>
    </div>
  );
}

function AssertMessageVisual() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="rounded-lg border border-rose/40 bg-rose/5 px-2.5 py-2">
        <p className="font-mono text-[10.5px] text-ink">assert x &lt; 10</p>
        <p className="mt-0.5 font-mono text-[13px] font-bold text-rose">AssertionError</p>
      </div>
      <div className="relative rounded-lg border border-rose/40 bg-rose/10 px-2.5 py-1.5 text-[10.5px] text-rose">
        &quot;too large&quot;
        <span className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 border-b border-l border-rose/40 bg-rose/10" />
      </div>
      <p className="w-full text-[10.5px] text-muted">The message travels with the failure, so the next reader knows why.</p>
    </div>
  );
}

function SiUnitsVisual() {
  return (
    <div className="space-y-2">
      <div className="flex h-9 items-end gap-1 rounded border border-line bg-canvas px-2 pb-1">
        {Array.from({ length: 11 }, (_, index) => (
          <span key={index} className={`w-px bg-line ${index % 5 === 0 ? 'h-4' : 'h-2'}`} />
        ))}
        <span className="ml-auto font-mono text-[9px] text-muted">250 mm</span>
      </div>
      <div className="flex items-center gap-2 font-mono text-[11px]">
        <span className="rounded border border-accent/40 bg-accent/10 px-2 py-0.5 text-accent">250 mm</span>
        <Arrow />
        <span className="rounded border border-emerald/40 bg-emerald/10 px-2 py-0.5 text-emerald">0.25 m</span>
        <span className="text-[10px] text-muted">divide by 1000 before the formula</span>
      </div>
    </div>
  );
}

function MetricPrefixesVisual() {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-1.5">
        {[
          ['m', 'milli', '÷ 1,000'],
          ['k', 'kilo', '× 1,000'],
          ['M', 'mega', '× 1,000,000'],
        ].map(([prefix, name, factor]) => (
          <div key={prefix} className="rounded-lg border border-emerald/30 bg-emerald/5 p-2 text-center">
            <p className="font-mono text-[16px] font-bold text-emerald">{prefix}</p>
            <p className="text-[9.5px] text-muted">{name}</p>
            <p className="mt-0.5 font-mono text-[8.5px] text-faint">{factor}</p>
          </div>
        ))}
      </div>
      <p className="font-mono text-[10.5px] text-ink">15 mA → 0.015 A</p>
    </div>
  );
}

function UnitCancelVisual() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-grid grid-cols-[auto_auto] items-center gap-x-1 font-mono text-[13px]">
        <span className="px-2 text-emerald">m</span>
        <span className="row-span-2 px-1 text-[18px] text-faint">/</span>
        <span className="border-t border-line px-2 text-ink">s</span>
      </div>
      <Arrow />
      <span className="rounded border border-amber/40 bg-amber/10 px-2 py-1 font-mono text-[11px] text-amber">
        m/s
      </span>
      <p className="w-full text-[10.5px] text-muted">Keep the units in the arithmetic; the surviving unit names the answer.</p>
    </div>
  );
}

function FrequencyPeriodVisual() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex flex-col items-center">
        <svg viewBox="0 0 90 34" className="h-9 w-24 text-purple" role="presentation">
          <path d="M4 24 Q16 4 28 24 T52 24 T76 24 T88 24" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
        <span className="font-mono text-[10px] text-purple">f = 50 Hz</span>
      </div>
      <div className="text-center font-mono text-[10px] text-faint">
        <p>one cycle</p>
        <p className="text-[14px]">↔</p>
      </div>
      <div className="flex flex-col items-center">
        <div className="flex h-9 items-center gap-1">
          {[0, 1, 2].map((index) => (
            <span key={index} className="h-5 w-1.5 rounded-full bg-purple/40" />
          ))}
        </div>
        <span className="font-mono text-[10px] text-purple">T = 0.02 s</span>
      </div>
      <p className="w-full font-mono text-[10.5px] text-ink">T = 1 / f</p>
    </div>
  );
}

function BinaryBitsVisual() {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="rounded border border-accent/40 bg-accent/10 px-2 py-1 font-mono text-[11px] text-accent">0</span>
        <span className="rounded border border-accent/40 bg-accent/10 px-2 py-1 font-mono text-[11px] text-accent">1</span>
        <Arrow />
        <div className="grid grid-cols-4 gap-1">
          {['00', '01', '10', '11'].map((state) => (
            <span key={state} className="rounded border border-line bg-panel px-1.5 py-0.5 font-mono text-[9px] text-muted">
              {state}
            </span>
          ))}
        </div>
        <Chip className="border-accent/30 bg-accent/10 text-accent">2 bits → 4 states</Chip>
      </div>
      <p className="font-mono text-[10.5px] text-ink">8 bits → 2⁸ = 256 states</p>
    </div>
  );
}

function PlaceValuesVisual() {
  return (
    <div>
      <div className="grid grid-cols-4 gap-1">
        {[
          ['1', '8'],
          ['0', '4'],
          ['1', '2'],
          ['1', '1'],
        ].map(([bit, weight], index) => (
          <div key={index} className="rounded border border-emerald/30 bg-emerald/5 py-1 text-center">
            <p className="font-mono text-[15px] font-bold text-ink">{bit}</p>
            <p className="font-mono text-[9px] text-emerald">{weight}</p>
          </div>
        ))}
      </div>
      <p className="mt-1 font-mono text-[10.5px] text-muted">8 + 2 + 1 = 11 · the zero place contributes nothing</p>
    </div>
  );
}

function RearrangingVisual() {
  return (
    <div className="space-y-2">
      <div className="relative mx-auto flex max-w-[260px] items-center justify-center gap-6 pt-3">
        <div className="rounded border border-line bg-panel px-2 py-1 font-mono text-[11px] text-ink">d = s × t</div>
        <div className="flex flex-col items-center">
          <span className="h-0.5 w-20 bg-line" />
          <span className="h-0 w-0 border-x-6 border-t-[9px] border-x-transparent border-t-line" />
        </div>
        <div className="rounded border border-accent/40 bg-accent/10 px-2 py-1 font-mono text-[11px] text-accent">
          s = d ÷ t
        </div>
      </div>
      <p className="text-center text-[10.5px] text-muted">Divide both sides by t; the scale stays level.</p>
    </div>
  );
}

function LinearScalingVisual() {
  return (
    <div className="space-y-2">
      <div className="relative h-8 overflow-hidden rounded-lg border border-line bg-canvas">
        <div className="h-full w-1/2 bg-purple/30" />
        <span className="absolute left-2 top-1.5 font-mono text-[9px] text-purple">512 counts</span>
        <span className="absolute right-2 top-1.5 font-mono text-[9px] text-muted">1023 full scale</span>
      </div>
      <div className="flex items-center justify-between font-mono text-[10px]">
        <span className="text-muted">x / full-scale</span>
        <span className="text-ink">512 / 1023 ≈ 0.50</span>
      </div>
    </div>
  );
}

function ScaleOutputVisual() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {[
        ['3.3 V board', '1.65 V', 'h-8'],
        ['5 V board', '2.50 V', 'h-10'],
      ].map(([board, output, height]) => (
        <div key={board} className="rounded-lg border border-rose/30 bg-rose/5 p-2">
          <p className="font-mono text-[9px] text-rose">{board}</p>
          <div className="mt-1 flex items-end gap-1">
            <span className="h-10 w-2 rounded-t bg-line" />
            <span className={`w-2 rounded-t bg-rose/40 ${height}`} />
            <span className="ml-1 font-mono text-[10px] font-bold text-ink">{output}</span>
          </div>
        </div>
      ))}
      <p className="col-span-2 text-[10.5px] text-muted">Same fraction (0.5), different top of the output range.</p>
    </div>
  );
}

function RadiansVisual() {
  return (
    <div>
      <svg viewBox="0 0 220 88" className="h-24 w-full text-accent" role="presentation">
        <path d="M110 8 A38 38 0 0 1 110 84" fill="none" stroke="currentColor" strokeWidth="3" />
        <line x1="110" y1="46" x2="148" y2="46" stroke="currentColor" strokeWidth="2" />
        <circle cx="110" cy="46" r="3" fill="currentColor" />
        <text x="152" y="42" fill="currentColor" fontSize="10">r</text>
        <text x="72" y="86" fill="currentColor" fontSize="10">π rad</text>
        <text x="162" y="30" fill="currentColor" fontSize="10">180°</text>
      </svg>
      <p className="text-center font-mono text-[10.5px] text-muted">arc length = radius × angle</p>
    </div>
  );
}

function TrigReachVisual() {
  return (
    <div>
      <svg viewBox="0 0 230 104" className="h-24 w-full text-emerald" role="presentation">
        <line x1="26" y1="84" x2="186" y2="84" stroke="currentColor" strokeWidth="2" />
        <line x1="26" y1="84" x2="186" y2="24" stroke="currentColor" strokeWidth="2" />
        <line x1="186" y1="84" x2="186" y2="24" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" />
        <path d="M52 84 A26 26 0 0 0 50 70" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <text x="102" y="46" fill="currentColor" fontSize="10">L</text>
        <text x="96" y="98" fill="currentColor" fontSize="10">x = L cos θ</text>
        <text x="190" y="58" fill="currentColor" fontSize="10">y</text>
      </svg>
      <p className="text-center font-mono text-[10.5px] text-muted">the link and its two shadows</p>
    </div>
  );
}

function Atan2Visual() {
  return (
    <div>
      <svg viewBox="0 0 220 100" className="h-24 w-full text-purple" role="presentation">
        <line x1="26" y1="76" x2="196" y2="76" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
        <line x1="32" y1="92" x2="32" y2="12" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
        <line x1="32" y1="76" x2="166" y2="24" stroke="currentColor" strokeWidth="2" />
        <circle cx="166" cy="24" r="4" fill="currentColor" />
        <path d="M58 76 A26 26 0 0 0 51 56" fill="none" stroke="currentColor" strokeWidth="2" />
        <text x="170" y="20" fill="currentColor" fontSize="10">(3, 3)</text>
        <text x="58" y="58" fill="currentColor" fontSize="10">45°</text>
      </svg>
      <p className="text-center font-mono text-[10.5px] text-muted">y first, then x</p>
    </div>
  );
}

function GraphSlopeVisual() {
  return (
    <div>
      <svg viewBox="0 0 230 104" className="h-24 w-full text-amber" role="presentation">
        <line x1="28" y1="84" x2="204" y2="84" stroke="currentColor" strokeWidth="2" />
        <line x1="28" y1="84" x2="28" y2="14" stroke="currentColor" strokeWidth="2" />
        <line x1="48" y1="72" x2="176" y2="24" stroke="currentColor" strokeWidth="2" />
        <line x1="48" y1="72" x2="176" y2="72" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" />
        <line x1="176" y1="72" x2="176" y2="24" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" />
        <text x="96" y="92" fill="currentColor" fontSize="9">run = Δt</text>
        <text x="180" y="52" fill="currentColor" fontSize="9">rise</text>
      </svg>
      <p className="text-center font-mono text-[10.5px] text-muted">slope = rise / run = 4.0 m/s</p>
    </div>
  );
}

function AreaUnderCurveVisual() {
  return (
    <div>
      <svg viewBox="0 0 230 104" className="h-24 w-full text-emerald" role="presentation">
        <line x1="28" y1="84" x2="204" y2="84" stroke="currentColor" strokeWidth="2" />
        <line x1="28" y1="84" x2="28" y2="14" stroke="currentColor" strokeWidth="2" />
        {[48, 88, 128].map((x) => (
          <rect key={x} x={x} y={64} width="34" height="20" fill="currentColor" fillOpacity="0.22" stroke="currentColor" />
        ))}
        <line x1="44" y1="64" x2="176" y2="42" stroke="currentColor" strokeWidth="2" />
        <text x="52" y="100" fill="currentColor" fontSize="8">each v · Δt</text>
      </svg>
      <p className="text-center font-mono text-[10.5px] text-muted">three slices add to 1.0 m</p>
    </div>
  );
}

function GraphUnitsVisual() {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <div className="relative h-24 flex-1 rounded border border-line bg-canvas">
          <span className="absolute bottom-1 left-2 font-mono text-[9px] text-accent">t (s)</span>
          <span className="absolute left-2 top-2 font-mono text-[9px] text-amber">V (V)</span>
          <span className="absolute left-1/2 top-1/2 h-px w-1/2 -translate-y-1/2 rotate-[-22deg] bg-ink/50" />
        </div>
        <div className="space-y-1">
          <Chip className="border-accent/30 bg-accent/10 text-accent">x = seconds</Chip>
          <Chip className="border-amber/30 bg-amber/10 text-amber">y = volts</Chip>
          <Chip className="border-line bg-panel text-ink">slope = V/s</Chip>
        </div>
      </div>
    </div>
  );
}

function ForceVisual() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative rounded-lg border-2 border-rose/40 bg-rose/10 px-4 py-3 text-center">
        <span className="absolute -left-8 top-1/2 h-0.5 w-7 -translate-y-1/2 bg-rose" />
        <span className="absolute -left-9 top-1/2 -translate-y-1/2 text-rose">→</span>
        <p className="font-mono text-[9px] text-rose">force</p>
        <p className="font-mono text-[13px] font-bold text-ink">2.0 kg</p>
        <p className="font-mono text-[9px] text-muted">a = 3.0 m/s²</p>
      </div>
      <Tile title="Newton's second law" value="F = m · a" note="6.0 N" className="border-rose/30 bg-rose/5 text-rose" />
    </div>
  );
}

function WeightVisual() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex flex-col items-center">
        <div className="rounded border-2 border-amber/40 bg-amber/10 px-4 py-2 text-center">
          <p className="font-mono text-[9px] text-amber">mass</p>
          <p className="font-mono text-[13px] font-bold text-ink">2.5 kg</p>
        </div>
        <span className="h-3 w-px bg-amber" />
        <span className="text-amber">↓</span>
        <p className="font-mono text-[9px] text-muted">g = 9.81</p>
      </div>
      <div className="rounded-lg border border-amber/40 bg-amber/5 px-2.5 py-2">
        <p className="font-mono text-[9px] text-amber">weight</p>
        <p className="font-mono text-[13px] font-bold text-ink">24.5 N</p>
        <p className="text-[9px] text-muted">the force on the scale</p>
      </div>
    </div>
  );
}

function TorqueVisual() {
  return (
    <div>
      <svg viewBox="0 0 230 100" className="h-24 w-full text-purple" role="presentation">
        <circle cx="36" cy="72" r="5" fill="currentColor" />
        <line x1="36" y1="72" x2="184" y2="72" stroke="currentColor" strokeWidth="3" />
        <line x1="184" y1="72" x2="184" y2="24" stroke="currentColor" strokeWidth="2" />
        <line x1="184" y1="24" x2="218" y2="24" stroke="currentColor" strokeWidth="2" />
        <path d="M64 72 A28 28 0 0 0 60 56" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <text x="94" y="88" fill="currentColor" fontSize="9">lever arm 0.5 m</text>
        <text x="190" y="34" fill="currentColor" fontSize="9">F</text>
        <text x="70" y="52" fill="currentColor" fontSize="9">90°</text>
      </svg>
      <p className="text-center font-mono text-[10.5px] text-muted">τ = F × perpendicular lever arm = 4.905 N·m</p>
    </div>
  );
}

function DatasheetUnitsVisual() {
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <div className="grid grid-cols-[1.2fr_0.7fr_1fr] gap-2 border-b border-line bg-canvas px-2 py-1 font-mono text-[8.5px] uppercase tracking-wide text-faint">
        <span>parameter</span>
        <span>unit</span>
        <span>value</span>
      </div>
      <div className="grid grid-cols-[1.2fr_0.7fr_1fr] items-center gap-2 px-2 py-2 font-mono text-[10.5px]">
        <span className="text-ink">supply current</span>
        <span className="rounded bg-accent/10 px-1 py-0.5 text-accent">mA</span>
        <span className="text-ink">2.5 → 0.0025 A</span>
      </div>
    </div>
  );
}

function DatasheetBoundsVisual() {
  return (
    <div className="space-y-2">
      <div className="relative h-14 overflow-hidden rounded-lg border border-line bg-canvas px-3">
        <div className="absolute left-3 right-3 top-5 h-3 rounded-full bg-emerald/15">
          <div className="ml-[10%] h-full w-[66%] rounded-full bg-emerald/40" />
        </div>
        <span className="absolute left-[8%] top-9 -translate-x-1/2 font-mono text-[8.5px] text-emerald">2.7</span>
        <span className="absolute left-[78%] top-9 -translate-x-1/2 font-mono text-[8.5px] text-emerald">10.8</span>
        <span className="absolute right-1 top-1 rounded border border-rose/40 bg-rose/10 px-1 py-0.5 font-mono text-[9px] text-rose">
          12.0
        </span>
        <div className="absolute right-7 top-5 h-3 w-0.5 bg-rose" />
      </div>
      <p className="font-mono text-[10.5px] text-rose">12.0 V is outside the recommended band</p>
    </div>
  );
}

function DatasheetConditionsVisual() {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-1.5">
        {[
          ['Min', '1.2', 'border-line bg-panel text-muted'],
          ['Typ', '1.8', 'border-accent/30 bg-accent/10 text-accent'],
          ['Max', '3.0', 'border-rose/40 bg-rose/10 text-rose'],
        ].map(([label, value, className]) => (
          <div key={label} className={`rounded border p-2 text-center ${className}`}>
            <p className="font-mono text-[9px] uppercase tracking-wide">{label}</p>
            <p className="font-mono text-[13px] font-bold text-ink">{value} mA</p>
          </div>
        ))}
      </div>
      <p className="flex items-center gap-1 font-mono text-[10px] text-rose">
        budget here <span aria-hidden="true">→</span> Max
      </p>
    </div>
  );
}

function GivenUnknownVisual() {
  return (
    <div className="rounded-lg border border-emerald/30 bg-emerald/5 p-2">
      <div className="mb-1 flex items-center gap-1.5 border-b border-emerald/20 pb-1">
        <span className="h-2 w-2 rounded-full bg-emerald" />
        <span className="font-mono text-[9px] uppercase tracking-wide text-emerald">analysis sheet</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="font-mono text-[8.5px] uppercase text-faint">given</p>
          <p className="font-mono text-[10px] text-ink">12.0 V</p>
          <p className="font-mono text-[10px] text-ink">2.4 Ω</p>
        </div>
        <div className="rounded border border-dashed border-emerald/40 bg-panel p-1">
          <p className="font-mono text-[8.5px] uppercase text-emerald">unknown</p>
          <p className="font-mono text-[10px] font-bold text-emerald">draw = ?</p>
        </div>
      </div>
    </div>
  );
}

function AnswerCheckVisual() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="rounded border border-accent/40 bg-accent/10 px-2 py-1.5 font-mono text-[12px] font-bold text-accent">
        5.0 A
      </div>
      <Arrow />
      <div className="space-y-1">
        {[
          ['unit names amperes', '✓'],
          ['fits the 3.2 A limit', '✕'],
          ['part is the driver', '✓'],
        ].map(([label, mark]) => (
          <p key={label} className="flex items-center gap-1.5 text-[9.5px] text-muted">
            <span className={mark === '✓' ? 'text-emerald' : 'text-rose'}>{mark}</span>
            {label}
          </p>
        ))}
      </div>
      <Chip className="border-rose/40 bg-rose/10 text-rose">not an answer yet</Chip>
    </div>
  );
}

function BoundsCheckVisual() {
  return (
    <div className="space-y-2">
      <div className="relative h-14 overflow-hidden rounded-lg border border-line bg-canvas px-3">
        <div className="absolute left-3 right-3 top-5 h-2 rounded-full bg-line">
          <div className="h-full w-[58%] rounded-full bg-emerald/40" />
        </div>
        <span className="absolute left-[58%] top-2 h-6 w-0.5 -translate-x-1/2 bg-rose" />
        <span className="absolute left-[58%] top-9 -translate-x-1/2 font-mono text-[8.5px] text-rose">3.2 A</span>
        <span className="absolute right-1 top-2 rounded border border-rose/40 bg-rose/10 px-1 py-0.5 font-mono text-[9px] text-rose">
          5.0 A
        </span>
      </div>
      <div className="flex items-center gap-2 font-mono text-[10px]">
        <span className="text-rose">5.0 A &gt; 3.2 A</span>
        <Arrow />
        <span className="rounded border border-rose/40 bg-rose/10 px-1.5 py-0.5 text-rose">clamp · driver-limited</span>
      </div>
    </div>
  );
}

const VISUALS: Record<ConceptVisualId, (props: Props) => ReactNode> = {
  variables: VariablesVisual,
  'assignment-order': AssignmentOrderVisual,
  'int-float': IntFloatVisual,
  strings: StringsVisual,
  booleans: BooleansVisual,
  'mixed-types': MixedTypesVisual,
  'f-strings': FStringsVisual,
  operators: OperatorsVisual,
  'floor-division': FloorDivisionVisual,
  'order-of-operations': OrderOfOperationsVisual,
  comparisons: ComparisonsVisual,
  clamping: ClampingVisual,
  logic: LogicVisual,
  lists: ListsVisual,
  'for-loops': ForLoopsVisual,
  'index-error': IndexErrorVisual,
  functions: FunctionsVisual,
  'while-loops': WhileLoopsVisual,
  none: NoneVisual,
  imports: ImportsVisual,
  asserts: AssertsVisual,
  'assert-message': AssertMessageVisual,
  'si-units': SiUnitsVisual,
  'metric-prefixes': MetricPrefixesVisual,
  'unit-cancel': UnitCancelVisual,
  'frequency-period': FrequencyPeriodVisual,
  'binary-bits': BinaryBitsVisual,
  'place-values': PlaceValuesVisual,
  rearranging: RearrangingVisual,
  'linear-scaling': LinearScalingVisual,
  'scale-output': ScaleOutputVisual,
  radians: RadiansVisual,
  'trig-reach': TrigReachVisual,
  atan2: Atan2Visual,
  'graph-slope': GraphSlopeVisual,
  'area-under-curve': AreaUnderCurveVisual,
  'graph-units': GraphUnitsVisual,
  force: ForceVisual,
  weight: WeightVisual,
  torque: TorqueVisual,
  'datasheet-units': DatasheetUnitsVisual,
  'datasheet-bounds': DatasheetBoundsVisual,
  'datasheet-conditions': DatasheetConditionsVisual,
  'given-unknown': GivenUnknownVisual,
  'answer-check': AnswerCheckVisual,
  'bounds-check': BoundsCheckVisual,
};

export function MicroConceptVisual({ conceptId, sample }: { conceptId: string; sample?: PrimitiveSample }) {
  const Visual = VISUALS[conceptId as ConceptVisualId] ?? VariablesVisual;
  const scene = CONCEPT_VISUAL_SCENES[conceptId as ConceptVisualId] ?? 'fallback';
  return (
    <div data-visual={conceptId} data-visual-scene={scene} className="w-full">
      <Visual sample={sample} />
    </div>
  );
}
