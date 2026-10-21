import React, { useState } from 'react';
import { MathView, MathPanel } from '../MathView';
import { ActiveTierPass, LEVEL_0_STEPS, TIER_PASS_META } from '../../curriculumData';
import {
  ALL_PASS_STEPS,
  firstUnverifiedEntry,
  verifiedForStep,
} from '../../practiceLinks';
import {
  SPINE,
  SPINE_STEP_COUNT,
  entriesAtDepth,
  columnHours,
  costLabel,
  hoursRange,
  layerLabel,
  milestonesForStep,
  stepAtDepth,
  stepCompleteAtDepth,
  stepCostLabel,
  sumHours,
  type SpineStep,
} from '../../spine';
import { tabForPreset } from '../../demoPresets';
import { trackLabel } from '../../trackLabel';
import { PYTHON_TAB_NAME, tabName } from '../../tabNames';
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
  CheckCircle2,
} from 'lucide-react';

interface TabArchitectureProps {
  onLoadPreset: (presetId: string) => void;
  /** When true, the matrix starts with the Beginner column only; deeper columns are opt-in. */
  beginnerView: boolean;
  activeTierPass: ActiveTierPass;
  onSelectTierPass: (pass: ActiveTierPass) => void;
  completedMilestones: Record<string, boolean>;
  /** Executed-and-passed entries, so a step can show the practice it actually has behind it. */
  verifiedLessons: Record<string, boolean>;
  onToggleMilestone: (id: string) => void;
  /** The landing Start here line is hidden; this tab carries the control that restores it. */
  startHereDismissed?: boolean;
  onRestoreStartHere?: () => void;
  onOpenPyodideLesson?: (lessonId: string) => void;
  /**
   * The lesson the learner stopped on, when there is one worth resuming (`lastLesson.ts` decides).
   * The roadmap leads with it: a return visit should be one click, not a search through ten steps.
   */
  resumeLesson?: {
    id: string;
    title: string;
    track: string;
    verified: boolean;
    completed: boolean;
    /** `resume` = the lesson they stopped on; `next` = the first one still to do. */
    reason: 'resume' | 'next';
    /** Lines the learner's unfinished draft differs from the lesson's starter by; 0 when untouched. */
    edited: number;
  } | null;
}

