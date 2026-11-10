/**
 * The robot tab (app/src/robotSim/RobotPane.tsx).
 *
 * It watches the one editor, main.py. Run robot sends the learner's current code plus one read-only
 * probe and draws the names that run binds; it never writes the editor, loads an example, or grades
 * the lesson. The mission above the arena is the lesson's own goal in values the learner can watch:
 * each chip is compared with the reading, and the scene moves toward the lesson's expected target
 * instead of a decorative end point.
 *
 * Readings arrive as fast as Python runs, so they are queued and presented at the chosen speed. A
 * Replay plays that same queue again without touching Python, the editor or the lesson's verdict.
 */
import { useEffect, useRef, useState } from 'react';
import { Play, RotateCcw, Sparkles } from 'lucide-react';
import type { RobotCommandMessage, RobotReading, RobotReply, RobotRunApi } from './model';
import { parseRobotReading, robotScenario } from './model';
import {
  NO_ROBOT_PROGRESS,
  formatCurrent,
  missionFor,
  robotProgress,
  sourceLinesForFrames,
  type RobotProgress,
  type RobotSourceFrame,
  type RobotSourceLines,
} from './robotMission';
import { RobotStage } from './RobotStage';
import { RobotCoach } from './RobotCoach';
import {
  dismissRobotTour,
  nextRobotTour,
  previousRobotTour,
  readRobotTour,
  robotTourStepAt,
  startRobotTour,
  writeRobotTour,
  type RobotTourState,
} from './robotTour';
import { readTour as readGlobalTour } from '../tourState';
import { motionEnabled, subscribeMotion } from '../motionPrefs';

type RobotSpeed = 'slow' | 'normal' | 'fast';
type RobotStep = { line: number; reading: RobotReading | null; text: string | null };

const ROBOT_SPEEDS = [
  { id: 'slow', label: '0.5×', title: 'Half speed: about 360 ms between lines' },
  { id: 'normal', label: '1×', title: 'Normal speed: about 180 ms between lines' },
  { id: 'fast', label: '2×', title: 'Double speed: about 90 ms between lines' },
] as const satisfies readonly { id: RobotSpeed; label: string; title: string }[];

const ROBOT_STEP_MS: Record<RobotSpeed, number> = { slow: 360, normal: 180, fast: 90 };

/** Hold each step long enough to read after its frame paints. This runs in the page, after the
 * worker has answered, so the demonstration's pace never becomes part of the program's execution
 * budget. A hidden tab paints nothing, so it answers immediately instead of charging time for
 * frames nobody sees. */
async function waitForRobotStep(speed: RobotSpeed): Promise<void> {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  if (typeof requestAnimationFrame !== 'function') return;
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, ROBOT_STEP_MS[speed]));
  });
}

/** A line before its first assignment is a place to stand, not a reading to draw. */
function hasReadingValue(reading: RobotReading): boolean {
  return Object.values(reading).some((value) => value !== null && value !== undefined);
}

function SignalMark({ met }: { met: boolean }) {
  return (
    <svg viewBox="0 0 18 18" className="h-4 w-4 shrink-0" aria-hidden="true">
      <circle cx="9" cy="9" r="7.4" fill="none" stroke={met ? 'var(--emerald)' : 'var(--dim)'} strokeWidth="1.2" />
      <circle cx="9" cy="9" r={met ? 3.1 : 2} fill={met ? 'var(--emerald)' : 'var(--dim)'} />
      {met && <circle cx="9" cy="9" r="5.4" fill="none" stroke="var(--emerald)" strokeOpacity="0.35" />}
    </svg>
  );
}

function LaunchBar({
  lessonId,
  status,
  state,
  busy,
  canRun,
  onRun,
  onReset,
}: {
  lessonId: string;
  status: string;
  state: 'idle' | 'running' | 'finished';
  busy: boolean;
  canRun: boolean;
  onRun: () => void;
  onReset: () => void;
}) {
  return (
    <div className="robot-launchbar">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <span className="robot-live-dot" data-live={busy ? 'true' : 'false'} aria-hidden="true" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="font-round text-[12px] font-semibold uppercase tracking-[0.14em] text-ink">
              {lessonId} · robot link
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">ungraded</span>
          </div>
          <p
            className="mt-0.5 truncate text-[11.5px] font-medium text-muted"
            role="status"
            data-testid="robot-status"
            data-state={state}
          >
            {status}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          data-testid="robot-reset"
          onClick={onReset}
          aria-label="Reset robot view"
          title="Clear the reading and the arena."
          className="robot-reset"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          data-testid="robot-run"
          data-robot-tour="run"
          onClick={onRun}
          disabled={!canRun || busy}
          className="robot-launch"
        >
          <Play className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{busy ? 'Linking…' : 'Run robot'}</span>
        </button>
      </div>
    </div>
  );
}

