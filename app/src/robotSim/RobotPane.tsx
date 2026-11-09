/**
 * The robot tab (app/src/robotSim/RobotPane.tsx).
 *
 * It watches the one editor, main.py. Run robot sends the learner's current code plus one read-only
 * probe and draws the names that run binds; it never writes the editor, loads an example, or grades
 * the lesson. The stage is the game view, and missing values stay placeholders.
 */
import { useEffect, useState } from 'react';
import { Play, RotateCcw } from 'lucide-react';
import type { RobotCommandMessage, RobotReading, RobotReply, RobotRunApi } from './model';
import { parseRobotReading, robotScenario } from './model';
import { RobotStage } from './RobotStage';

export default function RobotPane({ lessonId, robot }: { lessonId: string; robot: RobotRunApi }) {
  const scenario = robotScenario(lessonId);
  const [reading, setReading] = useState<RobotReading | null>(null);
  const [hasRun, setHasRun] = useState(false);

  // A different lesson is a different set of names: the old readout would describe code that is
  // no longer on screen.
  useEffect(() => {
    setReading(null);
    setHasRun(false);
  }, [lessonId]);

  if (!scenario) {
    return <p className="p-4 text-[12px] text-muted">This lesson has no robot view.</p>;
  }

  const handleCommand = async (message: RobotCommandMessage): Promise<RobotReply> => {
    if (message.command !== 'telemetry') {
      return { error: "'" + message.command + "' is not part of this robot view." };
    }
    const next = parseRobotReading(message.args);
    if (next) {
      setReading(next);
      setHasRun(true);
    }
    return {};
  };

  const start = () => {
    setReading(null);
    setHasRun(false);
    robot.start(scenario, handleCommand);
  };

  const reset = () => {
    if (robot.isRunning) robot.stop();
    setReading(null);
    setHasRun(false);
  };

  const status = robot.isRunning
    ? 'Running main.py…'
    : hasRun
      ? 'Values read from main.py.'
      : 'Run robot to read main.py.';

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-3 bg-panel px-3 py-3 sm:px-4"
      data-testid="robot-pane"
      data-tab="1"
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
