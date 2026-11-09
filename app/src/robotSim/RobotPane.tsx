/**
 * The robot tab (app/src/robotSim/RobotPane.tsx).
 *
 * It watches the one editor, main.py. Run robot sends the learner's current code plus one read-only
 * probe and draws the names that run binds; it never writes the editor, loads an example, or grades
 * the lesson. The stage is the game view, and missing values stay placeholders.
 */
import { useEffect, useRef, useState } from 'react';
import { Play, RotateCcw } from 'lucide-react';
import type { RobotCommandMessage, RobotReading, RobotReply, RobotRunApi } from './model';
import { parseRobotReading, robotScenario } from './model';
import { RobotStage } from './RobotStage';

type RobotSpeed = 'slow' | 'normal' | 'fast';
type RobotStep = { line: number; reading: RobotReading | null };

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

export default function RobotPane({ lessonId, robot }: { lessonId: string; robot: RobotRunApi }) {
  const scenario = robotScenario(lessonId);
  const [reading, setReading] = useState<RobotReading | null>(null);
  const [hasRun, setHasRun] = useState(false);
  const [line, setLine] = useState<number | null>(null);
  const [speed, setSpeed] = useState<RobotSpeed>('normal');
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

  const cancelDemo = () => {
    queueGenerationRef.current += 1;
    queueRef.current = [];
    drainingRef.current = false;
    setDemoActive(false);
  };

  // A different lesson is a different set of names: the old readout would describe code that is
  // no longer on screen. `showLine` closes over the editor ref, not this render's state, so the
  // lesson id is the only value that should restart this effect.
  useEffect(() => {
    cancelDemo();
    finalReadRef.current = false;
    setReading(null);
    setHasRun(false);
    setLine(null);
    robot.showLine(null);
  }, [lessonId]);

  useEffect(() => {
    if (robot.isRunning || finalReadRef.current) return;
    if (!demoActive && !hasRun && queueRef.current.length === 0) return;
    // The run ended without its final probe (a failure or a stop): do not keep presenting the
    // lines a failed program reached.
    cancelDemo();
    setReading(null);
    setHasRun(false);
    setLine(null);
    robot.showLine(null);
  }, [robot.isRunning, demoActive, hasRun]);

  useEffect(() => {
    return () => {
      queueGenerationRef.current += 1;
      queueRef.current = [];
      robot.showLine(null);
    };
  }, []);

  if (!scenario) {
    return <p className="p-4 text-[12px] text-muted">This lesson has no robot view.</p>;
  }

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
      try {
        while (queueRef.current.length > 0) {
          const frame = queueRef.current.shift();
          if (!frame) break;
          if (generation !== queueGenerationRef.current) return;
          if (frame.line === 0) {
            setLine(null);
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
          robot.showLine(frame.line);
          await waitForRobotStep(speedRef.current);
        }
      } finally {
        if (generation === queueGenerationRef.current) {
          drainingRef.current = false;
          setDemoActive(false);
        }
      }
    })();
  };

  const handleCommand = async (message: RobotCommandMessage): Promise<RobotReply> => {
    if (message.command !== 'telemetry') {
      return { error: "'" + message.command + "' is not part of this robot view." };
    }
    const next = parseRobotReading(message.args);
    if (message.line > 0) {
      queueRef.current.push({
        line: message.line,
        reading: next && hasReadingValue(next) ? next : null,
      });
      startDrain();
      return {};
    }
    finalReadRef.current = true;
    queueRef.current.push({ line: 0, reading: next });
    startDrain();
    return {};
  };

  const start = () => {
    cancelDemo();
    finalReadRef.current = false;
    setReading(null);
    setHasRun(false);
    setLine(null);
    robot.showLine(null);
    robot.start(scenario, handleCommand);
  };

  const reset = () => {
    cancelDemo();
    if (robot.isRunning) robot.stop();
    finalReadRef.current = false;
    setReading(null);
    setHasRun(false);
    setLine(null);
    robot.showLine(null);
  };

  const busy = robot.isRunning || demoActive;
  const status = busy
    ? line === null
      ? 'Running main.py…'
      : `Running main.py · line ${line}…`
    : hasRun
      ? 'Values read from main.py.'
      : 'Run robot to read main.py.';

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-3 bg-panel px-3 py-3 sm:px-4"
      data-testid="robot-pane"
      data-tab="1"
      data-running-line={line ?? ''}
      data-speed={speed}
    >
      <div className="flex flex-wrap items-start gap-x-2 gap-y-1.5">
        <div className="min-w-0 flex-1">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
            Robot · {scenario.lessonId}
          </span>
          <p className="mt-0.5 text-[11px] leading-snug text-muted">
            Watching main.py; it never edits or grades your code.
          </p>
        </div>
        <div className="flex w-full items-center gap-1.5 sm:w-auto">
          <button
            type="button"
            data-testid="robot-run"
            onClick={start}
            disabled={!robot.pauseCapable || busy}
            className="inline-flex min-h-10 flex-1 items-center justify-center gap-1 rounded border border-accent/40 bg-accent/10 px-2.5 py-1 text-[12px] font-medium text-accent disabled:opacity-40 sm:min-h-8 sm:flex-none"
          >
            <Play className="h-3 w-3" aria-hidden="true" /> Run robot
          </button>
          <button
            type="button"
            data-testid="robot-reset"
            onClick={reset}
            className="inline-flex min-h-10 flex-1 items-center justify-center gap-1 rounded border border-line-soft px-2.5 py-1 text-[12px] sm:min-h-8 sm:flex-none"
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" /> Reset
          </button>
        </div>
      </div>

      <RobotStage scenario={scenario} reading={reading} />

      <div className="flex flex-wrap items-center gap-2">
        <span
          className="text-[11px] text-muted"
          role="status"
          data-testid="robot-status"
          data-state={busy ? 'running' : hasRun ? 'finished' : 'idle'}
        >
          {status}
        </span>
        {!robot.pauseCapable && (
          <span className="text-[11px] text-muted">
            The robot needs shared memory; this page is not cross-origin isolated.
          </span>
        )}
        <div
          className="ml-auto flex items-center gap-1.5"
          data-testid="robot-speed-control"
          title="Pace the line-by-line demonstration only; the program and its reading do not change."
        >
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
            Speed
          </span>
          <div
            role="group"
            aria-label="Robot step speed"
            className="inline-flex rounded border border-line-soft bg-canvas p-0.5"
          >
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
                  className={`rounded px-2 py-1 font-mono text-[10px] transition-colors ${
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
  );
}
