import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  HOME,
  PITCH_RANGE,
  Q1_RANGE,
  Q2_RANGE,
  YAW_RANGE,
  clampHolo,
  demoPose,
  describe,
  floorLines,
  fk,
  orbit,
  project,
  pushTrail,
  reach,
  withJoint,
  type HoloState,
  type Point2,
} from './holoModel.ts';

/**
 * The arm, as a hologram you can grab (`app/src/visuals/Hologram.tsx`).
 *
 * The course's claim is that this arm works and that you can check it; a still diagram says neither.
 * So the figure is a model: drag it to orbit, pose either joint with its slider, and press **Demo** to
 * watch it trace the capstone's figure-eight with a phosphor trail behind the tip. Nothing here is
 * unlocked by progress and nothing is a reward — it is the same arm the lessons are about.
 *
 * The rules it keeps, the same ones the rest of the app keeps:
 *
 * - **Motion is asked for.** The demo does not start on its own, and with `prefers-reduced-motion` the
 *   button is disabled with the reason on it: a learner who asked their OS for less motion gets a
 *   still, draggable model rather than a compromise.
 * - **Keyboard-first.** The figure is focusable; arrows turn and tilt it, and both joints are real
 *   range inputs with names, so nothing about the pose needs a pointer.
 * - **The model is elsewhere.** Every number drawn comes from `holoModel.ts`, which runs under Node in
 *   `scripts/test_visuals.mjs`; this file is strokes and buttons. A WebGL renderer can replace the
 *   bottom half of this file without touching the maths, which is the staged upgrade.
 */

const VIEW = { w: 360, h: 280, cx: 180, cy: 176, scale: 96 };
const DEG = 180 / Math.PI;

function readStateDeg(state: HoloState): { q1: number; q2: number } {
  return { q1: Math.round(state.q1 * DEG), q2: Math.round(state.q2 * DEG) };
}

