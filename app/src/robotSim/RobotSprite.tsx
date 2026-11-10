/**
 * The cartoon robot itself (`app/src/robotSim/RobotSprite.tsx`).
 *
 * The sprite is drawn in a one-unit box and scaled by the scene, so the same drawing serves the
 * rover track and the dock. Every curve is round on purpose: a big screen face, two bright eyes with
 * a slow blink, a smile that changes with the run, rosy cheeks and a lamp on the antenna. `mood`
 * is presentation only — the numbers beside the arena stay the truth.
 */
import type { Heading } from './model';

/** North is up; each quarter turn rotates the drawing by 90 degrees clockwise. */
const DEGREES: Record<Heading, number> = { 0: 0, 1: 90, 2: 180, 3: 270 };

export type RobotMood = 'idle' | 'working' | 'happy' | 'stop';

function Mouth({ mood }: { mood: RobotMood }) {
  if (mood === 'stop') {
    return <line x1="-0.045" y1="0.055" x2="0.045" y2="0.055" stroke="#7dd3fc" strokeWidth="0.03" strokeLinecap="round" />;
  }
  if (mood === 'working') {
    return <circle cx="0" cy="0.055" r="0.026" fill="#7dd3fc" />;
  }
  if (mood === 'happy') {
    return (
      <>
        <path d="M -0.085 0.035 Q 0 0.135 0.085 0.035" stroke="#7dd3fc" strokeWidth="0.032" fill="none" strokeLinecap="round" />
        <path d="M -0.105 -0.22 l 0.03 -0.06 M 0 -0.25 l 0 -0.07 M 0.105 -0.22 l -0.03 -0.06" stroke="#fbbf24" strokeWidth="0.024" strokeLinecap="round" />
      </>
    );
  }
  return <path d="M -0.055 0.04 Q 0 0.085 0.055 0.04" stroke="#7dd3fc" strokeWidth="0.03" fill="none" strokeLinecap="round" />;
}

export function RobotSprite({
  heading,
  mood = 'idle',
}: {
  heading: Heading;
  mood?: RobotMood;
}) {
  return (
    <g transform={`rotate(${DEGREES[heading]})`} data-robot-sprite>
      {/* antenna, with a lamp that glows while the robot is awake */}
      <line x1="0" y1="-0.34" x2="0" y2="-0.48" stroke="#7dd3fc" strokeWidth="0.055" strokeLinecap="round" />
      <circle className="robot-ant" cx="0" cy="-0.51" r="0.075" fill="#fbbf24" stroke="#b45309" strokeWidth="0.02" />
      {/* treads, visible on both sides, with little cleats */}
      <rect x="-0.41" y="-0.21" width="0.14" height="0.42" rx="0.06" fill="#1f334d" stroke="#0b1728" strokeWidth="0.03" />
      <rect x="0.27" y="-0.21" width="0.14" height="0.42" rx="0.06" fill="#1f334d" stroke="#0b1728" strokeWidth="0.03" />
      <line x1="-0.41" y1="-0.09" x2="-0.27" y2="-0.09" stroke="#7dd3fc" strokeWidth="0.018" opacity="0.5" />
      <line x1="-0.41" y1="0.09" x2="-0.27" y2="0.09" stroke="#7dd3fc" strokeWidth="0.018" opacity="0.5" />
      <line x1="0.27" y1="-0.09" x2="0.41" y2="-0.09" stroke="#7dd3fc" strokeWidth="0.018" opacity="0.5" />
      <line x1="0.27" y1="0.09" x2="0.41" y2="0.09" stroke="#7dd3fc" strokeWidth="0.018" opacity="0.5" />
      {/* round body, with a soft cap of light */}
      <rect x="-0.31" y="-0.33" width="0.62" height="0.67" rx="0.24" fill="#38bdf8" stroke="#0c4a6e" strokeWidth="0.045" />
      <path d="M -0.22 -0.27 Q 0 -0.37 0.22 -0.27" stroke="#bae6fd" strokeWidth="0.04" fill="none" strokeLinecap="round" opacity="0.85" />
      {/* screen face */}
      <rect x="-0.235" y="-0.215" width="0.47" height="0.3" rx="0.12" fill="#081426" stroke="#0c4a6e" strokeWidth="0.025" />
      {/* big eyes, then the blink cover that closes over both */}
      <circle cx="-0.095" cy="-0.1" r="0.062" fill="#e0f2fe" />
      <circle cx="0.095" cy="-0.1" r="0.062" fill="#e0f2fe" />
      <circle cx="-0.08" cy="-0.11" r="0.026" fill="#0b1b2e" />
      <circle cx="0.11" cy="-0.11" r="0.026" fill="#0b1b2e" />
      <rect
        className="robot-blink"
        x="-0.175"
        y="-0.175"
        width="0.35"
        height="0.145"
        rx="0.06"
        fill="#081426"
        style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
      />
      {/* cheeks and the mood's mouth */}
      <circle cx="-0.185" cy="0.005" r="0.045" fill="#fb7185" opacity="0.34" />
      <circle cx="0.185" cy="0.005" r="0.045" fill="#fb7185" opacity="0.34" />
      <Mouth mood={mood} />
      {/* little arms */}
      <rect x="-0.38" y="0.02" width="0.075" height="0.14" rx="0.037" fill="#0ea5e9" stroke="#0c4a6e" strokeWidth="0.02" />
      <rect x="0.305" y="0.02" width="0.075" height="0.14" rx="0.037" fill="#0ea5e9" stroke="#0c4a6e" strokeWidth="0.02" />
      {/* a chest light, so the robot reads as awake even at a glance */}
      <circle cx="0" cy="0.135" r="0.032" fill={mood === 'happy' ? '#34d399' : mood === 'stop' ? '#fb7185' : '#fbbf24'} />
    </g>
  );
}
