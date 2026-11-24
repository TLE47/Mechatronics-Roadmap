#!/usr/bin/env node
/**
 * The Learning Path's pure halves (`scripts/test_learning_path.mjs`).
 *
 * `learningPath.ts` draws the whole registry, derives its districts and assigns a landmark in every
 * region; `learningPathLayout.ts` puts every row on the serpentine and draws the road and the
 * district bands; `learningPathScroll.ts` remembers where the learner left the city. None needs
 * React or a browser, so all three are pinned here — including the inputs a browser suite cannot
 * arrange on purpose (a blocked session store, an all-verified curriculum, a track and a module
 * subject this build has never seen).
 *
 * Run: node --experimental-strip-types scripts/test_learning_path.mjs (`npm run test:learning-path`)
 */

import assert from 'node:assert/strict';
import {
  LANDMARK_POOLS,
  buildLearningPath,
  landmarkFor,
  pathDistricts,
  pathSummary,
  tierOf,
} from '../app/src/learningPath.ts';
import { bandForRows, layoutPath, pathD, pathRows } from '../app/src/learningPathLayout.ts';
import {
  moduleSubjectOf,
  regionForLesson,
  regionForTrack,
} from '../app/src/learningPathRegions.ts';
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

const registryIds = PYTHON_LESSONS.map((lesson) => lesson.id);
const ids = (nodes) => nodes.map((node) => node.lesson.id);
const states = (nodes) => nodes.map((node) => node.state);

check('the path is the whole registry, in its order, exactly once', () => {
  const nodes = buildLearningPath({ verified: {} });
  assert.equal(nodes.length, PYTHON_LESSONS.length);
  assert.equal(nodes.length, 97, 'the count the curriculum facts print');
  assert.deepEqual(ids(nodes), registryIds, 'no sorted, filtered or reordered copy');
  assert.equal(new Set(ids(nodes)).size, 97, 'no duplicate platform');
  assert.deepEqual(pathSummary(nodes), { done: 0, total: 97 });
});

check('districts are the curriculum tracks, with the module subjects split out', () => {
  const nodes = buildLearningPath({ verified: {} });
  const districts = pathDistricts(nodes);
  assert.equal(districts.length, 21);
  assert.deepEqual(
    districts.map((district) => district.count),
    [16, 6, 2, 3, 3, 6, 3, 3, 2, 1, 1, 1, 16, 7, 3, 3, 7, 5, 5, 3, 1]
  );
  assert.equal(
    districts.reduce((sum, district) => sum + district.count, 0),
    97,
    'every lesson belongs to exactly one district'
  );
  assert.deepEqual(
    districts.map((district) => district.short).slice(0, 4),
    ['Python', 'Ramp', 'S0', '00']
  );
  assert.deepEqual(
    districts.slice(-3).map((district) => district.short),
    ['06 lab', '07 lab', '08 lab']
  );
  assert.equal(districts[0].firstLessonId, 'P.1');
  assert.equal(districts[districts.length - 1].lastLessonId, 'EX.08-capstones.T3.07a');
  // The 50 module rows are nine subject districts, not one anonymous "modules" pile.
  assert.equal(districts.filter((district) => district.key.startsWith('modules:')).length, 9);
});

check('the registry order and the district runs agree with every node', () => {
  const nodes = buildLearningPath({ verified: {} });
  for (let index = 1; index < nodes.length; index += 1) {
    const previous = nodes[index - 1];
    const node = nodes[index];
    const sameDistrict = node.district === previous.district;
    assert.equal(
      node.indexInDistrict,
      sameDistrict ? previous.indexInDistrict + 1 : 0,
      `indexInDistrict at ${node.lesson.id}`
    );
    if (sameDistrict) {
      assert.equal(node.districtLabel, previous.districtLabel);
    }
  }
});

