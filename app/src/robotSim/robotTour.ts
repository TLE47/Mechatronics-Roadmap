/**
 * The Robot tab's first-run guide (`app/src/robotSim/robotTour.ts`).
 *
 * The guide is three sentences about the three controls the tab adds to the one editor: Run robot,
 * the mission's goal chips, and Replay. It is deliberately not the six-step first-lesson tour: a
 * learner who opens Robot has already met the workbench, and the only new vocabulary here is the
 * tab's own.
 *
 * The record is tiny and lives in `localStorage` beside the other onboarding facts. It is read by
 * the pane to decide whether to draw the guide once, and cleared by the Onboarding reset so
 * "Resetting replays them" stays true. A store that cannot be read is treated as never started,
 * which offers the guide again rather than resuming half of it.
 */

export type RobotTourStepId = 'run' | 'targets' | 'replay';

/** One coach mark. `anchor` is the `data-robot-tour` value on the control it points at. */
export interface RobotTourStep {
  id: RobotTourStepId;
  anchor: 'run' | 'targets' | 'replay';
  title: string;
  body: string;
}

/** The three steps, in the order the guide walks them. */
export const ROBOT_TOUR_STEPS = [
  {
    id: 'run',
    anchor: 'run',
    title: 'Run your code',
    body: 'Run robot runs the main.py you have now and follows it line by line. It never edits your code or grades the lesson.',
  },
  {
    id: 'targets',
    anchor: 'targets',
    title: 'Read the targets',
    body: 'Each target compares your run with the lesson goal. Tap one to open its hint and the main.py line that wrote its value.',
  },
  {
    id: 'replay',
    anchor: 'replay',
    title: 'Replay the motion',
    body: 'After a run, Replay walks the same motion without running Python again. Watch how the code reached the goal.',
  },
] as const satisfies readonly RobotTourStep[];

export const ROBOT_TOUR_STEP_COUNT = ROBOT_TOUR_STEPS.length;

/** Bumped only when these three steps change enough that a finished guide should be offered again. */
export const ROBOT_TOUR_VERSION = 1;

export const STORAGE_KEY_ROBOT_TOUR = 'mechalab_robot_tour_v1';

export type RobotTourStatus = 'not-started' | 'active' | 'dismissed' | 'completed';

export interface RobotTourState {
  version: number;
  status: RobotTourStatus;
  stepIndex: number;
  updatedAt: number;
}

/** The slice of a `Storage` this module needs; a test can pass a plain object. */
export interface RobotTourStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STATUSES: readonly RobotTourStatus[] = ['not-started', 'active', 'dismissed', 'completed'];

function storage(): RobotTourStore | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    // A browser that throws on access still gets the guide this visit; it just cannot remember it.
    return null;
  }
}

export function initialRobotTourState(now: number = Date.now()): RobotTourState {
  return { version: ROBOT_TOUR_VERSION, status: 'not-started', stepIndex: 0, updatedAt: now };
}

/** The step at an index, or the first one for a record that no longer fits. */
export function robotTourStepAt(index: number): RobotTourStep {
  const safe = Number.isInteger(index) && index >= 0 && index < ROBOT_TOUR_STEP_COUNT ? index : 0;
  return ROBOT_TOUR_STEPS[safe];
}

/** `Step 1 of 3: Run your code` — the sentence a screen reader hears on every move. */
export function robotTourAnnouncement(index: number): string {
  const step = robotTourStepAt(index);
  const safe = Number.isInteger(index) && index >= 0 && index < ROBOT_TOUR_STEP_COUNT ? index : 0;
  return `Step ${safe + 1} of ${ROBOT_TOUR_STEP_COUNT}: ${step.title}`;
}

/** Start from the beginning, keeping the record's identity. */
export function startRobotTour(state: RobotTourState, now: number = Date.now()): RobotTourState {
  return { ...state, version: ROBOT_TOUR_VERSION, status: 'active', stepIndex: 0, updatedAt: now };
}

/**
 * The primary press. The last step finishes the guide rather than looping, and a record that is
 * already closed stays closed.
 */
export function nextRobotTour(state: RobotTourState, now: number = Date.now()): RobotTourState {
  if (state.status !== 'active') return state;
  const last = ROBOT_TOUR_STEP_COUNT - 1;
  if (state.stepIndex >= last) {
    return { ...state, status: 'completed', stepIndex: last, updatedAt: now };
  }
  return { ...state, stepIndex: state.stepIndex + 1, updatedAt: now };
}

/** Back never leaves the first step, and never reopens a finished guide. */
export function previousRobotTour(state: RobotTourState, now: number = Date.now()): RobotTourState {
  if (state.status !== 'active' || state.stepIndex <= 0) return state;
  return { ...state, stepIndex: state.stepIndex - 1, updatedAt: now };
}

/** Skip keeps the step it was on so a future surface could name it; this one only remembers "seen". */
export function dismissRobotTour(state: RobotTourState, now: number = Date.now()): RobotTourState {
  return { ...state, status: 'dismissed', updatedAt: now };
}

/** The stored record, or a pristine one. Every field is validated because storage is not trusted. */
export function readRobotTour(store: RobotTourStore | null = storage()): RobotTourState {
  const empty = initialRobotTourState();
  if (!store) return empty;
  try {
    const raw = store.getItem(STORAGE_KEY_ROBOT_TOUR);
    if (!raw) return empty;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return empty;
    const value = parsed as Partial<RobotTourState>;
    if (value.version !== ROBOT_TOUR_VERSION) return empty;
    const status = STATUSES.includes(value.status as RobotTourStatus)
      ? (value.status as RobotTourStatus)
      : 'not-started';
    const index = Number.isInteger(value.stepIndex) ? Number(value.stepIndex) : 0;
    return {
      version: ROBOT_TOUR_VERSION,
      status,
      stepIndex: index >= 0 && index < ROBOT_TOUR_STEP_COUNT ? index : 0,
      updatedAt: Number.isFinite(value.updatedAt) ? Number(value.updatedAt) : Date.now(),
    };
  } catch {
    return empty;
  }
}

/** Remember a record and return what to render: with storage blocked, this visit still works. */
export function writeRobotTour(
  state: RobotTourState,
  store: RobotTourStore | null = storage()
): RobotTourState {
  try {
    store?.setItem(STORAGE_KEY_ROBOT_TOUR, JSON.stringify(state));
  } catch {
    // Blocked or full: the guide lasts this visit only.
  }
  return state;
}
