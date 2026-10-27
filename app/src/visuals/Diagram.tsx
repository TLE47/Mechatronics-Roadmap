import React from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, X } from 'lucide-react';
import { graphLayers, type PlacedNode } from './graphLayout.ts';
import { attachQuietMotion } from './liveFigure.ts';
import { useFigureMotion } from '../useMotion.ts';
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
 * - **Still unless asked.** The drawing itself is static. A lesson passes `live`, which lets
 *   `visuals/liveFigure.ts` add one moving mark while the figure is on screen — and only if the
 *   reader has motion on. The expanded sheet never passes it: a close look at the labels is a still.
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
  // A connector needs a run: at 20 units the arrowhead was most of it and the packet that rides the
  // line in a live figure crossed it in a blink. 38 leaves a 30-unit shaft between the boxes.
  const gap = 38;
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
              x1={x0 + index * (w + gap) + w + 4}
              y1={y + h / 2}
              x2={x0 + index * (w + gap) + w + gap - 4}
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

/** A short number: three significant decimals at most, and an exponent when it is tiny. */
function fmt(value: number): string {
  if (!Number.isFinite(value)) return '–';
  const size = Math.abs(value);
  if (size !== 0 && (size < 0.01 || size >= 10_000)) return value.toExponential(0);
  return String(Math.round(value * 1000) / 1000);
}

/** A label broken into at most two lines, so a box never grows a paragraph. */
function wrap(text: string, perLine: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > perLine && line) {
      lines.push(line);
      line = word;
      if (lines.length === 2) break;
      continue;
    }
    line = candidate;
  }
  if (lines.length < 2 && line) lines.push(line);
  return lines.length ? lines : [''];
}


/**
 * The room between a graph's boxes, from the labels its arrows carry.
 *
 * The gap used to be a constant (18 by 22), so an edge label — `/target`, `params` — was wider than
 * the space it sat in and the boxes were painted over it. Here the gap grows with the longest label
 * the figure actually has, and is capped by the width the boxes leave so a five-column graph still
 * fits its canvas. `artHeight` reads the same function, so the drawing and its viewBox cannot
 * disagree about how tall a vertical graph is.
 */
function graphSpacing(spec: DiagramSpec): { gapX: number; gapY: number } {
  const { levels, rows } = graphLayers(spec);
  const across = spec.direction === 'TD' ? rows : levels;
  const longest = Math.max(0, ...(spec.edges ?? []).map((edge) => (edge.label ?? '').length));
  // A 10.5-unit monospace glyph is about 6.3 units wide; a label at 8.8 is about 5.3. Half a label
  // each side of the arrow's midpoint is what makes it readable without touching a box.
  const wantedX = Math.min(96, Math.max(26, 18 + longest * 5.3));
  const room = (W - 26 - 74 * across) / Math.max(1, across - 1);
  const gapX = across < 2 ? wantedX : Math.max(20, Math.min(wantedX, room));
  const gapY = Math.min(46, Math.max(22, 12 + longest * 4.6));
  return { gapX, gapY };
}