export const Hologram: React.FC<{
  className?: string;
  /** A shorter view for a dashboard tile; the controls stay. */
  compact?: boolean;
  title?: string;
}> = ({ className = '', compact = false, title = 'Hologram' }) => {
  const [state, setState] = useState<HoloState>(HOME);
  const [demo, setDemo] = useState(false);
  const [trace, setTrace] = useState(true);
  const [trail, setTrail] = useState<Point2[]>([]);
  const [reduced, setReduced] = useState(false);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const phase = useRef(0);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!media) return;
    const read = () => setReduced(media.matches);
    read();
    media.addEventListener?.('change', read);
    return () => media.removeEventListener?.('change', read);
  }, []);

  // The demo is a modelled pose, not a sprite: `demoPose` is inverse kinematics on the same arm, so
  // what the learner watches is the figure-eight the capstone asks for, at the reach it really has.
  useEffect(() => {
    if (!demo || reduced || typeof requestAnimationFrame !== 'function') return;
    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      if (now - last >= 33) {
        last = now;
        phase.current += 0.055;
        setState((current) => {
          const next = demoPose(phase.current, current);
          if (trace) {
            const tip = fk(next).tip;
            setTrail((gone) => pushTrail(gone, { x: tip.x, y: tip.y }));
          }
          return next;
        });
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [demo, reduced, trace]);

  const onPointerDown = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    drag.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDemo(false);
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    const from = drag.current;
    if (!from) return;
    const dx = event.clientX - from.x;
    const dy = event.clientY - from.y;
    drag.current = { x: event.clientX, y: event.clientY };
    setState((current) => orbit(current, dx, dy));
  }, []);

  const onPointerUp = useCallback(() => {
    drag.current = null;
  }, []);

  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.16 : 0.06;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step * 60, 0],
      ArrowRight: [step * 60, 0],
      ArrowUp: [0, -step * 60],
      ArrowDown: [0, step * 60],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    setDemo(false);
    setState((current) => orbit(current, move[0], move[1]));
  }, []);

  const pose = useMemo(() => fk(state), [state]);
  const toPixels = useCallback(
    (point: { x: number; y: number; z: number }) => {
      const projected = project(point, state, VIEW.scale);
      return { x: VIEW.cx + projected.x, y: VIEW.cy + projected.y, depth: projected.depth };
    },
    [state]
  );

  const base = toPixels(pose.base);
  const elbow = toPixels(pose.elbow);
  const tip = toPixels(pose.tip);
  const degrees = readStateDeg(state);
  const trailPath = trail
    .map((point, index) => {
      const pixel = toPixels({ x: point.x, y: point.y, z: 0 });
      return `${index === 0 ? 'M' : 'L'}${pixel.x.toFixed(1)},${pixel.y.toFixed(1)}`;
    })
    .join(' ');
  const rings = useMemo(() => floorLines(3), []);

  return (
    <div className={`flex flex-col gap-2 ${className}`} data-testid="hologram">
      <div
        role="group"
        aria-label={`${title}: drag to orbit the arm, or use the arrow keys; the two sliders pose its joints`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="rounded-xl border border-line bg-canvas outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      >
        <svg
          viewBox={`0 0 ${VIEW.w} ${compact ? 240 : VIEW.h}`}
          className="block w-full touch-none select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          role="img"
          aria-label={`Two-joint arm hologram. ${describe(state)}`}
          style={{ cursor: drag.current ? 'grabbing' : 'grab' }}
        >
          <defs>
            <filter id="holo-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3.2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <linearGradient id="holo-fade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--accent, #38bdf8)" stopOpacity="0.22" />
              <stop offset="1" stopColor="var(--accent, #38bdf8)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* The bench the arm stands on, in its own plane, so the orbit reads as depth. */}
          <g stroke="var(--accent, #38bdf8)" strokeWidth="0.6" opacity="0.16">
            {rings.map((line, index) => {
              const a = toPixels(line[0]);
              const b = toPixels(line[1]);
              return <line key={index} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
            })}
          </g>

          {/* The reach it cannot exceed: the outer circle is L1 + L2, drawn to scale. */}
          <circle
            cx={VIEW.cx}
            cy={VIEW.cy}
            r={reach().max * VIEW.scale * 0.82}
            fill="none"
            stroke="var(--accent, #38bdf8)"
            strokeWidth="0.7"
            strokeDasharray="3 7"
            opacity="0.22"
          />

          {trace && trail.length > 1 && (
            <path d={trailPath} fill="none" stroke="var(--accent, #38bdf8)" strokeWidth="1.4" opacity="0.55" />
          )}

          {/* Base, then the two links: a dark casing, the lit core, and a glow that says "projection". */}
          <ellipse cx={base.x} cy={base.y + 6} rx={26} ry={7} fill="url(#holo-fade)" />
          <polyline
            points={`${base.x},${base.y} ${elbow.x},${elbow.y} ${tip.x},${tip.y}`}
            fill="none"
            stroke="var(--canvas, #0b1220)"
            strokeWidth="13"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <polyline
            points={`${base.x},${base.y} ${elbow.x},${elbow.y} ${tip.x},${tip.y}`}
            fill="none"
            stroke="var(--accent, #38bdf8)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#holo-glow)"
          />
          <polyline
            points={`${base.x},${base.y} ${elbow.x},${elbow.y} ${tip.x},${tip.y}`}
            fill="none"
            stroke="var(--ink, #e6edf6)"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.85"
          />

          {[base, elbow].map((joint, index) => (
            <g key={index}>
              <circle cx={joint.x} cy={joint.y} r={index === 0 ? 9 : 7.5} fill="var(--canvas, #0b1220)" />
              <circle
                cx={joint.x}
                cy={joint.y}
                r={index === 0 ? 9 : 7.5}
                fill="none"
                stroke="var(--accent, #38bdf8)"
                strokeWidth="1.8"
              />
              <circle cx={joint.x} cy={joint.y} r={2} fill="var(--accent, #38bdf8)" />
            </g>
          ))}

          <circle cx={tip.x} cy={tip.y} r={5} fill="var(--accent, #38bdf8)" filter="url(#holo-glow)" />

          <text x="14" y="20" fontSize="9.5" fill="var(--muted, #93a4bd)" fontFamily="ui-monospace, monospace">
            HOLO · 2-DOF
          </text>
          <text
            x={VIEW.w - 14}
            y={compact ? 240 - 12 : VIEW.h - 12}
            textAnchor="end"
            fontSize="9.5"
            fill="var(--muted, #93a4bd)"
            fontFamily="ui-monospace, monospace"
          >
            {describe(state)}
          </text>
        </svg>
      </div>

      <div className="grid gap-1.5 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-xs text-muted">
          <span className="w-14 shrink-0 font-mono">q₁ {degrees.q1}°</span>
          <input
            type="range"
            min={Math.round(Q1_RANGE[0] * DEG)}
            max={Math.round(Q1_RANGE[1] * DEG)}
            step={1}
            value={degrees.q1}
            aria-label="Shoulder angle, degrees"
            onChange={(event) => {
              setDemo(false);
              setState((current) => withJoint(current, 1, Number(event.target.value) / DEG));
            }}
            className="w-full accent-[var(--accent)]"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-muted">
          <span className="w-14 shrink-0 font-mono">q₂ {degrees.q2}°</span>
          <input
            type="range"
            min={Math.round(Q2_RANGE[0] * DEG)}
            max={Math.round(Q2_RANGE[1] * DEG)}
            step={1}
            value={degrees.q2}
            aria-label="Elbow angle, degrees"
            onChange={(event) => {
              setDemo(false);
              setState((current) => withJoint(current, 2, Number(event.target.value) / DEG));
            }}
            className="w-full accent-[var(--accent)]"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setDemo((on) => !on)}
          aria-pressed={demo}
          disabled={reduced}
          title={reduced ? 'Your system asks for reduced motion, so the demo is off. Dragging still works.' : 'Trace the capstone figure-eight'}
          data-testid="btn-holo-demo"
          className="rounded border border-line-soft bg-canvas px-2 py-1 text-xs font-mono text-body hover:text-ink disabled:opacity-50 cursor-pointer"
        >
          {demo ? 'Pause demo' : 'Demo'}
        </button>
        <button
          type="button"
          onClick={() => setTrace((on) => !on)}
          aria-pressed={trace}
          data-testid="btn-holo-trace"
          className="rounded border border-line-soft bg-canvas px-2 py-1 text-xs font-mono text-body hover:text-ink cursor-pointer"
        >
          Trail
        </button>
        <button
          type="button"
          onClick={() => {
            setDemo(false);
            setTrail([]);
            setState(HOME);
          }}
          data-testid="btn-holo-home"
          className="rounded border border-line-soft bg-canvas px-2 py-1 text-xs font-mono text-body hover:text-ink cursor-pointer"
        >
          Home pose
        </button>
        <span className="ml-auto font-mono text-[11px] text-faint">
          reach {reach().max.toFixed(2)} · yaw {Math.round(state.yaw * DEG)}°
        </span>
      </div>
    </div>
  );
};

/** The stage marker for the 3D upgrade: one place that says which renderer is drawing. */
export const HOLOGRAM_RENDERER: 'svg' = 'svg';
