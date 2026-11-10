/**
 * "Run with Verify" (`app/src/robotSim/robotAutoRun.ts`).
 *
 * One preference and one signal. The preference says whether a finished **Run & Verify Output**
 * should also run the robot, and it is only ever read by the Robot tab — so the switch can change
 * nothing at all until that tab is open, which is exactly what it promises. The signal is a plain
 * event the executor fires after a graded run settles; the Robot tab listens and starts its own
 * instrumented pass.
 *
 * The robot's pass is deliberately a second run rather than a flag on the graded one: the probe it
 * appends is not part of the lesson's program, and mixing it into the run that decides the verdict
 * would make the printed output and the instructor checks describe code the learner never wrote.
 *
 * A choice is storage, not state: the switch shows what was stored, a browser that refuses
 * `localStorage` still toggles for the visit, and an unreadable store means "off" — never a guess.
 */

export const ROBOT_AUTORUN_KEY = 'mechalab_robot_autorun_v1';

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** Whether a finished Run & Verify also runs the robot. Off unless the reader turned it on. */
export function readRobotAutoRun(): boolean {
  const store = storage();
  if (!store) return false;
  try {
    return store.getItem(ROBOT_AUTORUN_KEY) === 'on';
  } catch {
    return false;
  }
}

type PreferenceListener = (on: boolean) => void;
const preferenceListeners = new Set<PreferenceListener>();

export function subscribeRobotAutoRun(listener: PreferenceListener): () => void {
  preferenceListeners.add(listener);
  return () => {
    preferenceListeners.delete(listener);
  };
}

/** Write the choice, notify every switch showing it, and return what to render. */
export function writeRobotAutoRun(on: boolean): boolean {
  const store = storage();
  if (store) {
    try {
      store.setItem(ROBOT_AUTORUN_KEY, on ? 'on' : 'off');
    } catch {
      // Blocked or full: the choice lasts this visit only.
    }
  }
  for (const listener of [...preferenceListeners]) {
    try {
      listener(on);
    } catch {
      // A broken listener must not take the switch down with it.
    }
  }
  return on;
}

type RunListener = () => void;
const runListeners = new Set<RunListener>();

/**
 * A graded Run & Verify has finished. Fired from the executor's `finally`, so a lesson that failed,
 * timed out or was stopped still counts: the robot may have something to show, and if it does not,
 * its own run leaves the arena empty by the same rule it always had.
 */
export function announceVerifyFinished(): void {
  for (const listener of [...runListeners]) {
    try {
      listener();
    } catch {
      // One listener failing to start must not stop the others.
    }
  }
}

export function onVerifyFinished(listener: RunListener): () => void {
  runListeners.add(listener);
  return () => {
    runListeners.delete(listener);
  };
}
