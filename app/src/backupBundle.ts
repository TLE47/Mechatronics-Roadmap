/**
 * The backup and its merge back in (`app/src/backupBundle.ts`).
 *
 * What is in a backup: the seven stores a learner's work actually lives in — the three progress maps,
 * the drafts, the versions filed by each Run, the study notes and highlights, the review cards'
 * schedules, and the learning log — plus a manifest and a README for whoever opens the zip in ten
 * years. Preferences are deliberately
 * left out: a theme is a device choice, not work, and restoring one onto another machine would fight
 * the learner's own pick.
 *
 * What a restore does: **merges, never deletes.** Progress flags union, so a milestone ticked on a
 * laptop survives arriving on a desktop that has not seen it. Drafts fill gaps only — the text on this
 * machine is by definition the newer one, so it wins. Versions union and are deduped by the timestamp
 * they were filed at. Notes follow the same rule as drafts, and highlights union by the passage they
 * quote, the newer comment winning. Card schedules follow the more-reviewed copy, so restoring a
 * backup cannot un-learn a card. The log unions by event identity, the same rule cloud sync uses
 * (`mergeLearningLog`), because the two merges must not disagree about what one event is.
 *
 * Every write goes through the store's own writer (`saveDraft`, `recordSnapshot`, `replaceLearningLog`)
 * rather than a raw `setItem`: those functions carry each store's own caps and merge rules, and a
 * restore that bypassed them could put the bucket over quota and take the editor down with it. The
 * study writer reports a refused write, which the report carries rather than counting notes it did not
 * store.
 *
 * Reads and writes the browser's `localStorage` through those modules, so `scripts/test_backup.mjs`
 * runs it under Node with a `happy-dom` window and no React.
 */

import { createZip, fromUtf8, readZip, utf8, zipFailureMessage } from './backupZip.ts';
import { mergeHistory, readHistory } from './draftHistory.ts';
import { readDraft, readDrafts, saveDraft } from './lessonDraft.ts';
import { readLearningLog, replaceLearningLog, type LearningEvent } from './learningLog.ts';
import { mergeStudy, parseStudy, readStudy, replaceStudy, studyCounts } from './studyNotes.ts';
import { mergeCards, parseCards, readCardList, readCards, replaceCards } from './studyCards.ts';
import { mergeLearningLog } from './progressMerge.ts';
import {
  STORAGE_KEY_COMPLETED,
  STORAGE_KEY_MILESTONES,
  STORAGE_KEY_VERIFIED,
  mergeFlagMap,
  readFlagMap,
} from './progressKeys.ts';

export const BACKUP_SCHEMA = 'mechalab.backup/1';
export const BACKUP_MANIFEST_FILE = 'manifest.json';
export const BACKUP_README_FILE = 'README.txt';
/** A zip of everything this app can hold is under 2 MB; 25 MB is a wrong file, not a big backup. */
export const MAX_BACKUP_BYTES = 25_000_000;
/** Fired after a restore writes, so every surface holding a copy re-reads it instead of going stale. */
export const STORE_RESTORED_EVENT = 'mechalab:store-restored';

export interface BackupCounts {
  verified: number;
  completed: number;
  milestones: number;
  drafts: number;
  snapshots: number;
  notes: number;
  highlights: number;
  /** Review cards that currently exist: a commented highlight is one, scheduled or not. */
  cards: number;
  events: number;
}

export interface BackupFile {
  name: string;
  text: string;
}

export interface BackupManifest {
  schema: typeof BACKUP_SCHEMA;
  app: string;
  createdAt: string;
  counts: BackupCounts;
  files: { name: string; bytes: number }[];
}

export interface RestoreReport extends BackupCounts {
  /** Backup files the reader could not understand; they were skipped, not imported as junk. */
  skipped: string[];
  /** How many entries the archive held, including the manifest and the README. */
  files: number;
}

export type RestoreResult = { ok: true; report: RestoreReport } | { ok: false; message: string };

function countFlags(flags: Record<string, boolean>): number {
  return Object.values(flags).filter(Boolean).length;
}

function currentCounts(): BackupCounts {
  const history = readHistory();
  const study = studyCounts();
  return {
    verified: countFlags(readFlagMap(STORAGE_KEY_VERIFIED)),
    completed: countFlags(readFlagMap(STORAGE_KEY_COMPLETED)),
    milestones: countFlags(readFlagMap(STORAGE_KEY_MILESTONES)),
    drafts: Object.keys(readDrafts()).length,
    snapshots: Object.values(history).reduce((total, versions) => total + versions.length, 0),
    notes: study.notes,
    highlights: study.highlights,
    cards: readCardList().length,
    events: readLearningLog().length,
  };
}

