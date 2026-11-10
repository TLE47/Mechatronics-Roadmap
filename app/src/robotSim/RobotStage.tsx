/**
 * The robot's game view (`app/src/robotSim/RobotStage.tsx`).
 *
 * The arena is a drawing of the lessons' own values: a rover on a target-aware track, two commands
 * pulled into a safe corridor, a conveyor of clamped crates, or a joint travelling to its dock. The
 * numbers stay under it, at reading size, and a missing name stays a dash. `data-reading` is the raw
 * reading the browser suite compares; `data-robot-position` is how far into its own travel the scene
 * is, which is what lets that suite prove motion instead of only the end state.
 */
import type { RobotReading, RobotScenario } from './model';
import { formatNumber, type RobotProgress } from './robotMission';
import {
  P1Scene,
  P3Scene,
  P4Scene,
  P5Scene,
  numberOrNull,
  primaryProgress,
  useAnchor,
  primaryTargetLabel,
  ArenaBackground,
  type SceneProps,
} from './robotScenes';

type Tone = 'good' | 'bad' | 'warn';

function toneColor(tone: Tone | undefined): string | undefined {
  if (tone === 'good') return 'var(--emerald)';
  if (tone === 'bad') return 'var(--rose)';
  if (tone === 'warn') return 'var(--amber)';
  return undefined;
}

function shown(value: number | null | undefined, unit = ''): string {
  const number = numberOrNull(value);
  return number === null ? '—' : formatNumber(number) + unit;
}

function shownText(value: string | null | undefined): string {
  return value && value.trim() ? value : '—';
}

function shownBoolean(value: boolean | null | undefined, yes: string, no: string): string {
  if (value === null || value === undefined) return '—';
  return value ? yes : no;
}

/** One value under the arena: a big round number over its label, not a 9 px instrument caption. */
function Tile({ label, value, tone }: { label: string; value: string; tone?: Tone }) {
  return (
    <div className="rounded-2xl border border-line-soft bg-canvas px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</div>
      <div
        className="font-round mt-0.5 text-[16px] font-semibold leading-tight text-ink tabular-nums"
        style={{ color: toneColor(tone) }}
      >
        {value}
      </div>
    </div>
  );
}

/** The conveyor's readings as chips: the raw value, an arrow, then the clamped value. */
function CommandReadout({ reading }: { reading: RobotReading | null }) {
  const raw = reading?.rawCommands ?? [];
  const clamped = reading?.clampedCommands ?? [];
  const count = Math.max(raw.length, clamped.length, 6);
  return (
    <div className="flex flex-wrap gap-1.5" data-testid="robot-command-bars">
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-line-soft bg-canvas px-2.5 text-[12px]"
        >
          <span className="text-muted">{shown(raw[index])}</span>
          <span aria-hidden="true" className="text-faint">
            →
          </span>
          <span className="font-round text-[14px] font-semibold text-ink">{shown(clamped[index])}</span>
        </span>
      ))}
    </div>
  );
}

export function RobotStage({
  scenario,
  reading,
  progress,
  highlight,
  motion,
  running,
  title,
  line,
  lineText,
}: {
  scenario: RobotScenario;
  reading: RobotReading | null;
  progress: RobotProgress;
  highlight: keyof RobotReading | null;
  motion: boolean;
  running: boolean;
  title: string;
  line: number | null;
  lineText: string | null;
}) {
  const lesson = scenario.lessonId;
  const anchor = useAnchor(numberOrNull(reading?.encoderTicks));
  const position = primaryProgress(lesson, reading, progress, anchor);
  const scene: SceneProps = { reading, progress, highlight, motion, running };
  const reached = progress.complete;
  const signal = reading ? (running ? 'run live' : 'reading') : 'waiting';

  return (
    <section
      data-testid="robot-stage"
      data-lesson={lesson}
      data-reading={reading ? JSON.stringify(reading) : ''}
      data-robot-position={position.toFixed(3)}
      data-target={primaryTargetLabel(lesson, progress)}
      data-motion={motion ? 'on' : 'off'}
      aria-label={
        'Robot arena for ' + lesson + ': ' + title + '. ' +
        (reading ? progress.met + ' of ' + progress.total + ' targets reached.' : 'Waiting for a run.')
      }
      className="flex flex-col gap-2"
    >
      <div className="robot-arena">
        <div className="flex items-center justify-between gap-2 px-3 pb-1 pt-2.5">
          <span className="font-round text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
            {lesson} · {title}
          </span>
          <span
            className="font-round text-[10px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: running ? 'var(--emerald)' : reading ? 'var(--accent)' : 'var(--dim)' }}
          >
            {signal}
          </span>
        </div>
        <svg viewBox="0 0 360 210" role="img" aria-label={title}>
          <ArenaBackground />
          {lesson === 'P.1' && <P1Scene {...scene} />}
          {lesson === 'P.3' && <P3Scene {...scene} />}
          {lesson === 'P.4' && <P4Scene {...scene} />}
          {lesson === 'P.5' && <P5Scene {...scene} />}
        </svg>
      </div>

      {line !== null && lineText && (
        <div className="flex min-w-0 items-center gap-2 rounded-xl border border-line-soft bg-canvas px-2.5 py-1.5">
          <span className="font-round shrink-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-accent">
            line {line}
          </span>
          <code
            data-testid="robot-code-line"
            title={lineText}
            className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11.5px] text-body"
          >
            {lineText}
          </code>
        </div>
      )}

      {lesson === 'P.1' && (
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

      {lesson === 'P.3' && (
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          <Tile label="High" value={shown(reading?.rawHigh) + ' → ' + shown(reading?.clampedHigh)} />
          <Tile label="Low" value={shown(reading?.rawLow) + ' → ' + shown(reading?.clampedLow)} />
          <Tile
            label="Safe output"
            value={shown(reading?.safeOutput)}
            tone={reading?.safeOutput === 0 ? 'good' : reading?.safeOutput == null ? undefined : 'warn'}
          />
          <Tile
            label="E-stop"
            value={shownBoolean(reading?.eStopPressed, 'Pressed', 'Clear')}
            tone={reading?.eStopPressed === true ? 'warn' : reading?.eStopPressed === false ? 'good' : undefined}
          />
        </div>
      )}

      {lesson === 'P.4' && (
        <div className="flex flex-col gap-1.5">
          <CommandReadout reading={reading} />
          <div className="grid grid-cols-3 gap-1.5">
            <Tile
              label="Values"
              value={reading?.clampedCommands ? String(reading.clampedCommands.length) : '—'}
            />
            <Tile label="Total" value={shown(reading?.totalCommand)} />
            <Tile label="Mean" value={shown(reading?.meanCommand)} />
          </div>
        </div>
      )}

      {lesson === 'P.5' && (
        <div className="grid grid-cols-3 gap-1.5">
          <Tile label="Position" value={shown(reading?.positionM, ' m')} />
          <Tile label="Velocity" value={shown(reading?.velocityMS, ' m/s')} />
          <Tile label="Steps" value={shown(reading?.step)} />
        </div>
      )}

      <p className="text-[11px] leading-snug text-muted">
        {reached
          ? 'Every target matches this run. The lesson verdict still belongs to Run & Verify.'
          : 'A view of your code’s own values — it never edits or grades main.py.'}
      </p>
    </section>
  );
}
