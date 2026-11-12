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
  if (lessonId === 'P.2') {
    // The lesson's own start position is the rail's zero: a 62.5 mm tick fills the drawing instead
    // of being a speck on a 0-3 m scale, and a run that never moved leaves the cart at the stop.
    const target = targetNumber(progress, 'positionM', 2.0625);
    const position = numberOrNull(reading?.positionM);
    if (position === null) return 0;
    const start = anchor ?? Math.min(position, target);
    if (Math.abs(target - start) < 1e-9) return 1;
    return clamp((position - start) / (target - start), 0, 1);
  }
  if (lessonId === 'P.6') {
    const target = targetNumber(progress, 'distanceD1', 5);
    const d1 = numberOrNull(reading?.distanceD1);
    return d1 === null ? 0 : clamp(d1 / Math.max(target, 1e-9), 0, 1);
  }
  if (lessonId === 'P.7') {
    const target = Math.max(targetNumber(progress, 'voltageV', 3.3), 1e-9);
    const volts = numberOrNull(reading?.voltageV);
    return volts === null ? 0 : clamp(volts / target, 0, 1);
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
/** The value each arena moves first: the one the HUD reads out as the destination. */
const PREFERRED_TARGET: Record<string, keyof RobotReading> = {
  'P.1': 'encoderTicks',
  'P.3': 'clampedHigh',
  'P.4': 'clampedCommands',
  'P.6': 'distanceD1',
  'P.7': 'voltageV',
};

export function primaryTargetLabel(lessonId: string, progress: RobotProgress): string {
  const key = PREFERRED_TARGET[lessonId] ?? 'positionM';
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

/** The arena's own dark instrument face, the same in every palette as the app's plots. */
export function ArenaBackground() {
  return (
    <>
      <defs>
        <pattern id="robot-grid" width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#152642" strokeWidth="0.8" />
        </pattern>
        <linearGradient id="robot-floor" x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor="#0b1d35" />
          <stop offset="0.5" stopColor="#071426" />
          <stop offset="1" stopColor="#040b16" />
        </linearGradient>
        <radialGradient id="robot-glow">
          <stop offset="0" stopColor="#38bdf8" stopOpacity="0.34" />
          <stop offset="0.45" stopColor="#0ea5e9" stopOpacity="0.12" />
          <stop offset="1" stopColor="#38bdf8" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="robot-aurora">
          <stop offset="0" stopColor="#2dd4bf" stopOpacity="0.2" />
          <stop offset="1" stopColor="#2dd4bf" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="robot-beam" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#38bdf8" stopOpacity="0" />
          <stop offset="0.7" stopColor="#38bdf8" stopOpacity="0.15" />
          <stop offset="1" stopColor="#38bdf8" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="360" height="210" fill="url(#robot-floor)" />
      <circle cx="312" cy="8" r="120" fill="url(#robot-aurora)" />
      <circle cx="46" cy="184" r="120" fill="url(#robot-aurora)" opacity="0.55" />
      <rect width="360" height="210" fill="url(#robot-grid)" opacity="0.72" />
      <path d="M 0 186 Q 180 154 360 186" fill="none" stroke="#163451" strokeWidth="1" opacity="0.8" />
      <path d="M 0 198 Q 180 166 360 198" fill="none" stroke="#11304c" strokeWidth="1" opacity="0.65" />
      <g className="robot-dust" fill="#7dd3fc">
        <circle cx="36" cy="58" r="1.2" opacity="0.38" />
        <circle cx="92" cy="36" r="0.9" opacity="0.3" />
        <circle cx="148" cy="74" r="1" opacity="0.26" />
        <circle cx="224" cy="42" r="1.3" opacity="0.4" />
        <circle cx="286" cy="78" r="1" opacity="0.28" />
        <circle cx="330" cy="52" r="1.4" opacity="0.35" />
        <circle cx="64" cy="112" r="0.8" opacity="0.24" />
        <circle cx="300" cy="118" r="0.8" opacity="0.2" />
        <circle cx="116" cy="24" r="1.1" opacity="0.3" />
        <circle cx="252" cy="104" r="0.7" opacity="0.24" />
      </g>
      <circle cx="180" cy="132" r="132" fill="url(#robot-glow)" opacity="0.5" />
      <rect x="0" y="80" width="360" height="130" fill="url(#robot-beam)" opacity="0.5" />
    </>
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

/**
 * The destination is a place, not a sentence: a lit gate with a slow halo and a chevron pointing
 * into it. It turns green only when the reading agrees, so the run visibly arrives somewhere.
 */
function DestinationBeacon({ x, y, met }: { x: number; y: number; met: boolean }) {
  const ink = met ? '#34d399' : '#7dd3fc';
  return (
    <g className="robot-beacon" data-met={met ? 'true' : 'false'} transform={`translate(${x} ${y})`}>
      <line x1="0" y1="-2" x2="0" y2="-54" stroke={ink} strokeWidth="1" opacity="0.34" strokeDasharray="2 4" />
      <circle className="robot-beacon-halo" r="32" fill="url(#robot-glow)" opacity="0.8" />
      <circle className="robot-beacon-pulse" r="22" fill="none" stroke={ink} strokeWidth="1" opacity="0" />
      <circle className="robot-beacon-ring" r="18" fill="none" stroke={ink} strokeWidth="1.2" opacity="0.65" strokeDasharray="4 5" />
      <circle r="11" fill="#071a2e" stroke={ink} strokeWidth="1.8" />
      <circle r="4" fill={ink} />
      <path d="M -25 0 h -8 l 5 -4 M -25 0 l 5 4" fill="none" stroke={ink} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
    </g>
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
  // Before the first reading the rover waits at the near end of its own track. The destination
  // still exists, but it is a place ahead, not a number written on the arena.
  const start = anchor ?? target - Math.max(25, Math.abs(target) * 0.55);
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

      <text x="16" y="52" fill="#7f93ad" fontSize="9.5" fontFamily="var(--font-round)" letterSpacing="1.2">
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
        stroke={met ? '#34d399' : '#0ea5e9'}
        strokeWidth="4"
        strokeLinecap="round"
      />

      <DestinationBeacon x={targetX} y={150} met={met} />
      {highlight === 'encoderTicks' && <Spotlight cx={targetX} cy={150} r={22} />}
      {showStart && (
        <g>
          <ellipse cx={startX} cy="151" rx="12" ry="2.5" fill="#38bdf8" opacity="0.22" />
          <text
            x={startX}
            y="170"
            textAnchor="middle"
            fill="#7f93ad"
            fontSize="8.5"
            fontFamily="var(--font-round)"
            letterSpacing="0.6"
            paintOrder="stroke"
            stroke="#050e1c"
            strokeWidth="2.2"
            strokeLinejoin="round"
          >
            HOME
          </text>
        </g>
      )}

      {met && reading && <circle cx={x} cy="138" r="34" fill="url(#robot-glow)" />}
      <ellipse cx={x} cy="152" rx="19" ry="3.5" fill="#020617" opacity="0.6" />
      {reading && !met && <SpeedLines x={x} y={138} />}
      <g data-testid="robot-mover" className="robot-mover" style={{ transform: `translate(${x}px, 138px)` }}>
        <g transform="scale(34)">
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
        <text
          x={at}
          y={y - 16}
          textAnchor="middle"
          fill="#dbeafe"
          fontSize="10"
          fontFamily="var(--font-round)" style={{ fontVariantNumeric: 'tabular-nums' }}
          paintOrder="stroke"
          stroke="#050e1c"
          strokeWidth="2.6"
          strokeLinejoin="round"
        >
          {clamped === null ? '—' : formatNumber(clamped)}
        </text>
      )}
      {highlighted && at !== null && <Spotlight cx={at} cy={y} r={16} />}
      <text x="58" y={y + 26} fill="#64748b" fontSize="8.5" fontFamily="var(--font-round)">
        {/* the raw command, so the pull into range reads as one move */}
        {raw === null ? '—' : formatNumber(raw) + ' raw'}
      </text>
      <text x="310" y={y + 4} textAnchor="end" fill={badge === 'inside' ? '#6ee7b7' : '#fbbf24'} fontSize="9" fontFamily="var(--font-round)">
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
      <text x="16" y="28" fill="#7f93ad" fontSize="9.5" fontFamily="var(--font-round)" letterSpacing="1.2">
        STABILITY ENVELOPE
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
        badge={high === null ? '—' : metHigh ? 'inside' : 'pulling'}
      />
      <CommandLane
        label="LOW"
        y={134}
        raw={lowRaw}
        clamped={low}
        highlighted={highlight === 'clampedLow'}
        badge={low === null ? '—' : metLow ? 'inside' : 'pulling'}
      />

      <text x="58" y="150" fill="#64748b" fontSize="8.5" fontFamily="var(--font-round)">0</text>
      <text x="302" y="150" textAnchor="end" fill="#64748b" fontSize="8.5" fontFamily="var(--font-round)">255</text>

      {/* Above the bar, not beside it: the e-stop badge sits on this baseline at the left end, and
          the two used to be drawn through each other. */}
      <text x="14" y="160" fill="#9fb0c9" fontSize="10" fontFamily="var(--font-round)">OUTPUT</text>
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
  const meanFill = mean === null ? 0 : clamp(mean / 255, 0, 1) * 52;
  const meanMark = meanTarget === 0 ? 0 : clamp(meanTarget / 255, 0, 1) * 52;

  return (
    <g>
      {/* Each pill is sized to the longest value the lesson can produce, not to the one on screen:
          a four-digit total and a three-digit mean stay inside their own borders at every width. */}
      <g>
        <rect x="12" y="12" width="92" height="20" rx="10" fill="#0b1a2e" stroke="#233a57" />
        <text x="22" y="25.5" fill="#9fb0c9" fontSize="9.5" fontFamily="var(--font-round)">TOTAL</text>
        <text x="66" y="26" fill="#dbeafe" fontSize="12" fontFamily="var(--font-round)" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {total === null ? '—' : formatNumber(total)}
        </text>
        <rect x="112" y="12" width="140" height="20" rx="10" fill="#0b1a2e" stroke="#233a57" />
        <text x="122" y="25.5" fill="#9fb0c9" fontSize="9.5" fontFamily="var(--font-round)">MEAN</text>
        <rect x="166" y="19" width="52" height="6" rx="3" fill="#1b3552" />
        <rect x="166" y="19" width={meanFill} height="6" rx="3" fill="#38bdf8" />
        <line x1={166 + meanMark} y1="16" x2={166 + meanMark} y2="28" stroke="#fbbf24" strokeWidth="1.5" />
        <text x="224" y="25.5" fill="#dbeafe" fontSize="9.5" fontFamily="var(--font-round)" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {mean === null ? '—' : formatNumber(mean)}
        </text>
      </g>
      {highlight === 'meanCommand' && <Spotlight cx={166 + meanMark} cy={22} r={22} />}
      {highlight === 'totalCommand' && <Spotlight cx={66} cy={22} r={26} />}

      <text x="16" y="66" fill="#7f93ad" fontSize="9.5" fontFamily="var(--font-round)" letterSpacing="1.2">
        CONVOY · RAW → CLAMPED
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
                fontSize="14"
                fontFamily="var(--font-round)"
                fontWeight="600" style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {value === null ? '?' : formatNumber(value)}
              </text>
            </g>
            <text
              x={x}
              y="82"
              textAnchor="middle"
              fill="#fbbf24"
              fontSize="9.5"
              fontFamily="var(--font-round)" style={{ fontVariantNumeric: 'tabular-nums' }}
              // A dark halo keeps the number readable where it crosses the belt and the grid,
              // instead of letting the drawing run through the glyphs.
              paintOrder="stroke"
              stroke="#050e1c"
              strokeWidth="2.4"
              strokeLinejoin="round"
            >
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
        {clamped.length === 0 ? 'waiting for the convoy' : clamped.length + ' of ' + slots + ' linked'}
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
      <g>
        <rect x="12" y="12" width="112" height="20" rx="10" fill="#0b1a2e" stroke="#233a57" />
        <text x="22" y="25.5" fill="#9fb0c9" fontSize="9.5" fontFamily="var(--font-round)">POSITION</text>
        <text x="82" y="26" fill="#dbeafe" fontSize="11.5" fontFamily="var(--font-round)" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {position === null ? '—' : formatNumber(position) + ' m'}
        </text>
        <rect x="128" y="12" width="116" height="20" rx="10" fill="#0b1a2e" stroke="#233a57" />
        <text x="138" y="25.5" fill="#9fb0c9" fontSize="9.5" fontFamily="var(--font-round)">STEPS</text>
        <text x="196" y="26" fill="#dbeafe" fontSize="11.5" fontFamily="var(--font-round)" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {step === null ? '—' : formatNumber(step) + ' / ' + formatNumber(stepTarget)}
        </text>
      </g>

      <line x1="52" y1="152" x2="308" y2="152" stroke="#2c4462" strokeWidth="4" strokeLinecap="round" />
      {[0, 0.6, 1.2].map((mark) => {
        // The 1.2 m tick sits inside the dock's beacon (rings out to r=22), so its scale label steps
        // left on a short leader instead of being drawn under the target. Everything else stays on the
        // one baseline at 170, and the measured value is untouched.
        const atDock = mark === 1.2;
        const labelX = atDock ? xFor(mark) - 18 : xFor(mark);
        return (
          <g key={mark}>
            <line x1={xFor(mark)} y1="147" x2={xFor(mark)} y2="157" stroke="#3d5879" strokeWidth="1.5" />
            {atDock && (
              <line x1={xFor(mark)} y1="157" x2={xFor(mark) - 14} y2="165" stroke="#3d5879" strokeWidth="1" />
            )}
            <text
              x={labelX}
              y="170"
              textAnchor={atDock ? 'end' : 'middle'}
              fill="#64748b"
              fontSize="8.5"
              fontFamily="var(--font-round)"
            >
              {mark.toFixed(2)} m
            </text>
          </g>
        );
      })}
      <line x1="52" y1="152" x2={Math.max(x, 52)} y2="152" stroke="#0ea5e9" strokeWidth="4" strokeLinecap="round" />

      <g className="robot-dock">
        <rect x={targetX - 17} y="156" width="34" height="8" rx="4" fill={met ? '#134e4a' : '#12304a'} stroke={met ? '#34d399' : '#2b5a7a'} strokeWidth="1" />
        <DestinationBeacon x={targetX} y={152} met={met} />
        {highlight === 'positionM' && <Spotlight cx={targetX} cy={152} r={22} />}
      </g>

      {met && reading && <circle cx={x} cy="140" r="34" fill="url(#robot-glow)" />}
      <ellipse cx={x} cy="156" rx="19" ry="3.5" fill="#020617" opacity="0.6" />
      {velocity !== null && velocity > 0 && <SpeedLines x={x} y={140} />}
      <g data-testid="robot-mover" className="robot-mover" style={{ transform: `translate(${x}px, 140px)` }}>
        <g transform="scale(34)">
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
          {step === null ? 'waiting' : formatNumber(step) + ' / ' + formatNumber(stepTarget) + ' pulses'}
        </text>
        {highlight === 'step' && <Spotlight cx={180} cy={190} r={26} />}
      </g>
    </g>
  );
}


/**
 * P.2's arena: a rail gantry, a voltage divider and an energy store.
 *
 * Three numbers, three shapes a learner can watch move: the carriage runs along the rail between the
 * start position and the computed one, the divider's wiper sits at the sense-pin fraction, and the
 * flywheel's band fills with the kinetic energy. The gantry is a different machine from the rover on
 * purpose — a cart on a beam is what "position after one tick" looks like — and it is drawn from the
 * same reading the tiles show, never from a second set of numbers.
 */
/** A fixed-decimal string for the arena's own labels; the tiles keep `formatNumber`'s wording. */
function fixed(value: number, digits: number): string {
  return value.toFixed(digits);
}

export function P2Scene({ reading, progress, highlight }: SceneProps) {
  const start = 2.0;
  const target = targetNumber(progress, 'positionM', 2.0625);
  const position = numberOrNull(reading?.positionM);
  const span = Math.max(Math.abs(target - start), 0.0625);
  const travelled = position === null ? 0 : clamp((position - start) / span, 0, 1);
  const volts = numberOrNull(reading?.sensorVolts);
  const voltTarget = Math.max(targetNumber(progress, 'sensorVolts', 4), 1e-6);
  const voltFill = volts === null ? 0 : clamp(volts / (voltTarget * 1.5), 0, 1);
  const energy = numberOrNull(reading?.kineticEnergyJ);
  const energyTarget = Math.max(targetNumber(progress, 'kineticEnergyJ', 9), 1e-6);
  const energyFill = energy === null ? 0 : clamp(energy / (energyTarget * 1.5), 0, 1);
  const carriageX = 26 + travelled * 196;
  const atTarget = metOf(progress, 'positionM');
  const ink = highlight === 'positionM' ? '#38bdf8' : '#233a57';

  return (
    <svg viewBox="0 0 320 168" role="img" aria-label="A rail gantry, a voltage divider and an energy store" className="h-full w-full">
      <defs>
        <linearGradient id="p2-beam" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5b7185" />
          <stop offset="1" stopColor="#22364b" />
        </linearGradient>
        <linearGradient id="p2-volt" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#0ea5e9" stopOpacity="0.35" />
          <stop offset="1" stopColor="#7dd3fc" stopOpacity="0.95" />
        </linearGradient>
      </defs>

      {/* the rail the carriage rides, with its start stop and the target flag */}
      <line x1="18" y1="96" x2="286" y2="96" stroke={ink} strokeWidth="3" strokeLinecap="round" />
      <g stroke="#7f93ad" strokeWidth="1.4">
        {Array.from({ length: 14 }, (_, index) => (
          <line key={index} x1={20 + index * 20} y1="99" x2={20 + index * 20} y2="105" />
        ))}
      </g>
      <line x1="26" y1="86" x2="26" y2="92" stroke="#9fb0c9" strokeWidth="2" />
      <g transform="translate(222 74)">
        <line x1="0" y1="0" x2="0" y2="22" stroke={atTarget ? '#34d399' : '#7f93ad'} strokeWidth="1.6" />
        <path d="M 0 0 L 15 5 L 0 10 Z" fill={atTarget ? '#34d399' : '#7f93ad'} opacity="0.85" />
        {atTarget && <path d="M -6 72 L 6 72" stroke="#34d399" strokeWidth="2" />}
      </g>

      {/* the gantry: two legs and a beam, with the carriage clamped to it */}
      <g transform={`translate(${carriageX} 0)`} style={{ transition: 'transform 420ms ease-out' }} data-robot-gantry>
        <rect x="-13" y="34" width="26" height="9" rx="2" fill="url(#p2-beam)" stroke="#0a1727" strokeWidth="1.2" />
        <rect x="-11" y="41" width="4" height="53" fill="#2d4156" stroke="#0a1727" strokeWidth="1" />
        <rect x="7" y="41" width="4" height="53" fill="#2d4156" stroke="#0a1727" strokeWidth="1" />
        <rect x="-9" y="52" width="18" height="22" rx="3" fill="#3d546a" stroke="#0a1727" strokeWidth="1.2" />
        <circle cx="0" cy="63" r="4.2" fill={atTarget ? '#34d399' : '#38bdf8'} opacity="0.9" />
        <rect x="-19" y="92" width="38" height="6" rx="2" fill="#14263a" stroke="#07111f" strokeWidth="1" />
      </g>

      {/* the divider: two resistors and the tapped sense pin */}
      <g transform="translate(196 18)">
        <rect x="0" y="0" width="16" height="16" rx="2" fill="#3d546a" stroke="#0a1727" strokeWidth="1.2" />
        <rect x="0" y="34" width="16" height="16" rx="2" fill="#243b52" stroke="#0a1727" strokeWidth="1.2" />
        <line x1="8" y1="16" x2="8" y2="34" stroke="#7f93ad" strokeWidth="1.4" />
        <line x1="8" y1="25" x2="26" y2="25" stroke="#7f93ad" strokeWidth="1.4" />
        <rect x="26" y="8" width="8" height="34" rx="3" fill="#071a2c" stroke="#233a57" strokeWidth="1" />
        <rect x="27" y={42 - 32 * voltFill} width="6" height={32 * voltFill} rx="2" fill="url(#p2-volt)" />
        <circle cx="30" cy="25" r="2.6" fill={metOf(progress, 'sensorVolts') ? '#34d399' : '#7f93ad'} />
      </g>

      {/* the energy store: a flywheel band that fills with the cart's kinetic energy */}
      <g transform="translate(288 60)">
        <circle cx="0" cy="0" r="17" fill="none" stroke="#233a57" strokeWidth="3.4" />
        <circle
          cx="0"
          cy="0"
          r="17"
          fill="none"
          stroke={metOf(progress, 'kineticEnergyJ') ? '#34d399' : '#38bdf8'}
          strokeWidth="3.4"
          strokeLinecap="round"
          strokeDasharray={`${(2 * Math.PI * 17 * energyFill).toFixed(1)} 999`}
          transform="rotate(-90)"
          style={{ transition: 'stroke-dasharray 420ms ease-out' }}
        />
        <text x="0" y="3.5" textAnchor="middle" fontSize="8" fill="#7f93ad" fontFamily="var(--font-mono, monospace)">
          {energy === null ? '—' : fixed(energy, 1)}
        </text>
      </g>

      {/* the three values, in the arena so a screenshot carries the numbers */}
      <g fontSize="9" fill="#9fb0c9" fontFamily="var(--font-mono, monospace)">
        <text x="18" y="126">start {fixed(start, 4)} m</text>
        <text x="18" y="140" fill={highlight === 'positionM' ? '#38bdf8' : '#9fb0c9'}>
          x {position === null ? '—' : fixed(position, 4)} m / {fixed(target, 4)} m
        </text>
        <text x="150" y="140" fill={highlight === 'sensorVolts' ? '#38bdf8' : '#9fb0c9'}>
          sense {volts === null ? '—' : fixed(volts, 2)} V
        </text>
        <text x="228" y="140" fill={highlight === 'kineticEnergyJ' ? '#38bdf8' : '#9fb0c9'}>
          E {energy === null ? '—' : fixed(energy, 2)} J
        </text>
      </g>
    </svg>
  );
}


/**
 * P.6's arena: a survey table with rings in metres and two beacons on one bearing.
 *
 * Both pairs the lesson measures — (3, 4) and (0.6, 0.8) — sit on the same 3-4-5 line, so the
 * drawing is one ray with two ranges rather than two unrelated dials: the same bearing, measured at
 * 5 m and at 1 m. The rings are metres, so a short range still reads, and a run that has not bound
 * `d1` or `d2` yet shows the table empty with the beacons at the pivot.
 */
export function P6Scene({ reading, progress, highlight }: SceneProps) {
  const scale = 16; // px per metre: the 5 m target lands on the outer ring
  const pivotX = 92;
  const pivotY = 104;
  const d1 = numberOrNull(reading?.distanceD1);
  const d2 = numberOrNull(reading?.distanceD2);
  const target1 = targetNumber(progress, 'distanceD1', 5);
  const bearing = (53.130102 / 180) * Math.PI; // atan2(4, 3): both pairs share it
  const reach = (metres: number) => {
    const length = clamp(metres * scale, 0, 80);
    return { x: pivotX + Math.cos(bearing) * length, y: pivotY - Math.sin(bearing) * length };
  };
  const far = reach(d1 ?? 0);
  const near = reach(d2 ?? 0);

  return (
    <svg viewBox="0 0 320 168" x={20} y={21} width={320} height={168} preserveAspectRatio="xMidYMid meet" role="img" aria-label="A survey table measuring two ranges on one bearing">
      {[16, 32, 48, 64, 80].map((radius, index) => (
        <circle
          key={radius}
          cx={pivotX}
          cy={pivotY}
          r={radius}
          fill="none"
          stroke={index === 4 ? (metOf(progress, 'distanceD1') ? '#34d399' : '#38bdf8') : '#7f93ad'}
          strokeWidth={index === 4 ? 2 : 1.1}
          opacity={index === 4 ? 0.9 : 0.45}
          strokeDasharray={index === 4 ? undefined : '3 5'}
        />
      ))}
      <line x1={pivotX - 88} y1={pivotY} x2={pivotX + 88} y2={pivotY} stroke="#233a57" strokeWidth="1" strokeDasharray="2 6" />
      <line x1={pivotX} y1={pivotY - 84} x2={pivotX} y2={pivotY + 22} stroke="#233a57" strokeWidth="1" strokeDasharray="2 6" />
      <line
        x1={pivotX}
        y1={pivotY}
        x2={far.x}
        y2={far.y}
        stroke={highlight === 'distanceD1' ? '#38bdf8' : '#7f93ad'}
        strokeWidth="1.6"
        style={{ transition: 'all 420ms ease-out' }}
      />
      <circle cx={pivotX} cy={pivotY} r="4" fill="#0b1a2e" stroke="#7f93ad" strokeWidth="1.4" />
      {/* the far beacon, at the lesson's own distance */}
      <g style={{ transition: 'transform 420ms ease-out' }} transform={`translate(${far.x} ${far.y})`}>
        <circle r="7" fill="none" stroke={metOf(progress, 'distanceD1') ? '#34d399' : '#38bdf8'} strokeWidth="1.8" />
        <circle r="2.6" fill={metOf(progress, 'distanceD1') ? '#34d399' : '#38bdf8'} />
      </g>
      {/* the near beacon, measured from the same origin */}
      <g style={{ transition: 'transform 420ms ease-out' }} transform={`translate(${near.x} ${near.y})`}>
        <circle r="5" fill="none" stroke={metOf(progress, 'distanceD2') ? '#34d399' : '#7f93ad'} strokeWidth="1.6" />
        <circle r="1.8" fill={metOf(progress, 'distanceD2') ? '#34d399' : '#7f93ad'} />
      </g>

      {/* the reading behind each beacon, at the end of its own ray */}
      <g fontSize="8" fontFamily="var(--font-mono, monospace)">
        <text x={reach(5).x - 10} y={reach(5).y - 8} fill={metOf(progress, 'distanceD1') ? '#34d399' : '#7f93ad'}>
          d1 {d1 === null ? '\u2014' : fixed(d1, 2)} m
        </text>
        <text x={reach(1).x - 26} y={reach(1).y + 4} fill={metOf(progress, 'distanceD2') ? '#34d399' : '#7f93ad'}>
          d2 {d2 === null ? '\u2014' : fixed(d2, 2)} m
        </text>
      </g>

      {/* the scale, in metres, so a screenshot says what the rings mean */}
      <g fontSize="7" fill="#7f93ad" fontFamily="var(--font-mono, monospace)">
        {[1, 2, 3, 4, 5].map((metre) => (
          // The ruler runs across the dashed rings, so each label gets a plate of arena background
          // rather than sitting on the dashes.
          <g key={metre}>
            <rect x={pivotX + metre * scale - 10} y={pivotY + 22} width={20} height={10} rx={2} fill="#050e1c" opacity={0.92} />
            <text x={pivotX + metre * scale} y={pivotY + 30} textAnchor="middle">
              {metre} m
            </text>
          </g>
        ))}
        <text x={pivotX} y={pivotY + 46} textAnchor="middle">
          outer ring {fixed(target1, 2)} m
        </text>
      </g>
    </svg>
  );
}

/**
 * P.7's arena: a bench meter with a volt arc, two digital windows and a microsecond strip.
 *
 * The lesson converts three quantities before it multiplies two of them, so the machine shows the
 * converted values as a bench instrument would: amps and ohms in their own windows, the voltage they
 * produce on the arc, and the 500 us pulse drawn at the bottom. Microseconds are drawn on a log-ish
 * strip, because 0.0005 s on a linear second scale is a line one pixel wide.
 */
export function P7Scene({ reading, progress, highlight }: SceneProps) {
  const amps = numberOrNull(reading?.currentA);
  const ohms = numberOrNull(reading?.resistanceOhm);
  const volts = numberOrNull(reading?.voltageV);
  const seconds = numberOrNull(reading?.timeS);
  const voltTarget = Math.max(targetNumber(progress, 'voltageV', 3.3), 1e-9);
  const arcFill = volts === null ? 0 : clamp(volts / (voltTarget * 1.5), 0, 1);
  const pulseWidth = seconds === null ? 0 : clamp((Math.log10(seconds * 1e6 + 1) / 3) * 96, 2, 112);
  const needle = -110 + arcFill * 220; // degrees, centred on the arc

  return (
    <svg viewBox="0 0 320 168" x={20} y={21} width={320} height={168} preserveAspectRatio="xMidYMid meet" role="img" aria-label="A bench meter reading converted amps, ohms, volts and microseconds">
      <rect x="14" y="12" width="292" height="112" rx="8" fill="none" stroke="#7f93ad" strokeWidth="1.2" opacity="0.9" />
      {/* the volt arc and its needle */}
      <g transform="translate(96 88)">
        <path d="M -52 0 A 52 52 0 0 1 52 0" fill="none" stroke="#7f93ad" strokeWidth="3" strokeLinecap="round" opacity="0.85" />
        <path
          d="M -52 0 A 52 52 0 0 1 52 0"
          fill="none"
          stroke={metOf(progress, 'voltageV') ? '#34d399' : '#38bdf8'}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${(Math.PI * 52 * arcFill).toFixed(1)} 999`}
          style={{ transition: 'stroke-dasharray 420ms ease-out' }}
        />
        <line x1="0" y1="0" x2="0" y2="-44" stroke="#7f93ad" strokeWidth="1.6" transform={`rotate(${needle})`} style={{ transition: 'transform 420ms ease-out' }} />
        <circle r="4" fill="#071a2c" stroke="#7f93ad" strokeWidth="1.4" />
        <text y="16" textAnchor="middle" fontSize="12" fontWeight="700" fontFamily="var(--font-mono, monospace)" fill={metOf(progress, 'voltageV') ? '#34d399' : '#dbeafe'}>
          {volts === null ? '\u2014' : fixed(volts, 2)} V
        </text>
        <text y="-60" textAnchor="middle" fontSize="7" fill="#7f93ad" fontFamily="var(--font-mono, monospace)">
          V = I × R
        </text>
      </g>

      {/* the two converted windows */}
      <g fontSize="9" fontFamily="var(--font-mono, monospace)">
        <rect x="178" y="34" width="112" height="30" rx="5" fill="none" stroke="#7f93ad" strokeWidth="1" opacity="0.9" />
        <text x="186" y="47" fill="#7f93ad" fontSize="7.5">CURRENT</text>
        <text x="186" y="59" fill={metOf(progress, 'currentA') ? '#34d399' : '#dbeafe'} fontSize="12" fontWeight="700">
          {amps === null ? '\u2014' : fixed(amps, 4)} A
        </text>
        <rect x="178" y="70" width="112" height="30" rx="5" fill="none" stroke="#7f93ad" strokeWidth="1" opacity="0.9" />
        <text x="186" y="83" fill="#7f93ad" fontSize="7.5">RESISTANCE</text>
        <text x="186" y="95" fill={metOf(progress, 'resistanceOhm') ? '#34d399' : '#dbeafe'} fontSize="12" fontWeight="700">
          {ohms === null ? '\u2014' : fixed(ohms, 1)} {String.fromCharCode(937)}
        </text>
      </g>

      {/* the microsecond strip: one pulse, as wide as its converted period */}
      <g transform="translate(14 132)">
        <line x1="0" y1="12" x2="292" y2="12" stroke="#233a57" strokeWidth="1" />
        <rect x="0" y="2" width={pulseWidth} height="10" rx="1.5" fill={metOf(progress, 'timeS') ? '#34d399' : '#38bdf8'} style={{ transition: 'width 420ms ease-out' }} />
        <text x="0" y="30" fontSize="7" fill="#7f93ad" fontFamily="var(--font-mono, monospace)">
          500 µs = {seconds === null ? '\u2014' : fixed(seconds, 6)} s
        </text>
      </g>
    </svg>
  );
}
