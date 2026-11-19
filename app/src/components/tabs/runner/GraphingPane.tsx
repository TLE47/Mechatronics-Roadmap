/**
 * The graphing face (`runner/GraphingPane.tsx`).
 *
 * Desmos' graphing calculator is two surfaces that never lose each other: a list of expressions on
 * the left, each with the colour of its curve, and a sheet of graph paper on the right where the same
 * line is drawn. This keeps that shape over a 2D canvas for functions and a transparent WebGL2 layer
 * for implicit curves.
 *
 * This module owns the sheet's state — which rows exist, what they compile into, the parameter scope,
 * and the viewport — and hands the list its rows and the plot its curves. The arithmetic is
 * `grapher/parser.ts`, `grapher/compiler.ts` and `grapher/renderer.ts`; the drawing is
 * `GraphPlot.tsx`; the list and its keypad are `GraphExpressionList.tsx`.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import type { AngleMode } from '../../../calculator';
import { applyPythonSlider, onGraphPush } from '../../../grapher/bridge';
import {
  compileExplicit,
  compileImplicit,
  evaluateConstantExpression,
} from '../../../grapher/compiler';
import { parseEquation } from '../../../grapher/parser';
import { viewportFor, type ImplicitCurve, type Viewport } from '../../../grapher/renderer';
import { parseSliders } from '../../../editor/sliderModel';
import { GraphExpressionList } from './GraphExpressionList';
import { GraphPlot } from './GraphPlot';
import {
  CURVE_COLORS,
  graphParameterName,
  type CompiledRow,
  type GraphExpression,
} from './graphModel';

/** The expression column's default, floor, ceiling and the sheet's own floor. */
const DEFAULT_LIST_WIDTH = 304;
const MIN_LIST_WIDTH = 216;
const MIN_PLOT_WIDTH = 200;
const MAX_LIST_WIDTH = 640;
/** The divider's own width, so the sheet's floor is measured on the sheet rather than the pane. */
const RESIZER_WIDTH = 10;

function clampListWidth(width: number, total: number): number {
  const max = Math.max(
    MIN_LIST_WIDTH,
    Math.min(MAX_LIST_WIDTH, total - MIN_PLOT_WIDTH - RESIZER_WIDTH)
  );
  return Math.round(Math.min(Math.max(width, MIN_LIST_WIDTH), max));
}

/**
 * The divider between the expression list and the sheet (`runner/GraphingPane.tsx`).
 *
 * Desmos lets a learner give the list the width their equations need; a fixed 19 rem column made a
 * long piecewise line scroll while the sheet stayed wide. The handle writes a CSS variable on the
 * pane, so the list keeps `w-full` when the pane stacks on a phone and the stored width only applies
 * to the desktop row. Pointer capture is what lets the drag continue over the canvas, and the
 * keyboard gets the same control through the separator role.
 */
function GraphListResizer({
  value,
  onChange,
  container,
}: {
  value: number;
  onChange: (width: number) => void;
  container: RefObject<HTMLElement | null>;
}) {
  const drag = useRef<{ startX: number; startWidth: number; total: number } | null>(null);

  const totalWidth = () => container.current?.getBoundingClientRect().width ?? 0;

  const begin = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    drag.current = { startX: event.clientX, startWidth: value, total: totalWidth() };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state) return;
    const delta = event.clientX - state.startX;
    if (Math.abs(delta) < 1) return;
    onChange(clampListWidth(state.startWidth + delta, state.total));
  };

  const end = () => {
    drag.current = null;
  };

  const nudge = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const step = event.shiftKey ? 32 : 12;
    onChange(
      clampListWidth(value + (event.key === 'ArrowRight' ? step : -step), totalWidth())
    );
  };

  return (
    <div
      role="separator"
      aria-label="Resize the expression panel"
      aria-orientation="vertical"
      aria-valuenow={Math.round(value)}
      aria-valuemin={MIN_LIST_WIDTH}
      aria-valuemax={MAX_LIST_WIDTH}
      aria-valuetext={`${Math.round(value)} pixels`}
      tabIndex={0}
      data-testid="graph-list-resizer"
      title="Drag to resize the expression panel. Double-click to reset."
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onDoubleClick={() => onChange(DEFAULT_LIST_WIDTH)}
      onKeyDown={nudge}
      className="group relative hidden w-2.5 shrink-0 cursor-col-resize touch-none items-center justify-center border-l border-line-soft bg-panel focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-1px] focus-visible:outline-accent sm:flex"
    >
      <span
        aria-hidden="true"
        className="h-9 w-0.5 rounded-full bg-line-strong transition-colors group-hover:bg-accent group-focus-visible:bg-accent"
      />
    </div>
  );
}

