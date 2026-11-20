/**
 * The feature walkthrough's catalogue (`app/src/featureWalkthrough.ts`).
 *
 * The new-learner guide is fifteen steps of prose; this is the other half of the same tour: one
 * tooltip per feature, pointing at the control that does it. Every stop names a real element by its
 * `data-testid`, so the tooltip cannot drift into describing a button that is no longer there —
 * `scripts/test_learner_guide.mjs` checks that each selector exists in the app's source, and that
 * every workbench tab has at least one stop.
 *
 * A stop may name a `tab`. Opening that stop navigates the workbench first and then finds the
 * anchor, so the walkthrough follows the learner across the app rather than showing a slideshow
 * beside it. `features` is the list the card prints: each line is one thing the control does and the
 * gesture that uses it. `body` is the one-sentence why.
 *
 * The position is stored on this device under `mechalab_feature_walkthrough_v1`, separately from the
 * guide's own step: switching between the two modes never loses either place.
 */

import type { TabId } from './types';

export const FEATURE_WALKTHROUGH_STORAGE_KEY = 'mechalab_feature_walkthrough_v1';
/**
 * Version 4 stores the current stop's stable id beside its index. Version 3 saved only the index;
 * `workflow` was inserted at index 21 in version 4, so older positions at or after it migrate one
 * step forward before they are read.
 */
export const FEATURE_WALKTHROUGH_VERSION = 4;

/** The first version whose checklist required each stop's real control; later versions keep it. */
const WALKTHROUGH_COMPLETION_VERSION = 3;

/**
 * The catalogue index where `workflow` was inserted in version 4, frozen at its first-ship
 * position. Deriving this from today's catalogue would move the migration whenever a later stop
 * is inserted before Workflow.
 */
const V4_WORKFLOW_INSERTION_INDEX = 21;

export interface WalkthroughStop {
  id: string;
  /** The group the card prints above the title. */
  section: string;
  title: string;
  body: string;
  /** One feature per line: what it does, and the gesture that uses it. */
  features: readonly string[];
  /** The tab this stop opens first; absent leaves the current tab alone. */
  tab?: TabId;
  /** CSS selectors in preference order. The first one on screen is the spotlight. */
  anchors: readonly string[];
}

const byTestId = (id: string) => `[data-testid="${id}"]`;
const tabAnchor = (id: TabId) => byTestId(`tab-btn-${id}`);

