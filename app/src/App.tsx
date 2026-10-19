import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { GuidedTourBar, TourStepInfo } from './components/GuidedTourBar';
import { CheatSheetModal } from './components/CheatSheetModal';
import { SimulatorTierBanner } from './components/SimulatorTierBanner';
import { TabArchitecture } from './components/tabs/TabArchitecture';
import { TabBode } from './components/tabs/TabBode';
import { TabFOC } from './components/tabs/TabFOC';
import { TabPendulum } from './components/tabs/TabPendulum';
import { TabModels } from './components/tabs/TabModels';
import { TabCadPcb } from './components/tabs/TabCadPcb';
import { TabSysId } from './components/tabs/TabSysId';
import { TabEskf } from './components/tabs/TabEskf';
import { TabPyodideRunner, STORAGE_KEY_VERIFIED, STORAGE_KEY_COMPLETED } from './components/tabs/TabPyodideRunner';
import { TabPlacementQuiz } from './components/tabs/TabPlacementQuiz';
import { TabId } from './types';
import { PYTHON_LESSONS } from './data/pythonLessonsData';
import {
  ActiveTierPass,
  LEVEL_0_STEPS,
  TIER_1_LINEAR_PASS,
  TIER_2_LINEAR_PASS,
  TIER_3_LINEAR_PASS,
} from './curriculumData';
import { Copy, Check, Download, X } from 'lucide-react';

const TOUR_STEPS: TourStepInfo[] = [
  {
    tab: 'tab-arch',
    targetId: null,
    title: 'Step 1 / 8 — Linear Multi-Pass Level-Up Roadmap (Stage 0 → Pass 1 → Pass 2 → Pass 3)',
    desc: 'Start with Track P & Stage 0 foundations, then complete Pass 1 (Tier 1 Beginner) linearly from Track 00 to Track 08 before looping back for Pass 2 (Tier 2 Applied) and Pass 3 (Tier 3 Production). Click "Next Step →" to test the simulators!',
  },
  {
    tab: 'tab-bode',
    targetId: 'sl-fn',
    title: 'Step 2 / 8 — Canceling Mechanical Vibration with a Notch Filter',
    desc: 'Notice the highlighted Notch Center slider. When detuned from the resonance frequency, the green curve has a large vibration peak. Drag the slider or click "Apply Demo Preset" to watch the filter surgically erase the vibration peak.',
  },
  {
    tab: 'tab-foc',
    targetId: 'btn-dec-toggle',
    title: 'Step 3 / 8 — Brushless Motor Field-Oriented Control (FOC) & Decoupling',
    desc: 'At high RPM, spinning magnets induce cross-coupling voltages (±ω_e L i_q). Click the highlighted "Toggle Decoupling Feedforward" button to see how turning off feedforward decoupling causes a large rose-colored i_d current error spike!',
  },
  {
    tab: 'tab-pend',
    targetId: 'sl-xmax',
    title: 'Step 4 / 8 — Pendulum Energy Swing-Up, Balancing & Safety Walls',
    desc: 'Watch the Furuta Pendulum pump energy until upright and catch itself! Drag the highlighted Safety Wall slider (x_max) inward or click "Apply Demo Preset" to inject a +3.2 rad/s kick—the safety filter brakes the cart before crossing the red walls.',
  },
  {
    tab: 'tab-models',
    targetId: 'sl-rq2',
    title: 'Step 5 / 8 — 3D Robot Arm Kinematics & Sub-Microsecond Safety Cutoff (STO)',
    desc: 'Drag the highlighted Joint q_2 slider to articulate the 3-DOF Hopping Leg, or click "Apply Demo Preset" to inject a 42A Overcurrent Short and watch the dual-channel hardware STO trip the MOSFET gates to SAFE HIGH-Z in 0.65 μs!',
  },
  {
    tab: 'tab-cadpcb',
    targetId: 'sl-pcbl',
    title: 'Step 6 / 8 — 3D Flexure Hinges & Motor Driver PCB Voltage Spikes',
    desc: 'Drag the highlighted Loop Inductance slider (L_loop) above 4.0 nH: notice how V_DS,peak turns red (>60V) because stray PCB trace inductance spikes during turn-off! Click "Apply Demo Preset" to snap back to our 6-layer 1.6 nH layout.',
  },
  {
    tab: 'tab-sysid',
    targetId: 'btn-sysmode-toggle',
    title: 'Step 7 / 8 — Sine-Sweep & Multisine System Identification',
    desc: 'Notice how zero-phase cosines (φ_k = 0) create a giant impulse spike at t=0 (CF = 8.00) that clips the actuator! Click "Apply Demo Preset" to switch to Schroeder quadratic phasing—compressing Crest Factor to 1.66 and locking onto the true cyan plant curve.',
  },
  {
    tab: 'tab-eskf',
    targetId: 'btn-seqlock-toggle',
    title: 'Step 8 / 8 — IMU Attitude Sensor Fusion & Torn-Read Protection',
    desc: 'When WaitFreeSeqLock is disabled, the 40 kHz motor ISR overwrites the telemetry struct mid-read—causing violent red torn-read spikes! Click "Apply Demo Preset" to enable atomic sequence locking (0 torn reads in 29.6 ns) while estimating gyro bias.',
  },
];

