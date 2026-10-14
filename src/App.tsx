import React, { useState } from 'react';
import { Header } from './components/Header';
import { GuidedTourBar, TourStepInfo } from './components/GuidedTourBar';
import { CheatSheetModal } from './components/CheatSheetModal';
import { TabArchitecture } from './components/tabs/TabArchitecture';
import { TabBode } from './components/tabs/TabBode';
import { TabFOC } from './components/tabs/TabFOC';
import { TabPendulum } from './components/tabs/TabPendulum';
import { TabModels } from './components/tabs/TabModels';
import { TabCadPcb } from './components/tabs/TabCadPcb';
import { TabSysId } from './components/tabs/TabSysId';
import { TabEskf } from './components/tabs/TabEskf';
import { TabId } from './types';

const TOUR_STEPS: TourStepInfo[] = [
  {
    tab: 'tab-arch',
    targetId: null,
    title: 'Step 1 / 8 — The Cyber-Physical Loop (Muscles, Nerves & Brain)',
    desc: 'Every robot is a circle connecting physical mechanics M(q)q̈ (Muscles/Skeleton), mixed-signal electronics (Nerves), and real-time code (Spinal Cord). Click "Next Step →" to tune a vibrating flexible drive shaft!',
  },
  {
    tab: 'tab-bode',
    targetId: 'sl-fn',
    title: 'Step 2 / 8 — Canceling Mechanical Resonance with a Biquad Notch Filter',
    desc: 'Notice the highlighted Notch Center slider. When detuned from the resonance frequency, the green curve has a large vibration peak. Drag the slider or click "Apply Demo Preset" to watch the notch filter surgically erase the vibration peak.',
  },
  {
    tab: 'tab-foc',
    targetId: 'btn-dec-toggle',
    title: 'Step 3 / 8 — 25 kHz Field-Oriented Control (FOC) & Decoupling',
    desc: 'At high RPM, spinning magnets induce cross-coupling voltages (±ω_e L i_q). Click the highlighted "Toggle Decoupling Feedforward" button to see how turning off feedforward decoupling causes a large rose-colored i_d current error spike!',
  },
  {
    tab: 'tab-pend',
    targetId: 'sl-xmax',
    title: 'Step 4 / 8 — Energy Swing-Up, LQR Balancing & Control Barrier Functions (CBF)',
    desc: 'Watch the Furuta Pendulum pump energy until upright and catch itself with LQR! Drag the highlighted CBF Safety Wall slider (x_max) inward or click "Apply Demo Preset" to inject a +3.2 rad/s kick—the CBF filter brakes the cart before crossing the red walls.',
  },
  {
    tab: 'tab-models',
    targetId: 'sl-rq2',
    title: 'Step 5 / 8 — Validated URDF/MuJoCo Kinematics & <1 μs Safe Torque Off (STO)',
    desc: 'Drag the highlighted Joint q_2 slider to articulate the 3-DOF QDD Hopping Leg, or click "Apply Demo Preset" to inject a 42A Overcurrent Short and watch the dual-channel hardware STO trip the MOSFET gates to SAFE HIGH-Z in 0.65 μs!',
  },
  {
    tab: 'tab-cadpcb',
    targetId: 'sl-pcbl',
    title: 'Step 6 / 8 — 3D STEP/STL Flexures & 48V/30A PCB Parasitic Loop Inductance',
    desc: 'Drag the highlighted Commutation Loop Inductance slider (L_loop) above 4.0 nH: notice how V_DS,peak turns red (>60V) because stray PCB trace inductance spikes during turn-off! Click "Apply Demo Preset" to snap back to our 6-layer 1.6 nH layout.',
  },
  {
    tab: 'tab-sysid',
    targetId: 'btn-sysmode-toggle',
    title: 'Step 7 / 8 — Schroeder-Phased Multisine Closed-Loop System Identification',
    desc: 'Notice how zero-phase cosines (φ_k = 0) create a giant impulse spike at t=0 (CF = 8.00) that clips the actuator! Click "Apply Demo Preset" to switch to Schroeder quadratic phasing—compressing Crest Factor to 1.66 and locking onto the true cyan plant curve.',
  },
  {
    tab: 'tab-eskf',
    targetId: 'btn-seqlock-toggle',
    title: 'Step 8 / 8 — 6-DOF Attitude ESKF & Cortex-M7 WaitFreeSeqLock Torn-Read Protection',
    desc: 'When WaitFreeSeqLock is disabled, the 40 kHz motor ISR overwrites the telemetry struct mid-read—causing violent red torn-read spikes! Click "Apply Demo Preset" to enable atomic sequence locking (0 torn reads in 29.6 ns) while the ESKF estimates hidden gyro bias.',
  },
];

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('tab-arch');
  const [tourIndex, setTourIndex] = useState<number>(0);
  const [isCheatSheetOpen, setIsCheatSheetOpen] = useState<boolean>(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const tabs: { id: TabId; label: string }[] = [
    { id: 'tab-arch', label: '1. Architecture, Free Study Links & Tracks' },
    { id: 'tab-bode', label: '2. Two-Mass Resonance & Notch Bode (Lab 00/05)' },
    { id: 'tab-foc', label: '3. 25 kHz PMSM FOC & SVPWM (Lab 01/03)' },
    { id: 'tab-pend', label: '4. Furuta Pendulum + LQR + CBF (Lab 02/05)' },
    { id: 'tab-models', label: '5. URDF/MuJoCo Inspector & STO Safety (Lab 07/08)' },
    { id: 'tab-cadpcb', label: '6. 3D CAD Parts & 48V/30A FOC PCB BOM' },
    { id: 'tab-sysid', label: '7. Schroeder Multisine Closed-Loop SysID (Lab 07)' },
    { id: 'tab-eskf', label: '8. 6-DOF Attitude ESKF & RTOS SeqLock (Lab 04/05)' },
  ];

  const handleNextTourStep = () => {
    const nextIdx = (tourIndex + 1) % TOUR_STEPS.length;
    setTourIndex(nextIdx);
    const nextStep = TOUR_STEPS[nextIdx];
    setActiveTab(nextStep.tab);
    setHighlightedId(nextStep.targetId);
  };

  const handlePrevTourStep = () => {
    const prevIdx = (tourIndex - 1 + TOUR_STEPS.length) % TOUR_STEPS.length;
    setTourIndex(prevIdx);
    const prevStep = TOUR_STEPS[prevIdx];
    setActiveTab(prevStep.tab);
    setHighlightedId(prevStep.targetId);
  };

  const handleApplyPreset = () => {
    const step = TOUR_STEPS[tourIndex];
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

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0f19] text-[#f1f5f9]">
      <Header onOpenCheatSheet={() => setIsCheatSheetOpen(true)} />

      <GuidedTourBar
        currentStepIndex={tourIndex}
        totalSteps={TOUR_STEPS.length}
        stepInfo={TOUR_STEPS[tourIndex]}
        onPrev={handlePrevTourStep}
        onNext={handleNextTourStep}
        onApplyPreset={handleApplyPreset}
      />

      {/* Tabs navigation */}
      <nav className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 bg-[#111827] border-b border-[#334155] p-1.5 gap-1.5">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              setHighlightedId(null);
            }}
            className={`p-2 rounded-md text-left text-xs font-semibold transition-all cursor-pointer truncate ${
              activeTab === tab.id
                ? 'bg-[#38bdf8]/15 border border-[#38bdf8] text-[#38bdf8] shadow-sm'
                : 'bg-[#1e293b] text-[#94a3b8] hover:text-[#f1f5f9] border border-[#334155]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Main Tab Pane */}
      <main className="flex-1 p-3.5 sm:p-5 max-w-[1540px] w-full mx-auto">
        {activeTab === 'tab-arch' && <TabArchitecture onLoadPreset={handleLoadPreset} />}
        {activeTab === 'tab-bode' && <TabBode onLoadPreset={handleLoadPreset} highlightedId={highlightedId} />}
        {activeTab === 'tab-foc' && <TabFOC onLoadPreset={handleLoadPreset} highlightedId={highlightedId} />}
        {activeTab === 'tab-pend' && <TabPendulum onLoadPreset={handleLoadPreset} highlightedId={highlightedId} />}
        {activeTab === 'tab-models' && <TabModels onLoadPreset={handleLoadPreset} highlightedId={highlightedId} />}
        {activeTab === 'tab-cadpcb' && <TabCadPcb onLoadPreset={handleLoadPreset} highlightedId={highlightedId} />}
        {activeTab === 'tab-sysid' && <TabSysId onLoadPreset={handleLoadPreset} highlightedId={highlightedId} />}
        {activeTab === 'tab-eskf' && <TabEskf onLoadPreset={handleLoadPreset} highlightedId={highlightedId} />}
      </main>

      {/* Cheat sheet modal */}
      <CheatSheetModal isOpen={isCheatSheetOpen} onClose={() => setIsCheatSheetOpen(false)} />

      {/* Footer */}
      <footer className="border-t border-[#1e293b] bg-[#070b14] px-4 py-2 text-center text-xs text-[#64748b]">
        MechaLab · Mechatronics & Robotics Workbench · All 12 Labs & Capstones Verified
      </footer>
    </div>
  );
};

export default App;
