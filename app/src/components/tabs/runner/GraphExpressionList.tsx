/**
 * The graph sheet's left column (`runner/GraphExpressionList.tsx`).
 *
 * One row per line: a colour button that hides its curve, the expression, the sentence under an
 * unfinished line, and the slider a parameter or a `# @slider` gets. The keypad under the list writes
 * at the active row's caret, which is the one piece of state this view owns — the rows themselves and
 * what they compiled into belong to `GraphingPane.tsx`.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { MathView } from '../../MathView';
import { typesetEquation } from '../../../grapher/typeset';
import type { AngleMode } from '../../../calculator';
import { pythonSliderLabel } from '../../../grapher/bridge';
import type { SliderSpec } from '../../../editor/sliderModel';
import {
  GRAPH_KEYS,
  GRAPH_KEY_CLASS,
  defaultRange,
  expressionLabel,
  parameterText,
  shortNumber,
  type CompiledRow,
  type GraphExpression,
} from './graphModel';

export function GraphExpressionList({
  angle,
  onAngle,
  rows,
  compiled,
  scope,
  source,
  sourceSliders,
  onAdd,
  onRemove,
  onUpdate,
  onForgetParameter,
  onSetParameter,
  onSourceSlider,
}: {
  angle: AngleMode;
  onAngle: (mode: AngleMode) => void;
  rows: GraphExpression[];
  compiled: CompiledRow[];
  scope: Record<string, number>;
  source: string;
  sourceSliders: SliderSpec[];
  /** Add a row after `after`, or at the end; returns its id so the caret can follow it. */
  onAdd: (after?: number) => number;
  onRemove: (id: number) => void;
  onUpdate: (id: number, patch: Partial<GraphExpression>) => void;
  /** A parameter row's name changed; its old hand-set value no longer belongs to anything. */
  onForgetParameter: (name: string) => void;
  /** Set a graph-only parameter, the one a row defines without `main.py` claiming it. */
  onSetParameter: (name: string, value: number) => void;
  onSourceSlider: (spec: SliderSpec, value: number) => void;
}) {
  // The row a keypad press writes to. It follows focus, so a learner can tap a line and then build
  // its expression from the keys without aiming at the input again.
  const [activeId, setActiveId] = useState(() => rows[0]?.id ?? 1);
  const [focusId, setFocusId] = useState<number | null>(null);
  const inputs = useRef<Map<number, HTMLInputElement>>(new Map());

  // A row added by Enter or the Add button is focused after React has drawn it.
  useEffect(() => {
    if (focusId === null) return;
    inputs.current.get(focusId)?.focus();
    setFocusId(null);
  }, [focusId, rows]);

  // The line above each input is the equation as paper, parsed by the same grammar that plots it.
  // An unfinished or empty line has no display form, so the input alone carries it.
  const typesetRows = useMemo(() => {
    const rendered = new Map<number, string>();
    for (const row of rows) {
      if (row.points || !row.text.trim()) continue;
      const tex = typesetEquation(row.text);
      if (tex) rendered.set(row.id, tex);
    }
    return rendered;
  }, [rows]);

  const updateRow = (id: number, patch: Partial<GraphExpression>) => onUpdate(id, patch);

  const addRow = (after?: number) => {
    const id = onAdd(after);
    setActiveId(id);
    setFocusId(id);
  };

  const removeRow = (id: number) => {
    const remaining = rows.filter((row) => row.id !== id);
    if (activeId === id && remaining[0]) setActiveId(remaining[0].id);
    onRemove(id);
  };

  /** Put a key's text where the active row's caret is, then leave the caret after it. */
  const insertAtActive = (text: string) => {
    const row =
      rows.find((entry) => entry.id === activeId && !entry.points) ??
      rows.find((entry) => !entry.points);
    if (!row) return;
    const field = inputs.current.get(row.id);
    const start =
      field && document.activeElement === field
        ? field.selectionStart ?? row.text.length
        : row.text.length;
    const end = field && document.activeElement === field ? field.selectionEnd ?? start : start;
    const next = row.text.slice(0, start) + text + row.text.slice(end);
    updateRow(row.id, { text: next });
    setActiveId(row.id);
    window.setTimeout(() => {
      field?.focus();
      field?.setSelectionRange(start + text.length, start + text.length);
    }, 0);
  };

  return (
    <div className="flex w-full shrink-0 flex-col border-b border-line-soft sm:w-[var(--graph-list-width,19rem)] sm:border-b-0">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-faint">
          Expressions
        </span>
        <div className="flex items-center gap-2">
          <div
            role="group"
            aria-label="Angle mode"
            className="flex items-center gap-1 font-mono text-[11px]"
          >
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

      {/*
        The list scrolls inside the card, at every width. Without a cap on desktop, every added
        row made the column taller, which stretched the graph sheet and re-fitted its y window: the
        graph appeared to expand each time a learner wrote another expression. The cap is the scroll
        area a wide card already offers, so past it the rows scroll instead of stretching the sheet.
      */}
      <div
        data-testid="graph-expression-list"
        className="max-h-[14rem] min-h-0 flex-1 overflow-y-auto sm:max-h-[14.375rem]"
      >
        {rows.map((row, index) => {
          const entry = compiled[index];
          const linked = entry?.parameterName
            ? sourceSliders.find((spec) => spec.name === entry.parameterName) ?? null
            : null;
          const localValue = entry?.parameterName ? scope[entry.parameterName] ?? 0 : 0;
          const range = defaultRange(localValue);
          const typeset = typesetRows.get(row.id);
          return (
            <div
              key={row.id}
              data-testid="graph-expression-row"
              data-kind={row.points ? 'points' : entry?.parsed?.kind ?? 'invalid'}
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
                {row.points ? (
                  <div
                    className="flex items-center justify-between gap-2"
                    data-testid="graph-points-row"
                  >
                    <span className="font-mono text-[13px] text-muted">
                      {row.points.length} point{row.points.length === 1 ? '' : 's'} from Python
                    </span>
                    <button
                      type="button"
                      data-testid="graph-remove-expression"
                      aria-label={`Remove ${expressionLabel(row)}`}
                      title="Remove this point row"
                      onClick={() => removeRow(row.id)}
                      className="shrink-0 cursor-pointer rounded px-1 font-mono text-[13px] text-faint transition-colors hover:bg-rose/10 hover:text-rose"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <>
                    {typeset && (
                      <div
                        data-testid="graph-typeset"
                        aria-hidden="true"
                        className="max-h-16 overflow-x-auto overflow-y-hidden pb-0.5 text-[18px] leading-7 text-body"
                      >
                        <MathView math={typeset} />
                      </div>
                    )}
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
                        onChange={(event) => {
                          updateRow(row.id, { text: event.target.value });
                          if (entry?.parameterName) onForgetParameter(entry.parameterName);
                        }}
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
                        placeholder={
                          index === 0
                            ? 'y = sin(x), x^2 + y^2 <= 9, or {x < 0: -x, x >= 0: x}'
                            : 'y = …'
                        }
                        autoComplete="off"
                        spellCheck={false}
                        className={`w-full min-w-0 bg-transparent font-mono outline-none placeholder:text-faint/60 ${
                          typeset ? 'text-[11.5px] leading-5 text-muted' : 'text-[14px] leading-6 text-body'
                        }`}
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

                    {entry?.parameterName &&
                      (linked ? (
                        <p
                          data-testid={`graph-linked-${entry.parameterName}`}
                          className="mt-1 font-mono text-[11px] text-accent"
                        >
                          {pythonSliderLabel(source, entry.parameterName) ??
                            `${entry.parameterName} = ${localValue}`}{' '}
                          · linked to main.py
                        </p>
                      ) : (
                        <label className="mt-1 flex items-center gap-1.5 font-mono text-[11px] text-muted">
                          <span className="min-w-[4.5rem] tabular-nums">
                            {entry.parameterName} = {shortNumber(localValue)}
                          </span>
                          <input
                            type="range"
                            data-testid={`graph-parameter-${entry.parameterName}`}
                            aria-label={`Set ${entry.parameterName} on the graph`}
                            min={range.min}
                            max={range.max}
                            step={range.step}
                            value={localValue}
                            onChange={(event) => {
                              const value = Number(event.target.value);
                              if (Number.isFinite(value)) {
                                onSetParameter(entry.parameterName!, value);
                              }
                            }}
                            className="h-1 min-w-0 flex-1 accent-[var(--accent)]"
                          />
                        </label>
                      ))}

                    {entry?.error && (
                      <p
                        role="alert"
                        data-testid="graph-expression-error"
                        className="mt-0.5 text-[11px] leading-snug text-rose"
                      >
                        {entry.error}
                      </p>
                    )}
                  </>
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

      {sourceSliders.length > 0 && (
        <div data-testid="graph-python-sliders" className="border-t border-line-soft px-2.5 py-2">
          <p className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">
            From main.py
          </p>
          <div className="space-y-1.5">
            {sourceSliders.map((spec) => (
              <label
                key={spec.name}
                className="flex items-center gap-1.5 font-mono text-[11px] text-muted"
              >
                <span className="min-w-[5.2rem] tabular-nums">{parameterText(spec)}</span>
                <input
                  type="range"
                  data-testid={`graph-python-slider-${spec.name}`}
                  aria-label={`Set ${spec.name} from main.py`}
                  min={spec.min}
                  max={spec.max}
                  step={spec.step}
                  value={spec.value}
                  onChange={(event) => onSourceSlider(spec, Number(event.target.value))}
                  className="h-1 min-w-0 flex-1 accent-[var(--accent)]"
                />
              </label>
            ))}
          </div>
          <p className="mt-1 text-[10.5px] leading-snug text-faint">
            Dragging rewrites the literal and re-runs the file.
          </p>
        </div>
      )}

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
        Drag to pan · scroll to zoom · <code>plot("…")</code> from Python
      </p>
    </div>
  );
}
