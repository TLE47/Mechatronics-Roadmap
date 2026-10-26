/**
 * The content bundle as the app will read it (`scripts/test_content.mjs`, `npm run test:content`).
 *
 * `scripts/build_content.py --check` proves the bundle matches `content/`. This suite proves the
 * opposite direction — that what the bundle says is *usable*: every mission joins to a spine step
 * with real lessons, every recording exists and is a voice memo rather than a chapter, the ladder is
 * 0..10 with something to unlock at every level, and an id resolves through the alias table.
 *
 * A story file that passes the schema but joins to nothing would ship a mission with no lessons in
 * it. That is the failure this file is for.
 */

import assert from 'node:assert/strict';
import {
  CONTENT_MANIFEST,
  CONTENT_VERSION,
  MISSIONS,
  PARTS,
  REWARDS,
  contentLabel,
  missionAt,
  partForMission,
  resolveLessonId,
  resolveMissionNumber,
} from '../app/src/content/loader.ts';
import { RECORDINGS, allRecordings, recordingAt, recordingForMission } from '../app/src/content/recordings.ts';
import {
  missionCheckLabel,
  missionForEntry,
  missionProgressForAll,
  nextMission,
  verifiedMissionCount,
} from '../app/src/gamification/missions.ts';
import { LEVELS, earnedLevel, levelAt, levelLabel, levelProgress, nextLevel, perksUpTo } from '../app/src/gamification/levels.ts';

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

console.log('MechaLab 3.0 content');

check('ten missions, ten recordings, ten parts, eleven levels', () => {
  assert.equal(MISSIONS.length, 10);
  assert.equal(RECORDINGS.length, 10);
  assert.equal(PARTS.length, 10);
  assert.equal(LEVELS.length, 11);
  assert.deepEqual(CONTENT_MANIFEST, {
    version: CONTENT_VERSION,
    missions: 10,
    recordings: 10,
    levels: 11,
    proofMarks: REWARDS.proofMarks.length,
    streetCred: REWARDS.streetCred.length,
    parts: 10,
  });
});

check('the version label names the bundle the site is serving', () => {
  assert.match(CONTENT_VERSION, /^[0-9a-f]{10}$/);
  assert.equal(contentLabel(), `content v${CONTENT_VERSION}`);
});

check('every mission joins to its spine step and has lessons to verify', () => {
  const progress = missionProgressForAll({});
  assert.equal(progress.length, 10);
  for (const mission of progress) {
    assert.equal(mission.step.number, mission.mission.number, 'a mission must name its own spine step');
    assert.ok(mission.total > 0, `mission ${mission.mission.number} asks for no lessons`);
    assert.equal(mission.verifiedCount, 0);
    assert.equal(mission.verified, false);
    assert.match(missionCheckLabel(mission), /^0 of \d+ checks$/);
  }
});

check('missions cover the ten steps in order, from Start here to the capstone', () => {
  for (let number = 1; number <= 10; number += 1) {
    const mission = missionAt(number);
    assert.ok(mission, `mission ${number} is missing`);
    assert.equal(mission.spineStep, number);
  }
  assert.equal(missionAt(1).slug, 'boot-sequence');
  assert.equal(missionAt(10).slug, 'commission-your-robot');
});

check('a recorded index resolves through the alias table unchanged', () => {
  assert.equal(resolveLessonId('P.1'), 'P.1');
  assert.equal(resolveMissionNumber(3), 3);
});

check('every mission names a recording, and every recording is a voice memo', () => {
  for (const mission of MISSIONS) {
    const recording = recordingForMission(mission.number);
    assert.ok(recording, `mission ${mission.number} has no recording`);
    assert.equal(recording.number, mission.number);
    assert.ok(recording.words > 0 && recording.words <= 120, `${recording.id} is ${recording.words} words`);
    assert.ok(recording.body.length > 80, `${recording.id} is too short to be a recording`);
  }
  assert.deepEqual(
    allRecordings().map((recording) => recording.id),
    RECORDINGS.map((recording) => recording.id).slice().sort()
  );
});

check('the first recording explains the red result before anything else in the story', () => {
  const first = recordingAt(1);
  assert.equal(first.id, '01-boot-sequence');
  assert.match(first.body, /print the number/i);
  assert.equal(recordingAt(99), null);
});

