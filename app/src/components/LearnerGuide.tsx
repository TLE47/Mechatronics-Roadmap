import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  X,
} from 'lucide-react';
import { ResponsiveOverlay } from './ui/ResponsiveOverlay';
import { MathView } from './MathView';
import { TYPESET_SHOWCASE, typesetExpression } from '../calculatorTypeset';
import { FEATURE_WALKTHROUGH_COUNT } from '../featureWalkthrough';
import {
  GUIDE_STEP_COUNT,
  LEARNER_GUIDE,
  dismissGuideState,
  guideAnnouncement,
  guideStepNumber,
  jumpToGuideStep,
  nextGuideState,
  previousGuideState,
  readGuideState,
  resumeGuideState,
  writeGuideState,
  type GuideState,
  type GuideVisual as GuideVisualId,
} from '../learnerGuide';
import type { TabId } from '../types';
import { playShortcut } from '../audio/shortcutSound';

const FORMULA_CHIPS = TYPESET_SHOWCASE.slice(0, 6).map((entry) => ({
  ...entry,
  tex: typesetExpression(entry.input) ?? entry.input,
}));

const VISUAL_LABEL: Record<GuideVisualId, string> = {
  loop: 'The loop · one sitting',
  roadmap: 'Roadmap · four passes',
  placement: 'Placement · skip what you know',
  lesson: 'A lesson · read, predict, run',
  checks: 'Feedback · red is data',
  calculator: 'Instruments · native math',
  study: 'Free study · no grade',
  micro: 'Micro · two minutes',
  labs: 'Labs · see the physics',
  robot: 'Robot · geometry and safety',
  hardware: 'Build · parts and requirements',
  board: 'Board · compiled firmware',
  trust: 'Trust · links watched nightly',
  start: 'Start · your first week',
};

/** A quiet instrument panel behind every drawing: one border, one glow, one caption. */
const GuideFrame: React.FC<{ visual: GuideVisualId; children: React.ReactNode }> = ({
  visual,
  children,
}) => (
  <div
    aria-hidden="true"
    className="relative overflow-hidden rounded-2xl border border-line-strong bg-canvas p-3 shadow-[var(--shadow-md)]"
  >
    <div
      className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full blur-2xl"
      style={{ backgroundColor: 'var(--accent-soft)' }}
    />
    <div className="relative">{children}</div>
    <p className="relative mt-3 border-t border-line-soft pt-2 font-mono text-[9.5px] uppercase tracking-[0.16em] text-faint">
      {VISUAL_LABEL[visual]}
    </p>
  </div>
);

/** The loop: four cards, because that is the whole method and the guide repeats it everywhere. */
const LoopVisual: React.FC = () => (
  <GuideFrame visual="loop">
    <div className="space-y-1.5">
      {[
        ['01', 'Read', 'the brief'],
        ['02', 'Predict', 'what will happen'],
        ['03', 'Run', 'and watch the checks'],
        ['04', 'Verify', 'and keep the lesson'],
      ].map(([number, title, detail]) => (
        <div
          key={number}
          className="flex items-center gap-2 rounded-lg border border-line-soft bg-panel px-2.5 py-2"
        >
          <span className="font-mono text-[10px] font-semibold text-accent">{number}</span>
          <span className="text-[12px] font-semibold text-ink">{title}</span>
          <span className="ml-auto text-[10.5px] text-faint">{detail}</span>
        </div>
      ))}
    </div>
    <div className="mt-2 flex items-center justify-between rounded-lg border border-accent/25 bg-accent-soft px-2.5 py-1.5">
      <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-accent">
        one sitting
      </span>
      <span className="text-[15px] font-semibold text-ink">20 min</span>
    </div>
  </GuideFrame>
);

