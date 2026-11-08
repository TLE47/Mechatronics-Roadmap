/** The cartoon robot itself (`app/src/robotSim/RobotSprite.tsx`): body, wheels, eyes, antenna. */
import type { Heading } from './model';

/** North is up; each quarter turn rotates the drawing by 90 degrees clockwise. */
const DEGREES: Record<Heading, number> = { 0: 0, 1: 90, 2: 180, 3: 270 };

export function RobotSprite({ x, y, heading }: { x: number; y: number; heading: Heading }) {
  return (
    <g transform={`translate(${x + 0.5} ${y + 0.5}) rotate(${DEGREES[heading]})`} data-robot-sprite>
      {/* antenna and its lamp */}
      <line x1="0" y1="-0.34" x2="0" y2="-0.48" stroke="#94a3b8" strokeWidth="0.06" strokeLinecap="round" />
      <circle cx="0" cy="-0.5" r="0.07" fill="#f59e0b" />
      {/* wheels, visible on the sides */}
      <rect x="-0.4" y="-0.2" width="0.12" height="0.4" rx="0.05" fill="#334155" />
      <rect x="0.28" y="-0.2" width="0.12" height="0.4" rx="0.05" fill="#334155" />
      {/* body */}
      <rect x="-0.3" y="-0.32" width="0.6" height="0.64" rx="0.16" fill="#38bdf8" stroke="#0c4a6e" strokeWidth="0.045" />
      {/* screen face, eyes look the way the robot faces */}
      <rect x="-0.2" y="-0.2" width="0.4" height="0.24" rx="0.08" fill="#0f172a" />
      <circle cx="-0.08" cy="-0.1" r="0.045" fill="#e0f2fe" />
      <circle cx="0.08" cy="-0.1" r="0.045" fill="#e0f2fe" />
      <path d="M -0.07 0.03 Q 0 0.08 0.07 0.03" stroke="#7dd3fc" strokeWidth="0.035" fill="none" strokeLinecap="round" />
      {/* heading arrow on the chest, so facing is readable even at a glance */}
      <path d="M 0 0.09 l -0.08 0.09 h 0.16 Z" fill="#fbbf24" />
    </g>
  );
}