/** A box per node, an arrow per edge: a graph that may fan out, unlike `chain`. */
function Graph({ spec }: { spec: DiagramSpec }) {
  const { nodes, levels, rows } = graphLayers(spec);
  const across = spec.direction === 'TD' ? rows : levels;
  const down = spec.direction === 'TD' ? levels : rows;
  const { gapX, gapY } = graphSpacing(spec);
  const boxW = Math.max(74, Math.min(138, (W - 26 - gapX * (across - 1)) / Math.max(1, across)));
  const boxH = 38;
  const at = (node: PlacedNode) => {
    const column = spec.direction === 'TD' ? node.row : node.level;
    const row = spec.direction === 'TD' ? node.level : node.row;
    const total = across * boxW + (across - 1) * gapX;
    return { x: (W - total) / 2 + column * (boxW + gapX), y: 14 + row * (boxH + gapY), w: boxW, h: boxH };
  };
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const toneFill = (tone?: 'accent' | 'ink' | 'muted') => (tone === 'accent' ? ACCENT : tone === 'muted' ? MUTED : INK);
  return (
    <g>
      {(spec.edges ?? []).map((edge, index) => {
        const from = byId.get(edge.from);
        const to = byId.get(edge.to);
        if (!from || !to) return null;
        const a = at(from);
        const b = at(to);
        const horizontal = spec.direction !== 'TD';
        const x1 = horizontal ? a.x + a.w : a.x + a.w / 2;
        const y1 = horizontal ? a.y + a.h / 2 : a.y + a.h;
        const x2 = horizontal ? b.x - 2 : b.x + b.w / 2;
        const y2 = horizontal ? b.y + b.h / 2 : b.y - 2;
        return <Arrow key={`${edge.from}-${edge.to}-${index}`} x1={x1} y1={y1} x2={x2} y2={y2} />;
      })}
      {nodes.map((node) => {
        const box = at(node);
        const lines = wrap(node.label, Math.max(8, Math.floor(box.w / 6.4)));
        const stroke = node.tone === 'accent' ? ACCENT : LINE;
        return (
          <g key={node.id}>
            <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={7} fill={CANVAS} stroke={stroke} />
            {lines.map((line, lineIndex) => (
              <text
                key={line + lineIndex}
                x={box.x + box.w / 2}
                y={box.y + box.h / 2 - (lines.length - 1) * 6 + lineIndex * 12 + 3.5}
                textAnchor="middle"
                fontSize={10.5}
                fill={toneFill(node.tone)}
                fontFamily={font}
              >
                {line}
              </text>
            ))}
          </g>
        );
      })}
      {/* Labels last, so nothing is painted over them — and with a canvas-coloured halo, so an
          arrow passing under its own label cannot cut the word in half. The font is one step below
          the box labels: this is an annotation, not the name of a thing. */}
      {(spec.edges ?? []).map((edge, index) => {
        if (!edge.label) return null;
        const from = byId.get(edge.from);
        const to = byId.get(edge.to);
        if (!from || !to) return null;
        const a = at(from);
        const b = at(to);
        const horizontal = spec.direction !== 'TD';
        const x1 = horizontal ? a.x + a.w : a.x + a.w / 2;
        const y1 = horizontal ? a.y + a.h / 2 : a.y + a.h;
        const x2 = horizontal ? b.x - 2 : b.x + b.w / 2;
        const y2 = horizontal ? b.y + b.h / 2 : b.y - 2;
        return (
          <text
            key={`l-${edge.from}-${edge.to}-${index}`}
            x={(x1 + x2) / 2 + (horizontal ? 0 : 8)}
            // Clear of its arrow — above it on a left-to-right graph, beside it top-to-bottom: a
            // baseline on the arrow's own y read as an arrow through the word, not a name for the wire.
            y={(y1 + y2) / 2 + (horizontal ? -8 : 3)}
            textAnchor={horizontal ? 'middle' : 'start'}
            fontSize={8.8}
            // Body, not muted: an annotation this small needs the reading colour to stay legible,
            // and the halo keeps it clear of the arrow's accent.
            fill={BODY}
            fontFamily={font}
            stroke={CANVAS}
            strokeWidth={2.8}
            strokeLinejoin="round"
            style={{ paintOrder: 'stroke' }}
          >
            {edge.label}
          </text>
        );
      })}
    </g>
  );
}

