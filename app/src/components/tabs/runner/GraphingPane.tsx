import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { compileExpression, formatNumber, type AngleMode } from '../../../calculator';
import {
  fitGraphView,
  graphPointAt,
  graphStep,
  graphTickLabel,
  graphTicksBetween,
  graphViewFor,
  panGraphView,
  sampleCurve,
  zoomGraphView,
  type GraphView,
} from '../../../graphing';

/** One expression line: the text, the colour its curve is drawn in, and whether it is showing. */
interface GraphExpression {
  id: number;
  text: string;
  color: string;
  hidden: boolean;
}

interface CompiledExpression {
  evaluate: ((x: number) => number) | null;
  error: string | null;
}

/** The five curve colours a Desmos sheet starts with, brightened for this app's dark plot face. */
const CURVE_COLORS = ['#f26d6d', '#5b9dff', '#4cc38a', '#b184f5', '#f2a33c', '#38c6c1'];

/** A graphing keypad key: the face it shows and the text it puts at the caret. */
interface GraphKey {
  id: string;
  label: string;
  insert: string;
  tone: 'function' | 'constant' | 'utility';
}

/**
 * The small keypad Desmos puts under the expression list: the functions a graph is written from,
 * the constants and the variable, with the closing parenthesis the opening ones need. It is one
 * grid rather than a page switch because a graph expression is short.
 */
const GRAPH_KEYS: GraphKey[] = [
  { id: 'sin', label: 'sin', insert: 'sin(', tone: 'function' },
  { id: 'cos', label: 'cos', insert: 'cos(', tone: 'function' },
  { id: 'tan', label: 'tan', insert: 'tan(', tone: 'function' },
  { id: 'sqrt', label: '√', insert: 'sqrt(', tone: 'function' },
  { id: 'ln', label: 'ln', insert: 'ln(', tone: 'function' },
  { id: 'log', label: 'log', insert: 'log(', tone: 'function' },
  { id: 'abs', label: '|x|', insert: 'abs(', tone: 'function' },
  { id: 'pow', label: '^', insert: '^', tone: 'utility' },
  { id: 'pi', label: 'π', insert: 'π', tone: 'constant' },
  { id: 'e', label: 'e', insert: 'e', tone: 'constant' },
  { id: 'x', label: 'x', insert: 'x', tone: 'constant' },
  { id: 'rparen', label: ')', insert: ')', tone: 'utility' },
];

const GRAPH_KEY_CLASS: Record<GraphKey['tone'], string> = {
  function: 'text-muted hover:border-accent/40 hover:text-body',
  constant: 'text-accent hover:border-accent/40 hover:bg-accent/10',
  utility: 'text-body hover:border-accent/40 hover:bg-raise',
};

const GRID_MINOR = 'rgba(148, 163, 184, 0.055)';
const GRID_MAJOR = 'rgba(148, 163, 184, 0.14)';
const AXIS_INK = 'rgba(203, 213, 225, 0.55)';
const LABEL_INK = 'rgba(148, 163, 184, 0.92)';
const PLOT_INK = '#070a12';

/** `y = sin(x)` and `sin(x)` are the same curve; the assignment is a label, not part of the grammar. */
function stripAssignment(text: string): string {
  return text.replace(/^\s*y\s*=\s*/i, '').trim();
}

/** Three decimals is what a hover label can read; the full 12 is for the scientific tape. */
function shortNumber(value: number): string {
  return formatNumber(Number(value.toFixed(3)));
}

function expressionLabel(row: GraphExpression): string {
  const text = row.text.trim();
  return text || 'this expression';
}

