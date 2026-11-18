/**
 * The Python-to-graph seam (`app/src/grapher/bridge.ts`).
 *
 * The worker cannot call React and the graphing pane should not know the worker's message shape, so
 * a run's graph pushes travel through one small subscription. `plot("sin(x)")` and
 * `plot_points([(x, y), …])` in `main.py` become rows on the sheet; the values are validated and
 * capped here because they crossed a thread boundary as JSON.
 *
 * The `# @slider` half is pure text: the editor already rewrites a slider's literal, so moving the
 * same slider from the graph is the same edit on the same source string. That is what keeps the
 * code on screen and the code Python runs in step.
 */

import { formatSliderValue, parseSliders, sliderEdit } from '../editor/sliderModel.ts';
import type { GraphPoint } from './renderer.ts';

export interface GraphPush {
  expressions: string[];
  points: GraphPoint[];
}

const MAX_EXPRESSIONS = 8;
const MAX_EXPRESSION_CHARS = 500;
const MAX_POINTS = 5000;
const listeners = new Set<(push: GraphPush) => void>();
// A run can push while the Calculator tab is closed. The next sheet to mount gets that one message
// rather than losing the plot the learner just asked Python for.
let pending: GraphPush | null = null;

/** Subscribe one sheet. Returns the unsubscribe a pane's effect cleanup calls. */
export function onGraphPush(listener: (push: GraphPush) => void): () => void {
  listeners.add(listener);
  if (pending) {
    const last = pending;
    pending = null;
    listener(last);
  }
  return () => listeners.delete(listener);
}

function finitePoint(value: unknown): GraphPoint | null {
  if (Array.isArray(value) && value.length >= 2) {
    const x = Number(value[0]);
    const y = Number(value[1]);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const x = Number(record.x);
    const y = Number(record.y);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  }
  return null;
}

/**
 * Validate a worker message. A malformed push is dropped rather than allowed to put an `undefined`
 * expression into the sheet; a huge point array is capped at what a canvas can still show.
 */
export function readGraphPush(payload: unknown): GraphPush | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  const expressions = Array.isArray(record.expressions)
    ? record.expressions
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean)
        .slice(0, MAX_EXPRESSIONS)
        .map((value) => value.slice(0, MAX_EXPRESSION_CHARS))
    : [];
  const points = Array.isArray(record.points)
    ? record.points
        .slice(0, MAX_POINTS)
        .map(finitePoint)
        .filter((value): value is GraphPoint => value !== null)
    : [];
  if (expressions.length === 0 && points.length === 0) return null;
  return { expressions, points };
}

/** Send one validated push to every mounted sheet. */
export function emitGraphPush(payload: unknown): void {
  const push = readGraphPush(payload);
  if (!push) return;
  if (listeners.size === 0) {
    pending = push;
    return;
  }
  for (const listener of listeners) listener(push);
}

/**
 * Write one `# @slider` literal into a source string.
 *
 * Returns the original string when the name is not a slider or the value would not move it. Offsets
 * are re-derived from this source, never kept from an earlier render.
 */
export function applyPythonSlider(source: string, name: string, value: number): string {
  const spec = parseSliders(source).find((candidate) => candidate.name === name);
  if (!spec) return source;
  const edit = sliderEdit(spec, value);
  if (!edit) return source;
  return source.slice(0, edit.from) + edit.insert + source.slice(edit.to);
}

/** The text a linked slider shows, in the literal's own number of decimals. */
export function pythonSliderLabel(source: string, name: string): string | null {
  const spec = parseSliders(source).find((candidate) => candidate.name === name);
  return spec ? `${spec.name} = ${formatSliderValue(spec.value, spec.decimals)}` : null;
}
