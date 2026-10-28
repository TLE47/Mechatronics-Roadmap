/**
 * A reset part, opened (`app/src/resetItems.ts`).
 *
 * The dialog can already erase a whole part — "reset Lessons" is the row. What it could not do is
 * erase *one* of the things inside it: the one lesson that was marked verified by mistake, the one
 * stray milestone, the note for a page that was read twice. Erasing nine lessons to un-verify one is
 * not a feature, it is a bigger mistake than the one being fixed.
 *
 * So each part answers with its own list of items. An item is the unit the learner would name — a
 * lesson id, an award, a card, a day of the log — and it carries the same count the row shows, so a
 * part's items always add up to the part. `progressReset.ts` still owns the whole-part rules; this
 * module only takes one item out of a store and reports it in the same shape, watermark included,
 * so a partial reset is not undone by the next cloud merge.
 *
 * The stores are read through their own modules wherever one exposes a writer, and through their
 * key where the writer is all-or-nothing: nothing here invents a second storage format.
 */

import { STORAGE_KEY_READING, clearReadingPosition, readReadingPositions } from './readingPosition.ts';
import { STORAGE_KEY_LAST_LESSON, readLastLessonId } from './lastLesson.ts';
import { STORAGE_KEY_LAST_VISIT, readLastVisit } from './homeLanding.ts';
import { STORAGE_KEY_TOUR, readTour } from './tourState.ts';
import { STORY_SEEN_KEY, readStorySeen } from './story.ts';
import { PREDICTIONS_KEY, clearPrediction, readPredictions } from './predictGate.ts';
import { readAwards, writeAwards } from './gamification/awardStore.ts';
import { VERIFY_STAMPS_KEY } from './gamification/verifyStamp.ts';
import { STORAGE_KEY_SITTINGS, forgetSitting, readSittings } from './sittingClock.ts';
import { LOG_STORAGE_KEY, readLearningLog, replaceLearningLog } from './learningLog.ts';
import { clearHistory, readHistory } from './draftHistory.ts';
import { readDrafts, replaceDrafts } from './lessonDraft.ts';
import { readStudy, replaceStudy } from './studyNotes.ts';
import { clearTicks, readChecks } from './lessonChecks.ts';
import { cardId, readCardList, readCards, replaceCards } from './studyCards.ts';
import { announceReset, STORAGE_KEY_RESET_AT, type ResetAreaId, type ResetReport } from './resetEvent.ts';
import {
  STORAGE_KEY_COMPLETED,
  STORAGE_KEY_MILESTONES,
  STORAGE_KEY_PROGRESS_UPDATED,
  STORAGE_KEY_VERIFIED,
  readFlagMap,
} from './progressKeys.ts';
import { RESET_AREAS } from './progressReset.ts';

/** The first-run guide's dismissal and the Start Here card's, repeated from `progressReset.ts`. */
const FIRST_GUIDE_KEY = 'mechalab_first_guide_dismissed_v1';
const START_HERE_KEY = 'mechalab_start_here_dismissed_v1';

export interface ResetItem {
  /** Stable within its part: the store's own key, or the record's identity. */
  id: string;
  /** What the dialog prints — the lesson id, the award label, the day. */
  label: string;
  /** One line under it: what exactly goes, so a press is never blind. */
  detail: string;
  /** How many stored things this item erases. The part's items add up to its row's count. */
  n: number;
  clear(): void;
}

