/**
 * The new-learner guide's content and state (`app/src/learnerGuide.ts`).
 *
 * MechaLab has sixteen workbench tabs, four course passes and a learning loop that only makes sense
 * once a learner has run one lesson. The guide is the one place that explains the whole shape before
 * they have to discover it by clicking. It is a stack of short steps, not a manual: each one answers
 * "what is this, why does it matter, and what do I do next?".
 *
 * `LEARNER_GUIDE` is the coverage contract. Every workbench tab in `data/workbenchTabs.json` must
 * appear in at least one step's `tabs` list, or be named in `GUIDE_TAB_EXEMPTIONS` with a reason.
 * `scripts/test_learner_guide.mjs` enforces that in CI, so adding a tab without considering the
 * guide fails the build. The guide is data, not JSX, because the test and the UI must read the same
 * list.
 *
 * The state lives on this device under `mechalab_new_learner_guide_v1`. A learner can stop midway
 * and resume at the same step; finishing or turning it off never loses their place. It is a tour,
 * not a gate: no tab is locked while the guide is open.
 */

import type { TabId } from './types';

export const GUIDE_STORAGE_KEY = 'mechalab_new_learner_guide_v1';
export const GUIDE_VERSION = 1;

export const GUIDE_VISUALS = [
  'loop',
  'roadmap',
  'placement',
  'lesson',
  'checks',
  'calculator',
  'study',
  'micro',
  'labs',
  'robot',
  'hardware',
  'board',
  'trust',
  'start',
] as const;

export type GuideVisual = (typeof GUIDE_VISUALS)[number];

export interface GuideAction {
  label: string;
  tab: TabId;
}

export interface GuideStep {
  id: string;
  /** The rail's label: one or two words, so the whole map fits a narrow column. */
  short: string;
  eyebrow: string;
  title: string;
  body: string;
  points: readonly string[];
  /** Workbench tabs this step is responsible for. The coverage guard reads this field. */
  tabs: readonly TabId[];
  visual: GuideVisual;
  action?: GuideAction;
}

/**
 * Tabs that deliberately have no guide step. Empty today: every tab is learner-facing. A future
 * internal or maintainer-only tab adds itself here **with a reason**, which is the record that the
 * guide was considered rather than forgotten.
 */
export const GUIDE_TAB_EXEMPTIONS: Partial<Record<TabId, string>> = {};

