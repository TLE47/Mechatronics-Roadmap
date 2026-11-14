import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactElement } from 'react';
import {
  COMMAND_TOP,
  DIAL_STEP,
  DIAL_TOP,
  NEEDLE_START,
  NEEDLE_SWEEP,
  VOLT_TOP,
  formatCommand,
  formatFraction,
  formatVolts,
  needleAngle,
  reading,
} from './scalingDials';

/**
 * P.9's Bridge Notes, as two dials you grab by the needle (`app/src/bridges/ScalingDialsVisual.tsx`).
 *
 * The lesson's last paragraph says scaling is *the fraction of my top, times the top of yours*, and
 * then checks it at three readings. A learner can read that sentence and still not know where
 * `511.5` sits; two needles that swing to the same fraction of their own scales answer that without
 * adding a word of prose — and the second scale is the whole point, so it is drawn, not implied.
 *
 * A paragraph cannot make that feel like a meter, so the drawing is a control: press anywhere on a
 * dial and the needle follows your finger, a band of accent ink filling the arc behind it, and the
 * bridge between the dials carries the same fraction across in one and the same stride. The three
 * marked fractions pull like a notch within 1.2% so the reading *lands* instead of hovering.
 *
 * Then there is something to do with it. A mark is drawn on both arcs; sweep the needle onto it and
 * the card flashes, the mark advances, and the fraction you found is read out on both scales — five
 * marks, and the sentence the lesson is making is the thing you keep doing.
 *
 * Keyboard and screen readers get the same control as a range slider under each dial, so nothing
 * here is pointer-only, and both paths run through `move` — which is also where a mark is scored, so
 * the chase respects a reader who never touches a mouse. Every number drawn here comes from
 * `scalingDials.ts`, so the needles, the numbers and the model test cannot drift apart. Each SVG is
 * a `role="img"` named with its own reading. This chunk is lazy (`bridgeNotesVisual.tsx`), so a
 * lesson without a visual never downloads it.
 */

const CX = 104;
const CY = 100;
const R = 72;
const TICKS = [0, 0.25, 0.5, 0.75, 1];
/** The five marks of the chase, in the order they are drawn. */
const MARKS = [0.375, 0.75, 0.125, 0.5, 0.875];
/** How close counts as landed, and how far away undoes it, in fractions of a dial's top. */
const LANDED = 0.006;
/** The magnetic notch: within this much travel a drag snaps to a marked fraction. */
const NOTCH = 0.012;
const LABEL_ID = 'bridge-scaling-reading';

/** A point on a dial's arc, in the drawing's own 208×120 box. */
function pointAt(fraction: number, radius: number): { x: number; y: number } {
  const radians = (needleAngle(fraction) * Math.PI) / 180;
  return { x: CX + radius * Math.sin(radians), y: CY - radius * Math.cos(radians) };
}

