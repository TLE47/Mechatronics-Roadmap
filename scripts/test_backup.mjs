#!/usr/bin/env node
/**
 * The backup archive and its merge back in (`scripts/test_backup.mjs`, `npm run test:backup`).
 *
 * Two modules, two kinds of risk. `app/src/backupZip.ts` writes a format by hand, so the checks are
 * the format's own: the published CRC-32 vector, a byte-for-byte round trip (including an empty file
 * and a name that is not ASCII), and the three ways a chosen file can fail — wrong file, half a
 * download, and a zip someone re-compressed after unzipping it. The reader is what a learner points at
 * a file on disk, so `not-a-zip` and `truncated` are different sentences and both are pinned here.
 *
 * `app/src/backupBundle.ts` merges, and a merge is only trustworthy if it never loses work. So each
 * store gets a check that a restore is additive: a flag set here survives a backup that has none, a
 * draft written here beats the one in the file, a version already filed is not filed twice, an event
 * already logged is not logged twice, and the caps that keep the bucket from filling (five versions,
 * twelve drafts, 5,000 events) still hold after a big restore.
 *
 * The last check is the measurement the plan asks for: the caps bound every store well under the
 * 5 MB bucket, which is why this phase is the zip and not a move to IndexedDB.
 *
 * Run: node --experimental-strip-types scripts/test_backup.mjs
 */

import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import {
  crc32,
  createZip,
  readZip,
  utf8,
  fromUtf8,
} from '../app/src/backupZip.ts';
import {
  BACKUP_SCHEMA,
  MAX_BACKUP_BYTES,
  backupFileName,
  backupSummary,
  collectBackup,
  createBackupZip,
  formatBackupSize,
  restoreBackupZip,
  restoreSummary,
} from '../app/src/backupBundle.ts';
import { MAX_DRAFT_CHARS, readDraft, readDrafts, saveDraft } from '../app/src/lessonDraft.ts';
import {
  STORAGE_KEY_HISTORY,
  MAX_HISTORY_CHARS,
  MAX_SNAPSHOT_CHARS,
  MAX_SNAPSHOTS_PER_LESSON,
  readHistory,
  snapshotsFor,
} from '../app/src/draftHistory.ts';
import { LOG_STORAGE_KEY, MAX_EVENTS, readLearningLog } from '../app/src/learningLog.ts';
import { STORAGE_KEY_TOUR } from '../app/src/tourState.ts';
import { readTicks, setTicked } from '../app/src/lessonChecks.ts';
import {
  MAX_COMMENT_CHARS,
  MAX_HIGHLIGHT_CHARS,
  MAX_HIGHLIGHTS,
  MAX_NOTE_CHARS,
  addHighlight,
  readLessonStudy,
  saveNote,
} from '../app/src/studyNotes.ts';
import {
  STORAGE_KEY_COMPLETED,
  STORAGE_KEY_MILESTONES,
  STORAGE_KEY_VERIFIED,
} from '../app/src/progressKeys.ts';
import { MAX_CARDS, cardId, readCards, reviewCard, syncCards } from '../app/src/studyCards.ts';
import { readSittings, recordSittingEvent } from '../app/src/sittingClock.ts';
import { DAY_MS } from '../app/src/fsrs.ts';
import { PYTHON_LESSONS } from '../app/src/data/pythonLessonsData.ts';

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

/** A fresh browser: new storage with nothing in it. */
function freshBrowser() {
  const window = new Window({ url: 'https://example.test/' });
  globalThis.window = window;
  globalThis.document = window.document;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: window.localStorage,
  });
  return window;
}

function seedFlags(key, flags) {
  globalThis.localStorage.setItem(key, JSON.stringify(flags));
}

function seedHistory(history) {
  globalThis.localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history));
}

function seedLog(events) {
  globalThis.localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(events));
}

/** Write the backup, wipe everything, restore it, and hand back both halves of the story. */
function backupAndWipe() {
  const bytes = createBackupZip(1_700_000_000_000);
  globalThis.localStorage.clear();
  return bytes;
}

