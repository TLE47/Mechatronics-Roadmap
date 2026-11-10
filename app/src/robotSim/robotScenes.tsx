/**
 * The Robot tab's arenas (`app/src/robotSim/robotScenes.tsx`).
 *
 * One drawing per lesson, all read from the same reading the readout shows. Every moving part is
 * placed from a real value and moves with a CSS transition, so the robot travels between readings
 * instead of teleporting; the numbers themselves stay in the tiles under the arena. A target flag
 * comes from the mission's own target, never from a second set of numbers, and a run that never
 * reached it leaves the robot short of the flag rather than snapping it into place.
 *
 * The file is deliberately drawing-only: `RobotStage.tsx` owns the frame, the readouts and the
 * data attributes the browser suite reads, and `robotMission.ts` owns the values.
 */
import { useEffect, useRef, useState } from 'react';
import type { RobotReading } from './model';
import { formatNumber, type RobotProgress, type RobotTargetValue } from './robotMission';
import { RobotSprite, type RobotMood } from './RobotSprite';

export interface SceneProps {
  reading: RobotReading | null;
  progress: RobotProgress;
  highlight: keyof RobotReading | null;
  motion: boolean;
  running: boolean;
}

export function numberOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function targetOf(progress: RobotProgress, key: keyof RobotReading): RobotTargetValue | null {
  return progress.rows.find((row) => row.target.key === key)?.target.target ?? null;
}