export const FEATURE_WALKTHROUGH: readonly WalkthroughStop[] = [
  {
    id: 'brand',
    section: 'The shell',
    title: 'The wordmark opens the introduction',
    body: 'The mark is the first door and the smallest one: a plain click opens the course introduction without losing your place in the workbench.',
    features: [
      'Click the MechaLab wordmark to read what the course is before any progress exists.',
      'The release number beside the word names this exact build.',
      'A middle click or ⌘-click still opens the introduction in a new tab, like any link.',
    ],
    anchors: [byTestId('link-brand')],
  },
  {
    id: 'levels',
    section: 'The shell',
    title: 'Four level links filter the course',
    body: 'Start Here, Beginner, Applied and Advanced are passes of one curriculum, not separate courses; the link you press becomes the pass the roadmap reads.',
    features: [
      'Start Here is the on-ramp: setup, pins and the first Python program.',
      'Beginner, Applied and Advanced move the roadmap to that pass and keep the highlighted link in step.',
      'The links only appear on screens that read the pass, so a press always changes something.',
    ],
    tab: 'tab-arch',
    anchors: [byTestId('btn-pass-level0'), byTestId('tab-rail-nav')],
  },
  {
    id: 'navigate',
    section: 'The shell',
    title: 'The Navigate tray is the five destinations',
    body: 'Every page that is not a workbench tab lives behind one tray, so a learner never has to remember an address.',
    features: [
      'Home: today’s step, the continue card, the labs grid and the review count.',
      'Review: every lesson this device has verified, with its guesses and notes.',
      'Lessons, Free study and Micro open the three practice surfaces.',
      'Search (⌘⇧F) reads terms and lesson text; it is not only a command palette.',
    ],
    anchors: [byTestId('btn-open-palette')],
  },
  {
    id: 'appearance',
    section: 'The shell',
    title: 'Appearance, motion and layout',
    body: 'Seven device preferences sit on the header row and are written once, so every screen and every saved screenshot agree with them.',
    features: [
      'Sound is one press: on starts the cues and room tone, off mutes everything. Volume, tape and ambience stay in General settings.',
      'Theme switches light and dark; Contrast is the high-contrast palette; Paper is the print-like reading surface.',
      'Focus (⌘.) hides the chrome and keeps the work; the same shortcut or Escape brings it back.',
      'Compact (⌥5) folds the lesson into one strip; Motion stops every animated figure for a calmer or cheaper visit.',
      'Each control is a real on/off state, and the choice stays on this device.',
    ],
    anchors: [byTestId('btn-sound-toggle'), byTestId('btn-theme-toggle'), byTestId('btn-general-settings')],
  },
  {
    id: 'settings',
    section: 'The shell',
    title: 'General settings holds the quiet jobs',
    body: 'The gear opens one dialog for the preferences that are about the workbench rather than the lesson.',
    features: [
      'New learner guide: this guide’s step mode and this feature walkthrough are both opened here.',
      'Small text on action buttons keeps the header words visible at compact widths.',
      'Workspace blocks: put away the runtime strip, the hint ladder or the assessment without losing a record.',
      'Export learning log (.json), backup/restore (.zip) and Export Progress (.md).',
      'Sound: volume, tape, ambience, the click map and the instrument, with a preview and a reset.',
    ],
    anchors: [byTestId('btn-general-settings')],
  },
  {
    id: 'reset',
    section: 'The shell',
    title: 'Reset chooses a part; the cheat sheet is one page',
    body: 'Reset never erases on the press: it asks which record you mean. The cheat sheet is the printable summary beside it.',
    features: [
      'Reset… lists progress, drafts, notes, the log and the review schedule one part at a time.',
      'Every reset names what it will remove before the button acts.',
      '1-page cheat sheet opens the printable summary; Replay the first-lesson tour lives on it too.',
    ],
    anchors: [byTestId('btn-open-reset')],
  },
  {
    id: 'account',
    section: 'The shell',
    title: 'The account chip is optional',
    body: 'MechaLab runs without an account. Signing in only adds cross-browser sync; everything else is stored in this browser.',
    features: [
      'Signed out, the chip says Sign in and explains what sync would add.',
      'Signed in, it shows the address and opens the account page.',
      'Backups are the account-free way to move progress: one .zip out and back in.',
    ],
    anchors: [byTestId('btn-account')],
  },
  {
    id: 'rail',
    section: 'The shell',
    title: 'The workbench rail',
    body: 'Sixteen tabs are grouped by what a learner is doing: lessons, the roadmap, practice, labs, the build and the board.',
    features: [
      'On a monitor the rail runs down the left edge; from md down it is one horizontal strip.',
      'Collapse (xl) folds it to icons; every tab keeps its accessible name and tooltip.',
      'Hovering or focusing a tab prefetches its chunk, so a press usually draws at once.',
      'Beginner View swaps each label for its plain-English name and subtitle.',
    ],
    anchors: [byTestId('btn-rail-toggle'), byTestId('tab-rail-nav')],
  },
  {
    id: 'palette',
    section: 'The shell',
    title: 'Search, the palette and the keys',
    body: 'One search box answers three different questions, and the `?` sheet lists every key without leaving the page.',
    features: [
      '⌘K / Ctrl+K opens the command palette: lessons, tabs and commands in one list.',
      '⌘P jumps straight to a lesson; ⌘⇧F searches lesson text, terms and course pages.',
      'The header Search button opens that same text search, so the door and the shortcut agree.',
      '? opens the shortcut sheet; six app-wide keys can be rebound there and reset.',
    ],
    anchors: [byTestId('btn-open-palette')],
  },
  {
    id: 'home',
    section: 'The shell',
    title: 'Home is the return visit',
    body: 'Home answers “what now?” on arrival: the next step, the lesson you left, the labs and the work waiting to be reviewed.',
    features: [
      'Today’s step and Continue reopen the exact lesson and draft you left.',
      'The labs grid is the complete index of every simulator and tool.',
      'Free study and Micro have their own doors, so neither needs the rail to find.',
      'The review count opens the same FSRS deck the runner’s Study panel answers.',
    ],
    anchors: [byTestId('btn-home')],
  },

  {
    id: 'lesson-list',
    section: 'Python runner',
    title: 'Open a lesson from the list',
    body: 'The Python tab is one workspace: a chooser, the lesson you picked, the editor and the checks that grade it.',
    features: [
      'The chooser filters by track and searches titles, goals and ideas.',
      'Start Here’s first program is P.1; the next chapter button continues in order.',
      'A lesson remembers the draft you left, so Continue never shows a fresh starter over your work.',
      'The phone swaps list, brief, code and checks one surface at a time.',
    ],
    tab: 'tab-pyodide',
    anchors: [byTestId('btn-lessons-toggle'), byTestId('btn-lessons'), byTestId('runner-toolbar')],
  },
  {
    id: 'lesson-reader',
    section: 'Python runner',
    title: 'Read the brief before you type',
    body: 'The brief is the lesson: new ideas, the goal, the step it belongs to and the reading that explains the idea in full.',
    features: [
      'New ideas defines the vocabulary the checks will use.',
      'The roadmap breadcrumb and step cost say where this sits and how long it usually takes.',
      '“View source on GitHub” opens the lesson page in a new tab; the guide card offers the first run.',
      'Read, Write, Study and Debug are layout presets, not different lessons.',
    ],
    tab: 'tab-pyodide',
    anchors: [byTestId('lesson-reader'), byTestId('lesson-title'), byTestId('tab-btn-tab-pyodide')],
  },
  {
    id: 'editor',
    section: 'Python runner',
    title: 'The Python editor and its panes',
    body: 'The editor is never a read-only copy: it is the file a Run executes, with tabs for the lesson’s helper modules and a pane for every report.',
    features: [
      'CodeMirror highlights Python, completes names, shows signatures and hovers definitions (F12 jumps to one).',
      'Format with Black (⌘⇧B) tidies main.py and says whether it changed anything.',
      'Vim mode, find/replace and a draft history sit on the card’s toolbar.',
      'Panes can be split, swapped, dragged, stacked or closed; the arrangement is remembered.',
    ],
    tab: 'tab-pyodide',
    anchors: [byTestId('editor-panel'), byTestId('editor-panes'), tabAnchor('tab-pyodide')],
  },
  {
    id: 'run',
    section: 'Python runner',
    title: 'Run, Stop and the console',
    body: 'Run executes main.py in an isolated Python 3.12 Web Worker, so a typo or a loop cannot freeze the page.',
    features: [
      'Run is ⌘↵ / Ctrl+Enter; Stop is ⌘⇧↵ and leaves the code you typed in place.',
      'Pause and Step park the interpreter and show the line, the values and your watches.',
      'The console separates stdout from stderr; a prompt appears when input() is waiting.',
      'Run output and Expected output sit side by side, with a line-level diff and the exact/optional formatting note.',
    ],
    tab: 'tab-pyodide',
    anchors: [byTestId('runner-toolbar'), byTestId('editor-panes'), tabAnchor('tab-pyodide')],
  },
  {
    id: 'checks',
    section: 'Python runner',
    title: 'Checks and the hint ladder',
    body: 'A failed check names one behaviour and the hint that explains it; the ladder gives the smallest nudge that unblocks you.',
    features: [
      'Behavioral checks grade what the program did, not how the code looks.',
      'The output check compares stdout with the lesson’s expected output and marks the first differing line.',
      'Reveal Hint opens one rung; Hint 2 waits for an attempt after Hint 1.',
      'Instructor assessment lists the badges, the checks and the fix each failing row points at.',
      'Verify records a passing lesson in the learning log; Ask for help packages the failure without the hints.',
    ],
    tab: 'tab-pyodide',
    anchors: [byTestId('results-column'), byTestId('btn-reveal-hint'), byTestId('tab-btn-tab-pyodide')],
  },
  {
    id: 'predict',
    section: 'Python runner',
    title: 'Predict first, then run',
    body: 'The predict gate asks what you think the program will do before the first run; it is graded on meaning, not on wording.',
    features: [
      'Type the expected output or behaviour and submit before pressing Run.',
      'A prediction is compared line by line with tolerant wording, so a synonym is not a failure.',
      'Skip is allowed and recorded as a skip, never as a wrong answer.',
      'A skip or an answer never locks the lesson; the checks still decide the verdict.',
    ],
    tab: 'tab-pyodide',
    anchors: [byTestId('btn-predict'), byTestId('predict-gate'), byTestId('runner-toolbar')],
  },
  {
    id: 'study-tools',
    section: 'Python runner',
    title: 'Notes, review and the study clock',
    body: 'The runner carries the learning tools beside the code, so the reason you tried something survives the run that failed.',
    features: [
      'The Study panel keeps a per-lesson note and lets you highlight a passage.',
      'Review schedules the lesson with FSRS; the deck opens in the same Study panel.',
      'The study clock records a sitting and its total; focus mode keeps the measured time honest.',
      'The self-done checklist and mark-complete are separate from the verified check, so a learner can record effort without claiming a pass.',
    ],
    tab: 'tab-pyodide',
    anchors: [byTestId('self-done-checklist'), byTestId('results-column'), byTestId('runner-toolbar')],
  },
  {
    id: 'collaboration',
    section: 'Python runner',
    title: 'Share, pair and take it offline',
    body: 'Work can leave the browser without an account: a link, a live pair session, or a cached copy of the runtime for the train.',
    features: [
      'Share attempt writes a compact link with the lesson and the code; opening it offers the attempt, never overwrites a draft.',
      'Pair study opens a direct session and can co-edit the same file through the pair transport.',
      'The help sheet packages the run, the traceback and the checks for a person.',
      'Offline take-along warms the page and the interpreter; it says “ready” only when Python itself is cached.',
    ],
    tab: 'tab-pyodide',
    anchors: [byTestId('btn-share-attempt'), byTestId('btn-pair-open'), byTestId('runner-toolbar')],
  },
  {
    id: 'calculator',
    section: 'Python runner',
    title: 'The scientific calculator',
    body: 'The calculator is a tool beside the code: it never touches main.py, the interpreter or a lesson’s verdict.',
    features: [
      'Main and func are the two keypad faces; inverse trig, logs, roots, powers, combinatorics and integer functions live on func.',
      'Rad/deg changes what sin(30) means, and the label beside the answer always says which is active.',
      'Enter keeps a line on the tape; Ans reuses the last answer and a tape row puts its expression back.',
      'Fractions, powers, roots and factorials are typeset while you type; Esc clears the active line.',
    ],
    tab: 'tab-pyodide',
    anchors: [byTestId('calculator-pane'), byTestId('editor-panes'), tabAnchor('tab-pyodide')],
  },
  {
    id: 'graphing',
    section: 'Python runner',
    title: 'The graphing calculator',
    body: 'The Graphing face draws explicit functions on a 2D canvas and implicit equations and inequalities on a WebGL2 layer above it, all built in this app.',
    features: [
      'Type y = sin(x), x^2 + y^2 = 9, y < sin(x), or a piecewise {x < 0: -x, x >= 0: x}.',
      'The colour dot hides or shows a curve; × removes it; Enter adds the next line.',
      'a = 2.5 makes a slider; L1, L2, Kp, Ki and Kd work the same way, and a main.py # @slider takes over the value.',
      'Drag the divider between the list and the sheet to resize the expression panel; drag the sheet to pan, wheel to zoom, hover for a readout.',
      'plot("y = …") and plot_points([(x, y), …]) in main.py push rows into this list on Run.',
      'Zoom +/− and Reset view are on the sheet; rad/deg is in the list header.',
    ],
    tab: 'tab-pyodide',
    anchors: [byTestId('graphing-pane'), byTestId('editor-panes'), tabAnchor('tab-pyodide')],
  },
  {
    id: 'studio-layout',
    section: 'Python runner',
    title: 'Layout presets and sliders',
    body: 'The screen can be the lesson, the code, the checks or the debugger — and a `# @slider` in main.py is a real control, not a comment.',
    features: [
      'Read, Code, Study and Debug are presets; a preset is a view of the same file, never a copy.',
      'Add a pane, split rows or columns, drag a tab onto a pane, and Reset size puts the card back.',
      'A `# @slider name=1 min=0 max=10 step=0.1` line becomes a slider in the runner and in the graph.',
      'Dragging a source slider rewrites the literal in main.py and re-runs the file once per drag.',
    ],
    tab: 'tab-pyodide',
    anchors: [byTestId('layout-presets'), byTestId('editor-panes'), byTestId('editor-panel')],
  },
  {
    id: 'workflow',
    section: 'Python runner',
    title: 'Draw the method on the Workflow canvas',
    body: 'The Workflow pane is the learner’s own diagram of the method: one card per idea, arrows where one leads to the next, and a lesson example to edit rather than a blank page.',
    features: [
      'Workflow is an editor tab beside main.py, Actual and Expected; open it before typing.',
      'Start from this lesson’s example, browse templates, or start blank; nothing here is graded.',
      'Cards, forks, joins, groups and lanes are drawn on the canvas; drag a card to rearrange it.',
      'The run bar walks the cards in order, and the checks list names a missing title, unit or connector.',
      'Export the plan as Mermaid or Markdown, or open it again in Free study from More.',
    ],
    tab: 'tab-pyodide',
    anchors: [byTestId('panel-workflow'), byTestId('editor-tab-workflow'), tabAnchor('tab-pyodide')],
  },

  {
    id: 'roadmap',
    section: 'Course and practice',
    title: 'Roadmap and progress',
    body: 'The roadmap is the whole course in one place: four passes, ten spine steps, milestone cards and the practice that proves each one.',
    features: [
      'Linear and matrix views show the same steps by order or by skill.',
      'Search filters milestones by title, practice or capstone.',
      'A milestone card names its practice, its project and the pass it belongs to; mark it done here.',
      'Depth bar, verified lessons and completion routes show how far this device has come.',
      'Restore Start Here brings back the first-visit card you dismissed.',
    ],
    tab: 'tab-arch',
    anchors: [byTestId('depth-bar'), byTestId('btn-arch-linear'), tabAnchor('tab-arch')],
  },
  {
    id: 'placement',
    section: 'Course and practice',
    title: 'Placement quiz',
    body: 'Placement is a shortcut past what you already know, never a gate and never an edit to your progress.',
    features: [
      'The school-math diagnostic finds the first lesson that still teaches you something.',
      'Every answer is easy to override and no lesson is hidden behind a result.',
      'Reset puts the quiz back without touching verified lessons.',
    ],
    tab: 'tab-placement',
    anchors: [tabAnchor('tab-placement')],
  },
  {
    id: 'micro',
    section: 'Course and practice',
    title: 'Micro-learning',
    body: 'Tiny concepts from P.1 and P.2, about two minutes each, for a phone or the gap between two tasks.',
    features: [
      'Each card is one idea, one question and one explanation, in prerequisite order.',
      'The overview shows the streak, the due cards and the ideas unlocked.',
      'Diagnostics place you without grading you; reset clears the micro record alone.',
      'The beta switch hides the tab without losing any event.',
    ],
    tab: 'tab-micro',
    anchors: [byTestId('micro-hero'), tabAnchor('tab-micro')],
  },
  {
    id: 'studio',
    section: 'Course and practice',
    title: 'Free study',
    body: 'The Studio is the same Python editor and worker with no lesson, no checks and no grade — a scratch bench with a plan and a notebook.',
    features: [
      'Code, Plan and Note are pages; Run, Stop, Vim, breakpoints and Trace are the runner’s own card.',
      'The workflow canvas holds cards, joins and references to parts and requirements.',
      'The notebook is saved with the code, so a reload keeps the why beside the how.',
      'Studio work rides the same backup and uses the reserved studio document key.',
    ],
    tab: 'tab-studio',
    anchors: [byTestId('studio'), tabAnchor('tab-studio')],
  },

  {
    id: 'bode',
    section: 'Labs',
    title: 'Vibration filter and resonance',
    body: 'A live Bode plot of a compliant shaft with a digital biquad notch, so stiffness, damping and inertia become a picture.',
    features: [
      'Shaft stiffness, damping and load inertia move the resonance peak.',
      'Notch quality factor and digital biquad parameters shape the filter in real time.',
      'The unfiltered peak and the anti-resonance marker name what the filter is fighting.',
    ],
    tab: 'tab-bode',
    anchors: [tabAnchor('tab-bode')],
  },
  {
    id: 'foc',
    section: 'Labs',
    title: 'Brushless motor control',
    body: 'Field-oriented control on screen: Clarke and Park transforms, two current loops and SVPWM, with the gains you would tune on a real drive.',
    features: [
      'Kp / Ki and current-loop bandwidth change the step response.',
      'The q-axis command and the mechanical speed show the loop’s tracking.',
      'Decoupling feedforward and SVPWM boost are switches, not hidden constants.',
    ],
    tab: 'tab-foc',
    anchors: [tabAnchor('tab-foc')],
  },
  {
    id: 'pendulum',
    section: 'Labs',
    title: 'Pendulum balance and safety',
    body: 'Nonlinear swing-up, LQR balancing and a control-barrier wall in one simulation.',
    features: [
      'Energy pumping and the LQR angle weight change how the pendulum gets up and stays up.',
      'The CBF wall shows the safety limit being enforced, not only drawn.',
      'Base position and live kinematics tie the plot back to the model.',
    ],
    tab: 'tab-pend',
    anchors: [tabAnchor('tab-pend')],
  },
  {
    id: 'sysid',
    section: 'Labs',
    title: 'System identification',
    body: 'A Schroeder multisine sweep excites the plant, averages the periods and reports the RMS error of the fitted model.',
    features: [
      'Measurement noise and crest factor are inputs you can make worse on purpose.',
      'Active phasing and excited harmonics show what the sweep actually contains.',
      'Zero-phase crest factor and averaged periods explain the gain in signal quality.',
    ],
    tab: 'tab-sysid',
    anchors: [tabAnchor('tab-sysid')],
  },
  {
    id: 'eskf',
    section: 'Labs',
    title: 'IMU fusion and the real-time lock',
    body: 'An error-state Kalman filter beside a wait-free seqlock, so the cost of a torn read is visible as a number.',
    features: [
      'True gyro bias and measurement noise move the steady-state error.',
      'Joseph-form covariance keeps the estimate stable through the update.',
      'Toggle the seqlock against an unprotected struct to count torn reads and mean latency.',
    ],
    tab: 'tab-eskf',
    anchors: [tabAnchor('tab-eskf')],
  },
  {
    id: 'models',
    section: 'Labs',
    title: 'Robot arm and safety cutoff',
    body: 'The arm, its links and its safety envelope: kinematics you can inspect instead of imagine.',
    features: [
      'L1 and L2 are the same parameters the graph plots.',
      'Joint controls move the end effector through the reachable workspace.',
      'STO state, encoder wire break and gate reaction time show what a safety cutoff really does.',
    ],
    tab: 'tab-models',
    anchors: [tabAnchor('tab-models')],
  },
  {
    id: 'cadpcb',
    section: 'The build',
    title: 'Parts and the motor-driver PCB',
    body: 'The same build in space: flexures, MOSFETs, current paths and the board that drives them.',
    features: [
      'RefDes, rating and function identify each part on the board.',
      'Derating, inverter efficiency and SVPWM frequency show the electrical margin.',
      'Flexure web thickness and burst length connect the mechanical and the electrical limits.',
    ],
    tab: 'tab-cadpcb',
    anchors: [tabAnchor('tab-cadpcb')],
  },
  {
    id: 'project',
    section: 'The build',
    title: 'Project Mode: parts, ids and budget',
    body: 'The bill of materials a design is actually made of, with a reason and a budget line for every part.',
    features: [
      'Search by name, number or id; placements show where the part sits.',
      'Category, rating, derating and line cost are fields, not prose.',
      'Pick a part to see the id, the rating and the cost together.',
      'The budget is a constraint to read, not a score to optimize.',
    ],
    tab: 'tab-project',
    anchors: [tabAnchor('tab-project')],
  },
  {
    id: 'requirements',
    section: 'The build',
    title: 'Requirements and part links',
    body: 'Every requirement points at the parts that satisfy it, so the design stays honest as it grows.',
    features: [
      'Pick a requirement to see its number and the parts that answer it.',
      'A part card opens the same object Project Mode shows.',
      'A requirement with no parts is visible as a gap, not a silent omission.',
    ],
    tab: 'tab-req',
    anchors: [tabAnchor('tab-req')],
  },
  {
    id: 'board',
    section: 'The build',
    title: 'Compile and run an Arduino sketch',
    body: 'The board tab runs a real compiled AVR sketch in an emulator and streams its serial output, with no hardware attached.',
    features: [
      'Select a sketch, run, stop and reset the emulator.',
      'Serial output is the first debugger: every print lands in the monitor.',
      'The verdict and the timing check grade the sketch the way the lesson describes it.',
      'The same sketch compiles for the physical target.',
    ],
    tab: 'tab-board',
    anchors: [tabAnchor('tab-board')],
  },
  {
    id: 'links',
    section: 'The build',
    title: 'Citation link health',
    body: 'The course cites datasheets and app notes; a nightly check records which links still respond.',
    features: [
      'Served, failed, blocked and not-checked counts are separate.',
      'The table names the last time each URL answered and the lessons that reference it.',
      'Recurring unverified hosts and the history chart show drift before a lesson teaches stale hardware.',
      'A dead link is a broken reference, never a broken lesson: every lesson stays readable offline.',
    ],
    tab: 'tab-links',
    anchors: [tabAnchor('tab-links')],
  },
];

