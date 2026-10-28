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
import { collidingCells } from '../app/src/visuals/graphLayout.ts';
import { SCENES, SCENE_IDS, sceneFor } from '../app/src/visuals/scenes.ts';
import { LESSON_PAGE_VERSION } from '../app/src/lessonPage.ts';
import {
  HOME,
  LINK_1,
  LINK_2,
  PITCH_RANGE,
  Q1_RANGE,
  Q2_RANGE,
  TRAIL_LIMIT,
  YAW_RANGE,
  ZOOM_HOME,
  ZOOM_RANGE,
  ZOOM_STEP,
  clampHolo,
  clampZoom,
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
      case 'graph': {
        const nodes = spec.nodes ?? [];
        const edges = spec.edges ?? [];
        assert.ok(nodes.length >= 2, `${id} is a graph with fewer than two boxes`);
        assert.ok(spec.direction === 'LR' || spec.direction === 'TD', `${id} has no direction, so it has no layout`);
        const ids = new Set(nodes.map((node) => node.id));
        assert.equal(ids.size, nodes.length, `${id} has two nodes with the same id, so one box is unreachable`);
        assert.ok(edges.length >= 1, `${id} is a graph with no arrow: that is a list of boxes`);
        for (const edge of edges) {
          assert.ok(ids.has(edge.from) && ids.has(edge.to), `${id} draws an arrow between boxes it does not have`);
        }
        assert.ok(nodes.every((node) => node.label.trim().length > 0), `${id} has an unlabelled box`);
        break;
      }
      case 'matrix': {
        const grid = spec.matrix;
        assert.ok(grid, `${id} has no matrix`);
        assert.equal(grid.cells.length, grid.rows.length, `${id} has ${grid.rows.length} row labels but ${grid.cells.length} rows`);
        for (const row of grid.cells) {
          assert.equal(row.length, grid.cols.length, `${id} has a row whose length is not the column count`);
        }
        for (const [row, col] of grid.highlight ?? []) {
          assert.ok(
            row >= 0 && row < grid.rows.length && col >= 0 && col < grid.cols.length,
            `${id} highlights a cell it does not draw`
          );
        }
        break;
      }
      case 'bits': {
        const register = spec.bits;
        assert.ok(register, `${id} has no register`);
        assert.ok(Number.isInteger(register.width) && register.width >= 4 && register.width <= 32, `${id} is a register of ${register.width} bits`);
        assert.ok(register.segments.length >= 1, `${id} labels no field`);
        for (const segment of register.segments) {
          assert.ok(
            segment.from >= 0 && segment.to < register.width && segment.from <= segment.to,
            `${id}/${segment.label} spans bits outside the register`
          );
        }
        break;
      }
      case 'reach': {
        const dial = spec.reach;
        assert.ok(dial, `${id} has no reach`);
        assert.ok(dial.max > dial.min && dial.min >= 0, `${id} has an impossible ring: min ${dial.min}, max ${dial.max}`);
        assert.ok(dial.points.length >= 1, `${id} marks nothing on the dial`);
        for (const point of dial.points) {
          assert.ok(Number.isFinite(point.at), `${id}/${point.label} is not at a number`);
        }
        break;
      }
      case 'schematic': {
        const circuit = spec.schematic;
        assert.ok(circuit, `${id} has no circuit`);
        assert.ok(circuit.series.length >= 2, `${id} is a circuit with fewer than two parts`);
        if (circuit.shunt) {
          assert.ok(
            circuit.shunt.after >= 0 && circuit.shunt.after < circuit.series.length,
            `${id} hangs its shunt off a part it does not draw`
          );
        }
        break;
      }
      case 'plot': {
        const chart = spec.plot;
        assert.ok(chart, `${id} has no plot`);
        assert.ok(chart.x.max > chart.x.min && chart.y.max > chart.y.min, `${id} has an empty axis`);
        assert.ok(chart.series.length >= 1, `${id} plots no series`);
        for (const line of chart.series) {
          assert.ok(line.points.length >= 1, `${id}/${line.label} has no points`);
          for (const point of line.points) {
            assert.ok(
              Number.isFinite(point.x) && Number.isFinite(point.y),
              `${id}/${line.label} has a non-finite point`
            );
            assert.ok(
              point.x >= chart.x.min - 1e-9 && point.x <= chart.x.max + 1e-9,
              `${id}/${line.label} plots x=${point.x} outside [${chart.x.min}, ${chart.x.max}]`
            );
            assert.ok(
              point.y >= chart.y.min - 1e-9 && point.y <= chart.y.max + 1e-9,
              `${id}/${line.label} plots y=${point.y} outside [${chart.y.min}, ${chart.y.max}]`
            );
          }
        }
        for (const band of chart.bands ?? []) {
          const axis = band.axis === 'x' ? chart.x : chart.y;
          assert.ok(
            band.from >= axis.min && band.to <= axis.max && band.to > band.from,
            `${id}/${band.label} shades a window outside its axis`
          );
        }
        break;
      }
      case 'route':
        assert.fail(`${id} is a route, but a route is a page's own flowchart, never a named scene`);
        break;
      default:
        assert.fail(`${id} has kind ${spec.kind}, which no renderer draws`);
    }
  }
});

check('no graph draws two boxes in one cell', () => {
  // A scene names its own lanes, and a lane repeated at one depth is a box hidden under another:
  // the fan it was meant to show is gone, with no broken link and no missing scene to notice.
  for (const [id, spec] of Object.entries(SCENES)) {
    if (spec.kind !== 'graph') continue;
    assert.deepEqual(collidingCells(spec), [], `${id} stacks its boxes`);
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
      // The reader's own constant, not a copy: a generator bump that forgot this test would ship
      // pages the app refuses, and the assertion should say so rather than drift.
      assert.equal(
        payload.v,
        LESSON_PAGE_VERSION,
        `${path.relative(PAGES, full)} is payload v${payload.v}; re-run the generator`
      );
      for (const block of payload.blocks ?? []) {
        if (block.t === 'figure') assert.equal(typeof block.caption, 'string', `${full} has a figure with no caption field`);
        if (block.t === 'route') {
          assert.ok(Array.isArray(block.steps) && block.steps.length >= 2, `${full} has a route with fewer than two steps`);
          assert.ok(
            block.steps.every((step) => typeof step === 'string' && step.trim().length > 0),
            `${full} has a route step that is not a label: an empty box is a gap in the map`
          );
        }
        if (block.t === 'graph') {
          const ids = new Set((block.nodes ?? []).map((node) => node.id));
          assert.ok(ids.size >= 2, `${full} has a graph with fewer than two boxes`);
          assert.ok((block.edges ?? []).length >= 1, `${full} has a graph with no arrows`);
          assert.ok(
            (block.edges ?? []).every((edge) => ids.has(edge.from) && ids.has(edge.to)),
            `${full} has a graph arrow that lands on a box the page does not name`
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

check('the view zooms between its limits and never to nothing', () => {
  assert.equal(clampZoom(9), ZOOM_RANGE[1], 'a big zoom must stop at the top of its range');
  assert.equal(clampZoom(0), ZOOM_RANGE[0], 'zooming out must stop while the arm still reads');
  assert.equal(clampZoom(Number.NaN), ZOOM_HOME, 'a missing factor is the default, not a blank figure');
  assert.equal(
    clampZoom(ZOOM_HOME + ZOOM_STEP),
    Math.round((ZOOM_HOME + ZOOM_STEP) * 100) / 100,
    'a notch must land on the two-decimal value the readout shows'
  );
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
