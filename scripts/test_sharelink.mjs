#!/usr/bin/env node
/**
 * The share link's codec (`scripts/test_sharelink.mjs`, `npm run test:share`)
 *
 * A link out of this app is read by people, mail clients and chat windows before it is read by the
 * app again, so the thing worth testing is not "does it encode" but what survives the trip and what
 * is refused:
 *
 * 1. **Round trip, for anything a string can hold** — emoji, accents, CRLF, a 30-line program: the
 *    code comes back byte for byte, because a link that changes one character changes the error the
 *    recipient is trying to help with.
 * 2. **Transport safety** — the payload is base64url and nothing else (`+`, `/` and `=` would be
 *    re-encoded by some clients), and it survives a real `new URL(...).hash` parse.
 * 3. **The measured cap** — a program that would make a 2,700-character URL is refused with the
 *    measured length, not silently truncated; an empty program is not a link at all.
 * 4. **Decoding is validation** — a fragment is untrusted input: wrong version, wrong alphabet,
 *    malformed JSON, wrong field types, an array, an oversized payload all answer `null`, which is
 *    what keeps a bad link from half-loading into someone's editor.
 * 5. **The address it builds** — one lesson, one fragment, no stale query (the palette page's
 *    `?view=theme` must not survive a share).
 *
 * Run: node --experimental-strip-types scripts/test_sharelink.mjs
 */

import assert from 'node:assert/strict';
import {
  MAX_SHARE_URL,
  SHARE_VERSION,
  decodeAttempt,
  encodeAttempt,
  readSharedAttempt,
  shareHash,
  shareUrl,
} from '../app/src/shareLink.ts';

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

/** The payload of a link, without trusting the module to parse its own output. */
function payloadOf(attempt) {
  const result = shareUrl('https://example.test/app/', attempt);
  assert.equal(result.ok, true, `expected a link for ${attempt.lesson}`);
  return result.url.split('#share=')[1];
}

const PROGRAM = `import math

def clamp(value, low, high):
    return max(low, min(high, value))

for step in range(3):
    print(clamp(step * 1.5, 0.0, 2.0))
`;

console.log('share link');

check('a program round-trips byte for byte', () => {
  const attempt = { lesson: 'P.4', code: PROGRAM };
  const result = shareUrl('https://example.test/app/', attempt);
  assert.equal(result.ok, true, 'expected a link');
  const back = readSharedAttempt(new URL(result.url).hash);
  assert.deepEqual(back, attempt, 'expected the lesson and the code back unchanged');
});

check('unicode, CRLF and a tab come back as they went in', () => {
  const attempt = {
    lesson: '05-control.T1.05a',
    code: '# °C, 50 % — naïve café\r\nprint("🙂 温度")\r\n\tprint(1)\n',
  };
  const back = readSharedAttempt(shareHash(attempt));
  assert.deepEqual(back, attempt, 'a link that mangles a degree sign changes the bug being reported');
});

check('the payload is base64url and survives URL parsing', () => {
  const payload = payloadOf({ lesson: 'P.1', code: PROGRAM });
  assert.match(payload, /^[A-Za-z0-9_-]+$/, `expected only the URL-safe alphabet, got ${payload.slice(0, 40)}…`);
  assert.ok(!payload.includes('='), 'expected no padding: some clients re-encode a trailing =');
  const url = shareUrl('https://example.test/app/', { lesson: 'P.1', code: PROGRAM });
  const parsed = new URL(url.url);
  assert.equal(parsed.searchParams.get('lesson'), 'P.1', 'expected the lesson in the query, not only the fragment');
  assert.ok(parsed.hash.startsWith('#share='), 'expected the payload in the fragment');
});

check('a lesson id with no code is not a link', () => {
  const result = shareUrl('https://example.test/app/', { lesson: 'P.1', code: '   \n\t ' });
  assert.equal(result.ok, false, 'expected a refusal');
  assert.equal(result.reason, 'no-code', 'expected the empty-program reason');
});

