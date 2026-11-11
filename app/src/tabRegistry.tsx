/**
 * The workbench's tab registry (`app/src/tabRegistry.tsx`).
 *
 * A tab used to be registered in six places: its `TabId`, a dynamic import, a `React.lazy` const, a
 * prefetch map, an icon map, its label block and a render line. Five of those said the same thing —
 * which module, which icon, which words — so adding a tab meant six chances to forget one. Now one
 * entry holds all of it: the id, the labels, the icon, the loader and the render. The shell asks
 * this file for the active tab and draws it; `scripts/check_tab_names.py` reads the same entries for
 * the shared names.
 *
 * The runner is the one tab with no loader: it is the tab the app opens on, so its code is on the
 * first screen either way. Every other entry is split, and the rail's pointer/focus intent calls
 * `prefetchTab` before the click.
 */

import React from 'react';
import {
  Activity,
  Bot,
  Boxes,
  Brain,
  CircuitBoard,
  ClipboardCheck,
  Code2,
  Compass,
  Cpu,
  Gauge,
  LineChart,
  Link2,
  Map as MapIcon,
  NotebookPen,
  Radar,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { TabPyodideRunner } from './components/tabs/TabPyodideRunner';
import { MICRO_HOME_DOOR, STUDIO_HOME_DOOR, type HomeDoor } from './homeDoor';
import { PYTHON_LESSONS } from './data/pythonLessonsData';
import { PYTHON_TAB_NAME, TAB_NAMES } from './tabNames';
import type { ActiveTierPass } from './curriculumData';
import type { PresetRequest } from './demoPresets';
import type { LessonAttempt } from './learningLog';
import type { SharedAttempt } from './shareLink';
import type { TabId } from './types';

type View = React.ComponentType<any>;

/** Everything a tab may read from the shell. One bag, so the shell has one render call. */
export interface WorkbenchTabContext {
  onLoadPreset: (presetId: string) => void;
  highlightedId: string | null;
  presetRequest: PresetRequest | null;
  beginnerView: boolean;
  activeTierPass: ActiveTierPass;
  onSelectTierPass: (pass: ActiveTierPass) => void;
  completedMilestones: Record<string, boolean>;
  onToggleMilestone: (id: string) => void;
  startHereDismissed: boolean;
  onRestoreStartHere: () => void;
  openLesson: (lessonId: string) => void;
  lessonAttempts: Record<string, LessonAttempt>;
  verifiedLessons: Record<string, boolean>;
  completedLessons: Record<string, boolean>;
  onMarkLessonVerified: (lessonId: string) => void;
  onToggleLessonCompleted: (lessonId: string, forceValue?: boolean) => void;
  onOpenRoadmap: (pass: ActiveTierPass, milestoneId: string) => void;
  switchSimulatorTab: (index: number) => void;
  /** The part a workflow card asked Project Mode to show, by id, with the gesture's nonce. */
  projectFocus: { id: string; nonce: number } | null;
  /** The requirement Project Mode asked the Requirements view to show, by id. */
  requirementFocus: { id: string; nonce: number } | null;
  /** The two project doors a citation can use; the object's kind declaration chooses one. */
  openProjectPart: (componentId: string) => void;
  openRequirement: (requirementId: string) => void;
  pyodideLessonId: string;
  runRequest: number;
  formatRequest: number;
  tourRequest: number;
  reviewRequest: number;
  lessonRequest: { id: string; nonce: number; line?: number; focus?: string; focusAnchor?: string } | null;
  sharedAttempt: SharedAttempt | null;
  dismissShared: () => void;
  trySnippet: SharedAttempt | null;
  dismissTry: () => void;
}

export interface WorkbenchTabMeta {
  id: TabId;
  /** One glyph per tab, so the rail can be scanned by shape as well as by name. */
  Icon: LucideIcon;
  beginnerLabel: string;
  /** The plain-English second line in Beginner View; keep acronyms out of it. */
  beginnerSubtitle: string;
  technicalLabel: string;
  technicalSubtitle: string;
  isBeginnerCore: boolean;
  /** The Home card that introduces this tab above the labs grid, when it has one. */
  home?: HomeDoor;
  /** The split point. Absent for a tab the shell already ships. */
  load?: () => Promise<{ default: View }>;
  /** A tab whose code is in the entry chunk rather than a chunk of its own. */
  static?: View;
  /** The tab's whole view. `View` is this entry's component, split or static. */
  render: (context: WorkbenchTabContext, View: View) => React.ReactNode;
}

const sim = (context: WorkbenchTabContext, View: View) => (
  <View
    onLoadPreset={context.onLoadPreset}
    highlightedId={context.highlightedId}
    presetRequest={context.presetRequest}
  />
);

export const WORKBENCH_TABS: WorkbenchTabMeta[] = [
  {
    id: 'tab-arch',
    Icon: MapIcon,
    beginnerLabel: TAB_NAMES['tab-arch'],
    beginnerSubtitle: 'Four passes, and the practice each step asks for',
    technicalLabel: 'Linear Tier Roadmap (Tracks 00→08)',
    technicalSubtitle: 'Track P · Stage 0 · Depths 1–3 Matrix',
    isBeginnerCore: true,
    load: () =>
      import('./components/tabs/TabArchitecture').then((module) => ({
        default: module.TabArchitecture,
      })),
    render: (context, View) => (
      <View
        onLoadPreset={context.onLoadPreset}
        beginnerView={context.beginnerView}
        activeTierPass={context.activeTierPass}
        onSelectTierPass={context.onSelectTierPass}
        completedMilestones={context.completedMilestones}
        verifiedLessons={context.verifiedLessons}
        onToggleMilestone={context.onToggleMilestone}
        startHereDismissed={context.startHereDismissed}
        onRestoreStartHere={context.onRestoreStartHere}
        onOpenPyodideLesson={context.openLesson}
        lessonAttempts={context.lessonAttempts}
      />
    ),
  },
  {
    id: 'tab-pyodide',
    Icon: Code2,
    beginnerLabel: `${PYTHON_TAB_NAME} (${PYTHON_LESSONS.length} lessons & exercises)`,
    beginnerSubtitle: 'Write code, press Run, see what passes',
    technicalLabel: 'In-Browser Python Runner (Pyodide WASM)',
    technicalSubtitle: 'Pyodide WASM · 3-Step Hints · Asserts',
    isBeginnerCore: true,
    static: TabPyodideRunner,
    render: (context) => (
      // An anchor for the Start here button: it scrolls here rather than opening GitHub.
      <div id="python-runner" className="scroll-mt-4">
        <TabPyodideRunner
          initialLessonId={context.pyodideLessonId}
          verifiedLessons={context.verifiedLessons}
          completedLessons={context.completedLessons}
          onMarkLessonVerified={context.onMarkLessonVerified}
          onToggleLessonCompleted={context.onToggleLessonCompleted}
          onOpenRoadmap={context.onOpenRoadmap}
          onOpenProjectPart={context.openProjectPart}
          onOpenRequirement={context.openRequirement}
          runRequest={context.runRequest}
          formatRequest={context.formatRequest}
          tourRequest={context.tourRequest}
          reviewRequest={context.reviewRequest}
          lessonRequest={context.lessonRequest}
          sharedAttempt={context.sharedAttempt}
          onDismissShared={context.dismissShared}
          trySnippet={context.trySnippet}
          onDismissTry={context.dismissTry}
        />
      </div>
    ),
  },
  {
    id: 'tab-studio',
    Icon: NotebookPen,
    beginnerLabel: TAB_NAMES['tab-studio'],
    beginnerSubtitle: 'Write code, plan a workflow, keep notes — no lesson attached',
    technicalLabel: 'Scratch Python · Workflow Canvas · Notebook',
    technicalSubtitle: 'Ungraded · Local only · Your own pace',
    isBeginnerCore: true,
    home: STUDIO_HOME_DOOR,
    load: () =>
      import('./components/tabs/TabStudio').then((module) => ({ default: module.TabStudio })),
    render: (_context, View) => <View />,
  },
  {
    id: 'tab-micro',
    Icon: Brain,
    beginnerLabel: TAB_NAMES['tab-micro'],
    beginnerSubtitle: 'Forty-six tiny P-track concepts, about two minutes each',
    technicalLabel: 'Atomic Micro-Learning (P.1 + P.2, beta)',
    technicalSubtitle: '31 concepts · deterministic diagnostics · local review schedule',
    isBeginnerCore: true,
    home: MICRO_HOME_DOOR,
    load: () =>
      import('./components/tabs/TabMicro').then((module) => ({ default: module.TabMicro })),
    render: (context, View) => <View openLesson={context.openLesson} />,
  },
  {
    id: 'tab-placement',
    Icon: Compass,
    beginnerLabel: `${TAB_NAMES['tab-placement']} (Skip What You Know)`,
    beginnerSubtitle: 'Find the right starting step',
    technicalLabel: 'Prerequisite Placement Quiz',
    technicalSubtitle: '8 Module Skip-Gate Checkpoints',
    isBeginnerCore: true,
    load: () =>
      import('./components/tabs/TabPlacementQuiz').then((module) => ({
        default: module.TabPlacementQuiz,
      })),
    render: (context, View) => (
      <View
        onOpenPyodideLesson={context.openLesson}
        onSwitchSimulatorTab={context.switchSimulatorTab}
      />
    ),
  },
  {
    id: 'tab-bode',
    Icon: Activity,
    beginnerLabel: TAB_NAMES['tab-bode'],
    beginnerSubtitle: 'Watch a vibration fade with a filter',
    technicalLabel: 'Two-Mass Resonance & Notch Bode (Lab 00/05)',
    technicalSubtitle: 'Two-Mass Bode · Biquad Notch Filter',
    isBeginnerCore: true,
    load: () => import('./components/tabs/TabBode').then((module) => ({ default: module.TabBode })),
    render: sim,
  },
  {
    id: 'tab-foc',
    Icon: Zap,
    beginnerLabel: TAB_NAMES['tab-foc'],
    beginnerSubtitle: 'Make a motor spin smoothly',
    technicalLabel: '25 kHz PMSM FOC & SVPWM (Lab 01/03)',
    technicalSubtitle: '3-Phase BLDC · d-q FOC · SVPWM',
    isBeginnerCore: true,
    load: () => import('./components/tabs/TabFOC').then((module) => ({ default: module.TabFOC })),
    render: sim,
  },
  {
    id: 'tab-pend',
    Icon: Gauge,
    beginnerLabel: TAB_NAMES['tab-pend'],
    beginnerSubtitle: 'Balance a pendulum without falling',
    technicalLabel: 'Furuta Pendulum + LQR + CBF (Lab 02/05)',
    technicalSubtitle: 'PID/LQR Balance · CBF Safety Filter',
    isBeginnerCore: true,
    load: () =>
      import('./components/tabs/TabPendulum').then((module) => ({ default: module.TabPendulum })),
    render: sim,
  },
  {
    id: 'tab-models',
    Icon: Bot,
    beginnerLabel: TAB_NAMES['tab-models'],
    beginnerSubtitle: 'Move a robot arm to a point',
    technicalLabel: 'URDF/MuJoCo Inspector & STO Safety (Lab 07/08)',
    technicalSubtitle: 'Forward/Inverse Kinematics · <1 μs STO',
    isBeginnerCore: false,
    load: () =>
      import('./components/tabs/TabModels').then((module) => ({ default: module.TabModels })),
    render: sim,
  },
  {
    id: 'tab-cadpcb',
    Icon: Cpu,
    beginnerLabel: TAB_NAMES['tab-cadpcb'],
    beginnerSubtitle: 'See the parts and the motor board',
    technicalLabel: '3D CAD Parts & 48V/30A FOC PCB BOM',
    technicalSubtitle: 'STEP Flexures · Parasitic Inductance',
    isBeginnerCore: false,
    load: () =>
      import('./components/tabs/TabCadPcb').then((module) => ({ default: module.TabCadPcb })),
    render: sim,
  },
  {
    id: 'tab-project',
    Icon: Boxes,
    beginnerLabel: TAB_NAMES['tab-project'],
    beginnerSubtitle: 'Find any part by name, number or id',
    technicalLabel: 'Project Mode: Parts, Ids & Budget',
    technicalSubtitle: 'mechalab.project/1 · Generated BOM',
    isBeginnerCore: false,
    load: () =>
      import('./components/tabs/TabProject').then((module) => ({ default: module.TabProject })),
    render: (context, View) => (
      <View focus={context.projectFocus} onOpenRequirement={context.openRequirement} />
    ),
  },
  {
    id: 'tab-req',
    Icon: ClipboardCheck,
    beginnerLabel: TAB_NAMES['tab-req'],
    beginnerSubtitle: 'See what the project must do, and which parts do it',
    technicalLabel: 'Requirements Register: REQ-* → Part Ids',
    technicalSubtitle: 'mechalab.project/1 · Strict Part Refs',
    isBeginnerCore: false,
    load: () =>
      import('./components/tabs/TabRequirements').then((module) => ({
        default: module.TabRequirements,
      })),
    render: (context, View) => (
      <View focus={context.requirementFocus} onOpenPart={context.openProjectPart} />
    ),
  },
  {
    id: 'tab-sysid',
    Icon: LineChart,
    beginnerLabel: TAB_NAMES['tab-sysid'],
    beginnerSubtitle: 'Measure how a machine responds',
    technicalLabel: 'Schroeder Multisine Closed-Loop SysID (Lab 07)',
    technicalSubtitle: 'Frequency-Domain Plant Identification',
    isBeginnerCore: false,
    load: () =>
      import('./components/tabs/TabSysId').then((module) => ({ default: module.TabSysId })),
    render: sim,
  },
  {
    id: 'tab-eskf',
    Icon: Radar,
    beginnerLabel: TAB_NAMES['tab-eskf'],
    beginnerSubtitle: 'Combine two motion sensors',
    technicalLabel: '6-DOF Attitude ESKF & RTOS SeqLock (Lab 04/05)',
    technicalSubtitle: 'IMU Gyro/Accel Fusion · WaitFreeSeqLock',
    isBeginnerCore: false,
    load: () => import('./components/tabs/TabEskf').then((module) => ({ default: module.TabEskf })),
    render: sim,
  },
  {
    id: 'tab-board',
    Icon: CircuitBoard,
    beginnerLabel: `${TAB_NAMES['tab-board']} (Arduino Uno)`,
    beginnerSubtitle: 'Run the compiled C sketch and watch its serial',
    technicalLabel: 'ATmega328P Emulator (avr8js) · Compiled Sketch',
    technicalSubtitle: 'Committed .hex · USART Monitor · Cycle Budget',
    isBeginnerCore: false,
    load: () => import('./components/tabs/TabBoard').then((module) => ({ default: module.TabBoard })),
    render: (_context, View) => <View />,
  },
  {
    id: 'tab-links',
    Icon: Link2,
    beginnerLabel: `${TAB_NAMES['tab-links']} (Nightly Check)`,
    beginnerSubtitle: 'See which outside links still work',
    technicalLabel: 'Link Check History & Not-Checked Trend',
    technicalSubtitle: 'Blocked / Unreachable Citations · Run Timeline',
    isBeginnerCore: false,
    load: () =>
      import('./components/tabs/TabLinkHealth').then((module) => ({
        default: module.TabLinkHealth,
      })),
    render: (_context, View) => <View />,
  },
];

/**
 * One lazy component per split entry, created once at module load (a `React.lazy` per render would
 * remount the tab on every keystroke). The runner is already in the entry chunk.
 */
const LAZY_VIEWS: Partial<Record<TabId, View>> = Object.fromEntries(
  WORKBENCH_TABS.filter((tab) => tab.load).map((tab) => [tab.id, React.lazy(tab.load!)])
);

/** The shell's one render call: the active tab's own entry decides what it needs. */
export function renderTab(tabId: TabId, context: WorkbenchTabContext): React.ReactNode {
  const tab = WORKBENCH_TABS.find((entry) => entry.id === tabId);
  if (!tab) return null;
  const View = tab.static ?? LAZY_VIEWS[tabId];
  return View ? tab.render(context, View) : null;
}

/** Fetch a split tab's chunk on intent. The runner has none: it is in the entry chunk already. */
export function prefetchTab(tabId: TabId): void {
  void WORKBENCH_TABS.find((tab) => tab.id === tabId)?.load?.();
}

/**
 * Home's launcher, built from the registry the rail renders (`components/home/LabsPanel.tsx`). A
 * tab added here is on Home with no second list to edit, icons included.
 */
export const HOME_LABS = WORKBENCH_TABS.map((tab) => ({
  id: tab.id,
  label: tab.beginnerLabel,
  blurb: tab.beginnerSubtitle,
  Icon: tab.Icon,
  home: tab.home,
}));