export const FEATURE_WALKTHROUGH_COUNT = FEATURE_WALKTHROUGH.length;

/** A chapter of the tour: the stops that share a `section`, in catalogue order. */
export interface WalkthroughSection {
  name: string;
  /** The global index of the section's first stop. */
  first: number;
  count: number;
  /** The compact name the card's section rail has room to draw. */
  short: string;
}

const SECTION_SHORT_NAMES: Readonly<Record<string, string>> = {
  'The shell': 'Shell',
  'Python runner': 'Runner',
  'Course and practice': 'Course',
  Labs: 'Labs',
  'The build': 'Build',
};

function buildSections(): WalkthroughSection[] {
  const sections: WalkthroughSection[] = [];
  for (const [index, stop] of FEATURE_WALKTHROUGH.entries()) {
    const current = sections[sections.length - 1];
    if (current && current.name === stop.section) {
      current.count += 1;
    } else {
      sections.push({
        name: stop.section,
        first: index,
        count: 1,
        short: SECTION_SHORT_NAMES[stop.section] ?? stop.section,
      });
    }
  }
  return sections;
}

/** The tour's chapters, derived from the catalogue so a new stop cannot fall between them. */
export const FEATURE_WALKTHROUGH_SECTIONS: readonly WalkthroughSection[] = buildSections();

