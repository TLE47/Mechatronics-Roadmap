#!/usr/bin/env node
/**
 * Searching the course pages (`scripts/test_prose_search.mjs`, `npm run test:prose`).
 *
 * `⌘⇧F` promises that a word a learner half-remembers can be found in the course's own words. For
 * the runner's lessons that promise is kept by `lessonSearch.ts`; for the 65 reading pages it is
 * kept by a file the app fetches on demand, and every way that promise breaks is silent:
 *
 * 1. **The index is not the route.** The generator reads `scripts/route_model.py`; a page added to a
 *    step without the file regenerated would still "work", quietly missing the new page. The count
 *    (48 lessons + 17 arm modules), the ids and the route order are pinned here.
 * 2. **Code or a generated callout is indexed.** Every page carries a "Run this in the workbench"
 *    block and a "Next:" line written by scripts; if they were indexed, every page would match the
 *    next page's title and the search would be a second copy of the route table. Fences and tables
 *    are the other two things a snippet should not be made of.
 * 3. **The anchor is not the one GitHub answers to.** A hit names its section and opens the page
 *    there; a slug that is *tidier* than GitHub's rule is a link that lands at the top of a long
 *    page. The rule, including the `-1` suffix for a repeated heading, is pinned against known
 *    headings.
 * 4. **A row points nowhere, or two rows share an id.** The palette keys options and
 *    `aria-activedescendant` by the row id, and a course-page row is a link out of the workbench, so
 *    both the href and the uniqueness are checked.
 * 5. **One common word builds a wall.** Caps per page and overall are pinned, as in the lesson
 *    search.
 *
 * Run: node --experimental-strip-types scripts/test_prose_search.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PYTHON_LESSONS } from '../app/src/data/pythonLessonsData.ts';
import {
  MAX_PROSE_HITS,
  MAX_PROSE_HITS_PER_PAGE,
  MIN_PROSE_QUERY,
  githubSlug,
  prosePageUrl,
  proseSearchItems,
  readProseIndex,
  searchProse,
  sectionAnchors,
} from '../app/src/proseSearch.ts';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'app', 'public', 'prose-index.json'), 'utf8'));
const pages = readProseIndex(raw);

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL ${name}\n       ${error.message}`);
  }
}

const runnerText = PYTHON_LESSONS.map((lesson) =>
  [
    lesson.starterCode,
    lesson.hints.join('\n'),
    lesson.instructorTests,
    lesson.expectedOutput,
    lesson.id,
    lesson.title,
    lesson.ideas.join(' '),
  ].join('\n')
)
  .join('\n')
  .toLowerCase();

const bodyOf = (page) => page.sections.map((section) => section.t).join('\n');

console.log('search the course pages');

check('the index is the route: 48 prose lessons, 17 arm modules, in course order', () => {
  assert.ok(pages, 'the committed prose index must parse');
  assert.equal(pages.length, 65, `the route declares 65 pages, the index has ${pages.length}`);
  assert.equal(pages.filter((page) => !page.path.startsWith('modules/')).length, 48);
  assert.equal(pages.filter((page) => page.path.startsWith('modules/')).length, 17);
  assert.equal(new Set(pages.map((page) => page.id)).size, 65, 'two pages share an id');
  assert.equal(new Set(pages.map((page) => page.path)).size, 65, 'two pages share a path');
  assert.equal(pages[0].id, 'P.1', 'the first page a learner reads must come first');
  assert.equal(pages[pages.length - 1].id, '08-capstones.T3.07a', 'the capstone module must come last');
  for (const page of pages) {
    assert.ok(page.title.trim().length > 0, `${page.id} has no title`);
    assert.ok(page.sections.length > 0, `${page.id} has no searchable section`);
  }
});

check('no page carries code, a table, or text a script wrote into it', () => {
  for (const page of pages) {
    const text = bodyOf(page);
    assert.ok(text.length > 400, `${page.id} is too short to be a page (${text.length} chars)`);
    assert.ok(!text.includes('```'), `${page.id} still holds a fenced code block`);
    assert.ok(!text.includes('~~~'), `${page.id} still holds a fenced block`);
    const table = text.split('\n').find((line) => line.trimStart().startsWith('|'));
    assert.equal(table, undefined, `${page.id} still holds a table row: ${table?.slice(0, 60)}`);
    assert.ok(!text.includes('Run this in the workbench'), `${page.id} still holds the run callout`);
    assert.ok(!text.includes('Try this in the workbench'), `${page.id} still holds the try link`);
    assert.ok(!text.includes('exit examination for the whole'), `${page.id} still holds the ladder gate`);
    assert.ok(!/Next:\s*\[/.test(text), `${page.id} still holds the generated next-step line`);
    assert.ok(!text.includes('<!--'), `${page.id} still holds an HTML comment`);
    for (const section of page.sections) {
      assert.ok(section.t.trim().length > 0, `${page.id} has an empty section under ${section.h || 'the top'}`);
      assert.ok(!section.t.includes('\n\n'), `${page.id} keeps a blank line inside one section`);
    }
  }
});

check("an anchor is GitHub's slug, including the suffix a repeated heading gets", () => {
  assert.equal(githubSlug('What this page is for'), 'what-this-page-is-for');
  assert.equal(githubSlug('Idea 1: PD control (K_p)'), 'idea-1-pd-control-k_p');
  assert.equal(githubSlug('Anti-windup, in one line'), 'anti-windup-in-one-line');
  assert.equal(githubSlug('A — B'), 'a--b', 'an em dash goes and its two spaces become two hyphens');
  assert.equal(githubSlug('C++ vs C#'), 'c-vs-c');
  assert.equal(githubSlug('  already-hyphenated_axis  '), 'already-hyphenated_axis');
  assert.deepEqual(sectionAnchors([{ h: 'Summary' }, { h: 'Summary' }, { h: 'Summary' }]), [
    'summary',
    'summary-1',
    'summary-2',
  ]);
  assert.deepEqual(sectionAnchors([{ h: '' }, { h: 'Goal' }]), ['', 'goal']);
});

check('a word from a page body finds that page, and the snippet is the line that matched', () => {
  // A word that is nowhere in the runner's text: the point of the prose half is the words the app
  // does not carry, so a word the runner already had would prove the wrong thing.
  let probe = null;
  for (const page of pages) {
    for (const section of page.sections) {
      for (const word of section.t.match(/[A-Za-z][A-Za-z-]{6,}/g) ?? []) {
        if (!runnerText.includes(word.toLowerCase())) {
          probe = { page, word };
          break;
        }
      }
      if (probe) break;
    }
    if (probe) break;
  }
  assert.ok(probe, 'every prose word also appears in the runner text, so this check proves nothing');

  const hits = searchProse(probe.word, pages);
  const hit = hits.find((entry) => entry.pageId === probe.page.id);
  assert.ok(hit, `“${probe.word}” must find ${probe.page.id}; got ${JSON.stringify(hits.slice(0, 3))}`);
  assert.ok(
    hit.snippet.toLowerCase().includes(probe.word.toLowerCase()),
    `the snippet must carry the match; it reads: ${hit.snippet}`
  );
});

check('a heading hit outranks a body hit, and the row opens that section', () => {
  const hits = searchProse('decoupling', pages);
  assert.ok(hits.length > 0, '“decoupling” must find the decoupling section');
  const first = hits[0];
  assert.equal(first.pageId, 'S0.6');
  assert.match(first.heading, /decoupling/i, 'the top hit must be the heading, not a paragraph');
  assert.equal(first.anchor, 'idea-2-power-rail-decoupling-bypass-capacitors');
  assert.equal(
    hits.findIndex((hit) => hit.score < 1000),
    hits.filter((hit) => hit.score >= 1000).length,
    'every heading hit must come before the first body hit'
  );

  const rows = proseSearchItems('decoupling', pages);
  const row = rows[0];
  assert.equal(row.kind, 'page');
  assert.match(row.id, /^prose-S0\.6-\d+$/, `the row id must be unique per section, got ${row.id}`);
  assert.match(row.label, /^S0\.6 · /);
  assert.match(row.detail, /^§ Idea 2: Power-rail decoupling/);
  assert.equal(
    row.href,
    'https://github.com/TLE47/Mechatronics-Roadmap/blob/main/stage-0/S0.6-capacitors-and-decoupling.md#idea-2-power-rail-decoupling-bypass-capacitors'
  );
  assert.deepEqual(prosePageUrl('a/b.md'), 'https://github.com/TLE47/Mechatronics-Roadmap/blob/main/a/b.md');
  assert.equal(prosePageUrl('a/b.md', ''), prosePageUrl('a/b.md'), 'no anchor, no lone `#`');
});

check('something under two characters is not a search', () => {
  assert.equal(MIN_PROSE_QUERY, 2);
  assert.deepEqual(searchProse('', pages), []);
  assert.deepEqual(searchProse('a', pages), []);
  assert.deepEqual(searchProse('  a  ', pages), [], 'the trim happens before the length test');
  assert.ok(searchProse('ab', pages).length > 0, 'two letters is a search');
});

check('a common word is capped per page and overall, and every row has its own id', () => {
  const hits = searchProse('the', pages);
  assert.ok(hits.length > 0, 'expected `the` to match something');
  assert.ok(hits.length <= MAX_PROSE_HITS, `expected at most ${MAX_PROSE_HITS} rows, got ${hits.length}`);
  const perPage = new Map();
  for (const hit of hits) perPage.set(hit.pageId, (perPage.get(hit.pageId) ?? 0) + 1);
  for (const [pageId, count] of perPage) {
    assert.ok(
      count <= MAX_PROSE_HITS_PER_PAGE,
      `${pageId} contributed ${count} rows, over the ${MAX_PROSE_HITS_PER_PAGE}-per-page cap`
    );
  }
  const rows = proseSearchItems('the', pages);
  const ids = rows.map((row) => row.id);
  assert.equal(new Set(ids).size, ids.length, `duplicate row ids: ${ids.join(', ')}`);
});

check('the reader refuses a file it does not understand, and drops only the bad page', () => {
  assert.equal(readProseIndex(null), null);
  assert.equal(readProseIndex('pages'), null);
  assert.equal(readProseIndex({}), null);
  assert.equal(
    readProseIndex({ v: 2, pages: [{ id: 'x', path: 'x.md', title: 'X', sections: [{ h: '', t: 'text' }] }] }),
    null,
    'a different schema is not a file to guess at'
  );
  assert.equal(readProseIndex({ v: 1, pages: [] }), null, 'no pages is not a search index');
  const good = { id: 'x', path: 'x.md', title: 'X', sections: [{ h: '', t: 'text' }] };
  assert.deepEqual(
    readProseIndex({
      v: 1,
      pages: [
        good,
        { id: '', path: 'y.md', title: 'Y', sections: [{ h: '', t: 'text' }] },
        { id: 'z', path: 'z.md', title: 'Z', sections: [{ h: 'h', t: 7 }] },
      ],
    }),
    [good],
    'a page with no id, or no usable section, is dropped; the rest still answer'
  );
});

console.log(`prose search: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
