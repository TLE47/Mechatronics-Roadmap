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
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  TerminalSquare,
  Waypoints,
  Wrench,
} from 'lucide-react';
import { HeroArm } from '../HeroArm';
import { Diagram } from '../../visuals/Diagram';
import { SCENE_IDS, sceneFor } from '../../visuals/scenes';
import type { DiagramSpec } from '../../visuals/scenes';
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

  // Playing is the default, because movement is what this page is *for* — a still introduction is a
  // wall of pictures. A press stills it and the next visit remembers, and the control stays on the
  // section row where it is seen rather than buried. It deliberately does not start from
  // `prefers-reduced-motion`: that setting would leave the one page made of moving diagrams frozen
  // for every reader whose OS asks for less motion, and the Pause button is the better answer.
  const [motion, setMotion] = useState<boolean>(() => readStoredMotion() ?? true);
  const toggleMotion = () => {
    setMotion((on) => {
      const next = !on;
      try {
        window.localStorage.setItem(MOTION_KEY, next ? 'on' : 'off');
      } catch {
        // A browser that refuses storage still gets the switch for this visit.
      }
      return next;
    });
  };

  return (
    <MotionContext.Provider value={motion}>
      <div
        data-testid="intro-page"
        data-motion={motion ? 'on' : 'off'}
        className="intro-root relative overflow-hidden"
      >
      <style>{INTRO_CSS}</style>

      <Hero
        signedIn={signedIn}
        stats={stats}
        motion={motion}
        totalHours={totalHours}
        onOpenHome={onOpenHome}
        onOpenWorkbench={onOpenWorkbench}
        onOpenLesson={startEntry ? () => onOpenLesson(startEntry.id) : undefined}
      />

      <SectionNav motion={motion} onToggleMotion={toggleMotion} />

      <RouteSection maxStepHours={maxStepHours} onOpenRoute={() => onOpenTab('tab-arch')} />

      <LessonLoop onOpenLesson={startEntry ? () => onOpenLesson(startEntry.id) : undefined} />

      <FigureGallery />

      <LabSection labs={labs} onOpenTab={onOpenTab} />

      <KeptSection />

      <Closing onOpenHome={onOpenHome} onOpenWorkbench={onOpenWorkbench} />
      </div>
    </MotionContext.Provider>
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

/**
 * Whether this page animates.
 *
 * The page plays unless the visitor has pressed Pause: a **play/pause** control sits at the end of
 * the section row, the choice is remembered, and both halves obey it — the CSS half through the
 * root's `data-motion` attribute (`INTRO_CSS`), every scripted half through this context. A reader
 * who wants stillness gets one press, and it survives the next visit.
 */
const MOTION_KEY = 'mechalab_intro_motion_v1';
const MotionContext = React.createContext(true);
const useMotion = (): boolean => React.useContext(MotionContext);

function readStoredMotion(): boolean | null {
  try {
    const stored = window.localStorage.getItem(MOTION_KEY);
    return stored === 'on' ? true : stored === 'off' ? false : null;
  } catch {
    return null;
  }
}


/**
 * A number that counts up once, when it is seen.
 *
 * The values are the page's own arithmetic (SPINE's length, the registry's size), so the animation is
 * never a number appearing before its source is ready: the target is fixed and the frames only
 * approach it. Reduced motion jumps straight to the value rather than making the page wait 900 ms.
 */
const CountUp: React.FC<{ value: number; className?: string }> = ({ value, className }) => {
  const motion = useMotion();
  const ref = useRef<HTMLSpanElement | null>(null);
  const [shown, setShown] = useState(() => (motion ? 0 : value));

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (!motion || typeof IntersectionObserver === 'undefined') {
      setShown(value);
      return;
    }
    let raf = 0;
    let started = 0;
    const tick = (now: number) => {
      if (!started) started = now;
      const progress = Math.min(1, (now - started) / 850);
      setShown(Math.round(value * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.5 }
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, motion]);

  return (
    <span ref={ref} className={className}>
      {shown}
    </span>
  );
};

/** Whether an element is on screen, with one observer and no re-render per scroll event. */
function useOnScreen<T extends HTMLElement>(
  ref: React.RefObject<T | null>,
  margin = '0px 0px -10% 0px'
): boolean {
  const [onScreen, setOnScreen] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setOnScreen(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => setOnScreen(entries.some((entry) => entry.isIntersecting)),
      { rootMargin: margin, threshold: 0.05 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, margin]);
  return onScreen;
}

/**
 * How far the route list has travelled through the viewport, 0..1.
 *
 * The dot on the spine is the page's one scroll-linked element: it says "you are here" on a ten-step
 * path, which is the question the route is answering. Updated inside rAF so a scroll never paints
 * twice, and only while the list is on screen. Reduced motion leaves it still.
 */
function useRouteProgress(ref: React.RefObject<HTMLOListElement | null>, motion: boolean): number | null {
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (!motion) {
      setProgress(null);
      return;
    }
    let raf = 0;
    const update = () => {
      raf = 0;
      const rect = node.getBoundingClientRect();
      const travel = rect.height + window.innerHeight * 0.5;
      const passed = window.innerHeight * 0.55 - rect.top;
      setProgress(Math.min(1, Math.max(0, passed / Math.max(1, travel))));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [ref, motion]);

  return progress;
}

/**
 * A little pointer parallax, for a mouse and nothing else.
 *
 * It is the one interaction a touch screen cannot offer, so it is gated on `(pointer: fine)` and on
 * reduced motion rather than being made to work everywhere. The card keeps its layout: only a 3D
 * rotation rides on top, and it returns to flat the moment the pointer leaves.
 */
const Tilt: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => {
  const motion = useMotion();
  const ref = useRef<HTMLDivElement | null>(null);
  const [transform, setTransform] = useState('');

  useEffect(() => {
    const node = ref.current;
    if (!node || !motion) return;
    let fine = false;
    try {
      fine = window.matchMedia('(pointer: fine)').matches;
    } catch {
      fine = false;
    }
    if (!fine) return;
    const move = (event: PointerEvent) => {
      const rect = node.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      setTransform(`perspective(900px) rotateX(${(-y * 3.5).toFixed(2)}deg) rotateY(${(x * 4).toFixed(2)}deg) scale(1.012)`);
    };
    const leave = () => setTransform('');
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerleave', leave);
    return () => {
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerleave', leave);
    };
  }, [motion]);

  return (
    <div
      ref={ref}
      className={`intro-tilt ${className}`}
      style={transform ? { transform } : undefined}
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
  motion: boolean;
  onOpenHome: () => void;
  onOpenWorkbench: () => void;
  onOpenLesson?: () => void;
}> = ({ signedIn, stats, totalHours, motion, onOpenHome, onOpenWorkbench, onOpenLesson }) => (
  <section className="relative isolate">
    <div aria-hidden className="intro-hero-glow pointer-events-none absolute inset-0 -z-10" />
    <div aria-hidden className="intro-grid pointer-events-none absolute inset-0 -z-10 opacity-[0.35]" />

    <div className="mx-auto grid max-w-[var(--shell-max)] gap-8 px-4 pb-12 pt-10 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-10 lg:pb-16 lg:pt-14">
      <Reveal>
        <p className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ borderColor: 'var(--border-strong)', color: 'var(--accent)' }}>
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          {signedIn ? 'Welcome back to the bench' : 'An open workbench for mechatronics'}
        </p>

        <h1
          className="font-display mt-4 max-w-[18ch] text-[clamp(2.15rem,5.6vw,4.05rem)] leading-[0.98]"
          style={{ color: 'var(--text)' }}
        >
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
          {stats.map(({ value, label, Icon }, index) => (
            <div
              key={label}
              className="intro-stat rounded-[var(--r-md)] border px-3 py-2.5"
              style={{
                borderColor: 'var(--border)',
                backgroundColor: 'color-mix(in srgb, var(--panel) 70%, transparent)',
                ['--stat-delay' as string]: `${index * 0.55}s`,
              }}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              <dd className="mt-1.5 font-mono text-[22px] font-bold leading-none tabular-nums" style={{ color: 'var(--text)' }}>
                <CountUp value={Number(value)} />
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
          {/* `clamp` on `dvh`, not a fixed height: a phone's address bar changes the viewport as it
              retracts, and the arm should take the room it has rather than a number chosen on a
              desktop. */}
          <HeroArm motion={motion} className="h-[clamp(220px,38dvh,340px)] w-full" />
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

/**
 * The five chips, with the one you are reading filled in.
 *
 * A list of anchors is a table of contents; a list that updates is an instrument showing where the
 * page is. The reading line is a third of the way down the viewport, the same anchor the route's
 * marker uses, so the two never disagree about which section you are in. rAF-throttled, one passive
 * scroll listener, and no observation of the sections themselves.
 */
const SectionNav: React.FC<{ motion: boolean; onToggleMotion: () => void }> = ({
  motion,
  onToggleMotion,
}) => {
  // Nothing is active before the first section reaches the reading line: a chip lit while the
  // hero is still on screen would say the reader is somewhere they have not scrolled to.
  const [active, setActive] = useState<string>('');

  useEffect(() => {
    const nodes = SECTIONS.map((section) => document.getElementById(section.id)).filter(
      (node): node is HTMLElement => !!node
    );
    if (!nodes.length) return;
    let frame = 0;
    const pick = () => {
      frame = 0;
      const line = window.innerHeight * 0.34;
      let next = '';
      for (const node of nodes) {
        if (node.getBoundingClientRect().top <= line) next = node.id;
      }
      setActive(next);
    };
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(pick);
    };
    pick();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="mx-auto flex max-w-[var(--shell-max)] flex-wrap items-center gap-2 px-4 pb-6 sm:px-6">
    <nav aria-label="Introduction sections" className="flex flex-wrap items-center gap-1.5">
      {SECTIONS.map((section) => {
        const on = section.id === active;
        return (
          <a
            key={section.id}
            href={`#${section.id}`}
            data-testid={`intro-nav-${section.id}`}
            aria-current={on ? 'location' : undefined}
            className="intro-nav-chip rounded-full border px-2.5 py-1 text-[11.5px] font-medium no-underline transition-colors"
            style={{
              borderColor: on ? 'color-mix(in srgb, var(--accent) 45%, var(--border))' : 'var(--border)',
              backgroundColor: on ? 'var(--accent-soft)' : 'transparent',
              color: on ? 'var(--accent)' : 'var(--muted)',
            }}
          >
            {section.label}
          </a>
        );
      })}
    </nav>
    {/* The one control that explains a still page. It is here rather than in the header because
        motion is this page's property, not the app's — a lesson should never animate its prose. */}
    <button
      type="button"
      data-testid="btn-intro-motion"
      aria-pressed={motion}
      onClick={onToggleMotion}
      title={motion ? 'Animations are playing on this page — press to still them' : 'Animations are paused on this page — press to play them'}
      className="intro-nav-chip ml-auto inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium"
      style={{
        borderColor: motion ? 'color-mix(in srgb, var(--accent) 45%, var(--border))' : 'var(--border)',
        backgroundColor: motion ? 'var(--accent-soft)' : 'transparent',
        color: motion ? 'var(--accent)' : 'var(--muted)',
      }}
    >
      {motion ? <Pause className="h-3 w-3" aria-hidden="true" /> : <Play className="h-3 w-3" aria-hidden="true" />}
      {motion ? 'Motion on' : 'Play motion'}
    </button>
    </div>
  );
};

/* ------------------------------------------------------------------------------------------------
 * The route
 * ---------------------------------------------------------------------------------------------- */

const RouteSection: React.FC<{ maxStepHours: number; onOpenRoute: () => void }> = ({
  maxStepHours,
  onOpenRoute,
}) => {
  const motion = useMotion();
  const listRef = useRef<HTMLOListElement | null>(null);
  const progress = useRouteProgress(listRef, motion);

  return (
  <section id="intro-route" className="mx-auto max-w-[var(--shell-max)] scroll-mt-24 px-4 py-10 sm:px-6">
    <Reveal>
      <Heading
        eyebrow="The route"
        title="Ten steps, from a voltage divider to a compliant arm"
        blurb="Each step is a checkpoint you can pass, not a chapter you finish. The two on-ramp steps need no maths; from step three the road splits into three depths, and the same step can be taken at the depth you have time for."
      />
    </Reveal>

    <ol ref={listRef} className="relative mt-6 space-y-1.5">
      <span aria-hidden className="intro-spine absolute left-[15px] top-2 bottom-2 w-px sm:left-[19px]" />
      {progress !== null && (
        <span
          aria-hidden
          data-testid="intro-route-traveller"
          className="intro-traveller"
          style={{ top: `calc(8px + ${(progress * 100).toFixed(1)}% * 0.94)` }}
        />
      )}
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
                      className="intro-bar block h-full rounded-full"
                      style={{
                        width: `${bar}%`,
                        transitionDelay: `${Math.min(index * 40, 320)}ms`,
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
};

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
                className="intro-lift intro-loop-step relative rounded-[var(--r-md)] border px-3 py-3"
                style={{
                  borderColor: 'var(--border)',
                  backgroundColor: 'var(--panel)',
                  // The six moves are one cycle, so the six cards light on the same beat the debug
                  // loop below them runs: a step every 1.15 s, then back to the first.
                  ['--i' as string]: String(index),
                }}
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
                <LiveFigure spec={loop} mode="flow" />
              </div>
            </Reveal>
          )}
          {timing && (
            <Reveal delay={140}>
              <div className="rounded-[var(--r-lg)] border p-3" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--canvas)' }}>
                <LiveFigure spec={timing} mode="sweep" />
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

type LiveMode = 'flow' | 'sweep' | 'wave';

/**
 * A figure that moves, using the real drawing rather than an illustration of one.
 *
 * The library's figures are stills because a lesson page should not animate beside prose. The
 * introduction is the one place where the drawing has to demonstrate itself, so this wrapper
 * animates the SVG the library already produced — no second copy of the picture, nothing that can
 * drift from what a lesson shows:
 *
 * - **`flow`** walks a workflow: each box's border lights in turn (`.intro-step`, offset by
 *   `--i`) while its connectors run marching dashes (`.intro-edge`), so a chain reads as signal
 *   moving rather than a row of labels.
 * - **`sweep`** draws a graph the way an oscilloscope writes it: every solid series is revealed
 *   from left to right against its own length, a bright dot rides the leading edge, and a scan
 *   line marks where the pen is. The data is untouched — the same points the lesson prints.
 *
 * Both are driven from the page's DOM, after mount, and stop when the figure leaves the screen.
 * Reduced motion never reaches this code (and the CSS half is switched off in `INTRO_CSS`), so the
 * figures stay still for a reader who asked for that.
 */
const LiveFigure: React.FC<{ spec: DiagramSpec; mode: LiveMode; className?: string }> = ({
  spec,
  mode,
  className = '',
}) => {
  const motion = useMotion();
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const box = boxRef.current;
    if (!box || !motion) return;
    // The drawing, not the Expand button's icon: both are `<svg>`, and annotating the icon would
    // quietly animate nothing.
    const svg = box.querySelector('.figure-art > svg') ?? box.querySelector('svg[role="img"]');
    if (!svg) return;

    if (mode === 'flow') {
      // `rx` 8 is a `Box` (chain, loop); 7 is a `Graph` node. Both are drawn as a rect inside its
      // own group, which is why the parent is what gets the state class.
      const nodes = [...svg.querySelectorAll('g > rect[rx="8"], g > rect[rx="7"]')]
        .map((rect) => rect.parentElement)
        .filter((node): node is HTMLElement => !!node && node.tagName.toLowerCase() === 'g');
      nodes.forEach((node, index) => {
        node.classList.add('intro-step');
        node.style.setProperty('--i', String(index));
      });
      const edges = [...svg.querySelectorAll('line[marker-end]')] as SVGLineElement[];
      edges.forEach((edge) => edge.classList.add('intro-edge'));

      // A packet per connector: the thing that makes a diagram look like it is running rather than
      // drawn. It travels the line the figure already has, so the route it takes is the figure's
      // own arrow, not a second path that could point somewhere else.
      const ns = 'http://www.w3.org/2000/svg';
      const packets = edges.map((edge, index) => {
        const dot = document.createElementNS(ns, 'circle');
        dot.setAttribute('r', '2.4');
        dot.setAttribute('fill', 'var(--accent)');
        dot.setAttribute('data-intro-packet', 'true');
        svg.append(dot);
        return {
          dot,
          x1: Number(edge.getAttribute('x1') ?? 0),
          y1: Number(edge.getAttribute('y1') ?? 0),
          x2: Number(edge.getAttribute('x2') ?? 0),
          y2: Number(edge.getAttribute('y2') ?? 0),
          offset: index * 0.23,
        };
      });

      let raf = 0;
      let visible = true;
      const CYCLE = 1500;
      const travel = (now: number) => {
        raf = 0;
        if (!visible) return;
        packets.forEach((packet) => {
          const fraction = ((now / CYCLE + packet.offset) % 1 + 1) % 1;
          packet.dot.setAttribute('cx', (packet.x1 + (packet.x2 - packet.x1) * fraction).toFixed(2));
          packet.dot.setAttribute('cy', (packet.y1 + (packet.y2 - packet.y1) * fraction).toFixed(2));
          // Invisible at the ends, so a wrap does not read as a dot jumping backwards.
          packet.dot.style.opacity = fraction < 0.08 || fraction > 0.92 ? '0' : '1';
        });
        raf = requestAnimationFrame(travel);
      };
      const observer =
        typeof IntersectionObserver === 'undefined'
          ? null
          : new IntersectionObserver((entries) => {
              const next = entries.some((entry) => entry.isIntersecting);
              if (next === visible) return;
              visible = next;
              if (next && !raf) raf = requestAnimationFrame(travel);
            });
      observer?.observe(svg);
      raf = requestAnimationFrame(travel);

      return () => {
        observer?.disconnect();
        if (raf) cancelAnimationFrame(raf);
        nodes.forEach((node) => node.classList.remove('intro-step'));
        edges.forEach((edge) => edge.classList.remove('intro-edge'));
        packets.forEach((packet) => packet.dot.remove());
      };
    }

    // Wave. A periodic plot (three currents over one electrical revolution) is scrolled through
    // its own period: every series is duplicated one plot-width to the right and both copies are
    // clipped to the plot, so the animation wraps at the seam of a figure whose data wraps there
    // too. No data is changed — it is the same drawing, moving.
    if (mode === 'wave') {
      const series = [...svg.querySelectorAll('path[fill="none"]')] as SVGPathElement[];
      if (!series.length) return;
      const boxes = series.map((path) => path.getBBox());
      const bounds = {
        x: Math.min(...boxes.map((box) => box.x)),
        y: Math.min(...boxes.map((box) => box.y)),
        right: Math.max(...boxes.map((box) => box.x + box.width)),
        bottom: Math.max(...boxes.map((box) => box.y + box.height)),
      };
      const ns = 'http://www.w3.org/2000/svg';
      const clipId = `intro-wave-${Math.random().toString(36).slice(2)}`;
      const defs = document.createElementNS(ns, 'defs');
      const clip = document.createElementNS(ns, 'clipPath');
      clip.setAttribute('id', clipId);
      const clipRect = document.createElementNS(ns, 'rect');
      clipRect.setAttribute('x', String(bounds.x));
      clipRect.setAttribute('y', String(bounds.y));
      clipRect.setAttribute('width', String(bounds.right - bounds.x));
      clipRect.setAttribute('height', String(bounds.bottom - bounds.y));
      clip.append(clipRect);
      defs.append(clip);
      svg.prepend(defs);

      const width = bounds.right - bounds.x;
      const pairs = series.map((path) => {
        path.setAttribute('clip-path', `url(#${clipId})`);
        const clone = path.cloneNode() as SVGPathElement;
        clone.setAttribute('clip-path', `url(#${clipId})`);
        clone.setAttribute('data-intro-tracer', 'true');
        path.after(clone);
        return { path, clone };
      });

      let raf = 0;
      let visible = true;
      const CYCLE = 9000;
      const roll = (now: number) => {
        raf = 0;
        if (!visible) return;
        const shift = ((now % CYCLE) / CYCLE) * width;
        pairs.forEach(({ path, clone }) => {
          path.setAttribute('transform', `translate(${-shift.toFixed(2)} 0)`);
          clone.setAttribute('transform', `translate(${(width - shift).toFixed(2)} 0)`);
        });
        raf = requestAnimationFrame(roll);
      };
      const observer =
        typeof IntersectionObserver === 'undefined'
          ? null
          : new IntersectionObserver((entries) => {
              const next = entries.some((entry) => entry.isIntersecting);
              if (next === visible) return;
              visible = next;
              if (next && !raf) raf = requestAnimationFrame(roll);
            });
      observer?.observe(svg);
      raf = requestAnimationFrame(roll);

      return () => {
        observer?.disconnect();
        if (raf) cancelAnimationFrame(raf);
        pairs.forEach(({ path, clone }) => {
          path.removeAttribute('clip-path');
          path.removeAttribute('transform');
          clone.remove();
        });
        defs.remove();
      };
    }

    // Sweep. The curves stay whole — a chart that is 60% drawn most of the time reads as broken,
    // not live — and a bright segment rides the longest solid series instead, like a measurement
    // cursor with a comet tail. Dashed series keep their dashes and are not traced.
    const solid = ([...svg.querySelectorAll('path[fill="none"]')] as SVGPathElement[]).filter(
      (path) => !path.getAttribute('stroke-dasharray')
    );
    if (!solid.length) return;
    const lengths = solid.map((path) => path.getTotalLength());
    const lead = solid.reduce((best, path, index) => (lengths[index] > lengths[best] ? index : best), 0);
    const bounds = solid[lead].getBBox();
    const ns = 'http://www.w3.org/2000/svg';
    const comet = solid[lead].cloneNode() as SVGPathElement;
    comet.setAttribute('fill', 'none');
    comet.setAttribute('stroke', 'var(--accent)');
    comet.setAttribute('stroke-width', '3.2');
    comet.setAttribute('stroke-linecap', 'round');
    comet.setAttribute('pathLength', '1');
    comet.setAttribute('stroke-dasharray', '0.08 0.92');
    comet.setAttribute('data-intro-tracer', 'true');
    solid[lead].after(comet);

    const tracer = document.createElementNS(ns, 'circle');
    tracer.setAttribute('r', '3.4');
    tracer.setAttribute('fill', 'var(--accent)');
    tracer.setAttribute('data-intro-tracer', 'true');
    const halo = document.createElementNS(ns, 'circle');
    halo.setAttribute('r', '8');
    halo.setAttribute('fill', 'color-mix(in srgb, var(--accent) 22%, transparent)');
    halo.setAttribute('data-intro-tracer', 'true');
    const scan = document.createElementNS(ns, 'line');
    scan.setAttribute('y1', String(bounds.y));
    scan.setAttribute('y2', String(bounds.y + bounds.height));
    scan.setAttribute('stroke', 'color-mix(in srgb, var(--accent) 45%, transparent)');
    scan.setAttribute('stroke-width', '1');
    scan.setAttribute('data-intro-tracer', 'true');
    svg.append(scan, halo, tracer);

    let raf = 0;
    let visible = true;
    const CYCLE = 4400;
    const drawAt = (now: number) => {
      raf = 0;
      if (!visible) return;
      const fraction = (now % CYCLE) / CYCLE;
      // The comet's dash pattern is one path long: shifting it by a path length walks the bright
      // segment from the left edge to the right and back to the start on the next cycle.
      comet.setAttribute('stroke-dashoffset', String(-fraction));
      const point = solid[lead].getPointAtLength(lengths[lead] * fraction);
      tracer.setAttribute('cx', point.x.toFixed(2));
      tracer.setAttribute('cy', point.y.toFixed(2));
      halo.setAttribute('cx', point.x.toFixed(2));
      halo.setAttribute('cy', point.y.toFixed(2));
      scan.setAttribute('x1', point.x.toFixed(2));
      scan.setAttribute('x2', point.x.toFixed(2));
      // The jump from the last point back to the first happens while nothing is painted, so the
      // eye reads a refresh rather than a teleport.
      const edge = fraction < 0.04 || fraction > 0.96;
      const alpha = edge ? '0' : '1';
      tracer.style.opacity = alpha;
      halo.style.opacity = alpha;
      comet.style.opacity = edge ? '0' : '1';
      scan.style.opacity = edge ? '0' : '0.8';
      raf = requestAnimationFrame(drawAt);
    };
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver((entries) => {
            const next = entries.some((entry) => entry.isIntersecting);
            if (next === visible) return;
            visible = next;
            if (next && !raf) raf = requestAnimationFrame(drawAt);
          });
    observer?.observe(svg);
    raf = requestAnimationFrame(drawAt);

    return () => {
      observer?.disconnect();
      if (raf) cancelAnimationFrame(raf);
      scan.remove();
      halo.remove();
      tracer.remove();
      comet.remove();
    };
  }, [spec, mode, motion]);

  return (
    <div ref={boxRef} className={className}>
      <Diagram spec={spec} />
    </div>
  );
};

const GALLERY: { id: string; why: string; Icon: LucideIcon; live: LiveMode }[] = [
  { id: 'signal-chain', why: 'Every stage in a sensor path, and the unit that leaves it.', Icon: Gauge, live: 'flow' },
  { id: 'arm-kinematics', why: 'Two links, one target: the triangle the solver closes.', Icon: Boxes, live: 'flow' },
  { id: 'kalman-step', why: 'Predict, measure, correct — the estimate moves, not the code.', Icon: BrainCircuit, live: 'flow' },
  { id: 'bode-margins', why: 'Gain and phase, and where the loop stops being stable.', Icon: GitBranch, live: 'sweep' },
  { id: 'ros-graph', why: 'Nodes, topics and the wire between them.', Icon: Waypoints, live: 'flow' },
  { id: 'three-phase', why: 'Three windings, one rotating field.', Icon: Cpu, live: 'wave' },
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
      {GALLERY.map(({ id, why, Icon, live }, index) => {
        const spec = sceneFor(id);
        if (!spec) return null;
        return (
          <Reveal key={id} delay={Math.min(index * 40, 200)}>
            <div
              data-testid={`intro-figure-${id}`}
              className="intro-lift intro-scan flex h-full flex-col rounded-[var(--r-lg)] border p-3"
              style={{
                borderColor: 'var(--border)',
                backgroundColor: 'var(--canvas)',
                // Each card's sweep starts a beat after the one before, so the gallery reads as a
                // row of instruments rather than six copies of one animation.
                ['--scan-delay' as string]: `${(index % 3) * 0.9 + Math.floor(index / 3) * 0.35}s`,
              }}
            >
              {/* No `id` on the figure itself: at 768 the header's own id label and the Expand
                  button together ran off the card. The anchor lives on the wrapper instead. */}
              <LiveFigure spec={spec} mode={live} />
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
              <span className="relative mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded border" style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}>
                <FlaskConical className="h-3 w-3" aria-hidden="true" />
                {/* A bench that is installed and ready, not a screenshot of one. */}
                <span
                  aria-hidden
                  className="intro-beacon"
                  style={{ ['--i' as string]: String(index) }}
                />
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
            className="intro-kept-card relative flex h-full items-start gap-2.5 overflow-hidden rounded-[var(--r-md)] border px-3 py-3"
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
        <h2
          className="font-display mx-auto mt-2 max-w-[26ch] text-[clamp(1.5rem,3.4vw,2.4rem)] leading-[1.05]"
          style={{ color: 'var(--text)' }}
        >
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
    <h2
      className="font-display mt-1.5 max-w-[34ch] text-[clamp(1.35rem,3vw,2.1rem)] leading-[1.08]"
      style={{ color: 'var(--text)' }}
    >
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
  animation: intro-grid-pan 60s linear infinite;
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
.intro-nav-chip { transition: color 160ms ease, background-color 160ms ease, border-color 160ms ease; }
/* The six moves in the lesson loop are one cycle, so they light in order on the same beat. */
.intro-loop-step {
  animation: intro-loop-state 6.9s ease-in-out infinite;
  animation-delay: calc(var(--i, 0) * -1.15s);
}
.intro-beacon {
  position: absolute;
  right: -2px;
  top: -2px;
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: var(--emerald, #34d399);
  animation: intro-beacon 3.4s ease-out infinite;
  animation-delay: calc(var(--i, 0) * -0.42s);
}
/* A card's edge is where a still card and a live one look identical: the sweep is a hairline, not
   a glow, so the row reads as powered without competing with the content. */
.intro-stat { position: relative; overflow: hidden; }
.intro-stat::after {
  content: '';
  position: absolute;
  left: 0;
  bottom: 0;
  height: 1px;
  width: 42%;
  background: linear-gradient(90deg, transparent, var(--accent), transparent);
  animation: intro-edge-sweep 7s ease-in-out infinite;
  animation-delay: var(--stat-delay, 0s);
}
.intro-kept-card::after {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  height: 1px;
  width: 55%;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--emerald, #34d399) 75%, transparent), transparent);
  animation: intro-edge-sweep 9s ease-in-out infinite;
}
.intro-traveller {
  position: absolute;
  left: 15px;
  width: 9px;
  height: 9px;
  margin: -4.5px 0 0 -4.5px;
  border-radius: 999px;
  background: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent), 0 0 12px 2px color-mix(in srgb, var(--accent) 45%, transparent);
  transition: top 140ms linear;
  animation: intro-pulse 3.2s ease-in-out infinite;
}
@media (min-width: 640px) {
  .intro-traveller { left: 19px; }
}
.intro-bar {
  transform: scaleX(0);
  transform-origin: left center;
}
.intro-reveal.is-shown .intro-bar {
  transform: none;
  transition: transform 720ms cubic-bezier(0.22, 0.61, 0.36, 1);
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
  background-size: 180% 180%;
  animation: intro-aurora 22s ease-in-out infinite;
  background:
    radial-gradient(75% 120% at 50% 0%, color-mix(in srgb, var(--accent) 14%, transparent) 0%, transparent 70%),
    color-mix(in srgb, var(--panel) 85%, transparent);
}
.intro-live { animation: intro-pulse 2.6s ease-in-out infinite; }
/* The flow half of a live figure: the box being crossed lights up while the arrows feed it.
   Both are offsets of the same 4.6 s beat, so a five-box chain reads left to right rather than
   every box pulsing at once. */
.intro-step rect {
  animation: intro-node-state 4.6s ease-in-out infinite;
  animation-delay: calc(var(--i, 0) * -0.46s);
}
.intro-edge {
  stroke-dasharray: 5 6;
  animation: intro-edge-flow 1.15s linear infinite;
}
.intro-scan { position: relative; overflow: hidden; }
.intro-scan::after {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  pointer-events: none;
  background: linear-gradient(104deg, transparent 34%, color-mix(in srgb, var(--accent) 11%, transparent) 47%, transparent 60%);
  transform: translateX(-130%);
  animation: intro-scan 7.4s ease-in-out infinite;
  animation-delay: var(--scan-delay, 0s);
}
@keyframes intro-sheen { 0%, 100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
@keyframes intro-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
@keyframes intro-grid-pan { from { background-position: 0 0, 0 0; } to { background-position: 44px 44px, 44px 44px; } }
@keyframes intro-scan { 0% { transform: translateX(-130%); } 52%, 100% { transform: translateX(130%); } }
@keyframes intro-node-state {
  0%, 100% { stroke: var(--line); filter: none; }
  7% { stroke: var(--accent); filter: drop-shadow(0 0 5px color-mix(in srgb, var(--accent) 55%, transparent)); }
  18% { stroke: var(--accent); filter: drop-shadow(0 0 5px color-mix(in srgb, var(--accent) 55%, transparent)); }
  27% { stroke: var(--line); filter: none; }
}
@keyframes intro-edge-flow { to { stroke-dashoffset: -11; } }
@keyframes intro-loop-state {
  0%, 100% { box-shadow: inset 0 0 0 1px transparent, 0 0 0 0 transparent; }
  2% { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 55%, transparent), 0 0 20px -10px color-mix(in srgb, var(--accent) 90%, transparent); }
  13% { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 55%, transparent), 0 0 20px -10px color-mix(in srgb, var(--accent) 90%, transparent); }
  22% { box-shadow: inset 0 0 0 1px transparent, 0 0 0 0 transparent; }
}
@keyframes intro-beacon {
  0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--emerald, #34d399) 55%, transparent); opacity: 1; }
  55%, 100% { box-shadow: 0 0 0 5px transparent; opacity: 0.55; }
}
@keyframes intro-edge-sweep {
  0% { transform: translateX(-120%); }
  55%, 100% { transform: translateX(240%); }
}
@keyframes intro-aurora {
  0%, 100% { background-position: 18% 0%; }
  50% { background-position: 82% 100%; }
}
@media print {
  .intro-reveal, .intro-reveal:not(.is-shown) { opacity: 1; transform: none; }
}
/* Paused: one attribute switches every decorative loop off, on any machine. Not a media query,
   because Pause is a control on this page and must work whether or not the OS asked for stillness. */
.intro-root[data-motion='off'] .intro-reveal,
  .intro-root[data-motion='off'] .intro-reveal:not(.is-shown) { opacity: 1; transform: none; transition: none; }
  .intro-root[data-motion='off'] .intro-bar,
  .intro-root[data-motion='off'] .intro-reveal.is-shown .intro-bar { transform: none; transition: none; }
  .intro-root[data-motion='off'] .intro-traveller { animation: none; transition: none; }
  .intro-root[data-motion='off'] .intro-scan::after { display: none; }
  .intro-root[data-motion='off'] .intro-grid { animation: none; }
  .intro-root[data-motion='off'] .intro-step rect,
  .intro-root[data-motion='off'] .intro-edge { animation: none; }
  .intro-root[data-motion='off'] .intro-edge { stroke-dasharray: none; }
  .intro-root[data-motion='off'] .intro-loop-step,
  .intro-root[data-motion='off'] .intro-beacon,
  .intro-root[data-motion='off'] .intro-closing { animation: none; }
  .intro-root[data-motion='off'] .intro-stat::after,
  .intro-root[data-motion='off'] .intro-kept-card::after { display: none; }
  .intro-root[data-motion='off'] .intro-gradient-text { animation: none; background: var(--accent); -webkit-background-clip: text; background-clip: text; }
  .intro-root[data-motion='off'] .intro-lift,
  .intro-root[data-motion='off'] .intro-cta { transition: none; }
  .intro-root[data-motion='off'] .intro-lift:hover,
  .intro-root[data-motion='off'] .intro-cta:hover { transform: none; }
.intro-root[data-motion='off'] .intro-live { animation: none; }
`;
