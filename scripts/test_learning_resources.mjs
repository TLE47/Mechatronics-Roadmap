#!/usr/bin/env node
/**
 * The resource resolver (`scripts/test_learning_resources.mjs`, `npm run test:resources`).
 *
 * The document is isolated with `COEP: require-corp` for `SharedArrayBuffer`, so an unapproved
 * cross-origin frame is an empty box. These tests pin the three dispositions that keep every
 * authored entry visible without breaking that policy:
 *
 * 1. An external http(s) URL reaches an anchor, without credentials or a script scheme.
 * 2. A relative Markdown link that names a lesson resolves to that lesson's `?lesson=` address.
 * 3. A local file the app cannot serve resolves to an explicit reason, never to nothing.
 *
 * Run: node --experimental-strip-types scripts/test_learning_resources.mjs
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveResource, safeExternalUrl } from '../app/src/features/learning-resources/resolver.ts';
import {
  clearLearningResourceCache,
  loadLearningResources,
} from '../app/src/features/learning-resources/registry.ts';

const SOURCE_02_6 = '02-mechanics-kinematics-dynamics/02.6-thinking-in-comments.md';
const SOURCE_01_4 = '01-electronics-and-power/01.4-grounding-and-rc-lowpass-filters.md';
const SOURCE_P_2_5 = 'track-p/P.2.5-thinking-in-comments.md';

// The panel builds this from PYTHON_LESSONS; the test fixture names only the targets in this file.
const LESSON_BY_PATH = new Map([
  ['track-p/P.6-modules-and-automated-asserts.md', 'P.6'],
  ['02-mechanics-kinematics-dynamics/02.1-1d-link-fk-and-coord-frames.md', '02.1'],
  ['track-p/P.1-variables-and-data-types.md', 'P.1'],
]);
const context = (sourcePath) => ({ sourcePath, lessonByPath: LESSON_BY_PATH });

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (error) {
    failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

test('accepts an https course link', () => {
  assert.equal(safeExternalUrl('https://futurecoder.io/course/#toc'), 'https://futurecoder.io/course/#toc');
});

test('accepts an http link (some older course material is http-only)', () => {
  assert.equal(safeExternalUrl('http://hyperphysics.phy-astr.gsu.edu/hbase/work.html'), 'http://hyperphysics.phy-astr.gsu.edu/hbase/work.html');
});

test('rejects javascript: links', () => {
  assert.equal(safeExternalUrl('javascript:alert(1)'), null);
});

test('rejects data: links', () => {
  assert.equal(safeExternalUrl('data:text/html,<h1>not a resource</h1>'), null);
});

test('rejects mailto: links', () => {
  assert.equal(safeExternalUrl('mailto:someone@example.com'), null);
});

test('rejects malformed URLs', () => {
  assert.equal(safeExternalUrl('not a url'), null);
  assert.equal(safeExternalUrl(''), null);
});

test('rejects credentials embedded in the authority', () => {
  assert.equal(safeExternalUrl('https://user:secret@example.com/lesson'), null);
});

test('resolves an external resource to a deliberate link', () => {
  assert.deepEqual(
    resolveResource({ kind: 'external', url: 'https://docs.python.org/3/tutorial/' }),
    { kind: 'external', url: 'https://docs.python.org/3/tutorial/' }
  );
});

test('routes a sibling Markdown link to its lesson route', () => {
  assert.deepEqual(
    resolveResource({ kind: 'local', url: '02.1-1d-link-fk-and-coord-frames.md' }, context(SOURCE_02_6)),
    { kind: 'internal', url: '?lesson=02.1', lessonId: '02.1' }
  );
});

test('routes a parent-relative Markdown link to its lesson route', () => {
  assert.deepEqual(
    resolveResource({ kind: 'local', url: '../track-p/P.6-modules-and-automated-asserts.md' }, context(SOURCE_02_6)),
    { kind: 'internal', url: '?lesson=P.6', lessonId: 'P.6' }
  );
});

test('routes the P.2.5 local links to their lessons', () => {
  assert.deepEqual(
    resolveResource({ kind: 'local', url: 'P.1-variables-and-data-types.md' }, context(SOURCE_P_2_5)),
    { kind: 'internal', url: '?lesson=P.1', lessonId: 'P.1' }
  );
  assert.deepEqual(
    resolveResource({ kind: 'local', url: 'P.6-modules-and-automated-asserts.md' }, context(SOURCE_P_2_5)),
    { kind: 'internal', url: '?lesson=P.6', lessonId: 'P.6' }
  );
});

test('keeps a local app route when it names a known lesson', () => {
  assert.deepEqual(
    resolveResource({ kind: 'local', url: '?lesson=P.6' }, { lessonByPath: LESSON_BY_PATH }),
    { kind: 'internal', url: '?lesson=P.6', lessonId: 'P.6' }
  );
});

test('shows an explicit reason for a local file the app cannot serve', () => {
  const result = resolveResource(
    { kind: 'local', url: 'falstad/01.4-rc-lowpass.txt' },
    context(SOURCE_01_4)
  );
  assert.equal(result.kind, 'unavailable');
  assert.match(result.reason, /not an app page or a lesson/);
  assert.match(result.reason, /01\.4-rc-lowpass\.txt/);
});

test('does not resolve an unsafe external URL to an anchor', () => {
  assert.deepEqual(resolveResource({ kind: 'external', url: 'javascript:alert(1)' }), {
    kind: 'unavailable',
    reason: 'This resource URL is not a safe http(s) link.',
  });
});

test('does not let a local path escape the repository', () => {
  const result = resolveResource({ kind: 'local', url: '../../../etc/passwd' }, context(SOURCE_02_6));
  assert.equal(result.kind, 'unavailable');
});

// The loader validates the whole generated shape before the panel can render it. Read the committed
// file rather than a fixture: a schema drift in the generator fails here, not in a browser.
clearLearningResourceCache();
try {
  const payload = readFileSync(new URL('../app/public/learning-resources.json', import.meta.url), 'utf8');
  const registry = await loadLearningResources({
    fetch: async () => ({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => JSON.parse(payload),
    }),
  });
  assert.equal(registry.version, 1);
  assert.equal(registry.lessons['P.1'].resources.length, 4);
  assert.equal(registry.lessons['P.1'].resources[0].guide.read.includes('The Shell'), true);

  const groups = Object.values(registry.lessons);
  const registryLessonByPath = new Map(groups.map((group) => [group.path, group.id]));
  const all = groups.flatMap((group) => group.resources);
  assert.equal(all.filter((resource) => resource.kind === 'external').length, 155);
  assert.equal(all.filter((resource) => resource.kind === 'local').length, 5);
  assert.equal(all.length, 160);

  // The panel now maps every group resource, so these dispositions cover the whole authored
  // surface: 155 external links, 4 internal lesson routes, and 1 explicit local-file reason.
  const external = groups.flatMap((group) =>
    group.resources
      .filter((resource) => resource.kind === 'external')
      .map((resource) => resolveResource(resource, { sourcePath: group.path, lessonByPath: registryLessonByPath }))
  );
  assert.equal(external.filter((resolved) => resolved.kind === 'external').length, 155);

  const local = groups.flatMap((group) =>
    group.resources
      .filter((resource) => resource.kind === 'local')
      .map((resource) => resolveResource(resource, { sourcePath: group.path, lessonByPath: registryLessonByPath }))
  );
  assert.equal(local.filter((resolved) => resolved.kind === 'internal').length, 4);
  assert.equal(local.filter((resolved) => resolved.kind === 'unavailable').length, 1);

  assert.equal(registry.lessons['02.6'].resources.length, 2);
  assert.equal(registry.lessons['P.2.5'].resources.length, 2);
  passed += 1;
} catch (error) {
  failures.push(`loads and resolves the committed registry: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  clearLearningResourceCache();
}

if (failures.length) {
  console.error(`${passed} passed, ${failures.length} failed`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`${passed} passed, 0 failed`);
