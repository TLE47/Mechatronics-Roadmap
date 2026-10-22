/**
 * What a run decided, said out loud (`app/src/announce.ts`).
 *
 * The workbench already had a polite live region, and it said one of two things: *passed*, or *has not
 * passed yet, read the failing line above*. The failing line is drawn, coloured, and sits inside a panel
 * a screen reader has to go and find — so the one part of the page a sighted learner gets for free was
 * the part a screen-reader user had to reconstruct. `docs/PLAN-2.0-GAP.md` lists exactly this: "no
 * screen-reader announcements for run results".
 *
 * The composer is pure and lives here rather than inline in the runner for the usual reason: the
 * interesting inputs (a mismatched line, a harness metric, a traceback, a Stop, a prediction that was
 * skipped) are hard to reach on demand in a browser and trivial to hand to a function.
 *
 * The rules the copy follows:
 *
 * - **One sentence, the verdict first.** A live region interrupts whatever is being read, so the first
 *   words have to be the outcome: `passed`, `has not passed`, `stopped`, `failed`.
 * - **The specific reason, not the advice.** "Read the failing line above" is an instruction coloured
 *   for eyes; here it is the line itself (`expected "…", got "…"`), the harness's own sentence, or the
 *   exception's last line.
 * - **Short.** Anything past `MAX_ANNOUNCEMENT` characters is cut with an ellipsis, and the newlines in
 *   a traceback or a table are collapsed to spaces, because a screen reader reads a line break as a
 *   pause and a forty-line traceback as forty interruptions.
 * - **Nothing to say is nothing.** An untested lesson announces nothing at all rather than an empty
 *   status, which some readers read out as "status".
 */

import type { PredictVerdict } from './predictGate.ts';

export type AnnounceVerdict =
  | 'untested'
  | 'passed'
  | 'mismatch'
  | 'harness_failed'
  | 'behavior_failed'
  | 'error'
  | 'stopped';

export interface PredictionAnnouncement {
  verdict: PredictVerdict;
  matchedLines: number;
  predictedLines: number;
  skipped: boolean;
}

export interface RunAnnouncement {
  lessonId: string;
  verdict: AnnounceVerdict;
  /** The first line where the output differs, when the lesson compares stdout. */
  firstDiff?: { expected: string; actual: string } | null;
  /** The harness's own sentence about the metric that is off (a bench, a budget). */
  harnessSummary?: string | null;
  /** The run's stderr: its last non-empty line is the exception, which is the failing line. */
  stderr?: string | null;
  /** This lesson's prediction, if the gate was answered or skipped in this visit. */
  prediction?: PredictionAnnouncement | null;
}

/** A live region is read aloud: past this it is an interruption, not an announcement. */
export const MAX_ANNOUNCEMENT = 220;
/** How much of a line is quoted before it stops being a quote. */
const MAX_QUOTE = 48;

/** Collapse whitespace and cut on a word boundary, so a traceback reads as a sentence. */
export function condense(text: string, limit = MAX_ANNOUNCEMENT): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= limit) return flat;
  const cut = flat.slice(0, limit - 1);
  const boundary = cut.lastIndexOf(' ');
  return `${(boundary > limit * 0.6 ? cut.slice(0, boundary) : cut).trimEnd()}…`;
}

function quote(line: string): string {
  const flat = line.replace(/\s+/g, ' ').trim();
  return flat.length > MAX_QUOTE ? `${flat.slice(0, MAX_QUOTE - 1).trimEnd()}…` : flat;
}

/** The exception line of a traceback: the last non-empty line, which is what names the failure. */
export function exceptionLine(stderr: string): string {
  const lines = stderr.split('\n').map((line) => line.trim()).filter(Boolean);
  return lines.length ? lines[lines.length - 1] : '';
}

function predictionSentence(prediction: PredictionAnnouncement | null | undefined): string {
  if (!prediction) return '';
  if (prediction.skipped) return ' You ran it without predicting.';
  if (prediction.verdict === 'match') return ' Your prediction was exact.';
  if (prediction.verdict === 'reordered') return ' Your prediction had the right lines in a different order.';
  if (prediction.verdict === 'partial') {
    return ` Your prediction matched ${prediction.matchedLines} of ${prediction.predictedLines} lines.`;
  }
  return ' None of your predicted lines are in the output.';
}

/**
 * The sentence a screen reader hears after a run.
 *
 * Empty for an untested lesson — there is no outcome to announce, and an empty live region is noise.
 */
export function runAnnouncement(run: RunAnnouncement): string {
  const lesson = `Lesson ${run.lessonId}`;
  switch (run.verdict) {
    case 'untested':
      return '';
    case 'passed':
      return condense(
        `${lesson} passed: the output matched and every behaviour check passed.${predictionSentence(
          run.prediction
        )}`
      );
    case 'mismatch': {
      const diff = run.firstDiff;
      const detail = diff
        ? ` the output differs: expected "${quote(diff.expected)}", got "${quote(diff.actual)}".`
        : ' the output does not match the lesson.';
      return condense(`${lesson} has not passed:${detail}${predictionSentence(run.prediction)}`);
    }
    case 'behavior_failed':
      return condense(
        `${lesson} has not passed: a behaviour check failed.${
          run.harnessSummary ? ` ${condense(run.harnessSummary, 120)}` : ''
        }${predictionSentence(run.prediction)}`
      );
    case 'harness_failed':
      return condense(
        `${lesson} has not passed: a graded metric is off target.${
          run.harnessSummary ? ` ${condense(run.harnessSummary, 120)}` : ''
        }${predictionSentence(run.prediction)}`
      );
    case 'error': {
      const line = run.stderr ? exceptionLine(run.stderr) : '';
      return condense(
        `${lesson} failed to run: ${line || 'the program raised an error'}.${predictionSentence(
          run.prediction
        )}`
      );
    }
    case 'stopped':
      return condense(`${lesson} was stopped. Your code is preserved.${predictionSentence(run.prediction)}`);
    default:
      return '';
  }
}

/** The prediction verdict on its own, for when the gate answers before the run exists. */
export function predictionAnnouncement(prediction: PredictionAnnouncement): string {
  if (prediction.skipped) return 'Prediction skipped.';
  if (prediction.verdict === 'match') return 'Prediction exact.';
  if (prediction.verdict === 'reordered') return 'Prediction has the right lines in a different order.';
  if (prediction.verdict === 'partial') {
    return `Prediction matched ${prediction.matchedLines} of ${prediction.predictedLines} lines.`;
  }
  return 'No predicted line is in the output.';
}
