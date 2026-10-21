// The `.ts` extension is for Node's type stripping (`scripts/test_lesson_draft.mjs`), the same way
// `lastLesson.ts` imports its registry: no bundler, no resolution rules beyond what the file says.
import { PYTHON_LESSONS } from './data/pythonLessonsData.ts';

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
 * Bounded, because `localStorage` is a single 5 MB bucket shared with progress, theme and the log:
 *
 * - **At most `MAX_DRAFTS` lessons**, least-recently-edited evicted. Twelve is more than a week of
 *   self-paced work, and a learner who returns to the thirteenth still gets the lesson, just from its
 *   starter.
 * - **At most `MAX_DRAFT_CHARS` per draft.** A paste bigger than that is not a draft; it is a file,
 *   and storing it would spend the bucket on a single tab.
 *
 * Never throws: private mode and blocked third-party storage both make `localStorage` throw on
 * access, and a learner in one of those gets a working editor without drafts.
 */

export const STORAGE_KEY_DRAFTS = 'mechalab_drafts_v1';
export const MAX_DRAFTS = 12;
export const MAX_DRAFT_CHARS = 40_000;

/** Lesson id -> editor text, most recently edited last. */
export type Drafts = Record<string, string>;

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
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

function writeDrafts(store: Storage, drafts: Drafts): void {
  try {
    store.setItem(STORAGE_KEY_DRAFTS, JSON.stringify(drafts));
  } catch {
    // A full bucket must not break the editor; this session still works, the next starts from the
    // lesson's own starter.
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
 */
export function saveDraft(id: string, code: string): void {
  const starter = starterFor(id);
  if (starter === null) return;
  const store = storage();
  if (!store) return;
  const drafts = readDrafts();

  if (!isEdited(code, starter)) {
    if (!(id in drafts)) return;
    delete drafts[id];
    writeDrafts(store, drafts);
    return;
  }
  if (code.length > MAX_DRAFT_CHARS) return;

  // Delete then re-add: key order is the eviction order, and editing a lesson again makes it the
  // newest one rather than leaving it where it first appeared.
  delete drafts[id];
  drafts[id] = code;
  const ids = Object.keys(drafts);
  for (const stale of ids.slice(0, Math.max(0, ids.length - MAX_DRAFTS))) delete drafts[stale];
  writeDrafts(store, drafts);
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

function diffLineCount(left: string[], right: string[]): number {
  // Lines outside the longest common subsequence are the ones that changed: an inserted line costs
  // one, not the whole file, which is what makes the count worth printing on a card.
  if (left.length * right.length > 250_000) return Math.max(left.length, right.length);
  const row = new Array<number>(right.length + 1).fill(0);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = 0;
    for (let j = 1; j <= right.length; j += 1) {
      const previous = row[j];
      row[j] = left[i - 1] === right[j - 1] ? diagonal + 1 : Math.max(row[j], row[j - 1]);
      diagonal = previous;
    }
  }
  const common = row[right.length];
  return left.length + right.length - 2 * common;
}

/**
 * How much of the starter the draft replaces - added plus removed lines.
 *
 * Zero means "the starter, untouched"; a learner who moved a brace and retyped one line sees 2, not
 * the 60 lines the file happens to have.
 */
export function editedLines(code: string, starter: string): number {
  if (!isEdited(code, starter)) return 0;
  return diffLineCount(code.split('\n'), starter.split('\n'));
}