/** A grid of values: a matrix, a layer stack, a struct's field map. */
function Matrix({ spec }: { spec: DiagramSpec }) {
  const grid = spec.matrix;
  const rows = grid?.rows ?? [];
  const cols = grid?.cols ?? [];
  const labelW = rows.some((row) => row.length > 7) ? 84 : 46;
  const cellW = Math.min(92, (W - labelW - 26) / Math.max(1, cols.length));
  const cellH = 38;
  const left = 8 + labelW;
  const top = 30;
  const marked = new Set((grid?.highlight ?? []).map(([row, col]) => `${row}:${col}`));
  return (
    <g>
      {cols.map((col, index) => (
        <text
          key={col + index}
          x={left + index * cellW + cellW / 2}
          y={top - 10}
          textAnchor="middle"
          fontSize={10}
          fill={MUTED}
          fontFamily={font}
        >
          {col}
        </text>
      ))}
      {rows.map((row, rowIndex) => (
        <g key={row + rowIndex}>
          <text
            x={left - 10}
            y={top + rowIndex * cellH + cellH / 2 + 3.5}
            textAnchor="end"
            fontSize={10.5}
            fill={BODY}
            fontFamily={font}
          >
            {row}
          </text>
          {cols.map((col, colIndex) => {
            const on = marked.has(`${rowIndex}:${colIndex}`);
            const text = grid?.cells[rowIndex]?.[colIndex] ?? '';
            return (
              <g key={col + colIndex}>
                <rect
                  x={left + colIndex * cellW + 1}
                  y={top + rowIndex * cellH + 1}
                  width={cellW - 2}
                  height={cellH - 2}
                  rx={5}
                  fill={on ? ACCENT : CANVAS}
                  fillOpacity={on ? 0.16 : 1}
                  stroke={on ? ACCENT : LINE}
                />
                <text
                  x={left + colIndex * cellW + cellW / 2}
                  y={top + rowIndex * cellH + cellH / 2 + 3.5}
                  textAnchor="middle"
                  fontSize={text.length > 7 ? 9.5 : 11}
                  fill={on ? INK : BODY}
                  fontFamily={font}
                >
                  {text}
                </text>
              </g>
            );
          })}
        </g>
      ))}
    </g>
  );
}

/** A register, high bit on the left, with the field each run of bits means. */
function Bits({ spec }: { spec: DiagramSpec }) {
  const register = spec.bits;
  const width = register?.width ?? 8;
  const left = 18;
  const cellW = (W - left * 2) / width;
  const top = 46;
  const cellH = 38;
  const xOf = (bit: number) => left + (width - 1 - bit) * cellW;
  const tone = (value?: 'accent' | 'ink' | 'muted') => (value === 'accent' ? ACCENT : value === 'muted' ? MUTED : INK);
  return (
    <g>
      {(register?.segments ?? []).map((segment, index) => {
        const x1 = xOf(segment.to);
        const x2 = xOf(segment.from) + cellW;
        const y = 30 - index * 0;
        return (
          <g key={segment.label + index}>
            <path
              d={`M${x1},${y} L${x1},${y - 7} L${x2},${y - 7} L${x2},${y}`}
              fill="none"
              stroke={tone(segment.tone)}
              strokeWidth={1.1}
              opacity={0.9}
            />
            <text
              x={(x1 + x2) / 2}
              y={y - 11}
              textAnchor="middle"
              fontSize={segment.to - segment.from < 1 ? 9.5 : 10.5}
              fill={tone(segment.tone)}
              fontFamily={font}
            >
              {segment.label}
            </text>
          </g>
        );
      })}
      {Array.from({ length: width }, (_, bit) => (
        <g key={bit}>
          <rect x={xOf(bit)} y={top} width={cellW - 1} height={cellH} rx={3} fill={CANVAS} stroke={LINE} />
          <text x={xOf(bit) + (cellW - 1) / 2} y={top + cellH + 13} textAnchor="middle" fontSize={9} fill={MUTED} fontFamily={font}>
            {bit}
          </text>
        </g>
      ))}
      {register?.value && (
        <text x={W / 2} y={top + cellH + 36} textAnchor="middle" fontSize={12} fill={ACCENT} fontFamily={font}>
          {register.value}
        </text>
      )}
      {register?.note && (
        <text x={W / 2} y={top + cellH + 54} textAnchor="middle" fontSize={9.5} fill={MUTED} fontFamily={font}>
          {register.note}
        </text>
      )}
    </g>
  );
}

