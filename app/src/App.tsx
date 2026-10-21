import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { GuidedTourBar, TourStepInfo } from './components/GuidedTourBar';
import { CheatSheetModal } from './components/CheatSheetModal';
import { CommandPalette } from './components/CommandPalette';
import { SimulatorTierBanner } from './components/SimulatorTierBanner';
import { StartHereCard } from './components/StartHereCard';
import { STORAGE_KEY_START_HERE_DISMISSED } from './startHere';
import { SPINE_STEP_COUNT, stepForMilestone } from './spine';
import { TabArchitecture } from './components/tabs/TabArchitecture';
import { TabBode } from './components/tabs/TabBode';
import { TabFOC } from './components/tabs/TabFOC';
import { TabPendulum } from './components/tabs/TabPendulum';
import { TabModels } from './components/tabs/TabModels';
import { TabCadPcb } from './components/tabs/TabCadPcb';
import { TabSysId } from './components/tabs/TabSysId';
import { TabEskf } from './components/tabs/TabEskf';
import { TabLinkHealth } from './components/tabs/TabLinkHealth';
import { TabPyodideRunner, STORAGE_KEY_VERIFIED, STORAGE_KEY_COMPLETED } from './components/tabs/TabPyodideRunner';
import { TabPlacementQuiz } from './components/tabs/TabPlacementQuiz';
import { PresetRequest, tabForPreset } from './demoPresets';
import { AccountPanel } from './components/AccountPanel';
import {
  accountsConfigured,
  currentSession,
  onSessionChange,
  sendMagicLink,
  signOutNow,
} from './accounts';
import { loadProgress, saveProgress } from './cloudProgress';
import { mergeProgress, PROGRESS_SCHEMA, type ProgressSnapshot } from './progressMerge';
import { downloadLearningLog, readLearningLog, replaceLearningLog } from './learningLog';
import type { Session } from '@supabase/supabase-js';
import { TabId } from './types';
import { PYTHON_LESSONS } from './data/pythonLessonsData';
import { useTheme } from './useTheme';
import { ThemeTokens } from './components/ThemeTokens';
import { themeViewFromLocation, themeViewSearch } from './themeRoute';
import { PYTHON_TAB_NAME, TAB_NAMES } from './tabNames';
import { lessonIdFromLocation } from './lessonRoute';
import { readLastLessonId, lessonOffer } from './lastLesson';
import { lessonIdOf, type PaletteItem } from './palette';
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
  Cpu,
  Download,
  FlaskConical,
  Gauge,
  GraduationCap,
  LineChart,
  Link2,
  Map as MapIcon,
  Radar,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

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

export const STORAGE_KEY_MILESTONES = 'mechalab_linear_milestones_v1';
export const STORAGE_KEY_TIER = 'mechalab_active_tier_pass_v1';
export const STORAGE_KEY_VIEW_MODE = 'mechalab_view_mode_v1';
// When the three progress maps last changed, so a cloud merge can tell which side is newer.
const STORAGE_KEY_PROGRESS_UPDATED = 'mechalab.progress.updatedAt.v1';

function readFlagMap(key: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

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
    id: 'tab-links',
    beginnerLabel: `${TAB_NAMES['tab-links']} (Nightly Check)`,
    beginnerSubtitle: 'See which outside links still work',
    technicalLabel: 'Link Check History & Not-Checked Trend',
    technicalSubtitle: 'Blocked / Unreachable Citations · Run Timeline',
    isBeginnerCore: false,
  },
];

