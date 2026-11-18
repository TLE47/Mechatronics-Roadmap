/**
 * The graph sheet's vocabulary (`runner/graphModel.ts`).
 *
 * The graphing face is three modules: this one names the things a sheet is made of (a row, what a row
 * compiled into, a keypad key, a curve colour, a parameter's default range) and the two views that
 * draw them. Keeping the nouns here is what lets `GraphExpressionList.tsx` and `GraphPlot.tsx` share
 * a row without either owning the other.
 */

import { formatNumber } from '../../../calculator';
import type { CompiledExplicit, CompiledImplicit } from '../../../grapher/compiler';
import type { ParsedEquation } from '../../../grapher/parser';
import type { GraphPoint } from '../../../grapher/renderer';
import { formatSliderValue, type SliderSpec } from '../../../editor/sliderModel';

/** One expression line: the text, the colour its curve is drawn in, and whether it is showing. */
export interface GraphExpression {
  id: number;
  text: string;
  color: string;
  hidden: boolean;
  /** A Python `plot_points` row: it has no expression, only scatter points. */
  points?: GraphPoint[];
}

/** What a row compiled into. A parameter row is a slider, not a drawable curve. */
export interface CompiledRow {
  parsed: ParsedEquation | null;
  error: string | null;
  explicit: CompiledExplicit | null;
  implicit: CompiledImplicit | null;
  parameterName: string | null;
}

/** A graph key: the face it shows and the text it puts at the caret. */
export interface GraphKey {
  id: string;
  label: string;
  insert: string;
  tone: 'function' | 'constant' | 'utility';
}

/**
 * The small keypad Desmos puts under the expression list: the functions a graph is written from,
 * the constants, both variables, and the closing parenthesis the opening ones need.
 */
export const GRAPH_KEYS: GraphKey[] = [
  { id: 'sin', label: 'sin', insert: 'sin(', tone: 'function' },
  { id: 'cos', label: 'cos', insert: 'cos(', tone: 'function' },
  { id: 'tan', label: 'tan', insert: 'tan(', tone: 'function' },
  { id: 'sqrt', label: '√', insert: 'sqrt(', tone: 'function' },
  { id: 'ln', label: 'ln', insert: 'ln(', tone: 'function' },
  { id: 'log', label: 'log', insert: 'log(', tone: 'function' },
  { id: 'abs', label: '|x|', insert: 'abs(', tone: 'function' },
  { id: 'atan2', label: 'atan2', insert: 'atan2(', tone: 'function' },
  { id: 'pow', label: '^', insert: '^', tone: 'utility' },
  { id: 'pi', label: 'π', insert: 'π', tone: 'constant' },
  { id: 'e', label: 'e', insert: 'e', tone: 'constant' },
  { id: 'x', label: 'x', insert: 'x', tone: 'constant' },
  { id: 'y', label: 'y', insert: 'y', tone: 'constant' },
  { id: 'comma', label: ',', insert: ',', tone: 'utility' },
  { id: 'rparen', label: ')', insert: ')', tone: 'utility' },
  { id: 'lparen', label: '(', insert: '(', tone: 'utility' },
];

export const GRAPH_KEY_CLASS: Record<GraphKey['tone'], string> = {
  function: 'text-muted hover:border-accent/40 hover:text-body',
  constant: 'text-accent hover:border-accent/40 hover:bg-accent/10',
  utility: 'text-body hover:border-accent/40 hover:bg-raise',
};

/** The curve colours a sheet starts with, brightened for this app's dark plot face. */
export const CURVE_COLORS = ['#f26d6d', '#5b9dff', '#4cc38a', '#b184f5', '#f2a33c', '#38c6c1'];

/** Three decimals is what a readout can show; the full 12 belongs to the scientific tape. */
export function shortNumber(value: number): string {
  return formatNumber(Number(value.toFixed(3)));
}

export function expressionLabel(row: GraphExpression): string {
  return row.points ? `${row.points.length} points from Python` : row.text.trim() || 'this expression';
}

export function graphParameterName(parsed: ParsedEquation | null): string | null {
  if (!parsed || parsed.kind !== 'parameter') return null;
  return parsed.lhs?.kind === 'variable' ? parsed.lhs.name : null;
}

/**
 * The default range for a parameter written as `a = 2.5`. A source slider keeps the range the
 * author wrote in its `# @slider` comment; a graph-only parameter has no author range, so it gets a
 * useful one around zero rather than a second syntax to learn.
 */
export function defaultRange(value: number): { min: number; max: number; step: number } {
  const magnitude = Math.max(1, Math.abs(value) * 2);
  const min = value < 0 ? -magnitude : 0;
  const max = value < 0 ? 0 : magnitude;
  const step = magnitude <= 1 ? 0.01 : 0.1;
  return { min, max, step };
}

export function parameterText(spec: SliderSpec): string {
  return `${spec.name} = ${formatSliderValue(spec.value, spec.decimals)}`;
}
