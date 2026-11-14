import { useState } from 'react';
import type { ReactElement } from 'react';
import {
  COMMAND_TOP,
  DIAL_STEP,
  DIAL_TOP,
  VOLT_TOP,
  formatCommand,
  formatFraction,
  formatVolts,
  needleAngle,
  reading,
} from './scalingDials';

/**
 * P.9's Bridge Notes, as two dials you can drag (`app/src/bridges/ScalingDialsVisual.tsx`).
 *
 * The lesson's last paragraph says scaling is *the fraction of my top, times the top of yours*, and
 * then checks it at three readings. A learner can read that sentence and still not know where
 * `511.5` sits; two needles that swing to the same fraction of their own scales answer that without
 * adding a word of prose — and the second scale is the whole point, so it is drawn, not implied.
 *
 * Both dials are the same control: dragging either one moves the other, and each has its own slider
 * as the keyboard and screen-reader way in. Everything drawn here comes from `scalingDials.ts`, so
 * the needles, the numbers and the model test cannot drift apart. Each SVG is a `role="img"` named
 * with its own reading. This chunk is lazy (`bridgeNotesVisual.tsx`), so a lesson without a visual
 * never downloads it.
 */

const CX = 104;
const CY = 100;
const R = 72;
const TICKS = [0, 0.25, 0.5, 0.75, 1];
const LABEL_ID = 'bridge-scaling-reading';

/** A point on a dial's arc, in the drawing's own 208×120 box. */
function pointAt(fraction: number, radius: number): { x: number; y: number } {
  const radians = (needleAngle(fraction) * Math.PI) / 180;
  return { x: CX + radius * Math.sin(radians), y: CY - radius * Math.cos(radians) };
}

function arcPath(radius: number): string {
  const start = pointAt(0, radius);
  const end = pointAt(1, radius);
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 1 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

const tickLines = TICKS.map((fraction) => {
  const inner = pointAt(fraction, R - 9);
  const outer = pointAt(fraction, R + 3);
  return { fraction, x1: inner.x, y1: inner.y, x2: outer.x, y2: outer.y };
});

/** One gauge: the arc, its ticks, its needle and the numbers that name its ends. */
function Dial({ name, top, mid, fraction }: { name: string; top: number; mid: string; fraction: number }) {
  const tip = pointAt(fraction, R - 12);
  return (
    <svg
      viewBox="0 0 208 120"
      width="208"
      height="120"
      role="img"
      aria-labelledby={`${LABEL_ID}-${name}`}
      className="block shrink-0"
    >
      <title id={`${LABEL_ID}-${name}`}>
        {`${name} dial, 0 to ${top}: the needle sits at ${formatFraction(fraction)} of its travel.`}
      </title>
      <path d={arcPath(R)} fill="none" stroke="currentColor" strokeOpacity="0.28" strokeWidth="6" strokeLinecap="round" className="text-body" />
      {tickLines.map((tick) => (
        <line
          key={tick.fraction}
          x1={tick.x1}
          y1={tick.y1}
          x2={tick.x2}
          y2={tick.y2}
          stroke="currentColor"
          strokeOpacity="0.5"
          strokeWidth="1.5"
          className="text-body"
        />
      ))}
      <line
        x1={CX}
        y1={CY}
        x2={tip.x}
        y2={tip.y}
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        className="text-accent"
        data-testid={`bridge-scaling-needle-${name}`}
      />
      <circle cx={CX} cy={CY} r="4" className="fill-current text-accent" />
      <text x="12" y="112" className="fill-current text-[11px] text-body">
        0
      </text>
      <text x={CX} y="16" textAnchor="middle" className="fill-current text-[11px] text-body">
        {mid}
      </text>
      <text x="196" y="112" textAnchor="end" className="fill-current text-[11px] text-body">
        {top}
      </text>
    </svg>
  );
}

export default function ScalingDialsVisual(): ReactElement {
  // The sensor's reading is the source of truth: the answer dial is the same fraction of 5.0 V, so
  // setting it back-computes the counts rather than keeping a second copy of the state.
  const [raw, setRaw] = useState<number>(DIAL_TOP / 2);
  const shown = reading(raw);
  const voltsValue = Number(formatVolts(shown.volts));

  return (
    <div className="mt-3 rounded-lg border bg-panel-2 px-3 py-3" data-testid="bridge-scaling">
      <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
        <div className="min-w-[208px] flex-1">
          <Dial name="counts" top={DIAL_TOP} mid="512" fraction={shown.fraction} />
          <label htmlFor="bridge-scaling-raw" className="block whitespace-nowrap text-[12px] font-mono text-body">
            counts (0–{DIAL_TOP})
          </label>
          <input
            id="bridge-scaling-raw"
            data-testid="bridge-scaling-raw"
            type="range"
            min={0}
            max={DIAL_TOP}
            step={DIAL_STEP}
            value={shown.raw}
            aria-label={`sensor reading in counts, 0 to ${DIAL_TOP}`}
            onChange={(event) => setRaw(Number(event.target.value))}
            className="mt-1 w-full accent-[var(--accent)]"
          />
        </div>

        <div className="min-w-[208px] flex-1">
          <Dial name="volts" top={VOLT_TOP} mid="2.5" fraction={shown.fraction} />
          <label htmlFor="bridge-scaling-volt-dial" className="block whitespace-nowrap text-[12px] font-mono text-body">
            volts (0–{VOLT_TOP}.0)
          </label>
          <input
            id="bridge-scaling-volt-dial"
            data-testid="bridge-scaling-volt-dial"
            type="range"
            min={0}
            max={VOLT_TOP}
            step={0.01}
            value={voltsValue}
            aria-label={`answer in volts, 0 to ${VOLT_TOP}`}
            onChange={(event) => setRaw((Number(event.target.value) / VOLT_TOP) * DIAL_TOP)}
            className="mt-1 w-full accent-[var(--accent)]"
          />
        </div>

        <dl className="min-w-[190px] flex-1 text-[13px] leading-snug" aria-live="polite">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-body">fraction = {shown.raw.toFixed(1)} / {DIAL_TOP}</dt>
            <dd className="font-mono font-bold text-ink" data-testid="bridge-scaling-fraction">
              {formatFraction(shown.fraction)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-body">volts = fraction × {VOLT_TOP}.0</dt>
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
      <p className="mt-2 text-[12px] leading-snug text-body">
        Drag either dial. The fraction of the sensor's top is the same fraction of the answer's top —
        one reading, two dials, so the two functions cannot share a constant.
      </p>
    </div>
  );
}