check('a program too long for the URL is refused, with the measured size', () => {
  const long = `${'x'.repeat(4000)}\n`;
  const result = shareUrl('https://example.test/app/', { lesson: 'P.1', code: long });
  assert.equal(result.ok, false, 'expected a refusal rather than a link a chat window will cut in half');
  assert.equal(result.reason, 'too-long');
  assert.ok(
    result.characters > MAX_SHARE_URL,
    `expected the measured length above the ${MAX_SHARE_URL} cap, got ${result.characters}`,
  );
  // The same program one line shorter still fits: the cap is on the link, not on the lesson.
  const short = shareUrl('https://example.test/app/', { lesson: 'P.1', code: PROGRAM });
  assert.equal(short.ok, true);
  assert.ok(short.characters <= MAX_SHARE_URL, `expected ${short.characters} <= ${MAX_SHARE_URL}`);
  assert.equal(short.characters, short.url.length, 'expected the reported size to be the URL it returns');
});

check('the link carries one lesson and nothing stale', () => {
  const result = shareUrl('https://example.test/Mechatronics-Roadmap/?view=theme#top', {
    lesson: 'P.9',
    code: 'print(1)\n',
  });
  assert.equal(result.ok, true);
  assert.ok(
    result.url.startsWith('https://example.test/Mechatronics-Roadmap/?lesson=P.9#share='),
    `expected the palette page's query and hash to be dropped, got ${result.url.slice(0, 90)}`,
  );
  assert.ok(!result.url.includes('view=theme'), 'a share link must not also open the palette page');
});

check('the hash reads with or without its #', () => {
  const attempt = { lesson: 'P.2', code: 'print(2)\n' };
  const hash = shareHash(attempt);
  assert.deepEqual(readSharedAttempt(hash), attempt);
  assert.deepEqual(readSharedAttempt(hash.slice(1)), attempt, 'a pasted fragment may lose the #');
  assert.equal(readSharedAttempt(''), null);
  assert.equal(readSharedAttempt('#top'), null, 'an anchor is not a share fragment');
  assert.equal(readSharedAttempt('#share='), null, 'an empty payload is not an attempt');
});

check('a malformed fragment is null, never a half-loaded editor', () => {
  const valid = payloadOf({ lesson: 'P.1', code: 'print(1)\n' });
  const cases = {
    'not base64url': '***',
    'valid base64, not JSON': encodeAttempt({ lesson: 'P.1', code: 'x' }).slice(0, 4) + '!!!!',
    'a JSON array': btoa(JSON.stringify([{ lesson: 'P.1', code: 'x' }])),
    'a missing lesson': btoa(JSON.stringify({ v: SHARE_VERSION, code: 'x' })),
    'a non-string code': btoa(JSON.stringify({ v: SHARE_VERSION, lesson: 'P.1', code: 42 })),
    'an empty lesson': btoa(JSON.stringify({ v: SHARE_VERSION, lesson: '', code: 'x' })),
    'a future version': btoa(JSON.stringify({ v: SHARE_VERSION + 1, lesson: 'P.1', code: 'x' })),
    'an oversized payload': btoa(JSON.stringify({ v: SHARE_VERSION, lesson: 'P.1', code: 'y'.repeat(4000) })),
  };
  for (const [label, payload] of Object.entries(cases)) {
    // Normalise to base64url the way the encoder does, so the only thing wrong is what the label says.
    const cleaned = payload.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    assert.equal(
      decodeAttempt(cleaned),
      null,
      `expected ${label} to decode to null; a guess here loads someone else's bytes into the editor`,
    );
  }
  assert.notEqual(decodeAttempt(valid), null, 'expected the valid payload to still decode');
});

check('a wrong-version link is refused rather than guessed at', () => {
  const payload = encodeAttempt({ lesson: 'P.1', code: 'print(1)\n' });
  const json = new TextDecoder().decode(
    Uint8Array.from(atob(payload.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0)),
  );
  const bumped = JSON.stringify({ ...JSON.parse(json), v: SHARE_VERSION + 1 });
  const bytes = new TextEncoder().encode(bumped);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const nextVersion = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.equal(decodeAttempt(nextVersion), null);
});

console.log(`\nshare link: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
