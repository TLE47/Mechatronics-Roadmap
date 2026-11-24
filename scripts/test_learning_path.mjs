#!/usr/bin/env node
/**
 * The Learning Path's pure halves (`scripts/test_learning_path.mjs`).
 *
 * `learningPath.ts` decides what each platform is and which of the four states it is in;
 * `learningPathLayout.ts` puts the six on the serpentine and draws the road; `learningPathScroll.ts`
 * remembers where the learner left the city. None needs React or a browser, so all three are pinned
 * here — including the inputs a browser suite cannot arrange on purpose (a blocked session store, a
 * seventh lesson, an unknown track, all six verified).
 *
 * Run: node --experimental-strip-types scripts/test_learning_path.mjs (`npm run test:learning-path`)
 */

import assert from 'node:assert/strict';
import {
  PROTOTYPE_LESSON_IDS,
  buildLearningPath,
  landmarkFor,
  pathSummary,
  prototypeLessons,
} from '../app/src/learningPath.ts';
import { layoutPath, pathD, pathRows } from '../app/src/learningPathLayout.ts';
import { regionForTrack } from '../app/src/learningPathRegions.ts';
import {
  STORAGE_KEY_PATH_MEMORY,
  readPathMemory,
  rememberPath,
} from '../app/src/learningPathScroll.ts';
import { PYTHON_LESSONS } from '../app/src/data/pythonLessonsData.ts';

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL ${name}\n       ${error.message}`);
  }
}

/** The session store shape the module uses, with an optional failing mode. */
function fakeStore({ broken = false } = {}) {
  const data = new Map();
  return {
    getItem(key) {
      if (broken) throw new Error('blocked');
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      if (broken) throw new Error('blocked');
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
    clear() {
      data.clear();
    },
    key() {
      return null;
    },
    get length() {
      return data.size;
    },
    data,
  };
}

const ids = (nodes) => nodes.map((node) => node.lesson.id);
const states = (nodes) => nodes.map((node) => node.state);

check('the prototype is the six approved rows, in curriculum order', () => {
  const lessons = prototypeLessons();
  assert.deepEqual(lessons.map((lesson) => lesson.id), ['P.1', 'P.2', 'P.2.5', 'P.3', 'P.4', 'P.5']);
  const registry = PYTHON_LESSONS.map((lesson) => lesson.id);
  for (const id of PROTOTYPE_LESSON_IDS) assert.ok(registry.includes(id), `${id} is in the registry`);
  // P.2.5 sits between P.2 and P.3 in the course itself, which is why the six are not P.1..P.6.
  assert.equal(registry.indexOf('P.2.5'), registry.indexOf('P.2') + 1);
  assert.equal(registry.indexOf('P.3'), registry.indexOf('P.2.5') + 1);
});

check('with no progress: current, available, then locked', () => {
  const nodes = buildLearningPath({ verified: {} });
  assert.deepEqual(states(nodes), [
    'current',
    'available',
    'locked',
    'locked',
    'locked',
    'locked',
  ]);
  assert.equal(nodes[0].action.kind, 'start');
  assert.equal(nodes[0].action.label, 'Start lesson');
  assert.equal(nodes[1].action.kind, 'start');
  assert.equal(nodes[2].action.kind, 'locked');
  assert.equal(nodes[2].action.label, 'Locked');
  assert.equal(nodes[2].prerequisite, nodes[1].lesson.title);
  assert.equal(nodes[0].prerequisite, null, 'an open platform names no prerequisite');
  assert.deepEqual(pathSummary(nodes), { done: 0, total: 6 });
});

check('one verified lesson moves the whole window down one', () => {
  const nodes = buildLearningPath({ verified: { 'P.1': true } });
  assert.deepEqual(states(nodes), [
    'completed',
    'current',
    'available',
    'locked',
    'locked',
    'locked',
  ]);
  assert.equal(nodes[0].action.kind, 'review');
  assert.equal(nodes[0].action.label, 'Review lesson');
  assert.equal(nodes[1].action.kind, 'start');
  assert.equal(nodes[2].action.kind, 'start');
  assert.equal(nodes[3].prerequisite, nodes[2].lesson.title);
  assert.deepEqual(pathSummary(nodes), { done: 1, total: 6 });
});

check('the last opened lesson turns Start into Continue', () => {
  const nodes = buildLearningPath({ verified: { 'P.1': true }, lastLessonId: 'P.2' });
  assert.equal(nodes[1].action.kind, 'continue');
  assert.equal(nodes[1].action.label, 'Continue lesson');
  assert.equal(nodes[2].action.label, 'Start lesson', 'one lesson ahead is still a start');
});

check('all verified completes the path and locks nothing', () => {
  const verified = Object.fromEntries(PROTOTYPE_LESSON_IDS.map((id) => [id, true]));
  const nodes = buildLearningPath({ verified });
  assert.deepEqual(states(nodes), Array(6).fill('completed'));
  assert.ok(nodes.every((node) => node.action.kind === 'review'));
  assert.deepEqual(pathSummary(nodes), { done: 6, total: 6 });
});

check('a slice missing from the registry is skipped, not drawn blank', () => {
  const nodes = buildLearningPath({ verified: {}, lessonIds: ['P.1', 'P.999', 'P.2'] });
  assert.deepEqual(ids(nodes), ['P.1', 'P.2']);
  assert.deepEqual(states(nodes), ['current', 'available']);
});

check('every prototype platform has its own landmark and region', () => {
  const nodes = buildLearningPath({ verified: {} });
  const landmarks = nodes.map((node) => node.landmark);
  assert.equal(new Set(landmarks).size, 6, 'six structures, not one repeated');
  assert.equal(landmarkFor({ id: 'P.1', title: 'anything' }), 'storage-tower');
  assert.equal(
    landmarkFor({ id: 'P.999', title: 'Clamp a sensor reading' }),
    'branch-arch',
    'a new lesson is mapped by its title until it earns its own entry'
  );
  assert.equal(landmarkFor({ id: 'P.999', title: 'Something else entirely' }), 'region-tower');
  assert.equal(regionForTrack('track-p'), 'programming');
  assert.equal(regionForTrack('00-foundations'), 'electronics');
  assert.equal(regionForTrack('02-mechanics-kinematics-dynamics'), 'robotics');
  assert.equal(regionForTrack('not-a-track'), 'programming');
  assert.equal(regionForTrack(null), 'programming');
});

check('the desktop layout is a three-wide serpentine with one road', () => {
  const points = layoutPath(6, { columns: 3 });
  assert.equal(points.length, 6);
  assert.equal(pathRows(6, 3), 2);
  assert.deepEqual(points.map((point) => [point.row, point.column]), [
    [0, 0],
    [0, 1],
    [0, 2],
    [1, 2],
    [1, 1],
    [1, 0],
  ]);
  assert.ok(points[0].x < points[1].x && points[1].x < points[2].x);
  assert.ok(points[3].x > points[4].x && points[4].x > points[5].x, 'row two runs back');
  assert.equal(points[0].y, points[2].y);
  assert.equal(points[3].y, points[5].y);
  assert.ok(points[0].y < points[3].y);
  const road = pathD(points);
  assert.ok(road.startsWith(`M ${points[0].x} ${points[0].y}`));
  assert.equal((road.match(/ C /g) ?? []).length, 5, 'one curve per pair');
  assert.equal(layoutPath(0).length, 0);
  assert.equal(pathD([]), '');
});

check('a phone is one platform per row, alternating sides', () => {
  const points = layoutPath(6, { columns: 1 });
  assert.equal(pathRows(6, 1), 6);
  assert.deepEqual(
    points.map((point) => point.side),
    ['left', 'right', 'left', 'right', 'left', 'right']
  );
  assert.deepEqual(
    points.map((point) => point.x),
    [30, 70, 30, 70, 30, 70]
  );
  assert.ok(points.every((point, index) => index === 0 || point.y > points[index - 1].y));
});

check('the scroll memory round-trips and survives a blocked store', () => {
  const store = fakeStore();
  assert.deepEqual(readPathMemory(store), { y: 0, selectedId: null });
  assert.deepEqual(rememberPath({ y: 812.6, selectedId: 'P.3' }, store), {
    y: 813,
    selectedId: 'P.3',
  });
  assert.deepEqual(readPathMemory(store), { y: 813, selectedId: 'P.3' });
  assert.deepEqual(rememberPath({ y: 12 }, store), { y: 12, selectedId: 'P.3' });
  assert.ok(store.data.has(STORAGE_KEY_PATH_MEMORY));

  // Hostile values: a negative offset, a non-number, a broken string.
  store.setItem(STORAGE_KEY_PATH_MEMORY, JSON.stringify({ y: -40, selectedId: 7 }));
  assert.deepEqual(readPathMemory(store), { y: 0, selectedId: null });
  store.setItem(STORAGE_KEY_PATH_MEMORY, 'not json');
  assert.deepEqual(readPathMemory(store), { y: 0, selectedId: null });

  const broken = fakeStore({ broken: true });
  assert.deepEqual(readPathMemory(broken), { y: 0, selectedId: null });
  assert.doesNotThrow(() => rememberPath({ y: 20, selectedId: 'P.1' }, broken));
  assert.deepEqual(rememberPath({ y: 20, selectedId: 'P.1' }, broken), {
    y: 20,
    selectedId: 'P.1',
  });
  assert.deepEqual(rememberPath({ y: 5 }, null), { y: 5, selectedId: null });
});

console.log(`\nlearning path: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
