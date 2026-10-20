import React, { useState } from 'react';
import { MathView, MathPanel } from '../MathView';
import {
  ActiveTierPass,
  LEVEL_0_STEPS,
  TIER_1_LINEAR_PASS,
  TIER_2_LINEAR_PASS,
  TIER_3_LINEAR_PASS,
  TIER_PASS_META,
  LinearTrackStep,
} from '../../curriculumData';
import {
  ExternalLink,
  Play,
  CheckSquare,
  Square,
  ArrowRight,
  ArrowRightLeft,
  Trophy,
  Compass,
  Grid,
  ListOrdered,
} from 'lucide-react';

interface TabArchitectureProps {
  onLoadPreset: (presetId: string) => void;
  /** When true, the matrix starts with the Beginner column only; deeper columns are opt-in. */
  beginnerView: boolean;
  activeTierPass: ActiveTierPass;
  onSelectTierPass: (pass: ActiveTierPass) => void;
  completedMilestones: Record<string, boolean>;
  onToggleMilestone: (id: string) => void;
  onOpenPyodideLesson?: (lessonId: string) => void;
}

export const TabArchitecture: React.FC<TabArchitectureProps> = ({
  onLoadPreset,
  beginnerView,
  activeTierPass,
  onSelectTierPass,
  completedMilestones,
  onToggleMilestone,
}) => {
  const [viewMode, setViewMode] = useState<'linear' | 'matrix'>('linear');
  const [advancedColumnsOpen, setAdvancedColumnsOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  // Advanced View always shows the full matrix. Beginner View shows only the Beginner column
  // until the learner asks for the deeper ones.
  const showAdvancedColumns = !beginnerView || advancedColumnsOpen;

  const getPassSteps = (pass: ActiveTierPass): LinearTrackStep[] => {
    if (pass === 'level0') return LEVEL_0_STEPS;
    if (pass === 'tier1') return TIER_1_LINEAR_PASS;
    if (pass === 'tier2') return TIER_2_LINEAR_PASS;
    return TIER_3_LINEAR_PASS;
  };

  const countCompleted = (steps: LinearTrackStep[]) =>
    steps.filter((s) => completedMilestones[s.milestoneId]).length;

  const activeSteps = getPassSteps(activeTierPass);
  const activeMeta = TIER_PASS_META[activeTierPass];
  const activeDone = countCompleted(activeSteps);

  const passOrder: ActiveTierPass[] = ['level0', 'tier1', 'tier2', 'tier3'];
  const currentPassIdx = passOrder.indexOf(activeTierPass);
  const nextPass: ActiveTierPass | null =
    currentPassIdx < passOrder.length - 1 ? passOrder[currentPassIdx + 1] : null;

  return (
    <div className="space-y-5">
      {/* 1. Linear Level-Up Progression Pipeline Header */}
      <div className="bg-[#111827] border border-[#334155] rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#1e293b]">
          <div>
            <div className="text-xs font-mono uppercase tracking-wider text-[#38bdf8]">
              SPIRAL / MULTI-PASS LEVEL-UP ARCHITECTURE · TRACK 00 → TRACK 08
            </div>
            <h2 className="text-lg font-bold text-[#f1f5f9] mt-0.5">
              Linear Level-Up Roadmap: Finish All Tracks in Tier 1, Then Loop Back for Tier 2 & Tier 3
            </h2>
            <p className="text-xs text-[#94a3b8] mt-0.5">
              Instead of getting stuck in graduate math on Track 00 before ever touching a motor, complete a full horizontal pass from Track 00 to Track 08 at Tier 1, build your first robot, and then level up to Tier 2 and Tier 3.
            </p>
          </div>

          {/* View Mode Switcher */}
          <div className="flex items-center gap-1 bg-[#0b0f19] p-1 rounded-lg border border-[#1e293b]">
            <button
              onClick={() => setViewMode('linear')}
              data-testid="btn-arch-linear"
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                viewMode === 'linear'
                  ? 'bg-[#38bdf8]/20 text-[#38bdf8] border border-[#38bdf8]/50'
                  : 'text-[#94a3b8] hover:text-[#f1f5f9] border border-transparent'
              }`}
            >
              <ListOrdered className="w-3.5 h-3.5" />
              <span>Linear Level-Up Pass</span>
            </button>
            <button
              onClick={() => setViewMode('matrix')}
              data-testid="btn-arch-matrix"
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                viewMode === 'matrix'
                  ? 'bg-[#38bdf8]/20 text-[#38bdf8] border border-[#38bdf8]/50'
                  : 'text-[#94a3b8] hover:text-[#f1f5f9] border border-transparent'
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
              <span>{beginnerView ? 'Compare Tracks' : 'Full 3-Tier Matrix'}</span>
            </button>
          </div>
        </div>

        {/* 4-Stage Level-Up Selector Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          {passOrder.map((passId, idx) => {
            const meta = TIER_PASS_META[passId];
            const steps = getPassSteps(passId);
            const done = countCompleted(steps);
            const isSelected = activeTierPass === passId;

            return (
              <button
                key={passId}
                onClick={() => {
                  onSelectTierPass(passId);
                  setViewMode('linear');
                }}
                className={`text-left p-3.5 rounded-lg border transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'bg-[#1e293b] border-[#38bdf8] shadow-md'
                    : 'bg-[#0b0f19] border-[#1e293b] hover:border-[#334155]'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className={isSelected ? 'text-[#38bdf8] font-bold' : 'text-[#94a3b8]'}>
                      {idx === 0 ? 'STAGE 0' : `PASS ${idx} OF 3`} · {meta.levelNumber}
                    </span>
                    <span className="text-[#34d399]">
                      {done}/{steps.length} Done
                    </span>
                  </div>
                  <div className="text-sm font-bold text-[#f1f5f9] mt-1">{meta.name}</div>
                  <div className="text-[0.73rem] text-[#94a3b8] mt-1 line-clamp-2">{meta.tagline}</div>
                </div>

                {/* Progress bar */}
                <div className="mt-3">
                  <div className="w-full h-1.5 bg-[#111827] rounded-full overflow-hidden border border-[#1e293b]">
                    <div
                      className="h-full bg-[#34d399] transition-all duration-300"
                      style={{ width: `${(done / steps.length) * 100}%` }}
                    />
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* 3 Completion Routes, Recurring Arm Spine & Tier 2/3 Transition Boundaries */}
        <div
          data-testid="panel-completion-routes-spine"
          className="mt-4 pt-4 border-t border-[#1e293b] grid grid-cols-1 lg:grid-cols-3 gap-3 text-xs"
        >
          <div className="p-3.5 rounded-lg bg-[#0b0f19] border border-[#1e293b] space-y-1.5">
            <div className="font-mono font-bold text-[#34d399]">
              1. THREE COMPLETION ROUTES &amp; PROVISIONAL TIMES
            </div>
            <p className="text-[#cbd5e1] leading-relaxed">
              <b>Learn &amp; Simulate ($0):</b> Complete all lessons, behavioral tests, and capstones in browser/software tools (built-in hints suffice).{' '}
              <b>Build ($15–$150):</b> Optional low-voltage (&le;12 V) bench hardware.{' '}
              <b>Production Practice:</b> High-power 24 V/15 A &amp; 48 V/30 A builds require experienced review &amp; safety sign-off.
            </p>
            <p className="text-[11px] font-mono text-[#94a3b8]">
              Provisional targets: 323.5 h (68 modules, Passes 1–3) · ~341.5–346.5 h incl. Track P + Stage 0 entry ramp.
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-[#0b0f19] border border-[#1e293b] space-y-1.5">
            <div className="font-mono font-bold text-[#38bdf8]">
              2. RECURRING 2-DOF ARM SPINE &amp; 8-STEP LADDER
            </div>
            <p className="text-[#cbd5e1] leading-relaxed">
              One familiar robot joint/arm evolves from a scalar lag model (Track 00) &rarr; H-bridge drive (Track 01) &rarr; 2-link FK/IK (Track 02) &rarr; encoder + 1 kHz ISR (Tracks 03–04) &rarr; PID + gravity FF (Tracks 05–06) &rarr; safe bring-up &amp; 2-DOF Figure-8 Boss (Tracks 07–08).
            </p>
            <p className="text-[11px] font-mono text-[#94a3b8]">
              8-Step Ladder: Recall &rarr; See it &rarr; Predict &rarr; Work through &rarr; Practice &rarr; Break it &rarr; Transfer &rarr; Integrate.
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-[#0b0f19] border border-[#1e293b] space-y-1.5">
            <div className="font-mono font-bold text-[#c084fc]">
              3. TIER 2 ROUTES &amp; TIER 3 CAPSTONE SCOPE
            </div>
            <p className="text-[#cbd5e1] leading-relaxed">
              <b>Tier 2:</b> Teaches ODE/Bode/State-Space on the <i>same</i> Tier 1 arm, adds standalone first-run labs (`KiCad`, `URDF`, `RTOS`, `ROS 2`), and offers <b>3 Evidence Routes</b> (<i>Simulation</i>, <i>Reference-Board</i>, or <i>Custom-PCB</i>).{' '}
              <b>Tier 3:</b> Splits into <i>Use &amp; Understand</i> vs. <i>Derive &amp; Extend</i>; Step 3.8 (9.5 h) requires <b>choosing 1 of Capstones I–V</b>.
            </p>
          </div>
        </div>
      </div>

      {/* 2. Active Pass Summary Banner + Search Filter */}
      {viewMode === 'linear' && (
        <div className="bg-[#111827] border border-[#334155] rounded-xl p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1.5 max-w-4xl">
              <div className="flex items-center gap-2 text-xs font-mono text-[#34d399]">
                <Compass className="w-4 h-4" />
                <span>ACTIVE LEARNING PASS: {activeMeta.levelNumber}</span>
                <span aria-hidden="true">·</span>
                <span>
                  {activeDone} of {activeSteps.length} Milestones Checked
                </span>
              </div>
              <h3 className="text-base font-bold text-[#f1f5f9]">
                {activeMeta.name} — {activeMeta.tagline}
              </h3>
              <p className="text-xs text-[#cbd5e1] leading-relaxed">{activeMeta.goalSummary}</p>
            </div>

            {nextPass && (
              <button
                onClick={() => onSelectTierPass(nextPass)}
                className="bg-[#38bdf8]/20 hover:bg-[#38bdf8]/30 text-[#38bdf8] border border-[#38bdf8] px-3.5 py-2 rounded-md text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shrink-0"
              >
                <span>Level Up to {TIER_PASS_META[nextPass].levelNumber}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4 pt-3 border-t border-[#1e293b] text-xs">
            <div>
              <span className="text-[#94a3b8] block text-[0.7rem] uppercase font-mono">Hardware Stack in This Pass</span>
              <span className="text-[#f1f5f9] font-medium">{activeMeta.hardwareStack}</span>
            </div>
            <div>
              <span className="text-[#94a3b8] block text-[0.7rem] uppercase font-mono">Software & Firmware Stack</span>
              <span className="text-[#f1f5f9] font-medium">{activeMeta.softwareStack}</span>
            </div>
            <div>
              <span className="text-[#94a3b8] block text-[0.7rem] uppercase font-mono">Mathematical Depth</span>
              <span className="text-[#38bdf8] font-medium">{activeMeta.mathDepth}</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#1e293b] flex flex-wrap items-center justify-between gap-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter tracks, lessons, bridge modules, or concepts in this pass..."
              data-testid="input-roadmap-search"
              className="w-full sm:w-96 px-3 py-1.5 rounded-lg bg-[#0b0f19] border border-[#334155] text-xs text-[#f1f5f9] placeholder-[#64748b] focus:outline-none focus:border-[#38bdf8]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-xs font-mono text-[#38bdf8] hover:underline cursor-pointer"
              >
                Clear filter
              </button>
            )}
          </div>
        </div>
      )}

      {/* 3A. LINEAR PASS VIEW (Step-by-Step Track 00 -> Track 08 in Current Tier) */}
      {viewMode === 'linear' && (
        <div className="space-y-4">
          {activeSteps
            .filter((step) => {
              if (!searchQuery.trim()) return true;
              const q = searchQuery.toLowerCase();
              return (
                step.trackCode.toLowerCase().includes(q) ||
                step.trackTitle.toLowerCase().includes(q) ||
                step.headline.toLowerCase().includes(q) ||
                step.coreWhy.toLowerCase().includes(q) ||
                step.topics.some((t) => t.toLowerCase().includes(q))
              );
            })
            .map((step, index) => {
              const isChecked = !!completedMilestones[step.milestoneId];

            return (
              <div
                key={step.milestoneId}
                className={`bg-[#111827] border rounded-xl p-5 transition-all ${
                  isChecked ? 'border-[#34d399]/60 bg-[#111827]/90' : 'border-[#334155]'
                }`}
              >
                {/* Top Row: Step Kicker + Checkbox */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#1e293b]">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                    <span className="text-[#38bdf8] font-bold">{step.stepNumber}</span>
                    <span aria-hidden="true" className="text-[#475569]">·</span>
                    <span className="text-[#f1f5f9] font-bold">{step.trackCode}</span>
                    <span aria-hidden="true" className="text-[#475569]">·</span>
                    <span className="text-[#34d399]">{step.deliverableGate}</span>
                  </div>

                  <button
                    onClick={() => onToggleMilestone(step.milestoneId)}
                    data-testid={`btn-milestone-${step.milestoneId}`}
                    className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 border transition-colors cursor-pointer ${
                      isChecked
                        ? 'bg-[#34d399]/20 border-[#34d399] text-[#34d399]'
                        : 'bg-[#1e293b] border-[#334155] text-[#cbd5e1] hover:border-[#38bdf8]'
                    }`}
                  >
                    {isChecked ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                    <span>{isChecked ? 'Milestone Completed' : 'Mark Milestone Complete'}</span>
                  </button>
                </div>

                {/* Title & Why */}
                <div className="mt-3">
                  <h3 className="text-base font-bold text-[#f1f5f9]">{step.trackTitle}</h3>
                  <div className="text-xs font-semibold text-[#38bdf8] mt-0.5">{step.headline}</div>
                  <p className="text-xs text-[#94a3b8] mt-1.5 leading-relaxed">{step.coreWhy}</p>
                </div>

                {/* Content Grid: Left = Topics & Bridge, Right = Math + Actionable Milestone */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mt-4">
                  <div className="lg:col-span-7 space-y-3 text-xs">
                    <div className="bg-[#0b0f19] border border-[#1e293b] rounded-lg p-3.5">
                      <div className="font-bold text-[#f1f5f9] mb-2 uppercase tracking-wider text-[0.72rem] font-mono">
                        Core Concepts & Skills in {step.trackCode}
                      </div>
                      <ul className="list-disc pl-4 space-y-1.5 text-[#cbd5e1] leading-relaxed">
                        {step.topics.map((topic, i) => (
                          <li key={i}>{topic}</li>
                        ))}
                      </ul>
                    </div>

                    {/* Curated Free Resources */}
                    <div className="bg-[#0b0f19] border border-[#1e293b] rounded-lg p-3.5">
                      <div className="font-bold text-[#34d399] mb-2 uppercase tracking-wider text-[0.72rem] font-mono">
                        Curated Free Resources (Websites & Simulators &gt; Books)
                      </div>
                      <ul className="space-y-1.5 text-[#cbd5e1] leading-relaxed">
                        {step.studyLinks.map((lk) => (
                          <li key={lk.url}>
                            <span aria-hidden="true">🔗 </span>
                            <a
                              href={lk.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[#38bdf8] hover:underline font-semibold inline-flex items-center gap-1"
                            >
                              {lk.label} <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                            {lk.note && <span className="text-[#94a3b8]"> — <em>{lk.note}</em></span>}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {step.bridgeTitle && (
                      <div className="bg-[#1e293b]/40 border border-[#fbbf24]/30 rounded-lg p-3.5">
                        <div className="flex items-center gap-1.5 font-bold text-[#fbbf24] mb-1">
                          <ArrowRightLeft className="w-3.5 h-3.5" />
                          <span>{step.bridgeTitle}</span>
                        </div>
                        <div className="text-[0.74rem] text-[#94a3b8] mb-1">
                          <strong>From:</strong> {step.bridgeFrom} <span className="text-[#fbbf24]">→</span>{' '}
                          <strong>To:</strong> {step.bridgeTo}
                        </div>
                        <p className="text-[#cbd5e1] leading-relaxed">{step.bridgeHow}</p>
                      </div>
                    )}
                  </div>

                  <div className="lg:col-span-5 flex flex-col justify-between space-y-3">
                    <div>
                      <div className="text-[0.72rem] font-mono uppercase text-[#94a3b8] mb-1">
                        Governing Equation ({step.tierBadge})
                      </div>
                      <div className="bg-[#080d1a] border border-[#1e293b] rounded-md p-3 overflow-x-auto text-xs">
                        <MathView math={step.equation} block={true} />
                      </div>

                      <div className="bg-[#0b0f19] border border-[#1e293b] rounded-lg p-3.5 mt-3 text-xs">
                        <div className="font-bold text-[#34d399] mb-1 flex items-center gap-1.5">
                          <Trophy className="w-3.5 h-3.5" />
                          <span>🧪 Hands-On Exercise ({index + 1}/{activeSteps.length}):</span>
                        </div>
                        <p className="text-[#cbd5e1] leading-relaxed">
                          <em>Task:</em> {step.milestoneTask}
                        </p>
                      </div>

                      {step.quiz && (
                        <div className="bg-[#0b0f19] border border-[#334155] rounded-lg p-3.5 mt-3 text-xs">
                          <div className="font-bold text-[#c084fc] mb-1.5">🧠 Knowledge Check:</div>
                          <details className="group cursor-pointer">
                            <summary className="font-semibold text-[#f1f5f9] hover:text-[#38bdf8] select-none">
                              <b>Click to toggle quiz questions &amp; answers</b>
                            </summary>
                            <div className="mt-3 pt-2.5 border-t border-[#1e293b] space-y-2.5 text-[#cbd5e1] cursor-default">
                              <div>
                                <div className="font-semibold text-[#f1f5f9]">
                                  <strong>Q1:</strong> {step.quiz.q1}
                                </div>
                                <div className="text-[#94a3b8] mt-1 pl-3 border-l-2 border-[#34d399]">
                                  <strong>Answer / Explanation:</strong> {step.quiz.a1}
                                </div>
                              </div>
                              <div>
                                <div className="font-semibold text-[#f1f5f9]">
                                  <strong>Q2:</strong> {step.quiz.q2}
                                </div>
                                <div className="text-[#94a3b8] mt-1 pl-3 border-l-2 border-[#38bdf8]">
                                  <strong>Answer &amp; Explanation:</strong> {step.quiz.a2}
                                </div>
                              </div>
                            </div>
                          </details>
                        </div>
                      )}
                    </div>

                    {/* Footer Button: Launch Interactive Simulator */}
                    <div className="pt-2 flex flex-wrap items-center justify-end gap-2 border-t border-[#1e293b]">
                      <button
                        onClick={() => onLoadPreset(step.presetId)}
                        className="bg-[#38bdf8]/20 hover:bg-[#38bdf8]/30 text-[#38bdf8] border border-[#38bdf8] px-3 py-1.5 rounded-md text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>{step.presetLabel}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* End-of-Pass Level-Up Callout Card */}
          <div className="bg-gradient-to-r from-[#0f172a] via-[#1e293b] to-[#064e3b] border border-[#34d399] rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1 max-w-3xl">
              <div className="text-xs font-mono uppercase text-[#34d399] font-bold">
                {nextPass ? `END OF ${activeMeta.levelNumber} · READY TO LEVEL UP` : 'FINAL PRODUCTION MASTERY ACHIEVED'}
              </div>
              <h3 className="text-base font-bold text-[#f1f5f9]">
                {nextPass
                  ? `Finished ${activeMeta.name}? Loop Back to Track 00 for ${TIER_PASS_META[nextPass].name}!`
                  : 'Congratulations! You Have Completed All 3 Linear Passes (Tracks 00–08) Through Production Mastery.'}
              </h3>
              <p className="text-xs text-[#cbd5e1]">
                {nextPass
                  ? `You now have the complete end-to-end foundation from ${activeMeta.levelNumber}. Click the button to start ${TIER_PASS_META[nextPass].levelNumber} from Track 00 with upgraded hardware, deeper math, and custom engineering tools.`
                  : 'All 12 Lab, CAD, 48V/30A PCB, and STM32G474 Firmware verification gates are unlocked in the interactive simulators.'}
              </p>
            </div>

            {nextPass && (
              <button
                onClick={() => {
                  onSelectTierPass(nextPass);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="bg-[#34d399] hover:bg-[#34d399]/90 text-[#090d16] font-bold text-xs px-4 py-2.5 rounded-md flex items-center gap-2 cursor-pointer transition-all shadow-md"
              >
                <span>Start {TIER_PASS_META[nextPass].levelNumber} (Loop to Track 00)</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* 3B. MATRIX COMPARISON VIEW (Beginner column by default; deeper columns opt-in) */}
      {viewMode === 'matrix' && (
        <div className="bg-[#111827] border border-[#334155] rounded-xl p-4 overflow-x-auto">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-[#38bdf8]">
                {beginnerView
                  ? 'Track-by-Track Matrix (Beginner Path)'
                  : 'Complete Horizontal vs. Vertical Curriculum Matrix (Tracks 00–08 × Tiers 1–3)'}
              </h3>
              <p className="text-xs text-[#94a3b8]">
                {beginnerView
                  ? 'Read across a row to see the beginner path for one track. The deeper columns stay out of the way until you ask for them.'
                  : 'Read down a column to follow a **Linear Level-Up Pass** (Track 00 → Track 08), or read across a row to see how a single track evolves from Beginner to Production.'}
              </p>
            </div>
            {beginnerView && (
              <button
                onClick={() => setAdvancedColumnsOpen((open) => !open)}
                data-testid="btn-toggle-advanced-columns"
                className="px-3 py-1.5 rounded-md text-xs font-semibold bg-[#0b0f19] text-[#94a3b8] hover:text-[#f1f5f9] border border-[#334155] cursor-pointer transition-colors"
              >
                {advancedColumnsOpen ? 'Hide deeper columns' : 'Show deeper columns'}
              </button>
            )}
          </div>

          <table
            data-testid="arch-matrix"
            className={`w-full text-xs text-left border-collapse ${
              showAdvancedColumns ? 'min-w-[900px]' : 'min-w-[520px]'
            }`}
          >
            <thead>
              <tr className="border-b border-[#334155] bg-[#0b0f19] text-[#38bdf8] font-mono">
                <th className="p-3 w-1/5">Track (00 → 08)</th>
                <th className="p-3 w-1/4 text-[#34d399]">
                  {beginnerView ? 'Beginner path' : 'Pass 1: Tier 1 (Beginner / Intuitive)'}
                </th>
                {showAdvancedColumns && (
                  <th className="p-3 w-1/4 text-[#38bdf8]">
                    {beginnerView ? 'Deeper practice' : 'Pass 2: Tier 2 (Intermediate / Applied)'}
                  </th>
                )}
                {showAdvancedColumns && (
                  <th className="p-3 w-1/4 text-[#c084fc]">
                    {beginnerView ? 'Advanced' : 'Pass 3: Tier 3 (Advanced / Production)'}
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e293b] text-[#cbd5e1] align-top">
              {TIER_1_LINEAR_PASS.map((t1Step, idx) => {
                const t2Step = TIER_2_LINEAR_PASS[idx];
                const t3Step = TIER_3_LINEAR_PASS[idx];
                return (
                  <tr key={t1Step.milestoneId} className="hover:bg-[#1e293b]/30">
                    <td className="p-3 font-bold text-[#f1f5f9]">
                      <div className="text-[#38bdf8] font-mono text-[0.7rem]">STEP {idx + 1} OF 8</div>
                      <div>{t1Step.trackTitle.split(':')[0]}</div>
                    </td>
                    <td className="p-3">
                      <div className="font-semibold text-[#34d399] mb-1">{t1Step.headline}</div>
                      <p className="text-[#94a3b8] text-[0.74rem] mb-2">{t1Step.milestoneTask}</p>
                      <button
                        onClick={() => {
                          onSelectTierPass('tier1');
                          onLoadPreset(t1Step.presetId);
                        }}
                        className="text-[0.7rem] text-[#34d399] hover:underline font-mono inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Play className="w-2.5 h-2.5 fill-current" /> Open in Tier 1
                      </button>
                    </td>
                    {showAdvancedColumns && (
                      <td className="p-3">
                        <div className="font-semibold text-[#38bdf8] mb-1">{t2Step.headline}</div>
                        <p className="text-[#94a3b8] text-[0.74rem] mb-2">{t2Step.milestoneTask}</p>
                        <button
                          onClick={() => {
                            onSelectTierPass('tier2');
                            onLoadPreset(t2Step.presetId);
                          }}
                          className="text-[0.7rem] text-[#38bdf8] hover:underline font-mono inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Play className="w-2.5 h-2.5 fill-current" /> Open in Tier 2
                        </button>
                      </td>
                    )}
                    {showAdvancedColumns && (
                      <td className="p-3">
                        <div className="font-semibold text-[#c084fc] mb-1">{t3Step.headline}</div>
                        <p className="text-[#94a3b8] text-[0.74rem] mb-2">{t3Step.milestoneTask}</p>
                        <button
                          onClick={() => {
                            onSelectTierPass('tier3');
                            onLoadPreset(t3Step.presetId);
                          }}
                          className="text-[0.7rem] text-[#c084fc] hover:underline font-mono inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Play className="w-2.5 h-2.5 fill-current" /> Open in Tier 3
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 4. Master Cyber-Physical Coupling Equation Reference */}
      <div className="bg-[#111827] border border-[#334155] rounded-xl p-4">
        <div className="flex justify-between items-center flex-wrap gap-2 mb-2">
          <h2 className="text-sm font-bold text-[#38bdf8]">
            Master Cyber-Physical Coupling Equation (Unifying All 8 Tracks Across Tiers 1–3)
          </h2>
          <span className="text-xs font-mono text-[#94a3b8]">
            Muscles & Skeleton (Track 02) ⇄ Nerves & Power (Track 01/03) ⇄ Brain & Safety (Track 04/05/06/07)
          </span>
        </div>
        <MathPanel
          math="\underbrace{M(q)\ddot{q} + C(q,\dot{q})\dot{q} + g(q) + \tau_{\text{fric}}(\dot{q})}_{\text{Continuous Mechanical Plant }\mathcal{P}} = \underbrace{N\eta\,\frac{3}{2}N_p\big(\lambda_{pm}i_q + (L_d - L_q)i_d i_q\big)}_{\text{Electromagnetic Transducer}} - J(q)^\top \mathcal{F}_{\text{ext}}, \qquad \underbrace{\dot{h}(\hat{x}, u) \ge -\alpha\big(h(\hat{x})\big)}_{\text{Discrete CBF Safety Filter }\mathcal{C}}"
        />
      </div>
    </div>
  );
};
