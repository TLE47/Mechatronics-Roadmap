/**
 * The first-run tour: six steps, four of which wait for the learner to actually do the thing
 * (`app/src/tour.ts`).
 *
 * The person this is for has never seen a code editor. Two facts decide the design:
 *
 * 1. **The starter is unfinished on purpose.** Their very first Run prints red checks, and a
 *    beginner reads red as "I broke it" within two minutes. So the step that *explains the red*
 *    is part of the tour, not a footnote — and the run step cannot be skipped by the reader,
 *    because the explanation is worthless before the result exists.
 * 2. **A card that says "now press Run" beside a Run button is a card people close.** Steps three
 *    and four therefore have no Next button at all: the tour moves on when the editor text changes
 *    and when a run finishes, because that is the thing it was asking for (`reduceTour` below).
 *
 * The table is the single source of the words, the anchors and the gates. `data-tour` attributes in
 * the app name the anchors, and `scripts/test_tour.mjs` fails if one of them stops existing — a
 * tour that silently loses its target is worse than no tour, because it points at a sentence.
 */

/** The six steps, in order. */
export type FirstRunStepId = 'welcome' | 'lesson' | 'editor' | 'run' | 'results' | 'hints';

/**
 * What moves a step forward.
 *
 * `next` is a press; `edited` is the learner's own text change; `run-finished` is a run that ended
 * with a verdict. The two facts-gated kinds are the whole point: the tour cannot be clicked through
 * without doing what it asks.
 */
export type TourGate = 'next' | 'edited' | 'run-finished';

/** Which region a phone should be showing for a step (`workspaceLayout.ts`). */
export type MobileView = 'lesson' | 'code' | 'results';

export interface FirstRunStep {
  id: FirstRunStepId;
  /** The `data-tour` value to point at; `null` is a centred card, for the welcome. */
  anchor: string | null;
  title: string;
  /** One sentence, under about 25 words: the coach mark is not the place for a paragraph. */
  body: string;
  gate: TourGate;
  /** A quiet "I'll do it later" link, so an action step can never trap anyone. */
  skippable: boolean;
  /** Where a phone puts the learner for this step — the screen is one region at a time there. */
  mobileView: MobileView;
}

/**
 * The tour.
 *
 * Wording follows the buttons on screen: the primary is *Run & Verify Output*, not "Run & Check",
 * and the hint section is the *Hint Ladder*. A coach mark that renames a control is a second set of
 * vocabulary to learn.
 */
export const FIRST_LESSON_TOUR: readonly FirstRunStep[] = [
  {
    id: 'welcome',
    anchor: null,
    title: 'Welcome to MechaLab',
    body: 'This first lesson takes about 20 minutes. Everything runs in your browser and saves on this device.',
    gate: 'next',
    skippable: false,
    mobileView: 'lesson',
  },
  {
    id: 'lesson',
    anchor: 'lesson-brief',
    title: 'Read here first',
    body: 'Each lesson teaches at most two new ideas, listed at the top. This card is the brief for the lesson you have open.',
    gate: 'next',
    // No second way forward: the step already has Next, and a "later" link beside it is the same press
    // with a worse label. The tour is closed from the ×, not from here.
    skippable: false,
    mobileView: 'lesson',
  },
  {
    id: 'editor',
    anchor: 'editor',
    title: 'This is your code',
    body: 'Try changing a line. You cannot break anything, and Reset in the More menu brings the starter back.',
    gate: 'edited',
    skippable: true,
    mobileView: 'code',
  },
  {
    id: 'run',
    anchor: 'run-button',
    title: 'Press Run & Verify Output',
    // The predict gate sits between this press and the run (`predictGate.ts`): a step that says "press
    // Run" over a card that says "what will it print?" is two instructions at once, so the gate is
    // named here. A guess is enough, and Skip and run is on the card.
    body: 'The first Run asks what it will print — a guess is enough, or Skip and run. Ctrl/⌘+Enter runs from anywhere.',
    gate: 'run-finished',
    skippable: true,
    mobileView: 'code',
  },
  {
    id: 'results',
    anchor: 'checks-panel',
    title: 'Red checks are expected',
    body: 'The starter is unfinished on purpose. Each failed check says what it expected and what to look at.',
    gate: 'next',
    skippable: false,
    mobileView: 'results',
  },
  {
    id: 'hints',
    anchor: 'hint-ladder',
    title: 'Stuck? Take a hint',
    body: 'The ladder goes from a small nudge to a worked step. Using it is part of learning, not a penalty.',
    gate: 'next',
    skippable: false,
    mobileView: 'results',
  },
];

export const TOUR_STEP_COUNT = FIRST_LESSON_TOUR.length;

/**
 * The stored shape, and its version.
 *
 * `version` is bumped when the first lesson changes enough that a finished tour should be offered
 * again. It is part of the record rather than an outside constant because the record has to be
 * readable later: an old number is a tour this build does not recognise, and the reader treats it as
 * never taken (`tourState.ts`), which is the honest answer — nobody saw *these* six steps.
 */
export const TOUR_VERSION = 1;

export type TourStatus = 'not-started' | 'active' | 'dismissed' | 'completed';

