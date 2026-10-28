#!/usr/bin/env node
/**
 * The phone's two pure pieces (`npm run test:phone`).
 *
 * Neither throws when it is wrong — they fail quietly, which is why each rule is pinned here:
 *
 *   - **The surface store.** A surface remembered for the wrong lesson opens a lesson a learner has
 *     never read straight in the editor; a record that will not parse must read as "no record"
 *     rather than throw them out of their lesson; blocked storage must leave the switch working.
 *   - **The install offer.** Offered inside the installed app is noise; never offered on iOS is a
 *     learner who never learns the Share sheet; offered again the next day is a nag. The snooze and
 *     the platform rules are the whole of that behaviour, and `scripts/e2e_mobile.mjs` checks the
 *     rendered row against them.
 */

import assert from 'node:assert/strict';
import {
  PHONE_SURFACE_KEY,
  defaultPhoneSurface,
  normalizePhoneSurface,
  parsePhoneSurface,
  readPhoneSurface,
  togglePhoneSurface,
  writePhoneSurface,
} from '../app/src/phoneSurface.ts';
import {
  INSTALL_DISMISSED_KEY,
  INSTALL_SNOOZE_MS,
  installPlatform,
  isIosLike,
  isStandaloneDisplay,
  parseInstallDismissed,
  readInstallDismissed,
  shouldShowInstallOffer,
  snoozeInstallOffer,
} from '../app/src/installOffer.ts';

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

function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    data,
  };
}

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
const MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

section('the surface store');

check('a lesson with nothing stored opens on its text', () => {
  assert.equal(defaultPhoneSurface(), 'lesson');
  assert.equal(readPhoneSurface('P.1', fakeStorage()), 'lesson');
  assert.equal(readPhoneSurface('P.1', null), 'lesson');
});

check('a code surface is remembered for the lesson it belongs to', () => {
  const store = fakeStorage();
  assert.equal(writePhoneSurface('P.1', 'code', store), 'code');
  assert.equal(readPhoneSurface('P.1', store), 'code');
  assert.equal(readPhoneSurface('P.2', store), 'lesson');
  assert.deepEqual(JSON.parse(store.getItem(PHONE_SURFACE_KEY)), {
    lesson: 'P.1',
    surface: 'code',
  });
});

check('the toggle is a two-way switch', () => {
  assert.equal(togglePhoneSurface('lesson'), 'code');
  assert.equal(togglePhoneSurface('code'), 'lesson');
});

check('a value that is not one of the two surfaces is the text', () => {
  assert.equal(normalizePhoneSurface('code'), 'code');
  assert.equal(normalizePhoneSurface('lesson'), 'lesson');
  assert.equal(normalizePhoneSurface('editor'), 'lesson');
  assert.equal(normalizePhoneSurface(null), 'lesson');
});

check('a store from another build reads as no record, never as a throw', () => {
  assert.equal(parsePhoneSurface(null), null);
  assert.equal(parsePhoneSurface('not json'), null);
  assert.equal(parsePhoneSurface('[]'), null);
  assert.equal(parsePhoneSurface('"code"'), null);
  assert.equal(parsePhoneSurface('{"surface":"code"}'), null);
  assert.equal(parsePhoneSurface('{"lesson":"","surface":"code"}'), null);
  assert.equal(parsePhoneSurface('{"lesson":"P.1","surface":"editor"}'), null);
  assert.deepEqual(parsePhoneSurface('{"lesson":"P.1","surface":"code"}'), {
    lesson: 'P.1',
    surface: 'code',
  });
});

check('blocked storage leaves the switch working for the visit', () => {
  const blocked = {
    getItem() {
      throw new Error('denied');
    },
    setItem() {
      throw new Error('denied');
    },
  };
  assert.equal(writePhoneSurface('P.1', 'code', blocked), 'code');
  assert.equal(readPhoneSurface('P.1', blocked), 'lesson');
});

section('the install offer');

check('an installed app is never offered itself', () => {
  assert.equal(
    installPlatform({ hasPrompt: true, userAgent: ANDROID_UA, standalone: true }),
    'none'
  );
  assert.equal(shouldShowInstallOffer({ platform: 'none', dismissedAt: null, now: NOW }), false);
  assert.equal(isStandaloneDisplay(true, false), true);
  assert.equal(isStandaloneDisplay(false, true), true);
  assert.equal(isStandaloneDisplay(false, false), false);
});

check('the browser prompt wins when the browser offers one', () => {
  assert.equal(
    installPlatform({ hasPrompt: true, userAgent: ANDROID_UA, standalone: false }),
    'prompt'
  );
  assert.equal(shouldShowInstallOffer({ platform: 'prompt', dismissedAt: null, now: NOW }), true);
});

check('iOS gets the Share-sheet words, and a desktop gets nothing', () => {
  assert.equal(installPlatform({ hasPrompt: false, userAgent: IOS_UA, standalone: false }), 'ios');
  assert.equal(shouldShowInstallOffer({ platform: 'ios', dismissedAt: null, now: NOW }), true);
  assert.equal(installPlatform({ hasPrompt: false, userAgent: MAC_UA, standalone: false }), 'none');
  // iPadOS reports a Macintosh user agent; its Mobile token is the tell.
  assert.equal(isIosLike(MAC_UA), false);
  assert.equal(
    isIosLike(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
    ),
    true
  );
});

check('"not now" is a thirty-day snooze, and then the row returns', () => {
  assert.equal(
    shouldShowInstallOffer({
      platform: 'prompt',
      dismissedAt: NOW,
      now: NOW + INSTALL_SNOOZE_MS - 1,
    }),
    false
  );
  assert.equal(
    shouldShowInstallOffer({
      platform: 'prompt',
      dismissedAt: NOW,
      now: NOW + INSTALL_SNOOZE_MS,
    }),
    true
  );
  assert.equal(
    shouldShowInstallOffer({ platform: 'ios', dismissedAt: NOW, now: NOW + 29 * DAY }),
    false
  );
});

check('a clock that went backwards does not lock the row away', () => {
  assert.equal(
    shouldShowInstallOffer({ platform: 'prompt', dismissedAt: NOW, now: NOW - DAY }),
    true
  );
});

check('the dismissal is a timestamp, and rubbish reads as never dismissed', () => {
  assert.equal(parseInstallDismissed(String(NOW)), NOW);
  assert.equal(parseInstallDismissed(null), null);
  assert.equal(parseInstallDismissed('yesterday'), null);
  assert.equal(parseInstallDismissed('0'), null);
  assert.equal(parseInstallDismissed('-5'), null);
});

check('a dismissal survives a reload in the same store', () => {
  const store = fakeStorage();
  assert.equal(snoozeInstallOffer(NOW, store), NOW);
  assert.equal(store.getItem(INSTALL_DISMISSED_KEY), String(NOW));
  assert.equal(readInstallDismissed(store), NOW);
  assert.equal(readInstallDismissed(fakeStorage()), null);
  assert.equal(
    readInstallDismissed({
      getItem() {
        throw new Error('denied');
      },
    }),
    null
  );
  // The row is gone while the snooze holds, which is the only behaviour a learner sees.
  assert.equal(
    shouldShowInstallOffer({ platform: 'prompt', dismissedAt: readInstallDismissed(store), now: NOW + DAY }),
    false
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
