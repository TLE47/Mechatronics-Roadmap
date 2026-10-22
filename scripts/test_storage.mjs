#!/usr/bin/env node
/**
 * The move to IndexedDB, pinned without a browser (`scripts/test_storage.mjs`, `npm run test:storage`).
 *
 * `app/src/bulkStorage.ts` is the one place in the app where a mistake eats a learner's work rather
 * than showing a wrong number: a migration that deletes the bucket copy before the database has it, a
 * write that is queued and then forgotten on a page that closes, a cache that serves an empty answer
 * because it was read before it was filled. None of those is reachable from a unit test through the
 * real database, so the factory takes the backend as an argument and this suite hands it one it can
 * fail on demand.
 *
 * The rules pinned here:
 *
 *  - with no IndexedDB (Node, or a browser that refuses one) every read and write is the bucket, so
 *    the six store modules behave exactly as they did before the move;
 *  - a migration copies first and deletes only afterwards, and a backend that refuses a copy leaves
 *    the bucket whole;
 *  - the bucket wins over a database copy when both have the key, because the bucket copy is the one a
 *    pre-IndexedDB version wrote;
 *  - reads after `hydrate()` are synchronous from the cache, writes land on `flush()` in coalesced
 *    order, and a failed write goes back on the queue rather than being dropped.
 *
 * Run: node --experimental-strip-types scripts/test_storage.mjs
 */

import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import {
  BULK_KEYS,
  createBulkStorage,
} from '../app/src/bulkStorage.ts';
import {
  LOG_STORAGE_KEY,
  logEvent,
  readLearningLog,
} from '../app/src/learningLog.ts';
import { STORAGE_KEY_DRAFTS, readDraft, saveDraft } from '../app/src/lessonDraft.ts';
import { STORAGE_KEY_STUDY, readStudy, saveNote } from '../app/src/studyNotes.ts';

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

/** A fresh browser: empty bucket, and no `indexedDB` unless a case installs one. */
function freshBrowser() {
  const window = new Window({ url: 'https://example.test/' });
  globalThis.window = window;
  globalThis.document = window.document;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: window.localStorage,
  });
  delete globalThis.indexedDB;
  return window;
}

/** A browser that will answer "yes" to IndexedDB — enough for `storage()` to wait for `hydrate()`. */
function withIndexedDb() {
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: {}, writable: true });
}

/**
 * The backend a test can break: a map behind promises, a count of each operation, and a set of keys
 * whose write or read throws.
 */
function fakeBackend({ entries = {}, failWrites = new Set(), failReadAll = false } = {}) {
  const data = new Map(Object.entries(entries));
  const writes = [];
  const removes = [];
  return {
    data,
    writes,
    removes,
    failWrites,
    async readAll() {
      if (failReadAll) throw new Error('QuotaExceededError: the database is not usable');
      return new Map(data);
    },
    async write(key, value) {
      if (failWrites.has(key)) throw new Error(`QuotaExceededError: ${key}`);
      writes.push([key, value]);
      data.set(key, value);
    },
    async remove(key) {
      removes.push(key);
      data.delete(key);
    },
  };
}

const sample = (label) => JSON.stringify({ marker: label });

console.log('no IndexedDB');

check('without a database the store is the bucket itself, not a copy of it', () => {
  freshBrowser();
  const store = createBulkStorage(async () => null);
  assert.equal(store.storage(), globalThis.localStorage);
  assert.equal(store.mode(), 'unready', 'nothing has been hydrated, and nothing needs to be');
});

checkAsync('hydrating with no database settles on the bucket', async () => {
  freshBrowser();
  const store = createBulkStorage(async () => null);
  assert.equal(await store.hydrate(), 'passthrough');
  assert.equal(store.storage(), globalThis.localStorage);
});

check('the store modules still write the bucket when there is no database', () => {
  freshBrowser();
  saveDraft('P.1', '# a marker\nprint(1)\n');
  assert.ok(globalThis.localStorage.getItem(STORAGE_KEY_DRAFTS)?.includes('# a marker'));
  assert.equal(readDraft('P.1'), '# a marker\nprint(1)\n');

  saveNote('P.1', 'a note', 1000);
  assert.ok(globalThis.localStorage.getItem(STORAGE_KEY_STUDY)?.includes('a note'));

  logEvent({ kind: 'lesson_open', lesson: 'P.1', t: 1000 });
  assert.equal(readLearningLog().length, 1);
  assert.ok(globalThis.localStorage.getItem(LOG_STORAGE_KEY)?.includes('lesson_open'));
});

console.log('migration');

await checkAsync('every bulk key moves, and the bucket is emptied only after the copy lands', async () => {
  freshBrowser();
  const backend = fakeBackend();
  for (const key of BULK_KEYS) globalThis.localStorage.setItem(key, sample(key));
  globalThis.localStorage.setItem('mechalab_theme_v1', 'dark');

  const store = createBulkStorage(async () => backend);
  assert.equal(await store.hydrate(), 'idb');

  for (const key of BULK_KEYS) {
    assert.equal(backend.data.get(key), sample(key), `${key} must be in the database`);
    assert.equal(globalThis.localStorage.getItem(key), null, `${key} must not stay in the bucket`);
    assert.equal(store.storage().getItem(key), sample(key), `${key} must be readable without a wait`);
  }
  assert.equal(
    globalThis.localStorage.getItem('mechalab_theme_v1'),
    'dark',
    'the first-paint keys are not bulk data and must stay where they are'
  );
});

