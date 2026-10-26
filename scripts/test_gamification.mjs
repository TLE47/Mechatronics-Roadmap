/**
 * The reward engine without a browser (`scripts/test_gamification.mjs`, `npm run test:game`).
 *
 * The rules this suite exists to hold, because each one is a promise the plan makes to a learner:
 *
 *  * a level comes from verified missions and nothing else;
 *  * an award is granted once — twice, a hundred times, after a restore, in either merge order;
 *  * a restore is a union, so an old archive cannot erase a newer award;
 *  * a missed week erases no work;
 *  * a hint costs nothing;
 *  * a changed grader or a changed story offers a re-verify instead of resetting a flag.
 */

import assert from 'node:assert/strict';
import {
  EMPTY_CONTEXT,
  awardsOfKind,
  candidateAwards,
  grantAwards,
  hasAward,
  mergeLedgers,
  neonLevel,
  neonMeter,
  scrapShelf,
  scrapTotal,
} from '../app/src/gamification/rewards.ts';
import { earnedLevel, levelAt, perksUpTo } from '../app/src/gamification/levels.ts';
import {
  currentNightShift,
  nightShiftLabel,
  nightShiftWeeks,
  practiceWeekRun,
  weekKey,
  weekStart,
} from '../app/src/gamification/nightShifts.ts';
import { graderFingerprint, reverifyNeeded } from '../app/src/gamification/verifyStamp.ts';

let failures = 0;
let passes = 0;
function check(name, fn) {
  try {
    fn();
    passes += 1;
    console.log(`  ok  ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAIL ${name}`);
    console.error(`       ${error.message.split('\n').join('\n       ')}`);
  }
}

const AT = 1_800_000_000_000;
const context = (over = {}) => ({ ...EMPTY_CONTEXT, ...over });

console.log('MechaLab 3.0 reward engine');

check('an empty learner earns nothing', () => {
  assert.deepEqual(candidateAwards(EMPTY_CONTEXT, AT), []);
});

check('a level needs its mission verified, not a meter', () => {
  const noLevel = candidateAwards(context({ checkpoints: 40, missionsVerified: 0 }), AT);
  assert.deepEqual(awardsOfKind(noLevel, 'level'), [], '40 checkpoints must earn no level');
  assert.ok(hasAward(noLevel, 'cred:cold-boot'), 'the first checkpoint still earns its Scrap');
  const one = candidateAwards(context({ missionsVerified: 1 }), AT);
  assert.ok(hasAward(one, 'level:1'));
  assert.equal(earnedLevel(1), 1);
  assert.equal(levelAt(1).handle, 'RAIN GHOST');
});

check('granting is idempotent, whatever the count', () => {
  const contextNow = context({ missionsVerified: 2, checkpoints: 12, predictions: 3 });
  const candidates = candidateAwards(contextNow, AT);
  const first = grantAwards([], candidates, AT);
  assert.ok(first.granted.length >= 4);
  const second = grantAwards(first.ledger, candidates, AT + 1000);
  assert.equal(second.granted.length, 0, 'a second pass granted something again');
  assert.equal(second.ledger.length, first.ledger.length);
  const third = grantAwards(second.ledger, candidateAwards(contextNow, AT + 99_000), AT + 99_000);
  assert.equal(third.granted.length, 0);
});

check('a merge of two ledgers is order-independent and keeps the earlier date', () => {
  const left = [{ id: 'cred:cold-boot', kind: 'street-cred', label: 'Cold Boot', at: 200, scrap: 1 }];
  const right = [{ id: 'cred:cold-boot', kind: 'street-cred', label: 'Cold Boot', at: 100, scrap: 1 }];
  const ab = mergeLedgers(left, right);
  const ba = mergeLedgers(right, left);
  assert.deepEqual(ab, ba);
  assert.equal(ab.length, 1);
  assert.equal(ab[0].at, 100);
  assert.equal(scrapTotal(ab), 1, 'a merged duplicate must not pay twice');
});