/** A target's number, for the drawings that need a scale; the fallback is only a layout guard. */
export function targetNumber(progress: RobotProgress, key: keyof RobotReading, fallback: number): number {
  const value = targetOf(progress, key);
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function metOf(progress: RobotProgress, key: keyof RobotReading): boolean {
  return progress.rows.find((row) => row.target.key === key)?.met ?? false;
}

/**
 * The first value a run showed. It anchors a track so a +25 tick update fills the drawing instead
 * of being a quarter of a millimetre on a 0–1000 scale; a reset clears the reading, which clears the
 * anchor, so the next run gets its own start.
 */
export function useAnchor(value: number | null): number | null {
  const [anchor, setAnchor] = useState<number | null>(null);
  useEffect(() => {
    if (value === null) setAnchor(null);
    else setAnchor((current) => (current === null ? value : current));
  }, [value]);
  return anchor;
}

/** The one motion the stage reports as `data-robot-position`: how far into its own travel it is. */
export function primaryProgress(
  lessonId: string,
  reading: RobotReading | null,
  progress: RobotProgress,
  anchor: number | null
): number {
  if (lessonId === 'P.1') {
    const ticks = numberOrNull(reading?.encoderTicks);
    const target = targetNumber(progress, 'encoderTicks', 425);
    if (ticks === null) return 0;
    const start = anchor ?? Math.min(ticks, target);
    if (Math.abs(target - start) < 1e-9) return 1;
    return clamp((ticks - start) / (target - start), 0, 1);
  }
  if (lessonId === 'P.3') {
    const value = numberOrNull(reading?.clampedHigh) ?? numberOrNull(reading?.rawHigh);
    return value === null ? 0 : clamp(value / 255, 0, 1);
  }
  if (lessonId === 'P.4') {
    const expected = targetOf(progress, 'clampedCommands');
    const total = Array.isArray(expected) ? expected.length : 6;
    return clamp((reading?.clampedCommands?.length ?? 0) / Math.max(total, 1), 0, 1);
  }
  if (lessonId === 'P.5') {
    const target = targetNumber(progress, 'positionM', 1.2);
    const position = numberOrNull(reading?.positionM);
    return position === null ? 0 : clamp(position / target, 0, 1);
  }
  return 0;
}

/** The target a scene is moving toward, as a chip reads it. */
export function primaryTargetLabel(lessonId: string, progress: RobotProgress): string {
  const key: keyof RobotReading =
    lessonId === 'P.1'
      ? 'encoderTicks'
      : lessonId === 'P.3'
        ? 'clampedHigh'
        : lessonId === 'P.4'
          ? 'clampedCommands'
          : 'positionM';
  const value = targetOf(progress, key);
  const row = progress.rows.find((entry) => entry.target.key === key);
  if (!row || value === null) return '—';
  if (Array.isArray(value)) return '[' + value.join(', ') + ']';
  if (typeof value === 'boolean') return value ? 'on' : 'off';
  if (typeof value === 'number') {
    return formatNumber(value) + (row.target.unit ? ' ' + row.target.unit : '');
  }
  return value;
}

/** The robot's line in its speech bubble: short enough to fit over the arena at 11 units. */
export function bubbleMessage(lessonId: string, reading: RobotReading | null, complete: boolean): string {
  if (complete) return 'That’s the goal!';
  if (!reading) return 'Ready when you are';
  if (lessonId === 'P.1') return 'Wheels rolling…';
  if (lessonId === 'P.3') return 'Pulling into range…';
  if (lessonId === 'P.4') return 'Next crate!';
  if (lessonId === 'P.5') return 'Scooting to dock…';
  return 'Watching main.py';
}

/** The arena's own dark instrument face, the same in every palette as the app's plots. */
export function ArenaBackground() {
  return (
    <>
      <defs>
        <pattern id="robot-grid" width="18" height="18" patternUnits="userSpaceOnUse">
          <path d="M 18 0 L 0 0 0 18" fill="none" stroke="#17263d" strokeWidth="1" />
        </pattern>
        <linearGradient id="robot-floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0a1729" />
          <stop offset="1" stopColor="#060d19" />
        </linearGradient>
        <radialGradient id="robot-glow">
          <stop offset="0" stopColor="#38bdf8" stopOpacity="0.3" />
          <stop offset="1" stopColor="#38bdf8" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="360" height="210" fill="url(#robot-floor)" />
      <rect width="360" height="210" fill="url(#robot-grid)" />
      <circle cx="180" cy="132" r="120" fill="url(#robot-glow)" opacity="0.35" />
    </>
  );
}

/** The little speech bubble, centred so it never collides with a scene's own gauges. */
function Bubble({ text }: { text: string }) {
  return (
    <g aria-hidden="true">
      <rect x="103" y="38" width="154" height="26" rx="13" fill="#0c1e34" stroke="#2a4566" />
      <path d="M 172 64 l 8 8 l 8 -8 Z" fill="#0c1e34" stroke="#2a4566" strokeWidth="1" />
      <text x="180" y="55" textAnchor="middle" fill="#dbeafe" fontSize="11" fontFamily="var(--font-round)">
        {text}
      </text>
    </g>
  );
}

function Spotlight({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <circle
      className="robot-spot"
      cx={cx}
      cy={cy}
      r={r}
      fill="none"
      stroke="#38bdf8"
      strokeWidth="1.5"
      strokeDasharray="3 3"
    />
  );
}

function SpeedLines({ x, y }: { x: number; y: number }) {
  const left = Math.max(10, x - 28);
  return (
    <g className="robot-speed" stroke="#38bdf8" strokeWidth="1.6" strokeLinecap="round" opacity="0.55">
      <line x1={left} y1={y - 8} x2={left + 12} y2={y - 8} />
      <line x1={left - 4} y1={y} x2={left + 12} y2={y} />
      <line x1={left} y1={y + 8} x2={left + 14} y2={y + 8} />
    </g>
  );
}

/** P.1 — the rover drives along a track whose ends are the run's own start and the lesson's target. */
export function P1Scene({ reading, progress, highlight }: SceneProps) {
  const ticks = numberOrNull(reading?.encoderTicks);
  const target = targetNumber(progress, 'encoderTicks', 425);
  const anchor = useAnchor(ticks);
  const start = anchor ?? Math.min(ticks ?? target, target);
  const span = Math.abs(target - start);
  const pad = Math.max(6, span * 0.14);
  const lo = Math.min(start, target) - pad;
  const hi = Math.max(start, target) + pad;
  const xFor = (value: number) => 54 + clamp((value - lo) / (hi - lo || 1), 0, 1) * 252;
  const x = xFor(ticks ?? start);
  const startX = xFor(start);
  const targetX = xFor(target);
  const met = metOf(progress, 'encoderTicks');
  const mode = reading?.mode ?? null;
  const battery = numberOrNull(reading?.batteryVolts);
  const batteryFill = battery === null ? 0 : clamp(battery / 14, 0, 1) * 24;
  const estop = reading?.eStop;
  const complete = progress.complete;
  const mood: RobotMood = complete && reading ? 'happy' : reading ? 'working' : 'idle';
  const showStart = Math.abs(targetX - startX) > 46;

  return (
    <g>
      <rect x="14" y="12" width="72" height="20" rx="10" fill="#0b1a2e" stroke="#233a57" />
      <circle cx="25" cy="22" r="3.6" fill={mode === 'ACTIVE' ? '#34d399' : mode ? '#fbbf24' : '#64748b'} />
      <text x="34" y="25.5" fill="#dbeafe" fontSize="10" fontFamily="var(--font-round)">
        {mode ?? 'mode —'}
      </text>

      <rect x="92" y="12" width="86" height="20" rx="10" fill="#0b1a2e" stroke="#233a57" />
      <rect x="101" y="18" width="26" height="8" rx="2.5" fill="#1b3552" />
      <rect x="102" y="19" width={batteryFill} height="6" rx="2" fill="#34d399" />
      <rect x="127" y="19.5" width="2.5" height="5" rx="1" fill="#34d399" />
      <text x="135" y="25.5" fill="#dbeafe" fontSize="10" fontFamily="var(--font-round)">
        {battery === null ? '— V' : formatNumber(battery) + ' V'}
      </text>

      <rect
        x="268"
        y="12"
        width="78"
        height="20"
        rx="10"
        fill="#0b1a2e"
        stroke={estop === true ? '#7f1d1d' : '#233a57'}
      />
      <text
        x="307"
        y="25.5"
        textAnchor="middle"
        fill={estop === true ? '#fda4af' : estop === false ? '#6ee7b7' : '#94a3b8'}
        fontSize="9.5"
        fontFamily="var(--font-round)"
      >
        {estop === true ? 'E-STOP ON' : estop === false ? 'E-STOP CLEAR' : 'E-STOP —'}
      </text>

      <Bubble text={bubbleMessage('P.1', reading, complete)} />

      <text x="16" y="92" fill="#7f93ad" fontSize="9.5" fontFamily="var(--font-round)" letterSpacing="1.2">
        ENCODER TRACK
      </text>
      <line x1="54" y1="150" x2="306" y2="150" stroke="#2c4462" strokeWidth="4" strokeLinecap="round" />
      {[0, 1, 2, 3, 4].map((index) => (
        <line
          key={index}
          x1={54 + index * 63}
          y1="145"
          x2={54 + index * 63}
          y2="155"
          stroke="#3d5879"
          strokeWidth="1.5"
        />
      ))}
      <line
        x1={Math.min(startX, x)}
        y1="150"
        x2={Math.max(startX, x)}
        y2="150"
        stroke="#0ea5e9"
        strokeWidth="4"
        strokeLinecap="round"
      />

      <g>
        <line x1={targetX} y1="150" x2={targetX} y2="96" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" />
        <path
          d={`M ${targetX} 98 h 22 l -6 6 l 6 6 h -22 Z`}
          fill={met ? '#34d399' : '#fbbf24'}
          opacity="0.92"
        />
        <text x={targetX} y="170" textAnchor="middle" fill="#dbeafe" fontSize="10" fontFamily="var(--font-round)">
          {formatNumber(target)} ticks
        </text>
        {highlight === 'encoderTicks' && <Spotlight cx={targetX} cy={150} r={18} />}
      </g>
      {showStart && (
        <text x={startX} y="170" textAnchor="middle" fill="#7f93ad" fontSize="9.5" fontFamily="var(--font-round)">
          start
        </text>
      )}

      {met && reading && <circle cx={x} cy="126" r="28" fill="url(#robot-glow)" />}
      <ellipse cx={x} cy="144" rx="16" ry="4" fill="#020617" opacity="0.6" />
      {reading && !met && <SpeedLines x={x} y={126} />}
      <g data-testid="robot-mover" className="robot-mover" style={{ transform: `translate(${x}px, 126px)` }}>
        <g transform="scale(27)">
          <RobotSprite heading={1} mood={mood} />
        </g>
      </g>
      {highlight === 'mode' && <Spotlight cx={50} cy={22} r={28} />}
      {highlight === 'batteryVolts' && <Spotlight cx={135} cy={22} r={28} />}
      {highlight === 'eStop' && <Spotlight cx={307} cy={22} r={32} />}
    </g>
  );
}

interface LaneProps {
  label: string;
  y: number;
  raw: number | null;
  clamped: number | null;
  highlighted: boolean;
  badge: string;
}

function CommandLane({ label, y, raw, clamped, highlighted, badge }: LaneProps) {
  const laneX = (value: number | null) =>
    value === null ? null : 58 + clamp(value / 255, 0, 1) * 244;
  const rawX = (value: number | null) =>
    value === null ? null : 58 + clamp(value / 255, -0.12, 1.12) * 244;
  const rawAt = rawX(raw);
  const at = laneX(clamped);
  const outside = raw !== null && (raw < 0 || raw > 255);

  return (
    <g>
      <text x="14" y={y + 4} fill="#9fb0c9" fontSize="10" fontFamily="var(--font-round)">
        {label}
      </text>
      <rect x="58" y={y - 11} width="244" height="22" rx="11" fill="#071a2c" stroke="#233a57" />
      <rect x="60" y={y - 9} width="240" height="18" rx="9" fill="#34d399" opacity="0.08" />
      <line x1="58" y1={y} x2="302" y2={y} stroke="#223a56" strokeWidth="1" />
      {rawAt !== null && at !== null && outside && (
        <line x1={rawAt} y1={y} x2={at} y2={y} stroke="#fbbf24" strokeDasharray="2 2" opacity="0.65" />
      )}
      {rawAt !== null && (
        <circle cx={rawAt} cy={y} r="7" fill="none" stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="2 2" opacity="0.8" />
      )}
      {at !== null && (
        <g className="robot-slide" style={{ transform: `translate(${at}px, ${y}px)` }}>
          <circle r="8.5" fill="#38bdf8" stroke="#0c4a6e" strokeWidth="2" />
          <circle r="2.5" fill="#e0f2fe" />
        </g>
      )}
      {at !== null && (
        <text x={at} y={y - 16} textAnchor="middle" fill="#dbeafe" fontSize="10" fontFamily="var(--font-round)">
          {clamped === null ? '—' : formatNumber(clamped)}
        </text>
      )}
      {highlighted && at !== null && <Spotlight cx={at} cy={y} r={16} />}
      <text x="58" y={y + 26} fill="#64748b" fontSize="8.5" fontFamily="var(--font-round)">
        {/* the raw command, so the pull into range reads as one move */}
        {raw === null ? '—' : formatNumber(raw) + ' raw'}
      </text>
      <text x="310" y={y + 4} textAnchor="end" fill={badge === 'in range' ? '#6ee7b7' : '#fbbf24'} fontSize="9" fontFamily="var(--font-round)">
        {badge}
      </text>
    </g>
  );
}

/** P.3 — two out-of-range commands are pulled into a safe corridor, and the e-stop cuts the output. */
export function P3Scene({ reading, progress, highlight }: SceneProps) {
  const highRaw = numberOrNull(reading?.rawHigh);
  const high = numberOrNull(reading?.clampedHigh);
  const lowRaw = numberOrNull(reading?.rawLow);
  const low = numberOrNull(reading?.clampedLow);
  const safe = numberOrNull(reading?.safeOutput);
  const estop = reading?.eStopPressed === true;
  const safeFill = safe === null ? 0 : clamp(safe / 255, 0, 1) * 244;
  const metHigh = metOf(progress, 'clampedHigh');
  const metLow = metOf(progress, 'clampedLow');
  const complete = progress.complete;

  return (
    <g>
      <Bubble text={bubbleMessage('P.3', reading, complete)} />
      <text x="16" y="28" fill="#7f93ad" fontSize="9.5" fontFamily="var(--font-round)" letterSpacing="1.2">
        SAFE CORRIDOR 0–255
      </text>
      <rect x="270" y="12" width="76" height="20" rx="10" fill={estop ? '#3b1414' : '#0b1a2e'} stroke={estop ? '#7f1d1d' : '#233a57'} />
      <text x="308" y="25.5" textAnchor="middle" fill={estop ? '#fda4af' : '#94a3b8'} fontSize="9.5" fontFamily="var(--font-round)">
        {estop ? 'E-STOP ACTIVE' : reading ? 'E-STOP CLEAR' : 'E-STOP —'}
      </text>

      <CommandLane
        label="HIGH"
        y={96}
        raw={highRaw}
        clamped={high}
        highlighted={highlight === 'clampedHigh'}
        badge={high === null ? '—' : metHigh ? 'in range' : 'clamping'}
      />
      <CommandLane
        label="LOW"
        y={134}
        raw={lowRaw}
        clamped={low}
        highlighted={highlight === 'clampedLow'}
        badge={low === null ? '—' : metLow ? 'in range' : 'clamping'}
      />

      <text x="58" y="150" fill="#64748b" fontSize="8.5" fontFamily="var(--font-round)">0</text>
      <text x="302" y="150" textAnchor="end" fill="#64748b" fontSize="8.5" fontFamily="var(--font-round)">255</text>

      <text x="14" y="176" fill="#9fb0c9" fontSize="10" fontFamily="var(--font-round)">OUTPUT</text>
      <rect x="58" y="168" width="244" height="10" rx="5" fill="#071a2c" stroke="#233a57" />
      <rect x="58" y="168" width={safeFill} height="10" rx="5" fill={estop ? '#f59e0b' : '#34d399'} />
      <text x="310" y="177" textAnchor="end" fill="#dbeafe" fontSize="10" fontFamily="var(--font-round)">
        {safe === null ? '—' : formatNumber(safe)}
      </text>
      {estop && safe === 0 && (
        <g>
          <circle cx="46" cy="173" r="7" fill="#052e2b" stroke="#34d399" strokeWidth="1.5" />
          <path d="M 43 173 l 2 2 l 4 -4" fill="none" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" />
        </g>
      )}
      {highlight === 'safeOutput' && <Spotlight cx={58 + safeFill} cy={173} r={14} />}
    </g>
  );
}

/** Remember which crate just arrived, so the newest one glows for a moment. */
function useNewestIndex(count: number): number | null {
  const previous = useRef(0);
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => {
    if (count > previous.current) {
      setActive(count - 1);
      previous.current = count;
      const timer = setTimeout(() => setActive(null), 900);
      return () => clearTimeout(timer);
    }
    previous.current = count;
    return undefined;
  }, [count]);
  return active;
}