/** A size a person reads without arithmetic: `48 kB`, `1.7 MB`. */
export function formatBackupSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} kB`;
  return `${Math.round(bytes)} B`;
}

const README = `MechaLab Workbench — a backup of your work
==========================================

Everything in this zip was produced by this browser and, until you handed it over,
never left it. There is no account in these files and no server behind them.

Files
-----
manifest.json       What this backup holds: the counts, the date, the file list.
progress.json       Lessons you ran to a verdict, lessons you marked yourself, milestones.
drafts.json         The unfinished editor text for each lesson you were working on.
history.json        The versions each Run filed, with the verdict that run got.
study.json          Your notes and the passages you highlighted, per lesson.
study-cards.json    When each review card is due, and how many times you have answered it.
learning-log.json   When you opened, ran, passed, and used a hint - the pilot record.
README.txt          This page.

How to restore
--------------
Open MechaLab, press "Restore (.zip)" in the header, and choose this file exactly as
it was downloaded. Do not unzip and re-zip it first: most tools switch the archive to
deflate compression, which this app does not read (it says so rather than guessing).

A restore merges. It never deletes: flags you have already set stay set, drafts and
notes you have already written are kept, and versions, highlights and log events are
added only once. A card schedule travels with the more-reviewed copy, so restoring a
backup cannot send a card you have been practising backwards.
`;

/**
 * The backup's files, in the order they are written.
 *
 * `now` is injected so a test can pin the timestamp and compare a whole archive byte for byte.
 */
export function collectBackup(now: number = Date.now()): BackupFile[] {
  const counts = currentCounts();
  const progress: BackupFile = {
    name: 'progress.json',
    text: JSON.stringify(
      {
        schema: 'mechalab.backup.progress/1',
        verifiedLessons: readFlagMap(STORAGE_KEY_VERIFIED),
        completedLessons: readFlagMap(STORAGE_KEY_COMPLETED),
        completedMilestones: readFlagMap(STORAGE_KEY_MILESTONES),
      },
      null,
      2
    ),
  };
  const drafts: BackupFile = {
    name: 'drafts.json',
    text: JSON.stringify({ schema: 'mechalab.backup.drafts/1', drafts: readDrafts() }, null, 2),
  };
  const history: BackupFile = {
    name: 'history.json',
    text: JSON.stringify({ schema: 'mechalab.backup.history/1', history: readHistory() }, null, 2),
  };
  const study: BackupFile = {
    name: 'study.json',
    text: JSON.stringify({ schema: 'mechalab.backup.study/1', study: readStudy() }, null, 2),
  };
  const cards: BackupFile = {
    name: 'study-cards.json',
    text: JSON.stringify({ schema: 'mechalab.backup.study-cards/1', cards: readCards() }, null, 2),
  };
  const log: BackupFile = {
    name: 'learning-log.json',
    text: JSON.stringify(
      { schema: 'mechalab.backup.learning-log/1', events: readLearningLog() },
      null,
      2
    ),
  };
  const data: BackupFile[] = [progress, drafts, history, study, cards, log];
  const manifest: BackupManifest = {
    schema: BACKUP_SCHEMA,
    app: 'MechaLab Workbench',
    createdAt: new Date(now).toISOString(),
    counts,
    files: [...data, { name: BACKUP_README_FILE, text: README }].map((file) => ({
      name: file.name,
      bytes: utf8(file.text).length,
    })),
  };
  return [
    { name: BACKUP_MANIFEST_FILE, text: JSON.stringify(manifest, null, 2) },
    ...data,
    { name: BACKUP_README_FILE, text: README },
  ];
}

/** `mechalab-backup-2026-10-21.zip` — dated, so a folder of them sorts. */
export function backupFileName(now: number = Date.now()): string {
  return `mechalab-backup-${new Date(now).toISOString().slice(0, 10)}.zip`;
}

function zipFiles(files: BackupFile[], now: number): Uint8Array {
  return createZip(
    files.map((file) => ({ name: file.name, data: utf8(file.text) })),
    new Date(now)
  );
}

/** The archive itself, ready for a `Blob`. */
export function createBackupZip(now: number = Date.now()): Uint8Array {
  return zipFiles(collectBackup(now), now);
}

/**
 * One press: the archive, its file name, and the sentence to show afterwards.
 *
 * The summary comes from the manifest that was just written, not from a second read of the stores, so
 * the number the learner sees is the number in the file they now hold.
 */
export function prepareBackup(now: number = Date.now()): {
  fileName: string;
  bytes: Uint8Array;
  summary: string;
} {
  const files = collectBackup(now);
  const manifest = JSON.parse(files[0].text) as BackupManifest;
  const bytes = zipFiles(files, now);
  return {
    fileName: backupFileName(now),
    bytes,
    summary: backupSummary(manifest.counts, bytes.length),
  };
}

/** `Backed up · 3 verified · 1 draft · 48 kB`. */
export function backupSummary(counts: BackupCounts, bytes: number): string {
  const parts = [
    counts.verified ? `${counts.verified} verified` : '',
    counts.completed ? `${counts.completed} self-marked` : '',
    counts.milestones ? `${counts.milestones} milestone${counts.milestones === 1 ? '' : 's'}` : '',
    counts.drafts ? `${counts.drafts} draft${counts.drafts === 1 ? '' : 's'}` : '',
    counts.notes ? `${counts.notes} note${counts.notes === 1 ? '' : 's'}` : '',
    counts.highlights ? `${counts.highlights} highlight${counts.highlights === 1 ? '' : 's'}` : '',
    counts.cards ? `${counts.cards} card${counts.cards === 1 ? '' : 's'}` : '',
    counts.events ? `${counts.events} log event${counts.events === 1 ? '' : 's'}` : '',
  ].filter(Boolean);
  return `Backed up · ${[...parts, formatBackupSize(bytes)].join(' · ')}`;
}

/** What a restore changed, in the same vocabulary the rest of the app uses. */
export function restoreSummary(report: RestoreReport): string {
  const parts = [
    report.verified ? `${report.verified} lesson${report.verified === 1 ? '' : 's'} verified` : '',
    report.completed ? `${report.completed} self-marked` : '',
    report.milestones ? `${report.milestones} milestone${report.milestones === 1 ? '' : 's'}` : '',
    report.drafts ? `${report.drafts} draft${report.drafts === 1 ? '' : 's'}` : '',
    report.snapshots ? `${report.snapshots} saved version${report.snapshots === 1 ? '' : 's'}` : '',
    report.notes ? `${report.notes} note${report.notes === 1 ? '' : 's'}` : '',
    report.highlights ? `${report.highlights} highlight${report.highlights === 1 ? '' : 's'}` : '',
    report.cards ? `${report.cards} card ${report.cards === 1 ? 'schedule' : 'schedules'} merged` : '',
    report.events ? `${report.events} log event${report.events === 1 ? '' : 's'}` : '',
  ].filter(Boolean);
  const skipped = report.skipped.length ? ` · skipped ${report.skipped.join(', ')}` : '';
  if (!parts.length) return `Nothing new in that backup — this browser already has it all${skipped}`;
  return `Restored · ${parts.join(' · ')}${skipped}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseJson(text: string | undefined): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** The flags an untrusted file claims, keeping only the ones that are actually `true`. */
