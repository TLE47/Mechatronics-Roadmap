/**
 * Parameter sliders in plain Python, without the editor.
 *
 * A lesson (or a learner) marks one numeric assignment:
 *
 *     Kp = 4.0   # @slider 0 20 0.1
 *
 * and the workbench puts a slider over that number: dragging it rewrites the literal in place and
 * re-runs. It is a comment, so the file is still ordinary Python - readable, runnable, and unchanged
 * when someone opens it in VS Code. Everything here is pure text handling, so the rules can be
 * tested without a browser or a `View`.
 */

export interface SliderSpec {
  /** 0-based line the assignment sits on. */
  line: number;
  name: string;
  /** The literal currently in the file. */
  value: number;
  min: number;
  max: number;
  step: number;
  /** How many decimals the literal is written with, so a rewrite looks like the author's own. */
  decimals: number;
  /** Document offsets of the number literal: what a drag replaces. */
  from: number;
  to: number;
}

const DIRECTIVE = /^(\s*)([A-Za-z_]\w*)\s*=\s*(-?(?:\d+\.\d*|\.\d+|\d+))\s*#\s*@slider\b(.*)$/;
const NUMBER = /-?(?:\d+\.\d*|\.\d+|\d+)/g;

function decimalsOf(text: string): number {
  const dot = text.indexOf('.');
  return dot === -1 ? 0 : text.length - dot - 1;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** The step a range suggests when the directive does not name one: one decimal place, or one unit. */
export function defaultStep(min: number, max: number, value: number): number {
  const decimals = Math.max(decimalsOf(String(min)), decimalsOf(String(max)), decimalsOf(String(value)));
  return decimals === 0 ? 1 : Number((10 ** -Math.min(decimals, 4)).toFixed(4));
}

/**
 * Every complete slider directive in a document, in line order.
 *
 * A directive missing its range, or with `min >= max`, is ignored rather than guessed at: a slider
 * with an invented range would quietly rewrite a number the author never offered to tune.
 */
export function parseSliders(code: string): SliderSpec[] {
  const specs: SliderSpec[] = [];
  let offset = 0;
  code.split('\n').forEach((lineText, index) => {
    const lineStart = offset;
    offset += lineText.length + 1;
    const match = DIRECTIVE.exec(lineText);
    if (!match) return;
    const literal = match[3];
    const numbers = (match[4].match(NUMBER) ?? []).map(Number);
    if (numbers.length < 2) return;
    const [min, max] = numbers;
    const value = Number(literal);
    if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(value) || min >= max) return;
    const stepText = numbers.length >= 3 ? match[4].match(NUMBER)![2] : null;
    const step = stepText ? Number(stepText) : defaultStep(min, max, value);
    if (!Number.isFinite(step) || step <= 0) return;
    const decimals = Math.min(
      4,
      Math.max(decimalsOf(literal), decimalsOf(stepText ?? ''), decimalsOf(String(min)), decimalsOf(String(max)))
    );
    // The literal's own position in the line (searched after the name, so `x = -1` finds `-1`),
    // plus the line's start offset: document coordinates, which is what a CM change wants.
    const literalInLine = lineText.indexOf(literal, match[2].length);
    specs.push({
      line: index,
      name: match[2],
      value,
      min,
      max,
      step,
      decimals,
      from: lineStart + literalInLine,
      to: lineStart + literalInLine + literal.length,
    });
  });
  return specs;
}

export function formatSliderValue(value: number, decimals: number): string {
  const fixed = clamp(value, -1e12, 1e12).toFixed(decimals);
  return decimals > 0 ? fixed : String(Math.round(Number(fixed)));
}

export interface SliderEdit {
  from: number;
  to: number;
  insert: string;
}

/**
 * The change that writes `next` into the literal `spec` points at, snapped to the step and clamped
 * to the range, or null when the text would not move (a drag inside one step's width).
 *
 * Offsets come from the spec, so callers must parse the document they are about to edit: a stale
 * spec from before a re-render can point into the middle of a different line.
 */
export function sliderEdit(spec: SliderSpec, next: number): SliderEdit | null {
  const clamped = clamp(next, spec.min, spec.max);
  const snapped = clamp(spec.min + Math.round((clamped - spec.min) / spec.step) * spec.step, spec.min, spec.max);
  const insert = formatSliderValue(snapped, spec.decimals);
  if (insert === formatSliderValue(spec.value, spec.decimals)) return null;
  return { from: spec.from, to: spec.to, insert };
}

/** The slider's own label, short enough for a 12 px row above the code. */
export function sliderLabel(spec: SliderSpec): string {
  return `${spec.name} = ${formatSliderValue(spec.value, spec.decimals)}`;
}