function SignalDeck({
  progress,
  activeKey,
  onPick,
  robot,
  busy,
  sources,
  onShowSource,
}: {
  progress: RobotProgress;
  activeKey: keyof RobotReading | null;
  onPick: (key: keyof RobotReading) => void;
  robot: RobotRunApi;
  busy: boolean;
  sources: RobotSourceLines;
  onShowSource: (line: number) => void;
}) {
  const state = !progress.started ? 'idle' : progress.complete ? 'reached' : 'working';
  const active = activeKey ? progress.rows.find((row) => row.target.key === activeKey) : null;
  const percent = progress.total ? Math.round((progress.met / progress.total) * 100) : 0;
  // A selected chip can name the line behind its current value. The quote is read from the source
  // the run actually executed, not from the editor's later draft.
  const activeLine = active ? sources[active.target.key] : undefined;
  const activeText = activeLine === undefined ? null : robot.readLine(activeLine);

  return (
    <section
      data-testid="robot-mission"
      data-goal-state={state}
      data-goal-met={progress.met}
      data-goal-total={progress.total}
      className="robot-signal-deck"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="robot-deck-kicker">
          <span className="robot-deck-pulse" aria-hidden="true" />
          live signals
        </span>
        <span className="font-round text-[11.5px] font-semibold tabular-nums text-muted">
          {progress.met}/{progress.total} linked
        </span>
      </div>

      <div className="robot-signal-meter" aria-hidden="true">
        <div className="robot-signal-meter-fill" style={{ width: percent + '%' }} />
      </div>

      <ul data-robot-tour="targets" className="m-0 mt-2.5 flex list-none flex-wrap gap-1.5 p-0">
        {progress.rows.map((row) => {
          const selected = activeKey === row.target.key;
          const source = sources[row.target.key];
          return (
            <li key={String(row.target.key)}>
              <button
                type="button"
                data-testid={'robot-goal-' + String(row.target.key)}
                data-met={row.met ? 'true' : 'false'}
                data-source-line={source === undefined ? '' : String(source)}
                aria-pressed={selected}
                title={row.target.hint}
                onClick={() => onPick(row.target.key)}
                className="robot-goal-chip max-w-full flex-wrap"
              >
                <SignalMark met={row.met} />
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                  {row.target.label}
                </span>
                <span className="font-round text-[15px] font-semibold leading-none text-ink tabular-nums">
                  {formatCurrent(row)}
                </span>
                {source !== undefined && (
                  <span
                    data-testid={'robot-goal-line-' + String(row.target.key)}
                    title={'main.py line ' + source}
                    className="rounded-full border border-line-soft bg-canvas px-1.5 py-0.5 font-round text-[10px] font-semibold leading-none text-muted"
                  >
                    L{source}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {active && (
        <div
          data-testid="robot-goal-hint"
          className="mt-2 rounded-xl border border-accent/25 bg-canvas px-2.5 py-2"
        >
          <p className="text-[12px] leading-snug text-accent">{active.target.hint}</p>
          {activeLine !== undefined ? (
            <button
              type="button"
              data-testid="robot-goal-source"
              onClick={() => onShowSource(activeLine)}
              disabled={busy}
              title={
                busy
                  ? 'The line box is following the run; this pointer is ready when it finishes.'
                  : 'Show this line in main.py'
              }
              className="mt-1.5 flex w-full min-w-0 items-center gap-2 rounded-lg border border-line-soft bg-panel px-2 py-1 text-left transition-colors hover:border-accent/50 disabled:opacity-70"
            >
              <span className="font-round shrink-0 text-[11px] font-semibold text-accent">
                main.py:{activeLine}
              </span>
              {activeText && (
                <code className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px] text-body">
                  {activeText}
                </code>
              )}
            </button>
          ) : (
            <p className="mt-1 text-[11px] text-muted">
              {busy
                ? 'Tracing this value back to main.py…'
                : 'Run robot to trace the line that writes this value.'}
            </p>
          )}
        </div>
      )}

      {progress.complete && (
        <p
          data-testid="robot-goal-banner"
          className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-emerald"
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Signal locked. Every value in this run
          agrees.
        </p>
      )}
    </section>
  );
}

export default function RobotPane({ lessonId, robot }: { lessonId: string; robot: RobotRunApi }) {
  const scenario = robotScenario(lessonId);
  const mission = scenario ? missionFor(scenario) : null;
  const [reading, setReading] = useState<RobotReading | null>(null);
  const [hasRun, setHasRun] = useState(false);
  const [line, setLine] = useState<number | null>(null);
  const [lineText, setLineText] = useState<string | null>(null);
  const [speed, setSpeed] = useState<RobotSpeed>('normal');
  const [activeKey, setActiveKey] = useState<keyof RobotReading | null>(null);
  const [sources, setSources] = useState<RobotSourceLines>({});
  const [motion, setMotion] = useState(() => motionEnabled());
  // A first-run guide for the three controls this tab adds. Its record is separate from the
  // first-lesson tour, and the mount is the only place that decides whether to offer it.
  const [robotTour, setRobotTour] = useState<RobotTourState>(() => readRobotTour());
  const [tourOpen, setTourOpen] = useState<boolean>(() => {
    if (typeof document === 'undefined') return false;
    const stored = readRobotTour();
    if (stored.status === 'completed' || stored.status === 'dismissed') return false;
    // The six-step lesson tour owns the screen first; two coach marks at once is one too many.
    if (readGlobalTour().status === 'active') return false;
    return true;
  });
  // The command callback closes over the run that started, so the live choice rides a ref: a speed
  // picked while the robot is moving changes the remaining lines without starting another run.
  const speedRef = useRef<RobotSpeed>('normal');
  // A run that fails after binding a value should not leave the last partial reading on screen.
  // The final probe is the one line-0 message; without it the run did not finish, so the stage
  // clears as soon as the run stops.
  const finalReadRef = useRef(false);
  // Worker messages arrive as fast as Python runs; this queue is the presentation clock. It lets
  // the lesson finish on its own budget while the robot and line box keep moving at the chosen
  // speed, and a new run or Reset invalidates whatever the old queue had left.
  const queueRef = useRef<RobotStep[]>([]);
  const queueGenerationRef = useRef(0);
  const drainingRef = useRef(false);
  const [demoActive, setDemoActive] = useState(false);
  // Every successful run leaves its frames behind, so Replay can show the same motion again without
  // executing Python a second time.
  const recordRef = useRef<RobotStep[]>([]);
  const recordedRef = useRef<RobotStep[]>([]);
  const [replayActive, setReplayActive] = useState(false);
  const progress = scenario ? robotProgress(reading, scenario) : NO_ROBOT_PROGRESS;

  useEffect(() => subscribeMotion(setMotion), []);

  // Opening the Robot tab is this guide's first run. A stored `active` record resumes at its step;
  // a pristine one starts at Run. Mount-only: changing lesson must not restart a guide mid-walk.
  useEffect(() => {
    if (!tourOpen || robotTour.status === 'active') return;
    setRobotTour(writeRobotTour(startRobotTour(robotTour)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancelDemo = () => {
    queueGenerationRef.current += 1;
    queueRef.current = [];
    drainingRef.current = false;
    setDemoActive(false);
    setReplayActive(false);
    setSources({});
  };

  // A different lesson is a different set of names: the old readout would describe code that is
  // no longer on screen. `showLine` closes over the editor ref, not this render's state, so the
  // lesson id is the only value that should restart this effect.
  useEffect(() => {
    cancelDemo();
    finalReadRef.current = false;
    recordRef.current = [];
    recordedRef.current = [];
    setReading(null);
    setHasRun(false);
    setLine(null);
    setLineText(null);
    setActiveKey(null);
    robot.showLine(null);
  }, [lessonId]);

  useEffect(() => {
    if (robot.isRunning || finalReadRef.current) return;
    if (!demoActive && !hasRun && queueRef.current.length === 0) return;
    // The run ended without its final probe (a failure or a stop): do not keep presenting the
    // lines a failed program reached, and do not offer to replay them.
    cancelDemo();
    recordedRef.current = [];
    setReading(null);
    setHasRun(false);
    setLine(null);
    setLineText(null);
    robot.showLine(null);
  }, [robot.isRunning, demoActive, hasRun]);

  useEffect(() => {
    return () => {
      queueGenerationRef.current += 1;
      queueRef.current = [];
      robot.showLine(null);
    };
  }, []);

  if (!scenario || !mission) {
    return <p className="p-4 text-[12px] text-muted">This lesson has no robot view.</p>;
  }

  const busy = robot.isRunning || demoActive;
  const tourStep = robotTourStepAt(robotTour.stepIndex);

  const advanceTour = () => {
    const next = nextRobotTour(robotTour);
    setRobotTour(writeRobotTour(next));
    if (next.status !== 'active') setTourOpen(false);
  };
  const backTour = () => setRobotTour(writeRobotTour(previousRobotTour(robotTour)));
  const dismissTour = () => {
    setRobotTour(writeRobotTour(dismissRobotTour(robotTour)));
    setTourOpen(false);
  };
  const showTour = () => {
    setRobotTour(writeRobotTour(startRobotTour(robotTour)));
    setTourOpen(true);
  };

  const chooseSpeed = (next: RobotSpeed) => {
    speedRef.current = next;
    setSpeed(next);
  };

  const startDrain = () => {
    if (drainingRef.current) return;
    drainingRef.current = true;
    void (async () => {
      setDemoActive(true);
      const generation = queueGenerationRef.current;
      // The frames this drain has actually presented, in order: a chip must not point at a line the
      // viewer has not reached yet, and a replay rebuilds the same pointers from its own frames.
      const presented: RobotSourceFrame[] = [];
      try {
        while (queueRef.current.length > 0) {
          const frame = queueRef.current.shift();
          if (!frame) break;
          if (generation !== queueGenerationRef.current) return;
          presented.push(frame);
          setSources(sourceLinesForFrames(presented, mission, robot.readSource()));
          if (frame.line === 0) {
            setLine(null);
            setLineText(null);
            robot.showLine(null);
            if (frame.reading) {
              setReading(frame.reading);
              setHasRun(true);
            }
            break;
          }
          if (frame.reading) {
            setReading(frame.reading);
            setHasRun(true);
          }
          setLine(frame.line);
          setLineText(frame.text);
          robot.showLine(frame.line);
          await waitForRobotStep(speedRef.current);
        }
      } finally {
        if (generation === queueGenerationRef.current) {
          drainingRef.current = false;
          setDemoActive(false);
          setReplayActive(false);
        }
      }
    })();
  };

  const handleCommand = async (message: RobotCommandMessage): Promise<RobotReply> => {
    if (message.command !== 'telemetry') {
      return { error: "'" + message.command + "' is not part of this robot view." };
    }
    const next = parseRobotReading(message.args);
    const frame: RobotStep = {
      line: message.line,
      reading: next && (message.line === 0 || hasReadingValue(next)) ? next : null,
      text: message.line > 0 ? robot.readLine(message.line) : null,
    };
    if (message.line > 0) {
      queueRef.current.push(frame);
      recordRef.current.push(frame);
      startDrain();
      return {};
    }
    finalReadRef.current = true;
    queueRef.current.push(frame);
    // The final probe is the last message of a complete run, so its arrival is the moment the
    // whole run can be replayed. The frames are its motion, and the final reading is its arrival:
    // without recording that last frame a replay would stop on the line before the goal.
    if (frame.reading) recordRef.current.push({ line: 0, reading: frame.reading, text: null });
    recordedRef.current = recordRef.current.slice();
    startDrain();
    return {};
  };

  const start = () => {
    cancelDemo();
    finalReadRef.current = false;
    recordRef.current = [];
    recordedRef.current = [];
    setReplayActive(false);
    setReading(null);
    setHasRun(false);
    setLine(null);
    setLineText(null);
    setActiveKey(null);
    robot.showLine(null);
    robot.start(scenario, handleCommand);
  };

  const startReplay = () => {
    if (busy || recordedRef.current.length === 0) return;
    cancelDemo();
    queueRef.current = recordedRef.current.map((frame) => ({
      ...frame,
      reading: frame.reading ? { ...frame.reading } : null,
    }));
    setReplayActive(true);
    setActiveKey(null);
    setReading(null);
    setHasRun(false);
    setLine(null);
    setLineText(null);
    robot.showLine(null);
    startDrain();
  };

  const reset = () => {
    cancelDemo();
    if (robot.isRunning) robot.stop();
    finalReadRef.current = false;
    recordRef.current = [];
    recordedRef.current = [];
    setReading(null);
    setHasRun(false);
    setLine(null);
    setLineText(null);
    setActiveKey(null);
    robot.showLine(null);
  };

  // Selecting a chip points at its source only when the box is the learner's to move: during a run
  // the same decoration is following the interpreter, and a tap must not pull it off that line.
  const pickTarget = (key: keyof RobotReading) => {
    const next = activeKey === key ? null : key;
    setActiveKey(next);
    if (busy) return;
    robot.showLine(next === null ? null : (sources[next] ?? null));
  };

  const status = busy
    ? replayActive
      ? 'Replaying the last run…'
      : line === null
        ? 'Running main.py…'
        : `Running main.py · line ${line}…`
    : hasRun
      ? progress.complete
        ? 'Link stable. Every value agrees.'
        : `${progress.met} of ${progress.total} signals linked.`
      : 'Link ready. Press Run robot.';

  return (
    <div
      className="robot-pane flex min-h-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto px-3 py-3 sm:px-4"
      data-testid="robot-pane"
      data-tab="1"
      data-running-line={line ?? ''}
      data-speed={speed}
      data-motion={motion ? 'on' : 'off'}
      data-replay={replayActive ? 'true' : 'false'}
    >
      {tourOpen && (
        <RobotCoach
          step={tourStep}
          index={robotTour.stepIndex}
          onNext={advanceTour}
          onBack={backTour}
          onDismiss={dismissTour}
        />
      )}

      <div className="robot-cockpit">
        <LaunchBar
          lessonId={scenario.lessonId}
          status={status}
          state={busy ? 'running' : hasRun ? 'finished' : 'idle'}
          busy={busy}
          canRun={robot.pauseCapable}
          onRun={start}
          onReset={reset}
        />

        <RobotStage
          key={scenario.lessonId}
          scenario={scenario}
          reading={reading}
          progress={progress}
          highlight={activeKey}
          motion={motion}
          running={busy && !replayActive}
          line={line}
          lineText={lineText}
        />
      </div>

      <SignalDeck
        progress={progress}
        activeKey={activeKey}
        onPick={pickTarget}
        robot={robot}
        busy={busy}
        sources={sources}
        onShowSource={(line) => robot.showLine(line)}
      />

      <div className="flex flex-wrap items-center gap-2">
        {!tourOpen && (
          <button
            type="button"
            data-testid="robot-tour-show"
            onClick={showTour}
            title="Show the three-step Robot guide again."
            className="inline-flex min-h-8 shrink-0 items-center rounded-full border border-line-soft px-2.5 text-[12px] font-semibold text-muted transition-colors hover:text-ink"
          >
            Show guide
          </button>
        )}
        {!robot.pauseCapable && (
          <span className="text-[11px] text-muted">
            The robot needs shared memory; this page is not cross-origin isolated.
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            data-testid="robot-replay"
            data-robot-tour="replay"
            onClick={startReplay}
            disabled={busy || recordedRef.current.length === 0}
            title="Play the last run’s motion again without running Python."
            className="inline-flex min-h-8 items-center gap-1 rounded-full border border-line-soft px-2.5 text-[12px] font-semibold text-muted transition-colors hover:text-ink disabled:opacity-40"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Replay
          </button>
          <div
            className="flex items-center gap-1.5"
            data-testid="robot-speed-control"
            title="Pace the line-by-line demonstration only; the program and its reading do not change."
          >
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Speed</span>
            <div role="group" aria-label="Robot step speed" className="inline-flex rounded-full border border-line-soft bg-canvas p-0.5">
              {ROBOT_SPEEDS.map((option) => {
                const active = speed === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    data-testid={`robot-speed-${option.id}`}
                    aria-pressed={active}
                    aria-label={`${option.label} robot speed`}
                    title={option.title}
                    onClick={() => chooseSpeed(option.id)}
                    className={`rounded-full px-2.5 py-1 font-round text-[12px] font-semibold transition-colors ${
                      active ? 'bg-accent text-inverse' : 'text-muted hover:text-ink'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