export function buildPortfolioMarkdown(
  verifiedLessons: Record<string, boolean>,
  completedLessons: Record<string, boolean>,
  completedMilestones: Record<string, boolean>
): string {
  const allSteps = [
    ...LEVEL_0_STEPS,
    ...TIER_1_LINEAR_PASS,
    ...TIER_2_LINEAR_PASS,
    ...TIER_3_LINEAR_PASS,
  ];
  const verifiedPy = PYTHON_LESSONS.filter((l) => verifiedLessons[l.id]);
  const selfMarkedPy = PYTHON_LESSONS.filter((l) => completedLessons[l.id] && !verifiedLessons[l.id]);
  const totalSelfMarkedPy = PYTHON_LESSONS.filter((l) => completedLessons[l.id]).length;
  const passedMilestones = allSteps.filter((s) => completedMilestones[s.milestoneId]);

  const lines: string[] = [
    '# MechaLab — Learner Progress & Portfolio Summary',
    '',
    `- **Generated:** ${new Date().toISOString().slice(0, 10)}`,
    `- **Execution-Verified In-Browser Python Lessons (Executed & Passed in Pyodide WASM):** ${verifiedPy.length} / ${PYTHON_LESSONS.length}`,
    `- **Self-Marked Completed Python Lessons (Manual Checklist):** ${totalSelfMarkedPy} / ${PYTHON_LESSONS.length}`,
    `- **Self-Reported Roadmap Track Milestones:** ${passedMilestones.length} / ${allSteps.length}`,
    '',
    '## 1. Execution-Verified Python Exercises (Executed & Passed in Pyodide WASM)',
    '',
  ];

  if (verifiedPy.length === 0) {
    lines.push(`_No Python lessons have been executed and passed in Pyodide WASM yet. Open ${PYTHON_TAB_NAME} and click "Run & Verify Output" to execute your first entry._`);
  } else {
    for (const l of verifiedPy) {
      lines.push(`- [x] **Lesson ${l.id} (${l.title})** — \`${l.path}\` *(Executed & Passed in Pyodide WASM)*`);
    }
  }

  lines.push('', '## 2. Self-Marked Completed Python Lessons (Manual Checklist, Not Yet Executed in WASM)', '');
  if (selfMarkedPy.length === 0) {
    lines.push('_No additional lessons self-marked complete without Pyodide execution._');
  } else {
    for (const l of selfMarkedPy) {
      lines.push(`- [x] **Lesson ${l.id} (${l.title})** — \`${l.path}\` *(Self-Marked Complete)*`);
    }
  }

  lines.push('', '## 3. Self-Reported Ten-Step Track Milestones', '');
  if (passedMilestones.length === 0) {
    lines.push('_No track milestones checked off yet. Use the Roadmap & Progress tab to track your pass completion._');
  } else {
    for (const s of passedMilestones) {
      // The spine's number and title, so the export names a step the pages also name.
      const at = stepForMilestone(s.milestoneId);
      lines.push(
        `- [x] **Step ${at?.number ?? '?'} of ${SPINE_STEP_COUNT} · ${at?.title ?? s.trackTitle}** — ${s.deliverableGate}`
      );
    }
  }

  lines.push(
    '',
    '---',
    '*Exported from [MechaLab Beginner-First Mechatronics & Robotics Workbench](https://tle47.github.io/Mechatronics-Roadmap/)*'
  );
  return lines.join('\n');
}

/**
 * The one footer, so the palette page and the workbench cannot drift apart. The token reference is
 * linked rather than hidden behind a typed URL: a page nobody can find is a page nobody checks.
 */
