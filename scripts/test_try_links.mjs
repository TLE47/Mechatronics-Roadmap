#!/usr/bin/env node
/**
 * Try-it blocks: the rules and the tree (`scripts/test_try_links.mjs`, `npm run test:try`)
 *
 * A page's `<!-- try -->` marker turns a fence into a link that opens the workbench on that page's
 * entry with the snippet in a scratch editor. The rules that make that honest are pure functions of a
 * string, and each fails in its own way if it is wrong:
 *
 * 1. **The marker must touch a python fence.** Prose between the marker and the fence, a `bash` block,
 *    or a fence that never closes is not a try-it block - and it is reported rather than silently
 *    skipped, because a page that meant to be runnable would otherwise fail in silence.
 * 2. **The lesson comes from the page.** The id is the one the page's own run callout names, so a
 *    block cannot open a different entry from the link above it, and a page that names none is told
 *    so instead of shipping a link to nowhere.
 * 3. **The payload is the share codec.** Every generated link is decoded here by the app's own
 *    `readTrySnippet`, and must give back the block's exact text: an encoder that drifts by one byte
 *    from the decoder is a link that opens an empty editor.
 * 4. **A rewrite is idempotent, and unmarking removes.** Running the generator twice changes nothing,
 *    editing the code under a link updates it, and deleting the marker deletes the line with it.
 * 5. **The tree is up to date.** The last check runs the generator over the repository with
 *    `--check`: a marked block whose link is stale fails the suite, not CI.
 *
 * Run: node --experimental-strip-types scripts/test_try_links.mjs
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { REPO, tryLinkPages } from './try_link_pages.mjs';

import { readTrySnippet } from '../app/src/tryLink.ts';
import {
  TRY_LINK_END,
  TRY_LINK_START,
  TRY_MARKER,
  pageLesson,
  rewriteTryLinks,
  tryBlocksIn,
  tryLinkLines,
} from '../app/src/tryLinks.ts';

const HREF = 'https://example.test/roadmap/';
const TAB = 'Run Python Lessons';
const OPTIONS = { href: HREF, tabName: TAB };

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

/** A page with the marker, a fence and the callout's `?lesson=` above it. */
function page({ marker = true, language = 'python', code = 'print(2 + 3)', close = true, callout = true, tail = '' } = {}) {
  const lines = ['# A lesson page', ''];
  if (callout) {
    lines.push(`> **Run this in the workbench.** [Open MechaLab with \`R.1\` loaded](${HREF}?lesson=R.1) `);
    lines.push('');
  }
  lines.push('## 4. Worked example', '');
  if (marker) lines.push(TRY_MARKER);
  lines.push('```' + language);
  for (const line of code.split('\n')) lines.push(line);
  if (close) lines.push('```');
  if (tail) lines.push('', tail);
  lines.push('');
  return lines.join('\n');
}

/** The `#try=` payload of the first generated link in a page, or null. */
function payloadOf(markdown) {
  const match = /#try=([A-Za-z0-9_-]+)/.exec(markdown);
  return match ? match[1] : null;
}

console.log('try-it blocks');

check('a marker directly above a python fence is a block, and its code is exact', () => {
  const code = 'x = 1\nprint(x)\n';
  const blocks = tryBlocksIn(page({ code: 'x = 1\nprint(x)' }));
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].code, 'x = 1\nprint(x)', 'the payload carries the fence text, no trailing newline');
  assert.ok(code.startsWith(blocks[0].code));
});

check('blank lines between the marker and the fence are allowed', () => {
  const markdown = ['## 4. Worked example', TRY_MARKER, '', '', '```python', 'print(1)', '```', ''].join('\n');
  assert.equal(tryBlocksIn(markdown).length, 1);
});

check('prose between the marker and the fence is not a block', () => {
  const markdown = ['# page', TRY_MARKER, 'Some prose first.', '```python', 'print(1)', '```', ''].join('\n');
  assert.deepEqual(tryBlocksIn(markdown), []);
});

