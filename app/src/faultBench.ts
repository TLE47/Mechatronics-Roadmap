/**
 * The arithmetic behind the 08.1 Four-Fault Bench.
 *
 * Every metric is the same one the page's proof block asserts, so a learner can move a
 * control and see the number the graded solution would print. Keeping this file free of
 * React and browser APIs lets `scripts/test_fault_bench.mjs` run it under Node.
 */

export const ZERO_OFFSET_RAD = 0.06;
export const ZERO_OFFSET_TIP_RAD = 0.30;
export const CPR_SCALE = 4.0;
export const CPR_TIP_RAD = 0.30;
export const GRAVITY_KP = 4.0;
export const GRAVITY_TAU_NM =
  (0.20 * 0.05 + 0.15 * 0.10) * 9.81 + 0.15 * 9.81 * 0.05;
export const TIP_RADIUS_M = 0.20;

/** Forward kinematics for the two 0.10 m links used throughout 08.1. */
export function fk2Link(q1: number, q2: number): [number, number] {
  return [
    0.10 * Math.cos(q1) + 0.10 * Math.cos(q1 + q2),
    0.10 * Math.sin(q1) + 0.10 * Math.sin(q1 + q2),
  ];
}

/** Distance between the true and measured tip positions, in millimetres. */
export function tipErrorMm(qTrue: number, qMeasured: number): number {
  const [xTrue, yTrue] = fk2Link(qTrue, 0);
  const [xMeasured, yMeasured] = fk2Link(qMeasured, 0);
  return Math.hypot(xMeasured - xTrue, yMeasured - yTrue) * 1000;
}

/** Broken Version D: a 0.06 rad constant offset; the slider removes it. */
export function zeroOffsetTipErrorMm(correctionRad: number): number {
  return tipErrorMm(
    ZERO_OFFSET_TIP_RAD,
    ZERO_OFFSET_TIP_RAD + ZERO_OFFSET_RAD - correctionRad
  );
}

/**
 * Broken Version B: the encoder reports four times the true angle.
 * `divisor` is the repair: 1 leaves the broken reading, 4 restores the true angle.
 */
export function cprTipErrorMm(divisor: number): number {
  return tipErrorMm(CPR_TIP_RAD, (CPR_TIP_RAD * CPR_SCALE) / divisor);
}

/** Broken Version A: the feedforward torque is inverted. */
export function gravityTipErrorMm(flipped: boolean): number {
  const command = flipped ? GRAVITY_TAU_NM : -GRAVITY_TAU_NM;
  const equilibriumRad = (command - GRAVITY_TAU_NM) / GRAVITY_KP;
  return tipErrorMm(0, equilibriumRad);
}

/**
 * Broken Version C: a saturated 1-DOF PI step. `antiWindup` freezes the integral while
 * the command is clipped and the error still pushes into the limit. Returns percent overshoot.
 *
 * The constants are the ones in Lesson 05.1, so the broken branch reproduces the 37.2%
 * signature and the repaired branch lands near 4.7%.
 */
export function antiWindupOvershootPct(antiWindup: boolean): number {
  const J = 0.02;
  const b = 0.05;
  const tauG = 0.60;
  const uMax = 1.20;
  const dt = 0.001;
  const kp = 4.0;
  const ki = 12.0;
  const kd = 0.4;
  let q = 0;
  let dq = 0;
  let iTerm = 0;
  let peak = 0;

  for (let step = 0; step < 3000; step += 1) {
    const error = 1 - q;
    const iCandidate = iTerm + ki * error * dt;
    const uRaw = kp * error - kd * dq + iCandidate;
    const saturated = Math.abs(uRaw) > uMax && error * uRaw > 0;
    iTerm = antiWindup && saturated ? iTerm : iCandidate;
    const u = Math.max(-uMax, Math.min(uMax, kp * error - kd * dq + iTerm));
    const ddq = (u - b * dq - tauG) / J;
    dq += ddq * dt;
    q += dq * dt;
    peak = Math.max(peak, q);
  }

  return Math.max(0, peak - 1) * 100;
}

export interface ZeroOffsetPoint {
  correctionRad: number;
  errorMm: number;
}

/** Points for the live tip-error curve under the zero-offset slider. */
export function zeroOffsetCurve(steps = 24): ZeroOffsetPoint[] {
  return Array.from({ length: steps + 1 }, (_, index) => {
    const correctionRad = (ZERO_OFFSET_RAD * index) / steps;
    return { correctionRad, errorMm: zeroOffsetTipErrorMm(correctionRad) };
  });
}