/** The chapter a global stop index belongs to. */
export function walkthroughSectionAt(index: number): WalkthroughSection {
  return (
    FEATURE_WALKTHROUGH_SECTIONS.find(
      (section) => index >= section.first && index < section.first + section.count
    ) ?? FEATURE_WALKTHROUGH_SECTIONS[0]!
  );
}

/** The global indices of every stop that belongs to one tab, in tour order. */
export function walkthroughIndicesForTab(tab: TabId): number[] {
  return FEATURE_WALKTHROUGH.flatMap((stop, index) => (stop.tab === tab ? [index] : []));
}

/**
 * The one control a stop asks the learner to use.
 *
 * A stop's `anchors` only choose what the spotlight measures; they are allowed to fall back to a
 * whole panel so the card still has somewhere to point when a lazy tab has not drawn yet. The
 * action is deliberately narrower: it names the exact buttons that do what the stop describes, and
 * only a click on one of those crosses the checklist row off. The card never presses the control
 * for the learner, and Next never waits for the tick — the walkthrough points at the workbench,
 * it does not gate it.
 */
export interface WalkthroughAction {
  /** The sentence in the checklist: the task, not a description of the stop. */
  label: string;
  /** Controls in preference order. The first one on screen is the one the card outlines. */
  selectors: readonly string[];
  /** A disclosure that must be opened first when the real action lives inside it. */
  reveal?: readonly string[];
  /** The target is a tab the learner must open, so the tour leaves the current tab alone. */
  opensTab?: boolean;
}

