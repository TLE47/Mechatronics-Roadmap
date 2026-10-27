#!/usr/bin/env node
/**
 * The landing arm's motion, checked without a browser (`scripts/test_arm.mjs`).
 *
 * The arm is the first thing a visitor sees, and its one visible failure was motion: the figure-eight
 * was centred on the base, so twice per loop the tip passed through the base, where a two-link
 * inverse-kinematics solution has no defined joint angle. The elbow whipped around in a single frame —
 * measured at 359° of joint travel in 16 ms — which reads as the arm skipping between its left and
 * right poses. A fixed 16 ms step per frame added a second fault: the loop ran twice as fast on a
 * 120 Hz screen as on a 60 Hz one, and a stalled frame was one long jump.
 *
 * `app/src/heroArmModel.ts` now holds the path, the kinematics and the clock, and this suite holds:
 *
 * 1. **The motion is continuous.** At every canvas size, no frame moves a joint more than 3°.
 * 2. **The target is always reachable.** Inside the outer limit and outside the folded arm, so the
 *    kinematic guard never fires and the solution stays on one branch.
 * 3. **The drawing and the target are one path.** Every point of the dashed preview is a point the
 *    tip is asked to follow, and the tip lands on its target every frame.
 * 4. **Time drives the loop, not frames.** 60 Hz and 240 Hz walks of the same wall time end in the
 *    same place, and a stalled frame is capped instead of teleported.
 *
 *   node --experimental-strip-types scripts/test_arm.mjs
 */

import assert from 'node:assert/strict';
import {
  ARM_SPEED,
  advanceArm,
  armFrame,
  armGeometry,
  armTarget,
  targetPath,
} from '../app/src/heroArmModel.ts';

let passed = 0;
let failed = 0;

function check(name, body) {
  try {
    body();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}\n     ${error.message}`);
  }
}

/** The canvas sizes the page actually gives the arm: a wide panel, a phone, and a tall column. */
const SIZES = [
  [400, 300],
  [390, 220],
  [1200, 520],
];

const DEGREES = 180 / Math.PI;

check('no frame moves a joint more than 3 degrees', () => {
  for (const [width, height] of SIZES) {
    const geometry = armGeometry(width, height);
    let previous = null;
    let worst = 0;
    // Two full loops at 60 Hz.
    const frames = Math.round((2 * 2 * Math.PI * 60) / ARM_SPEED);
    for (let index = 0; index <= frames; index += 1) {
      const t = (index * ARM_SPEED) / 60;
      const frame = armFrame(t, geometry);
      if (previous) {
        worst = Math.max(worst, Math.abs(frame.q1 - previous.q1), Math.abs(frame.q2 - previous.q2));
      }
      previous = frame;
    }
    assert.ok(
      worst * DEGREES < 3,
      `${width}x${height}: a frame moved a joint ${(worst * DEGREES).toFixed(1)}°, which reads as a skip`
    );
  }
});

check('the arm actually travels, on both sides of the base', () => {
  const geometry = armGeometry(400, 300);
  let minX = Infinity;
  let maxX = -Infinity;
  let maxQ1 = 0;
  let maxQ2 = 0;
  for (let index = 0; index <= 240; index += 1) {
    const offset = armTarget((index / 240) * Math.PI * 2, geometry);
    minX = Math.min(minX, offset.x);
    maxX = Math.max(maxX, offset.x);
    const frame = armFrame((index / 240) * Math.PI * 2, geometry);
    maxQ1 = Math.max(maxQ1, Math.abs(frame.q1));
    maxQ2 = Math.max(maxQ2, Math.abs(frame.q2));
  }
  assert.ok(minX < -geometry.spanX * 0.9 && maxX > geometry.spanX * 0.9, 'the loop must cross the base line both ways');
  assert.ok(maxQ1 > 0.2 && maxQ2 > 0.2, 'the joints must move, not hold a pose');
});

check('the target stays inside the workspace and off the folded limit', () => {
  for (const [width, height] of SIZES) {
    const geometry = armGeometry(width, height);
    let nearest = Infinity;
    let farthest = 0;
    let worstRatio = 0;
    for (let index = 0; index <= 720; index += 1) {
      const t = (index / 720) * Math.PI * 2;
      const offset = armTarget(t, geometry);
      const radius = Math.hypot(offset.x, offset.y);
      nearest = Math.min(nearest, radius);
      farthest = Math.max(farthest, radius);
      const ratio = Math.abs(
        (offset.x * offset.x + offset.y * offset.y - geometry.l1 ** 2 - geometry.l2 ** 2) /
          (2 * geometry.l1 * geometry.l2)
      );
      worstRatio = Math.max(worstRatio, ratio);
    }
    assert.ok(
      nearest > geometry.inner * 1.2,
      `${width}x${height}: the target comes within ${nearest.toFixed(1)} px of the base, inside the folded arm (${geometry.inner.toFixed(1)} px)`
    );
    assert.ok(
      farthest < geometry.reach * 0.95,
      `${width}x${height}: the target reaches ${farthest.toFixed(1)} px of a ${geometry.reach.toFixed(1)} px arm`
    );
    assert.ok(worstRatio < 0.95, `${width}x${height}: the kinematic guard fires (ratio ${worstRatio.toFixed(2)})`);
  }
});

check('the tip lands on its target every frame', () => {
  for (const [width, height] of SIZES) {
    const geometry = armGeometry(width, height);
    for (let index = 0; index <= 360; index += 1) {
      const frame = armFrame((index / 360) * Math.PI * 2, geometry);
      const error = Math.hypot(frame.tip.x - frame.target.x, frame.tip.y - frame.target.y);
      assert.ok(Number.isFinite(error) && error < 1e-6, `${width}x${height}: the tip is ${error} px from its target`);
    }
  }
});

check('the dashed preview is the path the target follows', () => {
  const geometry = armGeometry(400, 300);
  const path = targetPath(geometry, 64);
  assert.equal(path.length, 65, 'the preview must include its closing point');
  const start = path[0];
  const end = path[path.length - 1];
  assert.ok(Math.hypot(start.x - end.x, start.y - end.y) < 1e-9, 'the preview must close');
  path.forEach((point, index) => {
    const offset = armTarget((index / 64) * Math.PI * 2, geometry);
    assert.ok(
      Math.abs(point.x - (geometry.ox + offset.x)) < 1e-9 && Math.abs(point.y - (geometry.oy - offset.y)) < 1e-9,
      `preview point ${index} is off the target path`
    );
  });
});

check('elapsed time drives the loop, at any frame rate', () => {
  const walk = (hz, seconds) => {
    let t = 0.9;
    for (let step = 0; step < hz * seconds; step += 1) t = advanceArm(t, 1 / hz);
    return t;
  };
  const sixty = walk(60, 4);
  const twoForty = walk(240, 4);
  assert.ok(Math.abs(sixty - twoForty) < 1e-9, `60 Hz ended at ${sixty}, 240 Hz at ${twoForty}`);
  assert.ok(Math.abs(sixty - (0.9 + 4 * ARM_SPEED)) < 1e-9, 'four seconds must be four seconds of travel');
});

check('a stalled frame cannot teleport the arm', () => {
  const t = 1.1;
  const afterStall = advanceArm(t, 30);
  const afterCap = advanceArm(t, 0.05);
  assert.ok(Math.abs(afterStall - afterCap) < 1e-12, 'a 30 s gap must advance no further than 50 ms');
  assert.ok(Math.abs(advanceArm(t, -1) - t) < 1e-12, 'a backwards clock must not rewind the loop');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
