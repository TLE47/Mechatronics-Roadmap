/**
 * Erasing progress, wholly or by part (`app/src/progressReset.ts`).
 *
 * Every other store in this app only ever grows. A restore merges, a flag once set stays set, a card
 * schedule follows the more-reviewed copy — all of that is right for a learner who lost a laptop, and
 * all of it is wrong for the one case this module exists for: *"I want to start over."* There was no
 * way to say that. The only lever was the browser's own "clear site data", which also takes the theme,
 * the sound choice and the layout with it.
 *
 * So this is the deliberate opposite of `backupBundle.ts`, in the same vocabulary. Eleven parts, each
 * one the unit a learner would name — Lessons, Milestones, XP and awards, Practice cards, Notes and
 * highlights, Drafts and versions, Learning log, Sittings, Predictions, Onboarding, Where I was — and
 * a reset is per part or all of them. Preferences are deliberately absent: a theme is a choice about a
 * screen, it has its own control, and a reset that silently flipped it back to dark would be a second,
 * unasked-for change.
 *
 * Three details make it honest rather than merely destructive:
 *
 * - **A reset leaves a watermark.** `mechalab.progress.resetAt.v1` records the moment, and cloud sync
 *   reads it: a snapshot whose reset is newer than the other side's last change wins outright, so an
 *   empty local snapshot is not "no news" that a merge can union old flags back into. Without it a
 *   reset on a signed-in learner would undo itself at the next sign-in, which is exactly what
 *   `mergeProgress`'s never-lose-work rule does to an empty map.
 * - **The parts say which side they live on.** Lessons, milestones and the log are the cloud progress
 *   document; drafts, notes and checklist ticks are the opt-in workspace row; the rest never leave
 *   the browser. The report carries the two booleans the App uses to write the account's copy, so a
 *   reset on this machine is not resurrected by the next sync.
 * - **Nothing is cleared that is already empty.** The count is taken first, and a part with nothing in
 *   it is skipped rather than written back as an empty store — so the report's number is what was
 *   actually erased, and pressing Reset twice cannot make the second press look like it did something.
 *
 * The dialog is the surface (`components/ResetProgressDialog.tsx`); this module is the rules, and
 * `scripts/test_reset.mjs` runs it under Node with a `happy-dom` window and no React.
 */

import { bulkStorage } from './bulkStorage.ts';
import { STORAGE_KEY_READING } from './readingPosition.ts';
import { STORAGE_KEY_LAST_LESSON, readLastLessonId } from './lastLesson.ts';
import { STORAGE_KEY_LAST_VISIT, readLastVisit } from './homeLanding.ts';
import { STORAGE_KEY_TOUR, readTour } from './tourState.ts';
import { STORY_SEEN_KEY, readStorySeen } from './story.ts';
import { clearAllPredictions, readPredictions } from './predictGate.ts';
import { readAwards, writeAwards } from './gamification/awardStore.ts';
import { VERIFY_STAMPS_KEY } from './gamification/verifyStamp.ts';
import { STORAGE_KEY_SITTINGS, readSittings } from './sittingClock.ts';
import { clearLearningLog, readLearningLog } from './learningLog.ts';
import { clearHistory, readHistory } from './draftHistory.ts';
import { readDrafts, replaceDrafts } from './lessonDraft.ts';
import { replaceStudy, studyCounts } from './studyNotes.ts';
import { clearAllTicks, tickCounts } from './lessonChecks.ts';
import { readCardList, replaceCards } from './studyCards.ts';
import { RESET_EVENT, STORAGE_KEY_RESET_AT, announceReset, type ResetAreaId, type ResetReport } from './resetEvent.ts';
import {
  STORAGE_KEY_COMPLETED,
  STORAGE_KEY_MILESTONES,
  STORAGE_KEY_PROGRESS_UPDATED,
  STORAGE_KEY_VERIFIED,
  readFlagMap,
} from './progressKeys.ts';


/**
 * The first-run guide's dismissal, owned by the runner (`components/tabs/TabPyodideRunner.tsx`).
 * Repeated rather than imported: importing the runner to read one key would drag CodeMirror and the
 * whole tab into this module's graph for a string.
 */
const FIRST_GUIDE_KEY = 'mechalab_first_guide_dismissed_v1';

/**
 * The Start Here card's dismissal (`startHere.ts`). Repeated as a literal for the same reason: that
 * module pulls the lesson registry, which is a generated file with an extensionless import this suite
 * cannot resolve under Node's type stripping.
 */
const START_HERE_KEY = 'mechalab_start_here_dismissed_v1';


/** Which copy a part has to clear besides this browser's: the progress row, the workspace row, or none. */
export type ResetGroup = 'progress' | 'workspace' | 'local';

export interface ResetArea {
  id: ResetAreaId;
  label: string;
  /** One line the dialog prints under the label: what goes, and what does not. */
  hint: string;
  group: ResetGroup;
  /** What is stored right now. `n` decides whether the row's button is offered or reads "Nothing yet". */
  count(): { n: number; text: string };
  clear(): void;
}


