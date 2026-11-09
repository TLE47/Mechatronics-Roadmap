/**
 * The robot's game view (app/src/robotSim/RobotStage.tsx).
 *
 * The arena draws the lesson's own variables as a small machine: a robot on an encoder track, a
 * command corridor with a safe zone, a conveyor of commands, or a linear joint. The tiles under it
 * keep the exact numbers. Missing values are placeholders, never invented positions or readings.
 */
import type { ReactNode } from 'react';
import type { RobotReading, RobotScenario } from './model';
import { RobotSprite } from './RobotSprite';

function numberOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function shown(value: number | null | undefined, unit = ''): string {
  const number = numberOrNull(value);
  if (number === null) return '—';
  // The arena is read at a glance, so a float's binary tail (1.2000000000000002) is noise.
  return Math.round(number * 100) / 100 + unit;
}

function shownText(value: string | null | undefined): string {
  return value && value.trim() ? value : '—';
}

function shownBoolean(value: boolean | null | undefined, yes: string, no: string): string {
  if (value === null || value === undefined) return '—';
  return value ? yes : no;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

type Tone = 'good' | 'bad' | 'warn';

function toneColor(tone: Tone | undefined): string | undefined {
  if (tone === 'good') return '#22c55e';
  if (tone === 'bad') return '#ef4444';
  if (tone === 'warn') return '#f59e0b';
  return undefined;
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: Tone }) {
  return (
    <div className="rounded border border-line-soft bg-panel px-2 py-1.5">
      <div className="font-mono text-[9px] uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 font-mono text-[13px] font-semibold text-ink" style={{ color: toneColor(tone) }}>
        {value}
      </div>
    </div>
  );
}

function Grid() {
  return (
    <>
      <defs>
        <pattern id="robot-arena-grid" width="16" height="16" patternUnits="userSpaceOnUse">
          <path d="M 16 0 L 0 0 0 16" fill="none" stroke="#1e293b" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="320" height="96" fill="#08111f" />
      <rect width="320" height="96" fill="url(#robot-arena-grid)" />
    </>
  );
}

function Arena({
  label,
  signal,
  title,
  children,
}: {
  label: string;
  signal: boolean;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-line-soft">
      <div style={{ background: '#08111f' }}>
        <div className="flex items-center justify-between gap-2 px-2.5 pt-2">
          <span
            className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em]"
            style={{ color: '#7dd3fc' }}
          >
            {label}
          </span>
          <span
            className="font-mono text-[9px] uppercase tracking-wide"
            style={{ color: signal ? '#86efac' : '#94a3b8' }}
          >
            {signal ? 'signal live' : 'awaiting run'}
          </span>
        </div>
        <svg
          viewBox="0 0 320 96"
          role="img"
          aria-label={title}
          style={{ display: 'block', width: '100%', height: 112 }}
        >
          {children}
        </svg>
      </div>
    </div>
  );
}

function P1Scene({ reading }: { reading: RobotReading | null }) {
  const ticks = numberOrNull(reading?.encoderTicks);
  const progress = ticks === null ? 0 : (((ticks % 1000) + 1000) % 1000) / 1000;
  const robotX = 32 + progress * 248;
  const mode = reading?.mode;
  const modeColor = mode === 'ACTIVE' ? '#22c55e' : mode ? '#f59e0b' : '#64748b';
  const battery = numberOrNull(reading?.batteryVolts);
  const batteryWidth = battery === null ? 0 : clamp(battery / 14, 0, 1) * 36;
  const stopped = reading?.eStop === true;
  return (
    <>
      <Grid />
      <text x="24" y="16" fill="#94a3b8" fontSize="7" fontFamily="monospace">ENCODER TRACK</text>
      <line x1="24" y1="70" x2="296" y2="70" stroke="#334155" strokeWidth="2" />
      {[0, 1, 2, 3, 4].map((index) => (
        <line
          key={index}
          x1={24 + index * 68}
          y1="66"
          x2={24 + index * 68}
          y2="74"
          stroke="#475569"
          strokeWidth="1"
        />
      ))}
      <line x1="24" y1="70" x2={robotX} y2="70" stroke="#0ea5e9" strokeWidth="3" />
      <g transform={'translate(' + (robotX - 10) + ' 46) scale(20)'} opacity={ticks === null ? 0.35 : 1}>
        <RobotSprite x={0} y={0} heading={1} />
      </g>
      <circle cx="284" cy="18" r="4" fill={modeColor} />
      <text x="276" y="34" fill="#94a3b8" fontSize="7" fontFamily="monospace">MODE</text>
      <rect x="24" y="12" width="40" height="10" rx="2" fill="none" stroke="#475569" />
      <rect x="26" y="14" width={batteryWidth} height="6" rx="1" fill="#22c55e" />
      <text x="68" y="20" fill="#94a3b8" fontSize="7" fontFamily="monospace">BATTERY</text>
      {stopped && <text x="24" y="42" fill="#f87171" fontSize="8" fontFamily="monospace">E-STOP</text>}
    </>
  );
}