const RoadmapVisual: React.FC = () => (
  <GuideFrame visual="roadmap">
    <div className="grid grid-cols-5 gap-1.5">
      {['P', '0', '1', '2', '3'].map((pass, index) => (
        <div
          key={pass}
          className={`rounded-lg border px-1 py-2 text-center ${
            index === 0
              ? 'border-accent/50 bg-accent-soft'
              : 'border-line-soft bg-panel'
          }`}
        >
          <span
            className={`mx-auto block h-1.5 w-1.5 rounded-full ${
              index === 0 ? 'bg-accent' : 'bg-line-strong'
            }`}
          />
          <span className="mt-1.5 block font-mono text-[8px] uppercase tracking-[0.1em] text-faint">
            {index === 0 ? 'start' : 'pass'}
          </span>
          <span className="block text-[13px] font-semibold text-ink">{pass}</span>
        </div>
      ))}
    </div>
    <div className="mt-2 rounded-lg border border-line-soft bg-panel px-2.5 py-2">
      <p className="text-[10.5px] font-semibold text-ink">One milestone per sitting</p>
      <p className="mt-0.5 text-[10px] leading-snug text-faint">
        Read the milestone, do the practice, then mark it done.
      </p>
    </div>
  </GuideFrame>
);

const PlacementVisual: React.FC = () => (
  <GuideFrame visual="placement">
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 rounded-lg border border-line-soft bg-panel px-2.5 py-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full border border-line-strong font-mono text-[9px] text-muted">
          ?
        </span>
        <span className="text-[11.5px] text-body">Already know variables?</span>
        <span className="ml-auto rounded-md bg-accent-soft px-1.5 py-0.5 font-mono text-[9px] text-accent">
          jump to 2.1
        </span>
      </div>
      <div className="ml-4 h-3 border-l border-dashed border-line-strong" />
      <div className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent-soft px-2.5 py-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[9px] font-semibold text-inverse">
          ✓
        </span>
        <span className="text-[11.5px] font-semibold text-ink">Start at the first unknown idea</span>
      </div>
    </div>
    <p className="mt-2 text-[10px] leading-snug text-faint">
      No tab is locked. No progress is changed.
    </p>
  </GuideFrame>
);

const LessonVisual: React.FC = () => (
  <GuideFrame visual="lesson">
    <div className="rounded-lg border border-line-soft bg-panel p-2.5">
      <div className="flex items-center gap-1.5">
        <span className="rounded bg-accent-soft px-1.5 py-0.5 font-mono text-[9px] text-accent">
          P.1
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-faint">
          new ideas
        </span>
      </div>
      <p className="mt-1.5 text-[12px] font-semibold leading-snug text-ink">
        Blink an LED without blocking the loop.
      </p>
      <div className="mt-2 rounded-md bg-canvas px-2 py-1.5 font-mono text-[10px] text-muted">
        <span className="text-faint">1</span> time.sleep_ms(500)
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="font-mono text-[9px] text-faint">predict first</span>
        <span className="rounded-md bg-accent px-2 py-1 text-[10px] font-semibold text-inverse">
          Run ⌘↵
        </span>
      </div>
    </div>
  </GuideFrame>
);

const ChecksVisual: React.FC = () => (
  <GuideFrame visual="checks">
    <div className="space-y-1.5">
      {[
        ['The LED turns on at 0.5 s', 'expected 1, got 0'],
        ['It blinks three times', 'expected 3 edges, got 1'],
        ['Code runs without error', '3.4 ms'],
      ].map(([name, detail], index) => {
        const passed = index === 2;
        return (
          <div
            key={name}
            className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${
              passed ? 'border-emerald/25 bg-panel' : 'border-rose/25 bg-rose/5'
            }`}
          >
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                passed ? 'bg-emerald/15 text-emerald' : 'bg-rose/15 text-rose'
              }`}
            >
              {passed ? '✓' : '×'}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[10.5px] font-medium text-body">{name}</span>
              <span className="block truncate font-mono text-[9px] text-faint">{detail}</span>
            </span>
          </div>
        );
      })}
    </div>
    <p className="mt-2 font-mono text-[9.5px] text-accent">Fix the first red row, then run again.</p>
  </GuideFrame>
);