/** P.4 — six crates ride the belt; each appears as the loop appends it, then settles clamped. */
export function P4Scene({ reading, progress, highlight }: SceneProps) {
  const raw = reading?.rawCommands ?? [];
  const clamped = reading?.clampedCommands ?? [];
  const total = numberOrNull(reading?.totalCommand);
  const mean = numberOrNull(reading?.meanCommand);
  const meanTarget = targetNumber(progress, 'meanCommand', 0);
  const active = useNewestIndex(clamped.length);
  const slots = Math.max(6, raw.length, clamped.length);
  const slotX = (index: number) => 42 + index * (276 / Math.max(slots - 1, 1));
  const meanFill = mean === null ? 0 : clamp(mean / 255, 0, 1) * 54;
  const meanMark = meanTarget === 0 ? 0 : clamp(meanTarget / 255, 0, 1) * 54;

  return (
    <g>
      <Bubble text={bubbleMessage('P.4', reading, progress.complete)} />
      <g>
        <rect x="16" y="12" width="92" height="20" rx="10" fill="#0b1a2e" stroke="#233a57" />
        <text x="26" y="25.5" fill="#9fb0c9" fontSize="9.5" fontFamily="var(--font-round)">TOTAL</text>
        <text x="72" y="26" fill="#dbeafe" fontSize="12" fontFamily="var(--font-round)">
          {total === null ? '—' : formatNumber(total)}
        </text>
        <rect x="118" y="12" width="118" height="20" rx="10" fill="#0b1a2e" stroke="#233a57" />
        <text x="126" y="25.5" fill="#9fb0c9" fontSize="9.5" fontFamily="var(--font-round)">MEAN</text>
        <rect x="164" y="19" width="54" height="6" rx="3" fill="#1b3552" />
        <rect x="164" y="19" width={meanFill} height="6" rx="3" fill="#38bdf8" />
        <line x1={164 + meanMark} y1="16" x2={164 + meanMark} y2="28" stroke="#fbbf24" strokeWidth="1.5" />
        <text x="222" y="25.5" fill="#dbeafe" fontSize="10" fontFamily="var(--font-round)">
          {mean === null ? '—' : formatNumber(mean)}
        </text>
      </g>
      {highlight === 'meanCommand' && <Spotlight cx={164 + meanMark} cy={22} r={22} />}
      {highlight === 'totalCommand' && <Spotlight cx={72} cy={22} r={26} />}

      <text x="16" y="66" fill="#7f93ad" fontSize="9.5" fontFamily="var(--font-round)" letterSpacing="1.2">
        CONVEYOR · RAW → CLAMPED
      </text>
      <g stroke="#223a56" strokeWidth="1">
        <line x1="176" y1="84" x2="176" y2="148" />
        <line x1="184" y1="84" x2="184" y2="148" />
      </g>
      <rect x="170" y="84" width="20" height="5" rx="2.5" fill="#2b4a6b" />
      <text x="180" y="78" textAnchor="middle" fill="#64748b" fontSize="8" fontFamily="var(--font-round)">CLAMP</text>

      {Array.from({ length: slots }, (_, index) => {
        const x = slotX(index);
        const ready = index < clamped.length;
        const value = ready ? clamped[index] : null;
        const rawValue = raw[index];
        const highlighted = highlight === 'clampedCommands' && ready;
        return (
          <g key={index}>
            <g
              className="robot-crate"
              style={{
                transform: ready ? 'translate(0px, 0px)' : 'translate(0px, -12px)',
                opacity: ready ? 1 : 0.28,
              }}
            >
              <rect
                x={x - 22}
                y="104"
                width="44"
                height="34"
                rx="11"
                fill={active === index ? '#12324f' : '#0d2137'}
                stroke={highlighted ? '#38bdf8' : active === index ? '#38bdf8' : ready ? '#2c4a6b' : '#1e3450'}
                strokeWidth={highlighted || active === index ? 2 : 1}
              />
              <text
                x={x}
                y="126"
                textAnchor="middle"
                fill={ready ? '#e2f3ff' : '#64748b'}
                fontSize="15"
                fontFamily="var(--font-round)"
                fontWeight="600"
              >
                {value === null ? '?' : formatNumber(value)}
              </text>
            </g>
            <text x={x} y="82" textAnchor="middle" fill="#fbbf24" fontSize="9.5" fontFamily="var(--font-round)">
              {typeof rawValue === 'number' ? formatNumber(rawValue) : '—'}
            </text>
          </g>
        );
      })}

      <rect x="24" y="146" width="312" height="12" rx="6" fill="#0b1a2e" stroke="#233a57" />
      <line
        x1="30"
        y1="152"
        x2="330"
        y2="152"
        stroke="#38bdf8"
        strokeWidth="2"
        strokeDasharray="6 10"
        opacity="0.5"
        className="robot-belt"
      />
      <text x="180" y="176" textAnchor="middle" fill="#7f93ad" fontSize="9.5" fontFamily="var(--font-round)">
        {clamped.length === 0 ? 'waiting for the first crate' : clamped.length + ' of ' + slots + ' sorted'}
      </text>
    </g>
  );
}