/**
 * Every stop's real action. Kept beside the catalogue instead of inside each object so the audit is
 * one readable list: a new stop without an entry fails `scripts/test_learner_guide.mjs`.
 */
export const WALKTHROUGH_ACTIONS: Readonly<Record<string, WalkthroughAction>> = {
  brand: {
    label: 'Open the introduction from the wordmark.',
    selectors: [byTestId('link-brand')],
  },
  levels: {
    label: 'Choose the Start Here level link.',
    selectors: [byTestId('btn-pass-level0')],
  },
  navigate: {
    label: 'Open Review from the Navigate tray.',
    selectors: [byTestId('btn-open-review')],
  },
  appearance: {
    label: 'Press the theme toggle.',
    selectors: [byTestId('btn-theme-toggle')],
  },
  settings: {
    label: 'Open General settings.',
    selectors: [byTestId('btn-general-settings')],
  },
  reset: {
    label: 'Open the Reset panel.',
    selectors: [byTestId('btn-open-reset')],
  },
  account: {
    label: 'Open the account chip.',
    selectors: [byTestId('btn-account')],
  },
  rail: {
    label: 'Collapse or expand the workbench rail.',
    selectors: [byTestId('btn-rail-toggle')],
  },
  palette: {
    label: 'Open Search for course text.',
    selectors: [byTestId('btn-open-palette')],
  },
  home: {
    label: 'Go to the Home page.',
    selectors: [byTestId('btn-home')],
  },
  'lesson-list': {
    label: 'Open the lesson chooser.',
    selectors: [byTestId('btn-lessons-toggle'), byTestId('btn-lessons')],
  },
  'lesson-reader': {
    label: 'Choose the Study layout to put the brief beside the editor.',
    selectors: [byTestId('layout-study')],
  },
  editor: {
    label: 'Open main.py in the editor.',
    selectors: [byTestId('editor-tab-main')],
  },
  run: {
    label: 'Run and verify the lesson.',
    selectors: [byTestId('btn-run-verify')],
  },
  checks: {
    label: 'Open the Cases checks pane.',
    selectors: [byTestId('editor-tab-cases')],
  },
  predict: {
    label: 'Open the Predict gate.',
    selectors: [byTestId('btn-predict')],
  },
  'study-tools': {
    label: 'Open the Study pane.',
    selectors: [byTestId('editor-tab-study')],
  },
  collaboration: {
    label: 'Open More, then press Share to package this attempt.',
    selectors: [byTestId('btn-share-attempt')],
    reveal: [byTestId('btn-more')],
  },
  calculator: {
    label: 'Open the Calculator pane.',
    selectors: [byTestId('editor-tab-calculator')],
  },
  graphing: {
    label: 'Switch the calculator to Graphing.',
    selectors: [byTestId('calculator-mode-graphing')],
  },
  'studio-layout': {
    label: 'Choose the Debug layout preset.',
    selectors: [byTestId('layout-debug')],
  },
  workflow: {
    label: 'Open the Workflow tab in the editor strip.',
    selectors: [byTestId('editor-tab-workflow')],
  },
  roadmap: {
    label: 'Switch the roadmap to Linear.',
    selectors: [byTestId('btn-arch-linear')],
  },
  placement: {
    label: 'Open the school-math diagnostic.',
    selectors: [byTestId('tab-math-diagnostic')],
  },
  micro: {
    label: 'Start the next micro concept.',
    selectors: [byTestId('micro-next')],
  },
  studio: {
    label: 'Run the studio file.',
    selectors: [byTestId('studio-run')],
  },
  bode: {
    label: 'Auto-tune the notch to the resonance.',
    selectors: [byTestId('bode-auto-tune')],
  },
  foc: {
    label: 'Toggle decoupling feedforward.',
    selectors: [byTestId('foc-decoupling')],
  },
  pendulum: {
    label: 'Inject a kick into the pendulum.',
    selectors: [byTestId('pendulum-impulse')],
  },
  sysid: {
    label: 'Toggle the phase schedule mode.',
    selectors: [byTestId('sysid-phase-mode')],
  },
  eskf: {
    label: 'Toggle the seqlock protection.',
    selectors: [byTestId('eskf-seqlock')],
  },
  models: {
    label: 'Enable the arm closed loop.',
    selectors: [byTestId('models-closed-loop')],
  },
  cadpcb: {
    label: 'Open the flexure part on the board.',
    selectors: [byTestId('cadpcb-part-flexure')],
  },
  project: {
    label: 'Copy the selected part id.',
    selectors: [byTestId('project-copy-id')],
  },
  requirements: {
    label: 'Open a part that meets the selected requirement.',
    // The part buttons carry their stable part id rather than a generated index, so this names
    // every part link on the requirement without depending on the list's order.
    selectors: ['[data-testid="requirements-mode"] [data-part-id]'],
  },
  board: {
    label: 'Run the selected Arduino sketch.',
    selectors: [byTestId('board-tab-run')],
  },
  links: {
    label: 'Open the Link Health tab.',
    selectors: [tabAnchor('tab-links')],
    opensTab: true,
  },
};