function bucket(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function removeKey(key: string): void {
  try {
    bucket()?.removeItem(key);
  } catch {
    // A store that cannot be written to cannot be emptied either; the next visit reads what is left.
  }
}

/** A bulk key lives in IndexedDB after hydration; a pre-IndexedDB visit may still have it in the bucket. */
function removeBulkKey(key: string): void {
  try {
    bulkStorage()?.removeItem(key);
  } catch {
    // Fall through to the bucket: one of the two is where this browser kept it.
  }
  removeKey(key);
}

function flagCount(key: string): number {
  return Object.values(readFlagMap(key)).filter(Boolean).length;
}

function flagOn(key: string): boolean {
  try {
    return bucket()?.getItem(key) === '1';
  } catch {
    return false;
  }
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** How many lessons have a saved reading position. The store is one map, read as JSON here. */
function readingCount(): number {
  try {
    const raw = bucket()?.getItem(STORAGE_KEY_READING);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return 0;
    return Object.keys(parsed as Record<string, unknown>).length;
  } catch {
    return 0;
  }
}

// The registry is the dialog's order: the learning record first, the layer on top of it next, and the
// traces of the visit last. Each `clear` names the stores it owns, so a part cannot quietly erase a
// neighbour's key.
export { RESET_EVENT, STORAGE_KEY_RESET_AT, readResetAt } from './resetEvent.ts';
export type { ResetAreaId, ResetReport } from './resetEvent.ts';

export const RESET_AREAS: readonly ResetArea[] = [
  {
    id: 'lessons',
    label: 'Lessons',
    hint: 'The verdicts, the ticks you made yourself, and the grader stamps that go with them.',
    group: 'progress',
    count: () => {
      const verified = flagCount(STORAGE_KEY_VERIFIED);
      const self = flagCount(STORAGE_KEY_COMPLETED);
      return {
        n: verified + self,
        text: verified || self ? `${verified} verified · ${self} self-marked` : 'none yet',
      };
    },
    clear: () => {
      removeKey(STORAGE_KEY_VERIFIED);
      removeKey(STORAGE_KEY_COMPLETED);
      removeKey(VERIFY_STAMPS_KEY);
    },
  },
  {
    id: 'checks',
    label: 'Lesson checklists',
    hint: 'The ticks you made while reading a lesson. The lesson text, your notes and every verdict stay.',
    // These ride the opt-in workspace row as well, so the reset has to clear that copy too: a local
    // clear alone is unioned straight back in at the next sync.
    group: 'workspace',
    count: () => {
      const counts = tickCounts();
      return {
        n: counts.ticks,
        text: counts.ticks
          ? `${plural(counts.ticks, 'tick')} in ${plural(counts.lessons, 'lesson')}`
          : 'none yet',
      };
    },
    clear: () => clearAllTicks(),
  },
  {
    id: 'milestones',
    label: 'Milestones',
    hint: 'The roadmap ticks. The roadmap itself, and every lesson, stays where it is.',
    group: 'progress',
    count: () => {
      const n = flagCount(STORAGE_KEY_MILESTONES);
      return { n, text: n ? plural(n, 'milestone') : 'none yet' };
    },
    clear: () => removeKey(STORAGE_KEY_MILESTONES),
  },
  {
    id: 'awards',
    label: 'XP and awards',
    hint: 'The ledger: levels reached, proof marks, and the Scrap they paid for.',
    group: 'local',
    count: () => {
      const n = readAwards().length;
      return { n, text: n ? plural(n, 'award') : 'none yet' };
    },
    clear: () => writeAwards([]),
  },
  {
    id: 'cards',
    label: 'Practice cards',
    hint: 'The review schedule and its history. The cards come back from your highlights.',
    group: 'local',
    count: () => {
      const n = readCardList().length;
      return { n, text: n ? `${plural(n, 'card')} scheduled` : 'none yet' };
    },
    clear: () => replaceCards({}),
  },
  {
    id: 'notes',
    label: 'Notes and highlights',
    hint: 'What you wrote beside a lesson, and the passages you marked to come back to.',
    group: 'workspace',
    count: () => {
      const counts = studyCounts();
      const n = counts.notes + counts.highlights;
      return {
        n,
        text: n ? `${plural(counts.notes, 'note')} · ${plural(counts.highlights, 'highlight')}` : 'none yet',
      };
    },
    clear: () => {
      replaceStudy({});
    },
  },
  {
    id: 'drafts',
    label: 'Drafts and versions',
    hint: 'The unfinished editor text per lesson, and the versions each Run filed.',
    group: 'workspace',
    count: () => {
      const drafts = Object.keys(readDrafts()).length;
      const versions = Object.values(readHistory()).reduce((total, list) => total + list.length, 0);
      return {
        n: drafts + versions,
        text: drafts || versions ? `${plural(drafts, 'draft')} · ${plural(versions, 'version')}` : 'none yet',
      };
    },
    clear: () => {
      replaceDrafts({});
      clearHistory();
    },
  },
  {
    id: 'log',
    label: 'Learning log',
    hint: 'Every open, run, hint and verdict — the record the exports and the trail read.',
    group: 'progress',
    count: () => {
      const n = readLearningLog().length;
      return { n, text: n ? plural(n, 'event') : 'none yet' };
    },
    clear: () => clearLearningLog(),
  },
  {
    id: 'sittings',
    label: 'Sittings',
    hint: 'The clock: when you worked and for how long. Nothing else reads it as progress.',
    group: 'local',
    count: () => {
      const n = readSittings().length;
      return { n, text: n ? plural(n, 'sitting') : 'none yet' };
    },
    clear: () => removeBulkKey(STORAGE_KEY_SITTINGS),
  },
  {
    id: 'predictions',
    label: 'Predictions',
    hint: 'What you guessed the output would be before running it.',
    group: 'local',
    count: () => {
      const n = readPredictions().length;
      return { n, text: n ? plural(n, 'prediction') : 'none yet' };
    },
    clear: () => clearAllPredictions(),
  },
  {
    id: 'onboarding',
    label: 'Onboarding',
    hint: 'The first-run tour, the prologue, and the hints you dismissed. Resetting replays them.',
    group: 'local',
    count: () => {
      const marks = [
        readTour().status !== 'not-started',
        readStorySeen(),
        flagOn(START_HERE_KEY),
        flagOn(FIRST_GUIDE_KEY),
      ].filter(Boolean).length;
      return { n: marks, text: marks ? `${marks} of 4 seen` : 'not seen' };
    },
    clear: () => {
      removeKey(STORAGE_KEY_TOUR);
      removeKey(STORY_SEEN_KEY);
      removeKey(START_HERE_KEY);
      removeKey(FIRST_GUIDE_KEY);
    },
  },
  {
    id: 'resume',
    label: 'Where I was',
    hint: 'The lesson the next visit reopens, the last page you landed on, and your reading places.',
    group: 'local',
    count: () => {
      const lesson = readLastLessonId();
      const visited = readLastVisit() !== null;
      const pages = readingCount();
      const n = (lesson ? 1 : 0) + (visited ? 1 : 0) + pages;
      const text = [lesson ? `lesson ${lesson}` : '', visited ? 'last page' : '', pages ? plural(pages, 'page') : '']
        .filter(Boolean)
        .join(' · ');
      return { n, text: text || 'nothing kept' };
    },
    clear: () => {
      removeKey(STORAGE_KEY_LAST_LESSON);
      removeKey(STORAGE_KEY_LAST_VISIT);
      removeKey(STORAGE_KEY_READING);
    },
  },
];

export const RESET_EVERYTHING: readonly ResetAreaId[] = RESET_AREAS.map((area) => area.id);

/**
 * Erase the named parts. Unknown ids are ignored, empty parts are skipped, and the watermark is only
 * written when a part the account also holds was actually erased.
 */
export function resetAreas(ids: readonly string[], now: number = Date.now()): ResetReport {
  const wanted = new Set(ids);
  const cleared: ResetAreaId[] = [];
  let items = 0;
  let progress = false;
  let workspace = false;

  for (const area of RESET_AREAS) {
    if (!wanted.has(area.id)) continue;
    const before = area.count();
    if (!before.n) continue;
    area.clear();
    cleared.push(area.id);
    items += before.n;
    if (area.group === 'progress') progress = true;
    if (area.group === 'workspace') workspace = true;
  }

  let resetAt: number | null = null;
  if (progress) {
    resetAt = now;
    try {
      bucket()?.setItem(STORAGE_KEY_RESET_AT, String(now));
      bucket()?.setItem(STORAGE_KEY_PROGRESS_UPDATED, String(now));
    } catch {
      // The stores are cleared; a browser that refuses these two keys only loses the watermark.
    }
  }

  const report: ResetReport = { areas: cleared, items, progress, workspace, resetAt };
  // Nothing erased is not news: a screen that re-read for it would also rewrite the account's row.
  if (cleared.length > 0) announceReset(report);
  return report;
}

/** Erase every part in the registry. */
export function resetEverything(now: number = Date.now()): ResetReport {
  return resetAreas(RESET_EVERYTHING, now);
}

/** `Reset 12 items · Lessons, Practice cards` — the sentence the dialog prints. */
export function resetSummary(report: ResetReport): string {
  if (!report.areas.length) return 'Nothing to reset — those parts are already empty';
  const labels = report.areas
    .map((id) => RESET_AREAS.find((area) => area.id === id)?.label ?? id)
    .join(', ');
  return `Reset ${report.items} item${report.items === 1 ? '' : 's'} · ${labels}`;
}
