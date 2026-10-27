/**
 * The arm, as geometry (`app/src/visuals/holoModel.ts`).
 *
 * Named `holoModel`, not `hologram`: macOS is case-insensitive, and a `.ts` model beside a `.tsx`
 * component whose names differ only by case is two files the compiler cannot tell apart.
 *
 * Split out from the component on purpose: this file is the whole model — forward kinematics, a
 * projection, the orbit and joint limits, and the figure-eight the demo traces — and none of it needs
 * a browser. `scripts/test_visuals.mjs` runs it under Node, and the SVG view in `Hologram.tsx` only
 * draws what these functions return.
 *
 * That split is also how the staged 3D upgrade stays cheap: a WebGL renderer would import *this*
 * module and draw the same points, so the model, its limits and their tests survive the swap.
 */

export interface HoloState {
  /** View rotation about the vertical axis, radians. */
  yaw: number;
  /** View tilt, radians. Positive looks down at the bench. */
  pitch: number;
  /** Shoulder and elbow angles, radians, in the arm's own plane. */
  q1: number;
  q2: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Point2 {
  x: number;
  y: number;
}

/** What the view may ask for: a full turn, a tilt that keeps the arm off the floor and out of the sky. */
export const YAW_RANGE: readonly [number, number] = [-Math.PI, Math.PI];
export const PITCH_RANGE: readonly [number, number] = [-0.35, 0.95];
/** The joints' mechanical limits: shoulder either way, elbow not past straight. */
export const Q1_RANGE: readonly [number, number] = [-2.4, 2.4];
export const Q2_RANGE: readonly [number, number] = [-2.6, 0.05];

export const LINK_1 = 1;
export const LINK_2 = 0.82;

export const HOME: HoloState = { yaw: -0.42, pitch: 0.34, q1: 0.6, q2: -1.1 };

function clampTo(value: number, range: readonly [number, number]): number {
  const [low, high] = range;
  if (!Number.isFinite(value)) return low;
  return Math.min(high, Math.max(low, value));
}

/** A state with every field inside its limit. Every entry point goes through this. */
export function clampHolo(state: HoloState): HoloState {
  return {
    yaw: clampTo(state.yaw, YAW_RANGE),
    pitch: clampTo(state.pitch, PITCH_RANGE),
    q1: clampTo(state.q1, Q1_RANGE),
    q2: clampTo(state.q2, Q2_RANGE),
  };
}

/** Radians per pixel of drag. A full drag across a 320 px view is a little over half a turn. */
export const ORBIT_PER_PIXEL = Math.PI / 260;
/** Radians per pixel of vertical drag: the tilt is a shorter throw than the turn. */
export const TILT_PER_PIXEL = Math.PI / 420;

/**
 * A drag, as a new view.
 *
 * Horizontal drag turns the arm (right drags the near side right, the way a turntable feels), vertical
 * drag tilts the camera down when the pointer goes down — the mapping a learner expects from a model
 * they can grab, and the reason this is a function with a test rather than two inline multipliers.
 */
export function orbit(state: HoloState, dxPixels: number, dyPixels: number): HoloState {
  return clampHolo({
    ...state,
    yaw: state.yaw + dxPixels * ORBIT_PER_PIXEL,
    pitch: state.pitch + dyPixels * TILT_PER_PIXEL,
  });
}

/** One joint set, in radians, clamped to its own limit. `joint` is 1 or 2. */
export function withJoint(state: HoloState, joint: 1 | 2, radians: number): HoloState {
  return clampHolo(joint === 1 ? { ...state, q1: radians } : { ...state, q2: radians });
}

/** Forward kinematics in the arm's own plane: base, elbow, tip. */
export function fk(state: HoloState): { base: Vec3; elbow: Vec3; tip: Vec3 } {
  const base: Vec3 = { x: 0, y: 0, z: 0 };
  const elbow: Vec3 = { x: LINK_1 * Math.cos(state.q1), y: LINK_1 * Math.sin(state.q1), z: 0 };
  const tip: Vec3 = {
    x: elbow.x + LINK_2 * Math.cos(state.q1 + state.q2),
    y: elbow.y + LINK_2 * Math.sin(state.q1 + state.q2),
    z: 0,
  };
  return { base, elbow, tip };
}

/** Horizontal reach the arm can actually make: the annulus between its two links. */
export function reach(): { min: number; max: number } {
  return { min: Math.abs(LINK_1 - LINK_2), max: LINK_1 + LINK_2 };
}

/**
 * Inverse kinematics for a target in the arm's plane, elbow down.
 *
 * Returns null for a point outside the annulus instead of pretending: the demo uses that to skip a
 * target it cannot reach, and the test uses it to check the boundary is where `reach()` says.
 */
export function ik(target: Point2): { q1: number; q2: number } | null {
  const r2 = target.x * target.x + target.y * target.y;
  const { min, max } = reach();
  const r = Math.sqrt(r2);
  if (r > max || r < min) return null;
  const cos = Math.min(1, Math.max(-1, (r2 - LINK_1 * LINK_1 - LINK_2 * LINK_2) / (2 * LINK_1 * LINK_2)));
  const q2 = -Math.acos(cos);
  const q1 = Math.atan2(target.y, target.x) - Math.atan2(LINK_2 * Math.sin(q2), LINK_1 + LINK_2 * Math.cos(q2));
  return { q1, q2 };
}

/** A point on the figure-eight the capstone asks for, scaled to the arm's reach. */
export function figureEight(phase: number): Point2 {
  const span = reach().max * 0.62;
  return { x: span * Math.sin(phase), y: span * Math.sin(2 * phase) * 0.45 };
}

/** The arm's pose at `phase` of the demo, or the last pose it could reach. */
export function demoPose(phase: number, fallback: HoloState): HoloState {
  const pose = ik(figureEight(phase));
  if (!pose) return fallback;
  return clampHolo({ ...fallback, q1: pose.q1, q2: pose.q2 });
}

/**
 * A point in the arm's plane, as pixels in a view.
 *
 * The view is a turntable: turn about the vertical axis, then tilt, then project with a mild
 * perspective so the far end of a link is a little shorter than the near end. `scale` is the view's
 * half-height in pixels, so the caller decides how big the arm is and this stays resolution-free.
 */
export function project(point: Vec3, state: HoloState, scale: number): Point2 & { depth: number } {
  const cosYaw = Math.cos(state.yaw);
  const sinYaw = Math.sin(state.yaw);
  const cosPitch = Math.cos(state.pitch);
  const sinPitch = Math.sin(state.pitch);

  const x1 = point.x * cosYaw + point.z * sinYaw;
  const z1 = -point.x * sinYaw + point.z * cosYaw;
  const y2 = point.y * cosPitch - z1 * sinPitch;
  const z2 = point.y * sinPitch + z1 * cosPitch;

  const perspective = 1 / (1 + z2 * 0.12);
  return {
    x: x1 * scale * perspective,
    y: -y2 * scale * perspective,
    depth: z2,
  };
}

/** The floor: lines on the arm's plane, at `count` steps either side of the base. */
export function floorLines(count = 4): Vec3[][] {
  const lines: Vec3[][] = [];
  const half = 1.25;
  for (let index = -count; index <= count; index += 1) {
    const at = (index / count) * half;
    lines.push([
      { x: -half, y: at, z: 0 },
      { x: half, y: at, z: 0 },
    ]);
    lines.push([
      { x: at, y: -half, z: 0 },
      { x: at, y: half, z: 0 },
    ]);
  }
  return lines;
}

/** The readout under the model: what the pose is, in the units a learner tunes in. */
export function describe(state: HoloState): string {
  const deg = (radians: number) => `${Math.round((radians * 180) / Math.PI)}°`;
  return `q₁ ${deg(state.q1)}  q₂ ${deg(state.q2)}  yaw ${deg(state.yaw)}  tilt ${deg(state.pitch)}`;
}

/** Every point the demo has visited, as a phosphor trail. Bounded so a long session cannot grow. */
export const TRAIL_LIMIT = 96;

export function pushTrail(trail: Point2[], point: Point2): Point2[] {
  const next = [...trail, point];
  return next.length > TRAIL_LIMIT ? next.slice(next.length - TRAIL_LIMIT) : next;
}