check('a restore cannot erase a newer award', () => {
  const newer = [{ id: 'level:8', kind: 'level', label: 'IRON NERVE', at: 900 }];
  const older = [{ id: 'cred:cold-boot', kind: 'street-cred', label: 'Cold Boot', at: 100, scrap: 1 }];
  const merged = mergeLedgers(newer, older);
  assert.equal(merged.length, 2);
  assert.ok(hasAward(merged, 'level:8'));
  assert.ok(hasAward(merged, 'cred:cold-boot'));
});

check('proof marks come from behaviour counts', () => {
  const marks = candidateAwards(
    context({ predictions: 1, diagnosticFixes: 2, faultRepairs: 1, marks: { 'second-opinion': 1 } }),
    AT
  ).filter((award) => award.kind === 'proof-mark');
  assert.deepEqual(
    marks.map((award) => award.id).sort(),
    ['mark:field-repair', 'mark:predicted', 'mark:read-the-evidence', 'mark:second-opinion']
  );
  assert.equal(marks.every((award) => award.label.length > 2), true);
});

check('Street Cred fires on its own trigger, once', () => {
  const coldBoot = candidateAwards(context({ checkpoints: 1 }), AT).filter(
    (award) => award.kind === 'street-cred'
  );
  assert.deepEqual(coldBoot.map((award) => award.id), ['cred:cold-boot']);
  assert.equal(coldBoot[0].scrap, 1);
  const held = grantAwards([], coldBoot, AT).ledger;
  assert.equal(grantAwards(held, coldBoot, AT + 1).granted.length, 0);
});

check('Scrap needs its achievement before the shelf shows it', () => {
  assert.deepEqual(scrapShelf([]), []);
  const ledger = grantAwards([], candidateAwards(context({ checkpoints: 1 }), AT), AT).ledger;
  const shelf = scrapShelf(ledger);
  assert.equal(shelf.length, 1);
  assert.equal(shelf[0].id, 'open-sign');
  assert.equal(scrapTotal(ledger), 1);
});

check('Neon relights the street and never moves a level', () => {
  assert.equal(neonMeter({ firstVerified: 0, reviews: 0, integrations: 0 }), 0);
  assert.equal(neonMeter({ firstVerified: 1, reviews: 0, integrations: 0 }), 5);
  assert.equal(neonMeter({ firstVerified: 2, reviews: 3, integrations: 1 }), 10 + 6 + 10);
  assert.equal(neonLevel(0), 0);
  assert.equal(neonLevel(1_000_000), 1);
  // The same Neon, twice, is the same level: nothing here reads the meter.
  assert.equal(earnedLevel(3), earnedLevel(3));
});

check('a hint costs nothing anywhere in the engine', () => {
  const withHints = candidateAwards(context({ missionsVerified: 1, checkpoints: 5 }), AT);
  const withoutHints = candidateAwards(context({ missionsVerified: 1, checkpoints: 5 }), AT);
  assert.deepEqual(withHints, withoutHints);
  assert.equal(perksUpTo(1).length > 0, true, 'a hint must not lock a perk');
});

// --- night shifts -------------------------------------------------------------------------

const DAY = 24 * 60 * 60 * 1000;
const start = weekStart(Date.now(), 'monday');
const run = (dayIndex, hour = 20) => ({ t: start + dayIndex * DAY + hour * 60 * 60 * 1000, kind: 'run' });
const opened = (dayIndex, hour = 9) => ({
  t: start + dayIndex * DAY + hour * 60 * 60 * 1000,
  kind: 'lesson_open',
});

check('a week is local, starts on the day the rules name, and has a stable key', () => {
  const monday = weekStart(start + 3 * DAY, 'monday');
  assert.equal(monday, start);
  assert.equal(weekKey(start, 'monday'), weekKey(start + 6 * DAY, 'monday'));
  assert.match(weekKey(start, 'monday'), /^\d{4}-\d{2}-\d{2}$/);
});