function bucket(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = bucket()?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeFlagMap(key: string, map: Record<string, boolean>): void {
  try {
    const store = bucket();
    if (!store) return;
    if (Object.keys(map).length === 0) store.removeItem(key);
    else store.setItem(key, JSON.stringify(map));
  } catch {
    // A blocked or full store costs the write, never the render.
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    const store = bucket();
    if (!store) return;
    if (typeof value === 'object' && value && Object.keys(value as object).length === 0) {
      store.removeItem(key);
      return;
    }
    store.setItem(key, JSON.stringify(value));
  } catch {
    // A blocked or full store costs the write, never the render.
  }
}

function withoutKey<T>(map: Record<string, T>, id: string): Record<string, T> {
  const next = { ...map };
  delete next[id];
  return next;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function day(ms: number): string {
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function clock(ms: number): string {
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${day(ms)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Lessons: one item per id, verified and/or marked, with its stamp. */
function lessonItems(): ResetItem[] {
  const verified = readFlagMap(STORAGE_KEY_VERIFIED);
  const self = readFlagMap(STORAGE_KEY_COMPLETED);
  const ids = [...new Set([...Object.keys(verified), ...Object.keys(self)])].sort();
  return ids.map((id) => {
    const isVerified = Boolean(verified[id]);
    const isSelf = Boolean(self[id]);
    return {
      id,
      label: id,
      detail: [isVerified ? 'verified' : '', isSelf ? 'self-marked' : ''].filter(Boolean).join(' · '),
      n: (isVerified ? 1 : 0) + (isSelf ? 1 : 0),
      clear: () => {
        writeFlagMap(STORAGE_KEY_VERIFIED, withoutKey(verified, id));
        writeFlagMap(STORAGE_KEY_COMPLETED, withoutKey(self, id));
        const stamps = readJson<Record<string, unknown>>(VERIFY_STAMPS_KEY, {});
        writeJson(VERIFY_STAMPS_KEY, withoutKey(stamps, id));
      },
    };
  });
}

/** Milestones: one item per roadmap tick. */
function milestoneItems(): ResetItem[] {
  const map = readFlagMap(STORAGE_KEY_MILESTONES);
  return Object.keys(map)
    .sort()
    .filter((id) => map[id])
    .map((id) => ({
      id,
      label: id,
      detail: 'roadmap milestone',
      n: 1,
      clear: () => writeFlagMap(STORAGE_KEY_MILESTONES, withoutKey(map, id)),
    }));
}

function awardItems(): ResetItem[] {
  return readAwards().map((award) => ({
    id: award.id,
    label: award.label,
    detail: `${award.kind.replace('-', ' ')} · ${clock(award.at)}`,
    n: 1,
    clear: () => writeAwards(readAwards().filter((held) => held.id !== award.id)),
  }));
}

function cardItems(): ResetItem[] {
  return readCardList().map((card) => ({
    id: card.id,
    label: card.quote.length > 48 ? `${card.quote.slice(0, 45)}…` : card.quote,
    detail: `${card.lesson} · due ${clock(card.schedule.due)}`,
    n: 1,
    clear: () => replaceCards(withoutKey(readCards(), cardId(card.lesson, card.quote))),
  }));
}

function noteItems(): ResetItem[] {
  const study = readStudy();
  return Object.entries(study).map(([id, lesson]) => ({
    id,
    label: id,
    detail: [lesson.note ? '1 note' : '', lesson.highlights.length ? plural(lesson.highlights.length, 'highlight') : '']
      .filter(Boolean)
      .join(' · '),
    n: (lesson.note ? 1 : 0) + lesson.highlights.length,
    clear: () => replaceStudy(withoutKey(study, id)),
  }));
}

function draftItems(): ResetItem[] {
  const drafts = readDrafts();
  const history = readHistory();
  const ids = [...new Set([...Object.keys(drafts), ...Object.keys(history)])].sort();
  return ids.map((id) => {
    const versions = history[id]?.length ?? 0;
    return {
      id,
      label: id,
      detail: [drafts[id] ? '1 draft' : '', versions ? plural(versions, 'version') : '']
        .filter(Boolean)
        .join(' · '),
      n: (drafts[id] ? 1 : 0) + versions,
      clear: () => {
        replaceDrafts(withoutKey(readDrafts(), id));
        clearHistory(id);
      },
    };
  });
}

/** The log, by day: one item per day of work, because a list of five thousand events is not a list. */
function logItems(): ResetItem[] {
  const byDay = new Map<string, number>();
  for (const event of readLearningLog()) {
    const key = day(event.t);
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }
  return [...byDay.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([key, count]) => ({
      id: key,
      label: key,
      detail: plural(count, 'event'),
      n: count,
      clear: () => replaceLearningLog(readLearningLog().filter((event) => day(event.t) !== key)),
    }));
}

function sittingItems(): ResetItem[] {
  return readSittings().map((sitting) => {
    const minutes = Math.max(1, Math.round((sitting.end - sitting.start) / 60_000));
    return {
      id: String(sitting.start),
      label: clock(sitting.start),
      detail: `${minutes} min · ${plural(sitting.runs, 'run')} · ${plural(sitting.reviews, 'review')}`,
      n: 1,
      clear: () => forgetSitting(sitting.start),
    };
  });
}

function predictionItems(): ResetItem[] {
  return readPredictions().map((record) => ({
    id: record.lessonId,
    label: `${record.lessonId} → ${record.verdict}`,
    detail: record.text.length > 40 ? `${record.text.slice(0, 37)}…` : record.text,
    n: 1,
    clear: () => clearPrediction(record.lessonId),
  }));
}

function onboardingItems(): ResetItem[] {
  const marks: { id: string; label: string; detail: string; present: boolean; key: string }[] = [
    {
      id: 'tour',
      label: 'First-run tour',
      detail: `status: ${readTour().status}`,
      present: readTour().status !== 'not-started',
      key: STORAGE_KEY_TOUR,
    },
    {
      id: 'story',
      label: 'Prologue',
      detail: 'the story seen once',
      present: readStorySeen(),
      key: STORY_SEEN_KEY,
    },
    {
      id: 'start-here',
      label: 'Start Here card',
      detail: 'the card you dismissed',
      present: bucket()?.getItem(START_HERE_KEY) === '1',
      key: START_HERE_KEY,
    },
    {
      id: 'first-guide',
      label: 'Editor first guide',
      detail: 'the hint over the editor',
      present: bucket()?.getItem(FIRST_GUIDE_KEY) === '1',
      key: FIRST_GUIDE_KEY,
    },
  ];
  return marks
    .filter((mark) => mark.present)
    .map((mark) => ({
      id: mark.id,
      label: mark.label,
      detail: mark.detail,
      n: 1,
      clear: () => {
        try {
          bucket()?.removeItem(mark.key);
        } catch {
          // Already unreachable: nothing to forget.
        }
      },
    }));
}

function resumeItems(): ResetItem[] {
  const items: ResetItem[] = [];
  const lesson = readLastLessonId();
  if (lesson) {
    items.push({
      id: 'last-lesson',
      label: lesson,
      detail: 'the lesson Continue reopens',
      n: 1,
      clear: () => bucket()?.removeItem(STORAGE_KEY_LAST_LESSON),
    });
  }
  if (readLastVisit()) {
    items.push({
      id: 'last-visit',
      label: 'Last page',
      detail: 'which page a return lands on',
      n: 1,
      clear: () => bucket()?.removeItem(STORAGE_KEY_LAST_VISIT),
    });
  }
  for (const [id, position] of Object.entries(readReadingPositions())) {
    items.push({
      id: `page:${id}`,
      label: id,
      detail: `reading place · ${position.anchor || 'top'} at ${Math.round(position.at)} px`,
      n: 1,
      clear: () => clearReadingPosition(id),
    });
  }
  return items;
}

function checkItems(): ResetItem[] {
  return Object.entries(readChecks())
    .filter(([, lesson]) => lesson.done.length > 0)
    .map(([id, lesson]) => ({
      id: `checks:${id}`,
      label: id,
      detail: `${plural(lesson.done.length, 'ticked item')} in this lesson`,
      n: lesson.done.length,
      clear: () => clearTicks(id),
    }));
}

const ITEM_READERS: Record<ResetAreaId, () => ResetItem[]> = {
  lessons: lessonItems,
  checks: checkItems,
  milestones: milestoneItems,
  awards: awardItems,
  cards: cardItems,
  notes: noteItems,
  drafts: draftItems,
  log: logItems,
  sittings: sittingItems,
  predictions: predictionItems,
  onboarding: onboardingItems,
  resume: resumeItems,
};

/** One part's items, in the order its store holds them. */
export function areaItems(id: ResetAreaId): ResetItem[] {
  return ITEM_READERS[id]?.() ?? [];
}

/** Just the count, for the row's "n items" line without building every label. */
export function areaItemCount(id: ResetAreaId): number {
  return areaItems(id).reduce((total, item) => total + item.n, 0);
}

/**
 * Erase one item, and answer in the shape a whole-part reset uses.
 *
 * The watermark is written here for the same reason `progressReset.ts` writes it: an item that the
 * account also holds (a lesson flag, a milestone, a log day, a draft, a note) must be able to survive
 * the next merge, and a merge that only unions would put it straight back.
 */
export function resetItem(
  areaId: ResetAreaId,
  itemId: string,
  now: number = Date.now()
): ResetReport {
  const area = RESET_AREAS.find((entry) => entry.id === areaId);
  const item = areaItems(areaId).find((entry) => entry.id === itemId);
  const empty: ResetReport = { areas: [], items: 0, progress: false, workspace: false, resetAt: null };
  if (!area || !item || item.n === 0) return empty;

  item.clear();

  const progress = area.group === 'progress';
  const workspace = area.group === 'workspace';
  let resetAt: number | null = null;
  if (progress) {
    resetAt = now;
    try {
      bucket()?.setItem(STORAGE_KEY_RESET_AT, String(now));
      bucket()?.setItem(STORAGE_KEY_PROGRESS_UPDATED, String(now));
    } catch {
      // The item is gone; a browser that refuses these keys only loses the watermark.
    }
  }

  const report: ResetReport = { areas: [area.id], items: item.n, progress, workspace, resetAt };
  announceReset(report);
  return report;
}

/** The keys this module may write, exported so a suite can assert the reading store's shape. */
export { STORAGE_KEY_READING, STORAGE_KEY_SITTINGS, LOG_STORAGE_KEY, PREDICTIONS_KEY };