/** P.5 — four visible steps carry the joint to the dock at the mission's own target. */
export function P5Scene({ reading, progress, highlight }: SceneProps) {
  const position = numberOrNull(reading?.positionM);
  const target = targetNumber(progress, 'positionM', 1.2);
  const xFor = (value: number) => 52 + clamp(value / (target || 1), 0, 1) * 256;
  const x = xFor(position ?? 0);
  const targetX = xFor(target);
  const step = numberOrNull(reading?.step);
  const stepTarget = targetNumber(progress, 'step', 4);
  const velocity = numberOrNull(reading?.velocityMS);
  const met = metOf(progress, 'positionM');
  const complete = progress.complete;
  const mood: RobotMood = complete && reading ? 'happy' : reading ? 'working' : 'idle';

  return (
    <g>
      <Bubble text={bubbleMessage('P.5', reading, complete)} />
      <g>
        <rect x="16" y="12" width="100" height="20" rx="10" fill="#0b1a2e" stroke="#233a57" />
        <text x="26" y="25.5" fill="#9fb0c9" fontSize="9.5" fontFamily="var(--font-round)">POSITION</text>
        <text x="82" y="26" fill="#dbeafe" fontSize="12" fontFamily="var(--font-round)">
          {position === null ? '—' : formatNumber(position) + ' m'}
        </text>
        <rect x="124" y="12" width="104" height="20" rx="10" fill="#0b1a2e" stroke="#233a57" />
        <text x="134" y="25.5" fill="#9fb0c9" fontSize="9.5" fontFamily="var(--font-round)">STEPS</text>
        <text x="188" y="26" fill="#dbeafe" fontSize="12" fontFamily="var(--font-round)">
          {step === null ? '—' : formatNumber(step) + ' / ' + formatNumber(stepTarget)}
        </text>
      </g>

      <line x1="52" y1="152" x2="308" y2="152" stroke="#2c4462" strokeWidth="4" strokeLinecap="round" />
      {[0, 0.6, 1.2].map((mark) => (
        <g key={mark}>
          <line x1={xFor(mark)} y1="147" x2={xFor(mark)} y2="157" stroke="#3d5879" strokeWidth="1.5" />
          <text x={xFor(mark)} y="170" textAnchor="middle" fill="#64748b" fontSize="8.5" fontFamily="var(--font-round)">
            {mark.toFixed(2)} m
          </text>
        </g>
      ))}
      <line x1="52" y1="152" x2={Math.max(x, 52)} y2="152" stroke="#0ea5e9" strokeWidth="4" strokeLinecap="round" />

      <g>
        <line x1={targetX} y1="118" x2={targetX} y2="152" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" />
        <path d="M 296 124 l 12 10 l -12 10" fill="none" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" />
        <text x={targetX} y="112" textAnchor="middle" fill={met ? '#6ee7b7' : '#fbbf24'} fontSize="10" fontFamily="var(--font-round)">
          DOCK {formatNumber(target)} m
        </text>
        {highlight === 'positionM' && <Spotlight cx={targetX} cy={152} r={20} />}
      </g>

      {met && reading && <circle cx={x} cy="126" r="28" fill="url(#robot-glow)" />}
      <ellipse cx={x} cy="146" rx="16" ry="4" fill="#020617" opacity="0.6" />
      {velocity !== null && velocity > 0 && <SpeedLines x={x} y={126} />}
      <g data-testid="robot-mover" className="robot-mover" style={{ transform: `translate(${x}px, 126px)` }}>
        <g transform="scale(27)">
          <RobotSprite heading={1} mood={mood} />
        </g>
      </g>

      <g>
        {[0, 1, 2, 3].map((index) => (
          <circle
            key={index}
            cx={150 + index * 20}
            cy="190"
            r="4.5"
            fill={step !== null && step > index ? '#34d399' : '#233a57'}
            stroke="#071626"
            strokeWidth="1"
          />
        ))}
        <text x="236" y="194" fill="#9fb0c9" fontSize="9.5" fontFamily="var(--font-round)">
          {step === null ? 'waiting' : formatNumber(step) + ' of ' + formatNumber(stepTarget) + ' steps'}
        </text>
        {highlight === 'step' && <Spotlight cx={180} cy={190} r={26} />}
      </g>
    </g>
  );
}