check('a lesson belongs to the mission whose spine step lists it', () => {
  const start = nextMission({});
  assert.ok(start);
  const entry = start.entries[0];
  assert.ok(entry, 'the first mission lists no entries');
  const joined = missionForEntry(entry.id, {});
  assert.equal(joined?.mission.number, start.mission.number);
  assert.equal(missionForEntry('not-a-lesson', {}), null);
});

check('a verified mission counts only when every entry is verified', () => {
  const first = missionProgressForAll({})[0];
  const partial = Object.fromEntries(first.entries.slice(0, -1).map((entry) => [entry.id, true]));
  assert.equal(missionProgressForAll(partial)[0].verified, false);
  assert.equal(verifiedMissionCount(partial), 0);
  const complete = Object.fromEntries(first.entries.map((entry) => [entry.id, true]));
  assert.equal(missionProgressForAll(complete)[0].verified, true);
  assert.equal(verifiedMissionCount(complete), 1);
  assert.equal(nextMission(complete)?.mission.number, 2);
});

check('the ladder starts at Optimized Out and ends at Last Hand', () => {
  assert.equal(levelAt(0).handle, 'OPTIMIZED OUT');
  assert.equal(levelAt(10).handle, 'LAST HAND');
  assert.equal(levelAt(99).number, 10, 'a level above the ladder clamps to the top');
  assert.equal(levelAt(-3).number, 0, 'a negative level clamps to the start');
  assert.equal(earnedLevel(4), 4);
  assert.equal(earnedLevel(10), 10);
});

check('every level above 0 unlocks something usable', () => {
  for (const level of LEVELS.filter((candidate) => candidate.number > 0)) {
    assert.ok(level.perks.length > 0, `level ${level.number} unlocks nothing`);
    for (const perk of level.perks) {
      assert.ok(perk.label.length > 2);
      assert.ok(
        ['surface', 'toy', 'room', 'look', 'audio', 'flair'].includes(perk.kind),
        `${perk.id} has an unknown kind`
      );
    }
  }
  assert.equal(perksUpTo(0).some((perk) => perk.id === 'telemetry-tiles'), false);
  assert.equal(perksUpTo(1).some((perk) => perk.id === 'telemetry-tiles'), true);
  assert.equal(nextLevel(10), null);
  assert.equal(levelLabel(3), 'LV 3 · RUST WAKER');
});

check('the bar shows the current mission, and is full only at the top of the ladder', () => {
  const empty = levelProgress(0, { verifiedCount: 0, total: 21 });
  assert.equal(empty.level, 0);
  assert.equal(empty.fraction, 0);
  assert.equal(empty.toGo, 21);
  const part = levelProgress(2, { verifiedCount: 7, total: 21 });
  assert.equal(part.level, 2);
  assert.ok(Math.abs(part.fraction - 7 / 21) < 1e-9);
  assert.equal(part.missionNumber, 3);
  const top = levelProgress(10, null);
  assert.equal(top.fraction, 1);
  assert.equal(top.toGo, 0);
});

check('every mission seats exactly one part, and the first part names a real lesson', () => {
  for (let number = 1; number <= 10; number += 1) {
    assert.ok(partForMission(number), `mission ${number} seats no part`);
  }
  const first = partForMission(1);
  assert.equal(first.lesson, 'P.1');
  assert.equal(partForMission(11), null);
});

check('no level is earned by Neon: the rules say so and the engine agrees', () => {
  assert.equal(REWARDS.neon.reRun, 0, 'a re-run must earn nothing');
  assert.equal(REWARDS.neon.hints, 0, 'a hint must never cost anything');
  assert.equal(earnedLevel(0), 0);
  assert.equal(levelAt(earnedLevel(0)).handle, 'OPTIMIZED OUT');
});

check('the proof marks are behaviours, not speeds', () => {
  const ids = REWARDS.proofMarks.map((mark) => mark.id);
  assert.equal(new Set(ids).size, ids.length, 'a proof mark id is used twice');
  for (const mark of REWARDS.proofMarks) {
    assert.doesNotMatch(`${mark.earnedWhen} ${mark.why}`, /\b(seconds?|fastest|minutes?|speed)\b/i);
  }
});

if (failures > 0) {
  console.error(`[FAIL] content: ${failures} of ${passes + failures} check(s) failed`);
  process.exit(1);
}
console.log(`[PASS] content: ${passes} checks`);