/**
 * The graphing face (`runner/GraphingPane.tsx`).
 *
 * Desmos' graphing calculator is two surfaces that never lose each other: a list of expressions on
 * the left, each with the colour of its curve, and a sheet of graph paper on the right where the
 * same line is drawn. This keeps that shape — adding a line, hiding it by pressing its colour,
 * deleting it, and typing `y = …` or just `…` — over a canvas whose grid follows the window.
 *
 * The arithmetic is `calculator.ts`'s parser, so `sin`, `sqrt` and the rest mean exactly what the
 * scientific face means, and `graphing.ts` owns the grid steps, the pan/zoom window and the places a
 * curve has to break. What stays here is the part a canvas owns: measuring the sheet, drawing it at
 * the display's density, and turning a pointer into the number under it.
 */
export function GraphingPane({ angle, onAngle }: { angle: AngleMode; onAngle: (mode: AngleMode) => void }) {
  const [rows, setRows] = useState<GraphExpression[]>(() => [
    { id: 1, text: 'sin(x)', color: CURVE_COLORS[0], hidden: false },
  ]);
  const [view, setView] = useState<GraphView>(() => graphViewFor(640, 420));
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hover, setHover] = useState<{ px: number; py: number; x: number; y: number; color: string } | null>(
    null
  );
  const [dragging, setDragging] = useState(false);
  const [focusId, setFocusId] = useState<number | null>(null);
  // The row a keypad press writes to. It follows focus, so a learner can tap a line and then build
  // its expression from the keys without aiming at the input again.
  const [activeId, setActiveId] = useState(1);
  const nextId = useRef(2);
  const plotRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; view: GraphView } | null>(null);
  const inputs = useRef<Map<number, HTMLInputElement>>(new Map());
  const viewRef = useRef(view);
  viewRef.current = view;
  const fitted = useRef({ width: 0, height: 0 });

  /** Parse each line once per text or unit change; a pan never reparses an expression. */
  const compiled = useMemo<CompiledExpression[]>(
    () =>
      rows.map((row) => {
        const text = stripAssignment(row.text);
        if (!text) return { evaluate: null, error: null };
        try {
          return { evaluate: compileExpression(text, { angle }), error: null };
        } catch (failure) {
          return {
            evaluate: null,
            error: failure instanceof Error ? failure.message : 'That expression could not be read',
          };
        }
      }),
    [rows, angle]
  );

  // The sheet is measured, not guessed: a split pane and a full-width tab are both legal widths.
  useEffect(() => {
    const node = plotRef.current;
    if (!node) return;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      // The scientific face hides this pane rather than unmounting it, and a hidden element
      // measures zero. Keeping the last real size is what preserves the window across a switch.
      if (rect.width <= 0 || rect.height <= 0) return;
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      setSize((previous) =>
        previous.width === width && previous.height === height ? previous : { width, height }
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // A resize keeps the x window and re-derives y so a unit is the same number of pixels on both axes.
  // The first measurement is the opening window, centred and square.
  useEffect(() => {
    if (!size.width || !size.height) return;
    if (fitted.current.width === size.width && fitted.current.height === size.height) return;
    const first = fitted.current.width === 0;
    fitted.current = { width: size.width, height: size.height };
    setView((current) => (first ? graphViewFor(size.width, size.height) : fitGraphView(current, size.width, size.height)));
  }, [size]);

  useEffect(() => {
    if (focusId === null) return;
    inputs.current.get(focusId)?.focus();
    setFocusId(null);
  }, [focusId, rows]);

  // A wheel over the plot zooms about the pointer; React's own wheel listener is passive, so the
  // preventDefault that keeps the page still has to come from a native listener.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const anchor = graphPointAt(
        viewRef.current,
        event.clientX - rect.left,
        event.clientY - rect.top,
        rect.width,
        rect.height
      );
      const factor = Math.exp(Math.max(-160, Math.min(160, event.deltaY)) * 0.0015);
      setView((current) => zoomGraphView(current, factor, anchor));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  // The drawing itself. Every colour and size is a local number rather than a token: a canvas is an
  // instrument face in both palettes, which is why `--plot` is dark in light mode too.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width <= 0 || size.height <= 0) return;
    const density = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(size.width * density);
    canvas.height = Math.round(size.height * density);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(density, 0, 0, density, 0, 0);
    const { width, height } = size;
    const xSpan = view.xMax - view.xMin;
    const ySpan = view.yMax - view.yMin;
    if (!(xSpan > 0) || !(ySpan > 0)) return;
    const toPixelX = (x: number) => ((x - view.xMin) / xSpan) * width;
    const toPixelY = (y: number) => height - ((y - view.yMin) / ySpan) * height;

    context.clearRect(0, 0, width, height);
    context.fillStyle = PLOT_INK;
    context.fillRect(0, 0, width, height);

    const xStep = graphStep(xSpan, Math.max(4, Math.round(width / 88)));
    const yStep = graphStep(ySpan, Math.max(3, Math.round(height / 70)));

    const drawGrid = (step: number, ink: string) => {
      context.strokeStyle = ink;
      context.lineWidth = 1;
      context.beginPath();
      for (const tick of graphTicksBetween(view.xMin, view.xMax, step)) {
        const x = toPixelX(tick);
        if (x < 0 || x > width) continue;
        context.moveTo(x, 0);
        context.lineTo(x, height);
      }
      for (const tick of graphTicksBetween(view.yMin, view.yMax, step)) {
        const y = toPixelY(tick);
        if (y < 0 || y > height) continue;
        context.moveTo(0, y);
        context.lineTo(width, y);
      }
      context.stroke();
    };

    const minorX = xStep / 5;
    const minorY = yStep / 5;
    if ((minorX * width) / xSpan >= 6) drawGrid(minorX, GRID_MINOR);
    if ((minorY * height) / ySpan >= 6) drawGrid(minorY, GRID_MINOR);
    drawGrid(xStep, GRID_MAJOR);
    drawGrid(yStep, GRID_MAJOR);

    const axisX = toPixelY(0);
    const axisY = toPixelX(0);
    context.strokeStyle = AXIS_INK;
    context.lineWidth = 1.1;
    context.beginPath();
    if (axisX >= 0 && axisX <= height) {
      context.moveTo(0, axisX);
      context.lineTo(width, axisX);
    }
    if (axisY >= 0 && axisY <= width) {
      context.moveTo(axisY, 0);
      context.lineTo(axisY, height);
    }
    context.stroke();

    // Tick labels follow the axis while it is on screen and sit against the nearest edge when the
    // window has been panned past it, so a graph never loses its numbers.
    context.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
    context.fillStyle = LABEL_INK;
    const xLabelY = Math.max(2, Math.min(height - 14, axisX + 3));
    context.textAlign = 'center';
    context.textBaseline = 'top';
    for (const tick of graphTicksBetween(view.xMin, view.xMax, xStep)) {
      if (tick === 0) continue;
      const x = toPixelX(tick);
      if (x < 18 || x > width - 18) continue;
      context.fillText(graphTickLabel(tick, xStep), x, xLabelY);
    }
    const yLabelX = Math.max(24, Math.min(width - 6, axisY - 6));
    context.textAlign = 'right';
    context.textBaseline = 'middle';
    for (const tick of graphTicksBetween(view.yMin, view.yMax, yStep)) {
      if (tick === 0) continue;
      const y = toPixelY(tick);
      if (y < 12 || y > height - 12) continue;
      context.fillText(graphTickLabel(tick, yStep), yLabelX, y);
    }
    if (axisX >= 0 && axisX <= height && axisY >= 0 && axisY <= width) {
      context.textAlign = 'right';
      context.textBaseline = 'top';
      context.fillText('0', axisY - 4, axisX + 3);
    }

    context.save();
    context.beginPath();
    context.rect(0, 0, width, height);
    context.clip();
    compiled.forEach((entry, index) => {
      const row = rows[index];
      if (!row || !entry?.evaluate || row.hidden) return;
      context.strokeStyle = row.color;
      context.lineWidth = 2;
      context.lineJoin = 'round';
      context.lineCap = 'round';
      for (const segment of sampleCurve(entry.evaluate, view, width)) {
        context.beginPath();
        segment.forEach((point, pointIndex) => {
          const x = toPixelX(point.x);
          const y = toPixelY(point.y);
          if (pointIndex === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        });
        context.stroke();
      }
    });
    context.restore();

    if (hover) {
      context.save();
      context.setLineDash([4, 4]);
      context.strokeStyle = 'rgba(148, 163, 184, 0.35)';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(hover.px, 0);
      context.lineTo(hover.px, height);
      context.stroke();
      context.setLineDash([]);
      context.beginPath();
      context.arc(hover.px, hover.py, 4.5, 0, Math.PI * 2);
      context.fillStyle = hover.color;
      context.fill();
      context.lineWidth = 2;
      context.strokeStyle = '#f8fafc';
      context.stroke();
      context.restore();
    }
  }, [compiled, hover, rows, size, view]);

  const updateRow = (id: number, patch: Partial<GraphExpression>) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const addRow = (after?: number) => {
    const id = nextId.current;
    nextId.current += 1;
    setRows((current) => {
      const color = CURVE_COLORS[current.length % CURVE_COLORS.length];
      const row: GraphExpression = { id, text: '', color, hidden: false };
      if (after === undefined) return [...current, row];
      const index = current.findIndex((entry) => entry.id === after);
      if (index === -1) return [...current, row];
      const next = [...current];
      next.splice(index + 1, 0, row);
      return next;
    });
    setFocusId(id);
    setActiveId(id);
  };

  const removeRow = (id: number) => {
    const remaining = rows.filter((row) => row.id !== id);
    setRows((current) => {
      const next = current.filter((row) => row.id !== id);
      return next.length > 0 ? next : current.map((row) => (row.id === id ? { ...row, text: '' } : row));
    });
    if (remaining[0]) setActiveId(remaining[0].id);
  };

  /** Put a key's text where the active row's caret is, then leave the caret after it. */
  const insertAtActive = (text: string) => {
    const row = rows.find((entry) => entry.id === activeId) ?? rows[0];
    if (!row) return;
    const field = inputs.current.get(row.id);
    const start = field && document.activeElement === field ? field.selectionStart ?? row.text.length : row.text.length;
    const end = field && document.activeElement === field ? field.selectionEnd ?? start : start;
    const next = row.text.slice(0, start) + text + row.text.slice(end);
    updateRow(row.id, { text: next });
    setActiveId(row.id);
    window.setTimeout(() => {
      field?.focus();
      field?.setSelectionRange(start + text.length, start + text.length);
    }, 0);
  };

  const pointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, view };
    setDragging(true);
    setHover(null);
  };

  const pointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    if (dragRef.current) {
      const drag = dragRef.current;
      setView(
        panGraphView(drag.view, event.clientX - drag.x, event.clientY - drag.y, rect.width, rect.height)
      );
      return;
    }
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const point = graphPointAt(view, px, py, rect.width, rect.height);
    // Collected rather than narrowed in the callback: TypeScript cannot see an assignment made
    // inside `forEach`, so a `best` declared outside would stay typed as null for the reader below.
    const hits: { px: number; py: number; x: number; y: number; color: string; distance: number }[] = [];
    compiled.forEach((entry, index) => {
      const row = rows[index];
      if (!row || !entry?.evaluate || row.hidden) return;
      const y = entry.evaluate(point.x);
      if (!Number.isFinite(y)) return;
      const yPx = rect.height * (1 - (y - view.yMin) / (view.yMax - view.yMin));
      if (yPx < -24 || yPx > rect.height + 24) return;
      const distance = Math.abs(yPx - py);
      if (distance <= 36) hits.push({ px, py: yPx, x: point.x, y, color: row.color, distance });
    });
    const best = hits.reduce<(typeof hits)[number] | null>(
      (closest, hit) => (!closest || hit.distance < closest.distance ? hit : closest),
      null
    );
    setHover(best ? { px: best.px, py: best.py, x: best.x, y: best.y, color: best.color } : null);
  };

  const pointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setDragging(false);
  };

  return (
    <section
      data-testid="graphing-pane"
      data-view={`${view.xMin.toFixed(6)},${view.xMax.toFixed(6)},${view.yMin.toFixed(6)},${view.yMax.toFixed(6)}`}
      aria-label="Graphing calculator"
      className="flex min-h-[29rem] w-full flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-[var(--shadow-md)]"
    >
      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <div className="flex w-full shrink-0 flex-col border-b border-line-soft sm:w-[18rem] sm:border-b-0 sm:border-r">
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-faint">
              Expressions
            </span>
            <div className="flex items-center gap-2">
              <div role="group" aria-label="Angle mode" className="flex items-center gap-1 font-mono text-[11px]">
                {(['rad', 'deg'] as const).map((mode, index) => (
                  <span key={mode} className="flex items-center gap-1">
                    {index > 0 && (
                      <span aria-hidden="true" className="text-faint">
                        /
                      </span>
                    )}
                    <button
                      type="button"
                      data-testid={`graph-angle-${mode}`}
                      aria-pressed={angle === mode}
                      onClick={() => onAngle(mode)}
                      title={mode === 'deg' ? 'Degrees: sin(30) is 0.5' : 'Radians: sin(π ÷ 2) is 1'}
                      className={`cursor-pointer lowercase transition-colors ${
                        angle === mode ? 'font-semibold text-accent' : 'text-faint hover:text-body'
                      }`}
                    >
                      {mode}
                    </button>
                  </span>
                ))}
              </div>
              <button
                type="button"
                data-testid="graph-add-expression"
                aria-label="Add an expression"
                title="Add an expression"
                onClick={() => addRow()}
                className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border border-line-soft bg-canvas text-muted transition-colors hover:border-accent/40 hover:text-accent"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="max-h-[14rem] flex-1 overflow-y-auto sm:max-h-none">
            {rows.map((row, index) => {
              const entry = compiled[index];
              return (
                <div
                  key={row.id}
                  data-testid="graph-expression-row"
                  className="group flex items-start gap-2 border-b border-line-soft/60 px-2.5 py-2 last:border-b-0"
                >
                  <button
                    type="button"
                    aria-pressed={!row.hidden}
                    aria-label={`${row.hidden ? 'Show' : 'Hide'} ${expressionLabel(row)}`}
                    title={row.hidden ? 'Show this curve' : 'Hide this curve'}
                    onClick={() => updateRow(row.id, { hidden: !row.hidden })}
                    className="mt-1.5 h-3.5 w-3.5 shrink-0 cursor-pointer rounded-full border-2 transition-opacity"
                    style={{
                      borderColor: row.color,
                      backgroundColor: row.hidden ? 'transparent' : row.color,
                      opacity: row.hidden ? 0.5 : 1,
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <input
                        ref={(node) => {
                          if (node) inputs.current.set(row.id, node);
                          else inputs.current.delete(row.id);
                        }}
                        data-testid="graph-expression-input"
                        aria-label={`Expression ${index + 1}`}
                        value={row.text}
                        onFocus={() => setActiveId(row.id)}
                        onChange={(event) => updateRow(row.id, { text: event.target.value })}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            addRow(row.id);
                          }
                          if (event.key === 'Backspace' && row.text === '' && rows.length > 1) {
                            event.preventDefault();
                            removeRow(row.id);
                          }
                        }}
                        placeholder="y = sin(x)"
                        autoComplete="off"
                        spellCheck={false}
                        className="w-full min-w-0 bg-transparent font-mono text-[14.5px] leading-6 text-body outline-none placeholder:text-faint/60"
                        style={{ boxShadow: 'none' }}
                      />
                      <button
                        type="button"
                        data-testid="graph-remove-expression"
                        aria-label={`Remove ${expressionLabel(row)}`}
                        title="Remove this expression"
                        onClick={() => removeRow(row.id)}
                        className="shrink-0 cursor-pointer rounded px-1 font-mono text-[13px] text-faint transition-colors hover:bg-rose/10 hover:text-rose"
                      >
                        ×
                      </button>
                    </div>
                    {entry?.error && (
                      <p
                        role="alert"
                        data-testid="graph-expression-error"
                        className="mt-0.5 text-[11px] leading-snug text-rose"
                      >
                        {entry.error}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
            <button
              type="button"
              data-testid="graph-add-row"
              onClick={() => addRow()}
              className="mx-2.5 my-2 flex w-[calc(100%-1.25rem)] cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-line px-2 py-1.5 font-mono text-[12px] text-muted transition-colors hover:border-accent/40 hover:text-accent"
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
              Add expression
            </button>
          </div>

          <div className="border-t border-line-soft bg-canvas/40 p-2">
            <div role="group" aria-label="Graphing keypad" className="grid grid-cols-4 gap-1">
              {GRAPH_KEYS.map((key) => (
                <button
                  key={key.id}
                  type="button"
                  data-testid={`graph-key-${key.id}`}
                  aria-label={`Insert ${key.label}`}
                  title={`Insert ${key.label}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => insertAtActive(key.insert)}
                  className={`h-7 select-none rounded-md border border-line-soft/70 bg-panel-2 font-mono text-[11px] transition-[transform,background-color,border-color,color] duration-75 active:translate-y-px cursor-pointer ${GRAPH_KEY_CLASS[key.tone]}`}
                >
                  {key.label}
                </button>
              ))}
            </div>
          </div>

          <p className="hidden border-t border-line-soft px-3 py-2 font-mono text-[10.5px] leading-relaxed text-faint sm:block">
            Drag to pan · scroll to zoom
          </p>
        </div>

        <div
          ref={plotRef}
          className="relative h-[21rem] min-w-0 flex-1 bg-plot sm:h-auto sm:min-h-[27rem]"
        >
          <canvas
            ref={canvasRef}
            data-testid="graph-canvas"
            role="img"
            aria-label="Graph of the expressions in the list"
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
            onPointerCancel={pointerUp}
            onPointerLeave={() => {
              if (!dragRef.current) setHover(null);
            }}
            className={`block h-full w-full touch-none ${dragging ? 'cursor-grabbing' : 'cursor-crosshair'}`}
          />
          <div className="absolute right-2 top-2 flex flex-col gap-1">
            <button
              type="button"
              data-testid="graph-zoom-in"
              aria-label="Zoom in"
              title="Zoom in"
              onClick={() => setView((current) => zoomGraphView(current, 0.75))}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-line bg-panel/90 text-body shadow-[var(--shadow-sm)] transition-colors hover:bg-raise"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              data-testid="graph-zoom-out"
              aria-label="Zoom out"
              title="Zoom out"
              onClick={() => setView((current) => zoomGraphView(current, 4 / 3))}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-line bg-panel/90 text-body shadow-[var(--shadow-sm)] transition-colors hover:bg-raise"
            >
              <Minus className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              data-testid="graph-reset-view"
              aria-label="Reset the view"
              title="Reset the view"
              onClick={() => setView(graphViewFor(size.width, size.height))}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-line bg-panel/90 text-body shadow-[var(--shadow-sm)] transition-colors hover:bg-raise"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          {hover && (
            <div
              data-testid="graph-hover-readout"
              className="pointer-events-none absolute rounded-md border border-line bg-panel/95 px-2 py-1 font-mono text-[11px] text-body shadow-[var(--shadow-sm)] tabular-nums"
              style={{
                left: Math.max(6, Math.min(size.width - 132, hover.px + 10)),
                top: Math.max(6, Math.min(size.height - 34, hover.py - 32)),
              }}
            >
              ({shortNumber(hover.x)}, {shortNumber(hover.y)})
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