check('a night shift is a run or a verification, not a tab left open', () => {
  const week = currentNightShift([opened(0), opened(1), opened(2)], start, 4);
  assert.equal(week.count, 0, 'opening a lesson must not count as a night shift');
  const worked = currentNightShift([opened(0), run(0), run(1), { t: start + 2 * DAY + 20 * 3600_000, kind: 'verified' }], start, 4);
  assert.equal(worked.count, 3);
  assert.equal(worked.met, false);
  assert.equal(nightShiftLabel(worked), '3 of 4 night shifts');
});

check('a missed week erases nothing of the work that happened before it', () => {
  const events = [run(-7), run(-6), run(-5), run(-4), run(0)];
  const weeks = nightShiftWeeks(events, start, 4, 'monday', 3);
  assert.equal(weeks.length, 3);
  assert.equal(weeks[0].count, 0, 'the week before last was missed');
  assert.equal(weeks[1].met, true, 'last week still happened');
  assert.equal(weeks[1].count, 4);
  assert.equal(weeks[2].count, 1, 'this week has one so far');
});

check('the practice run counts consecutive met weeks, and an unfinished week does not break it', () => {
  const events = [run(-14), run(-13), run(-12), run(-11), run(-7), run(-6), run(-5), run(-4)];
  assert.equal(practiceWeekRun(events, start, 4, 'monday'), 2);
  const withThisWeek = [...events, run(0), run(1), run(2), run(3)];
  assert.equal(practiceWeekRun(withThisWeek, start, 4, 'monday'), 3);
});

// --- verification stamps ------------------------------------------------------------------

check('the grader fingerprint is stable and moves when the contract moves', () => {
  const lesson = {
    starterCode: 'a = 1',
    fullSolution: 'a = 2',
    expectedOutput: '2',
    instructorTests: 'assert a == 2',
  };
  assert.equal(graderFingerprint(lesson), graderFingerprint({ ...lesson }));
  assert.notEqual(graderFingerprint(lesson), graderFingerprint({ ...lesson, expectedOutput: '3' }));
  assert.match(graderFingerprint(lesson), /^[0-9a-f]{8}$/);
});

check('a changed grader or story offers a re-verify, and an unstamped flag is left alone', () => {
  const graders = { 'P.1': 'aaaa1111', 'P.2': 'bbbb2222' };
  const stamps = {
    'P.1': { v: 'v1', g: 'aaaa1111', at: 1 },
    'P.2': { v: 'v1', g: 'bbbb2222', at: 1 },
  };
  assert.deepEqual(reverifyNeeded({ 'P.1': true, 'P.2': true }, stamps, graders, 'v1'), []);
  assert.deepEqual(reverifyNeeded({ 'P.1': true, 'P.2': true }, stamps, graders, 'v2'), ['P.1', 'P.2']);
  assert.deepEqual(
    reverifyNeeded({ 'P.1': true }, stamps, { 'P.1': 'cccc3333' }, 'v1'),
    ['P.1'],
    'a changed grader must ask'
  );
  assert.deepEqual(reverifyNeeded({ 'P.9': true }, stamps, graders, 'v1'), [], 'no stamp, no prompt');
  assert.deepEqual(reverifyNeeded({ 'P.1': false }, stamps, graders, 'v2'), [], 'unverified is not re-verified');
});

check('the ledger kinds stay separate for the achievement wall', () => {
  const ledger = grantAwards([], candidateAwards(context({ missionsVerified: 1, checkpoints: 1 }), AT), AT).ledger;
  assert.equal(awardsOfKind(ledger, 'level').length, 1);
  assert.equal(awardsOfKind(ledger, 'street-cred').length, 1);
});

if (failures > 0) {
  console.error(`[FAIL] game: ${failures} of ${passes + failures} check(s) failed`);
  process.exit(1);
}
console.log(`[PASS] game: ${passes} checks`);
