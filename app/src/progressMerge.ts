/**
 * The pure half of cloud sync: merging two progress snapshots.
 *
 * It imports nothing but a type, so `scripts/test_progress_merge.mjs` can run it under
 * `node --experimental-strip-types` without a browser, a network or a Supabase project.
 *
 * The merge rule is "never lose work, but let an uncheck stick":
 *  - a flag true on either side stays true (one device's completions survive a stale upload);
 *  - a flag the NEWER snapshot sets to false is removed (un-ticking a milestone is a decision);
 *  - the learning log is the union, de-duplicated and ordered by timestamp.
 *
 * The one thing that outranks all three is a reset (`resetAt`, written by `progressReset.ts`). An empty
 * map is indistinguishable from "this device has nothing to say", so the ordinary rule unions an old
 * account's flags straight back into a browser that just erased them — the reset would undo itself at
 * the next sign-in, silently. A snapshot whose reset is at least as new as the other side's last change
 * therefore wins outright: its maps are taken as they are (stored falses dropped, since a false is not
 * work) and its log is the log. A reset older than the other side's change loses, which is the case
 * that must keep a second device's newer work alive.
 */

import type { LearningEvent } from './learningLog';

export const PROGRESS_SCHEMA = 'mechalab.progress/1';

export interface ProgressMaps {
  verifiedLessons: Record<string, boolean>;
  completedLessons: Record<string, boolean>;
  completedMilestones: Record<string, boolean>;
}

export interface ProgressSnapshot extends ProgressMaps {
  schema: typeof PROGRESS_SCHEMA;
  /** When either side last changed a flag; orders the merge and nothing else. */
  updatedAt: number;
  learningLog: LearningEvent[];
  /**
   * When this browser last erased progress, if it ever did. Absent or 0 on a snapshot that never was
   * reset, which is every snapshot written before this field existed — an older reader ignores it.
   */
  resetAt?: number;
}

export function emptyProgress(): ProgressSnapshot {
  return {
    schema: PROGRESS_SCHEMA,
    updatedAt: 0,
    resetAt: 0,
    verifiedLessons: {},
    completedLessons: {},
    completedMilestones: {},
    learningLog: [],
  };
}

function mergeFlags(
  older: Record<string, boolean>,
  newer: Record<string, boolean>
): Record<string, boolean> {
  const merged: Record<string, boolean> = {};
  for (const [id, done] of Object.entries(older)) {
    if (done) merged[id] = true;
  }
  for (const [id, done] of Object.entries(newer)) {
    if (done) merged[id] = true;
    else delete merged[id];
  }
  return merged;
}

/** A map as a reset leaves it: the ticks that remain, and no stored falses. */
function flagsOnly(flags: Record<string, boolean>): Record<string, boolean> {
  const kept: Record<string, boolean> = {};
  for (const [id, done] of Object.entries(flags)) if (done) kept[id] = true;
  return kept;
}

function eventKey(event: LearningEvent): string {
  return [event.t, event.kind, event.lesson ?? '', event.outcome ?? '', event.level ?? ''].join('|');
}

export function mergeLearningLog(a: LearningEvent[], b: LearningEvent[]): LearningEvent[] {
  const byKey = new Map<string, LearningEvent>();
  for (const event of [...a, ...b]) byKey.set(eventKey(event), event);
  return [...byKey.values()].sort((x, y) => x.t - y.t);
}

/** Merge local and cloud snapshots. Neither side is mutated. */
export function mergeProgress(local: ProgressSnapshot, remote: ProgressSnapshot): ProgressSnapshot {
  const localIsNewer = local.updatedAt >= remote.updatedAt;
  const older = localIsNewer ? remote : local;
  const newer = localIsNewer ? local : remote;
  // A reset only speaks for the work that existed when it happened. Anything the other side changed
  // after it is newer than the reset and is merged by the ordinary rule instead of being dropped.
  const resetAt = newer.resetAt ?? 0;
  const resetWins = resetAt > 0 && resetAt >= older.updatedAt;
  return {
    schema: PROGRESS_SCHEMA,
    updatedAt: Math.max(local.updatedAt, remote.updatedAt),
    resetAt: Math.max(local.resetAt ?? 0, remote.resetAt ?? 0),
    verifiedLessons: resetWins
      ? flagsOnly(newer.verifiedLessons)
      : mergeFlags(older.verifiedLessons, newer.verifiedLessons),
    completedLessons: resetWins
      ? flagsOnly(newer.completedLessons)
      : mergeFlags(older.completedLessons, newer.completedLessons),
    completedMilestones: resetWins
      ? flagsOnly(newer.completedMilestones)
      : mergeFlags(older.completedMilestones, newer.completedMilestones),
    learningLog: resetWins
      ? [...newer.learningLog]
      : mergeLearningLog(local.learningLog, remote.learningLog),
  };
}

/** Reject anything that is not a snapshot this build understands (an older or hand-edited blob). */
export function isProgressSnapshot(value: unknown): value is ProgressSnapshot {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ProgressSnapshot>;
  return (
    candidate.schema === PROGRESS_SCHEMA &&
    typeof candidate.updatedAt === 'number' &&
    (candidate.resetAt === undefined || typeof candidate.resetAt === 'number') &&
    typeof candidate.verifiedLessons === 'object' &&
    typeof candidate.completedLessons === 'object' &&
    typeof candidate.completedMilestones === 'object' &&
    Array.isArray(candidate.learningLog)
  );
}
