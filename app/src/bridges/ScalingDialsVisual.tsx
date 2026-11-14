import { useState } from 'react';
import type { ReactElement } from 'react';
import {
  COMMAND_TOP,
  DIAL_STEP,
  DIAL_TOP,
  NEEDLE_SWEEP,
  NEEDLE_START,
  formatCommand,
  formatFraction,
  formatVolts,
  needleAngle,
  reading,
} from './scalingDials';

/**
 * P.9's Bridge Notes, as a dial you can drag (`app/src/bridges/ScalingDialsVisual.tsx`).
 *
 * The lesson's last paragraph says scaling is *the fraction of my top, times the top of yours*, and
 * then checks it at three readings. A learner can read that sentence and still not know where
 * `511.5` sits; a needle that swings to the middle and two numbers that move under it answer that
 * without adding a word of prose. Dragging is the whole interaction — one control, three readouts,
 * nothing to configure.
 *
 * Everything drawn here comes from `scalingDials.ts`, so the needle, the numbers and the model test
 * cannot drift apart. The SVG is a `role="img"` with the reading in its name, and the slider beside
 * it is the same control for a keyboard or a screen reader: pointing is an accelerator, not the only
 * way in. This chunk is lazy (see `BridgeNotesVisual.tsx`), so a lesson without a visual never
 * downloads it.
 */

const CX = 104;
const CY = 100;
const R = 72;

/** A point on the dial's arc, in the SVG's own 208×120 box. */
function pointAt(fraction: number, radius: number): { x: number; y: number } {
  const radians = (needleAngle(fraction) * Math.PI) / 180;
  return { x: CX + radius * Math.sin(radians), y: CY - radius * Math.cos(radians) };
}

function arcPath(radius: number): string {
  const start = pointAt(0, radius);
  const end = pointAt(1, radius);
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 1 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

export default function ScalingDialsVisual(): ReactElement {
  const [raw, setRaw] = useState<number>(DIAL_TOP / 2);
  const shown = reading(raw);
  const needle = pointAt(shown.fraction, R - 12);
  const labelId = 'bridge-scaling-label';

  return (
    <div className="mt-3 rounded-lg border bg-panel-2 px-3 py-3" data-testid="bridge-scaling">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <svg
          viewBox="0 0 208 120"
          width="208"
          height="120"
          role="img"
          aria-labelledby={labelId}
          className="shrink-0"
        >
          <title id={labelId}>
            {`Reading ${shown.raw.toFixed(1)} on a dial running 0 to ${DIAL_TOP}: ${formatFraction(
              shown.fraction
            )} of the way round.`}
          </title>
          <path d={arcPath(R)} fill="none" stroke="currentColor" strokeOpacity="0.28" strokeWidth="6" strokeLinecap="round" className="text-body" />
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
            const inner = pointAt(fraction, R - 9);
            const outer = pointAt(fraction, R + 3);
            return (
              <line
                key={fraction}
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                stroke="currentColor"
                strokeOpacity="0.5"
                strokeWidth="1.5"
                className="text-body"
              />
            );
          })}
          <line
            x1={CX}
            y1={CY}
            x2={needle.x}
            y2={needle.y}
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            className="text-accent"
            data-testid="bridge-scaling-needle"
          />
          <circle cx={CX} cy={CY} r="4" className="fill-current text-accent" />
          <text x="12" y="112" className="fill-current text-[11px] text-body">
            0
          </text>
          <text x={CX} y="16" textAnchor="middle" className="fill-current text-[11px] text-body">
            {Math.round(DIAL_TOP / 2)}
          </text>
          <text x="196" y="112" textAnchor="end" className="fill-current text-[11px] text-body">
            {DIAL_TOP}
          </text>
        </svg>

        <div className="min-w-[190px] flex-1">
          <label htmlFor="bridge-scaling-raw" className="block text-[12px] font-mono text-body">
            sensor reading (counts, 0–{DIAL_TOP})
          </label>
          <input
            id="bridge-scaling-raw"
            data-testid="bridge-scaling-raw"
            type="range"
            min={0}
            max={DIAL_TOP}
            step={DIAL_STEP}
            value={raw}
            onChange={(event) => setRaw(Number(event.target.value))}
            className="mt-1 w-full accent-[var(--accent)]"
          />
          <dl className="mt-2 space-y-0.5 text-[13px] leading-snug">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-body">fraction = {shown.raw.toFixed(1)} / {DIAL_TOP}</dt>
              <dd className="font-mono font-bold text-ink" data-testid="bridge-scaling-fraction">
                {formatFraction(shown.fraction)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-body">volts = fraction × 5.0</dt>
              <dd className="font-mono font-bold text-ink" data-testid="bridge-scaling-volts">
                {formatVolts(shown.volts)} V
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-body">command = fraction × {COMMAND_TOP}</dt>
              <dd className="font-mono font-bold text-ink" data-testid="bridge-scaling-command">
                {formatCommand(shown.command)}
              </dd>
            </div>
          </dl>
        </div>
      </div>
      <p className="mt-2 text-[12px] leading-snug text-body">
        Drag the reading. The fraction of the sensor's top is the same fraction of the answer's top —
        one reading, two dials, so the two functions cannot share a constant.
      </p>
    </div>
  );
}

/** The sweep the dial draws, exported so a test can check the arc against the needle. */
export const DIAL_DRAWN_SWEEP = NEEDLE_SWEEP;
export const DIAL_DRAWN_START = NEEDLE_START;
