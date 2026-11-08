/**
 * The Robot tab (`app/src/robotSim/RobotPane.tsx`): the lesson's scenario, its controls, and the stage.
 *
 * Python executes in the runner's one worker; every robot call is answered here. The new state is
 * stored *before* the pacing delay, so animation can never change the outcome. The pane recreates the
 * scenario from the lesson id, which keeps the model and all of this out of the entry bundle.
 */
import { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, StepForward } from 'lucide-react';
import type { RobotCommandMessage, RobotReply, RobotRunApi, RobotState } from './model';
import { applyCommand, freshRobot, robotScenario } from './model';
import { RobotStage } from './RobotStage';

declare global {
  interface Window {
    /** Test override: how long one robot command is paced, in milliseconds. */
    __mechalabRobotStepMs?: number;
  }
}

const DEFAULT_STEP_MS = 140;

export function RobotPane({
  lessonId,
  robot,
  onLoadExample,
}: {
  lessonId: string;
  robot: RobotRunApi;
  onLoadExample?: (code: string) => void;
}) {
  const scenario = robotScenario(lessonId);
  const [state, setState] = useState(() => (scenario ? freshRobot(scenario) : null));
  const stateRef = useRef<RobotState | null>(state);
  const [said, setSaid] = useState<string | undefined>(undefined);
  const [line, setLine] = useState(0);
  const [command, setCommand] = useState('');
  const [sensors, setSensors] = useState<Record<string, boolean | number>>({});
  const [hasRun, setHasRun] = useState(false);
  const [note, setNote] = useState('');

  const resetToStart = () => {
    if (!scenario) return;
    const fresh = freshRobot(scenario);
    stateRef.current = fresh;
    setState(fresh);
    setSaid(undefined);
    setLine(0);
    setCommand('');
    setSensors({});
    setNote('');
  };

  // A different lesson is a different world: the old square and trail do not describe it.
  useEffect(() => {
    resetToStart();
    setHasRun(false);
  }, [lessonId]);

  if (!scenario || !state) {
    return <p className="p-4 text-[12px] text-muted">This lesson has no robot scenario.</p>;
  }

  const completed = state.x === scenario.target.x && state.y === scenario.target.y;
  const status = !robot.isRunning
    ? hasRun
      ? 'Run finished. The stage keeps the last state.'
      : 'Ready.'
    : robot.paused
      ? 'Paused — Step one command or Resume.'
      : 'Running…';

  const handleCommand = async (message: RobotCommandMessage): Promise<RobotReply> => {
    const outcome = applyCommand(scenario, stateRef.current ?? state, message.command, message.args);
    stateRef.current = outcome.state;
    // Paint the outcome first; the wait below is animation, never rule-making.
    setState(outcome.state);
    setLine(message.line);
    setCommand(message.command);
    if (outcome.said !== undefined) setSaid(outcome.said);
    if (message.command === 'wall_ahead' || message.command === 'wall_distance') {
      const value = outcome.reply.value;
      if (typeof value === 'boolean' || typeof value === 'number') {
        setSensors((previous) => ({ ...previous, [message.command]: value }));
      }
    }
    setNote(outcome.blocked ? 'A wall stopped the robot.' : '');
    const stepMs = window.__mechalabRobotStepMs ?? DEFAULT_STEP_MS;
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, stepMs)));
    return outcome.reply;
  };

  const start = () => {
    resetToStart();
    setHasRun(true);
    robot.start(scenario, handleCommand);
  };

  const reset = () => {
    robot.stop();
    resetToStart();
    setHasRun(false);
  };

  return (
    <div className="flex flex-col gap-3 p-3" data-testid="robot-pane">
      <div>
        <div className="flex flex-wrap items-baseline gap-2">
          <h3 className="text-sm font-semibold text-ink">{scenario.title}</h3>
          <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[11px] font-medium text-accent">
            {scenario.concept}
          </span>
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-muted">{scenario.objective}</p>
        <p className="mt-1 text-[12px] leading-relaxed text-muted">
          <span className="font-semibold text-accent">Try it: </span>
          {scenario.challenge}
        </p>
      </div>

      <RobotStage scenario={scenario} state={state} said={said} completed={completed} />
      <span
        hidden
        data-testid="robot-sensors"
        data-wall-ahead={sensors.wall_ahead === undefined ? '' : String(sensors.wall_ahead)}
        data-wall-distance={sensors.wall_distance === undefined ? '' : String(sensors.wall_distance)}
      />

      <div className="flex flex-wrap items-center gap-2" data-testid="robot-controls">
        <button
          type="button"
          data-testid="robot-run"
          onClick={start}
          disabled={!robot.pauseCapable || robot.isRunning}
          className="inline-flex items-center gap-1 rounded border border-accent/40 bg-accent/10 px-2.5 py-1 text-[12px] font-medium text-accent disabled:opacity-40"
        >
          <Play className="h-3 w-3" aria-hidden="true" /> Run
        </button>
        <button
          type="button"
          data-testid="robot-pause"
          onClick={robot.pause}
          disabled={!robot.isRunning || robot.paused}
          className="inline-flex items-center gap-1 rounded border border-line-soft px-2.5 py-1 text-[12px] disabled:opacity-40"
        >
          <Pause className="h-3 w-3" aria-hidden="true" /> Pause
        </button>
        <button
          type="button"
          data-testid="robot-resume"
          onClick={robot.resume}
          disabled={!robot.paused}
          className="inline-flex items-center gap-1 rounded border border-line-soft px-2.5 py-1 text-[12px] disabled:opacity-40"
        >
          <Play className="h-3 w-3" aria-hidden="true" /> Resume
        </button>
        <button
          type="button"
          data-testid="robot-step"
          onClick={robot.step}
          disabled={!robot.paused}
          className="inline-flex items-center gap-1 rounded border border-line-soft px-2.5 py-1 text-[12px] disabled:opacity-40"
        >
          <StepForward className="h-3 w-3" aria-hidden="true" /> Step
        </button>
        <button
          type="button"
          data-testid="robot-reset"
          onClick={reset}
          className="inline-flex items-center gap-1 rounded border border-line-soft px-2.5 py-1 text-[12px]"
        >
          <RotateCcw className="h-3 w-3" aria-hidden="true" /> Reset
        </button>
        <span
          className="ml-auto text-[11px] text-muted"
          role="status"
          data-testid="robot-status"
          data-state={!robot.isRunning ? (hasRun ? 'finished' : 'idle') : robot.paused ? 'paused' : 'running'}
        >
          {note || status}
        </span>
      </div>

      {!robot.pauseCapable && (
        <p className="rounded border border-line-soft bg-panel p-2 text-[12px] text-muted">
          The robot needs shared memory for Stop and Pause, and this page is not cross-origin isolated.
        </p>
      )}

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            This lesson&rsquo;s robot API
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {scenario.commands.map((name) => (
              <code key={name} className="rounded bg-panel px-1.5 py-0.5 font-mono text-[11px] text-ink">
                {name === 'move_forward' ? 'move_forward(steps=1)' : name === 'say' ? 'say(text)' : `${name}()`}
              </code>
            ))}
          </div>
        </div>
        {onLoadExample && (
          <button
            type="button"
            data-testid="robot-load-example"
            onClick={() => onLoadExample(scenario.example)}
            className="self-start rounded border border-line-soft px-2 py-1 text-[12px] text-ink"
          >
            Load example
          </button>
        )}
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Example</p>
        <pre className="mt-1 overflow-x-auto rounded border border-line-soft bg-canvas p-2 font-mono text-[11px] leading-relaxed">
          {scenario.example.split('\n').map((text, index) => (
            <div
              key={index}
              className={index + 1 === line ? 'rounded bg-accent/10 px-1 text-ink' : 'px-1 text-muted'}
            >
              <span className="mr-2 inline-block w-4 select-none text-right opacity-60">{index + 1}</span>
              {text || ' '}
            </div>
          ))}
        </pre>
        <p className="mt-1 text-[11px] text-muted">
          {line > 0 ? `line ${line} · ${command}` : 'Not running'}
        </p>
      </div>

      {completed && (
        <p
          className="rounded border border-accent/40 bg-accent/10 p-2 text-[12px] text-accent"
          data-testid="robot-success"
        >
          On the target. That is the simulator&rsquo;s feedback, not the lesson&rsquo;s grade.
        </p>
      )}
    </div>
  );
}
