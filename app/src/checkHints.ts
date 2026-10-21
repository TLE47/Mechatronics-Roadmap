// Type-only, and the `.ts` extension is for Node's type stripping (`scripts/test_check_hints.mjs`):
// the card's wording and the ladder's gate are tested as functions, not through a browser.
import type { PythonLessonItem } from './data/pythonLessonsData.ts';

/**
 * The two checks a run reports, and the hint rung each one sends a learner to.
 *
 * The workbench already grades a run twice - behavioural tests decide whether the code is right,
 * the presentation check decides whether the printed lines are - and the ladder already counts
 * rungs. What was missing is the join: a failed run said *which* check failed and the ladder sat
 * beside it as a separate control, so a learner had to guess which nudge answered the red line.
 *
 * The rung a check names is rung 1 on every page, and that is a rule rather than a shortcut:
 *
 * - rung 1 is the concept nudge, written to name the line to change without giving the answer, so
 *   it is safe to open from a failure card;
 * - rung 2 is the formula or code block, close enough to the solution that handing it over because
 *   one `print` was mis-formatted would teach the wrong thing. It is earned by trying again after
 *   the nudge (`hintGate`), never by a check.
 *
 * So the card's job is to say "this check, that rung, and no further" - the specificity the gap
 * page asked for - while the ladder keeps its own pacing intact.
 */
export type CheckId = 'behaviour' | 'presentation';

export interface FailingCheck {
  /** Stable id: the panel badge and the browser suite address the card by it. */
  id: CheckId;
  /** What failed, in the words the panel has always used for that badge. */
  title: string;
  /** The check's own line: the instructor's assertion, or the output line that differs. */
  detail: string;
  /** 1-based rung that answers it; 0 when the lesson carries no hints at all. */
  hint: number;
  /** Why a learner should open that rung, in one sentence - the card's body, not a tooltip. */
  why: string;
}

/** The rung of a lesson's ladder that answers a check; 0 when there is no ladder to point at. */
export function hintForCheck(hintCount: number): number {
  return hintCount > 0 ? 1 : 0;
}

/**
 * The line a learner can act on from an instructor test's failure.
 *
 * Two shapes arrive here: an assertion's own message (`assertion_message`) and a traceback whose
 * last line is the exception. The assertion text is the useful one - it already carries expected
 * and got - so it is returned with its `AssertionError: ` prefix stripped, and an empty string
 * means "the worker said nothing usable", which the card replaces with its generic line rather
 * than printing a bare word like `None`.
 */
export function assertionLine(error: string): string {
  const lines = String(error ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return '';
  // An assertion's expected/got sentence is first when the worker hands back only the message, and
  // last when it hands back a traceback - where a middle line would be a `File "...", line 7`
  // frame, which tells a learner nothing. Those two positions are the whole rule.
  const last = lines[lines.length - 1];
  const picked = /^(?:AssertionError|Assertion Failed)/i.test(last) ? last : lines[0];
  return picked.replace(/^(?:AssertionError|Assertion Failed)\s*:\s*/i, '').trim();
}

export interface FailingCheckInput {
  /** The runner's verdict for the last run. */
  passStatus: string;
  /** The instructor's own failure text, when the run reached the checks. */
  instructorError: string;
  /** 1-based line where the printed output first differs, or null when it agrees. */
  firstDiffLine: number | null;
  /** How many hints the lesson carries. */
  hintCount: number;
}

/**
 * The checks a failed run leaves unproven, each with the rung that answers it.
 *
 * Only the two graded checks report here. A `harness_failed` capstone, an `error`, and a `stopped`
 * run have their own cards, because none of them is the behavioural check failing on a value: the
 * harness names a metric, Python names a line, and the stop names a loop. Sending those to a hint
 * would be guessing about which of the three the learner actually hit.
 */
export function failingChecks({
  passStatus,
  instructorError,
  firstDiffLine,
  hintCount,
}: FailingCheckInput): FailingCheck[] {
  const hint = hintForCheck(hintCount);
  const checks: FailingCheck[] = [];

  if (passStatus === 'behavior_failed') {
    checks.push({
      id: 'behaviour',
      title: 'Behavioural check failed',
      detail:
        assertionLine(instructorError) ||
        'the instructor tests ran your functions on inputs the starter never sees',
      hint,
      why:
        hint > 0
          ? 'Hint 1 is the one for this check: it names the line to change, not the answer.'
          : 'No hint ladder on this entry - the message above is the whole diagnosis.',
    });
  }

  if (passStatus === 'mismatch') {
    checks.push({
      id: 'presentation',
      title: 'Presentation check failed',
      detail:
        firstDiffLine === null
          ? 'your printed lines do not match the Expected Output'
          : `line ${firstDiffLine} of your output differs from the Expected Output`,
      hint,
      why:
        hint > 0
          ? 'The Expected Output panel is the exact answer here; Hint 1 names the line that prints it.'
          : 'The Expected Output panel is the exact answer here.',
    });
  }

  return checks;
}

export interface HintGate {
  /** Rungs open on screen. */
  revealed: number;
  /** Rungs the lesson carries. */
  hintCount: number;
  /** Completed runs on this lesson. */
  attempts: number;
  /**
   * Runs that had already finished when rung 1 was first opened, or null while it is still closed.
   * This is what makes rung 2 *earned*: the nudge was read at that attempt, so the next rung waits
   * for an attempt that came after it.
   */
  openedAt: number | null;
}

export type HintLock = 'none' | 'no-attempt' | 'stale-attempt';

/** Whether the next rung of the ladder may be opened now. */
export function hintLock(gate: HintGate): HintLock {
  if (gate.revealed >= gate.hintCount) return 'none';
  // Rung 1 needs nothing: it is a nudge, and a learner may read it before running.
  if (gate.revealed === 0) return 'none';
  if (gate.attempts === 0) return 'no-attempt';
  // A page whose rung 1 was never opened keeps the old rule - one run is enough - because there is
  // no nudge on screen for the learner to have tried yet.
  if (gate.openedAt !== null && gate.attempts <= gate.openedAt) return 'stale-attempt';
  return 'none';
}

/** The next rung's number, for a button that must name what it would open. */
export function nextRung(gate: HintGate): number {
  return Math.min(gate.revealed + 1, gate.hintCount);
}

/** The hint rung that is open on screen for a check's number, if any. */
export function rungAnswersCheck(rung: number, checks: FailingCheck[]): boolean {
  return checks.some((check) => check.hint === rung);
}

/** How many rungs a lesson offers; a card never names one that does not exist. */
export function hintCountFor(lesson: PythonLessonItem): number {
  return Array.isArray(lesson.hints) ? lesson.hints.length : 0;
}