check('a non-python fence is not a block', () => {
  assert.deepEqual(tryBlocksIn(page({ language: 'bash', code: 'ls' })), []);
  assert.deepEqual(tryBlocksIn(page({ language: '', code: 'ls' })), [], 'an unlabelled fence is not python either');
});

check('an unclosed fence is not a block', () => {
  assert.deepEqual(tryBlocksIn(page({ close: false })), []);
});

check('the page names the lesson, decoded', () => {
  assert.equal(pageLesson(page()), 'R.1');
  const encoded = `> [Open](${HREF}?lesson=EX.05-control.T1.05a&x=1)`;
  assert.equal(pageLesson(encoded), 'EX.05-control.T1.05a');
  assert.equal(pageLesson('> [Open](${HREF}?view=theme)'), null);
});

check('a rewrite inserts one region, and its link decodes back to the block', () => {
  const before = page();
  const after = rewriteTryLinks(before, OPTIONS);
  assert.equal(after.changed, true);
  assert.equal(after.linked, 1);
  assert.deepEqual(after.problems, []);
  assert.ok(after.markdown.includes(TRY_LINK_START) && after.markdown.includes(TRY_LINK_END));

  const payload = payloadOf(after.markdown);
  assert.ok(payload, 'the region carries a #try= payload');
  assert.deepEqual(readTrySnippet(`#try=${payload}`), { lesson: 'R.1', code: 'print(2 + 3)' });
  assert.ok(after.markdown.includes('?lesson=R.1#try='), 'the link opens the page’s own entry');
});

check('the region says what the click does: scratch, ungraded, draft untouched', () => {
  const [start, text, end] = tryLinkLines({ lesson: 'R.1', lines: 1, url: `${HREF}?lesson=R.1#try=x`, tabName: TAB });
  assert.equal(start, TRY_LINK_START);
  assert.equal(end, TRY_LINK_END);
  assert.ok(text.includes('this line'), 'one line is singular');
  assert.ok(text.includes('`R.1`'));
  assert.ok(text.includes(`**${TAB}**`), 'it names the tab the app renders, not a position');
  assert.ok(text.includes('scratch editor') && text.includes('nothing is graded'));
  assert.ok(text.includes('left alone'), 'the draft is promised untouched');
  assert.ok(tryLinkLines({ lesson: 'R.1', lines: 12, url: 'x', tabName: TAB })[1].includes('these 12 lines'));
});

check('a second run changes nothing', () => {
  const once = rewriteTryLinks(page(), OPTIONS).markdown;
  const twice = rewriteTryLinks(once, OPTIONS);
  assert.equal(twice.changed, false, 'idempotent: the generator can be re-run on a clean tree');
  assert.equal(twice.markdown, once);
  assert.equal(twice.linked, 1, 'the existing region still counts as linked');
});

check('editing the code under a link marks the page stale and rewrites the link', () => {
  const linked = rewriteTryLinks(page({ code: 'print(1)' }), OPTIONS).markdown;
  const edited = linked.replace('print(1)', 'print(2)');
  const result = rewriteTryLinks(edited, OPTIONS);
  assert.equal(result.changed, true);
  assert.deepEqual(readTrySnippet(`#try=${payloadOf(result.markdown)}`), { lesson: 'R.1', code: 'print(2)' });
  assert.equal(result.markdown.match(/try-link:start/g).length, 1, 'the old region is replaced, not stacked');
});

check('deleting the marker deletes the generated line, and nothing else', () => {
  const linked = rewriteTryLinks(page({ tail: 'After the block.' }), OPTIONS).markdown;
  const unmarked = linked.replace(`${TRY_MARKER}\n`, '');
  const result = rewriteTryLinks(unmarked, OPTIONS);
  assert.equal(result.changed, true);
  assert.equal(result.linked, 0);
  assert.ok(!result.markdown.includes('try-link:start'), 'the orphan region is removed');
  assert.ok(result.markdown.includes('print(2 + 3)'), 'the code stays');
  assert.ok(result.markdown.includes('After the block.'));
  assert.ok(result.markdown.includes(`\`\`\`\n\nAfter the block.`), 'the blank line the region sat on goes with it');
});

