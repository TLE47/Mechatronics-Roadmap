#!/usr/bin/env node
/**
 * The lesson reader's rules, without a browser (`npm run test:reader`).
 *
 * The pane has three pieces that fail quietly: the inline parser (a delimiter it eats turns `K_p`
 * into italic `K` and a subscript `p`; a `$` it misreads turns a price into a formula), the payload
 * guard (a stale file from an older build must be refused, not painted as raw blocks), and the
 * reading position (a stored `NaN` scrolls a learner to nowhere). Each is pinned here; the rendered
 * result is `npm run test:e2e:pages`'s job, and the generated payloads are
 * `python3 scripts/generate_lesson_pages.py --check` plus `tests/test_lesson_pages.py`.
 */

import assert from 'node:assert/strict';
import {
  LESSON_PAGE_VERSION,
  clearLessonPageCache,
  isLessonPage,
  lessonPageUrl,
  loadLessonPage,
} from '../app/src/lessonPage.ts';
import {
  anchorFor,
  headingAnchors,
  inlinePlain,
  parseInline,
} from '../app/src/readerMarkdown.ts';
import {
  MAX_ANCHOR_CHARS,
  SAVE_AFTER_MS,
  STORAGE_KEY_READING,
  clearReadingPosition,
  createReadingSaver,
  readReadingPosition,
  writeReadingPosition,
} from '../app/src/readingPosition.ts';
import { markQuotes, wrapSelection } from '../app/src/lessonMarks.ts';

let passed = 0;
let failed = 0;

function section(title) {
  console.log(`\n${title}`);
}

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

