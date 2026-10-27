/**
 * The landing arm's geometry and inverse kinematics, as plain maths (`app/src/heroArmModel.ts`).
 *
 * `HeroArm` draws this on a canvas, and `scripts/test_arm.mjs` reads it without a browser. The two
 * agreement points that matter are both here rather than in the component:
 *
 * - **One path, two readers.** The dashed curve previewing where the tip goes and the target the arm
 *   chases come from the same `armTarget`, so the trail can never drift off the drawing.
 * - **No singularities.** A figure-eight centred on the base passes through the base twice per loop,
 *   and there the two-link solution has no defined joint angle: the elbow whips around and the arm
 *   appears to skip frames right-to-left. Lifting the curve above the base — into the annulus the
 *   arm can actually reach, wider than the inner limit `|l1 - l2|` — keeps every frame on one smooth
 *   branch, which is what the test measures.
 */

/** How fast the target travels the curve, in radians of parameter per second (≈6.5 s a loop). */
export const ARM_SPEED = 0.96;

export interface ArmPoint {
  x: number;
  y: number;
}

export interface ArmGeometry {
  /** Base, in canvas pixels. */
  ox: number;
  oy: number;
  l1: number;
  l2: number;
  /** Half-width and half-height of the figure-eight, in pixels. */
  spanX: number;
  spanY: number;
  /** How far above the base the curve's crossing sits. */
  lift: number;
  /** Fully extended length, the outer limit of the workspace. */
  reach: number;
  /** Folded length, the inner limit. */
  inner: number;
}

export interface ArmFrame {
  /** Where the tip is asked to be, in canvas pixels. */
  target: ArmPoint;
  elbow: ArmPoint;
  tip: ArmPoint;
  q1: number;
  q2: number;
}

/** Fit the arm and its curve to a canvas of `width × height` CSS pixels. */
export function armGeometry(width: number, height: number): ArmGeometry {
  const l1 = Math.min(width, height) * 0.34;
  const l2 = l1 * 0.82;
  const reach = l1 + l2;
  // The curve stays well inside the outer limit: its farthest corner is √(spanX² + (lift + spanY)²).
  const spanX = Math.min(width * 0.28, reach * 0.6);
  const spanY = Math.min(height * 0.16, reach * 0.28);
  // Above the folded arm and above the dip of the lower lobe, so the target never nears the base.
  const lift = Math.max(reach * 0.45, spanY + reach * 0.18);
  return { ox: width / 2, oy: height * 0.58, l1, l2, spanX, spanY, lift, reach, inner: Math.abs(l1 - l2) };
}

/**
 * Advance the loop by real elapsed seconds.
 *
 * Capped at one fiftieth of a second: after a stalled tab, a dropped frame or a paused observer the
 * arm takes a normal step rather than teleporting to wherever the clock says it should be. The cap is
 * also why the speed is independent of the frame rate — the loop advances by time, not by frames.
 */
export function advanceArm(t: number, elapsed: number): number {
  const step = Math.min(0.05, Math.max(0, elapsed));
  return (t + step * ARM_SPEED) % (Math.PI * 2);
}

/** The figure-eight, as an offset from the base: x right, y up. */
export function armTarget(t: number, geometry: ArmGeometry): ArmPoint {
  return {
    x: geometry.spanX * Math.sin(t),
    y: geometry.lift + geometry.spanY * Math.sin(2 * t),
  };
}

/**
 * The tip's own two-link solution for a target, elbow up.
 *
 * `clamped` guards the outer limit only; the lifted curve keeps the target off both limits, so the
 * guard never fires in normal play and the joint angles stay on one branch.
 */
export function solveArm(tx: number, ty: number, geometry: ArmGeometry): { q1: number; q2: number } {
  const { l1, l2 } = geometry;
  const ratio = (tx * tx + ty * ty - l1 * l1 - l2 * l2) / (2 * l1 * l2);
  const clamped = Math.min(1, Math.max(-1, ratio));
  const q2 = -Math.acos(clamped);
  const q1 = Math.atan2(ty, tx) - Math.atan2(l2 * Math.sin(q2), l1 + l2 * Math.cos(q2));
  return { q1, q2 };
}

/** One frame: target, joint angles, and the elbow and tip those angles put on the canvas. */
export function armFrame(t: number, geometry: ArmGeometry): ArmFrame {
  const offset = armTarget(t, geometry);
  const { q1, q2 } = solveArm(offset.x, offset.y, geometry);
  const elbow = {
    x: geometry.ox + geometry.l1 * Math.cos(q1),
    y: geometry.oy - geometry.l1 * Math.sin(q1),
  };
  const tip = {
    x: elbow.x + geometry.l2 * Math.cos(q1 + q2),
    y: elbow.y - geometry.l2 * Math.sin(q1 + q2),
  };
  return {
    target: { x: geometry.ox + offset.x, y: geometry.oy - offset.y },
    elbow,
    tip,
    q1,
    q2,
  };
}

/** The dashed preview of the whole loop, in canvas pixels and already closed. */
export function targetPath(geometry: ArmGeometry, steps = 128): ArmPoint[] {
  const points: ArmPoint[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const offset = armTarget((index / steps) * Math.PI * 2, geometry);
    points.push({ x: geometry.ox + offset.x, y: geometry.oy - offset.y });
  }
  return points;
}