const CalculatorVisual: React.FC = () => (
  <GuideFrame visual="calculator">
    <div className="rounded-lg border border-line-soft bg-panel p-2.5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-faint">
          scientific
        </span>
        <span className="rounded bg-accent-soft px-1.5 py-0.5 font-mono text-[8.5px] text-accent">
          graphing
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {FORMULA_CHIPS.map((formula) => (
          <div
            key={formula.id}
            className="flex min-h-9 items-center rounded-md border border-line-soft bg-canvas px-1.5 py-1 text-[10px] text-ink"
          >
            <MathView math={formula.tex} />
          </div>
        ))}
      </div>
    </div>
    <svg viewBox="0 0 220 60" className="mt-2 w-full" aria-hidden="true">
      <defs>
        <pattern id="guide-grid" width="22" height="15" patternUnits="userSpaceOnUse">
          <path d="M 22 0 L 0 0 0 15" fill="none" stroke="var(--border)" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="220" height="60" fill="url(#guide-grid)" opacity="0.55" />
      <path
        d="M0 30 H220"
        stroke="var(--border-strong)"
        strokeWidth="0.8"
      />
      <path
        d="M0 30 C18 30 24 8 38 8 C52 8 55 52 70 52 C85 52 88 8 102 8 C116 8 119 52 134 52 C149 52 152 8 166 8 C180 8 183 52 198 52 C208 52 214 40 220 34"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  </GuideFrame>
);

const StudyVisual: React.FC = () => (
  <GuideFrame visual="study">
    <div className="space-y-1.5">
      {[
        ['PY', 'main.py', 'the same runtime'],
        ['FLOW', 'Workflow canvas', 'blocks, not grades'],
        ['NOTE', 'Notebook', 'keep the why'],
      ].map(([tag, name, detail]) => (
        <div
          key={tag}
          className="flex items-center gap-2 rounded-lg border border-line-soft bg-panel px-2.5 py-2"
        >
          <span className="w-9 shrink-0 rounded bg-canvas px-1 py-0.5 text-center font-mono text-[8px] tracking-[0.08em] text-accent">
            {tag}
          </span>
          <span className="text-[11px] font-semibold text-ink">{name}</span>
          <span className="ml-auto text-[9.5px] text-faint">{detail}</span>
        </div>
      ))}
    </div>
    <p className="mt-2 text-[10px] leading-snug text-faint">No lesson. No checks. Still saved.</p>
  </GuideFrame>
);

const MicroVisual: React.FC = () => (
  <GuideFrame visual="micro">
    <div className="mx-auto w-[9.5rem] rounded-[1.4rem] border-[3px] border-line-strong bg-panel p-2.5 shadow-[var(--shadow-sm)]">
      <div className="mx-auto mb-2 h-1 w-7 rounded-full bg-line-strong" />
      <div className="flex items-center justify-between">
        <span className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-accent">2 min</span>
        <span className="flex gap-0.5">
          {[1, 2, 3, 4].map((dot) => (
            <span
              key={dot}
              className={`h-1 w-1 rounded-full ${dot < 3 ? 'bg-accent' : 'bg-line-strong'}`}
            />
          ))}
        </span>
      </div>
      <p className="mt-1.5 text-[12px] font-semibold leading-snug text-ink">What is a variable?</p>
      <p className="mt-1 text-[9.5px] leading-snug text-muted">
        A name for a value the program can change.
      </p>
      <div className="mt-2 space-y-1">
        {['A label', 'A box', 'A number'].map((choice, index) => (
          <div
            key={choice}
            className={`rounded-md border px-1.5 py-1 text-[9px] ${
              index === 1 ? 'border-accent bg-accent-soft text-accent' : 'border-line-soft text-muted'
            }`}
          >
            {choice}
          </div>
        ))}
      </div>
    </div>
  </GuideFrame>
);

const LAB_TRACES = [
  { label: 'Bode', color: 'var(--accent)', path: 'M0 44 C20 44 28 10 48 10 C68 10 74 36 94 36 C112 36 118 26 140 26' },
  { label: 'FOC', color: 'var(--emerald)', path: 'M0 42 C14 42 18 8 30 8 C42 8 42 50 54 50 C66 50 66 8 78 8 C90 8 90 50 102 50 C114 50 114 8 126 8 C134 8 138 30 140 36' },
  { label: 'Pendulum', color: 'var(--amber)', path: 'M0 22 C16 22 20 48 36 48 C52 48 54 18 70 18 C86 18 88 44 104 44 C120 44 122 24 140 24' },
];

const LabsVisual: React.FC = () => (
  <GuideFrame visual="labs">
    <div className="space-y-1.5">
      {LAB_TRACES.map((trace) => (
        <div key={trace.label} className="rounded-lg border border-line-soft bg-panel px-2 py-1.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-faint">
              {trace.label}
            </span>
            <span className="h-1 w-1 rounded-full" style={{ backgroundColor: trace.color }} />
          </div>
          <svg viewBox="0 0 140 56" className="mt-1 h-8 w-full" aria-hidden="true">
            <path
              d={trace.path}
              fill="none"
              stroke={trace.color}
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </div>
      ))}
    </div>
  </GuideFrame>
);

