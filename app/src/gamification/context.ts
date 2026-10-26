/**
 * What the learner has actually done, as the reward rules read it (`gamification/context.ts`).
 *
 * A pure function of the stores' contents rather than a store of its own: the counts cannot drift
 * from the flags and the log, because they *are* those flags and that log.
 *
 * The one shortcut taken here is deliberate and documented: "matched prediction" is read from the
 * prediction store, which judges the verdict when the learner commits — that is the behaviour the
 * Predicted mark is for, and it is the only evidence of a committed prediction the app keeps.
 */
import { verifiedMissionCount } from './missions.ts';
import { practiceWeekRun } from './nightShifts.ts';
import type { AwardContext } from './rewards.ts';
import { REWARDS } from '../content/loader.ts';

/** The two fields of a learning-log entry this module needs; the log's full shape is not. */
export interface LoggedActivity {
  t: number;
  kind: string;
}

export interface ContextInput {
  verified: Record<string, boolean>;
  events: readonly LoggedActivity[];
  /** Predictions the learner committed to that matched — `verdict: 'match'`, not skipped. */
  matchedPredictions?: number;
  /** Failures fixed after the diagnostic card was opened. */
  diagnosticFixes?: number;
  /** Faults repaired in a fault call. */
  faultRepairs?: number;
  /** Behaviour stamps the lesson's own evidence recorded, by rule id. */
  marks?: Record<string, number>;
  now?: number;
}

/** The award rules' view of the world, from the same stores the workbench writes. */
export function awardContextFor(input: ContextInput): AwardContext {
  const now = input.now ?? Date.now();
  return {
    checkpoints: Object.values(input.verified).filter(Boolean).length,
    missionsVerified: verifiedMissionCount(input.verified),
    predictions: Math.max(0, Math.floor(input.matchedPredictions ?? 0)),
    diagnosticFixes: Math.max(0, Math.floor(input.diagnosticFixes ?? 0)),
    faultRepairs: Math.max(0, Math.floor(input.faultRepairs ?? 0)),
    practiceWeeks: practiceWeekRun(
      input.events,
      now,
      REWARDS.nightShifts.defaultTarget,
      REWARDS.nightShifts.weekStartsOn
    ),
    marks: input.marks ?? {},
  };
}
