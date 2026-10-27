import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Header } from './components/Header';
import { GuidedTourBar, TourStepInfo } from './components/GuidedTourBar';
import { CheatSheetModal } from './components/CheatSheetModal';
import { CommandPalette } from './components/CommandPalette';
import { ShortcutsModal } from './components/ShortcutsModal';
import { lessonSearchItems } from './lessonSearch';
import { loadProseIndex, proseSearchItems, type ProsePage } from './proseSearch';
import { SimulatorTierBanner } from './components/SimulatorTierBanner';
import { StartHereCard } from './components/StartHereCard';
import { StoryCard } from './components/game/StoryCard';
import { markStorySeen, readStorySeen } from './story';
// The toast ships with the reward engine, not with the first screen: it can only appear after a
// verification, and by then its chunk is already fetched beside the rules that decided it.
const AwardToast = React.lazy(() =>
  import('./components/game/AwardToast').then((module) => ({ default: module.AwardToast }))
);
// The reward engine is fetched when a verification earns something, not on every visit: the rules,
// the ladder and the mission model are ~4 kB gzipped that a learner who never verifies never needs.
// `import type` is erased, so the type does not pull the module back into the entry chunk.
import type { Award } from './gamification/rewards';
import { readPredictions } from './predictGate';
import { STORAGE_KEY_START_HERE_DISMISSED } from './startHere';
import { SPINE_STEP_COUNT, stepForMilestone } from './spine';
import { passChangesContent } from './courseLevels';
// The runner is the tab the app opens on, so it is imported statically: its code is on the first
// screen either way, and a lazy boundary there would only add a fetch before the lesson appears.
import { TabPyodideRunner } from './components/tabs/TabPyodideRunner';

// Every other tab is its own chunk (`React.lazy` + the import below), fetched when the learner opens
// it. Ten tabs' code — the simulators, the placement quiz, the roadmap's matrix, the link history —
// used to be in the one bundle every visit downloaded, whether or not the tab was ever opened
// (`npm run check:weight` measures the result: `entry_gzip` in docs/weight-budget.json).
//
// `React.lazy` needs a default export per module, and these are named, so each import is reshaped.
// The Suspense fallback is deliberately the tab's own frame rather than a spinner: a tab switch
// keeps the rail, the header and the scroll position, and the panel fills in behind it.
//
// The same importer function is what `prefetchTab` calls, so the rail can fetch a chunk on intent
// (pointer-enter, focus) and the module registry is asked exactly once: Vite resolves both calls to
// the same dynamic import, and the browser's module cache serves the second.
const importTabArchitecture = () =>
  import('./components/tabs/TabArchitecture').then((module) => ({ default: module.TabArchitecture }));
const importTabPlacementQuiz = () =>
  import('./components/tabs/TabPlacementQuiz').then((module) => ({ default: module.TabPlacementQuiz }));
const importTabBode = () =>
  import('./components/tabs/TabBode').then((module) => ({ default: module.TabBode }));
const importTabFOC = () =>
  import('./components/tabs/TabFOC').then((module) => ({ default: module.TabFOC }));
const importTabPendulum = () =>
  import('./components/tabs/TabPendulum').then((module) => ({ default: module.TabPendulum }));
const importTabModels = () =>
  import('./components/tabs/TabModels').then((module) => ({ default: module.TabModels }));
const importTabCadPcb = () =>
  import('./components/tabs/TabCadPcb').then((module) => ({ default: module.TabCadPcb }));
const importTabSysId = () =>
  import('./components/tabs/TabSysId').then((module) => ({ default: module.TabSysId }));
const importTabEskf = () =>
  import('./components/tabs/TabEskf').then((module) => ({ default: module.TabEskf }));
const importTabLinkHealth = () =>
  import('./components/tabs/TabLinkHealth').then((module) => ({ default: module.TabLinkHealth }));
const importTabBoard = () =>
  import('./components/tabs/TabBoard').then((module) => ({ default: module.TabBoard }));

const TabArchitecture = React.lazy(importTabArchitecture);
const TabPlacementQuiz = React.lazy(importTabPlacementQuiz);
const TabBode = React.lazy(importTabBode);
const TabFOC = React.lazy(importTabFOC);
const TabPendulum = React.lazy(importTabPendulum);
const TabModels = React.lazy(importTabModels);
const TabCadPcb = React.lazy(importTabCadPcb);
const TabSysId = React.lazy(importTabSysId);
const TabEskf = React.lazy(importTabEskf);
const TabLinkHealth = React.lazy(importTabLinkHealth);
const TabBoard = React.lazy(importTabBoard);

/** Fetch a tab's chunk before it is opened. The runner has none: it is imported statically. */
const TAB_PREFETCH: Record<string, () => Promise<unknown>> = {
  'tab-arch': importTabArchitecture,
  'tab-placement': importTabPlacementQuiz,
  'tab-bode': importTabBode,
  'tab-foc': importTabFOC,
  'tab-pend': importTabPendulum,
  'tab-models': importTabModels,
  'tab-cadpcb': importTabCadPcb,
  'tab-sysid': importTabSysId,
  'tab-eskf': importTabEskf,
  'tab-board': importTabBoard,
  'tab-links': importTabLinkHealth,
};

function prefetchTab(tabId: string): void {
  void TAB_PREFETCH[tabId]?.();
}
import { PresetRequest, tabForPreset } from './demoPresets';
import type { SignUpOutcome } from './components/AccountPanel';
import {
  accountsConfigured,
  currentSession,
  isRecoveryLink,
  loadMyRole,
  onSessionChange,
  sendMagicLink,
  sendPasswordReset,
  sessionProviders,
  signInWithGoogle,
  signInWithPassword,
  signOutNow,
  signUpWithPassword,
  updatePassword,
} from './accounts';
import { deleteAccount, exportAccountData } from './accountActions';
import { authCallbackProblem, emailProblem, passwordProblem } from './accountRules';
import { loadProgress, saveProgress } from './cloudProgress';
import { parseReturnTarget } from './returnTo';
import { defaultPublicSettings, flagOn, type PublicSettings } from './siteSettingsModel';
import { loadPublicSettings } from './siteSettings';
import {
  mergeAndApplyWorkspace,
  previewWorkspace,
  setWorkspaceSyncEnabled,
  workspaceSyncEnabled,
  type WorkspaceSyncReport,
} from './workspaceSync';
import type { DashboardEvent, DashboardStudy } from './dashboardData';
import { readDrafts } from './lessonDraft';
import { dueCards, syncCards } from './studyCards';
import { mergeProgress, PROGRESS_SCHEMA, type ProgressSnapshot } from './progressMerge';
import {
  STORAGE_KEY_COMPLETED,
  STORAGE_KEY_MILESTONES,
  STORAGE_KEY_PROGRESS_UPDATED,
  STORAGE_KEY_VERIFIED,
  readFlagMap,
} from './progressKeys';
import { STORE_RESTORED_EVENT } from './backupBundle';
import { FOCUS_EVENT, focusLabel, readFocus, setFocus } from './focusMode';
import { SoundControlLazy } from './components/SoundControlLazy';
import { SoundClicks } from './components/SoundClicks';
import { attemptsByLesson, downloadLearningLog, readLearningLog, replaceLearningLog } from './learningLog';
import type { Session } from '@supabase/supabase-js';
import { TabId } from './types';
import { PYTHON_LESSONS } from './data/pythonLessonsData';
import { useTheme } from './useTheme';
import { actionForEvent } from './keymap';
import { useKeymap } from './useKeymap';
import { ThemeTokens } from './components/ThemeTokens';
import { themeViewFromLocation, themeViewSearch } from './themeRoute';
import { PYTHON_TAB_NAME, TAB_NAMES, labsSwitchLabel } from './tabNames';
import { APP_VERSION } from './appVersion';
import { isKnownLesson, lessonIdFromLocation } from './lessonRoute';
import { readSharedAttempt, type SharedAttempt } from './shareLink';
import { readTrySnippet } from './tryLink';
import { readLastLessonId, lessonOffer } from './lastLesson';
import {
  hasLocalProgress,
  landingPage,
  noteVisit,
  readLastVisit,
  type HomePage,
} from './homeLanding';
import { readReadingPosition } from './readingPosition';
import { editedLines, readDraft } from './lessonDraft';
import { draftProgress } from './lessonCoach';
import { lessonIdOf, type PaletteItem, type PaletteMode } from './palette';
import { paletteCatalog } from './paletteCatalog';
import {
  ActiveTierPass,
  LEVEL_0_STEPS,
  TIER_1_LINEAR_PASS,
  TIER_2_LINEAR_PASS,
  TIER_3_LINEAR_PASS,
} from './curriculumData';
import {
  Activity,
  Bot,
  Check,
  Code2,
  Compass,
  Copy,
  CircuitBoard,
  Cpu,
  Download,
  FlaskConical,
  Gauge,
  GraduationCap,
  LineChart,
  Link2,
  Map as MapIcon,
  Maximize2,
  Minimize2,
  Radar,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * The three whole-screen views. The account panel, the learner dashboard and the admin area are
 * split into their own chunks: a visitor who never signs in should not download them, and the weight
 * budget is a promise to the first lesson, not to a settings page.
 */
const AccountPanel = React.lazy(() =>
  import('./components/AccountPanel').then((module) => ({ default: module.AccountPanel }))
);const HomeDashboard = React.lazy(() =>
  import('./components/home/HomeDashboard').then((module) => ({ default: module.HomeDashboard }))
);

const AdminDashboard = React.lazy(() =>
  import('./components/AdminDashboard').then((module) => ({ default: module.AdminDashboard }))
);

/**
 * The whole-screen pages. Home replaced the old `dashboard` route; `?view=dashboard` is kept as an
 * alias so a bookmark, an account-mail link and `e2e_game.mjs` still land on the same page.
 */
type WholePage = HomePage;

function pageFromLocation(): WholePage {
  if (typeof window === 'undefined' || !window.location) return 'workbench';
  const params = new URLSearchParams(window.location.search || '');
  return landingPage({
    view: params.get('view'),
    hasLesson: params.has('lesson'),
    lastVisit: readLastVisit(),
    hasProgress: hasLocalProgress(),
  });
}

/** The sentence shown after a workspace merge: what arrived, and what was kept twice. */
function workspaceReportLine(report: WorkspaceSyncReport): string {
  const parts: string[] = [];
  if (report.addedDrafts) parts.push(`${report.addedDrafts} draft(s)`);
  if (report.addedNotes) parts.push(`${report.addedNotes} note(s)`);
  if (report.addedHighlights) parts.push(`${report.addedHighlights} highlight(s)`);
  const arrived = parts.length
    ? `${parts.join(', ')} came in from your account.`
    : 'This browser and your account were already in step.';
  const kept = report.conflicts
    ? ` ${report.conflicts} version(s) differed; both copies were kept.`
    : '';
  const stored = report.stored ? '' : ' This browser refused the write — the account still has the merged copy.';
  return `${arrived}${kept}${stored}`;
}

/** One glyph per tab, so the rail can be scanned by shape as well as by name. */
const TAB_ICONS: Record<TabId, LucideIcon> = {
  'tab-arch': MapIcon,
  'tab-pyodide': Code2,
  'tab-placement': Compass,
  'tab-bode': Activity,
  'tab-foc': Zap,
  'tab-pend': Gauge,
  'tab-models': Bot,
  'tab-cadpcb': Cpu,
  'tab-sysid': LineChart,
  'tab-eskf': Radar,
  'tab-board': CircuitBoard,
  'tab-links': Link2,
};

const TOUR_STEPS: TourStepInfo[] = [
  {
    tab: 'tab-arch',
    targetId: null,
    title: 'Tour 1 / 8 — The Ten-Step Roadmap (Steps 1–10, Depths 1–3)',
    desc: 'Steps 1 and 2 are Python and circuits; Steps 3–10 are one joint and then the 2-DOF arm, in order. Depth 2 and Depth 3 keep the same step numbers and raise what each step asks for. Click "Next Step →" to test the simulators!',
  },
  {
    tab: 'tab-bode',
    targetId: 'sl-fn',
    title: 'Tour 2 / 8 — Canceling Mechanical Vibration with a Notch Filter',
    desc: 'Notice the highlighted Notch Center slider. When detuned from the resonance frequency, the green curve has a large vibration peak. Drag the slider or click "Apply Demo Preset" to watch the filter surgically erase the vibration peak.',
  },
  {
    tab: 'tab-foc',
    targetId: 'btn-dec-toggle',
    title: 'Tour 3 / 8 — Brushless Motor Field-Oriented Control (FOC) & Decoupling',
    desc: 'At high RPM, spinning magnets induce cross-coupling voltages (±ω_e L i_q). Click the highlighted "Toggle Decoupling Feedforward" button to see how turning off feedforward decoupling causes a large rose-colored i_d current error spike!',
  },
  {
    tab: 'tab-pend',
    targetId: 'sl-xmax',
    title: 'Tour 4 / 8 — Pendulum Energy Swing-Up, Balancing & Safety Walls',
    desc: 'Watch the Furuta Pendulum pump energy until upright and catch itself! Drag the highlighted Safety Wall slider (x_max) inward or click "Apply Demo Preset" to inject a +3.2 rad/s kick—the safety filter brakes the cart before crossing the red walls.',
  },
  {
    tab: 'tab-models',
    targetId: 'sl-rq2',
    title: 'Tour 5 / 8 — 3D Robot Arm Kinematics & Sub-Microsecond Safety Cutoff (STO)',
    desc: 'Drag the highlighted Joint q_2 slider to articulate the 3-DOF Hopping Leg, or click "Apply Demo Preset" to inject a 42A Overcurrent Short and watch the dual-channel hardware STO trip the MOSFET gates to SAFE HIGH-Z in 0.65 μs!',
  },
  {
    tab: 'tab-cadpcb',
    targetId: 'sl-pcbl',
    title: 'Tour 6 / 8 — 3D Flexure Hinges & Motor Driver PCB Voltage Spikes',
    desc: 'Drag the highlighted Loop Inductance slider (L_loop) above 4.0 nH: notice how V_DS,peak turns red (>60V) because stray PCB trace inductance spikes during turn-off! Click "Apply Demo Preset" to snap back to our 6-layer 1.6 nH layout.',
  },
  {
    tab: 'tab-sysid',
    targetId: 'btn-sysmode-toggle',
    title: 'Tour 7 / 8 — Sine-Sweep & Multisine System Identification',
    desc: 'Notice how zero-phase cosines (φ_k = 0) create a giant impulse spike at t=0 (CF = 8.00) that clips the actuator! Click "Apply Demo Preset" to switch to Schroeder quadratic phasing—compressing Crest Factor to 1.71 and locking onto the true cyan plant curve.',
  },
  {
    tab: 'tab-eskf',
    targetId: 'btn-seqlock-toggle',
    title: 'Tour 8 / 8 — IMU Attitude Sensor Fusion & Torn-Read Protection',
    desc: 'When WaitFreeSeqLock is disabled, the 40 kHz motor ISR overwrites the telemetry struct mid-read—causing violent red torn-read spikes! Click "Apply Demo Preset" to enable atomic sequence locking (0 torn reads in 29.6 ns) while estimating gyro bias.',
  },
];

export const STORAGE_KEY_TIER = 'mechalab_active_tier_pass_v1';
export const STORAGE_KEY_VIEW_MODE = 'mechalab_view_mode_v1';
// The progress keys live in `progressKeys.ts` (the backup reads the same stores without importing
// React); re-exported here so the existing importers keep their names.
export { STORAGE_KEY_COMPLETED, STORAGE_KEY_MILESTONES, STORAGE_KEY_VERIFIED };

function readProgressUpdatedAt(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROGRESS_UPDATED);
    return raw ? Number(raw) || 0 : 0;
  } catch {
    return 0;
  }
}