const RobotVisual: React.FC = () => (
  <GuideFrame visual="robot">
    <svg viewBox="0 0 220 130" className="w-full" aria-hidden="true">
      <circle cx="110" cy="66" r="52" fill="none" stroke="var(--border)" strokeDasharray="3 4" />
      <rect x="22" y="100" width="26" height="14" rx="3" fill="var(--raise)" stroke="var(--border-strong)" />
      <line x1="35" y1="100" x2="97" y2="58" stroke="var(--accent)" strokeWidth="7" strokeLinecap="round" />
      <line x1="97" y1="58" x2="164" y2="40" stroke="var(--emerald)" strokeWidth="5" strokeLinecap="round" />
      <circle cx="35" cy="100" r="5" fill="var(--panel)" stroke="var(--accent)" strokeWidth="2" />
      <circle cx="97" cy="58" r="4.5" fill="var(--panel)" stroke="var(--accent)" strokeWidth="2" />
      <circle cx="164" cy="40" r="5" fill="var(--accent)" />
      <text x="60" y="94" fill="var(--muted)" fontSize="9" fontFamily="monospace">L1</text>
      <text x="130" y="52" fill="var(--muted)" fontSize="9" fontFamily="monospace">L2</text>
      <text x="142" y="24" fill="var(--faint)" fontSize="8" fontFamily="monospace">end effector</text>
      <path d="M164 40 L180 28" stroke="var(--border-strong)" strokeWidth="1" strokeDasharray="2 3" />
      <rect x="158" y="103" width="50" height="16" rx="4" fill="var(--panel)" stroke="var(--border-strong)" />
      <text x="164" y="114" fill="var(--emerald)" fontSize="8" fontFamily="monospace">STO 0.4 ms</text>
    </svg>
  </GuideFrame>
);

const HardwareVisual: React.FC = () => (
  <GuideFrame visual="hardware">
    <div className="grid grid-cols-3 gap-1.5">
      {[
        ['MTR', 'BLDC'],
        ['PCB', '48 V'],
        ['ENC', 'AS5048'],
      ].map(([tag, detail]) => (
        <div
          key={tag}
          className="rounded-lg border border-line-soft bg-panel px-1.5 py-2 text-center"
        >
          <span className="mx-auto flex h-7 w-7 items-center justify-center rounded-md bg-canvas font-mono text-[8px] text-accent">
            {tag}
          </span>
          <span className="mt-1 block text-[9px] text-muted">{detail}</span>
        </div>
      ))}
    </div>
    <div className="mt-2 rounded-lg border border-line-soft bg-panel px-2.5 py-2">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[8.5px] uppercase tracking-[0.1em] text-faint">budget</span>
        <span className="font-mono text-[9px] text-ink">$184 / $220</span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line-soft">
        <div className="h-full w-[84%] rounded-full bg-accent" />
      </div>
    </div>
    <p className="mt-2 text-[9.5px] leading-snug text-faint">
      Every part has an id, a reason and a requirement.
    </p>
  </GuideFrame>
);

const BoardVisual: React.FC = () => (
  <GuideFrame visual="board">
    <div className="rounded-lg border border-line-soft bg-[#0a0f12] p-2.5 font-mono text-[9.5px] leading-relaxed">
      <p className="text-[#7ce3b0]">[boot] ATmega328P · 16 MHz</p>
      <p className="text-[#9aa9b0]">[serial] t=0.50s LED=1</p>
      <p className="text-[#9aa9b0]">[serial] t=1.00s LED=0</p>
      <p className="text-[#9aa9b0]">[serial] t=1.50s LED=1</p>
      <p className="text-[#7ce3b0]">
        [done] 3 edges <span className="ml-0.5 inline-block h-2.5 w-1 bg-[#7ce3b0]/70 motion-safe:animate-pulse" />
      </p>
    </div>
    <div className="mt-2 flex items-center justify-between">
      <span className="font-mono text-[8.5px] uppercase tracking-[0.1em] text-faint">
        compiled sketch
      </span>
      <span className="rounded bg-emerald/10 px-1.5 py-0.5 font-mono text-[8.5px] text-emerald">
        running
      </span>
    </div>
  </GuideFrame>
);

