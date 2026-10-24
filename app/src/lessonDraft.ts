// The `.ts` extension is for Node's type stripping (`scripts/test_lesson_draft.mjs`), the same way
// `lastLesson.ts` imports its registry: no bundler, no resolution rules beyond what the file says.
import { PYTHON_LESSONS } from './data/pythonLessonsData.ts';
import { bulkStorage } from './bulkStorage.ts';
import { diffLines } from './codeDiff.ts';

/**
 * The code the learner has typed into a lesson and not finished.
 *
 * The runner used to hold the editor's text in memory only: switching a lesson threw it away and
 * coming back offered the starter again, so a half-written `for` loop survived exactly as long as the
 * learner left the tab open. That is the one loss a self-paced course cannot afford - the work in
 * progress *is* the progress - and it is also why the roadmap could only ever say which lesson, never
 * what state its exercise was in.
 *
 * A draft is stored per lesson id, and only when it differs from the starter: an opened-and-untouched
 * lesson keeps nothing, so a first visit writes nothing and "no draft" means "nothing typed yet"
 * rather than "we stored a copy of the starter".
 *
 * **Every edited lesson keeps its latest draft.** The store used to keep twelve and evict the
 * least-recently-edited; a learner who returned to the thirteenth got the starter back and was never
 * told. Authored work is not cache: the count limit is gone, and the only ceiling left is
 * `MAX_DRAFT_CHARS` per draft, because a paste bigger than that is a file rather than an exercise.
 *
 * **A write that cannot land says so.** `saveDraft` returns false when storage is blocked or the
 * browser's bucket rejects the write, so the editor can tell the learner before the next reload
 * silently starts from the starter. (The bulk stores live in IndexedDB, whose quota is a share of the
 * disk; the 5 MB bucket is only the fallback a browser that refuses a database falls back to.)
 *
 * Never throws: private mode and blocked third-party storage both make `localStorage` throw on
 * access, and a learner in one of those gets a working editor without drafts.
 */

export const STORAGE_KEY_DRAFTS = 'mechalab_drafts_v1';
export const MAX_DRAFT_CHARS = 40_000;

/** Lesson id -> editor text, most recently edited last. */
export type Drafts = Record<string, string>;

function storage(): Storage | null {
  // IndexedDB when the browser has it (`bulkStorage.ts`), the bucket otherwise.
  return bulkStorage();
}

/** A store that has been written by something else (or by an older version) reads as empty. */
function parseDrafts(raw: string | null): Drafts {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const drafts: Drafts = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string') drafts[id] = value;
    }
    return drafts;
  } catch {
    return {};
  }
}

/** Write the store; false means the browser refused it (a full bucket, or a blocked write). */
function writeDrafts(store: Storage, drafts: Drafts): boolean {
  try {
    store.setItem(STORAGE_KEY_DRAFTS, JSON.stringify(drafts));
    return true;
  } catch {
    // A full bucket must not break the editor: the text is still on screen, and the caller turns the
    // false into a line that says the draft did not land rather than pretending it did.
    return false;
  }
}

/** Every stored draft, most recently edited last. */
export function readDrafts(): Drafts {
  const store = storage();
  if (!store) return {};
  try {
    return parseDrafts(store.getItem(STORAGE_KEY_DRAFTS));
  } catch {
    return {};
  }
}

/** The unfinished code for one lesson, or null when there is none. */
export function readDraft(id: string): string | null {
  const drafts = readDrafts();
  return typeof drafts[id] === 'string' ? drafts[id] : null;
}

function starterFor(id: string): string | null {
  return PYTHON_LESSONS.find((lesson) => lesson.id === id)?.starterCode ?? null;
}

/** True when the text is not what the lesson shipped, which is the only case worth remembering. */
export function isEdited(code: string, starter: string): boolean {
  return code !== starter;
}

/**
 * Store the editor's text for `id`, or forget it when it is back to the starter.
 *
 * Called on a debounce while the learner types and once more when they leave a lesson, so the last
 * few keystrokes before a tab switch are not the ones that get lost.
 *
 * Returns false when the draft could not be stored — no storage at all (blocked, private mode), or a
 * bucket that refused the write. True covers the deliberate decisions too: an untouched lesson keeps
 * nothing, and a paste past `MAX_DRAFT_CHARS` is not a draft.
 */
export function saveDraft(id: string, code: string): boolean {
  const starter = starterFor(id);
  if (starter === null) return true;
  const store = storage();
  if (!store) return false;
  const drafts = readDrafts();

  if (!isEdited(code, starter)) {
    if (!(id in drafts)) return true;
    delete drafts[id];
    return writeDrafts(store, drafts);
  }
  if (code.length > MAX_DRAFT_CHARS) return true;

  // Delete then re-add so the most recently edited lesson is last: the order is what the roadmap's
  // "continue where you left off" card reads, and nothing is dropped for being old any more.
  delete drafts[id];
  drafts[id] = code;
  return writeDrafts(store, drafts);
}

/** Forget one lesson's draft - what Reset Starter means once the editor is back on the starter. */
export function clearDraft(id: string): void {
  const store = storage();
  if (!store) return;
  const drafts = readDrafts();
  if (!(id in drafts)) return;
  delete drafts[id];
  writeDrafts(store, drafts);
}

/**
 * How much of the starter the draft replaces - added plus removed lines.
 *
 * Zero means "the starter, untouched"; a learner who moved a brace and retyped one line sees 2, not
 * the 60 lines the file happens to have.
 */
export function editedLines(code: string, starter: string): number {
  if (!isEdited(code, starter)) return 0;
  // Lines outside the longest common subsequence are the ones that changed: an inserted line costs
  // one, not the whole file, which is what makes the count worth printing on a card. The coin is
  // flipped (editor as the right-hand side) so "added" is the learner's own typing; the sum is the
  // same either way, and having one diff implementation is the point — the Diff panel counts with it.
  const diff = diffLines(starter, code);
  return diff.added + diff.removed;
}
