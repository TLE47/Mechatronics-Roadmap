import React from 'react';
import type { DiagramSpec, Series } from './scenes.ts';

/**
 * A scene, drawn (`app/src/visuals/Diagram.tsx`).
 *
 * One SVG per figure, laid out from the spec in `scenes.ts` — there is no per-figure drawing code, so
 * a new diagram is a data edit and the whole library shares one set of rules:
 *
 * - **Theme-driven.** Every colour is a CSS custom property the palettes already define, so dark,
 *   light, paper and high-contrast need no special case. Nothing here hard-codes a hex.
 * - **A picture with a name.** `role="img"` and an `aria-label` built from the title and caption, so a
 *   screen-reader learner gets the same sentence a sighted one reads under the figure.
 * - **Fixed geometry.** The viewBox is a constant and the SVG scales to its container: no measuring, no
 *   resize listener, and nothing that can drift between the tabs that embed it.
 * - **No motion.** A figure is a still even when the page is not; nothing here animates, so
 *   `prefers-reduced-motion` has nothing to switch off.
 */

const W = 640;
const INK = 'var(--ink, #e6edf6)';
const BODY = 'var(--body, #c6d3e4)';
const MUTED = 'var(--muted, #93a4bd)';
const LINE = 'var(--line, #2a394d)';
const SOFT = 'var(--line-soft, #1b2534)';
const ACCENT = 'var(--accent, #38bdf8)';
const CANVAS = 'var(--canvas, #0b1220)';

const font = 'ui-monospace, SFMono-Regular, Menlo, monospace';

/** Characters a route's box holds on one line before it wraps. Measured from the font, not guessed. */
const ROUTE_CHARS = 64;

/** A route label, broken into at most two lines: a third line is a paragraph in a box. */
function wrapLabel(label: string): string[] {
  const words = label.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  let index = 0;
  for (; index < words.length; index += 1) {
    const candidate = line ? `${line} ${words[index]}` : words[index];
    if (candidate.length > ROUTE_CHARS && line) {
      lines.push(line);
      line = words[index];
      if (lines.length === 2) {
        index += 1;
        break;
      }
      continue;
    }
    line = candidate;
  }
  if (lines.length < 2) {
    if (line) lines.push(line);
  } else if (words.slice(index).length > 0) {
    // Two full lines and words left over: say so, rather than dropping the end of a label.
    lines[1] = `${lines[1].slice(0, ROUTE_CHARS - 1)}…`;
  }
  return lines.length ? lines : [''];
}

/** The vertical geometry both the drawing and the viewBox height need, so they cannot disagree. */
export function routeLayout(steps: string[]): { height: number; items: { lines: string[]; y: number; h: number }[] } {
  const items: { lines: string[]; y: number; h: number }[] = [];
  let y = 16;
  for (const step of steps) {
    const lines = wrapLabel(step);
    const h = 12 + lines.length * 15;
    items.push({ lines, y, h });
    y += h + 18;
  }
  return { height: y + 6, items };
}

/**
 * A page's route: numbered steps down the page, an arrow between each pair.
 *
 * Vertical, unlike `chain`, because the labels here are a page's own words (`02.3: 2-link inverse
 * kinematics`) rather than a two-word stage name: a row of five boxes would run each label into its
 * neighbour. Numbered, because this is a path in order, and the number is what a reader says to
 * themselves ("I'm on step 3").
 */
function Route({ spec }: { spec: DiagramSpec }) {
  const steps = spec.steps ?? [];
  const { items } = routeLayout(steps);
  const x = 62;
  const w = W - x - 22;
  return (
    <g>
      {items.map((item, index) => (
        <g key={`${index}-${item.lines[0]}`}>
          {index > 0 && (
            <line
              x1={34}
              y1={item.y - 18}
              x2={34}
              y2={item.y - 2}
              stroke={ACCENT}
              strokeWidth={1.5}
              markerEnd="url(#vis-arrow)"
              opacity={0.85}
            />
          )}
          <circle cx={34} cy={item.y + item.h / 2} r={9} fill={CANVAS} stroke={LINE} />
          <text x={34} y={item.y + item.h / 2 + 3.5} textAnchor="middle" fontSize={10.5} fill={ACCENT} fontFamily={font}>
            {index + 1}
          </text>
          <rect x={x} y={item.y} width={w} height={item.h} rx={7} fill={CANVAS} stroke={LINE} />
          {item.lines.map((line, i) => (
            <text
              key={line + i}
              x={x + 12}
              y={item.y + 12 + i * 15 + 9}
              fontSize={11.5}
              fill={i === 0 ? INK : BODY}
              fontFamily={font}
            >
              {line}
            </text>
          ))}
        </g>
      ))}
    </g>
  );
}

