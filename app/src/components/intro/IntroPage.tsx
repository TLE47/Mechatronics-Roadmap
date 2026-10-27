import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpenCheck,
  Boxes,
  BrainCircuit,
  ChevronRight,
  CircleDot,
  Cloud,
  Cpu,
  FlaskConical,
  Gauge,
  GitBranch,
  HardDriveDownload,
  ListChecks,
  Lock,
  RotateCcw,
  Sparkles,
  TerminalSquare,
  Waypoints,
  Wrench,
} from 'lucide-react';
import { HeroArm } from '../HeroArm';
import { Diagram } from '../../visuals/Diagram';
import { SCENE_IDS, sceneFor } from '../../visuals/scenes';
import { SPINE, hoursRange, sumHours } from '../../spine';
import { PYTHON_LESSONS } from '../../data/pythonLessonsData';
import type { TabId } from '../../types';
import type { LucideIcon } from 'lucide-react';

export interface IntroPageProps {
  /** The launcher's own registry, so a lab added to the rail appears here with no second list. */
  labs: readonly { id: TabId; label: string; blurb: string }[];
  signedIn: boolean;
  onOpenHome: () => void;
  onOpenWorkbench: () => void;
  onOpenLesson: (id: string) => void;
  onOpenTab: (id: TabId) => void;
}

/**
 * The introduction (`components/intro/IntroPage.tsx`).
 *
 * The workbench answers "where am I now"; this page answers "what is this, and why would I stay".
 * It is the page the wordmark opens, which makes it the one screen a first-time visitor can reach
 * before they have a single flag in the browser — so it may not assume progress, an account, or a
 * lesson already open, and it must not be a gate in front of any of them. Every door on it leads
 * somewhere real: the route steps open the roadmap, the labs open their tab, the lesson cards open
 * that lesson.
 *
 * Nothing here is a screenshot. The arm is the same canvas the capstone tracks (a live 2-DOF
 * inverse-kinematics solve), the trail is `SPINE` — the ten steps the roadmap itself prints — and
 * every figure is a `Diagram` spec from the library the lessons use, so the showcase cannot drift
 * from the thing it is showing. A picture of a course ages; the course's own figures do not.
 *
 * Layout is deliberate: a hero that fits a phone, a route that reads as a path rather than a table,
 * a gallery of four real figures, then the labs, then the small print about where work is kept.
 */
export const IntroPage: React.FC<IntroPageProps> = ({
  labs,
  signedIn,
  onOpenHome,
  onOpenWorkbench,
  onOpenLesson,
  onOpenTab,
}) => {
  const lessonCount = PYTHON_LESSONS.length;
  const startEntry = SPINE[0]?.entries[0] ?? PYTHON_LESSONS[0];
  const totalHours = hoursRange(sumHours(SPINE).total);
  const maxStepHours = Math.max(1, ...SPINE.map((step) => step.hours.total.high));

  const stats = [
    { value: String(SPINE.length), label: 'steps on the route', Icon: Waypoints },
    { value: String(lessonCount), label: 'runnable lessons', Icon: BookOpenCheck },
    { value: String(labs.length), label: 'interactive labs', Icon: FlaskConical },
    { value: String(SCENE_IDS.length), label: 'drawn figures', Icon: GitBranch },
  ];

  return (
    <div data-testid="intro-page" className="intro-root relative overflow-hidden">
      <style>{INTRO_CSS}</style>

      <Hero
        signedIn={signedIn}
        stats={stats}
        totalHours={totalHours}
        onOpenHome={onOpenHome}
        onOpenWorkbench={onOpenWorkbench}
        onOpenLesson={startEntry ? () => onOpenLesson(startEntry.id) : undefined}
      />

      <SectionNav />

      <RouteSection maxStepHours={maxStepHours} onOpenRoute={() => onOpenTab('tab-arch')} />

      <LessonLoop onOpenLesson={startEntry ? () => onOpenLesson(startEntry.id) : undefined} />

      <FigureGallery />

      <LabSection labs={labs} onOpenTab={onOpenTab} />

      <KeptSection />

      <Closing onOpenHome={onOpenHome} onOpenWorkbench={onOpenWorkbench} />
    </div>
  );
};