export function GraphingPane({
  angle,
  onAngle,
  source = '',
  onSourceChange,
  onSliderCommit,
}: {
  angle: AngleMode;
  onAngle: (mode: AngleMode) => void;
  /** The `main.py` draft, when the calculator is open inside the runner. */
  source?: string;
  /** Write a source slider's new literal back into `main.py`. */
  onSourceChange?: (next: string) => void;
  /** Ask the runner to re-run after a source slider changed: one run per drag, not per pixel. */
  onSliderCommit?: () => void;
}) {
  const [rows, setRows] = useState<GraphExpression[]>(() => [
    { id: 1, text: 'sin(x)', color: CURVE_COLORS[0], hidden: false },
  ]);
  const [view, setView] = useState<Viewport>(() => viewportFor(640, 420));
  const [listWidth, setListWidth] = useState(DEFAULT_LIST_WIDTH);
  const sectionRef = useRef<HTMLElement | null>(null);
  const listSized = useRef(false);
  // A graph-only parameter slider's value. A parameter linked to `main.py` reads the source's own
  // literal instead, so one slider cannot disagree with the code a run executes.
  const [parameterValues, setParameterValues] = useState<Record<string, number>>({});
  const nextId = useRef(2);

  // The default 19 rem is chosen for a full-width card. The calculator can also live in a narrow
  // split pane, where that default would leave the sheet less than its own floor; the first time the
  // section has a real width, the stored default is clamped to it. After that the width is the
  // learner's, and a window resize does not take it back.
  useEffect(() => {
    const node = sectionRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (listSized.current) return;
      const total = node.getBoundingClientRect().width;
      if (total <= 0) return;
      listSized.current = true;
      setListWidth((current) => clampListWidth(current, total));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const sourceSliders = useMemo(() => parseSliders(source), [source]);
  const sourceValues = useMemo(
    () => Object.fromEntries(sourceSliders.map((spec) => [spec.name, spec.value])),
    [sourceSliders]
  );

  /** Parse every row once per text or unit change; a pan never reparses an expression. */
  const compiled = useMemo<CompiledRow[]>(
    () =>
      rows.map((row) => {
        if (row.points) {
          return { parsed: null, error: null, explicit: null, implicit: null, parameterName: null };
        }
        try {
          const parsed = parseEquation(row.text);
          if (parsed.kind === 'parameter') {
            return {
              parsed,
              error: null,
              explicit: null,
              implicit: null,
              parameterName: graphParameterName(parsed),
            };
          }
          return parsed.kind === 'implicit' || parsed.kind === 'inequality'
            ? {
                parsed,
                error: null,
                explicit: null,
                implicit: compileImplicit(parsed, { angle }),
                parameterName: null,
              }
            : {
                parsed,
                error: null,
                explicit: compileExplicit(parsed, { angle }),
                implicit: null,
                parameterName: null,
              };
        } catch (failure) {
          return {
            parsed: null,
            error: failure instanceof Error ? failure.message : 'That expression could not be read',
            explicit: null,
            implicit: null,
            parameterName: null,
          };
        }
      }),
    [rows, angle]
  );

  /**
   * The scope every curve reads. Parameters are resolved in row order, so `b = 2a` sees `a` above
   * it; a Python slider is merged last because it is the value the run will actually execute.
   */
  const scope = useMemo(() => {
    const values: Record<string, number> = { ...sourceValues };
    for (let pass = 0; pass < 2; pass += 1) {
      compiled.forEach((entry) => {
        if (!entry.parsed || entry.parsed.kind !== 'parameter' || !entry.parameterName) return;
        if (entry.parameterName in sourceValues) return;
        if (entry.parsed.usesX || entry.parsed.usesY) return;
        const evaluated = evaluateConstantExpression(entry.parsed.ast, values, { angle });
        const chosen = parameterValues[entry.parameterName];
        const value = Number.isFinite(chosen) ? chosen : evaluated;
        if (Number.isFinite(value)) values[entry.parameterName] = value;
      });
    }
    return values;
  }, [angle, compiled, parameterValues, sourceValues]);

  const explicitCurves = useMemo(
    () =>
      compiled
        .map((entry, index) => {
          const row = rows[index];
          if (!row || !entry.explicit || row.hidden) return null;
          return {
            id: String(row.id),
            color: row.color,
            evaluate: (x: number) => entry.explicit!.evaluate(x, scope),
          };
        })
        .filter((curve): curve is NonNullable<typeof curve> => curve !== null),
    [compiled, rows, scope]
  );

  const implicitCurves: ImplicitCurve[] = useMemo(
    () =>
      compiled
        .map((entry, index) => {
          const row = rows[index];
          if (!row || !entry.implicit || row.hidden) return null;
          return {
            id: String(row.id),
            color: row.color,
            expression: entry.implicit.expression,
            parameters: entry.implicit.parameters,
            values: scope,
            region: entry.implicit.region,
          };
        })
        .filter((curve): curve is ImplicitCurve => curve !== null),
    [compiled, rows, scope]
  );

  const scatter = useMemo(
    () =>
      rows.flatMap((row) =>
        row.hidden || !row.points
          ? []
          : row.points.map((point) => ({ point, color: row.color }))
      ),
    [rows]
  );

  // A Python run can push expressions or points while this pane is open. The bridge validates the
  // message; this is the one place that turns it into rows on the sheet.
  useEffect(() => {
    return onGraphPush((push) => {
      setRows((current) => {
        const next = [...current];
        for (const expression of push.expressions) {
          const existing = next.find((row) => !row.points && row.text.trim() === expression);
          if (existing) {
            next[next.indexOf(existing)] = { ...existing, hidden: false };
            continue;
          }
          next.push({
            id: nextId.current++,
            text: expression,
            color: CURVE_COLORS[next.length % CURVE_COLORS.length]!,
            hidden: false,
          });
        }
        if (push.points.length > 0) {
          next.push({
            id: nextId.current++,
            text: '',
            color: CURVE_COLORS[next.length % CURVE_COLORS.length]!,
            hidden: false,
            points: push.points,
          });
        }
        return next;
      });
    });
  }, []);

  const updateRow = (id: number, patch: Partial<GraphExpression>) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  /** Add a row and return its id, so the list can put the caret in it. */
  const addRow = (after?: number) => {
    const id = nextId.current;
    nextId.current += 1;
    setRows((current) => {
      const color = CURVE_COLORS[current.length % CURVE_COLORS.length]!;
      const row: GraphExpression = { id, text: '', color, hidden: false };
      if (after === undefined) return [...current, row];
      const index = current.findIndex((entry) => entry.id === after);
      if (index === -1) return [...current, row];
      const next = [...current];
      next.splice(index + 1, 0, row);
      return next;
    });
    return id;
  };

  const removeRow = (id: number) => {
    setRows((current) => {
      const next = current.filter((row) => row.id !== id);
      // A sheet always keeps one line to type into; deleting the last one clears it instead.
      return next.length > 0
        ? next
        : current.map((row) => (row.id === id ? { ...row, text: '', points: undefined } : row));
    });
  };

  const forgetParameter = (name: string) => {
    setParameterValues((current) => {
      if (!(name in current)) return current;
      const copy = { ...current };
      delete copy[name];
      return copy;
    });
  };

  const handleSourceSlider = (spec: { name: string; value: number }, value: number) => {
    if (!onSourceChange) return;
    const next = applyPythonSlider(source, spec.name, value);
    if (next !== source) {
      onSourceChange(next);
      onSliderCommit?.();
    }
  };

  return (
    <section
      ref={sectionRef}
      data-testid="graphing-pane"
      data-view={`${view.xMin.toFixed(6)},${view.xMax.toFixed(6)},${view.yMin.toFixed(6)},${view.yMax.toFixed(6)}`}
      aria-label="Graphing calculator"
      style={{ '--graph-list-width': `${listWidth}px` } as CSSProperties}
      className="flex min-h-[29rem] w-full flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-[var(--shadow-md)] sm:h-[29rem] sm:min-h-0"
    >
      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <GraphExpressionList
          angle={angle}
          onAngle={onAngle}
          rows={rows}
          compiled={compiled}
          scope={scope}
          source={source}
          sourceSliders={sourceSliders}
          onAdd={addRow}
          onRemove={removeRow}
          onUpdate={updateRow}
          onForgetParameter={forgetParameter}
          onSetParameter={(name, value) =>
            setParameterValues((current) => ({ ...current, [name]: value }))
          }
          onSourceSlider={handleSourceSlider}
        />
        <GraphListResizer
          value={listWidth}
          onChange={setListWidth}
          container={sectionRef}
        />
        <GraphPlot
          view={view}
          onView={setView}
          explicitCurves={explicitCurves}
          implicitCurves={implicitCurves}
          scatter={scatter}
        />
      </div>
    </section>
  );
}
