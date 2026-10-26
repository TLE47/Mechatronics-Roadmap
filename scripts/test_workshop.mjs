/**
 * The room without the room (`scripts/test_workshop.mjs`, `npm run test:workshop`).
 *
 * The component draws the workshop; this suite pins the rules it draws from, because each one is a
 * promise about the learner's hands rather than a matter of taste:
 *
 *  * the figure cannot leave the room, and a walk is the same distance both ways;
 *  * a hotspot is usable only when the lane matches and the distance is inside `REACH`, so a click
 *    from across the room cannot claim to have pressed E;
 *  * every key the copy names does what the copy says, and Enter/Space are left to the buttons;
 *  * the menu is generated from the same list the room is, so the two cannot disagree;
 *  * the status line says where the learner stands in words, not just in pixels.
 *
 * It runs in Node with no browser: `app/src/workshop.ts` imports nothing.
 */

import assert from 'node:assert/strict';
import {
  HOTSPOTS,
  LANE_LABEL,
  MAX_X,
  MIN_X,
  REACH,
  START,
  activeHotspot,
  applyMove,
  clampX,
  describePose,
  distanceTo,
  keyAction,
  nearestHotspot,
  positionPercent,
  walk,
  walkTo,
} from '../app/src/workshop.ts';

let failures = 0;
let passes = 0;
function check(name, fn) {
  try {
    fn();
    passes += 1;
    console.log(`  ok  ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAIL ${name}`);
    console.error(`       ${error.message.split('\n').join('\n       ')}`);
  }
}

const at = (id) => {
  const hotspot = HOTSPOTS.find((entry) => entry.id === id);
  assert.ok(hotspot, `no hotspot ${id}`);
  return { x: hotspot.x, lane: hotspot.lane };
};

console.log('MechaLab workshop');

check('the room has exactly the three hotspots the story names, each in the room', () => {
  assert.deepEqual(
    HOTSPOTS.map((hotspot) => hotspot.id),
    ['terminal', 'h7', 'door']
  );
  for (const hotspot of HOTSPOTS) {
    assert.ok(hotspot.x > MIN_X && hotspot.x < MAX_X, `${hotspot.id} is at the wall`);
    assert.ok(hotspot.label && hotspot.hint, `${hotspot.id} needs a name and a hint`);
  }
  const positions = new Set(HOTSPOTS.map((hotspot) => `${hotspot.x}:${hotspot.lane}`));
  assert.equal(positions.size, HOTSPOTS.length, 'two hotspots share a position');
});

check('a visit starts inside the walls, on a lane', () => {
  assert.ok(START.x >= MIN_X && START.x <= MAX_X);
  assert.ok(START.lane === 'floor' || START.lane === 'bench');
});

check('walking clamps at both walls and is the same both ways', () => {
  let pose = { x: 0.2, lane: 'floor' };
  for (let i = 0; i < 40; i += 1) pose = walk(pose, -1);
  assert.equal(pose.x, MIN_X, 'walking left must stop at the wall');
  for (let i = 0; i < 80; i += 1) pose = walk(pose, 1);
  assert.equal(pose.x, MAX_X, 'walking right must stop at the wall');
  const start = { x: 0.5, lane: 'bench' };
  const there = walk(walk(walk(start, 1), 1), 1);
  const back = walk(walk(walk(there, -1), -1), -1);
  assert.equal(back.x, start.x, 'three steps out and three back must land where it started');
});

check('a lane change is a fact about depth, not a walk', () => {
  const bench = applyMove({ x: 0.4, lane: 'floor' }, 'bench');
  assert.deepEqual(bench, { x: 0.4, lane: 'bench' });
  assert.deepEqual(applyMove(bench, 'bench'), bench, 'stepping to the lane you are on is a no-op');
  assert.deepEqual(applyMove(bench, 'floor'), { x: 0.4, lane: 'floor' });
});