export const STORAGE_KEY_MILESTONES = 'mechalab_linear_milestones_v1';
export const STORAGE_KEY_TIER = 'mechalab_active_tier_pass_v1';
export const STORAGE_KEY_VIEW_MODE = 'mechalab_view_mode_v1';

export type WorkbenchViewMode = 'beginner' | 'advanced';

export interface WorkbenchTabMeta {
  id: TabId;
  beginnerLabel: string;
  technicalLabel: string;
  technicalSubtitle: string;
  isBeginnerCore: boolean;
}

export const WORKBENCH_TABS: WorkbenchTabMeta[] = [
  {
    id: 'tab-arch',
    beginnerLabel: '1. Start Here: Roadmap & Progress',
    technicalLabel: '1. Linear Tier Roadmap (Tracks 00→08)',
    technicalSubtitle: 'Track P · Stage 0 · Pass 1–3 Matrix',
    isBeginnerCore: true,
  },
  {
    id: 'tab-pyodide',
    beginnerLabel: `2. Run Python Lessons (${PYTHON_LESSONS.length} Exercises)`,
    technicalLabel: '9. In-Browser Python Runner (36 Lessons)',
    technicalSubtitle: 'Pyodide WASM · 3-Step Hints · Asserts',
    isBeginnerCore: true,
  },
  {
    id: 'tab-placement',
    beginnerLabel: '3. Placement Quiz (Skip What You Know)',
    technicalLabel: '10. Prerequisite Placement Quiz',
    technicalSubtitle: '8 Module Skip-Gate Checkpoints',
    isBeginnerCore: true,
  },
  {
    id: 'tab-bode',
    beginnerLabel: '4. Vibration Filter & Resonance Lab',
    technicalLabel: '2. Two-Mass Resonance & Notch Bode (Lab 00/05)',
    technicalSubtitle: 'Two-Mass Bode · Biquad Notch Filter',
    isBeginnerCore: true,
  },
  {
    id: 'tab-foc',
    beginnerLabel: '5. Brushless Motor Control Lab',
    technicalLabel: '3. 25 kHz PMSM FOC & SVPWM (Lab 01/03)',
    technicalSubtitle: '3-Phase BLDC · d-q FOC · SVPWM',
    isBeginnerCore: true,
  },
  {
    id: 'tab-pend',
    beginnerLabel: '6. Pendulum Balance & Safety Walls',
    technicalLabel: '4. Furuta Pendulum + LQR + CBF (Lab 02/05)',
    technicalSubtitle: 'PID/LQR Balance · CBF Safety Filter',
    isBeginnerCore: true,
  },
  {
    id: 'tab-models',
    beginnerLabel: '7. Robot Arm Kinematics & Safety Cutoff',
    technicalLabel: '5. URDF/MuJoCo Inspector & STO Safety (Lab 07/08)',
    technicalSubtitle: 'Forward/Inverse Kinematics · <1 μs STO',
    isBeginnerCore: false,
  },
  {
    id: 'tab-cadpcb',
    beginnerLabel: '8. 3D Parts & Motor Driver PCB Lab',
    technicalLabel: '6. 3D CAD Parts & 48V/30A FOC PCB BOM',
    technicalSubtitle: 'STEP Flexures · Parasitic Inductance',
    isBeginnerCore: false,
  },
  {
    id: 'tab-sysid',
    beginnerLabel: '9. Sine-Sweep System Identification',
    technicalLabel: '7. Schroeder Multisine Closed-Loop SysID (Lab 07)',
    technicalSubtitle: 'Frequency-Domain Plant Identification',
    isBeginnerCore: false,
  },
  {
    id: 'tab-eskf',
    beginnerLabel: '10. IMU Sensor Fusion & Real-Time Lock',
    technicalLabel: '8. 6-DOF Attitude ESKF & RTOS SeqLock (Lab 04/05)',
    technicalSubtitle: 'IMU Gyro/Accel Fusion · WaitFreeSeqLock',
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
    lines.push('_No Python lessons have been executed and passed in Pyodide WASM yet. Open Tab 2 (Run Python Lessons) and click "Run & Verify Output" to execute your first exercise._');
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

  lines.push('', '## 3. Self-Reported Multi-Pass Track Milestones', '');
  if (passedMilestones.length === 0) {
    lines.push('_No track milestones checked off yet. Use the Roadmap & Progress tab to track your pass completion._');
  } else {
    for (const s of passedMilestones) {
      lines.push(`- [x] **${s.stepNumber} · ${s.trackCode} (${s.trackTitle})** — ${s.deliverableGate}`);
    }
  }

  lines.push(
    '',
    '---',
    '*Exported from [MechaLab Beginner-First Mechatronics & Robotics Workbench](https://tle47.github.io/Mechatronics-Roadmap/)*'
  );
  return lines.join('\n');
}

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('tab-arch');
  const [tourIndex, setTourIndex] = useState<number>(0);
  const [isCheatSheetOpen, setIsCheatSheetOpen] = useState<boolean>(false);
  const [isPortfolioModalOpen, setIsPortfolioModalOpen] = useState<boolean>(false);
  const [portfolioCopied, setPortfolioCopied] = useState<boolean>(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

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

  const allMilestoneIds = [
    ...LEVEL_0_STEPS,
    ...TIER_1_LINEAR_PASS,
    ...TIER_2_LINEAR_PASS,
    ...TIER_3_LINEAR_PASS,
  ].map((s) => s.milestoneId);

  const totalCompletedMilestones = allMilestoneIds.filter((id) => completedMilestones[id]).length;
  const totalVerifiedLessons = PYTHON_LESSONS.filter((l) => verifiedLessons[l.id]).length;
  const totalCompletedLessons = PYTHON_LESSONS.filter((l) => completedLessons[l.id]).length;

  const [pyodideLessonId, setPyodideLessonId] = useState<string>('P.1');

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
    else if (step.tab === 'tab-foc') handleLoadPreset('foc_cobot_joint');
    else if (step.tab === 'tab-pend') handleLoadPreset('pend_swingup');
    else if (step.tab === 'tab-models') handleLoadPreset('sto_desat_short');
    else if (step.tab === 'tab-cadpcb') handleLoadPreset('pcb_6layer_opt');
    else if (step.tab === 'tab-sysid') handleLoadPreset('sysid_schroeder_clean');
    else if (step.tab === 'tab-eskf') handleLoadPreset('eskf_seqlock_clean');
  };

  const handleLoadPreset = (presetId: string) => {
    if (presetId.startsWith('wafer') || presetId.startsWith('surgical') || presetId.startsWith('cnc')) {
      setActiveTab('tab-bode');
    } else if (presetId.startsWith('foc_')) {
      setActiveTab('tab-foc');
    } else if (presetId.startsWith('pend_')) {
      setActiveTab('tab-pend');
    } else if (presetId.startsWith('robot_') || presetId.startsWith('sto_')) {
      setActiveTab('tab-models');
    } else if (presetId.startsWith('pcb_') || presetId.startsWith('cad_')) {
      setActiveTab('tab-cadpcb');
    } else if (presetId.startsWith('sysid_')) {
      setActiveTab('tab-sysid');
    } else if (presetId.startsWith('eskf_')) {
      setActiveTab('tab-eskf');
    }
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

  return (
    <div id="top" className="min-h-screen flex flex-col bg-[#0b0f19] text-[#f1f5f9]">
      <Header
        onOpenCheatSheet={() => setIsCheatSheetOpen(true)}
        onExportPortfolio={() => setIsPortfolioModalOpen(true)}
        activeTierPass={activeTierPass}
        onSelectTierPass={setActiveTierPass}
      />

      {/* Workspace Mode & Live Progress Toolbar */}
      <div className="bg-[#111827] border-b border-[#334155] px-5 py-2.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div
            role="group"
            aria-label="Workbench Complexity Mode"
            className="flex flex-wrap items-center gap-1 bg-[#0b0f19] p-1 rounded-lg border border-[#334155]"
          >
            <button
              onClick={() => setViewMode('beginner')}
              data-testid="btn-mode-beginner"
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                viewMode === 'beginner'
                  ? 'bg-[#34d399]/20 text-[#34d399] border border-[#34d399]/50'
                  : 'text-[#94a3b8] hover:text-[#f1f5f9] border border-transparent'
              }`}
            >
              Beginner View (Plain-English Path)
            </button>
            <button
              onClick={() => setViewMode('advanced')}
              data-testid="btn-mode-advanced"
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                viewMode === 'advanced'
                  ? 'bg-[#38bdf8]/20 text-[#38bdf8] border border-[#38bdf8]/50'
                  : 'text-[#94a3b8] hover:text-[#f1f5f9] border border-transparent'
              }`}
            >
              All 10 Engineering Labs (Technical Names)
            </button>
          </div>

          <span className="text-[#94a3b8] hidden xl:inline">
            {viewMode === 'beginner'
              ? 'Showing core beginner tabs with plain-English titles first. Switch anytime to view all 10 Tier 2/3 labs.'
              : 'Showing all 10 simulators with technical control-theory & embedded terminology.'}
          </span>
        </div>

        {/* Unboxed tabular-nums progress summary */}
        <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-[#cbd5e1]">
          <span className="text-[#34d399]" data-testid="progress-verified-count">
            Executed &amp; Passed: {totalVerifiedLessons}/{PYTHON_LESSONS.length}
          </span>
          <span aria-hidden="true" className="text-[#475569]">·</span>
          <span className="text-[#cbd5e1]" data-testid="progress-lessons-count">
            Self-Marked: {totalCompletedLessons}/{PYTHON_LESSONS.length}
          </span>
          <span aria-hidden="true" className="text-[#475569]">·</span>
          <span className="text-[#38bdf8]" data-testid="progress-milestones-count">
            Track Milestones: {totalCompletedMilestones}/{allMilestoneIds.length}
          </span>
        </div>
      </div>

      <GuidedTourBar
        currentStepIndex={tourIndex}
        totalSteps={TOUR_STEPS.length}
        stepInfo={TOUR_STEPS[tourIndex]}
        onPrev={handlePrevTourStep}
        onNext={handleNextTourStep}
        onApplyPreset={handleApplyPreset}
      />

      {/* Tabs navigation */}
      <nav
        aria-label="Simulator Tabs"
        className={`grid grid-cols-1 sm:grid-cols-3 ${
          viewMode === 'beginner' ? 'xl:grid-cols-6' : 'xl:grid-cols-5'
        } bg-[#111827] border-b border-[#334155] p-2 gap-2`}
      >
        {visibleTabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              data-testid={`tab-btn-${tab.id}`}
              onClick={() => {
                setActiveTab(tab.id);
                setHighlightedId(null);
              }}
              className={`px-3 py-2 rounded-lg text-left transition-all cursor-pointer ${
                isActive
                  ? 'bg-[#38bdf8]/15 border border-[#38bdf8] text-[#f1f5f9]'
                  : 'bg-[#1e293b] text-[#cbd5e1] hover:text-[#f1f5f9] border border-[#334155]'
              }`}
            >
              <div
                className={`text-xs font-semibold truncate whitespace-nowrap ${
                  isActive ? 'text-[#38bdf8]' : 'text-[#f1f5f9]'
                }`}
              >
                {viewMode === 'beginner' ? tab.beginnerLabel : tab.technicalLabel}
              </div>
              <div className="text-[11px] font-mono text-[#94a3b8] truncate whitespace-nowrap mt-0.5">
                {viewMode === 'beginner' ? tab.technicalSubtitle : tab.beginnerLabel}
              </div>
            </button>
          );
        })}
      </nav>

      {/* Main Tab Pane */}
      <main className="flex-1 p-3.5 sm:p-5 max-w-[1540px] w-full mx-auto space-y-4">
        {activeTab !== 'tab-arch' && activeTab !== 'tab-pyodide' && activeTab !== 'tab-placement' && (
          <SimulatorTierBanner
            tabId={activeTab}
            activeTierPass={activeTierPass}
            onSelectTierPass={setActiveTierPass}
          />
        )}

        {activeTab === 'tab-arch' && (
          <TabArchitecture
            onLoadPreset={handleLoadPreset}
            activeTierPass={activeTierPass}
            onSelectTierPass={setActiveTierPass}
            completedMilestones={completedMilestones}
            onToggleMilestone={handleToggleMilestone}
            onOpenPyodideLesson={(lessonId) => {
              setPyodideLessonId(lessonId);
              setActiveTab('tab-pyodide');
            }}
          />
        )}
        {activeTab === 'tab-bode' && <TabBode onLoadPreset={handleLoadPreset} highlightedId={highlightedId} />}
        {activeTab === 'tab-foc' && <TabFOC onLoadPreset={handleLoadPreset} highlightedId={highlightedId} />}
        {activeTab === 'tab-pend' && <TabPendulum onLoadPreset={handleLoadPreset} highlightedId={highlightedId} />}
        {activeTab === 'tab-models' && <TabModels onLoadPreset={handleLoadPreset} highlightedId={highlightedId} />}
        {activeTab === 'tab-cadpcb' && <TabCadPcb onLoadPreset={handleLoadPreset} highlightedId={highlightedId} />}
        {activeTab === 'tab-sysid' && <TabSysId onLoadPreset={handleLoadPreset} highlightedId={highlightedId} />}
        {activeTab === 'tab-eskf' && <TabEskf onLoadPreset={handleLoadPreset} highlightedId={highlightedId} />}
        {activeTab === 'tab-pyodide' && (
          <TabPyodideRunner
            initialLessonId={pyodideLessonId}
            verifiedLessons={verifiedLessons}
            completedLessons={completedLessons}
            onMarkLessonVerified={handleMarkLessonVerified}
            onToggleLessonCompleted={handleToggleLessonCompleted}
          />
        )}
        {activeTab === 'tab-placement' && (
          <TabPlacementQuiz
            onOpenPyodideLesson={(lessonId) => {
              setPyodideLessonId(lessonId);
              setActiveTab('tab-pyodide');
            }}
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

      {/* Export Progress Portfolio Modal */}
      {isPortfolioModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#111827] border border-[#334155] rounded-xl max-w-2xl w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#1e293b] pb-3">
              <div>
                <h2 className="text-base font-bold text-[#f1f5f9]">
                  Export Verified Progress &amp; Portfolio Certificate (`.md`)
                </h2>
                <p className="text-xs text-[#94a3b8] mt-0.5">
                  Save your completed Python lessons and roadmap milestones as a portable Markdown certificate for your GitHub profile or study log.
                </p>
              </div>
              <button
                onClick={() => setIsPortfolioModalOpen(false)}
                className="p-1.5 rounded-lg text-[#94a3b8] hover:text-white bg-[#0b0f19] border border-[#334155] cursor-pointer"
                aria-label="Close export modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <pre
              data-testid="portfolio-markdown-preview"
              className="p-3.5 rounded-lg bg-[#0b0f19] border border-[#1e293b] font-mono text-xs text-[#e2e8f0] whitespace-pre-wrap max-h-80 overflow-y-auto"
            >
              {portfolioMarkdown}
            </pre>

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
              <button
                onClick={handleCopyPortfolio}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#1e293b] hover:bg-[#334155] text-[#f1f5f9] border border-[#334155] flex items-center gap-1.5 cursor-pointer"
              >
                {portfolioCopied ? <Check className="w-3.5 h-3.5 text-[#34d399]" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{portfolioCopied ? 'Copied to Clipboard' : 'Copy Markdown'}</span>
              </button>
              <button
                onClick={handleDownloadPortfolioFile}
                data-testid="btn-download-portfolio-md"
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#34d399] hover:bg-[#10b981] text-[#0b0f19] flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download mechalab-progress-portfolio.md</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-[#1e293b] bg-[#070b14] px-4 py-2.5 text-center text-xs text-[#64748b]">
        MechaLab · Multi-Pass Spiral Mechatronics Curriculum (Track P → Stage 0 → Pass 1–3) · Dual License: CC BY 4.0 (Docs) &amp; MIT (Code)
      </footer>
    </div>
  );
};

export default App;