/* ------------------------------------------------------------------------------------------------
 * The reveal: one observer for the page, not one per card.
 * ---------------------------------------------------------------------------------------------- */

/**
 * A section that rises when it is first seen, and never again.
 *
 * `IntersectionObserver` rather than a scroll listener: a scroll handler on a page with a live arm
 * canvas competes with the frame the arm is drawing, and this page is the first one a slow phone
 * loads. The element is visible by default in CSS and only hidden once the observer has connected, so
 * a browser without the API (or a test with scripting off) reads the whole page instead of a stack of
 * invisible sections.
 */
const Reveal: React.FC<{ children: React.ReactNode; delay?: number; className?: string }> = ({
  children,
  delay = 0,
  className = '',
}) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`intro-reveal ${shown ? 'is-shown' : ''} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
};

/* ------------------------------------------------------------------------------------------------
 * Hero
 * ---------------------------------------------------------------------------------------------- */

const Hero: React.FC<{
  signedIn: boolean;
  stats: { value: string; label: string; Icon: LucideIcon }[];
  totalHours: string;
  onOpenHome: () => void;
  onOpenWorkbench: () => void;
  onOpenLesson?: () => void;
}> = ({ signedIn, stats, totalHours, onOpenHome, onOpenWorkbench, onOpenLesson }) => (
  <section className="relative isolate">
    <div aria-hidden className="intro-hero-glow pointer-events-none absolute inset-0 -z-10" />
    <div aria-hidden className="intro-grid pointer-events-none absolute inset-0 -z-10 opacity-[0.35]" />

    <div className="mx-auto grid max-w-[var(--shell-max)] gap-8 px-4 pb-12 pt-10 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-10 lg:pb-16 lg:pt-14">
      <Reveal>
        <p className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ borderColor: 'var(--border-strong)', color: 'var(--accent)' }}>
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          {signedIn ? 'Welcome back to the bench' : 'An open workbench for mechatronics'}
        </p>

        <h1 className="mt-4 max-w-[18ch] text-[clamp(2.15rem,5.6vw,3.9rem)] font-black leading-[0.98] tracking-[-0.03em]" style={{ color: 'var(--text)' }}>
          Learn the machine by{' '}
          <span className="intro-gradient-text">building the whole loop</span>.
        </h1>

        <p className="mt-4 max-w-[52ch] text-[15.5px] leading-relaxed sm:text-[17px]" style={{ color: 'var(--body)' }}>
          Electronics, sensors, embedded code, control and robotics — one route, ten steps, and a
          workbench where every claim is something you run and check in the browser. Read a page,
          predict the output, run it, read the traceback, pass the checks.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            data-testid="btn-intro-home"
            onClick={onOpenHome}
            className="intro-cta inline-flex items-center gap-2 rounded-[var(--r-md)] px-4 py-2.5 text-[13.5px] font-bold"
          >
            {signedIn ? 'Open Today' : 'Find your next step'}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            data-testid="btn-intro-workbench"
            onClick={onOpenWorkbench}
            className="inline-flex items-center gap-2 rounded-[var(--r-md)] border px-4 py-2.5 text-[13.5px] font-semibold"
            style={{ borderColor: 'var(--border-strong)', color: 'var(--text)' }}
          >
            <TerminalSquare className="h-4 w-4" aria-hidden="true" />
            Enter the workbench
          </button>
          {onOpenLesson && (
            <button
              type="button"
              data-testid="btn-intro-first-lesson"
              onClick={onOpenLesson}
              className="inline-flex items-center gap-1.5 px-1 py-2.5 text-[13px] font-semibold"
              style={{ color: 'var(--accent)' }}
            >
              Or open lesson one
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        <dl className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {stats.map(({ value, label, Icon }) => (
            <div
              key={label}
              className="rounded-[var(--r-md)] border px-3 py-2.5"
              style={{ borderColor: 'var(--border)', backgroundColor: 'color-mix(in srgb, var(--panel) 70%, transparent)' }}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              <dd className="mt-1.5 font-mono text-[22px] font-bold leading-none" style={{ color: 'var(--text)' }}>
                {value}
              </dd>
              <dt className="mt-1 text-[10.5px] leading-tight" style={{ color: 'var(--muted)' }}>
                {label}
              </dt>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-[11px]" style={{ color: 'var(--dim)' }}>
          About {totalHours} of focused work across the route — the lesson pages carry their own estimates.
        </p>
      </Reveal>

      <Reveal delay={90}>
        <div className="intro-arm-card relative overflow-hidden rounded-[var(--r-lg)] border" style={{ borderColor: 'var(--border-strong)', backgroundColor: 'color-mix(in srgb, var(--panel) 92%, transparent)' }}>
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2" style={{ borderColor: 'var(--border)' }}>
            <span className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em]" style={{ color: 'var(--accent)' }}>
              <CircleDot className="h-3 w-3 intro-live" aria-hidden="true" />
              live · 2-DOF inverse kinematics
            </span>
            <span className="font-mono text-[10.5px]" style={{ color: 'var(--dim)' }}>
              L1 0.34 · L2 0.82
            </span>
          </div>
          <HeroArm className="h-[260px] w-full sm:h-[300px] lg:h-[330px]" />
          <div className="grid grid-cols-3 divide-x border-t font-mono text-[10.5px]" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
            {[
              ['target', 'figure-8'],
              ['solve', 'θ₁, θ₂'],
              ['check', 'reach window'],
            ].map(([key, value]) => (
              <div key={key} className="px-3 py-2">
                <p style={{ color: 'var(--dim)' }}>{key}</p>
                <p style={{ color: 'var(--text)' }}>{value}</p>
              </div>
            ))}
          </div>
          <p className="border-t px-3 py-2 text-[11px] leading-snug" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
            This is not a video: the tip chases a Lissajous path and the joints solve for it every frame,
            which is the capstone&apos;s actual claim.
          </p>
        </div>
      </Reveal>
    </div>
  </section>
);

/* ------------------------------------------------------------------------------------------------
 * Section nav
 * ---------------------------------------------------------------------------------------------- */

const SECTIONS = [
  { id: 'intro-route', label: 'The route' },
  { id: 'intro-lesson', label: 'A lesson' },
  { id: 'intro-figures', label: 'The figures' },
  { id: 'intro-labs', label: 'The labs' },
  { id: 'intro-kept', label: 'Your work' },
];

const SectionNav: React.FC = () => (
  <nav
    aria-label="Introduction sections"
    className="mx-auto flex max-w-[var(--shell-max)] flex-wrap items-center gap-1.5 px-4 pb-6 sm:px-6"
  >
    {SECTIONS.map((section) => (
      <a
        key={section.id}
        href={`#${section.id}`}
        className="rounded-full border px-2.5 py-1 text-[11.5px] font-medium no-underline transition-colors"
        style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
      >
        {section.label}
      </a>
    ))}
  </nav>
);