const TrustVisual: React.FC = () => (
  <GuideFrame visual="trust">
    <div className="space-y-1.5">
      {[
        ['TI DRV8301 datasheet', '200 · 2h ago', true],
        ['STM32 FOC app note', '200 · 2h ago', true],
        ['vendor encoder page', '200 · 6d ago', true],
        ['legacy motor PDF', '404 · 1d ago', false],
      ].map(([name, status, ok]) => (
        <div
          key={name as string}
          className="flex items-center gap-2 rounded-lg border border-line-soft bg-panel px-2.5 py-1.5"
        >
          <CheckCircle2
            className={`h-3 w-3 shrink-0 ${ok ? 'text-emerald' : 'text-rose'}`}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 truncate text-[10px] text-body">{name}</span>
          <span className={`font-mono text-[8.5px] ${ok ? 'text-emerald' : 'text-rose'}`}>
            {status}
          </span>
        </div>
      ))}
    </div>
    <p className="mt-2 font-mono text-[9px] text-faint">Nightly check · the receipt is public.</p>
  </GuideFrame>
);

const StartVisual: React.FC = () => (
  <GuideFrame visual="start">
    <div className="space-y-1.5">
      {[
        ['01', 'Start Here', 'P.1: first program'],
        ['02', 'P.2', 'the next idea'],
        ['03', 'Placement', 'only if you know it'],
      ].map(([number, title, detail]) => (
        <div
          key={number}
          className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 ${
            number === '01' ? 'border-accent/40 bg-accent-soft' : 'border-line-soft bg-panel'
          }`}
        >
          <span className="font-mono text-[10px] font-semibold text-accent">{number}</span>
          <span className="text-[11.5px] font-semibold text-ink">{title}</span>
          <span className="ml-auto text-[9px] text-faint">{detail}</span>
          <ArrowUpRight className="h-3 w-3 text-faint" aria-hidden="true" />
        </div>
      ))}
    </div>
    <p className="mt-2 rounded-lg border border-line-soft bg-panel px-2.5 py-1.5 text-[9.5px] leading-snug text-muted">
      Then one roadmap milestone per sitting. Review keeps it warm.
    </p>
  </GuideFrame>
);

const GuideVisual: React.FC<{ id: GuideVisualId }> = ({ id }) => {
  switch (id) {
    case 'loop':
      return <LoopVisual />;
    case 'roadmap':
      return <RoadmapVisual />;
    case 'placement':
      return <PlacementVisual />;
    case 'lesson':
      return <LessonVisual />;
    case 'checks':
      return <ChecksVisual />;
    case 'calculator':
      return <CalculatorVisual />;
    case 'study':
      return <StudyVisual />;
    case 'micro':
      return <MicroVisual />;
    case 'labs':
      return <LabsVisual />;
    case 'robot':
      return <RobotVisual />;
    case 'hardware':
      return <HardwareVisual />;
    case 'board':
      return <BoardVisual />;
    case 'trust':
      return <TrustVisual />;
    case 'start':
      return <StartVisual />;
    default:
      return null;
  }
};

/**
 * The new-learner guide (`components/LearnerGuide.tsx`).
 *
 * Mounted only while open, from the General settings door (a custom event App listens for). The
 * panel is the shared responsive overlay, so Radix supplies the portal, focus trap, focus return,
 * Escape and scroll lock, and vaul supplies the phone drawer. The content is the guide's own: a
 * step rail, the copy, a drawn instrument panel, and Previous / Next / Turn off.
 *
 * The guide never blocks a tab: an action closes it and takes the learner to the tab it names.
 * Turning it off stores the current step, so the next open resumes there. Finishing stores
 * `completed`; opening it again starts from the top.
 */
export const LearnerGuide: React.FC<{
  onClose: () => void;
  onNavigate: (tab: TabId) => void;
  onWalkthrough: () => void;
}> = ({ onClose, onNavigate, onWalkthrough }) => {
  const [state, setState] = useState<GuideState>(() => resumeGuideState(readGuideState()));
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const step = LEARNER_GUIDE[state.stepIndex] ?? LEARNER_GUIDE[0]!;
  const isLast = state.stepIndex === GUIDE_STEP_COUNT - 1;

  const commit = (next: GuideState) => {
    writeGuideState(next);
    setState(next);
  };

  const close = () => {
    if (state.status !== 'completed') commit(dismissGuideState(state));
    onClose();
  };

  const advance = () => {
    const next = nextGuideState(state);
    writeGuideState(next);
    if (next.status === 'completed') {
      onClose();
      return;
    }
    setState(next);
  };

  const back = () => {
    commit(previousGuideState(state));
  };

  const jump = (index: number) => {
    commit(jumpToGuideStep(state, index));
  };

  const takeAction = () => {
    if (!step.action) return;
    commit(dismissGuideState(state));
    onNavigate(step.action.tab);
    onClose();
  };

  /** The second mode: the same walk, but each stop points at the control it describes. */
  const startWalkthrough = () => {
    commit(dismissGuideState(state));
    onWalkthrough();
    onClose();
  };

  // Keep the copy at the top when the step changes, without pulling focus away from the controls.
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [state.stepIndex]);

  // Arrow keys are the guide's own; Escape belongs to the overlay. The listener is only mounted
  // while the guide is, so it cannot steal an arrow from the editor behind it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') {
        playShortcut('nav', event);
        event.preventDefault();
        advance();
      } else if (event.key === 'ArrowLeft') {
        playShortcut('nav', event);
        event.preventDefault();
        back();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <ResponsiveOverlay
      open
      onOpenChange={(next) => {
        if (!next) close();
      }}
      label="New learner guide"
      testId="learner-guide"
      size="xl"
      initialFocusRef={closeRef}
      bodyClassName="overflow-hidden"
    >
      <div className="relative flex h-[min(82vh,740px)] flex-col overflow-hidden bg-panel text-ink max-sm:h-[min(88dvh,740px)]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              'radial-gradient(75% 55% at 88% 0%, var(--accent-soft), transparent 62%), radial-gradient(50% 40% at 0% 100%, var(--panel-2, var(--canvas)), transparent 70%)',
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />

        {/* A quiet step number in the stage's empty corner: the screen is a walk, not a form, and
            the number is the one piece of scale that belongs in the background. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-16 right-6 hidden select-none font-semibold leading-none lg:block"
          style={{ fontSize: '8.5rem', color: 'var(--text)', opacity: 0.035 }}
        >
          {guideStepNumber(state.stepIndex)}
        </div>

        <header className="relative flex items-center justify-between gap-3 border-b border-line-soft px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-accent/30 bg-accent-soft text-accent">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
                New learner guide
              </p>
              <div
                role="tablist"
                aria-label="Guide mode"
                className="mt-1 flex flex-wrap items-center gap-1"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected
                  data-testid="guide-mode-steps"
                  className="cursor-pointer rounded-full border border-accent/35 bg-accent-soft px-2 py-0.5 font-mono text-[9.5px] font-semibold text-accent"
                >
                  Steps · {GUIDE_STEP_COUNT}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={false}
                  onClick={startWalkthrough}
                  data-testid="guide-mode-walkthrough"
                  className="cursor-pointer rounded-full border border-line-soft px-2 py-0.5 font-mono text-[9.5px] text-muted transition-colors hover:border-accent/40 hover:text-accent"
                >
                  Tooltip walkthrough · {FEATURE_WALKTHROUGH_COUNT}
                </button>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              data-testid="guide-progress"
              className="hidden rounded-full border border-line-soft bg-panel/80 px-2.5 py-1 font-mono text-[10px] text-muted sm:inline"
            >
              {guideStepNumber(state.stepIndex)} / {GUIDE_STEP_COUNT}
            </span>
            <button
              ref={closeRef}
              type="button"
              onClick={close}
              data-testid="guide-close"
              aria-label="Close new learner guide"
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-line-soft bg-panel/80 text-muted transition-colors hover:border-line-strong hover:text-ink"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="relative h-0.5 bg-line-soft md:hidden">
          <div
            className="h-full bg-accent transition-[width] duration-300"
            style={{ width: `${((state.stepIndex + 1) / GUIDE_STEP_COUNT) * 100}%` }}
          />
        </div>

        <div className="relative grid min-h-0 flex-1 md:grid-cols-[13.25rem_minmax(0,1fr)]">
          <nav
            aria-label="Guide steps"
            className="hidden min-h-0 overflow-y-auto border-r border-line-soft px-3 py-4 md:block"
          >
            <p className="px-2 pb-2 font-mono text-[9px] uppercase tracking-[0.16em] text-faint">
              The map
            </p>
            <div className="space-y-0.5">
              {LEARNER_GUIDE.map((entry, index) => {
                const current = index === state.stepIndex;
                const done = index < state.stepIndex;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => jump(index)}
                    aria-current={current ? 'step' : undefined}
                    aria-label={`Step ${index + 1} of ${GUIDE_STEP_COUNT}: ${entry.title}`}
                    data-testid={`guide-step-${index}`}
                    className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
                      current
                        ? 'bg-accent-soft text-ink'
                        : 'text-muted hover:bg-raise hover:text-body'
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[8.5px] ${
                        current
                          ? 'bg-accent text-inverse'
                          : done
                            ? 'border border-emerald/40 text-emerald'
                            : 'border border-line-soft text-faint'
                      }`}
                    >
                      {done ? <Check className="h-2.5 w-2.5" aria-hidden="true" /> : guideStepNumber(index)}
                    </span>
                    <span className={`truncate text-[11.5px] ${current ? 'font-semibold' : ''}`}>
                      {entry.short}
                    </span>
                  </button>
                );
              })}
            </div>
          </nav>

          <div ref={bodyRef} className="min-h-0 overflow-y-auto overscroll-contain">
            <div className="mx-auto grid max-w-5xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-7">
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
                  {step.eyebrow}
                </p>
                <h2
                  data-testid="guide-step-title"
                  className="mt-1.5 text-[clamp(1.45rem,2.3vw,2rem)] font-semibold leading-[1.12] tracking-[-0.02em] text-ink"
                >
                  {step.title}
                </h2>
                <p className="mt-3 max-w-[38rem] text-[13px] leading-6 text-muted">{step.body}</p>
                <ul className="mt-4 space-y-2">
                  {step.points.map((point) => (
                    <li key={point} className="flex gap-2.5 text-[12.5px] leading-5 text-body">
                      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
                {step.action && (
                  <button
                    type="button"
                    onClick={takeAction}
                    data-testid="guide-action"
                    className="mt-5 inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-[12px] font-semibold text-inverse transition-opacity hover:opacity-90"
                  >
                    {step.action.label}
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
              <div className="min-w-0 lg:pt-1">
                <GuideVisual id={step.visual} />
              </div>
            </div>
          </div>
        </div>

        <footer className="relative border-t border-line-soft bg-panel/90 px-4 py-3 backdrop-blur sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={back}
              disabled={state.stepIndex === 0}
              data-testid="guide-prev"
              className="inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-lg border border-line-soft px-2.5 text-[11.5px] font-semibold text-muted transition-colors hover:border-line-strong hover:text-ink disabled:cursor-default disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Previous
            </button>

            <div
              role="progressbar"
              aria-label="Guide progress"
              aria-valuemin={1}
              aria-valuemax={GUIDE_STEP_COUNT}
              aria-valuenow={state.stepIndex + 1}
              className="hidden h-1 max-w-[15rem] flex-1 overflow-hidden rounded-full bg-line-soft sm:block"
            >
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-300"
                style={{ width: `${((state.stepIndex + 1) / GUIDE_STEP_COUNT) * 100}%` }}
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-faint sm:hidden">
                {guideStepNumber(state.stepIndex)} / {GUIDE_STEP_COUNT}
              </span>
              <button
                type="button"
                onClick={advance}
                data-testid="guide-next"
                className="inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-lg bg-accent px-3 text-[11.5px] font-semibold text-inverse transition-opacity hover:opacity-90"
              >
                {isLast ? 'Finish guide' : 'Next'}
                {isLast ? (
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={close}
              data-testid="guide-turn-off"
              className="cursor-pointer text-[10.5px] text-faint underline decoration-line-strong underline-offset-2 transition-colors hover:text-muted"
            >
              Turn off guide
            </button>
            <span className="hidden font-mono text-[9.5px] text-faint sm:inline">
              ← → to move · Esc to close · reopen in General settings
            </span>
          </div>
        </footer>

        <p className="sr-only" aria-live="polite">
          {guideAnnouncement(state.stepIndex)}
        </p>
      </div>
    </ResponsiveOverlay>
  );
};