/** The action for a stop, or null when the catalogue and the action list have drifted apart. */
export function walkthroughAction(stopId: string): WalkthroughAction | null {
  return WALKTHROUGH_ACTIONS[stopId] ?? null;
}

export type WalkthroughStatus = 'not-started' | 'active' | 'completed' | 'dismissed';

export interface WalkthroughState {
  version: number;
  status: WalkthroughStatus;
  /** The 0-based catalogue index; persisted with a stable stop id so insertions cannot move it. */
  index: number;
  /** The stops whose mission was actually performed, by id. A checklist survives a reload. */
  completed: string[];
  updatedAt: number;
}

/** What is written to storage: the state plus the stable id of its current stop. */
interface StoredWalkthroughState extends WalkthroughState {
  stopId?: string;
}

/** The tiny part of `Storage` this module uses, so the unit suite can pass a plain object. */
export interface WalkthroughStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStore(): WalkthroughStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function clampIndex(index: number): number {
  if (!Number.isInteger(index)) return 0;
  return Math.min(Math.max(index, 0), FEATURE_WALKTHROUGH_COUNT - 1);
}

export function initialWalkthroughState(now = Date.now()): WalkthroughState {
  return {
    version: FEATURE_WALKTHROUGH_VERSION,
    status: 'not-started',
    index: 0,
    completed: [],
    updatedAt: now,
  };
}

