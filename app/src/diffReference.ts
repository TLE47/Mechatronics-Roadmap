import { snapshotAgeLabel, verdictLabel, type DraftSnapshot } from './draftHistory.ts';

/**
 * What the Diff panel compares the editor against.
 *
 * The panel shipped with two references — the starter, and the solution once that is earned — and
 * `docs/PLAN-2.0-GAP.md` named the third as missing: *"no diff against a filed version."* A filed
 * version is the code a Run started from (`draftHistory.ts`), so it answers the question the other
 * two cannot: **what have I changed since the run that passed, or the one that failed?** The starter
 * is a fixed origin nobody edits, and the solution is an answer; the learner's own last attempt is
 * the one reference that describes their work.
 *
 * Two rules are here rather than in the panel, because both are wrong in a way a screen would hide:
 *
 *  - **A target that is not a reference falls back to the starter, it never blanks the panel.** The
 *    history is capped at five versions and can be cleared from the History panel or replaced by a
 *    restore, so `run:3` can stop existing while the diff is open. Reading it as the starter keeps the
 *    panel honest (it says which reference it used) instead of drawing an empty diff of nothing.
 *  - **The solution stays unreadable until it is earned.** The panel disables that button, but the
 *    rule belongs with the reference: a lock that lives only in a `disabled` attribute is one
 *    keystroke away from being bypassed.
 */

/** `run:<index>` names a filed version by its position in the lesson's history, newest first. */
export type DiffTarget = 'starter' | 'solution' | `run:${number}`;

export const RUN_TARGET_PREFIX = 'run:';

/** The lesson's three possible references, as the panel holds them. */
export interface DiffSource {
  starter: string;
  solution: string;
  solutionUnlocked: boolean;
  /** The lesson's filed runs, newest first — the same list the History panel restores from. */
  history: DraftSnapshot[];
}

export interface DiffReference {
  /** The text the editor is compared against. */
  code: string;
  /** What the panel calls this reference: `starter`, `solution`, `run 3 min ago · passed`. */
  label: string;
  /** True when the target named something this lesson no longer has and the starter stood in. */
  fellBack: boolean;
}

/** The target id for the nth filed version. */
export function runTarget(index: number): DiffTarget {
  return `${RUN_TARGET_PREFIX}${index}`;
}

export function isDiffTarget(value: string): value is DiffTarget {
  return value === 'starter' || value === 'solution' || /^run:\d+$/.test(value);
}

/**
 * The text, the label and the fallback for a target.
 *
 * `now` is a parameter so the label's age is pinned by a test rather than by the clock the test runs
 * on; the panel passes nothing and gets the real one.
 */
export function resolveDiffReference(
  target: DiffTarget,
  source: DiffSource,
  now: number = Date.now()
): DiffReference {
  if (target === 'solution') {
    return source.solutionUnlocked
      ? { code: source.solution, label: 'solution', fellBack: false }
      : { code: source.starter, label: 'starter', fellBack: true };
  }
  if (target.startsWith(RUN_TARGET_PREFIX)) {
    const index = Number(target.slice(RUN_TARGET_PREFIX.length));
    const version = Number.isInteger(index) ? source.history[index] : undefined;
    if (!version) return { code: source.starter, label: 'starter', fellBack: true };
    return {
      code: version.code,
      label: `run ${snapshotAgeLabel(version.at, now)} · ${verdictLabel(version.outcome)}`,
      fellBack: false,
    };
  }
  return { code: source.starter, label: 'starter', fellBack: false };
}

/**
 * What the panel says when there is nothing to report, worded for the reference that was used.
 *
 * The starter's line is the smallest honest sentence about an untouched file; every other reference
 * is named, because "unchanged" against the solution or against last night's run is good news a
 * learner should be able to read at a glance.
 */
export function diffSameMessage(target: DiffTarget, reference: DiffReference): string {
  if (target === 'starter') return 'The starter, unchanged — nothing written yet.';
  return `The ${reference.label}, unchanged.`;
}
