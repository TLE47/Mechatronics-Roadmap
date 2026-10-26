#!/usr/bin/env node
/**
 * The visual kit, checked without a browser (`scripts/test_visuals.mjs`).
 *
 * Two things ship in `app/src/visuals/`: a library of named scenes the reader and the tabs draw, and
 * the arm's geometry (forward kinematics, inverse kinematics, an orbit and a projection). Neither is
 * React, which is the point — a wrong scene or a wrong joint limit is a failing assertion here, not a
 * picture that looks odd on one tab.
 *
 * The claims this suite holds:
 *
 * 1. **A scene is drawable.** Every spec has the data its kind needs (a chain with one box is a
 *    label, not a chain; a state figure with three states and two gates is a missing transition).
 * 2. **Names are stable and honest.** Ids are kebab-case, `sceneFor` refuses an unknown one instead of
 *    inventing a blank, and no two scenes share an id.
 * 3. **Every figure a committed page asks for exists.** The lesson payloads are generated and
 *    committed, so this reads them: a page asking for a scene this build does not have is a figure
 *    that would render as a "missing" notice in the reader.
 * 4. **The arm obeys its own limits.** Joints clamp, the orbit clamps, inverse kinematics refuses a
 *    target outside the reach and round-trips forward kinematics inside it, and the demo never asks
 *    for a pose the hardware could not take.
 *
 *   node --experimental-strip-types scripts/test_visuals.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SCENES, SCENE_IDS, sceneFor } from '../app/src/visuals/scenes.ts';
import {
  HOME,
  LINK_1,
  LINK_2,
  PITCH_RANGE,
  Q1_RANGE,
  Q2_RANGE,
  TRAIL_LIMIT,
  YAW_RANGE,
  clampHolo,
  demoPose,
  describe,
  floorLines,
  fk,
  ik,
  orbit,
  project,
  pushTrail,
  reach,
  withJoint,
} from '../app/src/visuals/holoModel.ts';

const ROOT = process.cwd();
const PAGES = path.join(ROOT, 'app', 'public', 'lesson-pages');

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL ${name}`);
    console.error(`       ${error.message}`);
  }
}

// --- the scene library -------------------------------------------------------------------------

check('every scene carries a title, a caption and the data its kind draws', () => {
  for (const [id, spec] of Object.entries(SCENES)) {
    assert.match(id, /^[a-z0-9][a-z0-9-]*$/, `${id} is not kebab-case, so a Markdown directive cannot name it`);
    assert.ok(spec.title.length > 2, `${id} has no title`);
    assert.ok(spec.caption.length > 20, `${id}'s caption is a fragment, not a sentence a reader can use`);
    switch (spec.kind) {
      case 'chain':
        assert.ok((spec.stages ?? []).length >= 2, `${id} is a chain with fewer than two boxes`);
        break;
      case 'loop':
        assert.ok((spec.stages ?? []).length >= 3, `${id} is a loop with fewer than three stages`);
        break;
      case 'timing':
        assert.ok((spec.series ?? []).length >= 1, `${id} is a timing figure with no series`);
        for (const line of spec.series ?? []) {
          assert.ok(line.points.length >= 2, `${id}/${line.label} needs at least two samples to draw a line`);
          assert.ok(line.points.every((value) => Number.isFinite(value)), `${id}/${line.label} has a non-finite sample`);
        }
        break;
      case 'states': {
        const states = (spec.stages ?? []).length;
        assert.ok(states >= 2, `${id} is a state figure with fewer than two states`);
        assert.equal(
          (spec.transitions ?? []).length,
          states - 1,
          `${id} has ${states} states but ${(spec.transitions ?? []).length} gate labels: every arrow needs one`
        );
        break;
      }
      case 'bars':
        assert.ok((spec.bars ?? []).length >= 1, `${id} has no bars`);
        for (const row of spec.bars ?? []) {
          assert.ok(row.value >= 0 && row.value <= row.max, `${id}/${row.label} draws outside its own axis`);
        }
        break;
      default:
        assert.fail(`${id} has kind ${spec.kind}, which no renderer draws`);
    }
  }
});

check('ids are unique, sorted and refuse an unknown name', () => {
  assert.deepEqual([...SCENE_IDS].sort(), SCENE_IDS, 'SCENE_IDS is not sorted, so the test output moves');
  assert.equal(new Set(SCENE_IDS).size, SCENE_IDS.length, 'two scenes share an id, so one of them is unreachable');
  assert.equal(sceneFor('not-a-scene'), null, 'an unknown id must be null, not a blank scene');
  for (const id of SCENE_IDS) assert.equal(sceneFor(id), SCENES[id], `${id} does not resolve to its own spec`);
});

check('the figures a committed lesson asks for all exist', () => {
  assert.ok(fs.existsSync(PAGES), 'app/public/lesson-pages is missing; run scripts/generate_lesson_pages.py');
  const wanted = new Map();
  const walk = (folder) => {
    for (const name of fs.readdirSync(folder)) {
      const full = path.join(folder, name);
      if (fs.statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!name.endsWith('.json')) continue;
      const payload = JSON.parse(fs.readFileSync(full, 'utf8'));
      for (const block of payload.blocks ?? []) {
        if (block.t !== 'figure') continue;
        wanted.set(block.id, [...(wanted.get(block.id) ?? []), path.relative(PAGES, full)]);
      }
    }
  };
  walk(PAGES);
  assert.ok(wanted.size > 0, 'no lesson page carries a figure: the directives are missing or the payloads are stale');
  for (const [id, pages] of wanted) {
    assert.ok(SCENES[id], `${pages[0]} asks for figure "${id}", which this build cannot draw`);
  }
});

check('every committed payload is the version this build reads', () => {
  const walk = (folder) => {
    for (const name of fs.readdirSync(folder)) {
      const full = path.join(folder, name);
      if (fs.statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!name.endsWith('.json')) continue;
      const payload = JSON.parse(fs.readFileSync(full, 'utf8'));
      assert.equal(payload.v, 3, `${path.relative(PAGES, full)} is payload v${payload.v}; re-run the generator`);
      for (const block of payload.blocks ?? []) {
        if (block.t === 'figure') assert.equal(typeof block.caption, 'string', `${full} has a figure with no caption field`);
        if (block.t === 'route') {
          assert.ok(Array.isArray(block.steps) && block.steps.length >= 2, `${full} has a route with fewer than two steps`);
          assert.ok(
            block.steps.every((step) => typeof step === 'string' && step.trim().length > 0),
            `${full} has a route step that is not a label: an empty box is a gap in the map`
          );
        }
      }
    }
  };
  walk(PAGES);
});

check('the pages carry the routes their flowcharts describe', () => {
  const PAGES_DIR = PAGES;
  let withRoute = 0;
  let total = 0;
  const walk = (folder) => {
    for (const name of fs.readdirSync(folder)) {
      const full = path.join(folder, name);
      if (fs.statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!name.endsWith('.json')) continue;
      total += 1;
      const payload = JSON.parse(fs.readFileSync(full, 'utf8'));
      if ((payload.blocks ?? []).some((block) => block.t === 'route')) withRoute += 1;
    }
  };
  walk(PAGES_DIR);
  assert.ok(total > 80, 'expected the registry’s pages beside the bundle');
  assert.ok(
    withRoute > total * 0.75,
    `${withRoute} of ${total} pages draw a route: nearly every page writes a single-chain flowchart, so a drop here means the parse regressed`
  );
});

// --- the arm -----------------------------------------------------------------------------------

check('joints and the view clamp to their own limits', () => {
  const wild = clampHolo({ yaw: 9, pitch: 9, q1: 9, q2: -9 });
  assert.equal(wild.yaw, YAW_RANGE[1], 'yaw must clamp to the top of its range');
  assert.equal(wild.pitch, PITCH_RANGE[1], 'pitch must clamp to the top of its range');
  assert.equal(wild.q1, Q1_RANGE[1], 'the shoulder must not pass its mechanical stop');
  assert.equal(wild.q2, Q2_RANGE[0], 'the elbow must not pass its mechanical stop');
  assert.equal(clampHolo({ ...HOME, q1: Number.NaN }).q1, Q1_RANGE[0], 'NaN must fall back to the low limit, not draw nothing');
});

check('a drag turns the view, and never past its stop', () => {
  const turned = orbit(HOME, 40, 0);
  assert.ok(turned.yaw > HOME.yaw, 'dragging right must turn the view right');
  const tilted = orbit(HOME, 0, 40);
  assert.ok(tilted.pitch > HOME.pitch, 'dragging down must tilt the view down');
  const spun = orbit(HOME, 10_000, 10_000);
  assert.ok(spun.yaw <= YAW_RANGE[1] && spun.pitch <= PITCH_RANGE[1], 'a huge drag must stop at the limits');
});

check('a slider poses one joint and leaves the other alone', () => {
  const posed = withJoint(HOME, 1, 0.9);
  assert.equal(posed.q1, 0.9, 'the shoulder must take the slider value');
  assert.equal(posed.q2, HOME.q2, 'posing the shoulder must not move the elbow');
  assert.equal(withJoint(HOME, 2, -3).q2, Q2_RANGE[0], 'the elbow slider must clamp at its stop');
});

check('forward kinematics puts the tip where two links say it goes', () => {
  const straight = fk({ ...HOME, q1: 0, q2: 0 });
  assert.ok(Math.abs(straight.tip.x - (LINK_1 + LINK_2)) < 1e-9, 'straight out, the tip is L1 + L2 from the base');
  assert.ok(Math.abs(straight.tip.y) < 1e-9, 'straight out, the tip is on the base line');
  const folded = fk({ ...HOME, q1: 0, q2: -Math.PI });
  assert.ok(Math.abs(folded.tip.x - (LINK_1 - LINK_2)) < 1e-9, 'folded back, the tip is L1 - L2');
});

check('inverse kinematics round-trips the forward one, and refuses what it cannot reach', () => {
  for (const q1 of [-2, -0.8, 0, 0.9, 2]) {
    for (const q2 of [-2.4, -1.2, -0.4]) {
      const { tip } = fk({ ...HOME, q1, q2 });
      const solved = ik({ x: tip.x, y: tip.y });
      assert.ok(solved, `ik refused a reachable pose (q1 ${q1}, q2 ${q2})`);
      const back = fk({ ...HOME, q1: solved.q1, q2: solved.q2 }).tip;
      assert.ok(Math.abs(back.x - tip.x) < 1e-9 && Math.abs(back.y - tip.y) < 1e-9, 'ik -> fk must land on the same point');
    }
  }
  assert.equal(ik({ x: reach().max + 0.2, y: 0 }), null, 'a target past the reach must be refused');
  assert.equal(ik({ x: reach().min - 0.1, y: 0 }), null, 'a target inside the inner circle must be refused');
});

check('the demo traces a figure-eight without asking for an impossible pose', () => {
  let poses = 0;
  for (let phase = 0; phase < Math.PI * 2; phase += 0.05) {
    const pose = demoPose(phase, HOME);
    assert.ok(Number.isFinite(pose.q1) && Number.isFinite(pose.q2), `phase ${phase.toFixed(2)} produced a non-finite pose`);
    assert.ok(pose.q1 >= Q1_RANGE[0] && pose.q1 <= Q1_RANGE[1], `phase ${phase.toFixed(2)} left the shoulder's range`);
    assert.ok(pose.q2 >= Q2_RANGE[0] && pose.q2 <= Q2_RANGE[1], `phase ${phase.toFixed(2)} left the elbow's range`);
    poses += 1;
  }
  assert.ok(poses > 100, 'the sweep sampled too few poses to mean anything');
});

check('the projection is deterministic, flips up, and keeps the far end shorter', () => {
  const near = project({ x: LINK_1, y: 0, z: 0 }, HOME, 96);
  const again = project({ x: LINK_1, y: 0, z: 0 }, HOME, 96);
  assert.deepEqual(near, again, 'the same point and view must project to the same pixel');
  const up = project({ x: 0, y: 1, z: 0 }, { ...HOME, yaw: 0, pitch: 0 }, 96);
  assert.ok(up.y < 0, 'the arm plane is y-up, so a positive y must project above the origin');
  const ahead = project({ x: 0, y: 0, z: 1 }, { ...HOME, yaw: 0, pitch: 0 }, 96);
  const behind = project({ x: 0, y: 0, z: -1 }, { ...HOME, yaw: 0, pitch: 0 }, 96);
  assert.ok(Math.abs(ahead.depth) < Math.abs(behind.depth) + 1, 'depth must carry the sign of the view direction');
});

check('the floor and the readout are bounded and readable', () => {
  const lines = floorLines(3);
  assert.equal(lines.length, 14, 'three steps either side is seven in each direction');
  assert.ok(
    lines.every(([a, b]) => Number.isFinite(a.x) && Number.isFinite(b.y)),
    'a floor line must be two finite points'
  );
  const text = describe(HOME);
  assert.ok(text.includes('q₁') && text.includes('°'), 'the readout must name the joint and use degrees');
});

check('the phosphor trail is bounded', () => {
  let trail = [];
  for (let index = 0; index < TRAIL_LIMIT + 40; index += 1) trail = pushTrail(trail, { x: index, y: 0 });
  assert.equal(trail.length, TRAIL_LIMIT, 'the trail must stop growing at its limit');
  assert.equal(trail[trail.length - 1].x, TRAIL_LIMIT + 39, 'the trail must keep the newest points');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