function P3Scene({ reading }: { reading: RobotReading | null }) {
  const scale = (value: number) => 60 + clamp((value + 50) / 400, 0, 1) * 240;
  const entries = [
    { label: 'HIGH', raw: reading?.rawHigh, clamped: reading?.clampedHigh },
    { label: 'LOW', raw: reading?.rawLow, clamped: reading?.clampedLow },
    { label: 'NORMAL', raw: reading?.rawNormal, clamped: reading?.rawNormal },
  ];
  return (
    <>
      <Grid />
      <rect x={scale(0)} y="24" width={scale(255) - scale(0)} height="56" rx="6" fill="#065f46" opacity="0.35" />
      <text x={scale(127.5)} y="18" textAnchor="middle" fill="#86efac" fontSize="7" fontFamily="monospace">SAFE 0–255</text>
      {[0, 255].map((value) => (
        <g key={value}>
          <line x1={scale(value)} y1="24" x2={scale(value)} y2="80" stroke="#334155" strokeDasharray="2 3" />
          <text x={scale(value)} y="90" textAnchor="middle" fill="#64748b" fontSize="7" fontFamily="monospace">{value}</text>
        </g>
      ))}
      {entries.map((entry, index) => {
        const raw = numberOrNull(entry.raw);
        const clamped = numberOrNull(entry.clamped);
        const y = 36 + index * 17;
        const rawX = raw === null ? null : scale(raw);
        const clampX = clamped === null ? null : scale(clamped);
        return (
          <g key={entry.label}>
            <text x="8" y={y + 3} fill="#94a3b8" fontSize="7" fontFamily="monospace">{entry.label}</text>
            {rawX !== null && clampX !== null && (
              <line x1={rawX} y1={y} x2={clampX} y2={y} stroke="#475569" strokeDasharray="2 2" />
            )}
            {rawX !== null && <circle cx={rawX} cy={y} r="3.5" fill="none" stroke="#f59e0b" strokeWidth="1.5" />}
            {clampX !== null && <circle cx={clampX} cy={y} r="3" fill="#38bdf8" />}
          </g>
        );
      })}
      {reading?.eStopPressed === true && (
        <g>
          <rect x="252" y="24" width="52" height="14" rx="3" fill="#7f1d1d" stroke="#ef4444" />
          <text x="278" y="34" textAnchor="middle" fill="#fecaca" fontSize="7" fontFamily="monospace">E-STOP</text>
        </g>
      )}
    </>
  );
}

function P4Scene({ reading }: { reading: RobotReading | null }) {
  const raw = reading?.rawCommands ?? [];
  const clamped = reading?.clampedCommands ?? [];
  const count = Math.max(raw.length, clamped.length, 6);
  const yFor = (value: number) => 72 - clamp((value + 50) / 400, 0, 1) * 40;
  return (
    <>
      <Grid />
      <text x="24" y="16" fill="#94a3b8" fontSize="7" fontFamily="monospace">CONVEYOR · RAW → CLAMPED</text>
      <rect x="24" y="74" width="272" height="8" rx="4" fill="#1e293b" />
      <line x1="24" y1={yFor(255)} x2="296" y2={yFor(255)} stroke="#f59e0b" strokeDasharray="3 3" opacity="0.6" />
      {Array.from({ length: count }, (_, index) => {
        const before = numberOrNull(raw[index]);
        const after = numberOrNull(clamped[index]);
        const x = 36 + index * (248 / count);
        const beforeY = before === null ? 64 : yFor(before);
        const afterY = after === null ? 64 : yFor(after);
        return (
          <g key={index}>
            <line x1={x} y1={beforeY} x2={x} y2={afterY} stroke="#475569" strokeWidth="1.5" />
            {before !== null && <circle cx={x} cy={beforeY} r="2.5" fill="none" stroke="#f59e0b" strokeWidth="1.2" />}
            {after !== null && <rect x={x - 3} y={afterY - 3} width="6" height="6" rx="1" fill="#38bdf8" />}
          </g>
        );
      })}
    </>
  );
}

function P5Scene({ reading }: { reading: RobotReading | null }) {
  const position = numberOrNull(reading?.positionM);
  const progress = position === null ? 0 : clamp(position / 1.5, 0, 1);
  const robotX = 32 + progress * 248;
  const velocity = numberOrNull(reading?.velocityMS);
  const step = numberOrNull(reading?.step);
  return (
    <>
      <Grid />
      <text x="24" y="16" fill="#94a3b8" fontSize="7" fontFamily="monospace">LINEAR JOINT</text>
      <line x1="24" y1="70" x2="296" y2="70" stroke="#334155" strokeWidth="2" />
      <line x1="288" y1="48" x2="288" y2="78" stroke="#f59e0b" strokeWidth="2" strokeDasharray="4 3" />
      <text x="284" y="92" textAnchor="end" fill="#f59e0b" fontSize="7" fontFamily="monospace">TARGET 1.50 m</text>
      <line x1="24" y1="70" x2={robotX} y2="70" stroke="#0ea5e9" strokeWidth="3" />
      {velocity !== null && velocity > 0 && (
        <g stroke="#38bdf8" strokeWidth="1" opacity="0.7">
          <line x1={robotX - 22} y1="54" x2={robotX - 10} y2="54" />
          <line x1={robotX - 28} y1="60" x2={robotX - 12} y2="60" />
          <line x1={robotX - 20} y1="66" x2={robotX - 8} y2="66" />
        </g>
      )}
      <g transform={'translate(' + (robotX - 10) + ' 46) scale(20)'} opacity={position === null ? 0.35 : 1}>
        <RobotSprite x={0} y={0} heading={1} />
      </g>
      {[0, 1, 2, 3, 4].map((index) => (
        <circle
          key={index}
          cx={24 + index * 66}
          cy="84"
          r="2"
          fill={step !== null && index < step ? '#22c55e' : '#334155'}
        />
      ))}
    </>
  );
}