check('the key map covers arrows and WASD, and leaves Enter and Space to the buttons', () => {
  const moves = {
    a: 'left',
    A: 'left',
    ArrowLeft: 'left',
    d: 'right',
    D: 'right',
    ArrowRight: 'right',
    w: 'bench',
    W: 'bench',
    ArrowUp: 'bench',
    s: 'floor',
    S: 'floor',
    ArrowDown: 'floor',
    e: 'interact',
    E: 'interact',
  };
  for (const [key, action] of Object.entries(moves)) assert.equal(keyAction(key), action, key);
  for (const key of ['Enter', ' ', 'Tab', 'Escape', 'q', 'ArrowDown ']) {
    assert.equal(keyAction(key), null, `${JSON.stringify(key)} must not be a room key`);
  }
});

check('standing on a hotspot, in its lane, is the only way to use it', () => {
  for (const hotspot of HOTSPOTS) {
    assert.equal(activeHotspot(at(hotspot.id))?.id, hotspot.id, `${hotspot.id} at its own spot`);
  }
  const otherLane = (hotspot) => ({ x: hotspot.x, lane: hotspot.lane === 'bench' ? 'floor' : 'bench' });
  for (const hotspot of HOTSPOTS) {
    assert.equal(activeHotspot(otherLane(hotspot)), null, `${hotspot.id} across the lanes is not in reach`);
  }
  const terminal = HOTSPOTS.find((hotspot) => hotspot.id === 'terminal');
  const justOutside = { x: terminal.x + REACH + 0.001, lane: terminal.lane };
  assert.equal(activeHotspot(justOutside), null, 'one step past reach must not count');
});

check('the nearest hotspot is always named, reachable or not', () => {
  const nearest = nearestHotspot(START);
  assert.ok(nearest, 'a room with three hotspots always has a nearest one');
  const distances = HOTSPOTS.map((hotspot) => distanceTo(START, hotspot));
  assert.equal(distanceTo(START, nearest), Math.min(...distances), 'the nearest must be the closest');
  for (const hotspot of HOTSPOTS) {
    assert.equal(nearestHotspot(at(hotspot.id))?.id, hotspot.id, `${hotspot.id} is nearest to itself`);
  }
});

check('the room is walkable: every hotspot can be reached with the keys', () => {
  let pose = { ...START };
  const reached = new Set();
  // A breadth-first sweep over the model's own moves, so the claim is about the rules and not a
  // hand-picked path: sixteen steps in each direction, both lanes.
  const queue = [{ pose, steps: 0 }];
  const seen = new Set([`${pose.x}:${pose.lane}`]);
  while (queue.length) {
    const { pose: current, steps } = queue.shift();
    const here = activeHotspot(current);
    if (here) reached.add(here.id);
    if (steps >= 24) continue;
    for (const move of ['left', 'right', 'bench', 'floor']) {
      const next = applyMove(current, move);
      const key = `${next.x}:${next.lane}`;
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({ pose: next, steps: steps + 1 });
    }
  }
  assert.deepEqual([...reached].sort(), ['door', 'h7', 'terminal']);
});

check('a tap lands where it was aimed, clamped, on the lane you stand on', () => {
  assert.deepEqual(walkTo({ x: 0.5, lane: 'bench' }, 0.2), { x: 0.2, lane: 'bench' });
  assert.equal(walkTo({ x: 0.5, lane: 'floor' }, -1).x, MIN_X);
  assert.equal(walkTo({ x: 0.5, lane: 'floor' }, 2).x, MAX_X);
  assert.equal(clampX(Number.NaN), MIN_X, 'a bad coordinate cannot put the figure outside');
  assert.equal(positionPercent(0.1234), '12.3%');
  assert.equal(positionPercent(-4), `${MIN_X * 100}%`);
});

check('the status line says the lane, and how to use what is in reach', () => {
  const terminal = at('terminal');
  const close = describePose(terminal);
  assert.match(close, new RegExp(LANE_LABEL[terminal.lane]));
  assert.match(close, /Press E/);
  const far = describePose({ x: 0.9, lane: 'floor' });
  assert.match(far, new RegExp(LANE_LABEL.floor));
  assert.doesNotMatch(far, /Press E/, 'nothing is in reach from the far wall');
  for (const hotspot of HOTSPOTS) {
    assert.match(describePose(at(hotspot.id)), new RegExp(hotspot.label), hotspot.id);
  }
});

console.log(`\n${passes} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