/* ------------------------------------------------------------------------------------------------
 * The route
 * ---------------------------------------------------------------------------------------------- */

const RouteSection: React.FC<{ maxStepHours: number; onOpenRoute: () => void }> = ({
  maxStepHours,
  onOpenRoute,
}) => (
  <section id="intro-route" className="mx-auto max-w-[var(--shell-max)] scroll-mt-24 px-4 py-10 sm:px-6">
    <Reveal>
      <Heading
        eyebrow="The route"
        title="Ten steps, from a voltage divider to a compliant arm"
        blurb="Each step is a checkpoint you can pass, not a chapter you finish. The two on-ramp steps need no maths; from step three the road splits into three depths, and the same step can be taken at the depth you have time for."
      />
    </Reveal>

    <ol className="relative mt-6 space-y-1.5">
      <span aria-hidden className="intro-spine absolute left-[15px] top-2 bottom-2 w-px sm:left-[19px]" />
      {SPINE.map((step, index) => {
        const bar = Math.max(4, Math.round((step.hours.total.high / maxStepHours) * 100));
        const onRamp = step.number <= 2;
        return (
          <li key={step.number}>
            <Reveal delay={Math.min(index * 30, 240)}>
              {/* Every row is a door to the roadmap, not a self-anchor: a link that scrolls to itself
                  looks like a destination and is not one. */}
              <button
                type="button"
                onClick={onOpenRoute}
                data-testid={`intro-step-${step.number}`}
                title={`Open the roadmap at ${step.title}`}
                className="group relative flex w-full items-start gap-3 rounded-[var(--r-md)] border border-transparent px-2 py-2 text-left transition-colors hover:border-[var(--border)] hover:bg-[color-mix(in_srgb,var(--panel)_60%,transparent)] sm:gap-4 sm:px-3"
              >
                <span
                  className="relative z-10 mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border font-mono text-[11px] font-bold sm:h-8 sm:w-8 sm:text-[12px]"
                  style={{
                    borderColor: onRamp ? 'var(--border-strong)' : 'var(--accent)',
                    backgroundColor: 'var(--canvas)',
                    color: onRamp ? 'var(--muted)' : 'var(--accent)',
                  }}
                >
                  {step.number}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <p className="text-[13.5px] font-bold sm:text-[14.5px]" style={{ color: 'var(--text)' }}>
                      {step.title}
                    </p>
                    <span className="font-mono text-[10.5px]" style={{ color: 'var(--dim)' }}>
                      {hoursRange(step.hours.total)} · {step.entries.length} lessons
                    </span>
                  </div>
                  <p className="mt-0.5 max-w-[76ch] text-[12px] leading-snug" style={{ color: 'var(--muted)' }}>
                    {step.outcome}
                  </p>
                  <span aria-hidden className="mt-1.5 block h-1 w-full max-w-[420px] overflow-hidden rounded-full" style={{ backgroundColor: 'var(--line-soft)' }}>
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${bar}%`,
                        background: onRamp
                          ? 'var(--line)'
                          : 'linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 35%, transparent))',
                      }}
                    />
                  </span>
                </div>
                <ChevronRight className="mt-2 h-4 w-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
              </button>
            </Reveal>
          </li>
        );
      })}
    </ol>
    <p className="mt-3 text-[11.5px]" style={{ color: 'var(--dim)' }}>
      Hours are the pages&apos; own focused-work estimates at the arm depth; the bar is relative to the
      longest step, not to your pace.
    </p>
  </section>
);

/* ------------------------------------------------------------------------------------------------
 * A lesson
 * ---------------------------------------------------------------------------------------------- */

const LESSON_STEPS = [
  { label: 'Read', blurb: 'The page, its figures and its maths — beside the editor.', Icon: BookOpenCheck },
  { label: 'Predict', blurb: 'Commit to an output before you run. Wrong is useful data.', Icon: BrainCircuit },
  { label: 'Run', blurb: 'Real Python in a worker. No server, no install.', Icon: TerminalSquare },
  { label: 'Diagnose', blurb: 'A traceback card names the fault and the check it fails.', Icon: Wrench },
  { label: 'Verify', blurb: 'Behaviour, output and the instructor checks, all three.', Icon: ListChecks },
  { label: 'Review', blurb: 'The passage you marked comes back as a card, on its day.', Icon: RotateCcw },
];

const LessonLoop: React.FC<{ onOpenLesson?: () => void }> = ({ onOpenLesson }) => {
  const loop = useMemo(() => sceneFor('debug-loop'), []);
  const timing = useMemo(() => sceneFor('step-response'), []);
  return (
    <section id="intro-lesson" className="scroll-mt-24 border-y py-10" style={{ borderColor: 'var(--border)', backgroundColor: 'color-mix(in srgb, var(--panel) 45%, transparent)' }}>
      <div className="mx-auto max-w-[var(--shell-max)] px-4 sm:px-6">
        <Reveal>
          <Heading
            eyebrow="A lesson"
            title="Six moves, and then it is yours"
            blurb="The loop is the same in lesson one and in the capstone: the checks change, the moves do not. Nothing is graded by watching you — a run either meets the contract or it does not."
          />
        </Reveal>

        <Reveal delay={60}>
          <ol className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {LESSON_STEPS.map(({ label, blurb, Icon }, index) => (
              <li
                key={label}
                className="intro-lift relative rounded-[var(--r-md)] border px-3 py-3"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--panel)' }}
              >
                <span className="absolute right-2.5 top-2 font-mono text-[10px]" style={{ color: 'var(--dim)' }}>
                  0{index + 1}
                </span>
                <Icon className="h-4 w-4" aria-hidden="true" style={{ color: 'var(--accent)' }} />
                <p className="mt-1.5 text-[13px] font-bold" style={{ color: 'var(--text)' }}>
                  {label}
                </p>
                <p className="mt-0.5 text-[11.5px] leading-snug" style={{ color: 'var(--muted)' }}>
                  {blurb}
                </p>
              </li>
            ))}
          </ol>
        </Reveal>

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {loop && (
            <Reveal delay={90}>
              <div className="rounded-[var(--r-lg)] border p-3" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--canvas)' }}>
                <Diagram id="intro-debug-loop" spec={loop} />
              </div>
            </Reveal>
          )}
          {timing && (
            <Reveal delay={140}>
              <div className="rounded-[var(--r-lg)] border p-3" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--canvas)' }}>
                <Diagram id="intro-step-response" spec={timing} />
              </div>
            </Reveal>
          )}
        </div>

        {onOpenLesson && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onOpenLesson}
              data-testid="btn-intro-try-lesson"
              className="inline-flex items-center gap-2 rounded-[var(--r-md)] border px-3 py-2 text-[12.5px] font-semibold"
              style={{ borderColor: 'var(--border-strong)', color: 'var(--text)' }}
            >
              Try the first one
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <p className="text-[11.5px]" style={{ color: 'var(--dim)' }}>
              No sign-in, no install: the runner and its checks are in this page.
            </p>
          </div>
        )}
      </div>
    </section>
  );
};

/* ------------------------------------------------------------------------------------------------
 * Figures
 * ---------------------------------------------------------------------------------------------- */

const GALLERY: { id: string; why: string; Icon: LucideIcon }[] = [
  { id: 'signal-chain', why: 'Every stage in a sensor path, and the unit that leaves it.', Icon: Gauge },
  { id: 'arm-kinematics', why: 'Two links, one target: the triangle the solver closes.', Icon: Boxes },
  { id: 'kalman-step', why: 'Predict, measure, correct — the estimate moves, not the code.', Icon: BrainCircuit },
  { id: 'bode-margins', why: 'Gain and phase, and where the loop stops being stable.', Icon: GitBranch },
  { id: 'ros-graph', why: 'Nodes, topics and the wire between them.', Icon: Waypoints },
  { id: 'three-phase', why: 'Three windings, one rotating field.', Icon: Cpu },
];

const FigureGallery: React.FC = () => (
  <section id="intro-figures" className="mx-auto max-w-[var(--shell-max)] scroll-mt-24 px-4 py-10 sm:px-6">
    <Reveal>
      <Heading
        eyebrow="The figures"
        title={`${SCENE_IDS.length} diagrams, drawn from data`}
        blurb="A page does not ship a screenshot: it names a figure, and the figure is drawn by the app's own library in the theme you chose. Every one can be opened full screen, which is what a wall of prose needed all along."
      />
    </Reveal>

    <div className="mt-6 grid gap-3 md:grid-cols-2">
      {GALLERY.map(({ id, why, Icon }, index) => {
        const spec = sceneFor(id);
        if (!spec) return null;
        return (
          <Reveal key={id} delay={Math.min(index * 40, 200)}>
            <div
              data-testid={`intro-figure-${id}`}
              className="intro-lift flex h-full flex-col rounded-[var(--r-lg)] border p-3"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--canvas)' }}
            >
              {/* No `id` on the figure itself: at 768 the header's own id label and the Expand
                  button together ran off the card. The anchor lives on the wrapper instead. */}
              <Diagram spec={spec} />
              <p className="mt-2 flex items-start gap-1.5 text-[11.5px] leading-snug" style={{ color: 'var(--muted)' }}>
                <Icon className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" style={{ color: 'var(--accent)' }} />
                {why}
              </p>
            </div>
          </Reveal>
        );
      })}
    </div>
  </section>
);

/* ------------------------------------------------------------------------------------------------
 * Labs
 * ---------------------------------------------------------------------------------------------- */

const LabSection: React.FC<{
  labs: readonly { id: TabId; label: string; blurb: string }[];
  onOpenTab: (id: TabId) => void;
}> = ({ labs, onOpenTab }) => (
  <section id="intro-labs" className="scroll-mt-24 border-y py-10" style={{ borderColor: 'var(--border)', backgroundColor: 'color-mix(in srgb, var(--panel) 45%, transparent)' }}>
    <div className="mx-auto max-w-[var(--shell-max)] px-4 sm:px-6">
      <Reveal>
        <Heading
          eyebrow="The labs"
          title={`${labs.length} benches, all running in this tab`}
          blurb="A vibration filter, a field-oriented motor drive, a pendulum with safety walls, a six-layer PCB stackup, an IMU fusion loop, an Arduino emulator. Pick one — it is already installed."
        />
      </Reveal>

      <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {labs.map((lab, index) => (
          <Reveal key={lab.id} delay={Math.min(index * 25, 220)}>
            <button
              type="button"
              data-testid={`intro-lab-${lab.id}`}
              onClick={() => onOpenTab(lab.id)}
              className="intro-lift group flex h-full w-full items-start gap-2.5 rounded-[var(--r-md)] border px-3 py-2.5 text-left"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--canvas)' }}
            >
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded border" style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}>
                <FlaskConical className="h-3 w-3" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[12.5px] font-semibold" style={{ color: 'var(--text)' }} title={lab.label}>
                  {lab.label}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug" style={{ color: 'var(--muted)' }}>
                  {lab.blurb}
                </span>
              </span>
              <ArrowRight className="ml-auto mt-1 h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
            </button>
          </Reveal>
        ))}
      </div>
    </div>
  </section>
);

/* ------------------------------------------------------------------------------------------------
 * Where the work is kept
 * ---------------------------------------------------------------------------------------------- */

const KEPT = [
  { title: 'In this browser', blurb: 'Progress, drafts, notes and the log live in IndexedDB — no account needed, no network call on a lesson.', Icon: HardDriveDownload },
  { title: 'One file out', blurb: 'A backup is a .zip of everything you did, and restoring it merges rather than overwrites.', Icon: Lock },
  { title: 'If you sign in', blurb: 'The route flags follow you to another machine; a reset leaves a watermark so a merge cannot put them back.', Icon: Cloud },
  { title: 'Erase by part', blurb: 'Reset one lesson, one day of the log, one award — not the whole browser history to fix one mistake.', Icon: RotateCcw },
];

const KeptSection: React.FC = () => (
  <section id="intro-kept" className="mx-auto max-w-[var(--shell-max)] scroll-mt-24 px-4 py-10 sm:px-6">
    <Reveal>
      <Heading
        eyebrow="Your work"
        title="Yours, and portable"
        blurb="A self-paced course should not hold your notes hostage. Everything here can leave, arrive, and be erased a piece at a time."
      />
    </Reveal>
    <div className="mt-6 grid gap-2 sm:grid-cols-2">
      {KEPT.map(({ title, blurb, Icon }, index) => (
        <Reveal key={title} delay={index * 40}>
          <div
            className="flex h-full items-start gap-2.5 rounded-[var(--r-md)] border px-3 py-3"
            style={{ borderColor: 'var(--border)', backgroundColor: 'color-mix(in srgb, var(--panel) 70%, transparent)' }}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" style={{ color: 'var(--emerald)' }} />
            <div>
              <p className="text-[12.5px] font-bold" style={{ color: 'var(--text)' }}>
                {title}
              </p>
              <p className="mt-0.5 text-[11.5px] leading-snug" style={{ color: 'var(--muted)' }}>
                {blurb}
              </p>
            </div>
          </div>
        </Reveal>
      ))}
    </div>
  </section>
);

/* ------------------------------------------------------------------------------------------------
 * Closing
 * ---------------------------------------------------------------------------------------------- */

const Closing: React.FC<{ onOpenHome: () => void; onOpenWorkbench: () => void }> = ({
  onOpenHome,
  onOpenWorkbench,
}) => (
  <section className="mx-auto max-w-[var(--shell-max)] px-4 pb-14 pt-2 sm:px-6">
    <Reveal>
      <div className="intro-closing relative overflow-hidden rounded-[var(--r-lg)] border px-4 py-8 text-center sm:px-8 sm:py-10" style={{ borderColor: 'var(--border-strong)' }}>
        <p className="font-mono text-[10.5px] uppercase tracking-[0.2em]" style={{ color: 'var(--accent)' }}>
          Start with one page
        </p>
        <h2 className="mx-auto mt-2 max-w-[26ch] text-[clamp(1.5rem,3.4vw,2.3rem)] font-black leading-tight tracking-[-0.02em]" style={{ color: 'var(--text)' }}>
          The route is long. The next step is not.
        </h2>
        <p className="mx-auto mt-2 max-w-[58ch] text-[13px] leading-relaxed" style={{ color: 'var(--body)' }}>
          Everything you need for the first lesson is already in the tab: the page, the editor, the
          checks, and a note box for the sentence that finally makes it click.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          <button
            type="button"
            data-testid="btn-intro-closing-home"
            onClick={onOpenHome}
            className="intro-cta inline-flex items-center gap-2 rounded-[var(--r-md)] px-4 py-2.5 text-[13.5px] font-bold"
          >
            See what is next
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onOpenWorkbench}
            className="inline-flex items-center gap-2 rounded-[var(--r-md)] border px-4 py-2.5 text-[13.5px] font-semibold"
            style={{ borderColor: 'var(--border-strong)', color: 'var(--text)' }}
          >
            <TerminalSquare className="h-4 w-4" aria-hidden="true" />
            Open the workbench
          </button>
        </div>
      </div>
    </Reveal>
  </section>
);

/* ------------------------------------------------------------------------------------------------
 * A heading, once, so five sections cannot drift apart.
 * ---------------------------------------------------------------------------------------------- */

const Heading: React.FC<{ eyebrow: string; title: string; blurb: string }> = ({ eyebrow, title, blurb }) => (
  <div>
    <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--accent)' }}>
      {eyebrow}
    </p>
    <h2 className="mt-1.5 max-w-[34ch] text-[clamp(1.35rem,3vw,2.05rem)] font-black leading-[1.1] tracking-[-0.02em]" style={{ color: 'var(--text)' }}>
      {title}
    </h2>
    <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed sm:text-[13.5px]" style={{ color: 'var(--muted)' }}>
      {blurb}
    </p>
  </div>
);

/* ------------------------------------------------------------------------------------------------
 * The page's own CSS: scoped, and all of it switched off by a reduced-motion preference.
 * ---------------------------------------------------------------------------------------------- */

const INTRO_CSS = `
.intro-reveal { opacity: 1; transform: none; }
.intro-reveal { transition: opacity 520ms ease, transform 520ms cubic-bezier(0.22, 0.61, 0.36, 1); }
.intro-reveal:not(.is-shown) { opacity: 0; transform: translateY(14px); }
.intro-gradient-text {
  background: linear-gradient(100deg, var(--accent) 0%, color-mix(in srgb, var(--accent) 55%, var(--emerald, #34d399)) 60%, var(--accent) 100%);
  background-size: 220% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: intro-sheen 9s ease-in-out infinite;
}
.intro-hero-glow {
  background:
    radial-gradient(60% 55% at 18% 8%, color-mix(in srgb, var(--accent) 18%, transparent) 0%, transparent 70%),
    radial-gradient(45% 50% at 88% 22%, color-mix(in srgb, var(--accent) 10%, transparent) 0%, transparent 72%),
    radial-gradient(40% 40% at 60% 100%, color-mix(in srgb, var(--amber) 8%, transparent) 0%, transparent 70%);
}
.intro-grid {
  background-image:
    linear-gradient(to right, color-mix(in srgb, var(--border) 55%, transparent) 1px, transparent 1px),
    linear-gradient(to bottom, color-mix(in srgb, var(--border) 55%, transparent) 1px, transparent 1px);
  background-size: 44px 44px;
  mask-image: radial-gradient(72% 62% at 50% 30%, #000 20%, transparent 78%);
  -webkit-mask-image: radial-gradient(72% 62% at 50% 30%, #000 20%, transparent 78%);
}
.intro-spine {
  background: linear-gradient(to bottom, transparent, var(--border-strong) 8%, var(--border-strong) 92%, transparent);
}
.intro-lift { transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease; }
.intro-lift:hover { transform: translateY(-2px); border-color: var(--border-strong); box-shadow: 0 10px 26px -18px color-mix(in srgb, #000 70%, transparent); }
.intro-cta {
  border: 1px solid var(--accent);
  background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 92%, #fff) 0%, var(--accent) 100%);
  color: var(--inverse, #04121d);
  cursor: pointer;
  box-shadow: 0 8px 22px -12px color-mix(in srgb, var(--accent) 80%, transparent);
  transition: transform 160ms ease, filter 160ms ease;
}
.intro-cta:hover { filter: brightness(1.06); transform: translateY(-1px); }
.intro-cta:active { transform: translateY(0); }
.intro-arm-card { box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 6%, transparent), 0 28px 60px -40px color-mix(in srgb, var(--accent) 60%, #000); }
.intro-closing {
  background:
    radial-gradient(75% 120% at 50% 0%, color-mix(in srgb, var(--accent) 14%, transparent) 0%, transparent 70%),
    color-mix(in srgb, var(--panel) 85%, transparent);
}
.intro-live { animation: intro-pulse 2.6s ease-in-out infinite; }
@keyframes intro-sheen { 0%, 100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
@keyframes intro-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
@media print {
  .intro-reveal, .intro-reveal:not(.is-shown) { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  .intro-reveal, .intro-reveal:not(.is-shown) { opacity: 1; transform: none; transition: none; }
  .intro-gradient-text { animation: none; background: var(--accent); -webkit-background-clip: text; background-clip: text; }
  .intro-lift, .intro-cta { transition: none; }
  .intro-lift:hover, .intro-cta:hover { transform: none; }
  .intro-live { animation: none; }
}
`;
