/**
 * The robot itself (`app/src/robotSim/RobotSprite.tsx`).
 *
 * A graphite rover with a sensor mast, light rails and a narrow instrument visor — deliberately
 * mechanical rather than mascot-shaped. The drawing stays in a one-unit box so the same body can
 * cross the encoder track and the dock. `mood` is presentation only: it changes the status lights,
 * never the readings the stage reports.
 */
import type { Heading } from './model';

/** North is up; each quarter turn rotates the drawing by 90 degrees clockwise. */
const DEGREES: Record<Heading, number> = { 0: 0, 1: 90, 2: 180, 3: 270 };

export type RobotMood = 'idle' | 'working' | 'happy' | 'stop';

export function RobotSprite({
  heading,
  mood = 'idle',
}: {
  heading: Heading;
  mood?: RobotMood;
}) {
  const light = mood === 'happy' ? '#34d399' : mood === 'stop' ? '#fb7185' : mood === 'working' ? '#38bdf8' : '#22d3ee';
  const glow = mood === 'happy' ? '#34d399' : mood === 'stop' ? '#fb7185' : '#38bdf8';

  return (
    <g transform={`rotate(${DEGREES[heading]})`} data-robot-sprite>
      <g className={`robot-body robot-${mood}`} data-mood={mood} transform="scale(0.82 1.24)">
        <defs>
          <linearGradient id="robot-shell" x1="0" y1="0" x2="0.35" y2="1">
            <stop offset="0" stopColor="#5b7185" />
            <stop offset="0.38" stopColor="#2d4156" />
            <stop offset="1" stopColor="#14263a" />
          </linearGradient>
          <linearGradient id="robot-plate" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1b3047" />
            <stop offset="1" stopColor="#0a1727" />
          </linearGradient>
          <linearGradient id="robot-rail" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#0ea5e9" stopOpacity="0.2" />
            <stop offset="0.5" stopColor="#7dd3fc" stopOpacity="0.9" />
            <stop offset="1" stopColor="#0ea5e9" stopOpacity="0.2" />
          </linearGradient>
        </defs>

        {/* twin treads with machined cleats */}
        <g fill="url(#robot-plate)" stroke="#07111f" strokeWidth="0.026">
          <rect x="-0.43" y="-0.18" width="0.17" height="0.37" rx="0.07" />
          <rect x="0.26" y="-0.18" width="0.17" height="0.37" rx="0.07" />
        </g>
        <g stroke="#7dd3fc" strokeWidth="0.014" opacity="0.42">
          <line x1="-0.405" y1="-0.09" x2="-0.285" y2="-0.09" />
          <line x1="-0.405" y1="0.01" x2="-0.285" y2="0.01" />
          <line x1="-0.405" y1="0.11" x2="-0.285" y2="0.11" />
          <line x1="0.285" y1="-0.09" x2="0.405" y2="-0.09" />
          <line x1="0.285" y1="0.01" x2="0.405" y2="0.01" />
          <line x1="0.285" y1="0.11" x2="0.405" y2="0.11" />
        </g>

        {/* lower chassis, side fins and a clean top plate */}
        <path
          d="M -0.35 -0.16 Q -0.37 -0.29 -0.25 -0.35 L 0.25 -0.35 Q 0.37 -0.29 0.35 -0.16 L 0.31 0.16 Q 0.29 0.28 0.16 0.29 L -0.16 0.29 Q -0.29 0.28 -0.31 0.16 Z"
          fill="url(#robot-shell)"
          stroke="#071524"
          strokeWidth="0.032"
        />
        <path d="M -0.31 -0.12 L -0.4 -0.23 L -0.32 -0.27 L -0.24 -0.17 Z" fill="#243b52" stroke="#071524" strokeWidth="0.02" />
        <path d="M 0.31 -0.12 L 0.4 -0.23 L 0.32 -0.27 L 0.24 -0.17 Z" fill="#243b52" stroke="#071524" strokeWidth="0.02" />
        <rect x="-0.23" y="-0.28" width="0.46" height="0.12" rx="0.045" fill="#3d546a" opacity="0.5" />

        {/* narrow instrument visor; the moving light is a scan, not a face */}
        <rect x="-0.195" y="-0.205" width="0.39" height="0.085" rx="0.032" fill="#030b17" stroke="#1e3a5f" strokeWidth="0.018" />
        <rect className="robot-sensor-scan" x="-0.16" y="-0.172" width="0.12" height="0.019" rx="0.01" fill={light} />
        <circle cx="0.135" cy="-0.163" r="0.011" fill={light} />
        <rect x="-0.155" y="-0.095" width="0.31" height="0.018" rx="0.009" fill="#7dd3fc" opacity="0.22" />

        {/* sensor mast and beacon */}
        <line x1="0.03" y1="-0.35" x2="0.03" y2="-0.49" stroke="#8da4b8" strokeWidth="0.026" strokeLinecap="round" />
        <g transform="translate(0.03 -0.52)">
          <circle className="robot-beacon-light" r="0.075" fill="none" stroke={light} strokeWidth="0.018" opacity="0.55" />
          <circle r="0.043" fill={light} stroke="#071524" strokeWidth="0.012" />
          <circle r="0.017" fill="#e0f2fe" opacity="0.85" />
        </g>
        <path d="M -0.1 -0.31 Q 0.03 -0.39 0.16 -0.31" fill="none" stroke="#7dd3fc" strokeWidth="0.016" opacity="0.35" />
        <path d="M -0.075 -0.54 L -0.24 -0.86 L 0.24 -0.86 L 0.075 -0.54 Z" fill={glow} opacity="0.1" />

        {/* side vents and status lights */}
        <g strokeWidth="0.012" opacity="0.65" stroke={light}>
          <line x1="-0.3" y1="0.1" x2="-0.22" y2="0.1" />
          <line x1="-0.3" y1="0.145" x2="-0.22" y2="0.145" />
          <line x1="0.22" y1="0.1" x2="0.3" y2="0.1" />
          <line x1="0.22" y1="0.145" x2="0.3" y2="0.145" />
        </g>
        <rect x="-0.23" y="0.1" width="0.08" height="0.055" rx="0.014" fill="#06101d" />
        <rect x="0.15" y="0.1" width="0.08" height="0.055" rx="0.014" fill="#06101d" />
        <circle cx="-0.19" cy="0.127" r="0.014" fill={light} />
        <circle cx="0.19" cy="0.127" r="0.014" fill="#34d399" opacity={mood === 'happy' ? 1 : 0.55} />

        {/* exposed service rail: the one bright accent on the body */}
        <rect x="-0.16" y="0.225" width="0.32" height="0.018" rx="0.009" fill="url(#robot-rail)" opacity="0.85" />
      </g>
    </g>
  );
}