function readFlagFile(value: unknown): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  const record = asRecord(value);
  if (!record) return flags;
  for (const [id, done] of Object.entries(record)) if (done === true) flags[id] = true;
  return flags;
}

function countNewIds(before: Record<string, boolean>, after: Record<string, boolean>): number {
  return Object.keys(after).filter((id) => !before[id]).length;
}

function restoreProgress(text: string | undefined, report: RestoreReport): void {
  const file = asRecord(parseJson(text));
  if (!file) {
    report.skipped.push('progress.json');
    return;
  }
  const maps: [string, unknown][] = [
    [STORAGE_KEY_VERIFIED, file.verifiedLessons],
    [STORAGE_KEY_COMPLETED, file.completedLessons],
    [STORAGE_KEY_MILESTONES, file.completedMilestones],
  ];
  const added = maps.map(([key, value]) => {
    const before = readFlagMap(key);
    const merged = mergeFlagMap(key, readFlagFile(value));
    return countNewIds(before, merged);
  });
  report.verified += added[0];
  report.completed += added[1];
  report.milestones += added[2];
}

function restoreDrafts(text: string | undefined, report: RestoreReport): void {
  const file = asRecord(parseJson(text));
  const drafts = asRecord(file?.drafts);
  if (!drafts) {
    report.skipped.push('drafts.json');
    return;
  }
  for (const [id, code] of Object.entries(drafts)) {
    if (typeof code !== 'string' || !code.trim()) continue;
    // This browser's text is the one being edited; a backup only fills a lesson it has nothing for.
    if (readDraft(id) !== null) continue;
    saveDraft(id, code);
    if (readDraft(id) !== null) report.drafts += 1;
  }
}

function restoreHistory(text: string | undefined, report: RestoreReport): void {
  const file = asRecord(parseJson(text));
  const history = asRecord(file?.history);
  if (!history) {
    report.skipped.push('history.json');
    return;
  }
  const incoming: Parameters<typeof mergeHistory>[0] = {};
  for (const [id, versions] of Object.entries(history)) {
    if (!Array.isArray(versions)) continue;
    incoming[id] = versions
      .map((version) => asRecord(version))
      .filter((version): version is Record<string, unknown> => Boolean(version))
      .filter((version) => typeof version.code === 'string' && typeof version.at === 'number')
      .map((version) => ({
        code: version.code as string,
        at: version.at as number,
        outcome: typeof version.outcome === 'string' ? version.outcome : 'untested',
      }));
  }
  report.snapshots += mergeHistory(incoming).added;
}

