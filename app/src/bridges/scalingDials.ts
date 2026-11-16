/**
 * The two dials behind linear scaling (`app/src/bridges/scalingDials.ts`).
 *
 * Lesson P.9's Bridge Notes ends on the sentence a beginner can act on: *the fraction of my top,
 * times the top of yours*. That is two dials, and a dial is the one thing a paragraph cannot show —
 * where a reading sits on its own scale, and where that fraction lands on the other one. So this
 * module is the arithmetic behind the picture, and the picture is a consumer of it: the SVG needle,
 * the three readouts and the test all read the same functions, which is what keeps a drawing from
 * disagreeing with the lesson it sits under.
 *
 * Every number here comes from the page's own worked example (`track-p/P.9-…md`): a 10-bit dial runs
 * `0 … 1023`, the answer dial runs `0.0 … 5.0` volts or `0 … 255` counts, `511.5` is halfway at
 * `0.5`, and one reading is `2.50 V` and `127.5` at the same time. Nothing is softened to make the
 * picture easier: a reading past either end is clamped, because a dial has ends, and a top of zero or
 * less is an error rather than an infinity.
 *
 * Pure functions, no React and no DOM, so `scripts/test_bridge_visuals.mjs` can drive the model
 * without a browser and the browser check has something exact to assert against.
 */

/** The top of the sensor's dial: a 10-bit ADC counts `0 … 1023`. */
export const DIAL_TOP = 1023;

/** Half a count: the finest reading a 10-bit dial honestly has, and the step the slider offers. */
export const DIAL_STEP = 0.5;

/** The top of the answer dial in volts, for a `0 … 5.0 V` sensor. */
export const VOLT_TOP = 5;

/** The top of the answer dial in counts, for an 8-bit command. */
export const COMMAND_TOP = 255;

/** The needle's travel: 240° of a circle, so the dial reads like a meter rather than a bar. */
export const NEEDLE_SWEEP = 240;

/** Where the needle points at a reading of zero: straight down-left, in degrees from up. */
export const NEEDLE_START = -120;

/** A reading past either end is the end: a dial has stops, so nothing here is unbounded. */
export function clampReading(raw: number, top: number = DIAL_TOP): number {
  if (!Number.isFinite(raw)) return 0;
  return Math.min(top, Math.max(0, raw));
}

/** Where this reading sits on its own dial, as a fraction of that dial's top (`0 … 1`). */
export function fractionOf(raw: number, inTop: number = DIAL_TOP): number {
  if (!Number.isFinite(inTop) || inTop <= 0) {
    throw new Error('the top of a dial must be a positive number');
  }
  return clampReading(raw, inTop) / inTop;
}

/** Where a fraction lands on the other dial: the second half of the scaling move. */
export function landOn(fraction: number, outTop: number): number {
  if (!Number.isFinite(outTop) || outTop <= 0) {
    throw new Error('the top of a dial must be a positive number');
  }
  const f = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
  return f * outTop;
}

/** The whole move in one call, for a caller that has a reading and both tops. */
export function scaleTo(raw: number, inTop: number, outTop: number): number {
  return landOn(fractionOf(raw, inTop), outTop);
}

/** The needle's angle for a fraction of travel, in degrees clockwise from straight up. */
export function needleAngle(fraction: number): number {
  const f = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
  return NEEDLE_START + f * NEEDLE_SWEEP;
}

/** One reading, read out on both answer dials at once — what the visual prints. */
export interface Reading {
  /** The clamped reading on the sensor's dial. */
  raw: number;
  /** `raw / 1023`, the fraction the page's step 1 names. */
  fraction: number;
  /** The same fraction times `5.0`: the volts. */
  volts: number;
  /** The same fraction times `255`: the 8-bit command. */
  command: number;
}

/** Read one sensor count out on the volts dial and the command dial together. */
export function reading(raw: number, inTop: number = DIAL_TOP): Reading {
  const clamped = clampReading(raw, inTop);
  const fraction = fractionOf(clamped, inTop);
  return {
    raw: clamped,
    fraction,
    volts: landOn(fraction, VOLT_TOP),
    command: landOn(fraction, COMMAND_TOP),
  };
}

/** `0.500` — three places, because a 10-bit fraction is worth a thousandth. */
export function formatFraction(fraction: number): string {
  return fraction.toFixed(3);
}

/** `2.50` — two places, the way the page writes its volts. */
export function formatVolts(volts: number): string {
  return volts.toFixed(2);
}

/** `127.5` — one place, because a command of 255 over 1023 counts lands between steps. */
export function formatCommand(command: number): string {
  return command.toFixed(1);
}