export const LEARNER_GUIDE: readonly GuideStep[] = [
  {
    id: 'welcome',
    short: 'Welcome',
    eyebrow: 'Welcome to MechaLab',
    title: 'Build the robot. Learn the stack.',
    body: 'MechaLab is one workbench for the whole mechatronics loop: read the idea, write Python, run it in this browser, then carry the same skill into simulation and hardware. Nothing here needs an account or a server.',
    points: [
      'Read → predict → run → verify. Every lesson is built around that loop.',
      'Red is data, not a verdict: a failing check names the idea to revisit.',
      'Progress, drafts and notes stay in this browser until you export them.',
    ],
    tabs: [],
    visual: 'loop',
  },
  {
    id: 'roadmap',
    short: 'Roadmap',
    eyebrow: 'The map',
    title: 'Four passes, one direction',
    body: 'Start Here is the on-ramp. Beginner, Applied and Advanced are the passes after it. The roadmap shows each milestone, the project that proves it and the practice that comes next — look ahead whenever you like, but do not skip the P-track lessons it names.',
    points: [
      'Start Here: setup, pins and your first Python program.',
      'Beginner: calculus as code, 2D rotations and RC filters.',
      'Applied / Advanced: control, estimation and the robot build.',
    ],
    tabs: ['tab-arch'],
    visual: 'roadmap',
    action: { label: 'Open the roadmap', tab: 'tab-arch' },
  },
  {
    id: 'placement',
    short: 'Placement',
    eyebrow: 'Skip what you know',
    title: 'Placement is a shortcut, not a test',
    body: 'If you have programmed before, the placement quiz drops you at the first lesson that still teaches you something. It never locks a tab and it never edits your progress. A guess only sends you to the wrong step.',
    points: [
      'Answer honestly; the result is easy to override.',
      'Review mode collects every lesson this device has verified.',
      'No result is permanent, and no lesson is hidden behind it.',
    ],
    tabs: ['tab-placement'],
    visual: 'placement',
    action: { label: 'Check my starting point', tab: 'tab-placement' },
  },
  {
    id: 'lessons',
    short: 'Lessons',
    eyebrow: 'The learning loop',
    title: 'One lesson, one sitting',
    body: 'The Python tab is the centre of the course. Read the brief, predict what will happen, then press Run (⌘↵ or Ctrl+Enter). The checks grade behaviour, not the shape of your code; the hint ladder gives the smallest nudge that unblocks you.',
    points: [
      'Read New ideas before touching the starter.',
      'Run first — see the red on purpose, then fix it.',
      'Reveal hints in order; the first one is usually enough.',
    ],
    tabs: ['tab-pyodide'],
    visual: 'lesson',
    action: { label: 'Open Python Lessons', tab: 'tab-pyodide' },
  },
  {
    id: 'checks',
    short: 'Feedback',
    eyebrow: 'Reading feedback',
    title: 'A failed check is a map',
    body: 'Each red row names one behaviour and the hint that explains it. Fix the first red row, run again, and leave the green rows alone. When every check is green, verify the lesson to record it in your learning log.',
    points: [
      'Fix one check at a time, not the whole file.',
      "The assertion's message says what it expected.",
      'Verified lessons feed review, the portfolio and the roadmap.',
    ],
    tabs: ['tab-pyodide'],
    visual: 'checks',
  },
  {
    id: 'instruments',
    short: 'Instruments',
    eyebrow: 'The instruments',
    title: 'Do the math beside the code',
    body: 'The Calculator tab has two faces. Scientific typesets what you type — fractions, powers, roots, logs, factorials — and the Graphing face plots explicit and implicit equations, with sliders for parameters like L1 and Kp. Both are native: no chart library, no network.',
    points: [
      'Type y = sin(x), x^2 + y^2 = 9, or a = 2.5.',
      'Fractions and exponents redraw as you type.',
      'Python can push points and equations with plot(...).',
    ],
    tabs: ['tab-pyodide'],
    visual: 'calculator',
  },
  {
    id: 'study',
    short: 'Free study',
    eyebrow: 'No grade attached',
    title: 'Free study is your scratch bench',
    body: 'The Studio tab is a Python editor, a workflow canvas and a notebook with no lesson and no checks. Try an idea with the training wheels off, sketch a machine as blocks, or keep the notes you will want next week.',
    points: [
      'The same Python runtime and the same editor.',
      'Workflow cards connect a plan to code.',
      'Studio work rides the same backup as your lessons.',
    ],
    tabs: ['tab-studio'],
    visual: 'study',
    action: { label: 'Open Free study', tab: 'tab-studio' },
  },
  {
    id: 'micro',
    short: 'Micro',
    eyebrow: 'Two minutes',
    title: 'Micro-learning keeps the streak alive',
    body: 'Forty-six tiny concepts from P.1 and P.2, each about two minutes. Use them on a phone, between tasks, or the day before a lesson. A micro card is not a replacement for a lesson; it is the warm-up that makes the vocabulary familiar.',
    points: [
      'One concept, one question, one explanation.',
      'The queue follows prerequisite order.',
      'Beta switch: hide the tab without losing the events.',
    ],
    tabs: ['tab-micro'],
    visual: 'micro',
    action: { label: 'Open Micro-learning', tab: 'tab-micro' },
  },
  {
    id: 'labs',
    short: 'Labs',
    eyebrow: 'Simulation',
    title: 'See the physics before the hardware',
    body: 'The lab tabs turn equations into instruments: a Bode plot, a spinning motor, a balancing pendulum, a system-identification sweep and an attitude filter. Change a gain, watch the response, and connect the number on screen to the line of Python that produced it.',
    points: [
      'Compare a stable and an unstable gain side by side.',
      'The same parameters appear in the lesson and the lab.',
      'A lab is a rehearsal, not a substitute for the run.',
    ],
    tabs: ['tab-bode', 'tab-foc', 'tab-pend', 'tab-sysid', 'tab-eskf'],
    visual: 'labs',
    action: { label: 'Open a lab', tab: 'tab-bode' },
  },
  {
    id: 'robot',
    short: 'Robot',
    eyebrow: 'The machine',
    title: 'From joint angles to a safe arm',
    body: 'The Robot models tab inspects the arm, its links and the safety envelope around it. Open it when a lesson talks about kinematics or a reachable workspace and you want to see the geometry rather than imagine it.',
    points: [
      'Link lengths L1 and L2 are the same parameters the graph plots.',
      'Watch the end effector as you change a joint angle.',
      'Safety limits are part of the model, not a warning label.',
    ],
    tabs: ['tab-models'],
    visual: 'robot',
    action: { label: 'Open Robot models', tab: 'tab-models' },
  },
  {
    id: 'hardware',
    short: 'Build',
    eyebrow: 'The build',
    title: 'Parts, boards and requirements',
    body: 'Project Mode is the bill of materials: every part has an id, a budget line and a reason. The CAD/PCB tab shows the same build in space, and the Requirements register ties each requirement to the parts that satisfy it. This is how a design stays honest as it grows.',
    points: [
      'Find a part by name, number or id.',
      'Every requirement points at real parts.',
      'The budget is a constraint, not a score.',
    ],
    tabs: ['tab-cadpcb', 'tab-project', 'tab-req'],
    visual: 'hardware',
    action: { label: 'Browse the build', tab: 'tab-project' },
  },
  {
    id: 'board',
    short: 'Board',
    eyebrow: 'Firmware',
    title: 'Run the sketch, watch the serial',
    body: 'The Board tab runs a compiled Arduino sketch in an emulator and streams its serial output. It is the bridge between the Python model and the C++ that will run on the robot; the lesson firmware checks and the board output describe the same behaviour.',
    points: [
      'Edit, compile and run without a physical board.',
      'Serial output is the first debugger.',
      'The same sketch compiles for the real target.',
    ],
    tabs: ['tab-board'],
    visual: 'board',
    action: { label: 'Open the board', tab: 'tab-board' },
  },
  {
    id: 'trust',
    short: 'Trust',
    eyebrow: 'Trust',
    title: 'Every outside link is watched',
    body: 'The course cites datasheets, app notes and vendor docs. A nightly check records which links still respond, so a dead reference is visible instead of quietly teaching stale hardware. The Links tab is the receipt.',
    points: [
      'Green means checked recently and reachable.',
      'Red is a broken reference, not a broken lesson.',
      'Every lesson stays readable offline.',
    ],
    tabs: ['tab-links'],
    visual: 'trust',
  },
  {
    id: 'start',
    short: 'Start',
    eyebrow: 'Your first week',
    title: 'Three doors, in this order',
    body: 'Open Start Here and finish its milestones. Then run P.1, then P.2, then take the placement quiz only if you already know the material. After that, follow the roadmap one milestone per sitting and let review keep the old lessons warm.',
    points: [
      'Day 1: Start Here + P.1.',
      'Day 2: P.2 + one micro set.',
      'Day 3 onward: one roadmap milestone per sitting.',
    ],
    tabs: [],
    visual: 'start',
    action: { label: 'Open the roadmap', tab: 'tab-arch' },
  },
];