/** A dial with two limits: the ring a machine can reach, a tolerance window, a duty range. */
function Reach({ spec }: { spec: DiagramSpec }) {
  const dial = spec.reach;
  const min = dial?.min ?? 0;
  const max = dial?.max ?? 1;
  const points = dial?.points ?? [];
  const cx = 160;
  const cy = 132;
  const radius = 96;
  const at = (value: number) => (value / (max || 1)) * radius;
  return (
    <g>
      <circle cx={cx} cy={cy} r={radius} fill={ACCENT} fillOpacity={0.06} stroke={LINE} />
      <circle cx={cx} cy={cy} r={Math.max(2, at(min))} fill={CANVAS} stroke={LINE} strokeDasharray="4 5" />
      <circle cx={cx} cy={cy} r={2.5} fill={MUTED} />
      <text x={cx} y={cy + radius + 16} textAnchor="middle" fontSize={10} fill={MUTED} fontFamily={font}>
        {fmt(max)} {dial?.unit ?? ''}
      </text>
      <text x={cx} y={cy} textAnchor="middle" fontSize={9.5} fill={MUTED} fontFamily={font}>
        0
      </text>
      {points.map((point, index) => {
        const angle = (-80 + (160 / Math.max(1, points.length - 1)) * index) * (Math.PI / 180);
        const r = Math.min(radius, Math.max(2, at(point.at)));
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        return (
          <g key={point.label + index}>
            <circle cx={x} cy={y} r={4} fill={point.ok === false ? 'var(--amber, #f59e0b)' : ACCENT} />
            <text
              x={x + (Math.cos(angle) >= 0 ? 8 : -8)}
              y={y + 3.5}
              textAnchor={Math.cos(angle) >= 0 ? 'start' : 'end'}
              fontSize={9.5}
              fill={BODY}
              fontFamily={font}
            >
              {point.label}
            </text>
          </g>
        );
      })}
      <line x1={cx + radius + 18} y1={38} x2={cx + radius + 18} y2={226} stroke={SOFT} />
      {points.map((point, index) => (
        <g key={`l-${point.label}-${index}`}>
          <circle cx={cx + radius + 26} cy={56 + index * 22} r={3} fill={point.ok === false ? 'var(--amber, #f59e0b)' : ACCENT} />
          <text x={cx + radius + 36} y={60 + index * 22} fontSize={10} fill={BODY} fontFamily={font}>
            {point.label} · {fmt(point.at)} {dial?.unit ?? ''}
          </text>
        </g>
      ))}
      {dial?.note && (
        <text x={12} y={240} fontSize={9.5} fill={MUTED} fontFamily={font}>
          {dial.note}
        </text>
      )}
    </g>
  );
}

/** One part's glyph on the wire, centred on `x`. A label and a value hang under it. */
function Part({ part, x, y }: { part: { kind: string; label: string; value?: string }; x: number; y: number }) {
  const stroke = ACCENT;
  const common = { fill: 'none', stroke, strokeWidth: 1.6 };
  let glyph: React.ReactNode = null;
  switch (part.kind) {
    case 'source':
      glyph = (
        <g>
          <circle cx={x} cy={y} r={13} {...common} />
          <text x={x} y={y + 3.5} textAnchor="middle" fontSize={9.5} fill={ACCENT} fontFamily={font}>
            V
          </text>
        </g>
      );
      break;
    case 'resistor':
      glyph = (
        <path
          d={`M${x - 18},${y} l5,-6 l6,12 l6,-12 l6,12 l5,-6`}
          {...common}
        />
      );
      break;
    case 'capacitor':
      glyph = (
        <g>
          <line x1={x - 5} y1={y - 10} x2={x - 5} y2={y + 10} {...common} />
          <line x1={x + 5} y1={y - 10} x2={x + 5} y2={y + 10} {...common} />
          <line x1={x - 18} y1={y} x2={x - 5} y2={y} {...common} />
          <line x1={x + 5} y1={y} x2={x + 18} y2={y} {...common} />
        </g>
      );
      break;
    case 'inductor':
      glyph = (
        <path d={`M${x - 18},${y} q4,-12 9,0 q4,-12 9,0 q4,-12 9,0`} {...common} />
      );
      break;
    case 'diode':
      glyph = (
        <g>
          <path d={`M${x - 6},${y - 8} L${x + 6},${y} L${x - 6},${y + 8} Z`} fill={ACCENT} fillOpacity={0.4} stroke={ACCENT} />
          <line x1={x + 6} y1={y - 9} x2={x + 6} y2={y + 9} {...common} />
        </g>
      );
      break;
    case 'switch':
      glyph = (
        <g>
          <circle cx={x - 8} cy={y} r={2} fill={ACCENT} />
          <circle cx={x + 8} cy={y} r={2} fill={ACCENT} />
          <line x1={x - 8} y1={y} x2={x + 6} y2={y - 11} {...common} />
        </g>
      );
      break;
    case 'motor':
      glyph = (
        <g>
          <circle cx={x} cy={y} r={13} {...common} />
          <text x={x} y={y + 3.5} textAnchor="middle" fontSize={9.5} fill={ACCENT} fontFamily={font}>
            M
          </text>
        </g>
      );
      break;
    default:
      glyph = <circle cx={x} cy={y} r={3} fill={ACCENT} />;
  }
  return (
    <g>
      {glyph}
      <text x={x} y={y + 24} textAnchor="middle" fontSize={10} fill={INK} fontFamily={font}>
        {part.label}
      </text>
      {part.value && (
        <text x={x} y={y + 37} textAnchor="middle" fontSize={9.5} fill={MUTED} fontFamily={font}>
          {part.value}
        </text>
      )}
    </g>
  );
}

