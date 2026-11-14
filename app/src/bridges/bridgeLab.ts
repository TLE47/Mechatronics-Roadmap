/**
 * The shape one Bridge Notes lab is written in (`app/src/bridges/bridgeLab.ts`).
 *
 * Not every Bridge Notes section wants a dial. Most want one small experiment: *move this number,
 * watch what the section just claimed happen*. That is the same machine four times over — a control,
 * the line of arithmetic, and the numbers the section works out — so the machine is here once and
 * each section supplies its own control, arithmetic and readings
 * (`clampCommand.ts`, `unitPrefixes.ts`, `frequencyBits.ts`, `orderOfOperations.ts`).
 *
 * What lives here is deliberately arithmetic-only: a section's spec is a plain object of pure
 * functions, so `scripts/test_bridge_visuals.mjs` can grade a section's numbers without a browser or
 * a React render, and the drawing has nothing to disagree with. There is no formatting for a *kind*
 * of number beyond two helpers (`formatReading`, `formatFactor`), because a lab that softens its own
 * numbers is the failure mode this file is trying to make hard.
 */

/** One control a lab offers: a slider over a real range, or a switch the section talks about. */
export type LabControl =
  | {
      kind: 'range';
      id: string;
      label: string;
      unit: string;
      min: number;
      max: number;
      step: number;
      start: number;
      /** One clause under the slider: what moving it is like, in the section's own terms. */
      hint: string;
    }
  | {
      kind: 'toggle';
      id: string;
      label: string;
      start: boolean;
    };

/** What the controls currently hold, by control id. */
export interface LabValues {
  [id: string]: number | string | boolean;
}

/** One number the lab prints, worked out from the controls. */
export interface LabReadout {
  id: string;
  label: string;
  /** The reading as the page would print it, without the unit. */
  text: (values: LabValues) => string;
  unit?: string;
  /** One line under the reading: what it means, or which way it is wrong. */
  note?: (values: LabValues) => string;
}

/** The whole lab: controls, the arithmetic written as code, and the readings. */
export interface LabSpec {
  /** The `data-testid` prefix for the card and everything in it. */
  testid: string;
  title: string;
  /** The section's claim, in one sentence, above the experiment. */
  prompt: string;
  controls: LabControl[];
  readouts: LabReadout[];
  verdict?: (values: LabValues) => string;
}

/** The values a lab opens on: every control's own start. */
export function startValues(controls: LabControl[]): LabValues {
  const values: LabValues = {};
  for (const control of controls) values[control.id] = control.start as number | string | boolean;
  return values;
}

/** A numeric control's value, whatever a caller handed in. */
export function numberAt(values: LabValues, id: string, fallback = 0): number {
  const value = values[id];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A toggle control's value. */
export function toggleAt(values: LabValues, id: string): boolean {
  return values[id] === true;
}

/**
 * A reading at a fixed number of decimals, trailing zeros kept.
 *
 * `1.5` at two places is `1.50`, not `1.5`: the section's own print statements say `%.2f`, and a
 * picture that drops the zero makes a precision choice look like a different number.
 */
export function formatReading(value: number, places = 2): string {
  if (!Number.isFinite(value)) return '—';
  return value.toFixed(places);
}

/**
 * A base-unit value, as a datasheet or a meter would show it.
 *
 * Small numbers keep their zeros (`0.0005` for 500 µs) rather than going exponential, because the
 * point of the exercise is the factor, and `5.0e-4` hides it. Past a million the reading switches to
 * grouped digits (`1,000,000` for a megohm), and only below a millionth to an exponent.
 */
export function formatBaseUnit(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const magnitude = Math.abs(value);
  if (magnitude >= 1e6) return Math.round(value).toLocaleString('en-US');
  if (magnitude === 0) return '0';
  if (magnitude < 1e-6) return value.toExponential(1);
  const rounded = Number(value.toFixed(12));
  return String(rounded);
}

/** How far off a forgotten conversion leaves the answer, as the section phrases it. */
export function formatFactor(factor: number): string {
  if (!Number.isFinite(factor) || factor === 1) return '1×';
  if (factor >= 1) {
    const grouped = Math.round(factor).toLocaleString('en-US');
    return `${grouped}×`;
  }
  const inverse = Math.round(1 / factor);
  return `${inverse.toLocaleString('en-US')}× too big`;
}