/** The ids in a saved list that name a real stop, in catalogue order and without duplicates. */
function readCompleted(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const saved = new Set(value.filter((entry): entry is string => typeof entry === 'string'));
  return FEATURE_WALKTHROUGH.filter((stop) => saved.has(stop.id)).map((stop) => stop.id);
}

/** The current index of a stable stop id, or null when the id is unknown. */
function walkthroughIndexForId(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const index = FEATURE_WALKTHROUGH.findIndex((stop) => stop.id === value);
  return index >= 0 ? index : null;
}

/**
 * Resolve a saved position to today's catalogue.
 *
 * The stop id wins whenever it names a real stop, so a later insertion anywhere in the catalogue
 * leaves the learner on the same feature. A version-3 record has no id, so its numeric position is
 * shifted past the Workflow stop before it is clamped. A version-4 record with a missing or stale
 * id falls back to its number rather than losing the place entirely.
 */
function readWalkthroughIndex(record: Partial<StoredWalkthroughState>): number {
  const stable = walkthroughIndexForId(record.stopId);
  if (stable !== null) return stable;
  const saved = typeof record.index === 'number' ? record.index : 0;
  const version = typeof record.version === 'number' ? record.version : 0;
  const migrated =
    version < FEATURE_WALKTHROUGH_VERSION && saved >= V4_WORKFLOW_INSERTION_INDEX
      ? saved + 1
      : saved;
  return clampIndex(migrated);
}