/** A two-terminal loop drawn left to right, with an optional shunt to ground. */
function Schematic({ spec }: { spec: DiagramSpec }) {
  const circuit = spec.schematic;
  const series = circuit?.series ?? [];
  const y = 74;
  const left = 34;
  const right = W - 34;
  const slot = (right - left) / Math.max(1, series.length);
  const xAt = (index: number) => left + slot * index + slot / 2;
  const shunt = circuit?.shunt;
  const shuntX = xAt(Math.min(series.length - 1, shunt?.after ?? 0)) + slot / 2 - 8;
  return (
    <g>
      <line x1={left - 12} y1={y} x2={right} y2={y} stroke={SOFT} strokeWidth={1.4} />
      {series.map((part, index) => (
        <Part key={part.label + index} part={part} x={xAt(index)} y={y} />
      ))}
      {shunt && (
        <g>
          <line x1={shuntX} y1={y} x2={shuntX} y2={132} stroke={SOFT} strokeWidth={1.4} />
          <line x1={shuntX - 12} y1={132} x2={shuntX + 12} y2={132} stroke={ACCENT} strokeWidth={1.6} />
          <line x1={shuntX - 8} y1={138} x2={shuntX + 8} y2={138} stroke={ACCENT} strokeWidth={1.6} />
          <line x1={shuntX - 4} y1={144} x2={shuntX + 4} y2={144} stroke={ACCENT} strokeWidth={1.6} />
          <text x={shuntX + 18} y={128} fontSize={10} fill={INK} fontFamily={font}>
            {shunt.label}
          </text>
          {shunt.value && (
            <text x={shuntX + 18} y={141} fontSize={9.5} fill={MUTED} fontFamily={font}>
              {shunt.value}
            </text>
          )}
        </g>
      )}
      {circuit?.note && (
        <text x={W / 2} y={180} textAnchor="middle" fontSize={9.5} fill={MUTED} fontFamily={font}>
          {circuit.note}
        </text>
      )}
    </g>
  );
}

