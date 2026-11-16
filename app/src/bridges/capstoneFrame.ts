/**
 * Two hundred kilobits against a slower wire (`app/src/bridges/capstoneFrame.ts`).
 *
 * Lesson 08.1's Bridge Notes ends with the telemetry the capstone streams: a 20-byte
 * `<BHffffB` frame every 1 ms. Eight data bits plus start and stop is ten bits a byte, so the frame
 * needs `20 × 10 × 1000 = 200 kbit/s`; a 115.2 kbaud link carries `115.2 kbit/s`, the 256-byte TX
 * ring backs up, and the page's own run drops `412` of 1000 frames. At 500 kbaud the same run drops
 * `0`.
 *
 * The card runs the page's ring-buffer loop, so the number is the arithmetic rather than a
 * quotation: queue 20 bytes, refuse the frame when it will not fit, drain `baud/10 · Δt` bytes a
 * tick. The same card carries the other half of the capstone's claim — with the disturbance pulse
 * the 2-DOF arm peaks at `2.40 mm` and `0.91 mm` RMS, both under the `2.5 mm` limit.
 *
 * Pure functions; the page's 20 bytes, 1 kHz and 115.2 kbaud are the start values.
 */
import type { LabSpec, LabValues } from './bridgeLab.ts';
import { choiceAt, toggleAt } from './bridgeLab.ts';

export const FRAME_BYTES = 20;
export const FRAME_RATE_HZ = 1000;
export const TX_CAP_BYTES = 256;
export const STEP_S = 0.001;

export const SLOW_BAUD = 115200;
export const FAST_BAUD = 500000;

/** The capstone's run, in the page's own expected output. */
export const PEAK_ERROR_MM = 2.4;
export const RMS_ERROR_MM = 0.91;
export const ERROR_LIMIT_MM = 2.5;

export const BAUDS = [
  { value: '115200', label: '115.2 kbaud' },
  { value: '230400', label: '230.4 kbaud' },
  { value: '500000', label: '500 kbaud' },
] as const;
export const START_BAUD = '115200';

/** `bytes × 10 × rate`: what 8N1 needs for this frame at this rate. */
export function requiredBitsPerSecond(bytes: number, rateHz: number): number {
  if (!(bytes > 0) || !(rateHz > 0)) return 0;
  return bytes * 10 * rateHz;
}

/** How many bytes an 8N1 link can carry in one tick. */
export function bytesPerTick(baud: number, stepSeconds = STEP_S): number {
  if (!(baud > 0) || !(stepSeconds > 0)) return 0;
  return (baud / 10) * stepSeconds;
}

/**
 * The page's `simulate_uart_tx`: queue a frame per tick, drop it when the ring cannot hold it,
 * then drain the wire. Returns how many of `frames` never left.
 */
export function droppedFrames(
  baud: number,
  frames = FRAME_RATE_HZ,
  frameBytes = FRAME_BYTES,
  stepSeconds = STEP_S,
  capBytes = TX_CAP_BYTES
): number {
  if (!(baud > 0) || !(frames > 0) || !(frameBytes > 0) || !(capBytes > 0)) return 0;
  const drained = bytesPerTick(baud, stepSeconds);
  let used = 0;
  let dropped = 0;
  for (let tick = 0; tick < frames; tick += 1) {
    if (used + frameBytes <= capBytes) used += frameBytes;
    else dropped += 1;
    used = Math.max(0, used - drained);
  }
  return dropped;
}

const baudOf = (values: LabValues) => Number(choiceAt(values, 'baud', START_BAUD));
const disturbedOf = (values: LabValues) => toggleAt(values, 'disturbance');

export const capstoneFrameLab: LabSpec = {
  testid: 'bridge-capstone-frame',
  title: 'The frame that fits',
  prompt: '20 bytes at 1 kHz is 200 kbit/s. A 115.2 kbaud link drops 412 of 1000 frames; 500 kbaud drops none.',
  controls: [
    { kind: 'choice', id: 'baud', label: 'telemetry link', options: BAUDS, start: START_BAUD },
    { kind: 'toggle', id: 'disturbance', label: 'disturbance pulse', start: true },
  ],
  pair: { wrong: 'dropped_slow', right: 'dropped_fast', wrongLabel: '115.2 kbaud', rightLabel: '500 kbaud' },
  readouts: [
    {
      id: 'required',
      label: 'Frame needs',
      text: () => (requiredBitsPerSecond(FRAME_BYTES, FRAME_RATE_HZ) / 1000).toFixed(1),
      unit: 'kbit/s',
      note: () => `${FRAME_BYTES} B × 10 bits × 1000 Hz`,
    },
    {
      id: 'dropped',
      label: 'Dropped at your link',
      text: (values) => droppedFrames(baudOf(values)).toLocaleString('en-US'),
      unit: 'frames',
      note: (values) => `${bytesPerTick(baudOf(values)).toFixed(2)} B drained per 1 ms tick`,
    },
    {
      id: 'dropped_slow',
      label: 'Dropped at 115.2k',
      text: () => droppedFrames(SLOW_BAUD).toLocaleString('en-US'),
      unit: 'frames',
      note: () => 'of 1000 frames, in the page’s run',
    },
    {
      id: 'dropped_fast',
      label: 'Dropped at 500k',
      text: () => droppedFrames(FAST_BAUD).toLocaleString('en-US'),
      unit: 'frames',
      note: () => 'the wire outruns the queue',
    },
    {
      id: 'peak',
      label: 'Tip error, peak',
      text: (values) => (disturbedOf(values) ? PEAK_ERROR_MM : 0).toFixed(2),
      unit: 'mm',
      note: () => `limit ${ERROR_LIMIT_MM.toFixed(1)} mm`,
    },
    {
      id: 'rms',
      label: 'Tip error, RMS',
      text: (values) => (disturbedOf(values) ? RMS_ERROR_MM : 0).toFixed(2),
      unit: 'mm',
      note: () => 'over the 1000-tick run',
    },
  ],
  verdict: (values) => {
    const dropped = droppedFrames(baudOf(values));
    return dropped === 0
      ? `At ${(baudOf(values) / 1000).toFixed(1)} kbaud the link is faster than the 200 kbit/s the frame needs, so no frame waits: 0 of 1000 dropped.`
      : `At ${(baudOf(values) / 1000).toFixed(1)} kbaud the link carries ${bytesPerTick(
          baudOf(values)
        ).toFixed(2)} B per tick against the 20 B the frame adds: ${dropped} of 1000 frames never leave the 256-byte ring.`;
  },
};