function CommandBars({ reading }: { reading: RobotReading | null }) {
  const raw = reading?.rawCommands ?? [];
  const clamped = reading?.clampedCommands ?? [];
  const count = Math.max(raw.length, clamped.length, 6);
  return (
    <div className="mt-2" data-testid="robot-command-bars">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[9px] uppercase tracking-wide text-muted">Command conveyor</span>
        <span className="font-mono text-[9px] text-muted">raw → clamped</span>
      </div>
      <div className="mt-1 flex items-end gap-1.5">
        {Array.from({ length: count }, (_, index) => {
          const before = raw[index];
          const after = clamped[index];
          const percent =
            typeof after === 'number' && Number.isFinite(after)
              ? Math.max(3, Math.min(100, (after / 255) * 100))
              : 3;
          return (
            <div key={index} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <span className="font-mono text-[9px] text-muted">{shown(before)}</span>
              <div className="flex h-16 w-full items-end rounded-sm bg-line-soft">
                <div className="w-full rounded-sm bg-accent" style={{ height: percent + '%' }} />
              </div>
              <span className="font-mono text-[9px] font-semibold text-ink">{shown(after)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The one stage for every robot lesson. data-reading carries the parsed values the browser suite
 * reads; the arena is allowed to change without rewriting that contract.
 */
export function RobotStage({
  scenario,
  reading,
}: {
  scenario: RobotScenario;
  reading: RobotReading | null;
}) {
  const lesson = scenario.lesson;
  const lessonNumber = scenario.lessonId;

  return (
    <section
      data-testid="robot-stage"
      data-lesson={lessonNumber}
      data-reading={reading ? JSON.stringify(reading) : ''}
      aria-label={'Robot arena for ' + lessonNumber + ': ' + lesson.title}
      className="flex flex-col gap-2"
    >
      <Arena label={lessonNumber + ' · robot arena'} title={lesson.title} signal={Boolean(reading)}>
        {lessonNumber === 'P.1' && <P1Scene reading={reading} />}
        {lessonNumber === 'P.3' && <P3Scene reading={reading} />}
        {lessonNumber === 'P.4' && <P4Scene reading={reading} />}
        {lessonNumber === 'P.5' && <P5Scene reading={reading} />}
      </Arena>

      {lessonNumber === 'P.1' && (
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          <Tile
            label="Mode"
            value={shownText(reading?.mode)}
            tone={reading?.mode === 'ACTIVE' ? 'good' : reading?.mode ? 'warn' : undefined}
          />
          <Tile
            label="E-stop"
            value={shownBoolean(reading?.eStop, 'Pressed', 'Clear')}
            tone={reading?.eStop === true ? 'bad' : reading?.eStop === false ? 'good' : undefined}
          />
          <Tile label="Encoder" value={shown(reading?.encoderTicks, ' ticks')} />
          <Tile label="Battery" value={shown(reading?.batteryVolts, ' V')} />
        </div>
      )}

      {lessonNumber === 'P.3' && (
        <div className="grid grid-cols-2 gap-1.5">
          <Tile label="High" value={shown(reading?.rawHigh) + ' → ' + shown(reading?.clampedHigh)} />
          <Tile label="Low" value={shown(reading?.rawLow) + ' → ' + shown(reading?.clampedLow)} />
          <Tile label="Normal" value={shown(reading?.rawNormal)} />
          <Tile
            label="Safe output"
            value={shown(reading?.safeOutput)}
            tone={reading?.safeOutput === 0 ? 'bad' : reading?.safeOutput == null ? undefined : 'good'}
          />
        </div>
      )}

      {lessonNumber === 'P.4' && (
        <div className="rounded-lg border border-line-soft bg-canvas p-2">
          <CommandBars reading={reading} />
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            <Tile
              label="Values"
              value={reading?.clampedCommands ? String(reading.clampedCommands.length) : '—'}
            />
            <Tile label="Total" value={shown(reading?.totalCommand)} />
            <Tile label="Mean" value={shown(reading?.meanCommand)} />
          </div>
        </div>
      )}

      {lessonNumber === 'P.5' && (
        <div className="grid grid-cols-3 gap-1.5">
          <Tile label="Position" value={shown(reading?.positionM, ' m')} />
          <Tile label="Velocity" value={shown(reading?.velocityMS, ' m/s')} />
          <Tile label="Steps" value={shown(reading?.step)} />
        </div>
      )}
    </section>
  );
}