/** A quantitative plot with both axes labelled: the figure that can carry real units. */
function Plot({ spec }: { spec: DiagramSpec }) {
  const plot = spec.plot;
  const xAxis = plot?.x ?? { label: 'x', min: 0, max: 1 };
  const yAxis = plot?.y ?? { label: 'y', min: 0, max: 1 };
  const left = 58;
  const right = W - 20;
  const top = 28;
  const bottom = 168;
  const sx = (value: number) => {
    if (xAxis.log) {
      const lo = Math.log10(Math.max(1e-9, xAxis.min));
      const hi = Math.log10(Math.max(xAxis.min * 10, xAxis.max));
      return left + ((Math.log10(Math.max(1e-9, value)) - lo) / (hi - lo || 1)) * (right - left);
    }
    return left + ((value - xAxis.min) / (xAxis.max - xAxis.min || 1)) * (right - left);
  };
  const sy = (value: number) => bottom - ((value - yAxis.min) / (yAxis.max - yAxis.min || 1)) * (bottom - top);
  const xTicks = [0, 0.33, 0.66, 1].map((fraction) =>
    xAxis.log
      ? Math.pow(10, Math.log10(Math.max(1e-9, xAxis.min)) + fraction * (Math.log10(Math.max(xAxis.min * 10, xAxis.max)) - Math.log10(Math.max(1e-9, xAxis.min))))
      : xAxis.min + fraction * (xAxis.max - xAxis.min)
  );
  const yTicks = [0, 0.33, 0.66, 1].map((fraction) => yAxis.min + fraction * (yAxis.max - yAxis.min));
  return (
    <g>
      {(plot?.bands ?? []).map((band) => {
        const rect =
          band.axis === 'y'
            ? { x: left, y: sy(band.to), width: right - left, height: Math.max(1, sy(band.from) - sy(band.to)) }
            : { x: sx(band.from), y: top, width: Math.max(1, sx(band.to) - sx(band.from)), height: bottom - top };
        return (
          <g key={band.label}>
            <rect {...rect} fill={ACCENT} fillOpacity={0.08} />
            <text x={rect.x + 4} y={rect.y + 11} fontSize={9} fill={ACCENT} fontFamily={font}>
              {band.label}
            </text>
          </g>
        );
      })}
      {yTicks.map((value) => (
        <g key={`y-${value}`}>
          <line x1={left} y1={sy(value)} x2={right} y2={sy(value)} stroke={SOFT} strokeWidth={1} />
          <text x={left - 7} y={sy(value) + 3.5} textAnchor="end" fontSize={9} fill={MUTED} fontFamily={font}>
            {fmt(value)}
          </text>
        </g>
      ))}
      {xTicks.map((value) => (
        <text key={`x-${value}`} x={sx(value)} y={bottom + 14} textAnchor="middle" fontSize={9} fill={MUTED} fontFamily={font}>
          {fmt(value)}
        </text>
      ))}
      <line x1={left} y1={top} x2={left} y2={bottom} stroke={LINE} />
      <line x1={left} y1={bottom} x2={right} y2={bottom} stroke={LINE} />
      <text x={(left + right) / 2} y={bottom + 30} textAnchor="middle" fontSize={10} fill={BODY} fontFamily={font}>
        {xAxis.label}
        {xAxis.unit ? ` (${xAxis.unit})` : ''}
      </text>
      <text
        x={14}
        y={(top + bottom) / 2}
        textAnchor="middle"
        fontSize={10}
        fill={BODY}
        fontFamily={font}
        transform={`rotate(-90 14 ${(top + bottom) / 2})`}
      >
        {yAxis.label}
        {yAxis.unit ? ` (${yAxis.unit})` : ''}
      </text>
      {(plot?.series ?? []).map((line, index) => {
        const colour = index === 0 ? ACCENT : index === 1 ? INK : MUTED;
        const path = line.points
          .map((point, i) => `${i === 0 ? 'M' : 'L'}${sx(point.x).toFixed(1)},${sy(point.y).toFixed(1)}`)
          .join(' ');
        const dots = line.markers || line.points.length <= 6;
        return (
          <g key={line.label + index}>
            <path d={path} fill="none" stroke={colour} strokeWidth={1.7} strokeDasharray={line.dashed ? '5 4' : undefined} />
            {dots &&
              line.points.map((point, i) => (
                <circle key={i} cx={sx(point.x)} cy={sy(point.y)} r={2.6} fill={colour} />
              ))}
          </g>
        );
      })}
      {(plot?.series ?? []).map((line, index) => (
        <g key={`k-${line.label}`}>
          <line
            x1={left + 8}
            y1={186 + index * 15}
            x2={left + 26}
            y2={186 + index * 15}
            stroke={index === 0 ? ACCENT : index === 1 ? INK : MUTED}
            strokeWidth={1.8}
            strokeDasharray={line.dashed ? '5 4' : undefined}
          />
          <text x={left + 32} y={190 + index * 15} fontSize={9.5} fill={BODY} fontFamily={font}>
            {line.label}
          </text>
        </g>
      ))}
    </g>
  );
}