const SiteFooter: React.FC = () => (
  <footer className="border-t border-line-soft bg-canvas px-4 py-3 text-center text-[11.5px] text-faint">
    MechaLab · Ten-Step Spiral Mechatronics Curriculum (Track P → Stage 0 → Depths 1–3) · Dual License:
    CC BY 4.0 (Docs) &amp; MIT (Code) ·{' '}
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
  const { theme, toggle: toggleThemeMode } = useTheme();
  // `?view=theme` is a page of its own, read once on arrival. It is not a workbench tab: the rail
  // stays the eleven tabs a learner needs, and this is a reference for whoever is adding a colour.
  const [themeView] = useState<boolean>(() => themeViewFromLocation());

  // A newcomer arrives to run the first lesson, not to read the advanced roadmap: open the Python
  // runner by default. The roadmap tab is still one click away for anyone who wants the map.
  const [activeTab, setActiveTab] = useState<TabId>('tab-pyodide');
  const [tourIndex, setTourIndex] = useState<number>(0);
  const [isCheatSheetOpen, setIsCheatSheetOpen] = useState<boolean>(false);
  // `⌘K` is the keyboard's table of contents: one dialog over lessons, tabs and commands.
  const [isPaletteOpen, setIsPaletteOpen] = useState<boolean>(false);
  // Bumped by the palette's "Run the lesson" command; the runner watches it (see `runRequest`).
  const [runRequest, setRunRequest] = useState<number>(0);
  // Bumped whenever a learner asks for a specific entry, so the runner can tell a new pick from a
  // render that happens to carry the same id.
  const [lessonRequest, setLessonRequest] = useState<{ id: string; nonce: number } | null>(null);
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

    const applySession = async (session: Session | null) => {
      if (cancelled) return;
      setAccountEmail(session?.user.email ?? null);
      setAccountUserId(session?.user.id ?? null);
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

  const handleSendMagicLink = async (address: string) => {
    setAccountBusy(true);
    setAccountError(null);
    const problem = await sendMagicLink(address);
    setAccountBusy(false);
    if (problem) setAccountError(problem);
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
    setSyncNote('');
    setAccountError(null);
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

  const handleMarkLessonVerified = (lessonId: string) => {
    setVerifiedLessons((prev) => ({
      ...prev,
      [lessonId]: true,
    }));
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

  const openLesson = (lessonId: string) => {
    setPyodideLessonId(lessonId);
    // The id alone is not enough: re-choosing the lesson a deep link already named is a no-op prop
    // change, so the runner gets a request it can count.
    setLessonRequest((prev) => ({ id: lessonId, nonce: (prev?.nonce ?? 0) + 1 }));
    setActiveTab('tab-pyodide');
    setHighlightedId(null);
    document.getElementById('python-runner')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handlePaletteSelect = (item: PaletteItem) => {
    const lessonId = lessonIdOf(item);
    if (lessonId) {
      openLesson(lessonId);
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
      case 'action-toggle-theme':
        toggleThemeMode();
        break;
      case 'action-beginner-view':
        setViewMode('beginner');
        break;
      case 'action-advanced-view':
        setViewMode('advanced');
        break;
      case 'action-open-cheatsheet':
        setIsCheatSheetOpen(true);
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
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const allMilestoneIds = [
    ...LEVEL_0_STEPS,
    ...TIER_1_LINEAR_PASS,
    ...TIER_2_LINEAR_PASS,
    ...TIER_3_LINEAR_PASS,
  ].map((s) => s.milestoneId);

  const totalCompletedMilestones = allMilestoneIds.filter((id) => completedMilestones[id]).length;
  const totalVerifiedLessons = PYTHON_LESSONS.filter((l) => verifiedLessons[l.id]).length;
  const totalCompletedLessons = PYTHON_LESSONS.filter((l) => completedLessons[l.id]).length;

  // The roadmap leads with the lesson to do next, not with Step 1 of ten: the runner already
  // remembers where the learner stopped (`src/lastLesson.ts`), and "continue" has to mean forward
  // progress - the stopped-on lesson while it is unverified, the first unfinished one after it once
  // it is not. Read at render rather than mirrored in state: the runner owns the id, and opening
  // this tab re-renders, so there is no second copy to go stale.
  const resumeLesson = (() => {
    const offer = lessonOffer(
      readLastLessonId(),
      PYTHON_LESSONS.map((lesson) => lesson.id),
      { verified: verifiedLessons, completed: completedLessons }
    );
    if (!offer) return null;
    const entry = PYTHON_LESSONS.find((lesson) => lesson.id === offer.id);
    if (!entry) return null;
    return {
      id: entry.id,
      title: entry.title,
      track: entry.track,
      verified: !!verifiedLessons[entry.id],
      completed: !!completedLessons[entry.id],
      reason: offer.reason,
    };
  })();

  // A page's "Run this in the workbench" link arrives as `?lesson=<id>`; the runner opens on that
  // entry instead of making the reader find it in the search box again. An id the registry does not
  // list is ignored rather than shown as an empty editor. With no query string the workbench reopens
  // the lesson the learner was last on (`src/lastLesson.ts`), and only then falls back to P.1 - the
  // address is the deliberate pick, storage is the ordinary one, and both are validated by id.
  const [pyodideLessonId, setPyodideLessonId] = useState<string>(
    () => lessonIdFromLocation() ?? readLastLessonId() ?? 'P.1'
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

  const portfolioMarkdown = buildPortfolioMarkdown(verifiedLessons, completedLessons, completedMilestones);

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

  if (themeView) {
    return (
      <div id="top" className="min-h-screen flex flex-col bg-canvas text-ink">
        <Header
          theme={theme}
          onToggle={toggleThemeMode}
          onOpenCheatSheet={() => setIsCheatSheetOpen(true)}
          onExportPortfolio={() => setIsPortfolioModalOpen(true)}
          activeTierPass={activeTierPass}
          onSelectTierPass={setActiveTierPass}
          accountEmail={accountEmail}
          onOpenAccount={() => setIsAccountOpen(true)}
          onOpenPalette={() => setIsPaletteOpen(true)}
        />
        <main
          id="main"
          tabIndex={-1}
          className="flex-1 p-3.5 sm:p-5 max-w-[1540px] w-full mx-auto outline-none"
        >
          <ThemeTokens theme={theme} onToggle={toggleThemeMode} />
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div id="top" className="min-h-screen flex flex-col bg-canvas text-ink">
      {/* Keyboard users can jump the header, the mode bar and the tab rail in one key. */}
      <a href="#main" className="skip-link">
        Skip to the workbench
      </a>
      <Header
        theme={theme}
        onToggle={toggleThemeMode}
        onOpenCheatSheet={() => setIsCheatSheetOpen(true)}
        onExportPortfolio={() => setIsPortfolioModalOpen(true)}
        activeTierPass={activeTierPass}
        onSelectTierPass={setActiveTierPass}
        accountEmail={accountEmail}
        onOpenAccount={() => setIsAccountOpen(true)}
        onOpenPalette={() => setIsPaletteOpen(true)}
      />

      {/* Workspace mode and the running tally: one segmented control, three counters. The labels
          are the ones the smoke test asserts, so a redesign cannot reword what the tabs mean. */}
      <div className="border-b" style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)' }}>
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
                All 10 Engineering Labs (Technical Names)
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

      {/* The simulator tour is for exploring the labs, not for the first lesson. On the Python
          runner it would put a tier-matrix paragraph between a newcomer and Lesson P.1, so it
          appears once they open the roadmap (or any simulator tab). */}
      {activeTab !== 'tab-pyodide' && (
        <GuidedTourBar
          currentStepIndex={tourIndex}
          totalSteps={TOUR_STEPS.length}
          stepInfo={TOUR_STEPS[tourIndex]}
          onPrev={handlePrevTourStep}
          onNext={handleNextTourStep}
          onApplyPreset={handleApplyPreset}
        />
      )}

      {/* One scrollable rail instead of a ten-card grid: the whole workbench fits on one line, so
          the page below starts a full row higher and a newcomer sees one continuous strip of
          choices rather than a wall of tiles. Every label and subtitle is unchanged. */}
      <nav
        aria-label="Simulator Tabs"
        className="border-b"
        style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)' }}
      >
        <div className="relative mx-auto max-w-[var(--shell-max)]">
          <div
            className="flex gap-2 overflow-x-auto px-3 py-2 sm:px-5"
            style={{ scrollbarWidth: 'thin', scrollSnapType: 'x proximity' }}
          >
          {visibleTabs.map((tab) => {
            const Icon = TAB_ICONS[tab.id] ?? Sparkles;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                data-testid={`tab-btn-${tab.id}`}
                onClick={() => {
                  setActiveTab(tab.id);
                  setHighlightedId(null);
                }}
                aria-current={isActive ? 'page' : undefined}
                className="group flex min-w-[12rem] shrink-0 cursor-pointer snap-start items-center gap-2.5 rounded-[var(--r-md)] border px-2.5 py-2 text-left transition-colors"
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
            className="pointer-events-none absolute inset-y-0 right-0 w-10"
            style={{ background: 'linear-gradient(90deg, transparent, var(--panel))' }}
          />
        </div>
      </nav>

      {/* Main Tab Pane */}
      <main id="main" tabIndex={-1} className="flex-1 p-3.5 sm:p-5 max-w-[1540px] w-full mx-auto space-y-4 outline-none">
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
        {activeTab !== 'tab-arch' &&
          activeTab !== 'tab-pyodide' &&
          activeTab !== 'tab-placement' &&
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
            resumeLesson={resumeLesson}
          />
        )}
        {activeTab === 'tab-bode' && <TabBode onLoadPreset={handleLoadPreset} highlightedId={highlightedId} presetRequest={presetRequest} />}
        {activeTab === 'tab-foc' && <TabFOC onLoadPreset={handleLoadPreset} highlightedId={highlightedId} presetRequest={presetRequest} />}
        {activeTab === 'tab-pend' && <TabPendulum onLoadPreset={handleLoadPreset} highlightedId={highlightedId} presetRequest={presetRequest} />}
        {activeTab === 'tab-models' && <TabModels onLoadPreset={handleLoadPreset} highlightedId={highlightedId} presetRequest={presetRequest} />}
        {activeTab === 'tab-cadpcb' && <TabCadPcb onLoadPreset={handleLoadPreset} highlightedId={highlightedId} presetRequest={presetRequest} />}
        {activeTab === 'tab-sysid' && <TabSysId onLoadPreset={handleLoadPreset} highlightedId={highlightedId} presetRequest={presetRequest} />}
        {activeTab === 'tab-eskf' && <TabEskf onLoadPreset={handleLoadPreset} highlightedId={highlightedId} presetRequest={presetRequest} />}
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
              lessonRequest={lessonRequest}
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
      </main>

      {/* Cheat sheet modal */}
      <CheatSheetModal isOpen={isCheatSheetOpen} onClose={() => setIsCheatSheetOpen(false)} />

      {/* ⌘K. Rendered last so it sits above every panel, and only mounted while open. */}
      <CommandPalette
        isOpen={isPaletteOpen}
        items={paletteItems}
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

      <AccountPanel
        isOpen={isAccountOpen}
        onClose={() => setIsAccountOpen(false)}
        configured={accountsConfigured}
        email={accountEmail}
        note={syncNote}
        error={accountError}
        busy={accountBusy}
        onSendLink={handleSendMagicLink}
        onSignOut={handleSignOut}
      />

      <SiteFooter />
    </div>
  );
};

export default App;