async function checkAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL ${name}\n       ${error.message}`);
  }
}

function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    data,
  };
}

const kinds = (text) => parseInline(text).map((run) => run.k);
const values = (text) => parseInline(text).map((run) => run.v);

section('inline Markdown');

check('code spans are one run and keep their bytes', () => {
  assert.deepEqual(parseInline('use `K_p` here'), [
    { k: 'text', v: 'use ' },
    { k: 'code', v: 'K_p' },
    { k: 'text', v: ' here' },
  ]);
  // A double backtick span can hold a single one, which is how a page shows a literal backtick.
  assert.deepEqual(values('``a ` b``'), ['a ` b']);
});

check('strong and emphasis are nested labels, not a flattened string', () => {
  assert.deepEqual(parseInline('**bold**'), [{ k: 'strong', v: 'bold' }]);
  assert.deepEqual(parseInline('*soft*'), [{ k: 'em', v: 'soft' }]);
  assert.deepEqual(parseInline('**`K_p`**'), [{ k: 'strong', v: '`K_p`' }]);
});

check('links keep their label Markdown and their URL whole', () => {
  const runs = parseInline('read [the **notes**](https://example.invalid/a_(b)) now');
  assert.equal(runs[1].k, 'link');
  assert.equal(runs[1].href, 'https://example.invalid/a_(b)');
  assert.equal(runs[1].v, 'the **notes**');
  assert.equal(inlinePlain(runs[1].v), 'the notes');
});

check('an autolink is a link whose text is its URL', () => {
  assert.deepEqual(parseInline('<https://example.invalid/x>'), [
    { k: 'link', href: 'https://example.invalid/x', v: 'https://example.invalid/x' },
  ]);
});

check('maths is $…$ with no space at either fence, so money stays money', () => {
  assert.deepEqual(parseInline('$\\tau = R C$'), [{ k: 'math', v: '\\tau = R C' }]);
  assert.deepEqual(parseInline('$5 and $6'), [{ k: 'text', v: '$5 and $6' }]);
  assert.deepEqual(parseInline('$ 12 $'), [{ k: 'text', v: '$ 12 $' }]);
});

check('a lone asterisk is arithmetic, not an unclosed emphasis', () => {
  assert.deepEqual(parseInline('2 * 3 * 4'), [{ k: 'text', v: '2 * 3 * 4' }]);
  assert.deepEqual(parseInline('2 * 3'), [{ k: 'text', v: '2 * 3' }]);
});

check('identifiers with underscores are text', () => {
  assert.deepEqual(parseInline('mechalab_plant and K_p'), [
    { k: 'text', v: 'mechalab_plant and K_p' },
  ]);
});

check('an escape is the character, and an inline image falls back to its alt', () => {
  assert.deepEqual(values('a \\* b'), ['a * b']);
  assert.deepEqual(parseInline('see ![the arm](../x.png)'), [{ k: 'text', v: 'see the arm' }]);
});

check('adjacent text is one run, so the DOM is not a span per character', () => {
  assert.deepEqual(parseInline('plain words'), [{ k: 'text', v: 'plain words' }]);
  assert.deepEqual(kinds('a `b` c **d** e'), ['text', 'code', 'text', 'strong', 'text']);
});

check('underline is its own run, because Markdown has none and `_` is an identifier', () => {
  assert.deepEqual(parseInline('++keep this++'), [{ k: 'u', v: 'keep this' }]);
  assert.equal(inlinePlain('a ++marked++ word'), 'a marked word', 'a plain reading drops the marks');
  assert.deepEqual(parseInline('**++both++**'), [{ k: 'strong', v: '++both++' }]);
  assert.deepEqual(parseInline('2 ++ 3'), [{ k: 'text', v: '2 ++ 3' }], 'an unclosed pair stays text');
});

section('marks and wrapping');

check('a saved quote is cut out of a run in reading order', () => {
  assert.deepEqual(markQuotes('the gain is the loop', ['the gain']), [
    { text: 'the gain', quote: 'the gain' },
    { text: ' is the loop', quote: null },
  ]);
  assert.deepEqual(markQuotes('nothing here', ['other']), [{ text: 'nothing here', quote: null }]);
  assert.deepEqual(markQuotes('', ['anything']), [], 'nothing to mark, nothing to draw');
});

check('the longest quote wins where two overlap, and adjacent quotes are two pieces', () => {
  const overlapping = markQuotes('the gain term matters', ['the gain', 'the gain term']);
  assert.deepEqual(overlapping.map((piece) => piece.text), ['the gain term', ' matters']);
  assert.equal(overlapping[0].quote, 'the gain term', 'the longer phrase is the one marked');

  const adjacent = markQuotes('one two', ['one', 'two']);
  assert.deepEqual(adjacent, [
    { text: 'one', quote: 'one' },
    { text: ' ', quote: null },
    { text: 'two', quote: 'two' },
  ]);
});

check('a loose mark finds a code passage whose whitespace a quote collapsed', () => {
  // `cleanQuote` turns a selected three-line snippet into one line. A strict scan would never find
  // it in the `pre`, so the highlight would be stored and never drawn.
  const code = 'battery_level = 12.60\nencoder_ticks = 400\nrobot_mode = "STANDBY"';
  const quote = 'battery_level = 12.60 encoder_ticks = 400';
  assert.deepEqual(markQuotes(code, [quote], { loose: true })[0], {
    text: 'battery_level = 12.60\nencoder_ticks = 400',
    quote,
  });
  assert.deepEqual(markQuotes(code, [quote]), [{ text: code, quote: null }], 'strict is unchanged');
  // A regex metacharacter in the passage is a character, not a pattern.
  assert.deepEqual(markQuotes('x = a[0] + 1', ['a[0] + 1'], { loose: true }), [
    { text: 'x = ', quote: null },
    { text: 'a[0] + 1', quote: 'a[0] + 1' },
  ]);
});

check('duplicate and empty quotes do not draw two marks or an empty one', () => {
  assert.deepEqual(markQuotes('a word here', ['word', 'word', '  ']), [
    { text: 'a ', quote: null },
    { text: 'word', quote: 'word' },
    { text: ' here', quote: null },
  ]);
});

check('wrapping keeps the selection inside the markers', () => {
  assert.deepEqual(wrapSelection('a gain b', 2, 6, '**'), {
    text: 'a **gain** b',
    start: 4,
    end: 8,
  });
  assert.deepEqual(wrapSelection('hello', 5, 5, '*'), {
    text: 'hello*text*',
    start: 6,
    end: 10,
  }, 'an empty selection gets a word to type over');
});

check('a stale or reversed range is clamped, not trusted', () => {
  assert.deepEqual(wrapSelection('abc', 9, 12, '++'), {
    text: 'abc++text++',
    start: 5,
    end: 9,
  });
  assert.deepEqual(wrapSelection('abc', 2, 1, '*'), {
    text: 'ab*text*c',
    start: 3,
    end: 7,
  }, 'an end before the start is the start');
});

section('heading anchors');

check('an anchor is GitHub\'s, punctuation and all', () => {
  assert.equal(anchorFor('Goal'), 'goal');
  assert.equal(anchorFor('Idea 1: PD control (`K_p`)'), 'idea-1-pd-control-k_p');
  assert.equal(anchorFor('Step 2 — Build it'), 'step-2--build-it');
  assert.equal(anchorFor('**Bold** heading'), 'bold-heading');
});

check('a repeated heading gets the -1 suffix, keyed by the block it belongs to', () => {
  const first = { t: 'h', l: 2, x: 'Summary' };
  const text = { t: 'p', x: 'text' };
  const second = { t: 'h', l: 2, x: 'Summary' };
  const nested = { t: 'h', l: 3, x: 'Detail' };
  const reveal = { t: 'reveal', label: 'Answer', blocks: [nested] };
  const anchors = headingAnchors([first, text, second, reveal]);
  assert.equal(anchors.get(first), 'summary');
  assert.equal(anchors.get(second), 'summary-1');
  assert.equal(anchors.get(nested), 'detail', 'a heading behind a reveal is still a heading');
  assert.equal(anchors.has(text), false);
});

section('payloads');

const page = { v: LESSON_PAGE_VERSION, path: 'track-p/P.1-x.md', title: 'P.1', blocks: [
  { t: 'h', l: 2, x: 'Goal' },
  { t: 'p', x: 'words' },
  { t: 'ul', items: [{ x: 'one', d: 0 }, { x: 'nested', d: 1 }] },
  { t: 'code', lang: 'python', text: 'print(1)' },
  { t: 'table', head: ['a'], rows: [['1']] },
  { t: 'quote', x: 'note' },
  { t: 'math', tex: 'x' },
  { t: 'img', src: 'a.png', alt: 'a' },
  { t: 'ol', items: [{ x: 'first', d: 0 }] },
  { t: 'reveal', label: 'Full Solution', blocks: [{ t: 'code', lang: 'python', text: 'print(2)' }] },
] };

check('a page this build knows passes the guard', () => {
  assert.equal(isLessonPage(page), true);
});

check('a reveal is a label with blocks behind it, and a nested one has a limit', () => {
  const withReveal = (blocks) => isLessonPage({ ...page, blocks });
  assert.equal(withReveal([{ t: 'reveal', label: 'Hint 1', blocks: [{ t: 'p', x: 'read it' }] }]), true);
  assert.equal(withReveal([{ t: 'reveal', label: '', blocks: [{ t: 'p', x: 'x' }] }]), false, 'an unlabelled toggle');
  assert.equal(withReveal([{ t: 'reveal', label: 'Empty', blocks: [] }]), false, 'a toggle with nothing behind it');
  assert.equal(withReveal([{ t: 'reveal', label: 'x', blocks: [{ t: 'reveal', label: 'y', blocks: [] }] }]), false);
  // The guard is not the place to discover how deep the renderer recurses.
  let deep = { t: 'p', x: 'bottom' };
  for (let level = 0; level < 4; level += 1) {
    deep = { t: 'reveal', label: `level ${level}`, blocks: [deep] };
  }
  assert.equal(withReveal([deep]), false, 'four reveals deep is not a lesson page');
});

check('a stale version, an unknown block or a half-written one is refused', () => {
  assert.equal(isLessonPage({ ...page, v: 2 }), false, 'a newer format this build cannot draw');
  assert.equal(isLessonPage({ ...page, v: undefined }), false);
  assert.equal(isLessonPage({ ...page, blocks: [{ t: 'video', src: 'x' }] }), false);
  assert.equal(isLessonPage({ ...page, blocks: [{ t: 'h', l: 2 }] }), false);
  assert.equal(isLessonPage({ ...page, blocks: [{ t: 'ul', items: [] }] }), false);
  assert.equal(
    isLessonPage({ ...page, blocks: [{ t: 'ul', items: [{ x: 'one', d: -1 }] }] }),
    false,
    'a negative depth is a negative indent nobody planned for'
  );
  assert.equal(isLessonPage(null), false);
  assert.equal(isLessonPage('{"v":1}'), false);
});

check('the payload URL sits beside the bundle and moves with its base', () => {
  assert.equal(lessonPageUrl('track-p/P.1-variables.md'), '/lesson-pages/track-p/P.1-variables.json');
  assert.equal(lessonPageUrl('/modules/05-control.T2.05a.md'), '/lesson-pages/modules/05-control.T2.05a.json');
});

section('fetching a page');

await checkAsync('one fetch answers every pane, and a failure is not remembered', async () => {
  clearLessonPageCache();
  let calls = 0;
  let failNext = false;
  const fetcher = async () => {
    calls += 1;
    if (failNext) throw new Error('offline');
    return {
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => page,
    };
  };

  const first = await loadLessonPage('a.md', { fetch: fetcher });
  const second = await loadLessonPage('a.md', { fetch: fetcher });
  assert.equal(first, second, 'the same payload object from memory');
  assert.equal(calls, 1, 'a second pane must not start a second request');

  failNext = true;
  await assert.rejects(() => loadLessonPage('b.md', { fetch: fetcher }), /offline/);
  failNext = false;
  const retried = await loadLessonPage('b.md', { fetch: fetcher });
  assert.equal(retried.path, page.path);
  assert.equal(calls, 3, 'a failed fetch is forgotten, so Retry is a real attempt');
});

await checkAsync('an HTML answer, a 404 and a wrong payload all fail loudly', async () => {
  clearLessonPageCache();
  const respond = (body, { ok = true, type = 'application/json', status = 200 } = {}) => async () => ({
    ok,
    status,
    headers: { get: () => type },
    json: async () => body,
  });
  await assert.rejects(
    () => loadLessonPage('x.md', { fetch: respond('<html>', { type: 'text/html' }) }),
    /not found/
  );
  await assert.rejects(
    () => loadLessonPage('x.md', { fetch: respond({}, { ok: false, status: 404 }) }),
    /404/
  );
  await assert.rejects(() => loadLessonPage('x.md', { fetch: respond({ v: 99 }) }), /format/);
});

section('reading position');

check('with no storage the position is remembered for the visit, not thrown', () => {
  assert.equal(typeof globalThis.localStorage, 'undefined', 'this check assumes no global storage');
  assert.equal(readReadingPosition('P.1'), null);
  assert.deepEqual(writeReadingPosition('P.1', { anchor: 'goal', at: 120 }), { anchor: 'goal', at: 120 });
});

check('the store is per lesson, and a reload reads it back', () => {
  globalThis.localStorage = fakeStorage();
  try {
    assert.equal(readReadingPosition('P.1'), null, 'an empty store is no position');
    writeReadingPosition('P.1', { anchor: 'idea-1', at: 640 });
    assert.deepEqual(readReadingPosition('P.1'), { anchor: 'idea-1', at: 640 });
    assert.equal(readReadingPosition('P.2'), null, 'one lesson never inherits another');
    assert.ok(globalThis.localStorage.data.get(STORAGE_KEY_READING), 'stored under the reader key');
  } finally {
    delete globalThis.localStorage;
  }
});

check('a stored position is validated, not trusted', () => {
  globalThis.localStorage = fakeStorage();
  try {
    writeReadingPosition('P.1', { anchor: 'x'.repeat(400), at: 12.6 });
    assert.deepEqual(readReadingPosition('P.1'), { anchor: 'x'.repeat(MAX_ANCHOR_CHARS), at: 13 });

    writeReadingPosition('P.1', { anchor: 'goal', at: -80 });
    assert.deepEqual(readReadingPosition('P.1'), { anchor: 'goal', at: 0 });

    writeReadingPosition('P.1', { anchor: 'goal', at: Number.NaN });
    assert.deepEqual(readReadingPosition('P.1'), { anchor: '', at: 0 }, 'NaN is the top, not nowhere');

    // The block is what a split-view resize re-anchors on: it has to survive the same round trip.
    writeReadingPosition('P.1', { anchor: 'goal', at: 900, block: 'b7', blockAt: 820 });
    assert.deepEqual(readReadingPosition('P.1'), {
      anchor: 'goal',
      at: 900,
      block: 'b7',
      blockAt: 820,
    });
    writeReadingPosition('P.1', { anchor: 'goal', at: 900, block: 'x'.repeat(200), blockAt: -4 });
    assert.equal(readReadingPosition('P.1').block?.length, 64, 'a block key is a page key, not a note');
    assert.equal(readReadingPosition('P.1').blockAt, 0, 'a negative offset is the top of the block');

    globalThis.localStorage.data.set(
      STORAGE_KEY_READING,
      JSON.stringify({ 'P.1': { anchor: 'goal', at: 'far' }, 'P.2': { anchor: 'x', at: 5 } })
    );
    assert.equal(readReadingPosition('P.1'), null, 'a junk entry is dropped');
    assert.deepEqual(readReadingPosition('P.2'), { anchor: 'x', at: 5 }, 'and only that entry');

    for (const junk of ['', '   ', 'banana', 'null', '[]', '7']) {
      globalThis.localStorage.data.set(STORAGE_KEY_READING, junk);
      assert.equal(readReadingPosition('P.1'), null, `stored ${JSON.stringify(junk)}`);
    }
  } finally {
    delete globalThis.localStorage;
  }
});

check('clearing one lesson leaves the others alone', () => {
  globalThis.localStorage = fakeStorage();
  try {
    writeReadingPosition('P.1', { anchor: 'a', at: 10 });
    writeReadingPosition('P.2', { anchor: 'b', at: 20 });
    clearReadingPosition('P.1');
    assert.equal(readReadingPosition('P.1'), null);
    assert.deepEqual(readReadingPosition('P.2'), { anchor: 'b', at: 20 });
  } finally {
    delete globalThis.localStorage;
  }
});

/** A clock whose timers fire only when the test steps it. */
function fakeClock() {
  let now = 0;
  let next = 1;
  const jobs = new Map();
  return {
    now: () => now,
    set: (fn, ms) => {
      const id = next++;
      jobs.set(id, { at: now + ms, fn });
      return id;
    },
    clear: (id) => jobs.delete(id),
    advance: (ms) => {
      now += ms;
      for (;;) {
        const due = [...jobs.entries()]
          .filter(([, job]) => job.at <= now)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) return;
        jobs.delete(due[0]);
        due[1].fn();
      }
    },
    pending: () => jobs.size,
  };
}

check('a first scroll is written at once', () => {
  const clock = fakeClock();
  const writes = [];
  const saver = createReadingSaver((position) => writes.push(position), SAVE_AFTER_MS, clock);
  saver.remember({ anchor: 'goal', at: 120 });
  assert.deepEqual(writes, [{ anchor: 'goal', at: 120 }]);
  assert.equal(clock.pending(), 0, 'an immediate write leaves no timer behind');
});

check('a scroll inside the window is written when it closes, not dropped', () => {
  const clock = fakeClock();
  const writes = [];
  const saver = createReadingSaver((position) => writes.push(position), SAVE_AFTER_MS, clock);
  saver.remember({ anchor: 'goal', at: 10 });
  clock.advance(100);
  saver.remember({ anchor: 'idea-1', at: 1476 });
  assert.equal(writes.length, 1, 'inside the window nothing is written yet');
  clock.advance(250);
  assert.deepEqual(writes.at(-1), { anchor: 'idea-1', at: 1476 }, 'the last scroll is the one stored');
  assert.equal(writes.length, 2, 'once, not once per scroll');
  assert.equal(clock.pending(), 0);
});

check('a burst inside the window collapses to one write of the newest position', () => {
  const clock = fakeClock();
  const writes = [];
  const saver = createReadingSaver((position) => writes.push(position), SAVE_AFTER_MS, clock);
  saver.remember({ anchor: 'a', at: 1 });
  clock.advance(100);
  saver.remember({ anchor: 'b', at: 2 });
  clock.advance(100);
  saver.remember({ anchor: 'c', at: 3 });
  clock.advance(100);
  saver.remember({ anchor: 'd', at: 4 });
  clock.advance(50);
  assert.deepEqual(writes, [{ anchor: 'a', at: 1 }, { anchor: 'd', at: 4 }]);
});

check('the window opens again after the write it scheduled', () => {
  const clock = fakeClock();
  const writes = [];
  const saver = createReadingSaver((position) => writes.push(position), SAVE_AFTER_MS, clock);
  saver.remember({ anchor: 'a', at: 1 });
  clock.advance(SAVE_AFTER_MS);
  saver.remember({ anchor: 'b', at: 2 });
  assert.deepEqual(writes, [{ anchor: 'a', at: 1 }, { anchor: 'b', at: 2 }], 'exactly at the window is open');
});

check('flush writes a pending position now, and cancels the timer', () => {
  const clock = fakeClock();
  const writes = [];
  const saver = createReadingSaver((position) => writes.push(position), SAVE_AFTER_MS, clock);
  saver.remember({ anchor: 'a', at: 1 });
  clock.advance(100);
  saver.remember({ anchor: 'b', at: 2 });
  saver.flush();
  assert.deepEqual(writes, [{ anchor: 'a', at: 1 }, { anchor: 'b', at: 2 }]);
  clock.advance(1000);
  assert.equal(writes.length, 2, 'the timer cannot write it twice');
});

check('cancel drops a pending position without writing it', () => {
  const clock = fakeClock();
  const writes = [];
  const saver = createReadingSaver((position) => writes.push(position), SAVE_AFTER_MS, clock);
  saver.remember({ anchor: 'a', at: 1 });
  clock.advance(100);
  saver.remember({ anchor: 'b', at: 2 });
  saver.cancel();
  clock.advance(1000);
  assert.deepEqual(writes, [{ anchor: 'a', at: 1 }]);
});

check('a store that throws costs the memory, never the scroll', () => {
  globalThis.localStorage = {
    getItem() {
      throw new Error('SecurityError');
    },
    setItem() {
      throw new Error('QuotaExceededError');
    },
  };
  try {
    assert.equal(readReadingPosition('P.1'), null);
    assert.deepEqual(writeReadingPosition('P.1', { anchor: 'goal', at: 30 }), { anchor: 'goal', at: 30 });
    clearReadingPosition('P.1');
  } finally {
    delete globalThis.localStorage;
  }
});

console.log(`\nreader: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