export const GUIDE_STEP_COUNT = LEARNER_GUIDE.length;

export type GuideStatus = 'not-started' | 'active' | 'completed' | 'dismissed';

export interface GuideState {
  version: number;
  status: GuideStatus;
  stepIndex: number;
  updatedAt: number;
}

/** The tiny part of `Storage` this module uses, so the unit suite can pass a plain object. */
export interface GuideStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStore(): GuideStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function initialGuideState(now = Date.now()): GuideState {
  return { version: GUIDE_VERSION, status: 'not-started', stepIndex: 0, updatedAt: now };
}

function clampStep(index: number): number {
  if (!Number.isInteger(index)) return 0;
  return Math.min(Math.max(index, 0), GUIDE_STEP_COUNT - 1);
}

export function readGuideState(store: GuideStore | null = browserStore()): GuideState {
  try {
    const raw = store?.getItem(GUIDE_STORAGE_KEY);
    if (!raw) return initialGuideState();
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return initialGuideState();
    const record = parsed as Partial<GuideState>;
    const status: GuideStatus =
      record.status === 'active' ||
      record.status === 'completed' ||
      record.status === 'dismissed' ||
      record.status === 'not-started'
        ? record.status
        : 'not-started';
    return {
      version: GUIDE_VERSION,
      status,
      stepIndex: clampStep(typeof record.stepIndex === 'number' ? record.stepIndex : 0),
      updatedAt: typeof record.updatedAt === 'number' ? record.updatedAt : 0,
    };
  } catch {
    return initialGuideState();
  }
}

export function writeGuideState(
  state: GuideState,
  store: GuideStore | null = browserStore()
): GuideState {
  try {
    store?.setItem(GUIDE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // A blocked store costs the memory, never the guide.
  }
  return state;
}

/**
 * The state the UI opens with. A finished guide starts again from the top; a guide turned off
 * midway resumes exactly where the learner left it. Opening never rewrites the stored status by
 * itself — only a Next, Previous or Close does.
 */
export function resumeGuideState(state: GuideState, now = Date.now()): GuideState {
  return {
    ...state,
    status: 'active',
    stepIndex: state.status === 'completed' ? 0 : clampStep(state.stepIndex),
    updatedAt: now,
  };
}

export function nextGuideState(state: GuideState, now = Date.now()): GuideState {
  if (state.stepIndex >= GUIDE_STEP_COUNT - 1) {
    return { ...state, status: 'completed', updatedAt: now };
  }
  return {
    ...state,
    status: 'active',
    stepIndex: clampStep(state.stepIndex + 1),
    updatedAt: now,
  };
}

export function previousGuideState(state: GuideState, now = Date.now()): GuideState {
  return {
    ...state,
    status: 'active',
    stepIndex: clampStep(state.stepIndex - 1),
    updatedAt: now,
  };
}

export function jumpToGuideStep(state: GuideState, index: number, now = Date.now()): GuideState {
  return { ...state, status: 'active', stepIndex: clampStep(index), updatedAt: now };
}

export function dismissGuideState(state: GuideState, now = Date.now()): GuideState {
  return { ...state, status: 'dismissed', updatedAt: now };
}

export function restartGuideState(state: GuideState, now = Date.now()): GuideState {
  return { ...state, status: 'active', stepIndex: 0, updatedAt: now };
}

export function guideAnnouncement(index: number): string {
  const step = LEARNER_GUIDE[clampStep(index)];
  return step ? `Step ${clampStep(index) + 1} of ${GUIDE_STEP_COUNT}: ${step.title}` : '';
}

/** The short label the footer and rail use for a step. */
export function guideStepNumber(index: number): string {
  return String(clampStep(index) + 1).padStart(2, '0');
}