/** The drawing, without the caption: what a tab or a card wants when it has its own label. */
/** How tall a figure is, from the same data its renderer uses, so the two cannot disagree. */
export function artHeight(spec: DiagramSpec): number {
  switch (spec.kind) {
    case 'chain':
      return 150;
    case 'loop':
      return 215;
    case 'timing':
      return 190;
    case 'states':
      return 22 + (spec.stages?.length ?? 1) * 56 + 8;
    case 'route':
      return routeLayout(spec.steps ?? []).height;
    case 'bars':
      return 26 + (spec.bars?.length ?? 1) * 34 + 16;
    case 'graph': {
      const { levels, rows } = graphLayers(spec);
      const down = spec.direction === 'TD' ? levels : rows;
      // The same gap the renderer uses: a taller row pitch must grow the viewBox with it.
      return 14 + down * 38 + Math.max(0, down - 1) * graphSpacing(spec).gapY + 14;
    }
    case 'matrix':
      return 30 + (spec.matrix?.rows.length ?? 1) * 38 + (spec.matrix?.note ? 20 : 0) + 8;
    case 'bits': {
      const register = spec.bits;
      return 84 + 38 + (register?.value ? 22 : 0) + (register?.note ? 20 : 0);
    }
    case 'reach':
      return 252;
    case 'schematic':
      return 196;
    case 'plot':
      return Math.max(210, 200 + (spec.plot?.series.length ?? 1) * 15);
    default:
      return 160;
  }
}

export function DiagramArt({ spec }: { spec: DiagramSpec }) {
  const height = artHeight(spec);
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="block h-auto w-full" role="img" aria-label={`${spec.title}. ${spec.caption}`}>
      <Defs />
      {spec.kind === 'chain' && <Chain spec={spec} />}
      {spec.kind === 'loop' && <Loop spec={spec} />}
      {spec.kind === 'timing' && <Timing spec={spec} />}
      {spec.kind === 'states' && <States spec={spec} />}
      {spec.kind === 'bars' && <Bars spec={spec} />}
      {spec.kind === 'route' && <Route spec={spec} />}
      {spec.kind === 'graph' && <Graph spec={spec} />}
      {spec.kind === 'matrix' && <Matrix spec={spec} />}
      {spec.kind === 'bits' && <Bits spec={spec} />}
      {spec.kind === 'reach' && <Reach spec={spec} />}
      {spec.kind === 'schematic' && <Schematic spec={spec} />}
      {spec.kind === 'plot' && <Plot spec={spec} />}
    </svg>
  );
}

/**
 * A figure with its heading and caption, for a lesson page.
 *
 * The caption is `<figcaption>`, not a paragraph in the prose: it belongs to the picture, reads after
 * it in both the visual and the accessibility tree, and cannot be mistaken for the next section.
 */
/**
 * One figure, at whatever width the page can give it — plus the way out when that is too little.
 *
 * The drawings are laid out on a 640-unit canvas whose smallest labels are 9.5 units, so they are
 * legible at roughly their own width and not much below it. The lesson pane is narrower than that on
 * most screens: a phone gives the figure 328 px (5 px type), and the split reader gives it 312 px at
 * 1024. Scaling a diagram down is scaling its words down.
 *
 * So a figure can be expanded: the same SVG, at no smaller than its design width, in a sheet over the
 * page. The sheet keeps `min-width: 640px` inside a horizontal scroller, which is why a phone gets
 * full-size type it can pan across instead of quarter-size type it cannot read.
 */