export interface TourState {
  version: number;
  status: TourStatus;
  /** The step on screen. Kept when the tour is dismissed, so a chip can say "step 3 of 6". */
  stepIndex: number;
  /** The resume chip has been offered once; it does not come back on every reload. */
  chipShown: boolean;
  updatedAt: number;
}

/** Everything the tour can be told. `edited` and `run-finished` are facts; the rest are presses. */
export type TourSignal =
  | 'next'
  | 'skip-step'
  | 'dismiss'
  | 'replay'
  | 'edited'
  | 'run-finished';

/** The live facts a gate reads. Only the ones the signal needs. */
export interface TourFacts {
  /** The editor text differs from what it was when the tour started. */
  edited: boolean;
  /** A run has ended with a verdict (pass, failure, stop or error). */
  runFinished: boolean;
  /** That run passed — the first-attempt path, which never sees the red-checks step. */
  passed: boolean;
}

export function initialTourState(now: number = Date.now()): TourState {
  return { version: TOUR_VERSION, status: 'not-started', stepIndex: 0, chipShown: false, updatedAt: now };
}

/** The step at an index, or the first one for a number from a store that no longer fits. */
export function stepAt(index: number): FirstRunStep {
  const safe = Number.isInteger(index) && index >= 0 && index < TOUR_STEP_COUNT ? index : 0;
  return FIRST_LESSON_TOUR[safe];
}

/** `Step 4 of 6: Press Run & Verify Output` — the sentence a screen reader hears on every move. */
export function stepAnnouncement(index: number): string {
  const step = stepAt(index);
  const safe = Number.isInteger(index) && index >= 0 && index < TOUR_STEP_COUNT ? index : 0;
  return `Step ${safe + 1} of ${TOUR_STEP_COUNT}: ${step.title}`;
}

/** The primary button's words: an action step has none, an information step advances. */
export function primaryLabel(index: number): string | null {
  const step = stepAt(index);
  if (step.gate !== 'next') return null;
  if (step.id === 'results') return 'Got it';
  if (index >= TOUR_STEP_COUNT - 1) return 'Finish tour';
  return 'Next';
}

/** A learner who passes on the very first run never needs the red-checks step explained. */
export function skipsResults(facts: TourFacts, index: number): boolean {
  return index === 3 && facts.passed;
}

/**
 * One signal, one new state.
 *
 * Written as a pure function so the rules can be pinned without a browser: the gate is a property
 * of the *step*, the fact is a property of the *app*, and nothing else moves the tour. A signal that
 * the current step does not ask for returns the same object, which React reads as "no change".
 */
export function reduceTour(
  state: TourState,
  signal: TourSignal,
  facts: TourFacts,
  now: number = Date.now()
): TourState {
  return stepUnderSignal(state, signal, facts, now) ?? state;
}

function stepUnderSignal(
  state: TourState,
  signal: TourSignal,
  facts: TourFacts,
  now: number
): TourState | null {
  // Replay is the one signal that works from any state: the palette and the `?` sheet both offer it.
  if (signal === 'replay') {
    return { ...initialTourState(now), status: 'active' };
  }
  if (state.status !== 'active') return null;

  if (signal === 'dismiss') {
    return { ...state, status: 'dismissed', updatedAt: now };
  }

  const step = stepAt(state.stepIndex);

  // "I'll do it later" is only drawn where the table allows it, so it is also only honoured there.
  if (signal === 'skip-step') {
    return step.skippable ? advance(state, state.stepIndex + 1, now) : null;
  }

  if (signal === 'edited') {
    return step.gate === 'edited' && facts.edited ? advance(state, state.stepIndex + 1, now) : null;
  }

  if (signal === 'run-finished') {
    if (step.gate !== 'run-finished' || !facts.runFinished) return null;
    // A pass on the first attempt makes step 5 ("red checks are expected") a sentence about
    // something that did not happen, so the tour goes straight to the hints.
    const ahead = skipsResults(facts, state.stepIndex) ? state.stepIndex + 2 : state.stepIndex + 1;
    return advance(state, ahead, now);
  }

  if (signal === 'next' && step.gate === 'next') {
    return advance(state, state.stepIndex + 1, now);
  }

  return null;
}

function advance(state: TourState, index: number, now: number): TourState {
  if (index >= TOUR_STEP_COUNT) {
    return { ...state, status: 'completed', stepIndex: TOUR_STEP_COUNT - 1, chipShown: true, updatedAt: now };
  }
  return { ...state, status: 'active', stepIndex: index, updatedAt: now };
}

/** The layout a step needs, so the thing it points at is on screen rather than hidden by a preset. */
export function layoutForStep(
  index: number,
  isPhone: boolean
): 'study' | 'write' | 'read' {
  const step = stepAt(index);
  if (isPhone) {
    // One region at a time on a phone: the step says which one, and the sheet says why.
    if (step.mobileView === 'code') return 'write';
    if (step.mobileView === 'results') return 'study';
    return 'read';
  }
  // Desktop has the width for two regions. The editor step wants the editor's whole share; the run
  // step wants the results beside it — the gate that asks what the code will print is a pane there,
  // and so is the verdict the step waits for. Write hides both, which left the gate mounted but
  // invisible and the held run never resolving (the tour sat on step 4 until it timed out).
  return step.id === 'editor' ? 'write' : 'study';
}