check('all five regions exist and every landmark belongs to its region', () => {
  const nodes = buildLearningPath({ verified: {} });
  const regions = new Set(nodes.map((node) => node.region));
  assert.deepEqual([...regions].sort(), [
    'cad',
    'electronics',
    'mathematics',
    'programming',
    'robotics',
  ]);
  for (const node of nodes) {
    const pool = LANDMARK_POOLS[node.region];
    assert.ok(pool.length > 0, `${node.region} has a landmark pool`);
    assert.ok(
      pool.includes(node.landmark),
      `${node.lesson.id} (${node.region}) raised ${node.landmark}, outside its pool`
    );
  }
  const landmarks = new Set(nodes.map((node) => node.landmark));
  assert.ok(landmarks.size >= 13, `a varied city, got ${landmarks.size} structures`);
});

check('a new lesson is assigned by its region without touching the page', () => {
  const nodes = buildLearningPath({ verified: {} });
  for (const node of nodes) {
    assert.equal(
      landmarkFor(node.lesson, { region: node.region, indexInDistrict: node.indexInDistrict }),
      node.landmark,
      `landmarkFor must be deterministic at ${node.lesson.id}`
    );
  }
  assert.equal(
    landmarkFor({ id: 'P.999', title: 'Clamp a sensor reading', track: 'track-p' }, {
      region: 'programming',
      indexInDistrict: 2,
    }),
    'branch-arch',
    'a title keyword inside the region still wins'
  );
  assert.equal(
    landmarkFor({ id: 'EX.01-electronics.T1.99z', title: 'A brand new lab', track: 'modules' }, {
      region: 'electronics',
      indexInDistrict: 1,
    }),
    'power-station',
    'a new module cycles its subject pool'
  );
  assert.equal(landmarkFor({ id: 'X.1', title: 'Nothing familiar', track: 'track-p' }), 'storage-tower');
  assert.equal(regionForTrack('not-a-track'), 'programming');
  assert.equal(regionForTrack(null), 'programming');
  assert.equal(regionForTrack('09-new-subject'), 'programming', 'no invented mapping for 09');
  assert.equal(regionForTrack('01-new-subject'), 'electronics', 'a future track lands by its number');
});

check('module ids resolve to their own subject and region', () => {
  assert.equal(moduleSubjectOf('EX.00-foundations.T1.00a'), '00-foundations');
  assert.equal(moduleSubjectOf('P.1'), null);
  assert.equal(regionForLesson({ id: 'EX.02-mechanics.T1.02a', track: 'modules' }), 'cad');
  assert.equal(regionForLesson({ id: 'EX.01-electronics.T2.01a', track: 'modules' }), 'electronics');
  assert.equal(regionForLesson({ id: 'EX.06-robotics.T3.06b', track: 'modules' }), 'robotics');
  assert.equal(regionForLesson({ id: 'P.3', track: 'track-p' }), 'programming');
  assert.equal(tierOf({ id: 'EX.00-foundations.T2.00c', track: 'modules' }), 2);
  assert.equal(tierOf({ id: 'P.3', track: 'track-p' }), null);
  const nodes = buildLearningPath({ verified: {} });
  const exercise = nodes.find((node) => node.lesson.id === 'EX.05-control.T3.05c');
  assert.equal(exercise.tier, 3);
  assert.equal(exercise.region, 'mathematics');
  assert.equal(exercise.districtShort, '05 lab');
});

check('with no progress: current, available, then locked across all 97', () => {
  const nodes = buildLearningPath({ verified: {} });
  assert.deepEqual(states(nodes).slice(0, 3), ['current', 'available', 'locked']);
  assert.ok(states(nodes).slice(3).every((state) => state === 'locked'));
  assert.equal(nodes[0].action.label, 'Start lesson');
  assert.equal(nodes[1].action.kind, 'start');
  assert.equal(nodes[2].action.kind, 'locked');
  assert.equal(nodes[2].prerequisite, nodes[1].lesson.title);
  assert.equal(nodes[nodes.length - 1].prerequisite, nodes[nodes.length - 2].lesson.title);
  assert.equal(nodes[0].prerequisite, null);
});