/** What this browser would upload: the same three maps the UI reads, plus the learning log. */
function localSnapshot(): ProgressSnapshot {
  return {
    schema: PROGRESS_SCHEMA,
    updatedAt: readProgressUpdatedAt(),
    verifiedLessons: readFlagMap(STORAGE_KEY_VERIFIED),
    completedLessons: readFlagMap(STORAGE_KEY_COMPLETED),
    completedMilestones: readFlagMap(STORAGE_KEY_MILESTONES),
    learningLog: readLearningLog(),
  };
}

export type WorkbenchViewMode = 'beginner' | 'advanced';

export interface WorkbenchTabMeta {
  id: TabId;
  beginnerLabel: string;
  /** The plain-English second line in Beginner View; keep acronyms out of it. */
  beginnerSubtitle: string;
  technicalLabel: string;
  technicalSubtitle: string;
  isBeginnerCore: boolean;
}

export const WORKBENCH_TABS: WorkbenchTabMeta[] = [
  {
    id: 'tab-arch',
    beginnerLabel: TAB_NAMES['tab-arch'],
    beginnerSubtitle: 'Four passes, and the practice each step asks for',
    technicalLabel: 'Linear Tier Roadmap (Tracks 00→08)',
    technicalSubtitle: 'Track P · Stage 0 · Depths 1–3 Matrix',
    isBeginnerCore: true,
  },
  {
    id: 'tab-pyodide',
    beginnerLabel: `${PYTHON_TAB_NAME} (${PYTHON_LESSONS.length} lessons & exercises)`,
    beginnerSubtitle: 'Write code, press Run, see what passes',
    technicalLabel: 'In-Browser Python Runner (Pyodide WASM)',
    technicalSubtitle: 'Pyodide WASM · 3-Step Hints · Asserts',
    isBeginnerCore: true,
  },
  {
    id: 'tab-placement',
    beginnerLabel: `${TAB_NAMES['tab-placement']} (Skip What You Know)`,
    beginnerSubtitle: 'Find the right starting step',
    technicalLabel: 'Prerequisite Placement Quiz',
    technicalSubtitle: '8 Module Skip-Gate Checkpoints',
    isBeginnerCore: true,
  },
  {
    id: 'tab-bode',
    beginnerLabel: TAB_NAMES['tab-bode'],
    beginnerSubtitle: 'Watch a vibration fade with a filter',
    technicalLabel: 'Two-Mass Resonance & Notch Bode (Lab 00/05)',
    technicalSubtitle: 'Two-Mass Bode · Biquad Notch Filter',
    isBeginnerCore: true,
  },
  {
    id: 'tab-foc',
    beginnerLabel: TAB_NAMES['tab-foc'],
    beginnerSubtitle: 'Make a motor spin smoothly',
    technicalLabel: '25 kHz PMSM FOC & SVPWM (Lab 01/03)',
    technicalSubtitle: '3-Phase BLDC · d-q FOC · SVPWM',
    isBeginnerCore: true,
  },
  {
    id: 'tab-pend',
    beginnerLabel: TAB_NAMES['tab-pend'],
    beginnerSubtitle: 'Balance a pendulum without falling',
    technicalLabel: 'Furuta Pendulum + LQR + CBF (Lab 02/05)',
    technicalSubtitle: 'PID/LQR Balance · CBF Safety Filter',
    isBeginnerCore: true,
  },
  {
    id: 'tab-models',
    beginnerLabel: TAB_NAMES['tab-models'],
    beginnerSubtitle: 'Move a robot arm to a point',
    technicalLabel: 'URDF/MuJoCo Inspector & STO Safety (Lab 07/08)',
    technicalSubtitle: 'Forward/Inverse Kinematics · <1 μs STO',
    isBeginnerCore: false,
  },
  {
    id: 'tab-cadpcb',
    beginnerLabel: TAB_NAMES['tab-cadpcb'],
    beginnerSubtitle: 'See the parts and the motor board',
    technicalLabel: '3D CAD Parts & 48V/30A FOC PCB BOM',
    technicalSubtitle: 'STEP Flexures · Parasitic Inductance',
    isBeginnerCore: false,
  },
  {
    id: 'tab-sysid',
    beginnerLabel: TAB_NAMES['tab-sysid'],
    beginnerSubtitle: 'Measure how a machine responds',
    technicalLabel: 'Schroeder Multisine Closed-Loop SysID (Lab 07)',
    technicalSubtitle: 'Frequency-Domain Plant Identification',
    isBeginnerCore: false,
  },
  {
    id: 'tab-eskf',
    beginnerLabel: TAB_NAMES['tab-eskf'],
    beginnerSubtitle: 'Combine two motion sensors',
    technicalLabel: '6-DOF Attitude ESKF & RTOS SeqLock (Lab 04/05)',
    technicalSubtitle: 'IMU Gyro/Accel Fusion · WaitFreeSeqLock',
    isBeginnerCore: false,
  },
  {
    id: 'tab-board',
    beginnerLabel: `${TAB_NAMES['tab-board']} (Arduino Uno)`,
    beginnerSubtitle: 'Run the compiled C sketch and watch its serial',
    technicalLabel: 'ATmega328P Emulator (avr8js) · Compiled Sketch',
    technicalSubtitle: 'Committed .hex · USART Monitor · Cycle Budget',
    isBeginnerCore: false,
  },
  {
    id: 'tab-links',
    beginnerLabel: `${TAB_NAMES['tab-links']} (Nightly Check)`,
    beginnerSubtitle: 'See which outside links still work',
    technicalLabel: 'Link Check History & Not-Checked Trend',
    technicalSubtitle: 'Blocked / Unreachable Citations · Run Timeline',
    isBeginnerCore: false,
  },
];