await checkAsync('a backend that refuses a copy leaves the bucket whole, and the next visit finishes', async () => {
  freshBrowser();
  for (const key of BULK_KEYS) globalThis.localStorage.setItem(key, sample(key));

  const broken = fakeBackend({ failWrites: new Set([BULK_KEYS[0]]) });
  const first = createBulkStorage(async () => broken);
  assert.equal(await first.hydrate(), 'passthrough', 'a partial move must not be used');
  for (const key of BULK_KEYS) {
    assert.equal(
      globalThis.localStorage.getItem(key),
      sample(key),
      `${key} must survive a migration that could not finish`
    );
  }

  // Nothing was deleted, so the same bucket migrates again - this time into a database that works.
  const working = fakeBackend();
  const second = createBulkStorage(async () => working);
  assert.equal(await second.hydrate(), 'idb');
  for (const key of BULK_KEYS) {
    assert.equal(working.data.get(key), sample(key));
    assert.equal(globalThis.localStorage.getItem(key), null);
  }
});

await checkAsync('a database that cannot be read is not a migration: the bucket is used as it is', async () => {
  freshBrowser();
  globalThis.localStorage.setItem(BULK_KEYS[0], sample('draft'));
  const store = createBulkStorage(async () => fakeBackend({ failReadAll: true }));
  assert.equal(await store.hydrate(), 'passthrough');
  assert.equal(globalThis.localStorage.getItem(BULK_KEYS[0]), sample('draft'));
});

await checkAsync('the bucket wins over a database copy of the same key', async () => {
  freshBrowser();
  globalThis.localStorage.setItem(BULK_KEYS[0], sample('newer'));
  const backend = fakeBackend({ entries: { [BULK_KEYS[0]]: sample('older') } });
  const store = createBulkStorage(async () => backend);
  await store.hydrate();
  assert.equal(backend.data.get(BULK_KEYS[0]), sample('newer'));
  assert.equal(store.storage().getItem(BULK_KEYS[0]), sample('newer'));
});

await checkAsync('an entry only the database has is read back', async () => {
  freshBrowser();
  const backend = fakeBackend({ entries: { [BULK_KEYS[2]]: sample('log') } });
  const store = createBulkStorage(async () => backend);
  await store.hydrate();
  assert.equal(store.storage().getItem(BULK_KEYS[2]), sample('log'));
  assert.equal(store.storage().getItem('mechalab_absent_v1'), null);
});

console.log('write-behind');

await checkAsync('a write is readable at once and lands in the database on flush', async () => {
  freshBrowser();
  const backend = fakeBackend();
  const store = createBulkStorage(async () => backend);
  await store.hydrate();

  store.storage().setItem(BULK_KEYS[1], sample('version'));
  assert.equal(store.storage().getItem(BULK_KEYS[1]), sample('version'), 'reads are synchronous');
  assert.equal(backend.data.has(BULK_KEYS[1]), false, 'the write must still be queued');
  assert.equal(store.pendingWrites(), 1);

  await store.flush();
  assert.equal(backend.data.get(BULK_KEYS[1]), sample('version'));
  assert.equal(store.pendingWrites(), 0);
});

await checkAsync('three writes to one key in a tick are one put, carrying the last value', async () => {
  freshBrowser();
  const backend = fakeBackend();
  const store = createBulkStorage(async () => backend);
  await store.hydrate();

  const storage = store.storage();
  storage.setItem(BULK_KEYS[0], sample('one'));
  storage.setItem(BULK_KEYS[0], sample('two'));
  storage.setItem(BULK_KEYS[0], sample('three'));
  assert.equal(store.pendingWrites(), 1, 'a key is queued once, not once per keystroke');

  await store.flush();
  assert.deepEqual(backend.writes, [[BULK_KEYS[0], sample('three')]]);
});

await checkAsync('a removal and a clear reach the database too', async () => {
  freshBrowser();
  const backend = fakeBackend();
  const store = createBulkStorage(async () => backend);
  await store.hydrate();

  const storage = store.storage();
  storage.setItem(BULK_KEYS[0], sample('one'));
  storage.setItem(BULK_KEYS[1], sample('two'));
  await store.flush();
  assert.equal(backend.data.size, 2);

  storage.removeItem(BULK_KEYS[0]);
  assert.equal(storage.getItem(BULK_KEYS[0]), null);
  await store.flush();
  assert.equal(backend.data.has(BULK_KEYS[0]), false);

  storage.clear();
  assert.equal(storage.length, 0);
  await store.flush();
  assert.equal(backend.data.size, 0, 'a clear must empty the database, not just the cache');
});

await checkAsync('a failed write stays queued and is retried rather than dropped', async () => {
  freshBrowser();
  const backend = fakeBackend({ failWrites: new Set([BULK_KEYS[0]]) });
  const store = createBulkStorage(async () => backend);
  await store.hydrate();

  store.storage().setItem(BULK_KEYS[0], sample('kept'));
  await store.flush();
  assert.equal(backend.data.has(BULK_KEYS[0]), false);
  assert.equal(store.pendingWrites(), 1, 'a refused write goes back on the queue');
  assert.equal(store.storage().getItem(BULK_KEYS[0]), sample('kept'), 'this session still reads it');

  backend.writes = [];
  backend.failWrites.clear(); // the disk made room
  await store.flush();
  assert.equal(store.pendingWrites(), 0);
  assert.equal(backend.data.get(BULK_KEYS[0]), sample('kept'));
});

console.log('before hydrate');

await checkAsync('a store that has not been hydrated answers "nothing", not "everything"', async () => {
  freshBrowser();
  withIndexedDb();
  const backend = fakeBackend({ entries: { [BULK_KEYS[0]]: sample('stored') } });
  const store = createBulkStorage(async () => backend);
  assert.equal(store.storage(), null, 'an empty cache is not an empty store');

  await store.hydrate();
  assert.equal(store.mode(), 'idb');
  assert.equal(store.storage().getItem(BULK_KEYS[0]), sample('stored'));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