export function Diagram({
  spec,
  id,
  className = '',
  live = false,
}: {
  spec: DiagramSpec;
  id?: string;
  className?: string;
  /**
   * Let the figure run while it is on screen (a lesson page). Off by default so the introduction's
   * own, louder `LiveFigure` is the only thing annotating its drawings, and the expanded sheet — the
   * close look at the labels — is always a still.
   */
  live?: boolean;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const closeRef = React.useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = React.useRef<HTMLElement | null>(null);
  const artRef = React.useRef<HTMLDivElement | null>(null);
  const motionOn = useFigureMotion();

  // The figure's own drawing, annotated after mount: the same SVG the lesson would show still, so
  // there is no second copy to drift. The observer, the preference and the cleanup all live in
  // `visuals/liveFigure.ts`.
  React.useEffect(() => {
    if (!live || !motionOn) return undefined;
    const svg = artRef.current?.querySelector('svg[role="img"]');
    if (!svg) return undefined;
    return attachQuietMotion(svg as SVGSVGElement, spec.kind);
  }, [live, motionOn, spec]);

  React.useEffect(() => {
    if (!expanded) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setExpanded(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      returnFocusRef.current?.focus?.();
    };
  }, [expanded]);

  const open = () => setExpanded(true);

  const sheet = expanded
    ? createPortal(
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/65 p-3 pt-[6vh]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setExpanded(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={spec.title}
            data-testid={id ? `fig-sheet-${id}` : 'fig-sheet'}
            className="w-full max-w-[min(1500px,96vw)] overflow-hidden rounded-xl border bg-panel shadow-2xl"
            style={{ borderColor: 'var(--border-strong)' }}
          >
            <div
              className="flex items-center justify-between gap-2 border-b px-3 py-2"
              style={{ borderColor: 'var(--border)' }}
            >
              <span className="eyebrow">{spec.title}</span>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setExpanded(false)}
                data-testid={id ? `fig-sheet-close-${id}` : 'fig-sheet-close'}
                aria-label={`Close the expanded figure: ${spec.title}`}
                className="btn shrink-0"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Close</span>
              </button>
            </div>
            {/* Never below the drawing's own 640 units: a phone pans, it does not squint. */}
            <div className="overflow-x-auto px-3 py-3">
              <div className="min-w-[640px]">
                <DiagramArt spec={spec} />
              </div>
            </div>
            <p
              className="border-t px-3 py-2 text-[12.5px] leading-snug text-muted"
              style={{ borderColor: 'var(--border)' }}
            >
              {spec.caption}
            </p>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <figure
      data-testid={id ? `diagram-${id}` : 'diagram'}
      className={`my-4 overflow-hidden rounded-xl border border-line bg-panel ${className}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-line-soft bg-canvas px-3 py-1.5">
        <span className="eyebrow">{spec.title}</span>
        <span className="flex shrink-0 items-center gap-2">
          {id && <span className="hidden font-mono text-[11px] text-faint sm:inline">{id}</span>}
          <button
            type="button"
            onClick={open}
            data-testid={id ? `fig-expand-${id}` : 'fig-expand'}
            aria-haspopup="dialog"
            title={`Expand this figure${id ? ` (${id})` : ''} — the same drawing at full size, with a phone able to pan across it.`}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded border border-line-soft px-1.5 py-1 text-[12px] font-semibold text-muted hover:text-ink"
          >
            <Maximize2 className="h-3 w-3" aria-hidden="true" />
            <span className="hidden sm:inline">Expand</span>
          </button>
        </span>
      </div>
      <div ref={artRef} className="figure-art relative px-2 py-2">
        <DiagramArt spec={spec} />
        {/* The picture is the other door to the same sheet: on a phone a tap on the drawing is the
            gesture a learner already makes, and the header button is small. The control is an empty
            overlay rather than a wrapper around the art: a button around the drawing took its name
            from an `aria-label` that could not contain the SVG's own text, which axe reports as
            `label-content-name-mismatch`. Empty, it carries its own name and the drawing keeps its
            `role="img"` description. */}
        <button
          type="button"
          onClick={open}
          aria-haspopup="dialog"
          aria-label={`Expand this figure${id ? ` (${id})` : ''}: ${spec.title}`}
          data-testid={id ? `fig-tap-${id}` : 'fig-tap'}
          className="absolute inset-0 cursor-zoom-in rounded-lg bg-transparent"
        />
      </div>
      <figcaption className="border-t border-line-soft px-3 py-2 text-[12.5px] leading-snug text-muted">
        {spec.caption}
      </figcaption>
      {sheet}
    </figure>
  );
}