check('progress in the middle of the curriculum moves the window there', () => {
  const half = new Set(registryIds.slice(0, 50));
  const verified = Object.fromEntries([...half].map((id) => [id, true]));
  const nodes = buildLearningPath({ verified });
  assert.equal(nodes[49].state, 'completed');
  assert.equal(nodes[50].state, 'current');
  assert.equal(nodes[51].state, 'available');
  assert.equal(nodes[52].state, 'locked');
  assert.deepEqual(pathSummary(nodes), { done: 50, total: 97 });
  const districts = pathDistricts(nodes);
  assert.equal(districts[0].done, 16, 'the Python district is complete');
  assert.equal(districts[0].count, 16);
  // The first fifty rows end inside the foundations lab district, which reports its own count.
  assert.equal(districts[11].done, 1, 'the capstone district is complete at row 47');
  assert.equal(districts[12].done, 3, 'three foundations labs are inside the verified prefix');
  assert.equal(districts[12].count, 16);
});

check('all verified completes the whole path and locks nothing', () => {
  const verified = Object.fromEntries(registryIds.map((id) => [id, true]));
  const nodes = buildLearningPath({ verified });
  assert.ok(nodes.every((node) => node.state === 'completed'));
  assert.ok(nodes.every((node) => node.action.kind === 'review'));
  assert.deepEqual(pathSummary(nodes), { done: 97, total: 97 });
  assert.ok(pathDistricts(nodes).every((district) => district.done === district.count));
});

check('the last opened lesson only turns the current node into Continue', () => {
  const nodes = buildLearningPath({ verified: { 'P.1': true }, lastLessonId: 'P.2' });
  assert.equal(nodes[1].action.kind, 'continue');
  assert.equal(nodes[2].action.label, 'Start lesson');
});

check('an explicit slice still renders in the order it is given', () => {
  const nodes = buildLearningPath({ verified: {}, lessonIds: ['P.1', 'P.999', 'P.2'] });
  assert.deepEqual(ids(nodes), ['P.1', 'P.2']);
  assert.deepEqual(states(nodes), ['current', 'available']);
});

check('the desktop layout is a three-wide serpentine over every row', () => {
  const points = layoutPath(97, { columns: 3 });
  assert.equal(points.length, 97);
  assert.equal(pathRows(97, 3), 33);
  const near = (actual, expected) => Math.abs(actual - expected) < 1e-9;
  assert.ok(points.slice(0, 3).every((point, index) => near(point.x, [100 / 6, 50, 500 / 6][index])));
  assert.ok(points.slice(3, 6).every((point, index) => near(point.x, [500 / 6, 50, 100 / 6][index])));
  assert.ok(points.every((point, index) => index === 0 || point.y >= points[index - 1].y));
  assert.equal(new Set(points.map((point) => point.y)).size, 33, 'one y per row');
  assert.ok(points[3].y > points[2].y, 'the next row starts below the first');
  assert.ok(Math.abs(points[0].y - 100 / 66) < 1e-9, 'half a row above the first platform');
  assert.ok(Math.abs(points[96].y - ((32 + 0.5) / 33) * 100) < 1e-9);
  const road = pathD(points);
  assert.equal((road.match(/ C /g) ?? []).length, 96, 'one curve per pair');
  assert.equal(layoutPath(0).length, 0);
  assert.equal(pathD([]), '');
});

check('a phone is one platform per row for the whole curriculum', () => {
  const points = layoutPath(97, { columns: 1 });
  assert.equal(pathRows(97, 1), 97);
  assert.deepEqual(points.slice(0, 4).map((point) => point.x), [30, 70, 30, 70]);
  assert.ok(points.every((point, index) => index === 0 || point.y > points[index - 1].y));
  assert.equal(points[0].side, 'left');
  // Ninety-seven is odd, so the last row is an even row and leans left like the first.
  assert.equal(points[96].side, 'left');
  assert.equal(points[95].side, 'right');
});

check('a district band covers exactly the rows it owns', () => {
  const first = bandForRows(0, 0, 33);
  const last = bandForRows(32, 32, 33);
  assert.ok(Math.abs(first.top - 0) < 1e-9);
  assert.ok(Math.abs(first.height - 100 / 33) < 1e-9);
  assert.ok(Math.abs(last.top + last.height - 100) < 1e-9);
  const rows = Array.from({ length: 33 }, (_, row) => bandForRows(row, row, 33));
  assert.ok(Math.abs(rows.reduce((sum, band) => sum + band.height, 0) - 100) < 1e-6);
  assert.deepEqual(bandForRows(0, 0, 1), { top: 0, height: 100 });
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
