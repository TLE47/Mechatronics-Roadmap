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

/** Give the browser one visible frame per step; the worker is blocked on the robot reply, so this
 * is the pace of the demonstration, not a timer racing the program. A hidden tab paints nothing,
 * so it answers immediately instead of charging execution time for frames nobody sees. */
async function nextVisibleFrame(): Promise<void> {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  if (typeof requestAnimationFrame !== 'function') return;
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 0));
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
  // A run that fails after binding a value should not leave the last partial reading on screen.
  // The final probe is the one line-0 message; without it the run did not finish, so the stage
  // clears as soon as the run stops.
  const finalReadRef = useRef(false);

  // A different lesson is a different set of names: the old readout would describe code that is
  // no longer on screen. `showLine` closes over the editor ref, not this render's state, so the
  // lesson id is the only value that should restart this effect.
  useEffect(() => {
    finalReadRef.current = false;
    setReading(null);
    setHasRun(false);
    setLine(null);
    robot.showLine(null);
  }, [lessonId]);

  useEffect(() => {
    if (robot.isRunning || !hasRun || finalReadRef.current) return;
    setReading(null);
    setHasRun(false);
  }, [robot.isRunning, hasRun]);

  if (!scenario) {
    return <p className="p-4 text-[12px] text-muted">This lesson has no robot view.</p>;
  }

  const handleCommand = async (message: RobotCommandMessage): Promise<RobotReply> => {
    if (message.command !== 'telemetry') {
      return { error: "'" + message.command + "' is not part of this robot view." };
    }
    const next = parseRobotReading(message.args);
    if (message.line === 0) finalReadRef.current = true;
    if (next && (message.line === 0 || hasReadingValue(next))) {
      setReading(next);
      setHasRun(true);
    }
    if (message.line > 0) {
      setLine(message.line);
      robot.showLine(message.line);
      await nextVisibleFrame();
    } else {
      setLine(null);
      robot.showLine(null);
    }
    return {};
  };

  const start = () => {
    finalReadRef.current = false;
    setReading(null);
    setHasRun(false);
    setLine(null);
    robot.showLine(null);
    robot.start(scenario, handleCommand);
  };

  const reset = () => {
    if (robot.isRunning) robot.stop();
    finalReadRef.current = false;
    setReading(null);
    setHasRun(false);
    setLine(null);
    robot.showLine(null);
  };

  const status = robot.isRunning
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
            disabled={!robot.pauseCapable || robot.isRunning}
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
          data-state={robot.isRunning ? 'running' : hasRun ? 'finished' : 'idle'}
        >
          {status}
        </span>
        {!robot.pauseCapable && (
          <span className="text-[11px] text-muted">
            The robot needs shared memory; this page is not cross-origin isolated.
          </span>
        )}
      </div>
    </div>
  );
}