/**
 * Merge a restore's notes and highlights in.
 *
 * The file is parsed through the store's own reader, so a hand-edited entry that is not a quote and a
 * number is dropped rather than written back into the bucket. The merge decides what is new; nothing
 * here deletes, and a highlight already kept on this machine stays as it is.
 */
function restoreStudy(text: string | undefined, report: RestoreReport): void {
  const file = asRecord(parseJson(text));
  const raw = asRecord(file?.study);
  if (!raw) {
    report.skipped.push('study.json');
    return;
  }
  const incoming = parseStudy(JSON.stringify(raw));
  const { store, addedNotes, addedHighlights } = mergeStudy(readStudy(), incoming);
  if (addedNotes || addedHighlights) {
    // The merge happens in memory; the report counts what actually landed. A bucket that refuses the
    // write keeps nothing new, and saying "restored" would send the learner looking for a note that
    // is not there.
    if (!replaceStudy(store)) {
      report.skipped.push('study.json (the store refused the write)');
      return;
    }
    report.notes += addedNotes;
    report.highlights += addedHighlights;
  }
}

/**
 * Merge a restored deck in.
 *
 * A backup taken before cards existed has no such file at all: that is an older backup, not a
 * corrupt one, so the absence is silent. `mergeCards` keeps the more-reviewed schedule, which is
 * what makes a restore safe to repeat and impossible to use to send a card backwards.
 */
function restoreCards(text: string | undefined, report: RestoreReport): void {
  if (text === undefined) return;
  const file = asRecord(parseJson(text));
  if (!file) {
    report.skipped.push('study-cards.json');
    return;
  }
  const incoming = parseCards(JSON.stringify(asRecord(file.cards) ?? {}));
  const { store, added, updated } = mergeCards(readCards(), incoming);
  if (added || updated) replaceCards(store);
  report.cards += added + updated;
}

function restoreLog(text: string | undefined, report: RestoreReport): void {
  const file = asRecord(parseJson(text));
  const events = Array.isArray(file?.events) ? (file?.events as unknown[]) : null;
  if (!events) {
    report.skipped.push('learning-log.json');
    return;
  }
  const incoming = events
    .map((event) => asRecord(event))
    .filter((event): event is Record<string, unknown> => Boolean(event))
    .filter((event) => typeof event.t === 'number' && typeof event.kind === 'string')
    .map((event) => event as unknown as LearningEvent);
  const local = readLearningLog();
  const merged = mergeLearningLog(local, incoming);
  replaceLearningLog(merged);
  report.events += Math.max(0, merged.length - local.length);
}

/**
 * Read a chosen file and merge it in.
 *
 * The manifest is the gate: a zip without one, or with another schema, is not this app's backup, and
 * saying so is better than importing whatever keys happen to look familiar in it.
 */
export function restoreBackupZip(bytes: Uint8Array): RestoreResult {
  if (!bytes || bytes.length === 0) return { ok: false, message: 'That file is empty' };
  if (bytes.length > MAX_BACKUP_BYTES) {
    return {
      ok: false,
      message: `That file is ${formatBackupSize(bytes.length)} — far larger than a MechaLab backup`,
    };
  }
  const read = readZip(bytes);
  if (!read.ok) return { ok: false, message: zipFailureMessage(read.reason) };

  const contents = new Map<string, string>();
  for (const entry of read.entries) contents.set(entry.name, fromUtf8(entry.data));

  const manifest = asRecord(parseJson(contents.get(BACKUP_MANIFEST_FILE)));
  if (!manifest || manifest.schema !== BACKUP_SCHEMA) {
    return { ok: false, message: zipFailureMessage('not-a-zip') };
  }

  const report: RestoreReport = {
    verified: 0,
    completed: 0,
    milestones: 0,
    drafts: 0,
    snapshots: 0,
    notes: 0,
    highlights: 0,
    cards: 0,
    events: 0,
    skipped: [],
    files: read.entries.length,
  };
  restoreProgress(contents.get('progress.json'), report);
  restoreDrafts(contents.get('drafts.json'), report);
  restoreHistory(contents.get('history.json'), report);
  restoreStudy(contents.get('study.json'), report);
  restoreCards(contents.get('study-cards.json'), report);
  restoreLog(contents.get('learning-log.json'), report);
  return { ok: true, report };
}