/**
 * Home's launcher, built from the registry the rail renders (`components/home/LabsPanel.tsx`). A
 * tab added to `WORKBENCH_TABS` is on Home with no second list to edit, icons included.
 */
export const HOME_LABS = WORKBENCH_TABS.map((tab) => ({
  id: tab.id,
  label: tab.beginnerLabel,
  blurb: tab.beginnerSubtitle,
  Icon: TAB_ICONS[tab.id] ?? Sparkles,
}));

// The document itself lives in its own module so a unit suite can pin it without React; this stays
// exported because the smoke suite and the modal have always imported it from here.
export { buildPortfolioMarkdown } from './portfolio';
import { buildPortfolioMarkdown } from './portfolio';
import { readStudy } from './studyNotes';
import { readCardList } from './studyCards';
import { readSittings } from './sittingClock';

/**
 * The one footer, so the palette page and the workbench cannot drift apart. The token reference is
 * linked rather than hidden behind a typed URL: a page nobody can find is a page nobody checks.
 */
const SiteFooter: React.FC = () => (
  <footer
    data-chrome="footer"
    className="border-t border-line-soft bg-canvas px-4 py-3 text-center text-[11.5px] text-faint"
  >
    MechaLab <span data-testid="app-version">{APP_VERSION}</span> · Ten-Step Spiral Mechatronics
    Curriculum (Track P → Stage 0 → Depths 1–3) · Dual License: CC BY 4.0 (Docs) &amp; MIT (Code)
    ·{' '}
    <a
      href={themeViewSearch()}
      data-testid="link-theme-tokens"
      className="underline decoration-dotted hover:text-muted"
    >
      Theme tokens
    </a>
  </footer>
);