export function readWalkthroughState(store: WalkthroughStore | null = browserStore()): WalkthroughState {
  try {
    const raw = store?.getItem(FEATURE_WALKTHROUGH_STORAGE_KEY);
    if (!raw) return initialWalkthroughState();
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return initialWalkthroughState();
    const record = parsed as Partial<StoredWalkthroughState>;
    const status: WalkthroughStatus =
      record.status === 'active' ||
      record.status === 'completed' ||
      record.status === 'dismissed' ||
      record.status === 'not-started'
        ? record.status
        : 'not-started';
    // A checklist is honest only if it was earned under the current action rules. Version 3 made
    // every stop require its real control; a list saved by the old free-pass card is dropped while
    // the learner's place in the tour is kept. Version 4 only added the stable position, so the
    // version-3 ticks are still valid.
    const version = typeof record.version === 'number' ? record.version : 0;
    return {
      version: FEATURE_WALKTHROUGH_VERSION,
      status,
      index: readWalkthroughIndex(record),
      completed:
        version >= WALKTHROUGH_COMPLETION_VERSION ? readCompleted(record.completed) : [],
      updatedAt: typeof record.updatedAt === 'number' ? record.updatedAt : 0,
    };
  } catch {
    return initialWalkthroughState();
  }
}

export function writeWalkthroughState(
  state: WalkthroughState,
  store: WalkthroughStore | null = browserStore()
): WalkthroughState {
  try {
    const index = clampIndex(state.index);
    const stop = FEATURE_WALKTHROUGH[index]!;
    const stored: StoredWalkthroughState = {
      ...state,
      version: FEATURE_WALKTHROUGH_VERSION,
      index,
      stopId: stop.id,
    };
    store?.setItem(FEATURE_WALKTHROUGH_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // A blocked store costs the memory, never the tour.
  }
  return state;
}

/** A finished tour starts from the top with a fresh checklist; one turned off midway resumes. */
export function resumeWalkthroughState(state: WalkthroughState, now = Date.now()): WalkthroughState {
  const restart = state.status === 'completed';
  return {
    ...state,
    status: 'active',
    index: restart ? 0 : clampIndex(state.index),
    completed: restart ? [] : readCompleted(state.completed),
    updatedAt: now,
  };
}

/**
 * The state a tour opens with.
 *
 * The full walk resumes the learner's place and starts over only after a completed walk. A page
 * tour must never rewrite that place, so it reads the saved state exactly as stored — including a
 * completed index — and keeps every scoped move in component-local state. This is the one door the
 * card uses, so a page tour cannot reset the full walk by opening or checking a stop.
 */
export function entryWalkthroughState(
  scoped: boolean,
  store: WalkthroughStore | null = browserStore()
): WalkthroughState {
  const saved = readWalkthroughState(store);
  return scoped ? saved : resumeWalkthroughState(saved);
}

/**
 * Clear every earned point and start the tour from its first stop.
 *
 * Only the checklist is erased: the tour stays open, and a learner who resets can walk it again
 * from the top without reloading the page or losing their place in the workbench.
 */
export function resetWalkthroughState(now = Date.now()): WalkthroughState {
  return { ...initialWalkthroughState(now), status: 'active' };
}

/** Check one stop off. Repeated calls are a no-op, so a double click cannot score twice. */
export function completeWalkthroughStop(
  state: WalkthroughState,
  id: string,
  now = Date.now()
): WalkthroughState {
  if (state.completed.includes(id)) return state;
  return {
    ...state,
    status: 'active',
    completed: [...state.completed, id],
    updatedAt: now,
  };
}

/** How many stops are checked, which is the score the card prints. */
export function walkthroughCheckedCount(state: WalkthroughState): number {
  return state.completed.length;
}

export function nextWalkthroughState(state: WalkthroughState, now = Date.now()): WalkthroughState {
  if (state.index >= FEATURE_WALKTHROUGH_COUNT - 1) {
    return { ...state, status: 'completed', updatedAt: now };
  }
  return { ...state, status: 'active', index: clampIndex(state.index + 1), updatedAt: now };
}

export function previousWalkthroughState(state: WalkthroughState, now = Date.now()): WalkthroughState {
  return { ...state, status: 'active', index: clampIndex(state.index - 1), updatedAt: now };
}

export function dismissWalkthroughState(state: WalkthroughState, now = Date.now()): WalkthroughState {
  return { ...state, status: 'dismissed', updatedAt: now };
}

export function walkthroughAnnouncement(index: number): string {
  const stop = FEATURE_WALKTHROUGH[clampIndex(index)];
  return stop ? `Feature ${clampIndex(index) + 1} of ${FEATURE_WALKTHROUGH_COUNT}: ${stop.title}` : '';
}