check('a page that names no lesson is left as it is, and says why', () => {
  const before = page({ callout: false });
  const result = rewriteTryLinks(before, OPTIONS);
  assert.equal(result.changed, false);
  assert.equal(result.linked, 0);
  assert.equal(result.problems.length, 1);
  assert.ok(result.problems[0].includes('no workbench entry'), result.problems[0]);
});

check('a marker with no usable fence is reported, not skipped in silence', () => {
  const result = rewriteTryLinks(page({ language: 'bash', code: 'ls' }), OPTIONS);
  assert.equal(result.changed, false);
  assert.equal(result.problems.length, 1);
  assert.ok(result.problems[0].includes('python'), result.problems[0]);
});

check('a block too long for a URL is refused by its measured size, and the page is left alone', () => {
  const long = Array.from({ length: 400 }, (_, index) => `value_${index} = ${index}`).join('\n');
  const before = page({ code: long });
  const result = rewriteTryLinks(before, OPTIONS);
  assert.equal(result.changed, false, 'a refused block must not half-write the page');
  assert.equal(result.linked, 0);
  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0], /would be \d{4} characters, over the 2000/);
});

check('an empty fence is refused rather than linked to an empty editor', () => {
  const result = rewriteTryLinks(page({ code: '' }), OPTIONS);
  assert.equal(result.changed, false);
  assert.ok(result.problems[0].includes('empty'), result.problems[0]);
});

check('two blocks on one page each get their own link', () => {
  const two = [page({ tail: '' }), '<!-- try -->\n```python\nprint(9)\n```\n'].join('\n');
  const result = rewriteTryLinks(two, OPTIONS);
  assert.equal(result.linked, 2);
  const payloads = [...result.markdown.matchAll(/#try=([A-Za-z0-9_-]+)/g)].map((match) => match[1]);
  assert.equal(payloads.length, 2);
  assert.deepEqual(readTrySnippet(`#try=${payloads[1]}`), { lesson: 'R.1', code: 'print(9)' });
});

check('every shipped link decodes to the block it sits under', () => {
  let checked = 0;
  for (const file of tryLinkPages()) {
    const text = readFileSync(file, 'utf8');
    const blocks = tryBlocksIn(text);
    if (!blocks.length) continue;
    const lesson = pageLesson(text);
    const payloads = [...text.matchAll(/#try=([A-Za-z0-9_-]+)/g)].map((match) => match[1]);
    assert.equal(payloads.length, blocks.length, `${path.relative(REPO, file)}: one link per marked block`);
    blocks.forEach((block, index) => {
      assert.deepEqual(
        readTrySnippet(`#try=${payloads[index]}`),
        { lesson, code: block.code },
        `${path.relative(REPO, file)}: the link under block ${index + 1} must carry that block's text`
      );
      checked += 1;
    });
  }
  assert.ok(checked >= 3, `expected the marked worked examples to be covered, decoded ${checked}`);
});

check('the repository’s own pages are up to date (generate_try_links.mjs --check)', () => {
  try {
    execFileSync(process.execPath, ['--experimental-strip-types', 'scripts/generate_try_links.mjs', '--check', '-q'], {
      cwd: new URL('..', import.meta.url),
      stdio: 'pipe',
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    });
  } catch (error) {
    const detail = String(error.stdout || '') + String(error.stderr || '');
    assert.fail(`run \`node --experimental-strip-types scripts/generate_try_links.mjs\` to regenerate:\n${detail}`);
  }
});

console.log(
  `\n${passed} passed, ${failed} failed${failed ? '' : ` (on ${os.platform()})`}`
);
process.exitCode = failed ? 1 : 0;