export const App: React.FC = () => {
  // The theme is mounted here, once, and handed to both the header's toggle and the palette page:
  // two `useTheme` mounts would be two writers for one attribute, and the button could label a mode
  // the page is not in.
  const {
    theme,
    fallback: themeFallback,
    toggle: toggleThemeMode,
    toggleContrast: toggleContrastMode,
    togglePaper: togglePaperMode,
  } = useTheme();
  // `?view=theme` is a page of its own, read once on arrival. It is not a workbench tab: the rail
  // stays the twelve tabs a learner needs, and this is a reference for whoever is adding a colour.
  const [themeView] = useState<boolean>(() => themeViewFromLocation());

  // A newcomer arrives to run the first lesson, not to read the advanced roadmap: open the Python
  // runner by default. The roadmap tab is still one click away for anyone who wants the map.
  const [activeTab, setActiveTab] = useState<TabId>('tab-pyodide');
  const [tourIndex, setTourIndex] = useState<number>(0);
  const [isCheatSheetOpen, setIsCheatSheetOpen] = useState<boolean>(false);
  // `⌘K` is the keyboard's table of contents: one dialog over lessons, tabs and commands. `⌘P` and
  // `⌘⇧F` open the same dialog on a narrower question, so there is one search box to learn
  // (`app/src/palette.ts`).
  const [isPaletteOpen, setIsPaletteOpen] = useState<boolean>(false);
  const [paletteMode, setPaletteMode] = useState<PaletteMode>('all');
  // Refs because the key handler below is registered once: it closes over the first render, and
  // "is this door already open?" has to be answered by the value on screen now.
  const paletteOpenRef = useRef<boolean>(false);
  paletteOpenRef.current = isPaletteOpen;
  const paletteModeRef = useRef<PaletteMode>(paletteMode);
  paletteModeRef.current = paletteMode;
  // The app-wide keys as the sheet has them (`app/src/keymap.ts`). Read through a ref inside the
  // one window listener, so a rebind reaches the next keypress without re-installing it.
  const keymap = useKeymap();
  const keymapRef = useRef(keymap);
  keymapRef.current = keymap;
  // The course pages `⌘⇧F` also searches. They are a 200 kB file, fetched the first time that door
  // opens and never on a normal visit; `idle` is "not asked for yet", not "empty".
  const [prosePages, setProsePages] = useState<ProsePage[] | null>(null);
  const [proseStatus, setProseStatus] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');
  const proseTried = useRef<boolean>(false);
  // `?` — the sheet that lists the keys, including `?` itself.
  const [isShortcutsOpen, setIsShortcutsOpen] = useState<boolean>(false);
  // Focus mode: the chrome off, the work left. Read once from the store and then owned here, because
  // the header's button, the pill and the `data-focus` attribute must be one state, not three.
  const [focus, setFocusOn] = useState<boolean>(() => readFocus());
  const focusRef = useRef<boolean>(focus);
  focusRef.current = focus;
  // Bumped by the palette's "Run the lesson" command; the runner watches it (see `runRequest`).
  const [runRequest, setRunRequest] = useState<number>(0);
  // And its "Format with Black" command, for the same reason: the runner owns the editor's text.
  const [formatRequest, setFormatRequest] = useState<number>(0);
  // Bumped by the palette and the `?` sheet for "Replay the first-lesson tour"; the runner watches it
  // (`tourRequest`), because the tour lives where its anchors are and this shell only asks.
  const [tourRequest, setTourRequest] = useState<number>(0);
  const requestTour = () => {
    setActiveTab('tab-pyodide');
    setIsCheatSheetOpen(false);
    setTourRequest((nonce) => nonce + 1);
  };
  // Bumped whenever a learner asks for a specific entry, so the runner can tell a new pick from a
  // render that happens to carry the same id.
  const [lessonRequest, setLessonRequest] = useState<{
    id: string;
    nonce: number;
    /** A line of the lesson's starter to put the caret on — what `⌘⇧F` names when it hits code. */
    line?: number;
  } | null>(null);
  // The collapsed Start here line can be dismissed for good; the roadmap tab carries the control
  // that restores it, so nothing is lost without a way back.
  const [startHereDismissed, setStartHereDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_START_HERE_DISMISSED) === '1';
    } catch {
      return false;
    }
  });
  const [isPortfolioModalOpen, setIsPortfolioModalOpen] = useState<boolean>(false);
  const [portfolioCopied, setPortfolioCopied] = useState<boolean>(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  // Each preset click is a new request with a higher nonce; a simulator applies it once (see demoPresets.ts).
  const [presetRequest, setPresetRequest] = useState<PresetRequest | null>(null);
  const presetNonce = useRef<number>(0);

  // Accounts are optional: with no Supabase build variables nothing below ever fires.
  const [isAccountOpen, setIsAccountOpen] = useState<boolean>(false);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [accountUserId, setAccountUserId] = useState<string | null>(null);
  const [accountBusy, setAccountBusy] = useState<boolean>(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [syncNote, setSyncNote] = useState<string>('');
  // True only after the account's copy has been merged in; a save before that would overwrite it.
  const syncReady = useRef<boolean>(false);
  const [accountProviders, setAccountProviders] = useState<string[]>([]);
  const [accountRole, setAccountRole] = useState<string | null>(null);
  // A reset link lands on `?type=recovery`: the panel then opens on "set a new password".
  const [recovery, setRecovery] = useState<boolean>(() => isRecoveryLink());
  const [wholePage, setWholePage] = useState<WholePage>(() => pageFromLocation());
  // Bumped by Home's Review button. The deck lives in the runner's Study panel, which is the one
  // review surface; the request only scrolls it into view, so there is no second schedule to keep.
  const [reviewRequest, setReviewRequest] = useState<number>(0);
  // Workspace sync is opt-in per browser; its preview and last report are what the panel shows.
  const [workspaceSync, setWorkspaceSync] = useState<boolean>(() => workspaceSyncEnabled());
  const [workspacePreview, setWorkspacePreview] = useState<Awaited<
    ReturnType<typeof previewWorkspace>
  > | null>(null);
  const [workspaceReport, setWorkspaceReport] = useState<string | null>(null);
  const [workspaceConflicts, setWorkspaceConflicts] = useState<number>(0);
  // Public settings: one announcement line and one live flag. The defaults are "no banner, feature on".
  const [siteSettings, setSiteSettings] = useState<PublicSettings>(() => defaultPublicSettings());

  const [viewMode, setViewMode] = useState<WorkbenchViewMode>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_VIEW_MODE) as WorkbenchViewMode | null;
      if (saved === 'beginner' || saved === 'advanced') {
        return saved;
      }
    } catch {
      // ignore storage errors
    }
    return 'beginner';
  });

  const [activeTierPass, setActiveTierPass] = useState<ActiveTierPass>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_TIER) as ActiveTierPass | null;
      if (saved && ['level0', 'tier1', 'tier2', 'tier3'].includes(saved)) {
        return saved;
      }
    } catch {
      // ignore storage errors
    }
    return 'tier1';
  });

  const [completedMilestones, setCompletedMilestones] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_MILESTONES);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  // 3.0's game state: the award ledger (its own key, idempotent on write) and the one toast the
  // last verification earned. Both are local; a restore merges rather than replaces.
  const [awardsLedger, setAwardsLedger] = useState<Award[]>([]);
  const [gameAwards, setGameAwards] = useState<Award[]>([]);
  const [storySeen, setStorySeen] = useState<boolean>(() => readStorySeen());
  const [verifiedLessons, setVerifiedLessons] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_VERIFIED);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  const [completedLessons, setCompletedLessons] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_COMPLETED);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  // A zip restore writes the stores; this component's copies of them did not change. Re-read on the
  // event rather than reloading the page, so the learner keeps their tab and unsaved editor text.
  const [storeNonce, setStoreNonce] = useState(0);

  // The award ledger, read after the engine's chunk arrives (and again after a restore): the
  // dashboard's achievement wall and Scrap shelf read it, and nothing on the first screen needs it.
  useEffect(() => {
    let alive = true;
    void import('./gamification/awardStore').then((store) => {
      if (alive) setAwardsLedger(store.readAwards());
    });
    return () => {
      alive = false;
    };
  }, [storeNonce]);

  useEffect(() => {
    const onRestored = () => {
      setVerifiedLessons(readFlagMap(STORAGE_KEY_VERIFIED));
      setCompletedLessons(readFlagMap(STORAGE_KEY_COMPLETED));
      setCompletedMilestones(readFlagMap(STORAGE_KEY_MILESTONES));
      setStoreNonce((nonce) => nonce + 1);
    };
    window.addEventListener(STORE_RESTORED_EVENT, onRestored);
    return () => window.removeEventListener(STORE_RESTORED_EVENT, onRestored);
  }, []);

  // The account service is public: an announcement banner is not worth a sign-in.
  useEffect(() => {
    let live = true;
    loadPublicSettings()
      .then((settings) => {
        if (live) setSiteSettings(settings);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  // Where a sign-in round trip asked to come back to, and what an OAuth refusal said.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.location) return;
    const search = window.location.search || '';
    const target = parseReturnTarget(search, isKnownLesson);
    if (target?.view) setWholePage(target.view === 'dashboard' ? 'home' : target.view);
    if (target?.lessonId) {
      setActiveTab('tab-pyodide');
      setLessonRequest({ id: target.lessonId, nonce: Date.now() });
    }
    // Google and Supabase report a refused sign-in in the query string. Show the sentence once, then
    // take it out of the address so a reload does not resurrect it.
    const params = new URLSearchParams(search);
    const callback = authCallbackProblem(
      params.get('error') ?? params.get('error_code'),
      params.get('error_description')
    );
    if (callback) {
      setAccountError(callback);
      setIsAccountOpen(true);
    }
    if (search.includes('return=') || callback) {
      const url = new URL(window.location.href);
      for (const key of ['return', 'error', 'error_description', 'error_code']) {
        url.searchParams.delete(key);
      }
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_VIEW_MODE, viewMode);
    } catch {
      // ignore
    }
  }, [viewMode]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_TIER, activeTierPass);
    } catch {
      // ignore
    }
  }, [activeTierPass]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_START_HERE_DISMISSED, startHereDismissed ? '1' : '0');
    } catch {
      // ignore
    }
  }, [startHereDismissed]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_MILESTONES, JSON.stringify(completedMilestones));
    } catch {
      // ignore
    }
  }, [completedMilestones]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_VERIFIED, JSON.stringify(verifiedLessons));
    } catch {
      // ignore
    }
  }, [verifiedLessons]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_COMPLETED, JSON.stringify(completedLessons));
    } catch {
      // ignore
    }
  }, [completedLessons]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_PROGRESS_UPDATED, String(Date.now()));
    } catch {
      // ignore storage errors
    }
  }, [completedMilestones, verifiedLessons, completedLessons]);

  useEffect(() => {
    if (!accountsConfigured) return;
    let cancelled = false;

    const applySession = async (session: Session | null, event = '') => {
      if (cancelled) return;
      // A reset link creates a session *and* says why it exists. Open the panel on the new-password
      // field instead of dropping the learner into the workbench with no way to set one.
      if (event === 'PASSWORD_RECOVERY') {
        setRecovery(true);
        setIsAccountOpen(true);
      }
      setAccountEmail(session?.user.email ?? null);
      setAccountUserId(session?.user.id ?? null);
      setAccountProviders(sessionProviders(session));
      setAccountRole(null);
      if (session) {
        // The role decides whether the admin entry is offered; the server checks it again on every
        // admin action, so a failure here is only a missing button, never an open door.
        loadMyRole(session.user.id)
          .then((role) => {
            if (!cancelled) setAccountRole(role);
          })
          .catch(() => undefined);
      }
      if (!session) {
        syncReady.current = false;
        setSyncNote('');
        return;
      }
      setSyncNote('Loading your saved progress…');
      const local = localSnapshot();
      try {
        const remote = await loadProgress(session.user.id);
        const merged = remote ? mergeProgress(local, remote) : local;
        setVerifiedLessons(merged.verifiedLessons);
        setCompletedLessons(merged.completedLessons);
        setCompletedMilestones(merged.completedMilestones);
        replaceLearningLog(merged.learningLog);
        syncReady.current = true;
        await saveProgress(session.user.id, { ...merged, updatedAt: Date.now() });
        if (!cancelled) setSyncNote(remote ? 'Progress merged with your account.' : 'Progress saved to your account.');
        // Only when this browser opted in. A project without the workspace migration throws here;
        // that must not take progress sync down with it, so it has its own catch.
        if (workspaceSyncEnabled()) {
          try {
            const report = await mergeAndApplyWorkspace(session.user.id);
            if (!cancelled) {
              setWorkspaceConflicts(report.conflicts);
              setWorkspaceReport(workspaceReportLine(report));
            }
          } catch (workspaceError) {
            if (!cancelled) {
              setWorkspaceReport(
                workspaceError instanceof Error
                  ? `Draft sync unavailable: ${workspaceError.message}`
                  : 'Draft sync unavailable.'
              );
            }
          }
        }
      } catch (error) {
        // Signed in but the row is unreachable: keep the learner working locally and say so.
        syncReady.current = false;
        if (!cancelled) {
          setSyncNote(error instanceof Error ? `Cloud sync unavailable: ${error.message}` : 'Cloud sync unavailable.');
        }
      }
    };

    currentSession().then(applySession).catch(() => undefined);
    let unsubscribe: (() => void) | null = null;
    onSessionChange(applySession).then((stop) => {
      // The effect may have been torn down while the SDK chunk was loading.
      if (cancelled) stop();
      else unsubscribe = stop;
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (!accountsConfigured || !accountUserId || !syncReady.current) return;
    const userId = accountUserId;
    const timer = window.setTimeout(() => {
      setSyncNote('Saving…');
      saveProgress(userId, localSnapshot())
        .then(() => setSyncNote('Saved to your account.'))
        .catch((error) =>
          setSyncNote(error instanceof Error ? `Sync failed: ${error.message}` : 'Sync failed.')
        );
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [completedMilestones, verifiedLessons, completedLessons, accountUserId]);

  /** The address bar as an internal destination: `?lesson=P.1`, `?view=dashboard`, or the root. */
  const intendedDestination = (): string =>
    typeof window === 'undefined' || !window.location ? '' : window.location.search || '';

  const handleSendMagicLink = async (address: string): Promise<string | null> => {
    const problem = emailProblem(address);
    if (problem) return problem;
    setAccountBusy(true);
    setAccountError(null);
    const failure = await sendMagicLink(address.trim(), intendedDestination());
    setAccountBusy(false);
    return failure;
  };

  const handleSignIn = async (address: string, password: string): Promise<string | null> => {
    const problem = emailProblem(address) ?? (password ? null : 'Enter your password.');
    if (problem) return problem;
    setAccountBusy(true);
    setAccountError(null);
    const failure = await signInWithPassword(address.trim(), password);
    setAccountBusy(false);
    return failure;
  };

  const handleCreateAccount = async (address: string, password: string): Promise<SignUpOutcome> => {
    const problem = emailProblem(address) ?? passwordProblem(password, address);
    if (problem) return { problem, needsVerification: false };
    setAccountBusy(true);
    setAccountError(null);
    const outcome = await signUpWithPassword(address.trim(), password, intendedDestination());
    setAccountBusy(false);
    return outcome;
  };

  const handlePasswordReset = async (address: string): Promise<string | null> => {
    const problem = emailProblem(address);
    if (problem) return problem;
    setAccountBusy(true);
    setAccountError(null);
    const failure = await sendPasswordReset(address.trim(), intendedDestination());
    setAccountBusy(false);
    return failure;
  };

  const handleSetPassword = async (password: string): Promise<string | null> => {
    const problem = passwordProblem(password, accountEmail ?? '');
    if (problem) return problem;
    setAccountBusy(true);
    const failure = await updatePassword(password);
    setAccountBusy(false);
    if (!failure) setRecovery(false);
    return failure;
  };

  const handleGoogle = async (): Promise<string | null> => {
    setAccountBusy(true);
    setAccountError(null);
    const failure = await signInWithGoogle(intendedDestination());
    setAccountBusy(false);
    return failure;
  };

  const handleExportData = async (): Promise<string | null> => {
    setAccountBusy(true);
    const result = await exportAccountData();
    setAccountBusy(false);
    if (result.problem) return result.problem;
    try {
      const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'mechalab-account.json';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      return 'The export was built but the browser refused the download.';
    }
    return null;
  };

  const handleDeleteAccount = async (confirmation: string): Promise<string | null> => {
    setAccountBusy(true);
    const result = await deleteAccount(confirmation);
    setAccountBusy(false);
    if (result.problem) return result.problem;
    syncReady.current = false;
    setAccountEmail(null);
    setAccountUserId(null);
    setAccountProviders([]);
    setAccountRole(null);
    setSyncNote('');
    setAccountError(null);
    setWorkspaceSync(false);
    setWorkspaceSyncEnabled(false);
    setWorkspaceReport(null);
    setWorkspaceConflicts(0);
    setIsAccountOpen(false);
    return null;
  };

  const handleToggleWorkspaceSync = async (on: boolean) => {
    if (!on) {
      setWorkspaceSyncEnabled(false);
      setWorkspaceSync(false);
      setWorkspaceReport('Drafts and notes stay in this browser now. Nothing was deleted.');
      return;
    }
    if (!accountUserId) {
      setAccountError('Sign in first, then turn on draft and note sync.');
      return;
    }
    setAccountBusy(true);
    setAccountError(null);
    try {
      // Show what each side holds before the merge writes anything.
      setWorkspacePreview(await previewWorkspace(accountUserId));
      const report = await mergeAndApplyWorkspace(accountUserId);
      setWorkspaceSyncEnabled(true);
      setWorkspaceSync(true);
      setWorkspaceConflicts(report.conflicts);
      setWorkspaceReport(workspaceReportLine(report));
    } catch (error) {
      setAccountError(
        error instanceof Error ? `Draft sync is unavailable: ${error.message}` : 'Draft sync is unavailable.'
      );
    } finally {
      setAccountBusy(false);
    }
  };

  const handleSignOut = async () => {
    const problem = await signOutNow();
    if (problem) {
      setAccountError(problem);
      return;
    }
    syncReady.current = false;
    setAccountEmail(null);
    setAccountUserId(null);
    setAccountProviders([]);
    setAccountRole(null);
    setSyncNote('');
    setAccountError(null);
    setWorkspacePreview(null);
    setWorkspaceReport(null);
  };

  /** Move between the workbench, Home and the admin area, and keep the address in step. */
  const openPage = (next: WholePage) => {
    setWholePage(next);
    noteVisit(next);
    if (typeof window === 'undefined' || !window.location) return;
    const url = new URL(window.location.href);
    if (next === 'workbench') url.searchParams.delete('view');
    else url.searchParams.set('view', next);
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  };

  const openLessonFromHome = (id: string) => {
    openPage('workbench');
    setActiveTab('tab-pyodide');
    setHighlightedId(null);
    setLessonRequest({ id, nonce: Date.now() });
  };

  /** A lab card is a door, not a detail panel: the workbench opens on that tab. */
  const openTabFromHome = (id: TabId) => {
    openPage('workbench');
    setActiveTab(id);
    setHighlightedId(null);
  };

  const openRouteFromHome = () => {
    openPage('workbench');
    setActiveTab('tab-arch');
    setHighlightedId(null);
  };

  /** The deck is answered in the runner's Study panel; Home only says how many are waiting. */
  const reviewFromHome = () => {
    openPage('workbench');
    setActiveTab('tab-pyodide');
    setHighlightedId(null);
    setReviewRequest((nonce) => nonce + 1);
  };

  const handleRestoreStartHere = () => {
    setStartHereDismissed(false);
    // Show the restored block where it lives, rather than flipping a flag on a screen the
    // learner cannot see.
    setActiveTab('tab-pyodide');
  };

  const handleToggleMilestone = (id: string) => {
    setCompletedMilestones((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // One verification, three things: the flag, the stamp that says what it was taken against, and
  // whatever it earned. The context is read from the stores themselves, so the counts a reward
  // depends on cannot drift from the work that was actually done.
  const handleMarkLessonVerified = (lessonId: string) => {
    const next = { ...verifiedLessons, [lessonId]: true };
    setVerifiedLessons(next);

    const predictions = readPredictions().filter(
      (record) => record.verdict === 'match' && !record.skipped
    ).length;
    const events = readLearningLog();
    const lesson = PYTHON_LESSONS.find((entry) => entry.id === lessonId);
    void Promise.all([
      import('./gamification/rewards'),
      import('./gamification/context'),
      import('./gamification/awardStore'),
      import('./gamification/verifyStamp'),
    ]).then(([rewards, gameContext, store, stamp]) => {
      const context = gameContext.awardContextFor({ verified: next, events, matchedPredictions: predictions });
      const granted = store.recordAwards(rewards.candidateAwards(context));
      if (granted.length > 0) {
        setAwardsLedger(store.readAwards());
        setGameAwards(granted);
      }
      if (lesson) stamp.writeStamp(lessonId, stamp.graderFingerprint(lesson));
    });
  };

  const handleToggleLessonCompleted = (lessonId: string, forceValue?: boolean) => {
    setCompletedLessons((prev) => ({
      ...prev,
      [lessonId]: forceValue !== undefined ? forceValue : !prev[lessonId],
    }));
  };

  // A step's practice is opened by id, so the roadmap and the runner agree on the join; coming
  // back from the runner lands on the same pass the entry belongs to.
  const handleOpenRoadmap = (pass: ActiveTierPass, _milestoneId: string) => {
    setActiveTierPass(pass);
    setActiveTab('tab-arch');
  };

  // One catalogue, built from the lesson registry and the rail's own metadata, so the palette can
  // never list a lesson the runner does not have or name a tab the strip does not show.
  const paletteItems = React.useMemo(() => paletteCatalog(WORKBENCH_TABS), []);
  // `⌘P`'s list: the same rows, without the tabs and commands. Built from the catalogue rather than
  // from the registry so a lesson can never appear in one door and not the other.
  const lessonPaletteItems = React.useMemo(
    () => paletteItems.filter((item) => item.kind === 'lesson'),
    [paletteItems]
  );

  // The searchable course pages are fetched when `⌘⇧F` opens the door that reads them — one
  // attempt per open, so a failure on a train is retried the next time the palette is opened and
  // never on a keystroke. The fetch itself is memoised in `proseSearch.ts`; a second door costs
  // nothing.
  useEffect(() => {
    if (!isPaletteOpen) {
      proseTried.current = false;
      return;
    }
    if (paletteMode !== 'search' || proseTried.current) return;
    proseTried.current = true;
    setProseStatus('loading');
    void loadProseIndex().then((pages) => {
      setProsePages(pages);
      setProseStatus(pages ? 'ready' : 'unavailable');
    });
  }, [isPaletteOpen, paletteMode]);

  /** `⌘⇧F`'s list: the lesson text first, then the reading pages, each group in its own band. */
  const paletteSearch = React.useCallback(
    (query: string) => {
      const rows = lessonSearchItems(query);
      return prosePages ? [...rows, ...proseSearchItems(query, prosePages)] : rows;
    },
    [prosePages]
  );

  // What the footer says while the file is in flight, or when it could not be had at all. Silent
  // once the pages are in: "65 course pages searched" on every keystroke is furniture.
  const proseNote =
    paletteMode !== 'search'
      ? null
      : proseStatus === 'loading'
        ? 'course pages loading…'
        : proseStatus === 'unavailable'
          ? 'course pages unavailable offline'
          : null;

  const openLesson = (lessonId: string, line?: number) => {
    setPyodideLessonId(lessonId);
    // The id alone is not enough: re-choosing the lesson a deep link already named is a no-op prop
    // change, so the runner gets a request it can count. The line rides along for a search hit; the
    // runner decides whether it is still a line of the text on screen.
    setLessonRequest((prev) => ({
      id: lessonId,
      nonce: (prev?.nonce ?? 0) + 1,
      ...(line && Number.isFinite(line) ? { line } : {}),
    }));
    setActiveTab('tab-pyodide');
    setHighlightedId(null);
    document.getElementById('python-runner')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handlePaletteSelect = (item: PaletteItem) => {
    // A course-page hit is a reading page on GitHub, not a panel in this window: open it beside the
    // workbench instead of navigating away from the learner's draft.
    if (item.href) {
      window.open(item.href, '_blank', 'noopener,noreferrer');
      return;
    }
    const lessonId = lessonIdOf(item);
    if (lessonId) {
      openLesson(lessonId, item.line);
      return;
    }
    if (item.kind === 'tab') {
      const target = WORKBENCH_TABS.find((tab) => `tab-${tab.id}` === item.id);
      if (target) {
        setActiveTab(target.id);
        setHighlightedId(null);
      }
      return;
    }
    switch (item.id) {
      case 'action-run-lesson':
        setActiveTab('tab-pyodide');
        setRunRequest((nonce) => nonce + 1);
        break;
      case 'action-format-file':
        setActiveTab('tab-pyodide');
        setFormatRequest((nonce) => nonce + 1);
        break;
      case 'action-tour-replay':
        requestTour();
        break;
      case 'action-toggle-theme':
        toggleThemeMode();
        break;
      case 'action-beginner-view':
        setViewMode('beginner');
        break;
      case 'action-advanced-view':
        setViewMode('advanced');
        break;
      case 'action-open-home':
        openPage('home');
        break;
      case 'action-open-cheatsheet':
        setIsCheatSheetOpen(true);
        break;
      case 'action-open-shortcuts':
        setIsShortcutsOpen(true);
        break;
      case 'action-export-portfolio':
        setIsPortfolioModalOpen(true);
        break;
      case 'action-export-log':
        downloadLearningLog();
        break;
      case 'action-theme-tokens':
        if (typeof window !== 'undefined') window.location.assign(themeViewSearch());
        break;
      case 'action-pass-level0':
      case 'action-pass-tier1':
      case 'action-pass-tier2':
      case 'action-pass-tier3': {
        const pass = item.id.replace('action-pass-', '') as ActiveTierPass;
        setActiveTierPass(pass);
        setActiveTab('tab-arch');
        setHighlightedId(null);
        break;
      }
      default:
        break;
    }
  };

  // ⌘K / Ctrl+K from anywhere, including inside the editor: a palette that only opens when no
  // field has focus is the one you cannot use while typing, which is when you want it.
  // Focus mode's two keys live in the same listener as the palette's, because a page with three
  // keyboard effects is a page where two of them fight over Escape.
  useEffect(() => {
    const apply = (on: boolean) => setFocusOn(setFocus(on));
    /** The same door twice closes it; a different door switches the list without closing. */
    const showPalette = (next: PaletteMode) => {
      if (paletteOpenRef.current && paletteModeRef.current === next) {
        setIsPaletteOpen(false);
        return;
      }
      setPaletteMode(next);
      setIsPaletteOpen(true);
    };
    /** Is the keystroke going into a field or the editor? Then it is text, not a shortcut. */
    const typing = (target: EventTarget | null): boolean => {
      const element = target as HTMLElement | null;
      if (!element) return false;
      if (element.isContentEditable) return true;
      const tag = element.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    };
    const onKey = (event: KeyboardEvent) => {
      // One lookup, from the map the sheet edits. The defaults are the keys this app has always
      // answered; a rebind changes which press lands here, never what the press does.
      const action = actionForEvent(keymapRef.current, event);
      if (action === 'palette') {
        event.preventDefault();
        showPalette('all');
        return;
      }
      // ⌘P is the browser's Print on every platform; this app takes it for quick-open the way a
      // code editor does, and the cheat sheet's own Print button stays the way to print the page.
      if (action === 'lessons') {
        event.preventDefault();
        showPalette('lessons');
        return;
      }
      if (action === 'search') {
        event.preventDefault();
        showPalette('search');
        return;
      }
      // `?` is a character before it is a shortcut: in the editor or a field it has to stay text.
      // The rule follows the chord, not the row: a rebind that holds ⌘ or ⌥ is not a character, so
      // it may open the sheet from anywhere a shortcut works.
      if (action === 'sheet') {
        const chord = keymapRef.current.sheet;
        if (event.defaultPrevented) return;
        if (!chord.mod && !chord.alt && typing(event.target)) return;
        event.preventDefault();
        setIsShortcutsOpen((open) => !open);
        return;
      }
      if (action === 'focus') {
        event.preventDefault();
        apply(!focusRef.current);
        return;
      }
      // Escape leaves focus, unless a dialog already claimed it: `defaultPrevented` is how a modal
      // that closes on Escape says so, and closing two things with one press is not a shortcut.
      if (event.key === 'Escape' && focusRef.current && !event.defaultPrevented) {
        event.preventDefault();
        apply(false);
      }
    };
    // The header's button and this attribute are two surfaces of one fact; a store write from
    // anywhere else (a test, a future palette command) reaches both through this event.
    const onFocusEvent = (event: Event) =>
      setFocusOn(Boolean((event as CustomEvent<{ on?: boolean }>).detail?.on));
    window.addEventListener('keydown', onKey);
    window.addEventListener(FOCUS_EVENT, onFocusEvent);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(FOCUS_EVENT, onFocusEvent);
    };
  }, []);

  const toggleFocusMode = () => setFocusOn(setFocus(!focusRef.current));

  // Arriving is a visit too: a reload inside the sitting returns to the page on screen, and the
  // address names the page that is actually open — a learner who lands on Home can copy the URL, and
  // a reload resumes the sitting rather than re-deciding from a bare `/`. `openPage` owns every other
  // transition; this is the same write for the arrival it did not make.
  useEffect(() => {
    noteVisit(wholePage);
    if (typeof window === 'undefined' || !window.location) return;
    const url = new URL(window.location.href);
    if (wholePage === 'workbench') {
      if (!url.searchParams.has('view')) return;
      url.searchParams.delete('view');
    } else if (url.searchParams.get('view') !== wholePage) {
      url.searchParams.set('view', wholePage);
    } else {
      return;
    }
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }, [wholePage]);

  const allMilestoneIds = [
    ...LEVEL_0_STEPS,
    ...TIER_1_LINEAR_PASS,
    ...TIER_2_LINEAR_PASS,
    ...TIER_3_LINEAR_PASS,
  ].map((s) => s.milestoneId);

  const totalCompletedMilestones = allMilestoneIds.filter((id) => completedMilestones[id]).length;
  const totalVerifiedLessons = PYTHON_LESSONS.filter((l) => verifiedLessons[l.id]).length;
  const totalCompletedLessons = PYTHON_LESSONS.filter((l) => completedLessons[l.id]).length;

  // Opened versus attempted, from the log the runner already writes: an `lesson_open` with no `run`
  // is a lesson read and left, which no progress flag can tell apart from one never touched. Read
  // when the visible tab changes - opening the roadmap re-renders, and anywhere else would parse the
  // log on every keystroke in the editor.
  const lessonAttempts = useMemo(() => attemptsByLesson(readLearningLog()), [activeTab, storeNonce]);

  // A page's "Run this in the workbench" link arrives as `?lesson=<id>`: the runner opens on that
  // entry instead of making the reader find it in the search box again. An id the registry does not
  // list is ignored rather than shown as an empty editor. With no query string the workbench reopens
  // the lesson the learner was last on (`src/lastLesson.ts`), and only then falls back to P.1 - the
  // address is the deliberate pick, storage is the ordinary one, and both are validated by id.
  // A share link carries someone's attempt in the fragment (`src/shareLink.ts`). It is read once,
  // offered by the runner as a card, and never applied by itself: the learner's draft is the work,
  // and a link opening a page should not be able to replace it. An id the runner does not list is
  // dropped rather than trusted, the same rule the query string follows.
  const [sharedAttempt, setSharedAttempt] = useState<SharedAttempt | null>(() => {
    if (typeof window === 'undefined' || !window.location) return null;
    const attempt = readSharedAttempt(window.location.hash || '');
    return attempt && isKnownLesson(attempt.lesson) ? attempt : null;
  });
  // A page's try-it block arrives as `#try=…` (`src/tryLink.ts`): the same payload as a share link,
  // read under its own key because the workbench does something different with it - the snippet opens
  // in a scratch editor, ungraded, and the learner's draft for that lesson is not touched.
  const [trySnippet, setTrySnippet] = useState<SharedAttempt | null>(() => {
    if (typeof window === 'undefined' || !window.location) return null;
    const snippet = readTrySnippet(window.location.hash || '');
    return snippet && isKnownLesson(snippet.lesson) ? snippet : null;
  });
  const [pyodideLessonId, setPyodideLessonId] = useState<string>(
    () =>
      lessonIdFromLocation() ?? trySnippet?.lesson ?? sharedAttempt?.lesson ?? readLastLessonId() ?? 'P.1'
  );

  // A deep link is a promise about the editor being on screen, so land on it rather than on the
  // hero above it. Only on arrival, and only when the address named a lesson.
  useEffect(() => {
    if (!lessonIdFromLocation()) return;
    document.getElementById('python-runner')?.scrollIntoView({ block: 'start' });
  }, []);

  const visibleTabs =
    viewMode === 'beginner'
      ? WORKBENCH_TABS.filter((t) => t.isBeginnerCore || t.id === activeTab)
      : WORKBENCH_TABS;

  // The tour's own index is what its three buttons *step from*, so it is read at click time rather
  // than from the render the button was drawn with: two tour clicks queued in one task (or a click
  // right after another) must compose into two steps, and Apply Demo Preset must apply the step the
  // learner is on now. `tourIndexRef` is written by the two steppers; the effect re-confirms it.
  const tourIndexRef = useRef<number>(tourIndex);
  useEffect(() => {
    tourIndexRef.current = tourIndex;
  }, [tourIndex]);

  const handleNextTourStep = () => {
    const nextIdx = (tourIndexRef.current + 1) % TOUR_STEPS.length;
    tourIndexRef.current = nextIdx;
    setTourIndex(nextIdx);
    const nextStep = TOUR_STEPS[nextIdx];
    setActiveTab(nextStep.tab);
    setHighlightedId(nextStep.targetId);
  };

  const handlePrevTourStep = () => {
    const prevIdx = (tourIndexRef.current - 1 + TOUR_STEPS.length) % TOUR_STEPS.length;
    tourIndexRef.current = prevIdx;
    setTourIndex(prevIdx);
    const prevStep = TOUR_STEPS[prevIdx];
    setActiveTab(prevStep.tab);
    setHighlightedId(prevStep.targetId);
  };

  const handleApplyPreset = () => {
    const step = TOUR_STEPS[tourIndexRef.current];
    if (step.tab === 'tab-bode') handleLoadPreset('wafer_scanner');
    else if (step.tab === 'tab-foc') handleLoadPreset('foc_drone_prop');
    else if (step.tab === 'tab-pend') handleLoadPreset('pend_swingup');
    else if (step.tab === 'tab-models') handleLoadPreset('sto_desat_short');
    else if (step.tab === 'tab-cadpcb') handleLoadPreset('pcb_6layer_opt');
    else if (step.tab === 'tab-sysid') handleLoadPreset('sysid_schroeder_clean');
    else if (step.tab === 'tab-eskf') handleLoadPreset('eskf_seqlock_clean');
  };

  const handleLoadPreset = (presetId: string) => {
    presetNonce.current += 1;
    setPresetRequest({ presetId, nonce: presetNonce.current });
    const destination = tabForPreset(presetId);
    if (destination) setActiveTab(destination);
  };

  // Built on the render that opens the modal, and not on any other: the document reads four stores, a
  // learner who typed a note a keystroke earlier must find it in the file, and the preview must never
  // be a frame of empty text before the effect fills it in.
  const portfolioMarkdown = useMemo(
    () =>
      isPortfolioModalOpen
        ? buildPortfolioMarkdown(verifiedLessons, completedLessons, completedMilestones, {
            study: readStudy(),
            cards: readCardList(),
            sittings: readSittings(),
            pythonTabName: PYTHON_TAB_NAME,
            now: Date.now(),
          })
        : '',
    [isPortfolioModalOpen, verifiedLessons, completedLessons, completedMilestones]
  );

  const handleDownloadPortfolioFile = () => {
    const blob = new Blob([portfolioMarkdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mechalab-progress-portfolio.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyPortfolio = async () => {
    try {
      await navigator.clipboard.writeText(portfolioMarkdown);
      setPortfolioCopied(true);
      setTimeout(() => setPortfolioCopied(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  // One account panel, shared by the workbench and the whole-page views. It is built only while it is
  // open: a lazy element is fetched when React renders it, so an always-present one would download
  // its chunk on every visit and render inside the server-side smoke test, which has no browser.
  const accountPanel = isAccountOpen ? (
    <React.Suspense fallback={null}>
      <AccountPanel
        isOpen={isAccountOpen}
        onClose={() => setIsAccountOpen(false)}
        configured={accountsConfigured}
        email={accountEmail}
        note={syncNote}
        error={accountError}
        busy={accountBusy}
        providers={accountProviders}
        recovery={recovery}
        workspaceSync={workspaceSync}
        workspacePreview={workspacePreview}
        workspaceReport={workspaceReport}
        role={accountRole}
        onMagicLink={handleSendMagicLink}
        onSignIn={handleSignIn}
        onCreateAccount={handleCreateAccount}
        onPasswordReset={handlePasswordReset}
        onSetPassword={handleSetPassword}
        onGoogle={handleGoogle}
        onSignOut={handleSignOut}
        onToggleWorkspaceSync={(on) => void handleToggleWorkspaceSync(on)}
        onExportData={handleExportData}
        onDeleteAccount={handleDeleteAccount}
        onOpenDashboard={() => {
          setIsAccountOpen(false);
          openPage('home');
        }}
        onOpenAdmin={() => {
          setIsAccountOpen(false);
          openPage('admin');
        }}
      />
    </React.Suspense>
  ) : null;

  // The dashboard reads the same stores the workbench writes, and only reads them when it is on
  // screen. `storeNonce` re-reads after a backup restore, so the counts match the files on disk.
  const dashboardData = useMemo(() => {
    if (wholePage === 'workbench') return null;
    const lastId = readLastLessonId();
    const position = lastId ? readReadingPosition(lastId) : null;
    return {
      drafts: readDrafts(),
      // `LessonStudy` and `DashboardStudy` describe the same shape; Home only needs note and
      // quote, so it cannot depend on the parts it does not render.
      study: readStudy() as unknown as DashboardStudy,
      events: readLearningLog() as unknown as DashboardEvent[],
      due: dueCards(syncCards()).length,
      reading: lastId && position ? { [lastId]: position } : {},
    };
  }, [wholePage, storeNonce]);

  if (wholePage !== 'workbench') {
    const offer = lessonOffer(
      readLastLessonId(),
      PYTHON_LESSONS.map((lesson) => lesson.id),
      { verified: verifiedLessons, completed: completedLessons }
    );
    return (
      <div id="top" className="min-h-screen flex flex-col bg-canvas text-ink">
        {/* The interface's ear: one delegated listener for every control on every screen. It
            renders nothing, costs a muted learner no fetch, and is mounted here so the dashboard
            and the admin area tick the same as the workbench. */}
        <SoundClicks />
        <Header
          theme={theme}
          fallback={themeFallback}
          onToggle={toggleThemeMode}
          onToggleContrast={toggleContrastMode}
          onTogglePaper={togglePaperMode}
          onOpenCheatSheet={() => setIsCheatSheetOpen(true)}
          onExportPortfolio={() => setIsPortfolioModalOpen(true)}
          activeTierPass={activeTierPass}
          onSelectTierPass={setActiveTierPass}
          // The dashboard and the admin area read no pass: the links would only move a
          // highlight.
          showCourseLevels={false}
          accountEmail={accountEmail}
          onOpenAccount={() => setIsAccountOpen(true)}
          onOpenPalette={() => setIsPaletteOpen(true)}
          onOpenHome={() => openPage('home')}
          focus={focus}
          onToggleFocus={toggleFocusMode}
        />
        {siteSettings.announcement && (
          <div
            role="status"
            data-testid="site-announcement"
            className="border-b px-4 py-2 text-center text-xs"
            style={{ backgroundColor: 'var(--accent-soft)', borderColor: 'var(--border)', color: 'var(--accent)' }}
          >
            {siteSettings.announcement}
          </div>
        )}
        <main id="main" tabIndex={-1} className="flex-1 w-full outline-none">
          <React.Suspense
            fallback={
              <p className="p-6 text-xs" style={{ color: 'var(--muted)' }}>
                Loading…
              </p>
            }
          >
            {wholePage === 'home' ? (
              <HomeDashboard
                email={accountEmail}
                role={accountRole}
                lessons={PYTHON_LESSONS.map((lesson) => ({ id: lesson.id, title: lesson.title }))}
                verified={verifiedLessons}
                completed={completedLessons}
                milestones={completedMilestones}
                continueLesson={offer}
                drafts={dashboardData?.drafts ?? {}}
                study={dashboardData?.study ?? {}}
                events={dashboardData?.events ?? []}
                dueCards={dashboardData?.due ?? 0}
                awards={awardsLedger}
                workspaceSync={workspaceSync}
                conflicts={workspaceConflicts}
                syncNote={syncNote}
                reading={dashboardData?.reading ?? {}}
                labs={HOME_LABS}
                focus={focus}
                onOpenLesson={openLessonFromHome}
                onOpenTab={openTabFromHome}
                onOpenRoute={openRouteFromHome}
                onReview={reviewFromHome}
                onBack={() => openPage('workbench')}
                onOpenAccount={() => setIsAccountOpen(true)}
                onOpenAdmin={() => openPage('admin')}
                onToggleFocus={toggleFocusMode}
                onOpenCheatSheet={() => setIsCheatSheetOpen(true)}
                onExportPortfolio={() => setIsPortfolioModalOpen(true)}
                onExportLog={downloadLearningLog}
              />
            ) : (
              <AdminDashboard
                configured={accountsConfigured}
                signedIn={Boolean(accountEmail)}
                role={accountRole}
                version={APP_VERSION}
                onBack={() => openPage('workbench')}
                onOpenAccount={() => setIsAccountOpen(true)}
              />
            )}
          </React.Suspense>
        </main>
        <SiteFooter />
        {accountPanel}
      </div>
    );
  }

  if (themeView) {
    return (
      <div id="top" className="min-h-screen flex flex-col bg-canvas text-ink">
        {/* The interface's ear: one delegated listener for every control on every screen. It
            renders nothing, costs a muted learner no fetch, and is mounted here so the dashboard
            and the admin area tick the same as the workbench. */}
        <SoundClicks />
        <Header
          theme={theme}
          fallback={themeFallback}
          onToggle={toggleThemeMode}
          onToggleContrast={toggleContrastMode}
          onTogglePaper={togglePaperMode}
          onOpenCheatSheet={() => setIsCheatSheetOpen(true)}
          onExportPortfolio={() => setIsPortfolioModalOpen(true)}
          activeTierPass={activeTierPass}
          onSelectTierPass={setActiveTierPass}
          // The dashboard and the admin area read no pass: the links would only move a highlight.
          showCourseLevels={false}
          accountEmail={accountEmail}
          onOpenAccount={() => setIsAccountOpen(true)}
          onOpenPalette={() => setIsPaletteOpen(true)}
          onOpenHome={() => openPage('home')}
        />
        <main
          id="main"
          tabIndex={-1}
          className="flex-1 p-3.5 sm:p-5 max-w-[1540px] w-full mx-auto outline-none"
        >
          <ThemeTokens
            theme={theme}
            fallback={themeFallback}
            onToggle={toggleThemeMode}
            onToggleContrast={toggleContrastMode}
            onTogglePaper={togglePaperMode}
          />
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div
      id="top"
      data-focus={focus ? 'on' : 'off'}
      className="min-h-screen flex flex-col bg-canvas text-ink"
    >
      <SoundClicks />
      {/* Keyboard users can jump the header, the mode bar and the tab rail in one key. */}
      <a href="#main" className="skip-link">
        Skip to the workbench
      </a>
      <Header
        theme={theme}
        fallback={themeFallback}
        onToggle={toggleThemeMode}
        onToggleContrast={toggleContrastMode}
        onTogglePaper={togglePaperMode}
        onOpenCheatSheet={() => setIsCheatSheetOpen(true)}
        onExportPortfolio={() => setIsPortfolioModalOpen(true)}
        activeTierPass={activeTierPass}
        onSelectTierPass={setActiveTierPass}
        // The workbench: the roadmap cuts its ten steps by the pass, and the lab tabs swap their
        // guide banner. Everywhere else the links had nothing to change (`courseLevels.ts`).
        showCourseLevels={passChangesContent(activeTab)}
        accountEmail={accountEmail}
        onOpenAccount={() => setIsAccountOpen(true)}
        onOpenPalette={() => setIsPaletteOpen(true)}
        onOpenHome={() => openPage('home')}
        focus={focus}
        onToggleFocus={toggleFocusMode}
      />

      {/* Workspace mode and the running tally: one segmented control, three counters. The labels
          are the ones the smoke test asserts, so a redesign cannot reword what the tabs mean. */}
      <div
        data-chrome="mode-bar"
        className="border-b"
        style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)' }}
      >
        <div className="mx-auto flex max-w-[var(--shell-max)] flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <div
              role="group"
              aria-label="Workbench Complexity Mode"
              className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-[var(--r-full)] border p-1"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg)' }}
            >
              <button
                onClick={() => setViewMode('beginner')}
                data-testid="btn-mode-beginner"
                aria-pressed={viewMode === 'beginner'}
                className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[var(--r-full)] px-3 py-1.5 text-[12px] font-semibold transition-colors"
                style={
                  viewMode === 'beginner'
                    ? { backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }
                    : { color: 'var(--muted)' }
                }
              >
                <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
                Beginner View (Plain-English Path)
              </button>
              <button
                onClick={() => setViewMode('advanced')}
                data-testid="btn-mode-advanced"
                aria-pressed={viewMode === 'advanced'}
                className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[var(--r-full)] px-3 py-1.5 text-[12px] font-semibold transition-colors"
                style={
                  viewMode === 'advanced'
                    ? { backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }
                    : { color: 'var(--muted)' }
                }
              >
                <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
                {labsSwitchLabel(WORKBENCH_TABS.length)}
              </button>
            </div>

            <span className="hidden text-[11.5px] xl:inline" style={{ color: 'var(--dim)' }}>
              {viewMode === 'beginner'
                ? `Core beginner tabs first, in plain English. All ${WORKBENCH_TABS.length} workbench tabs stay one switch away.`
                : `All ${WORKBENCH_TABS.length} workbench tabs, with their technical names.`}
            </span>
          </div>

          <div
            className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] font-medium tnum"
            aria-label="Progress in this browser"
          >
            <span data-testid="progress-verified-count" style={{ color: 'var(--emerald)' }}>
              Executed &amp; Passed: {totalVerifiedLessons}/{PYTHON_LESSONS.length}
            </span>
            <span aria-hidden="true" style={{ color: 'var(--dim)' }}>·</span>
            <span data-testid="progress-lessons-count" style={{ color: 'var(--muted)' }}>
              Self-Marked: {totalCompletedLessons}/{PYTHON_LESSONS.length}
            </span>
            <span aria-hidden="true" style={{ color: 'var(--dim)' }}>·</span>
            <span data-testid="progress-milestones-count" style={{ color: 'var(--accent)' }}>
              Track Milestones: {totalCompletedMilestones}/{allMilestoneIds.length}
            </span>
          </div>
        </div>
      </div>

      {siteSettings.announcement && (
        <div
          role="status"
          data-testid="site-announcement"
          className="border-b px-4 py-2 text-center text-xs"
          style={{ backgroundColor: 'var(--accent-soft)', borderColor: 'var(--border)', color: 'var(--accent)' }}
        >
          {siteSettings.announcement}
        </div>
      )}

      {/* The simulator tour is for exploring the labs, not for the first lesson. On the Python
          runner it would put a tier-matrix paragraph between a newcomer and Lesson P.1, so it
          appears once they open the roadmap (or any simulator tab). The admin's `guided_tour` flag
          can hide it site-wide, and an absent setting means on. */}
      {flagOn(siteSettings, 'guided_tour') && activeTab !== 'tab-pyodide' && (
        <div data-chrome="tour">
          <GuidedTourBar
            currentStepIndex={tourIndex}
            totalSteps={TOUR_STEPS.length}
            stepInfo={TOUR_STEPS[tourIndex]}
            onPrev={handlePrevTourStep}
            onNext={handleNextTourStep}
            onApplyPreset={handleApplyPreset}
          />
        </div>
      )}

      {/* Below `xl` the rail is one scrollable line instead of a ten-card grid: the workbench fits
          on a strip, so the page below starts a full row higher and a newcomer sees one continuous
          strip of choices rather than a wall of tiles. At `xl` it is an activity bar instead: a
          vertical strip down the left edge, all eleven tabs in one column, so the last three no
          longer wait behind a sideways scroll. The wrapper is what makes the two a row; the rail's
          inner block is the sticky part, so the strip keeps its buttons in view while a long
          lesson scrolls past it. Every label and subtitle is unchanged in both. */}
      <div className="xl:flex">
        <nav
          aria-label="Simulator Tabs"
          data-chrome="rail"
          className="border-b xl:w-[196px] xl:shrink-0 xl:border-b-0 xl:border-r"
          style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)' }}
        >
          <div className="relative mx-auto max-w-[var(--shell-max)] xl:sticky xl:top-0 xl:max-h-screen xl:max-w-none xl:overflow-y-auto">
            <div
              data-testid="tab-rail"
              className="flex gap-2 overflow-x-auto px-3 py-2 sm:px-5 xl:flex-col xl:gap-1 xl:overflow-visible xl:px-2 xl:py-3"
              style={{ scrollbarWidth: 'thin', scrollSnapType: 'x proximity' }}
            >
            {visibleTabs.map((tab) => {
              const Icon = TAB_ICONS[tab.id] ?? Sparkles;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  data-testid={`tab-btn-${tab.id}`}
                  data-sound="nav"
                  onClick={() => {
                    setActiveTab(tab.id);
                    setHighlightedId(null);
                  }}
                  // Pointer and focus intent, not a click: the chunk is usually in memory by the time
                  // the button is released, so the tab appears instead of a panel saying "Loading".
                  // Nothing is fetched for a tab the learner never points at.
                  onPointerEnter={() => prefetchTab(tab.id)}
                  onFocus={() => prefetchTab(tab.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className="group flex min-w-[12rem] shrink-0 cursor-pointer snap-start items-center gap-2.5 rounded-[var(--r-md)] border px-2.5 py-2 text-left transition-colors xl:w-full xl:min-w-0"
                  style={{
                    borderColor: isActive ? 'var(--accent)' : 'var(--border)',
                    backgroundColor: isActive ? 'var(--accent-soft)' : 'transparent',
                  }}
                >
                  <span
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--r-sm)] border"
                    style={{
                      borderColor: isActive ? 'var(--accent)' : 'var(--border)',
                      color: isActive ? 'var(--accent)' : 'var(--dim)',
                      backgroundColor: isActive
                        ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
                        : 'var(--bg)',
                    }}
                    aria-hidden="true"
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span
                      className="block truncate text-[12.5px] font-semibold"
                      style={{ color: isActive ? 'var(--accent)' : 'var(--text)' }}
                    >
                      {viewMode === 'beginner' ? tab.beginnerLabel : tab.technicalLabel}
                    </span>
                    <span
                      className="mt-0.5 block truncate text-[11px]"
                      style={{ color: isActive ? 'var(--muted)' : 'var(--dim)' }}
                    >
                      {viewMode === 'beginner' ? tab.beginnerSubtitle : tab.beginnerLabel}
                    </span>
                  </span>
                </button>
              );
            })}
            </div>
            {/* The rail scrolls; the fade says so without a scrollbar squatting under it. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 w-10 xl:hidden"
              style={{ background: 'linear-gradient(90deg, transparent, var(--panel))' }}
            />
          </div>
        </nav>

        {/* Main Tab Pane. One Suspense boundary around the pane: only one tab is on screen, and every
            lazy tab's chunk is fetched the first time it is opened, so the fallback is a panel rather
            than a page. The runner is static, so the opening screen never shows it. */}
        <main id="main" tabIndex={-1} className="flex-1 min-w-0 p-3.5 sm:p-5 max-w-[1540px] w-full mx-auto space-y-4 outline-none">
          <React.Suspense
            fallback={
              <div
                data-testid="tab-loading"
                role="status"
                className="bg-panel border border-line rounded-xl p-6 text-sm text-muted"
              >
                Loading this tab…
              </div>
            }
          >
          {/* The landing screen is where a newcomer arrives, so it opens with the README's own
              "Start here" block: one heading, one Lesson 1 link, one plain-English line. Once Lesson 1
              is verified the same block closes to a single line. */}
          {activeTab === 'tab-pyodide' && !startHereDismissed && (
            <StartHereCard
              lessonOneVerified={!!verifiedLessons['P.1']}
              onDismiss={() => setStartHereDismissed(true)}
              onStartLesson={() => {
                // The reading link leaves for GitHub; this button stays and puts Lesson 1 under the
                // cursor, so the two doors are never confused for each other. `openLesson` also
                // handles the case where P.1 was already the prop but the reader had browsed away.
                openLesson('P.1');
              }}
            />
          )}
          {/* The story, once, on the landing screen and never over the editor. It carries the one
              sentence a first-timer needs before their first Run: the red is the starter, not them. */}
          {activeTab === 'tab-pyodide' && !storySeen && !verifiedLessons['P.1'] && (
            <StoryCard
              onStartLesson={() => {
                markStorySeen();
                setStorySeen(true);
                openLesson('P.1');
              }}
              onDismiss={() => {
                markStorySeen();
                setStorySeen(true);
              }}
            />
          )}
          {activeTab !== 'tab-arch' &&
            activeTab !== 'tab-pyodide' &&
            activeTab !== 'tab-placement' &&
            activeTab !== 'tab-board' &&
            activeTab !== 'tab-links' && (
            <SimulatorTierBanner
              tabId={activeTab}
              activeTierPass={activeTierPass}
              onSelectTierPass={setActiveTierPass}
            />
          )}

          {activeTab === 'tab-arch' && (
            <TabArchitecture
              onLoadPreset={handleLoadPreset}
              beginnerView={viewMode === 'beginner'}
              activeTierPass={activeTierPass}
              onSelectTierPass={setActiveTierPass}
              completedMilestones={completedMilestones}
              verifiedLessons={verifiedLessons}
              onToggleMilestone={handleToggleMilestone}
              startHereDismissed={startHereDismissed}
              onRestoreStartHere={handleRestoreStartHere}
              onOpenPyodideLesson={openLesson}
              lessonAttempts={lessonAttempts}
            />
          )}
          {activeTab === 'tab-bode' && <TabBode onLoadPreset={handleLoadPreset} highlightedId={highlightedId} presetRequest={presetRequest} />}
          {activeTab === 'tab-foc' && <TabFOC onLoadPreset={handleLoadPreset} highlightedId={highlightedId} presetRequest={presetRequest} />}
          {activeTab === 'tab-pend' && <TabPendulum onLoadPreset={handleLoadPreset} highlightedId={highlightedId} presetRequest={presetRequest} />}
          {activeTab === 'tab-models' && <TabModels onLoadPreset={handleLoadPreset} highlightedId={highlightedId} presetRequest={presetRequest} />}
          {activeTab === 'tab-cadpcb' && <TabCadPcb onLoadPreset={handleLoadPreset} highlightedId={highlightedId} presetRequest={presetRequest} />}
          {activeTab === 'tab-sysid' && <TabSysId onLoadPreset={handleLoadPreset} highlightedId={highlightedId} presetRequest={presetRequest} />}
          {activeTab === 'tab-eskf' && <TabEskf onLoadPreset={handleLoadPreset} highlightedId={highlightedId} presetRequest={presetRequest} />}
          {activeTab === 'tab-board' && <TabBoard />}
          {activeTab === 'tab-links' && <TabLinkHealth />}
          {activeTab === 'tab-pyodide' && (
            // An anchor for the Start here button: it scrolls here rather than opening GitHub.
            <div id="python-runner" className="scroll-mt-4">
              <TabPyodideRunner
                initialLessonId={pyodideLessonId}
                verifiedLessons={verifiedLessons}
                completedLessons={completedLessons}
                onMarkLessonVerified={handleMarkLessonVerified}
                onToggleLessonCompleted={handleToggleLessonCompleted}
                onOpenRoadmap={handleOpenRoadmap}
                runRequest={runRequest}
                formatRequest={formatRequest}
                tourRequest={tourRequest}
                reviewRequest={reviewRequest}
                lessonRequest={lessonRequest}
                sharedAttempt={sharedAttempt}
                onDismissShared={() => setSharedAttempt(null)}
                trySnippet={trySnippet}
                onDismissTry={() => setTrySnippet(null)}
              />
            </div>
          )}
          {activeTab === 'tab-placement' && (
            <TabPlacementQuiz
              onOpenPyodideLesson={openLesson}
              onSwitchSimulatorTab={(tabIdx) => {
                const legacyOrder: TabId[] = [
                  'tab-arch',
                  'tab-bode',
                  'tab-foc',
                  'tab-pend',
                  'tab-models',
                  'tab-cadpcb',
                  'tab-sysid',
                  'tab-eskf',
                  'tab-pyodide',
                  'tab-placement',
                ];
                const target = legacyOrder[tabIdx] || 'tab-arch';
                setActiveTab(target);
              }}
            />
          )}
          </React.Suspense>
        </main>
      </div>

      {/* Cheat sheet modal */}
      <CheatSheetModal
        isOpen={isCheatSheetOpen}
        onClose={() => setIsCheatSheetOpen(false)}
        onReplayTour={requestTour}
      />

      {/* `?`: which key does what, from the one table in `src/shortcuts.ts`. */}
      <ShortcutsModal isOpen={isShortcutsOpen} onClose={() => setIsShortcutsOpen(false)} />

      {/* ⌘K / ⌘P / ⌘⇧F. Rendered last so it sits above every panel, and only mounted while open. */}
      <CommandPalette
        isOpen={isPaletteOpen}
        mode={paletteMode}
        items={paletteMode === 'lessons' ? lessonPaletteItems : paletteItems}
        search={paletteSearch}
        note={proseNote}
        onClose={() => setIsPaletteOpen(false)}
        onSelect={handlePaletteSelect}
      />

      {/* Export Progress Portfolio Modal */}
      {isPortfolioModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-panel border border-line rounded-xl max-w-2xl w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-line-soft pb-3">
              <div>
                <h2 className="text-base font-bold text-ink">
                  Export Verified Progress &amp; Portfolio Certificate (`.md`)
                </h2>
                <p className="text-xs text-muted mt-0.5">
                  Save your completed Python lessons and roadmap milestones as a portable Markdown certificate for your GitHub profile or study log.
                </p>
              </div>
              <button
                onClick={() => setIsPortfolioModalOpen(false)}
                className="p-1.5 rounded-lg text-muted hover:text-ink bg-canvas border border-line cursor-pointer"
                aria-label="Close export modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <pre
              data-testid="portfolio-markdown-preview"
              className="p-3.5 rounded-lg bg-canvas border border-line-soft font-mono text-xs text-ink whitespace-pre-wrap max-h-80 overflow-y-auto"
            >
              {portfolioMarkdown}
            </pre>

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
              <button
                onClick={handleCopyPortfolio}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-raise hover:bg-elevate text-ink border border-line flex items-center gap-1.5 cursor-pointer"
              >
                {portfolioCopied ? <Check className="w-3.5 h-3.5 text-emerald" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{portfolioCopied ? 'Copied to Clipboard' : 'Copy Markdown'}</span>
              </button>
              <button
                onClick={handleDownloadPortfolioFile}
                data-testid="btn-download-portfolio-md"
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald hover:bg-emerald-strong text-inverse flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download mechalab-progress-portfolio.md</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {accountPanel}

      {/* What the last verification earned. It never takes focus and never blocks the editor, and
          its source is the ledger write that just happened — not a replay of the whole ledger. */}
      {gameAwards.length > 0 && (
        <React.Suspense fallback={null}>
          <AwardToast awards={gameAwards} onClose={() => setGameAwards([])} />
        </React.Suspense>
      )}

      {/* Focus mode hides every control that would offer a different task, so the way out has to be
          on screen itself: one pill, and Escape doing the same thing. */}
      {focus && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-1.5">
          {/* The header is hidden in focus, so the mute travels with the way out: a mute you cannot
              reach is not one click away. The pill variant is the button only — no panel over the
              work — and it reads the same store as the header's control. */}
          <React.Suspense fallback={null}>
            <SoundControlLazy variant="pill" />
          </React.Suspense>
          <button
            type="button"
            data-testid="btn-focus-pill"
            onClick={() => setFocusOn(setFocus(false))}
            title="Leave focus mode (Esc)"
            aria-keyshortcuts="Escape"
            className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] font-semibold shadow-lg"
            style={{
              borderColor: 'var(--border-strong)',
              backgroundColor: 'var(--panel)',
              color: 'var(--accent)',
            }}
          >
            <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
            Focus · Esc to leave
          </button>
        </div>
      )}

      <SiteFooter />
    </div>
  );
};

export default App;