/** The arrowhead every figure reuses, defined once per SVG so a dashed line can borrow it. */
function Defs() {
  return (
    <defs>
      <marker id="vis-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
        <path d="M0,0 L10,5 L0,10 z" fill={ACCENT} />
      </marker>
    </defs>
  );
}

/** A rounded box with a label and, under it, the reading that box carries. */
function Box({
  x,
  y,
  w,
  h,
  label,
  value,
  note,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  value?: string;
  note?: string;
}) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={8} fill={CANVAS} stroke={LINE} />
      <text x={x + w / 2} y={y + h / 2 - (value || note ? 4 : -4)} textAnchor="middle" fontSize={12} fill={INK} fontFamily={font}>
        {label}
      </text>
      {value && (
        <text x={x + w / 2} y={y + h / 2 + 12} textAnchor="middle" fontSize={10.5} fill={ACCENT} fontFamily={font}>
          {value}
        </text>
      )}
      {!value && note && (
        <text x={x + w / 2} y={y + h / 2 + 12} textAnchor="middle" fontSize={10.5} fill={MUTED} fontFamily={font}>
          {note}
        </text>
      )}
    </g>
  );
}

function Arrow({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={ACCENT} strokeWidth={1.5} markerEnd="url(#vis-arrow)" opacity={0.85} />;
}

function Chain({ spec }: { spec: DiagramSpec }) {
  const stages = spec.stages ?? [];
  const n = Math.max(1, stages.length);
  const gap = 20;
  const w = Math.min(132, (W - 24 - gap * (n - 1)) / n);
  const h = 54;
  const total = w * n + gap * (n - 1);
  const x0 = (W - total) / 2;
  const y = 46;
  return (
    <g>
      {stages.map((stage, index) => (
        <g key={stage.label}>
          <Box x={x0 + index * (w + gap)} y={y} w={w} h={h} {...stage} />
          {index < n - 1 && (
            <Arrow
              x1={x0 + index * (w + gap) + w + 3}
              y1={y + h / 2}
              x2={x0 + index * (w + gap) + w + gap - 3}
              y2={y + h / 2}
            />
          )}
        </g>
      ))}
    </g>
  );
}

function Loop({ spec }: { spec: DiagramSpec }) {
  const stages = spec.stages ?? [];
  const cx = W / 2;
  const cy = 105;
  const rx = 176;
  const ry = 62;
  const boxes = stages.map((stage, index) => {
    const angle = -Math.PI / 2 + (index / Math.max(1, stages.length)) * Math.PI * 2;
    return { ...stage, x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
  });
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke={SOFT} strokeDasharray="4 6" />
      {boxes.map((box, index) => {
        const next = boxes[(index + 1) % boxes.length];
        return <Arrow key={`a-${box.label}`} x1={box.x} y1={box.y} x2={next.x} y2={next.y} />;
      })}
      {boxes.map((box) => (
        <g key={box.label}>
          <Box x={box.x - 58} y={box.y - 21} w={116} h={42} label={box.label} value={box.value} />
        </g>
      ))}
    </g>
  );
}

function Timing({ spec }: { spec: DiagramSpec }) {
  const series = spec.series ?? [];
  const left = 46;
  const right = W - 18;
  const top = 26;
  const bottom = 152;
  const values = series.flatMap((line) => line.points);
  const high = Math.max(1e-9, ...values);
  const low = Math.min(0, ...values);
  const span = high - low || 1;
  const xAt = (index: number, points: number) => left + (index / Math.max(1, points - 1)) * (right - left);
  const yAt = (value: number) => bottom - ((value - low) / span) * (bottom - top);
  const path = (line: Series) =>
    line.points.map((value, index) => `${index === 0 ? 'M' : 'L'}${xAt(index, line.points.length).toFixed(1)},${yAt(value).toFixed(1)}`).join(' ');
  return (
    <g>
      {[0, 0.5, 1].map((fraction) => {
        const y = top + fraction * (bottom - top);
        return <line key={fraction} x1={left} y1={y} x2={right} y2={y} stroke={SOFT} strokeWidth={1} />;
      })}
      <line x1={left} y1={top} x2={left} y2={bottom} stroke={LINE} />
      <line x1={left} y1={bottom} x2={right} y2={bottom} stroke={LINE} />
      {series.map((line, index) => (
        <path
          key={line.label}
          d={path(line)}
          fill="none"
          stroke={index === 0 ? ACCENT : index === 1 ? INK : MUTED}
          strokeWidth={1.8}
          strokeDasharray={line.dashed ? '5 4' : undefined}
        />
      ))}
      {series.map((line, index) => (
        <g key={`k-${line.label}`}>
          <line
            x1={left + 4}
            y1={top + 12 + index * 15}
            x2={left + 24}
            y2={top + 12 + index * 15}
            stroke={index === 0 ? ACCENT : index === 1 ? INK : MUTED}
            strokeWidth={2}
            strokeDasharray={line.dashed ? '5 4' : undefined}
          />
          <text x={left + 30} y={top + 16 + index * 15} fontSize={10.5} fill={BODY} fontFamily={font}>
            {line.label}
          </text>
        </g>
      ))}
      <text x={right} y={bottom + 16} textAnchor="end" fontSize={10} fill={MUTED} fontFamily={font}>
        {spec.unit ?? 'time'}
      </text>
    </g>
  );
}

function States({ spec }: { spec: DiagramSpec }) {
  const stages = spec.stages ?? [];
  const transitions = spec.transitions ?? [];
  const h = 40;
  const gap = 16;
  const w = 260;
  const x = 56;
  return (
    <g>
      {stages.map((stage, index) => {
        const y = 22 + index * (h + gap);
        return (
          <g key={stage.label}>
            <Box x={x} y={y} w={w} h={h} label={stage.label} note={stage.note} />
            {index < stages.length - 1 && (
              <>
                <Arrow x1={x + w / 2} y1={y + h + 2} x2={x + w / 2} y2={y + h + gap - 2} />
                {transitions[index] && (
                  <text x={x + w / 2 + 10} y={y + h + gap - 3} fontSize={10} fill={ACCENT} fontFamily={font}>
                    {transitions[index]}
                  </text>
                )}
              </>
            )}
          </g>
        );
      })}
    </g>
  );
}

function Bars({ spec }: { spec: DiagramSpec }) {
  const rows = spec.bars ?? [];
  const left = 190;
  const right = W - 60;
  const h = 20;
  const gap = 14;
  const widest = Math.max(1, ...rows.map((row) => row.value));
  return (
    <g>
      {rows.map((row, index) => {
        const y = 26 + index * (h + gap);
        const width = (row.value / Math.max(widest, row.max)) * (right - left);
        return (
          <g key={row.label}>
            <text x={left - 10} y={y + h - 6} textAnchor="end" fontSize={11} fill={BODY} fontFamily={font}>
              {row.label}
            </text>
            <rect x={left} y={y} width={right - left} height={h} rx={4} fill={SOFT} />
            <rect x={left} y={y} width={Math.max(2, width)} height={h} rx={4} fill={ACCENT} opacity={0.75} />
            <text x={right + 8} y={y + h - 6} fontSize={10.5} fill={MUTED} fontFamily={font}>
              {row.value}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** The drawing, without the caption: what a tab or a card wants when it has its own label. */
export function DiagramArt({ spec }: { spec: DiagramSpec }) {
  const height =
    spec.kind === 'chain'
      ? 150
      : spec.kind === 'loop'
        ? 215
        : spec.kind === 'timing'
          ? 190
          : spec.kind === 'states'
            ? 22 + (spec.stages?.length ?? 1) * 56 + 8
            : spec.kind === 'route'
              ? routeLayout(spec.steps ?? []).height
              : 26 + (spec.bars?.length ?? 1) * 34 + 16;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="block h-auto w-full" role="img" aria-label={`${spec.title}. ${spec.caption}`}>
      <Defs />
      {spec.kind === 'chain' && <Chain spec={spec} />}
      {spec.kind === 'loop' && <Loop spec={spec} />}
      {spec.kind === 'timing' && <Timing spec={spec} />}
      {spec.kind === 'states' && <States spec={spec} />}
      {spec.kind === 'bars' && <Bars spec={spec} />}
      {spec.kind === 'route' && <Route spec={spec} />}
    </svg>
  );
}

/**
 * A figure with its heading and caption, for a lesson page.
 *
 * The caption is `<figcaption>`, not a paragraph in the prose: it belongs to the picture, reads after
 * it in both the visual and the accessibility tree, and cannot be mistaken for the next section.
 */
export function Diagram({ spec, id, className = '' }: { spec: DiagramSpec; id?: string; className?: string }) {
  return (
    <figure
      data-testid={id ? `diagram-${id}` : 'diagram'}
      className={`my-4 overflow-hidden rounded-xl border border-line bg-panel ${className}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-line-soft bg-canvas px-3 py-1.5">
        <span className="eyebrow">{spec.title}</span>
        {id && <span className="font-mono text-[11px] text-faint">{id}</span>}
      </div>
      <div className="px-2 py-2">
        <DiagramArt spec={spec} />
      </div>
      <figcaption className="border-t border-line-soft px-3 py-2 text-[12.5px] leading-snug text-muted">
        {spec.caption}
      </figcaption>
    </figure>
  );
}
