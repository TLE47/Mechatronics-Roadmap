/**
 * Everything the learner sees of the world (`app/src/robotSim/RobotStage.tsx`): the grid, walls, the
 * target, the trail, the sensor ray and the robot. Rules live in `model.ts`; this file only draws
 * what they returned, which is why timing cannot change a lesson's outcome.
 */
import type { RobotScenario, RobotState } from './model';
import { HEADINGS, ahead, wallDistance } from './model';
import { RobotSprite } from './RobotSprite';

export function RobotStage({
  scenario,
  state,
  said,
  completed,
}: {
  scenario: RobotScenario;
  state: RobotState;
  said?: string;
  completed: boolean;
}) {
  const { cols, rows } = scenario;
  const ray = wallDistance(scenario, state);
  const front = ahead(state);
  const bubbleWidth = Math.min(3.4, Math.max(1.6, (said?.length ?? 0) * 0.16 + 0.5));
  const bubbleX = Math.min(cols - bubbleWidth - 0.08, Math.max(0.08, state.x + 0.5 - bubbleWidth / 2));
  const bubbleY = state.y > 1.1 ? state.y - 0.72 : state.y + 1.58;

  return (
    <svg
      viewBox={`-0.35 -0.35 ${cols + 0.7} ${rows + 0.7}`}
      role="img"
      aria-label={`Robot at column ${state.x + 1}, row ${state.y + 1}, facing ${HEADINGS[state.heading]}. ${
        completed ? 'On the target.' : `Target at column ${scenario.target.x + 1}, row ${scenario.target.y + 1}.`
      }`}
      data-testid="robot-stage"
      data-x={state.x}
      data-y={state.y}
      data-heading={state.heading}
      data-trail={state.trail.length}
      data-said={said ?? ''}
      data-complete={completed ? 'true' : 'false'}
      className="block h-auto w-full rounded-lg border border-line-soft bg-canvas"
    >
      {/* floor and grid */}
      <rect x="0" y="0" width={cols} height={rows} fill="#0b1220" />
      {Array.from({ length: cols + 1 }, (_, i) => (
        <line key={`v${i}`} x1={i} y1={0} x2={i} y2={rows} stroke="#1e293b" strokeWidth="0.02" />
      ))}
      {Array.from({ length: rows + 1 }, (_, i) => (
        <line key={`h${i}`} x1={0} y1={i} x2={cols} y2={i} stroke="#1e293b" strokeWidth="0.02" />
      ))}

      {/* target pad, and its success badge once the robot is standing on it */}
      <rect
        x={scenario.target.x + 0.16}
        y={scenario.target.y + 0.16}
        width="0.68"
        height="0.68"
        rx="0.12"
        fill={completed ? '#16a34a' : '#f59e0b'}
        opacity={completed ? 0.95 : 0.35}
        stroke={completed ? '#86efac' : '#fbbf24'}
        strokeWidth="0.045"
      />
      {completed && (
        <path
          d={`M ${scenario.target.x + 0.32} ${scenario.target.y + 0.5} l 0.12 0.13 l 0.24 -0.27`}
          stroke="#052e16"
          strokeWidth="0.07"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {/* walls: each square a stone block */}
      {scenario.walls.map((wall) => (
        <rect
          key={`${wall.x},${wall.y}`}
          x={wall.x + 0.08}
          y={wall.y + 0.08}
          width="0.84"
          height="0.84"
          rx="0.1"
          fill="#475569"
          stroke="#64748b"
          strokeWidth="0.03"
        />
      ))}

      {/* trail: every square visited, fading behind the robot */}
      {state.trail.slice(0, -1).map((point, index) => (
        <circle
          key={`${point.x},${point.y},${index}`}
          cx={point.x + 0.5}
          cy={point.y + 0.5}
          r="0.09"
          fill="#22d3ee"
          opacity={0.2 + (0.5 * (index + 1)) / Math.max(1, state.trail.length)}
        />
      ))}

      {/* sensor ray: dashed while the way is clear, a red stub when the next square is blocked */}
      {ray > 0 ? (
        <line
          x1={state.x + 0.5}
          y1={state.y + 0.5}
          x2={front.x + 0.5 + (ray - 1) * (front.x - state.x)}
          y2={front.y + 0.5 + (ray - 1) * (front.y - state.y)}
          stroke="#22d3ee"
          strokeWidth="0.035"
          strokeDasharray="0.12 0.1"
          opacity="0.7"
        />
      ) : (
        <line
          x1={state.x + 0.5}
          y1={state.y + 0.5}
          x2={state.x + 0.5 + (front.x - state.x) * 0.35}
          y2={state.y + 0.5 + (front.y - state.y) * 0.35}
          stroke="#ef4444"
          strokeWidth="0.06"
          strokeLinecap="round"
        />
      )}

      <RobotSprite x={state.x} y={state.y} heading={state.heading} />

      {/* the speech bubble is a drawing, not page chrome, so it stays above everything in the world */}
      {said && (
        <g>
          <rect
            x={bubbleX}
            y={bubbleY}
            width={bubbleWidth}
            height="0.52"
            rx="0.16"
            fill="#f8fafc"
            stroke="#38bdf8"
            strokeWidth="0.03"
          />
          <path
            d={`M ${state.x + 0.5 - 0.09} ${bubbleY + (bubbleY < state.y ? 0.52 : 0)} l 0.09 ${
              bubbleY < state.y ? 0.1 : -0.1
            } l 0.09 ${bubbleY < state.y ? -0.1 : 0.1} Z`}
            fill="#f8fafc"
          />
          <text
            x={bubbleX + bubbleWidth / 2}
            y={bubbleY + 0.34}
            textAnchor="middle"
            fontSize="0.2"
            fill="#0f172a"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            {said}
          </text>
        </g>
      )}
    </svg>
  );
}