const LESSON = PYTHON_LESSONS[0];
const OTHER = PYTHON_LESSONS[1];
const THIRD = PYTHON_LESSONS[2];

console.log('backup zip');

check('crc32 matches the published check vector', () => {
  assert.equal(crc32(utf8('123456789')), 0xcbf43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
});

check('an archive starts with a local header and ends with the end record', () => {
  const bytes = createZip([{ name: 'a.txt', data: utf8('hello') }]);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(view.getUint32(0, true), 0x04034b50, 'expected the local file header signature first');
  assert.equal(
    view.getUint32(bytes.length - 22, true),
    0x06054b50,
    'expected the end-of-central-directory record last'
  );
  assert.equal(view.getUint16(bytes.length - 22 + 10, true), 1, 'expected one entry in the directory');
});

check('a round trip returns every name and every byte, including an empty file and a non-ASCII name', () => {
  const entries = [
    { name: 'manifest.json', data: utf8('{"schema":"x"}') },
    { name: 'empty.txt', data: new Uint8Array(0) },
    { name: 'stage-0/S0.0 · why.json', data: utf8('løype\nnested') },
  ];
  const read = readZip(createZip(entries));
  assert.equal(read.ok, true, `expected a readable archive, got ${read.reason}`);
  assert.deepEqual(
    read.entries.map((entry) => entry.name),
    entries.map((entry) => entry.name)
  );
  for (const [index, entry] of entries.entries()) {
    assert.equal(fromUtf8(read.entries[index].data), fromUtf8(entry.data));
  }
});

check('random bytes are refused as "not a zip"', () => {
  const read = readZip(utf8('this is a text file a learner picked by mistake, padded out to be long enough to matter'));
  assert.equal(read.ok, false);
  assert.equal(read.reason, 'not-a-zip');
});

check('half a download is reported as truncated, not as the wrong file', () => {
  const good = createBackupZip(0);
  const read = readZip(good.subarray(0, Math.floor(good.length * 0.8)));
  assert.equal(read.ok, false);
  assert.equal(read.reason, 'truncated');
});

check('a re-compressed archive says so instead of importing garbage', () => {
  const bytes = createZip([{ name: 'manifest.json', data: utf8('{"schema":"mechalab.backup/1"}') }]);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const centralStart = view.getUint32(bytes.length - 22 + 16, true);
  // Deflate is method 8. Patch both headers so the archive looks like one an unzip tool produced.
  view.setUint16(8, 8, true);
  view.setUint16(centralStart + 10, 8, true);
  const read = readZip(bytes);
  assert.equal(read.ok, false);
  assert.equal(read.reason, 'compressed');
});

console.log('backup bundle');

check('the bundle names its files, its schema and its date', () => {
  freshBrowser();
  const files = collectBackup(0);
  assert.deepEqual(
    files.map((file) => file.name),
    [
      'manifest.json',
      'progress.json',
      'drafts.json',
      'history.json',
      'study.json',
      'checks.json',
      'study-cards.json',
      'learning-log.json',
      // Whether the first-run tour has been seen: a fact about the learner, not a preference, so a
      // restore on a second machine does not walk them through lesson one again.
      'tour.json',
      'README.txt',
    ]
  );
  const manifest = JSON.parse(files[0].text);
  assert.equal(manifest.schema, BACKUP_SCHEMA);
  assert.equal(manifest.createdAt, '1970-01-01T00:00:00.000Z');
  assert.deepEqual(manifest.files.map((file) => file.name), files.slice(1).map((file) => file.name));
  assert.match(files.at(-1).text, /How to restore/, 'the README must say how to restore the archive');
  // The archive says what it leaves out, not only what it holds. A fold is the preference a learner is
  // most likely to look for after a restore on a new machine, so the README names all three keys
  // rather than saying "settings are not included" and leaving them to wonder.
  const readme = files.at(-1).text;
  assert.match(readme, /What is not in this zip/, 'the README must say what is deliberately left out');
  assert.match(readme, /fold of each roadmap card/, 'the README must name the roadmap fold');
  for (const key of [
    'mechalab_resume_collapsed_v1',
    'mechalab_trail_collapsed_v1',
    'mechalab_board_collapsed_v1',
  ]) {
    assert.ok(readme.includes(key), `the README must name ${key}`);
    assert.equal(
      files.some((file) => file.name !== 'README.txt' && file.text.includes(key)),
      false,
      `a fold is a preference, so ${key} must not be carried by any file in the archive`
    );
  }
  assert.equal(backupFileName(0), 'mechalab-backup-1970-01-01.zip');
});

check('the archive carries every store, and the manifest counts them', () => {
  freshBrowser();
  seedFlags(STORAGE_KEY_VERIFIED, { [LESSON.id]: true, [OTHER.id]: true });
  seedFlags(STORAGE_KEY_COMPLETED, { [THIRD.id]: true });
  seedFlags(STORAGE_KEY_MILESTONES, { 'm00-level0': true });
  saveDraft(LESSON.id, `${LESSON.starterCode}\n# half-written\n`);
  seedHistory({ [OTHER.id]: [{ code: 'print(1)', at: 5, outcome: 'verified' }] });
  saveNote(LESSON.id, 'The tolerance is on the angle.');
  addHighlight(OTHER.id, 'tolerance is on the angle', 'that is why 5 mm passed');
  setTicked(LESSON.id, 'wire the divider', true, 10);
  setTicked(OTHER.id, 'open the REPL', true, 11);
  seedLog([{ t: 1, kind: 'lesson_open', lesson: LESSON.id }]);

  const read = readZip(createBackupZip(1_700_000_000_000));
  assert.equal(read.ok, true, `expected a readable archive, got ${read.reason}`);
  const files = new Map(read.entries.map((entry) => [entry.name, fromUtf8(entry.data)]));
  const manifest = JSON.parse(files.get('manifest.json'));
  assert.deepEqual(manifest.counts, {
    verified: 2,
    completed: 1,
    milestones: 1,
    drafts: 1,
    snapshots: 1,
    notes: 1,
    highlights: 1,
    checks: 2,
    cards: 1,
    events: 1,
  });
  // The deck's *existence* is derived from the notes store, so a backup taken before the deck was
  // ever opened carries no schedules yet - the cards still count, and the file still names its schema.
  assert.match(files.get('study-cards.json'), /mechalab\.backup\.study-cards\/1/);
  assert.doesNotMatch(
    files.get('progress.json'),
    /localStorage|storage/, // the file holds the maps themselves, not the bucket's keys
    'progress.json should be data, not a dump of the storage layer'
  );
});

check('a restore into an empty browser brings back exactly what was backed up', () => {
  freshBrowser();
  seedFlags(STORAGE_KEY_VERIFIED, { [LESSON.id]: true });
  seedFlags(STORAGE_KEY_COMPLETED, { [OTHER.id]: true });
  seedFlags(STORAGE_KEY_MILESTONES, { 'm01-level0': true });
  const draft = `${LESSON.starterCode}\nprint("keep me")\n`;
  saveDraft(LESSON.id, draft);
  seedHistory({ [LESSON.id]: [{ code: 'print(2)', at: 11, outcome: 'mismatch' }] });
  setTicked(LESSON.id, 'wire the divider', true, 12);
  seedLog([{ t: 7, kind: 'run', lesson: LESSON.id, outcome: 'verified' }]);

  const bytes = backupAndWipe();
  assert.deepEqual(readDrafts(), {}, 'the wipe should have left nothing behind');
  const result = restoreBackupZip(bytes);
  assert.equal(result.ok, true, `restore failed: ${result.message}`);
  assert.equal(readDraft(LESSON.id), draft);
  assert.deepEqual(readHistory()[LESSON.id].map((version) => version.code), ['print(2)']);
  assert.deepEqual(readLearningLog().map((event) => event.t), [7]);
  assert.equal(globalThis.localStorage.getItem(STORAGE_KEY_MILESTONES), JSON.stringify({ 'm01-level0': true }));
  assert.deepEqual(readTicks(LESSON.id), ['wire the divider']);
  const report = result.report;
  assert.deepEqual(
    [report.verified, report.completed, report.milestones, report.drafts, report.snapshots, report.checks, report.events],
    [1, 1, 1, 1, 1, 1, 1],
    'every restored item should be counted once'
  );
  assert.deepEqual(report.skipped, []);
});

check('a restore never deletes: local flags survive flags the backup does not have', () => {
  freshBrowser();
  seedFlags(STORAGE_KEY_VERIFIED, { [LESSON.id]: true });
  seedFlags(STORAGE_KEY_COMPLETED, {});
  seedFlags(STORAGE_KEY_MILESTONES, { keep: true });
  const bytes = createBackupZip(0);

  freshBrowser(); // the "other machine": a backup made with different work
  seedFlags(STORAGE_KEY_VERIFIED, { [OTHER.id]: true });
  seedFlags(STORAGE_KEY_MILESTONES, { fromBackup: true });
  const result = restoreBackupZip(bytes);
  assert.equal(result.ok, true, `restore failed: ${result.message}`);
  assert.deepEqual(JSON.parse(globalThis.localStorage.getItem(STORAGE_KEY_VERIFIED)), {
    [LESSON.id]: true,
    [OTHER.id]: true,
  });
  assert.deepEqual(JSON.parse(globalThis.localStorage.getItem(STORAGE_KEY_MILESTONES)), {
    fromBackup: true,
    keep: true,
  });
  assert.equal(result.report.verified, 1, 'only the flag this browser lacked is new');
});

check('the first-run tour travels with the archive, and never arrives downgraded', () => {
  // The one record in a backup that is not a preference: "this learner has been shown the tour" is a
  // fact about them, so restoring on a second machine must not walk them through lesson one again.
  const completed = { version: 1, status: 'completed', stepIndex: 5, chipShown: true, updatedAt: 9 };
  freshBrowser();
  globalThis.localStorage.setItem(STORAGE_KEY_TOUR, JSON.stringify(completed));
  const bytes = createBackupZip(0);

  // A machine that has only dismissed it: the finished record wins.
  freshBrowser();
  globalThis.localStorage.setItem(
    STORAGE_KEY_TOUR,
    JSON.stringify({ ...completed, status: 'dismissed', stepIndex: 2, updatedAt: 99 })
  );
  const result = restoreBackupZip(bytes);
  assert.equal(result.ok, true, `restore failed: ${result.message}`);
  assert.equal(JSON.parse(globalThis.localStorage.getItem(STORAGE_KEY_TOUR)).status, 'completed');

  // And the other way round: an archive from before the tour finished cannot un-finish it.
  freshBrowser();
  globalThis.localStorage.setItem(
    STORAGE_KEY_TOUR,
    JSON.stringify({ ...completed, status: 'active', stepIndex: 1 })
  );
  const stale = createBackupZip(0);
  freshBrowser();
  globalThis.localStorage.setItem(STORAGE_KEY_TOUR, JSON.stringify(completed));
  restoreBackupZip(stale);
  assert.equal(JSON.parse(globalThis.localStorage.getItem(STORAGE_KEY_TOUR)).status, 'completed');

  // A file that is not a record this build knows is skipped and said out loud, not guessed at.
  freshBrowser();
  globalThis.localStorage.setItem(STORAGE_KEY_TOUR, JSON.stringify(completed));
  const bad = createZip([
    {
      name: 'manifest.json',
      data: utf8(
        JSON.stringify({
          schema: BACKUP_SCHEMA,
          app: 'MechaLab Workbench',
          createdAt: '1970-01-01T00:00:00.000Z',
          counts: {},
          files: [],
        })
      ),
    },
    { name: 'tour.json', data: utf8(JSON.stringify({ schema: 'mechalab.backup.tour/1', tour: { status: 'nonsense' } })) },
  ]);
  const rejected = restoreBackupZip(bad);
  assert.equal(rejected.ok, true, `restore failed: ${rejected.message}`);
  assert.match(rejected.report.skipped.join(' '), /tour\.json/);
  assert.equal(JSON.parse(globalThis.localStorage.getItem(STORAGE_KEY_TOUR)).status, 'completed');
});

check("a draft written here beats the backup's copy, and a lesson with none is filled", () => {
  freshBrowser();
  saveDraft(LESSON.id, `${LESSON.starterCode}\nprint("from the backup")\n`);
  saveDraft(OTHER.id, `${OTHER.starterCode}\nprint("from the backup")\n`);
  const bytes = createBackupZip(0);

  freshBrowser();
  saveDraft(LESSON.id, `${LESSON.starterCode}\nprint("written here")\n`);
  const result = restoreBackupZip(bytes);
  assert.equal(result.ok, true, `restore failed: ${result.message}`);
  assert.match(readDraft(LESSON.id), /written here/);
  assert.match(readDraft(OTHER.id), /from the backup/);
  assert.equal(result.report.drafts, 1, 'only the missing draft counts as restored');
});

check("a restore brings a lesson's highlights in and keeps the note written here", () => {
  freshBrowser();
  saveNote(LESSON.id, 'from the backup');
  addHighlight(LESSON.id, 'tolerance is on the angle', 'why it mattered');
  const bytes = createBackupZip(0);

  freshBrowser();
  saveNote(LESSON.id, 'written here');
  const result = restoreBackupZip(bytes);
  assert.equal(result.ok, true, `restore failed: ${result.message}`);
  const study = readLessonStudy(LESSON.id);
  assert.equal(study.note, 'written here', 'a note on this machine is the newer draft and must win');
  assert.deepEqual(study.highlights.map((highlight) => highlight.quote), ['tolerance is on the angle']);
  assert.equal(study.highlights[0].comment, 'why it mattered');
  assert.equal(result.report.notes, 0, 'nothing was missing, so no note was restored');
  assert.equal(result.report.highlights, 1, 'the highlight was new here');
});

check("a restore brings a card's schedule in, and never sends a studied card backwards", () => {
  freshBrowser();
  addHighlight(LESSON.id, 'tolerance is on the angle', 'why it mattered');
  const [card] = syncCards(0);
  reviewCard(card.id, 3, 0);
  reviewCard(card.id, 3, 3 * DAY_MS);
  const bytes = createBackupZip(0);
  assert.equal(cardId(LESSON.id, 'tolerance is on the angle'), card.id, 'the id travels in the file');

  // The other machine knows the same card from one answer: the backup's second answer is the truth.
  freshBrowser();
  addHighlight(LESSON.id, 'tolerance is on the angle', 'why it mattered');
  const [theirs] = syncCards(0);
  reviewCard(theirs.id, 1, 0);
  const result = restoreBackupZip(bytes);
  assert.equal(result.ok, true, `restore failed: ${result.message}`);
  assert.equal(readCards()[card.id].reps, 2, 'the more-reviewed schedule wins');
  assert.equal(result.report.cards, 1);

  // A third machine that has studied further is not pulled backwards by an older file.
  freshBrowser();
  addHighlight(LESSON.id, 'tolerance is on the angle', 'why it mattered');
  const [ahead] = syncCards(0);
  for (let index = 0; index < 4; index += 1) reviewCard(ahead.id, 3, index * 5 * DAY_MS);
  const again = restoreBackupZip(bytes);
  assert.equal(again.ok, true, `restore failed: ${again.message}`);
  assert.equal(readCards()[card.id].reps, 4, 'a restore is never a way to un-learn a card');
  assert.equal(again.report.cards, 0, 'nothing changed, so nothing is reported as restored');
});

check('checklist ticks travel in the archive, and a restore can never un-tick one', () => {
  freshBrowser();
  setTicked(LESSON.id, 'wire the divider', true, 10);
  setTicked(OTHER.id, 'open the REPL', true, 11);
  const bytes = backupAndWipe();
  assert.deepEqual(readTicks(LESSON.id), [], 'the wipe should have left no tick behind');

  const result = restoreBackupZip(bytes);
  assert.equal(result.ok, true, `restore failed: ${result.message}`);
  assert.deepEqual(readTicks(LESSON.id), ['wire the divider']);
  assert.deepEqual(readTicks(OTHER.id), ['open the REPL']);
  assert.equal(result.report.checks, 2);

  const again = restoreBackupZip(bytes);
  assert.equal(again.ok, true, `restore failed: ${again.message}`);
  assert.equal(again.report.checks, 0, 'a restore is repeatable and adds each tick once');

  // A tick made here after the archive was taken is not in the file; restoring must leave it alone.
  setTicked(LESSON.id, 'made after the backup', true, 12);
  const later = restoreBackupZip(bytes);
  assert.equal(later.ok, true, `restore failed: ${later.message}`);
  assert.deepEqual(readTicks(LESSON.id), ['wire the divider', 'made after the backup']);
  assert.equal(later.report.checks, 0, 'a restore never takes a tick away');
});

check('a backup taken before checklists existed still restores, silently', () => {
  freshBrowser();
  saveNote(LESSON.id, 'a note');
  const files = collectBackup(0).filter((file) => file.name !== 'checks.json');
  const bytes = createZip(
    files.map((file) => ({ name: file.name, data: utf8(file.text) })),
    new Date(0)
  );
  freshBrowser();
  const result = restoreBackupZip(bytes);
  assert.equal(result.ok, true, `restore failed: ${result.message}`);
  assert.deepEqual(result.report.skipped, [], 'a missing checklist file is an older backup, not a bad one');
  assert.equal(result.report.notes, 1);
  assert.equal(result.report.checks, 0);
});

check('a backup taken before cards existed still restores', () => {
  freshBrowser();
  saveNote(LESSON.id, 'a note');
  const files = collectBackup(0).filter((file) => file.name !== 'study-cards.json');
  const bytes = createZip(
    files.map((file) => ({ name: file.name, data: utf8(file.text) })),
    new Date(0)
  );
  freshBrowser();
  const result = restoreBackupZip(bytes);
  assert.equal(result.ok, true, `restore failed: ${result.message}`);
  assert.deepEqual(result.report.skipped, [], 'a missing deck is an older backup, not a bad file');
  assert.equal(result.report.notes, 1);
});

check('the archive leaves the sitting clock out, on purpose, and a doctored file cannot put it back', () => {
  freshBrowser();
  recordSittingEvent({ at: 1_700_000_000_000, kind: 'open', lesson: LESSON.id });
  assert.equal(readSittings().length, 1, 'expected the clock to record the sitting before the backup');
  const files = collectBackup(0);
  assert.deepEqual(
    files.map((file) => file.name).filter((name) => name.includes('sitting')),
    [],
    'the archive must not carry the sitting clock: a sitting is a fact about ONE machine, and merging two machines would count the same hour twice'
  );

  // A file that carries one anyway is not imported, so a hand-built archive cannot inflate a pilot's
  // active_minutes - which is the only reason the clock exists.
  const doctored = createZip(
    [
      ...files,
      {
        name: 'sittings.json',
        text: JSON.stringify({
          schema: 'mechalab.backup.sittings/1',
          sittings: [{ start: 1_700_000_000_000, end: 1_700_000_600_000, runs: 1, reviews: 0, lessons: [] }],
        }),
      },
    ].map((file) => ({ name: file.name, data: utf8(file.text) })),
    new Date(0)
  );
  freshBrowser();
  const result = restoreBackupZip(doctored);
  assert.equal(result.ok, true, `restore failed: ${result.message}`);
  assert.deepEqual(readSittings(), [], 'a restore must write nothing into the sitting clock');
});

check('a restore unions versions by timestamp: deduped, newest kept, cap held', () => {
  freshBrowser();
  const versions = Array.from({ length: 8 }, (_, index) => ({
    code: `print(${index})`,
    at: 100 + index,
    outcome: 'mismatch',
  }));
  seedHistory({ [LESSON.id]: versions });
  // The store keeps five versions per lesson, so the archive carries the five newest - and a restore
  // must not pretend to bring back the three the store itself had already dropped.
  const bytes = createBackupZip(0);

  freshBrowser();
  seedHistory({
    [LESSON.id]: [
      { code: 'print(2)', at: 102 },
      { code: 'print(3)', at: 103 },
      { code: 'print(4)', at: 104 },
    ],
  });
  const result = restoreBackupZip(bytes);
  assert.equal(result.ok, true, `restore failed: ${result.message}`);
  const filed = snapshotsFor(LESSON.id);
  assert.equal(filed.length, MAX_SNAPSHOTS_PER_LESSON, 'the store cap must survive a big restore');
  assert.equal(new Set(filed.map((version) => `${version.at}|${version.code}`)).size, filed.length);
  assert.deepEqual(
    filed.map((version) => version.at),
    [104, 103, 102, 101, 100],
    'newest first, and the three versions the browser already had are not doubled'
  );
  assert.equal(result.report.snapshots, 2, 'only the two it did not have count as restored');

  // The case a replay of arrivals gets wrong: a newer local version must not be pushed out by an
  // older arriving one, which is what filing in arrival order would do.
  freshBrowser();
  seedHistory({ [LESSON.id]: [{ code: 'print(105)', at: 105, outcome: 'verified' }] });
  const again = restoreBackupZip(bytes);
  assert.equal(again.ok, true, `restore failed: ${again.message}`);
  assert.deepEqual(snapshotsFor(LESSON.id).map((version) => version.at), [105, 104, 103, 102, 101]);
  assert.equal(again.report.snapshots, 4);
});

check('the learning log unions, in time order, without repeating an event', () => {
  freshBrowser();
  seedLog([
    { t: 10, kind: 'lesson_open', lesson: LESSON.id },
    { t: 40, kind: 'verified', lesson: LESSON.id },
  ]);
  const bytes = createBackupZip(0);

  freshBrowser();
  seedLog([{ t: 25, kind: 'run', lesson: OTHER.id, outcome: 'verified' }]);
  const result = restoreBackupZip(bytes);
  assert.equal(result.ok, true, `restore failed: ${result.message}`);
  assert.deepEqual(readLearningLog().map((event) => event.t), [10, 25, 40]);
  assert.equal(result.report.events, 2);

  // Restoring the same file again is the case a learner will hit: it must add nothing.
  const again = restoreBackupZip(bytes);
  assert.equal(again.ok, true, `the second restore failed: ${again.message}`);
  assert.equal(again.report.events, 0, 'a repeated restore must not duplicate log events');
  assert.equal(again.report.drafts, 0);
  assert.equal(again.report.snapshots, 0);
  assert.deepEqual(readLearningLog().map((event) => event.t), [10, 25, 40]);
});

check('a zip that is not this app’s backup is refused by the manifest', () => {
  freshBrowser();
  const foreign = createZip([
    { name: 'manifest.json', data: utf8('{"schema":"someone.else/1"}') },
    { name: 'progress.json', data: utf8('{"verifiedLessons":{"P.1":true}}') },
  ]);
  const result = restoreBackupZip(foreign);
  assert.equal(result.ok, false);
  assert.match(result.message, /not a MechaLab backup/);
  assert.equal(readDraft(LESSON.id), null, 'a refused restore must write nothing');
  assert.equal(globalThis.localStorage.getItem(STORAGE_KEY_VERIFIED), null);
});

check('an oversized file is refused before it is parsed', () => {
  freshBrowser();
  const result = restoreBackupZip(new Uint8Array(MAX_BACKUP_BYTES + 1));
  assert.equal(result.ok, false);
  assert.match(result.message, /larger than a MechaLab backup/);
});

check('the summaries say what happened, and say "nothing new" when nothing was', () => {
  freshBrowser();
  assert.equal(
    backupSummary({ verified: 0, completed: 0, milestones: 0, drafts: 0, snapshots: 0, checks: 0, events: 0 }, 0),
    'Backed up · 0 B'
  );
  assert.equal(
    backupSummary({ verified: 3, completed: 1, milestones: 0, drafts: 2, snapshots: 9, checks: 4, events: 12 }, 48_000),
    'Backed up · 3 verified · 1 self-marked · 2 drafts · 4 checklist ticks · 12 log events · 48 kB'
  );
  assert.equal(formatBackupSize(1_700_000), '1.7 MB');
  assert.equal(
    restoreSummary({ verified: 0, completed: 0, milestones: 0, drafts: 0, snapshots: 0, checks: 0, events: 0, skipped: [], files: 6 }),
    'Nothing new in that backup — this browser already has it all'
  );
  assert.equal(
    restoreSummary({ verified: 1, completed: 0, milestones: 0, drafts: 2, snapshots: 0, checks: 1, events: 4, skipped: ['history.json'], files: 6 }),
    'Restored · 1 lesson verified · 2 drafts · 1 checklist tick merged · 4 log events · skipped history.json'
  );
});

check('the archive stays under its receipt limit, with every lesson\'s authored work at the caps', () => {
  // Authored work is deliberately not capped by count any more: one draft and one study entry can
  // exist per lesson in the registry, and neither is evicted for being old (`app/src/lessonDraft.ts`,
  // `app/src/studyNotes.ts`). That retires the old "fits the 5 MB bucket fallback at worst case"
  // claim on purpose - a browser that refuses IndexedDB gets that bucket, and a write that fills it
  // returns false so the editor and the study panel say "Not saved" instead of dropping a lesson.
  // What still has to hold is the archive: the absolute ceiling has to stay under the size the
  // restore refuses as "not a MechaLab backup", or the app would write a file it cannot read back.
  // Measured, not guessed: 120 chars is a run event with a lesson id, an outcome and a short fail
  // line. Every store's own cap is exported by the module that enforces it.
  const lessons = PYTHON_LESSONS.length;
  const authored =
    lessons * MAX_DRAFT_CHARS + // one draft per lesson
    // one study entry per lesson: a note plus 20 highlights, each a quote and a comment
    lessons * (MAX_NOTE_CHARS + MAX_HIGHLIGHTS * (MAX_HIGHLIGHT_CHARS + MAX_COMMENT_CHARS));
  const capped =
    MAX_HISTORY_CHARS + // versions: 120,000 chars total, by construction
    // review cards: 500 schedules, each keyed by lesson plus the quote it asks (~200 chars of schedule)
    MAX_CARDS * (MAX_HIGHLIGHT_CHARS + 200) +
    MAX_EVENTS * 120; // learning log: the runner's own cap, at ~120 chars an event
  const worst = authored + capped;
  const verified = createBackupZip(0).length; // the archive overhead is a rounding error
  const ceiling = (worst + verified) * 2; // UTF-16 on its way into the zip
  assert.ok(
    ceiling < MAX_BACKUP_BYTES,
    `a full course at the caps would be ${Math.round(ceiling / 1000)} kB, which the restore would refuse`
  );
  console.log(
    `       caps: ${Math.round(worst / 1000)}k chars -> ~${Math.round(ceiling / 1000)} kB ` +
      `(drafts ${lessons} x ${MAX_DRAFT_CHARS}, history ${MAX_HISTORY_CHARS}, ` +
      `study ${lessons} x ${MAX_NOTE_CHARS + MAX_HIGHLIGHTS * (MAX_HIGHLIGHT_CHARS + MAX_COMMENT_CHARS)}, ` +
      `cards ${MAX_CARDS} x ${MAX_HIGHLIGHT_CHARS + 200}, ` +
      `log ${MAX_EVENTS} x 120)`
  );
  assert.ok(
    MAX_HISTORY_CHARS > MAX_SNAPSHOT_CHARS * MAX_SNAPSHOTS_PER_LESSON,
    'the total history cap must leave room for a full lesson of versions, or it binds first'
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