export const TabArchitecture: React.FC<TabArchitectureProps> = ({
  onLoadPreset,
  beginnerView,
  activeTierPass,
  onSelectTierPass,
  completedMilestones,
  verifiedLessons = {},
  onToggleMilestone,
  startHereDismissed = false,
  onRestoreStartHere,
  onOpenPyodideLesson,
  resumeLesson = null,
}) => {
  const [viewMode, setViewMode] = useState<'linear' | 'matrix'>('linear');
  const [advancedColumnsOpen, setAdvancedColumnsOpen] = useState<boolean>(false);
  // Which passes' first cards the learner has re-opened. Keyed by pass, so expanding one
  // pass's first step does not unfold another pass's; completion stays the only auto-collapse.
  const [expandedFirstStep, setExpandedFirstStep] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState<string>('');
  // Advanced View always shows the full matrix. Beginner View shows only the Beginner column
  // until the learner asks for the deeper ones.
  const showAdvancedColumns = !beginnerView || advancedColumnsOpen;

  // Depth is a lens, not a numbering: all ten steps are always on screen, and the lens decides
  // what each of Steps 3-10 asks for. A stored 'level0' (the old Stage-0 pass) is the on-ramp,
  // which is now Steps 1-2, so the closest depth is used rather than showing an empty list.
  const DEPTHS: ActiveTierPass[] = ['tier1', 'tier2', 'tier3'];
  const depth: ActiveTierPass = DEPTHS.includes(activeTierPass) ? activeTierPass : 'tier1';
  const activeMeta = TIER_PASS_META[depth];
  const depthSteps = ALL_PASS_STEPS.filter((candidate) => candidate.pass === depth);
  // A step is done at this depth when every entry it lists there has been executed and passed.
  // The milestone tick below it is still a self-report, and no longer drives this number.
  const depthDone = SPINE.filter((step) => stepCompleteAtDepth(step, depth, verifiedLessons)).length;
  const firstStepId = depthSteps[0]?.step.milestoneId;
  const firstStepDone = !!firstStepId && !!completedMilestones[firstStepId];
  const firstStepExpanded = !!expandedFirstStep[depth];
  const currentPassIdx = DEPTHS.indexOf(depth);
  const nextPass: ActiveTierPass | null =
    currentPassIdx < DEPTHS.length - 1 ? DEPTHS[currentPassIdx + 1] : null;

  const matchesSearch = (spineStep: SpineStep): boolean => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const at = stepAtDepth(spineStep, depth);
    const haystack = [
      spineStep.title,
      spineStep.outcome,
      `step ${spineStep.number}`,
      ...spineStep.trackDirs,
      at?.step.trackCode ?? '',
      at?.step.trackTitle ?? '',
      at?.step.headline ?? '',
      ...(at?.step.topics ?? []),
    ];
    return haystack.some((piece) => piece.toLowerCase().includes(q));
  };
  const visibleSpineSteps = SPINE.filter(matchesSearch);
  // The matrix covers Steps 3-10: the on-ramp has no depth columns to compare.
  const matrixSteps = SPINE.filter((step) => step.number > 2);
  const matrixTotals = sumHours(matrixSteps);

  return (
    <div className="space-y-5">
      {/* 0. The lesson to do next. Above the pipeline, because a return visit is asking "what was I
             doing?" before "what is the map?", and the runner already remembers the lesson. The
             card answers for both cases that matter - an unfinished lesson to pick up, and a passed
             one that should hand the offer forward - and says which one it is, because "continue"
             on a lesson already passed would be a lie. Hidden on a first visit: the landing page's
             Start here block names the first lesson already. */}
      {resumeLesson && onOpenPyodideLesson && (
        <div
          data-testid="resume-card"
          data-resume-lesson={resumeLesson.id}
          data-resume-reason={resumeLesson.reason}
          className="bg-panel border border-accent/40 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3"
        >
          <div className="min-w-0">
            <div className="text-xs font-mono uppercase tracking-wider text-accent">
              {resumeLesson.reason === 'next' ? 'Next unverified lesson' : 'Pick up where you stopped'}
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span data-testid="resume-lesson-id" className="text-sm font-bold font-mono text-ink">
                {resumeLesson.id}
              </span>
              <span className="text-sm font-semibold text-ink">{resumeLesson.title}</span>
            </div>
            <div data-testid="resume-lesson-state" className="mt-0.5 text-xs text-muted">
              {trackLabel(resumeLesson.track)} ·{' '}
              {resumeLesson.verified
                ? 'executed and passed'
                : resumeLesson.completed
                ? 'marked complete by you'
                : resumeLesson.reason === 'next'
                ? 'not verified yet'
                : 'opened, not verified yet'}
            </div>
            {/* The half-written exercise is the part of the work the lesson id cannot show: without
                this the card would offer "a lesson" when what is waiting is a program. */}
            {resumeLesson.edited > 0 && (
              <div data-testid="resume-draft" className="mt-1 text-xs text-emerald">
                Your unfinished edit is still here · {resumeLesson.edited}{' '}
                {resumeLesson.edited === 1 ? 'line' : 'lines'} changed from the starter
              </div>
            )}
          </div>
          <button
            onClick={() => onOpenPyodideLesson(resumeLesson.id)}
            data-testid="btn-resume-lesson"
            className="px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 bg-accent/20 text-accent border border-accent/50 hover:bg-accent/30 cursor-pointer transition-colors"
          >
            <Play className="w-3.5 h-3.5" />
            {/* The tab is named by the runner itself, so the button says what it does, not where. */}
            <span>
              {resumeLesson.reason === 'next'
                ? resumeLesson.edited > 0
                  ? 'Resume'
                  : 'Start'
                : 'Continue'}{' '}
              {resumeLesson.id}
            </span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 1. Linear Level-Up Progression Pipeline Header */}
      <div className="bg-panel border border-line rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-line-soft">
          <div>
            <div className="text-xs font-mono uppercase tracking-wider text-accent">
              TEN STEPS · ONE NUMBER · DEPTH 1 → 3
            </div>
            <h2 className="text-lg font-bold text-ink mt-0.5">
              The Same Ten Steps the Pages Print: Python, Circuits, Then One Joint and One Arm
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Steps 1 and 2 are the on-ramp. Steps 3–10 are one track each — the same joint and arm,
              from a lag model to the figure-8 capstone. The depth above changes how deep a step
              goes, never its number, so a page saying Step 6 means this card.
            </p>
            {startHereDismissed && onRestoreStartHere && (
              <button
                onClick={onRestoreStartHere}
                data-testid="btn-restore-start-here"
                className="mt-2 px-3 py-1 rounded-md text-xs font-semibold bg-emerald/10 text-emerald border border-emerald/50 hover:bg-emerald/10 cursor-pointer transition-colors"
              >
                Show the Start here block
              </button>
            )}
          </div>

          {/* View Mode Switcher */}
          <div className="flex items-center gap-1 bg-canvas p-1 rounded-lg border border-line-soft">
            <button
              onClick={() => setViewMode('linear')}
              data-testid="btn-arch-linear"
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                viewMode === 'linear'
                  ? 'bg-accent/20 text-accent border border-accent/50'
                  : 'text-muted hover:text-ink border border-transparent'
              }`}
            >
              <ListOrdered className="w-3.5 h-3.5" />
              <span>Ten Steps</span>
            </button>
            <button
              onClick={() => setViewMode('matrix')}
              data-testid="btn-arch-matrix"
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                viewMode === 'matrix'
                  ? 'bg-accent/20 text-accent border border-accent/50'
                  : 'text-muted hover:text-ink border border-transparent'
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
              <span>{beginnerView ? 'Compare Tracks' : 'Full 3-Tier Matrix'}</span>
            </button>
          </div>
        </div>

        {/* Depth, not a step number: it changes what Steps 3-10 ask for. */}
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs" data-testid="depth-bar">
          <span className="font-mono uppercase text-muted">Depth</span>
          {DEPTHS.map((passId, idx) => {
            const meta = TIER_PASS_META[passId];
            const isSelected = depth === passId;
            const firstDone = !!completedMilestones[depthSteps[0]?.step.milestoneId];
            return (
              <button
                key={passId}
                data-testid={`btn-pass-card-${passId}`}
                onClick={() => {
                  onSelectTierPass(passId);
                  setViewMode('linear');
                }}
                className={`text-left px-3 py-2 rounded-lg border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-raise border-accent shadow-md'
                    : 'bg-canvas border-line-soft hover:border-line'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span className={isSelected ? 'text-accent font-bold' : 'text-body'}>
                    DEPTH {idx + 1} OF 3 · {meta.levelNumber}
                  </span>
                  {isSelected && firstDone && (
                    <span
                      data-testid={`pass-first-step-complete-${passId}`}
                      role="img"
                      aria-label="Step 3 milestone marked done"
                      title="Step 3 milestone marked done (self-reported)"
                      className="inline-flex shrink-0 items-center text-emerald"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </span>
                  )}
                </span>
                <span className="block text-[0.7rem] text-muted mt-0.5 max-w-[16rem] truncate">
                  {meta.tagline}
                </span>
              </button>
            );
          })}
          <span
            className="font-mono text-[11px] text-emerald tabular-nums ml-auto"
            data-testid="depth-done"
          >
            {depthDone}/{SPINE_STEP_COUNT} steps passed at this depth
          </span>
        </div>

        {/* 3 Completion Routes, Recurring Arm Spine & Tier 2/3 Transition Boundaries */}
        <div
          data-testid="panel-completion-routes-spine"
          className="mt-4 pt-4 border-t border-line-soft grid grid-cols-1 lg:grid-cols-3 gap-3 text-xs"
        >
          <div className="p-3.5 rounded-lg bg-canvas border border-line-soft space-y-1.5">
            <div className="font-mono font-bold text-emerald">
              1. THREE COMPLETION ROUTES &amp; PROVISIONAL TIMES
            </div>
            <p className="text-body leading-relaxed">
              <b>Learn &amp; Simulate ($0):</b> Complete all lessons, behavioral tests, and capstones in browser/software tools (built-in hints suffice).{' '}
              <b>Build ($15–$150):</b> Optional low-voltage (&le;12 V) bench hardware.{' '}
              <b>Production Practice:</b> High-power 24 V/15 A &amp; 48 V/30 A builds require experienced review &amp; safety sign-off.
            </p>
            <p className="text-[11px] font-mono text-muted">
              Provisional targets: 323.5 h (68 modules, Passes 1–3) · ~341.5–346.5 h incl. Track P + Stage 0 entry ramp.
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-canvas border border-line-soft space-y-1.5">
            <div className="font-mono font-bold text-accent">
              2. RECURRING 2-DOF ARM SPINE &amp; 8-STEP LADDER
            </div>
            <p className="text-body leading-relaxed">
              One familiar robot joint/arm evolves from a scalar lag model (Track 00) &rarr; H-bridge drive (Track 01) &rarr; 2-link FK/IK (Track 02) &rarr; encoder + 1 kHz ISR (Tracks 03–04) &rarr; PID + gravity FF (Tracks 05–06) &rarr; safe bring-up &amp; 2-DOF Figure-8 Boss (Tracks 07–08).
            </p>
            <p className="text-[11px] font-mono text-muted">
              8-Step Ladder: Recall &rarr; See it &rarr; Predict &rarr; Work through &rarr; Practice &rarr; Break it &rarr; Transfer &rarr; Integrate.
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-canvas border border-line-soft space-y-1.5">
            <div className="font-mono font-bold text-purple">
              3. TIER 2 ROUTES &amp; TIER 3 CAPSTONE SCOPE
            </div>
            <p className="text-body leading-relaxed">
              <b>Tier 2:</b> Teaches ODE/Bode/State-Space on the <i>same</i> Tier 1 arm, adds standalone first-run labs (`KiCad`, `URDF`, `RTOS`, `ROS 2`), and offers <b>3 Evidence Routes</b> (<i>Simulation</i>, <i>Reference-Board</i>, or <i>Custom-PCB</i>).{' '}
              <b>Tier 3:</b> Splits into <i>Use &amp; Understand</i> vs. <i>Derive &amp; Extend</i>; Step 3.8 (9.5 h) requires <b>choosing 1 of Capstones I–V</b>.
            </p>
          </div>
        </div>
      </div>

      {/* 2. Active Pass Summary Banner + Search Filter */}
      {viewMode === 'linear' && (
        <div className="bg-panel border border-line rounded-xl p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1.5 max-w-4xl">
              <div className="flex items-center gap-2 text-xs font-mono text-emerald">
                <Compass className="w-4 h-4" />
                <span>DEPTH {currentPassIdx + 1} OF 3: {activeMeta.levelNumber}</span>
                <span aria-hidden="true">·</span>
                <span>
                  {depthDone} of {SPINE_STEP_COUNT} steps passed at this depth
                </span>
              </div>
              <h3 className="text-base font-bold text-ink">
                {activeMeta.name} — {activeMeta.tagline}
              </h3>
              <p className="text-xs text-body leading-relaxed">
                {activeMeta.goalSummary} Depth changes what Steps 3–10 ask for; it does not add
                steps, and nothing here changes what Step 1 or 2 is.
              </p>
            </div>

            {nextPass && (
              <button
                onClick={() => onSelectTierPass(nextPass)}
                className="bg-accent/20 hover:bg-accent/30 text-accent border border-accent px-3.5 py-2 rounded-md text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shrink-0"
              >
                <span>Level Up to {TIER_PASS_META[nextPass].levelNumber}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4 pt-3 border-t border-line-soft text-xs">
            <div>
              <span className="text-muted block text-[0.7rem] uppercase font-mono">Hardware Stack in This Pass</span>
              <span className="text-ink font-medium">{activeMeta.hardwareStack}</span>
            </div>
            <div>
              <span className="text-muted block text-[0.7rem] uppercase font-mono">Software & Firmware Stack</span>
              <span className="text-ink font-medium">{activeMeta.softwareStack}</span>
            </div>
            <div>
              <span className="text-muted block text-[0.7rem] uppercase font-mono">Mathematical Depth</span>
              <span className="text-accent font-medium">{activeMeta.mathDepth}</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-line-soft flex flex-wrap items-center justify-between gap-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter the ten steps by title, track, or concept..."
              data-testid="input-roadmap-search"
              className="w-full sm:w-96 px-3 py-1.5 rounded-lg bg-canvas border border-line text-xs text-ink placeholder-faint focus:outline-none focus:border-accent"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-xs font-mono text-accent hover:underline cursor-pointer"
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
          {visibleSpineSteps.map((spineStep) => {
            const at = stepAtDepth(spineStep, depth);
            const step = at?.step ?? null;
            const isChecked = step ? !!completedMilestones[step.milestoneId] : false;
            // The step's practice is derived from the same registry the runner lists, so this
            // count is evidence, not a second progress ledger.
            const practiceEntries = entriesAtDepth(spineStep, depth);
            const practicePassed = practiceEntries.filter((entry) => verifiedLessons[entry.id]).length;
            const nextEntry =
              practiceEntries.find((entry) => !verifiedLessons[entry.id]) ?? practiceEntries[0] ?? null;

            // Steps 1-2 are the on-ramp: no depth milestone, so the card is its entries, its
            // bench tasks, and the count of what has actually run.
            if (!step) {
              const benchMilestones = spineStep.number === 2 ? LEVEL_0_STEPS : [];
              return (
                <div
                  key={`spine-${spineStep.number}`}
                  data-testid={`step-card-spine-${spineStep.number}`}
                  className="bg-panel border border-line rounded-xl p-5"
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono pb-3 border-b border-line-soft">
                    <span className="text-accent font-bold">
                      STEP {spineStep.number} OF {SPINE_STEP_COUNT}
                    </span>
                    <span aria-hidden="true" className="text-faint">·</span>
                    <span className="text-emerald">ON-RAMP</span>
                  </div>
                  <h3 className="text-base font-bold text-ink mt-3">{spineStep.title}</h3>
                  <p className="text-xs text-body mt-1 leading-relaxed">{spineStep.outcome}</p>
                  <div
                    data-testid={`step-cost-${spineStep.number}`}
                    className="mt-2 text-[11px] font-mono text-muted tabular-nums"
                    title="Focused hours from each page's own metadata; an hour target is not elapsed time"
                  >
                    {stepCostLabel(spineStep)}
                  </div>

                  <div className="mt-3 text-xs font-mono text-muted tabular-nums">
                    {practicePassed}/{practiceEntries.length} entries passed in this browser
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {practiceEntries.map((entry) => {
                      const passed = !!verifiedLessons[entry.id];
                      return (
                        <button
                          key={entry.id}
                          onClick={() => onOpenPyodideLesson?.(entry.id)}
                          data-testid={`practice-entry-${entry.id}`}
                          title={`${entry.title} — ${passed ? 'executed and passed here' : 'not passed here yet'}`}
                          className={`px-1.5 py-0.5 rounded font-mono text-[11px] border transition-colors cursor-pointer whitespace-nowrap ${
                            passed
                              ? 'bg-emerald/15 border-emerald/60 text-emerald'
                              : 'bg-canvas border-line text-body hover:border-accent'
                          }`}
                        >
                          {passed ? '✓' : '○'} {entry.id}
                        </button>
                      );
                    })}
                  </div>

                  {benchMilestones.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-line-soft space-y-2">
                      <div className="text-[0.72rem] font-mono uppercase text-muted">
                        Bench tasks on this step (ticked by you, not checked)
                      </div>
                      {benchMilestones.map((bench) => {
                        const benchChecked = !!completedMilestones[bench.milestoneId];
                        return (
                          <button
                            key={bench.milestoneId}
                            onClick={() => onToggleMilestone(bench.milestoneId)}
                            data-testid={`btn-milestone-${bench.milestoneId}`}
                            className={`w-full text-left px-2.5 py-1.5 rounded-md text-[11px] border flex items-center gap-1.5 cursor-pointer transition-colors ${
                              benchChecked
                                ? 'bg-emerald/20 border-emerald text-emerald'
                                : 'bg-canvas border-line text-body hover:border-accent'
                            }`}
                          >
                            {benchChecked ? <CheckSquare className="w-3 h-3" /> : <Square className="w-3 h-3" />}
                            <span>{bench.trackTitle}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            const labTab = tabForPreset(step.presetId);
            // Only while searching does the list stop being the pass's own order; collapsing the
            // first row of a filtered list would hide a step the learner typed a filter for.
            const collapseFirstStep =
              firstStepDone &&
              step.milestoneId === firstStepId &&
              !firstStepExpanded &&
              !searchQuery.trim();

            if (collapseFirstStep) {
              return (
                <div
                  key={step.milestoneId}
                  data-testid={`step-card-${step.milestoneId}`}
                  data-collapsed="true"
                  className="bg-panel border border-emerald/40 rounded-lg px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2"
                >
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald">
                    <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                    Step {spineStep.number} complete
                  </span>
                  <span aria-hidden="true" className="text-faint">
                    ·
                  </span>
                  <span className="text-xs font-semibold text-ink">{spineStep.title}</span>
                  <span className="text-[11px] font-mono text-muted">
                    Depth {currentPassIdx + 1} · {step.trackTitle}
                  </span>
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => onToggleMilestone(step.milestoneId)}
                      data-testid={`btn-milestone-${step.milestoneId}`}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1.5 border transition-colors cursor-pointer ${
                        isChecked
                          ? 'bg-emerald/20 border-emerald text-emerald'
                          : 'bg-raise border-line text-body hover:border-accent'
                      }`}
                    >
                      {isChecked ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                      <span>{isChecked ? 'Marked done (self-reported)' : 'Mark done (self-reported)'}</span>
                    </button>
                    <button
                      onClick={() =>
                        setExpandedFirstStep((open) => ({ ...open, [activeTierPass]: true }))
                      }
                      data-testid="btn-step-expand"
                      className="px-2.5 py-1 rounded-md text-[11px] font-semibold text-muted hover:text-ink border border-line cursor-pointer transition-colors"
                    >
                      Show details
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={step.milestoneId}
                data-testid={`step-card-${step.milestoneId}`}
                className={`bg-panel border rounded-xl p-5 transition-all ${
                  isChecked ? 'border-emerald/60 bg-panel/90' : 'border-line'
                }`}
              >
                {/* Top Row: Step Kicker + Checkbox */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-line-soft">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                    <span className="text-accent font-bold">
                      STEP {spineStep.number} OF {SPINE_STEP_COUNT}
                    </span>
                    <span aria-hidden="true" className="text-faint">·</span>
                    <span className="text-ink font-bold">{step.trackCode}</span>
                    <span aria-hidden="true" className="text-faint">·</span>
                    <span className="text-body">Depth {currentPassIdx + 1}</span>
                    <span aria-hidden="true" className="text-faint">·</span>
                    <span className="text-emerald">{step.deliverableGate}</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {firstStepDone && step.milestoneId === firstStepId && (
                      <button
                        onClick={() =>
                          setExpandedFirstStep((open) => ({ ...open, [activeTierPass]: false }))
                        }
                        data-testid="btn-step-collapse"
                        className="px-3 py-1 rounded-md text-xs font-semibold text-muted hover:text-ink border border-line cursor-pointer transition-colors"
                      >
                        Hide details
                      </button>
                    )}
                    <button
                      onClick={() => onToggleMilestone(step.milestoneId)}
                      data-testid={`btn-milestone-${step.milestoneId}`}
                      className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 border transition-colors cursor-pointer ${
                        isChecked
                          ? 'bg-emerald/20 border-emerald text-emerald'
                          : 'bg-raise border-line text-body hover:border-accent'
                      }`}
                    >
                      {isChecked ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                      <span>{isChecked ? 'Marked done (self-reported)' : 'Mark done (self-reported)'}</span>
                    </button>
                  </div>
                </div>

                {/* Title & Why */}
                <div className="mt-3">
                  <h3 className="text-base font-bold text-ink">{spineStep.title}</h3>
                  <div className="text-[11px] font-mono text-muted mt-0.5">{step.trackTitle}</div>
                  <div
                    data-testid={`step-cost-${spineStep.number}`}
                    className="text-[11px] font-mono text-muted mt-0.5 tabular-nums"
                    title="Focused hours from each page's own metadata; an arm hour is Steps 1-10, a depth hour is the second pass after Step 10"
                  >
                    {stepCostLabel(spineStep)}
                  </div>
                  <div className="text-xs font-semibold text-accent mt-0.5">{step.headline}</div>
                  <p className="text-xs text-muted mt-1.5 leading-relaxed">{step.coreWhy}</p>
                </div>

                {/* Content Grid: Left = Topics & Bridge, Right = Math + Actionable Milestone */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mt-4">
                  <div className="lg:col-span-7 space-y-3 text-xs">
                    <div className="bg-canvas border border-line-soft rounded-lg p-3.5">
                      <div className="font-bold text-ink mb-2 uppercase tracking-wider text-[0.72rem] font-mono">
                        Core Concepts & Skills in {step.trackCode}
                      </div>
                      <ul className="list-disc pl-4 space-y-1.5 text-body leading-relaxed">
                        {step.topics.map((topic, i) => (
                          <li key={i}>{topic}</li>
                        ))}
                      </ul>
                    </div>

                    {/* Curated Free Resources */}
                    <div className="bg-canvas border border-line-soft rounded-lg p-3.5">
                      <div className="font-bold text-emerald mb-2 uppercase tracking-wider text-[0.72rem] font-mono">
                        Curated Free Resources (Websites & Simulators &gt; Books)
                      </div>
                      <ul className="space-y-1.5 text-body leading-relaxed">
                        {step.studyLinks.map((lk) => (
                          <li key={lk.url}>
                            <span aria-hidden="true">🔗 </span>
                            <a
                              href={lk.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-accent hover:underline font-semibold inline-flex items-center gap-1"
                            >
                              {lk.label} <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                            {lk.note && <span className="text-muted"> — <em>{lk.note}</em></span>}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {step.bridgeTitle && (
                      <div className="bg-raise/40 border border-amber/30 rounded-lg p-3.5">
                        <div className="flex items-center gap-1.5 font-bold text-amber mb-1">
                          <ArrowRightLeft className="w-3.5 h-3.5" />
                          <span>{step.bridgeTitle}</span>
                        </div>
                        <div className="text-[0.74rem] text-muted mb-1">
                          <strong>From:</strong> {step.bridgeFrom} <span className="text-amber">→</span>{' '}
                          <strong>To:</strong> {step.bridgeTo}
                        </div>
                        <p className="text-body leading-relaxed">{step.bridgeHow}</p>
                      </div>
                    )}
                  </div>

                  <div className="lg:col-span-5 flex flex-col justify-between space-y-3">
                    <div>
                      <div className="text-[0.72rem] font-mono uppercase text-muted mb-1">
                        Governing Equation ({step.tierBadge})
                      </div>
                      <div className="bg-canvas border border-line-soft rounded-md p-3 overflow-x-auto text-xs">
                        <MathView math={step.equation} block={true} />
                      </div>                      <div className="bg-canvas border border-line-soft rounded-lg p-3.5 mt-3 text-xs">
                        <div className="font-bold text-emerald mb-1 flex items-center gap-1.5">
                          <Trophy className="w-3.5 h-3.5" />
                          <span>Deliverable (not auto-checked):</span>
                        </div>
                        <p className="text-body leading-relaxed">
                          <em>Task:</em> {step.milestoneTask}
                        </p>
                        <p className="text-[11px] text-muted mt-1.5">
                          The tick below records that <b>you</b> say this is done. The only count the
                          app can verify is the practice block underneath.
                        </p>
                      </div>

                      {/* The join that used to be missing: this step's entries, by id, with the
                          passes this browser owns, and one button that opens the next open one. */}
                      <div
                        data-testid={`practice-${step.milestoneId}`}
                        className="bg-canvas border border-line-soft rounded-lg p-3.5 mt-3 text-xs"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                          <div className="font-bold text-accent flex items-center gap-1.5">
                            <Play className="w-3.5 h-3.5" />
                            <span>Practice in {PYTHON_TAB_NAME}</span>
                          </div>
                          <span
                            className="font-mono text-[11px] text-muted tabular-nums"
                            data-testid={`practice-count-${step.milestoneId}`}
                          >
                            {practiceEntries.length > 0
                              ? `${practicePassed}/${practiceEntries.length} passed in this browser`
                              : 'no workbench entry for this step'}
                          </span>
                        </div>
                        {practiceEntries.length > 0 ? (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {practiceEntries.map((entry) => {
                              const passed = !!verifiedLessons[entry.id];
                              return (
                                <button
                                  key={entry.id}
                                  onClick={() => onOpenPyodideLesson?.(entry.id)}
                                  data-testid={`practice-entry-${entry.id}`}
                                  title={`${entry.title} — ${passed ? 'executed and passed here' : 'not passed here yet'}`}
                                  className={`px-1.5 py-0.5 rounded font-mono text-[11px] border transition-colors cursor-pointer whitespace-nowrap ${
                                    passed
                                      ? 'bg-emerald/15 border-emerald/60 text-emerald'
                                      : 'bg-panel border-line text-body hover:border-accent'
                                  }`}
                                >
                                  {passed ? '✓' : '○'} {entry.id}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-muted leading-relaxed mt-1.5">
                            This step is bench or prose work. Nothing in the app can run or check it,
                            so the tick is the only record — the lab above still applies.
                          </p>
                        )}
                        {practiceEntries.length > 1 && nextEntry && (
                          <button
                            onClick={() => onOpenPyodideLesson?.(nextEntry.id)}
                            className="mt-2 text-[11px] font-mono text-accent hover:underline cursor-pointer"
                          >
                            Open the next one I have not passed: {nextEntry.id} →
                          </button>
                        )}
                      </div>

                      {step.quiz && (
                        <div className="bg-canvas border border-line rounded-lg p-3.5 mt-3 text-xs">
                          {/* Answers are on the page, so this is a self-check, not an assessment:
                              the label says so rather than implying the app scored it. */}
                          <div className="font-bold text-purple mb-1.5">
                            Self-check (answers shown, not scored)
                          </div>
                          <details className="group cursor-pointer">
                            <summary className="font-semibold text-ink hover:text-accent select-none">
                              <b>Show the two questions and their answers</b>
                            </summary>
                            <div className="mt-3 pt-2.5 border-t border-line-soft space-y-2.5 text-body cursor-default">
                              <div>
                                <div className="font-semibold text-ink">
                                  <strong>Q1:</strong> {step.quiz.q1}
                                </div>
                                <div className="text-muted mt-1 pl-3 border-l-2 border-emerald">
                                  <strong>Answer / Explanation:</strong> {step.quiz.a1}
                                </div>
                              </div>
                              <div>
                                <div className="font-semibold text-ink">
                                  <strong>Q2:</strong> {step.quiz.q2}
                                </div>
                                <div className="text-muted mt-1 pl-3 border-l-2 border-accent">
                                  <strong>Answer &amp; Explanation:</strong> {step.quiz.a2}
                                </div>
                              </div>
                            </div>
                          </details>
                        </div>
                      )}
                    </div>

                    {/* Footer Button: the lab it opens, named from the same table the tab strip
                        renders — a label can no longer promise a position that moved. */}
                    <div className="pt-2 flex flex-col items-end gap-1 border-t border-line-soft">
                      {labTab && (
                        <span
                          className="text-[11px] font-mono text-muted"
                          data-testid={`step-lab-${step.milestoneId}`}
                        >
                          Opens: {tabName(labTab)}
                        </span>
                      )}
                      <button
                        onClick={() => onLoadPreset(step.presetId)}
                        className="bg-accent/20 hover:bg-accent/30 text-accent border border-accent px-3 py-1.5 rounded-md text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
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
          <div className="bg-gradient-to-r from-panel via-raise to-emerald/10 border border-emerald rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1 max-w-3xl">
              <div className="text-xs font-mono uppercase text-emerald font-bold">
                {nextPass
                  ? `END OF DEPTH ${currentPassIdx + 1} · READY TO GO DEEPER`
                  : 'FINAL PRODUCTION MASTERY ACHIEVED'}
              </div>
              <h3 className="text-base font-bold text-ink">
                {nextPass
                  ? `Finished Depth ${currentPassIdx + 1}? Steps 3–10 again at ${TIER_PASS_META[nextPass].levelNumber}: same numbers, deeper work.`
                  : `Congratulations! You Have Walked Steps 1–${SPINE_STEP_COUNT} at All 3 Depths Through Production Mastery.`}
              </h3>
              <p className="text-xs text-body">
                {nextPass
                  ? `You now have the complete end-to-end foundation from ${activeMeta.levelNumber}. The next depth keeps the step numbers and raises what each one asks for: upgraded hardware, deeper math, custom engineering tools. Steps 1–2 do not repeat.`
                  : 'All 12 Lab, CAD, 48V/30A PCB, and STM32G474 Firmware verification gates are unlocked in the interactive simulators.'}
              </p>
            </div>

            {nextPass && (
              <button
                onClick={() => {
                  onSelectTierPass(nextPass);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="bg-emerald hover:bg-emerald/90 text-inverse font-bold text-xs px-4 py-2.5 rounded-md flex items-center gap-2 cursor-pointer transition-all shadow-md"
              >
                <span>Start {TIER_PASS_META[nextPass].levelNumber} at Step 3</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* 3B. MATRIX COMPARISON VIEW (Beginner column by default; deeper columns opt-in) */}
      {viewMode === 'matrix' && (
        <div className="bg-panel border border-line rounded-xl p-4 overflow-x-auto">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-accent">
                {beginnerView
                  ? 'Step-by-Step Matrix (Beginner Path)'
                  : 'Complete Horizontal vs. Vertical Curriculum Matrix (Steps 3–10 × Depths 1–3)'}
              </h3>
              <p className="text-xs text-muted">
                {beginnerView
                  ? 'Read across a row to see the beginner path for one track. The deeper columns stay out of the way until you ask for them.'
                  : 'Read down a column to walk one depth from Step 3 to Step 10, or read across a row to see how one step deepens. The row number is the step number every page prints.'}
              </p>
            </div>
            {beginnerView && (
              <button
                onClick={() => setAdvancedColumnsOpen((open) => !open)}
                data-testid="btn-toggle-advanced-columns"
                className="px-3 py-1.5 rounded-md text-xs font-semibold bg-canvas text-muted hover:text-ink border border-line cursor-pointer transition-colors"
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
              <tr className="border-b border-line bg-canvas text-accent font-mono">
                <th className="p-3 w-1/5">Step (3 → 10)</th>
                <th className="p-3 w-1/4 text-emerald">
                  {beginnerView ? 'Beginner path' : 'Depth 1 · Tier 1 (Beginner / Intuitive)'}
                </th>
                {showAdvancedColumns && (
                  <th className="p-3 w-1/4 text-accent">
                    {beginnerView ? 'Deeper practice' : 'Depth 2 · Tier 2 (Intermediate / Applied)'}
                  </th>
                )}
                {showAdvancedColumns && (
                  <th className="p-3 w-1/4 text-purple">
                    {beginnerView ? 'Advanced' : 'Depth 3 · Tier 3 (Advanced / Production)'}
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-raise text-body align-top">
              {matrixSteps.map((spineStep) => {
                const t1Step = stepAtDepth(spineStep, 'tier1')!.step;
                const t2Step = stepAtDepth(spineStep, 'tier2')?.step ?? t1Step;
                const t3Step = stepAtDepth(spineStep, 'tier3')?.step ?? t1Step;
                return (
                  <tr key={spineStep.slug} className="hover:bg-raise/30">
                    <td className="p-3 font-bold text-ink">
                      <div className="text-accent font-mono text-[0.7rem]">
                        STEP {spineStep.number} OF {SPINE_STEP_COUNT}
                      </div>
                      <div>{spineStep.title}</div>
                      <div
                        data-testid={`matrix-cost-${spineStep.number}`}
                        className="mt-1 text-[0.75rem] font-mono font-normal text-body tabular-nums"
                        title="Focused hours from each page's own metadata; the row is that step, the footer is these rows added up"
                      >
                        {hoursRange(spineStep.hours.total)}
                      </div>
                      <div
                        data-testid={`matrix-layer-${spineStep.number}`}
                        className="mt-0.5 text-[0.68rem] font-mono font-normal text-muted tabular-nums"
                        title="The arm pass (lessons plus Tier 1) and the depth pass after Step 10; the columns across the row split the depth pass further"
                      >
                        {layerLabel(spineStep.hours)}
                      </div>
                    </td>
                    <td className="p-3">
                      <div
                        data-testid={`matrix-cost-${spineStep.number}-d1`}
                        className="text-[0.7rem] font-mono text-muted tabular-nums mb-1"
                        title="Lessons plus Tier 1 modules: the arm pass"
                      >
                        {columnHours(spineStep.hours.arm)}
                      </div>
                      <div className="font-semibold text-emerald mb-1">{t1Step.headline}</div>
                      <p className="text-muted text-[0.74rem] mb-2">{t1Step.milestoneTask}</p>
                      <button
                        onClick={() => {
                          onSelectTierPass('tier1');
                          onLoadPreset(t1Step.presetId);
                        }}
                        className="text-[0.7rem] text-emerald hover:underline font-mono inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Play className="w-2.5 h-2.5 fill-current" /> Open in Tier 1
                      </button>
                    </td>
                    {showAdvancedColumns && (
                      <td className="p-3">
                        <div
                          data-testid={`matrix-cost-${spineStep.number}-d2`}
                          className="text-[0.7rem] font-mono text-muted tabular-nums mb-1"
                          title="The step's Tier 2 modules: the depth pass at Depth 2"
                        >
                          {columnHours(spineStep.hours.depth2)}
                        </div>
                        <div className="font-semibold text-accent mb-1">{t2Step.headline}</div>
                        <p className="text-muted text-[0.74rem] mb-2">{t2Step.milestoneTask}</p>
                        <button
                          onClick={() => {
                            onSelectTierPass('tier2');
                            onLoadPreset(t2Step.presetId);
                          }}
                          className="text-[0.7rem] text-accent hover:underline font-mono inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Play className="w-2.5 h-2.5 fill-current" /> Open in Tier 2
                        </button>
                      </td>
                    )}
                    {showAdvancedColumns && (
                      <td className="p-3">
                        <div
                          data-testid={`matrix-cost-${spineStep.number}-d3`}
                          className="text-[0.7rem] font-mono text-muted tabular-nums mb-1"
                          title="The step's Tier 3 modules: the depth pass at Depth 3"
                        >
                          {columnHours(spineStep.hours.depth3)}
                        </div>
                        <div className="font-semibold text-purple mb-1">{t3Step.headline}</div>
                        <p className="text-muted text-[0.74rem] mb-2">{t3Step.milestoneTask}</p>
                        <button
                          onClick={() => {
                            onSelectTierPass('tier3');
                            onLoadPreset(t3Step.presetId);
                          }}
                          className="text-[0.7rem] text-purple hover:underline font-mono inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Play className="w-2.5 h-2.5 fill-current" /> Open in Tier 3
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-line bg-canvas align-top">
                <td className="p-3">
                  <div className="font-mono text-ink">
                    Steps 3–{SPINE_STEP_COUNT} · {matrixSteps.length} rows
                  </div>
                  <div
                    data-testid="matrix-cost-total"
                    className="mt-1 text-[0.7rem] font-mono text-emerald tabular-nums"
                    title="The rows above, added up; the on-ramp's Steps 1-2 are in the ten-step list, not here"
                  >
                    {costLabel(matrixTotals)}
                  </div>
                </td>
                <td
                  data-testid="matrix-cost-col-1"
                  className="p-3 font-mono text-emerald tabular-nums"
                  title="Every arm hour in the rows above: lessons plus Tier 1 modules"
                >
                  {columnHours(matrixTotals.arm)}
                </td>
                {showAdvancedColumns && (
                  <td
                    data-testid="matrix-cost-col-2"
                    className="p-3 font-mono text-accent tabular-nums"
                    title="Every Depth 2 hour in the rows above: the step's Tier 2 modules"
                  >
                    {columnHours(matrixTotals.depth2)}
                  </td>
                )}
                {showAdvancedColumns && (
                  <td
                    data-testid="matrix-cost-col-3"
                    className="p-3 font-mono text-purple tabular-nums"
                    title="Every Depth 3 hour in the rows above: the step's Tier 3 modules"
                  >
                    {columnHours(matrixTotals.depth3)}
                  </td>
                )}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* 4. Master Cyber-Physical Coupling Equation Reference */}
      <div className="bg-panel border border-line rounded-xl p-4">
        <div className="flex justify-between items-center flex-wrap gap-2 mb-2">
          <h2 className="text-sm font-bold text-accent">
            Master Cyber-Physical Coupling Equation (Unifying All 8 Tracks Across Tiers 1–3)
          </h2>
          <span className="text-xs font-mono text-muted">
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