/** The whole arc, drawn down to `fraction` of its travel: the ink behind the needle. */
function arcTo(radius: number, fraction: number): string {
  const start = pointAt(0, radius);
  const end = pointAt(fraction, radius);
  // 240° of sweep is a large arc past three quarters of the travel, and the flag has to follow.
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${
    fraction > 0.75 ? 1 : 0
  } 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

const tickLines = TICKS.map((fraction) => {
  const inner = pointAt(fraction, R - 9);
  const outer = pointAt(fraction, R + 3);
  return { fraction, x1: inner.x, y1: inner.y, x2: outer.x, y2: outer.y };
});

interface DialProps {
  name: string;
  top: number;
  mid: string;
  fraction: number;
  mark: number;
  onSweep: (fraction: number) => void;
}

/** One gauge: the arc and its ink, its ticks and marks, its needle, and the numbers at its ends. */
function Dial({ name, top, mid, fraction, mark, onSweep }: DialProps): ReactElement {
  const svg = useRef<SVGSVGElement | null>(null);
  const [gripping, setGripping] = useState(false);
  const tip = pointAt(fraction, R - 12);

  /** Where a pointer is on this dial, as a fraction of the needle's travel. */
  const sweep = (event: ReactPointerEvent<SVGSVGElement>): void => {
    const box = svg.current;
    if (!box) return;
    const point = box.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(box.getScreenCTM()?.inverse());
    const degrees = (Math.atan2(local.x - CX, CY - local.y) * 180) / Math.PI;
    // A pointer in the 120° gap below a dial pins the needle to the nearer stop rather than wrapping.
    onSweep((degrees - NEEDLE_START) / NEEDLE_SWEEP);
  };

  return (
    <svg
      ref={svg}
      viewBox="0 0 208 120"
      role="img"
      aria-labelledby={`${LABEL_ID}-${name}`}
      className={`block w-full max-w-[230px] shrink-0 touch-none select-none ${
        gripping ? 'cursor-grabbing' : 'cursor-grab'
      }`}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setGripping(true);
        sweep(event);
      }}
      onPointerMove={(event) => {
        if (gripping) sweep(event);
      }}
      onPointerUp={() => setGripping(false)}
      onPointerCancel={() => setGripping(false)}
    >
      <title id={`${LABEL_ID}-${name}`}>
        {`${name} dial, 0 to ${top}: the needle sits at ${formatFraction(fraction)} of its travel.`}
      </title>
      {/* The track and the ticks are the gauge's own scale, and a scale a reader cannot resolve is
          not a scale: both take the muted ink at full strength, which clears 3:1 in every palette,
          rather than the body ink at a third of it, which measured 2.03:1 in the dark one. */}
      <path
        d={arcTo(R, 1)}
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        className="text-muted"
      />
      {fraction > 0.004 && (
        <path
          d={arcTo(R, fraction)}
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          className="bridge-glow text-accent"
        />
      )}
      {tickLines.map((tick) => (
        <line
          key={tick.fraction}
          x1={tick.x1}
          y1={tick.y1}
          x2={tick.x2}
          y2={tick.y2}
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-muted"
        />
      ))}
      {MARKS.map((each) => {
        const spot = pointAt(each, R + 9);
        const live = each === mark;
        return (
          <circle
            key={each}
            cx={spot.x}
            cy={spot.y}
            r={live ? 4 : 2}
            className={`fill-current text-accent ${live ? 'bridge-mark' : ''}`}
            data-mark={each}
          />
        );
      })}
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
      <circle cx={tip.x} cy={tip.y} r="5" className="fill-current text-accent bridge-glow" />
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
  const [marks, setMarks] = useState(0);
  const [landed, setLanded] = useState(false);
  const shown = reading(raw);
  const mark = MARKS[marks % MARKS.length];
  const landedNow = marks > 0 && Math.abs(shown.fraction - MARKS[(marks - 1) % MARKS.length]) < LANDED;

  /**
   * Every move, from a graze of the pointer or from a key on a slider, lands here: the reading is
   * set and the mark is scored, so the chase cannot be driven by one input and not the other.
   */
  const move = (next: number): void => {
    const value = Math.min(DIAL_TOP, Math.max(0, next));
    setRaw(value);
    const at = Math.abs(value / DIAL_TOP - mark) < LANDED;
    if (at && !landed) {
      setMarks(marks + 1);
      setLanded(true);
      return;
    }
    if (!at && Math.abs(value / DIAL_TOP - mark) > LANDED * 3) setLanded(false);
  };

  /** A drag pulls toward the live mark and the halfway notch, the way a meter has detents. */
  const sweepTo = (fraction: number): void => {
    const notch = [mark, 0.5].find((each) => Math.abs(each - fraction) < NOTCH) ?? fraction;
    move(notch * DIAL_TOP);
  };

  return (
    <div
      className="relative mt-3 overflow-hidden rounded-lg border bg-panel-2 px-3 py-3"
      data-testid="bridge-scaling"
    >
      {landedNow && (
        <span key={marks} aria-hidden="true" className="bridge-flash pointer-events-none absolute inset-0" />
      )}
      <div className="relative flex flex-wrap items-start gap-x-5 gap-y-4">
        <div className="min-w-[190px] flex-1">
          <Dial
            name="counts"
            top={DIAL_TOP}
            mid="512"
            fraction={shown.fraction}
            mark={mark}
            onSweep={sweepTo}
          />
          <label
            htmlFor="bridge-scaling-raw"
            className="block whitespace-nowrap text-[12px] font-mono text-body"
          >
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
            onChange={(event) => move(Number(event.target.value))}
            className="mt-1 w-full accent-[var(--accent)]"
          />
        </div>

        <div className="min-w-[190px] flex-1">
          <Dial
            name="volts"
            top={VOLT_TOP}
            mid="2.5"
            fraction={shown.fraction}
            mark={mark}
            onSweep={sweepTo}
          />
          <label
            htmlFor="bridge-scaling-volt-dial"
            className="block whitespace-nowrap text-[12px] font-mono text-body"
          >
            volts (0–{VOLT_TOP}.0)
          </label>
          <input
            id="bridge-scaling-volt-dial"
            data-testid="bridge-scaling-volt-dial"
            type="range"
            min={0}
            max={VOLT_TOP}
            step={0.01}
            value={Number(formatVolts(shown.volts))}
            aria-label={`answer in volts, 0 to ${VOLT_TOP}`}
            onChange={(event) => move((Number(event.target.value) / VOLT_TOP) * DIAL_TOP)}
            className="mt-1 w-full accent-[var(--accent)]"
          />
        </div>
      </div>

      {/* The bridge: one fraction, carried across from the sensor's top to the answer's. */}
      <div className="relative mt-4">
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-panel-3">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-75"
            style={{ width: `${shown.fraction * 100}%` }}
          />
        </div>
        <span
          aria-hidden="true"
          className="bridge-glow absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent transition-[left] duration-75"
          style={{ left: `${shown.fraction * 100}%` }}
        />
        <div className="mt-1 text-right text-[11px] font-mono text-body">
          {DIAL_TOP} counts · {VOLT_TOP}.00 V
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2" aria-live="polite">
        {[
          ['fraction', formatFraction(shown.fraction), 'bridge-scaling-fraction'],
          ['volts', `${formatVolts(shown.volts)} V`, 'bridge-scaling-volts'],
          ['command', formatCommand(shown.command), 'bridge-scaling-command'],
        ].map(([label, value, id]) => (
          <div key={id}>
            <dt className="text-[11px] uppercase tracking-wide text-body">{label}</dt>
            <dd
              key={value}
              className={`bridge-pop font-mono font-bold text-ink ${
                id === 'bridge-scaling-fraction' ? 'text-[19px]' : 'text-[15px]'
              }`}
              data-testid={id}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <div
        role="status"
        data-testid="bridge-scaling-chase"
        className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-full bg-panel-3 px-2.5 py-1 text-[11px] font-mono text-ink"
      >
        <span>
          {marks >= MARKS.length * 2
            ? 'every mark, twice'
            : `mark ${(marks % MARKS.length) + 1}/${MARKS.length} · put the needle on ${formatFraction(mark)}`}
        </span>

      </div>

      <p className="mt-2 text-[12px] leading-snug text-body">
        Drag a needle, or use a slider's keys. One fraction of each dial's top: one reading, two
        answers — so the two functions cannot share a constant.
      </p>
    </div>
  );
}
