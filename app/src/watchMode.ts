/**
 * Watch mode: the checks re-run after an edit, without pressing anything (`app/src/watchMode.ts`).
 *
 * The plan's row is "checks as a test runner + watch mode", and the runner half shipped long ago: a
 * run grades behaviour and output and names the check that is red. What was missing is the loop a
 * code editor trains — change a line, see the verdict change — and the cost of not having it is
 * specific: a beginner fixes one TODO, presses Run, reads, fixes the next, presses again, and the
 * pressing is what they think about instead of the program.
 *
 * Three rules, because an automatic run is a machine spending the learner's attention:
 *
 * 1. **Only after a graded failure.** Watch mode is for the fix loop: last run red, edit, re-run.
 *    Never on a first visit (nothing to watch yet), never after a pass (the loop is done), never on a
 *    runtime error or a stopped run — a syntax error is usually mid-typing and a Stop is the learner
 *    saying *no*, so re-running either would be the machine arguing with them.
 * 2. **Nothing is re-run unless the text changed.** The runner holds the code its last run started
 *    from; an identical buffer means the answer cannot differ, and a `watchDecision` of `wait` is how
 *    the loop stops instead of spinning on its own verdict.
 * 3. **The predict gate wins.** While a lesson's first run is waiting on a guess, the gate owns the
 *    next run. A watch mode that quietly ran the code would be the one path around the gate.
 *
 * A run in flight means `wait`, not `queue`: the effect that asks this re-fires when the run ends, so
 * a learner who keeps typing gets one run per pause rather than a backlog.
 *
 * The toggle is a preference and is remembered like focus mode; blocked storage costs the memory of
 * the choice, never the toggle.
 */

export const STORAGE_KEY_WATCH = 'mechalab_watch_v1';
/** Quiet time after the last keystroke before the checks run. Longer than the slider's 450 ms settle. */
export const WATCH_DEBOUNCE_MS = 1_500;

/** The runner's verdicts, as `passStatus` names them. */
export type WatchVerdict =
  | 'untested'
  | 'passed'
  | 'mismatch'
  | 'harness_failed'
  | 'behavior_failed'
  | 'error'
  | 'stopped';

export type WatchDecision = 'off' | 'wait' | 'run';

export interface WatchState {
  enabled: boolean;
  lastVerdict: WatchVerdict;
  /** A run is in flight. */
  running: boolean;
  /** The predict gate is holding a run for this lesson. */
  gateHolding: boolean;
  /** The editor text differs from the text the last run started from. */
  editedSinceRun: boolean;
}

/** Verdicts that mean "the checks said no", which is the only state watch mode is for. */
const WATCHED_VERDICTS: WatchVerdict[] = ['mismatch', 'harness_failed', 'behavior_failed'];

/**
 * Whether the checks should run now, wait, or not run at all.
 *
 * Pure on purpose: the interesting cases (a pass, a Stop, the gate holding a run, an unchanged
 * buffer) are unreachable from a browser in a unit test, and they are exactly the ones where a wrong
 * answer would be a run the learner did not ask for.
 */
export function watchDecision(state: WatchState): WatchDecision {
  if (!state.enabled) return 'off';
  if (state.running) return 'wait';
  if (state.gateHolding) return 'wait';
  if (!WATCHED_VERDICTS.includes(state.lastVerdict)) return 'off';
  return state.editedSinceRun ? 'run' : 'wait';
}

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function readWatch(): boolean {
  const store = storage();
  if (!store) return false;
  try {
    return store.getItem(STORAGE_KEY_WATCH) === '1';
  } catch {
    return false;
  }
}

/**
 * Turn watch mode on or off and remember it.
 *
 * Returns the state to render — with storage blocked there is nothing stored, and the toggle must
 * still work for this visit.
 */
export function setWatch(on: boolean): boolean {
  const store = storage();
  if (store) {
    try {
      store.setItem(STORAGE_KEY_WATCH, on ? '1' : '0');
    } catch {
      // Blocked or full: the choice lasts this visit only.
    }
  }
  return on;
}
