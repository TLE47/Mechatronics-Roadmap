import React from 'react';
import { ArrowLeft, ArrowRight, Bot, DoorOpen, MonitorPlay, Sparkles, X } from 'lucide-react';
import {
  HOTSPOTS,
  START,
  applyMove,
  activeHotspot,
  describePose,
  keyAction,
  positionPercent,
  walkTo,
  type Hotspot,
  type Pose,
} from '../../workshop.ts';
import { missionProgressForAll, verifiedMissionCount } from '../../gamification/missions.ts';

export interface WorkshopProps {
  /** What "Continue" opens: the lesson the workbench would resume, or null on a first visit. */
  continueLesson: { id: string; title: string; reason: 'resume' | 'next' } | null;
  /** The verified lessons, the same store the Rebuild meter and the LV bar read. */
  verifiedLessons: Record<string, boolean>;
  onOpenLesson: (id: string) => void;
  /** The alley door: leave the room for the workbench. */
  onLeave: () => void;
}

const TAB_LABEL: Record<Hotspot['id'], string> = {
  terminal: 'Terminal',
  h7: 'H-7',
  door: 'Door',
};

/** `prefers-reduced-motion` as state, so the room can say which way it is moving. */
function useReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = React.useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(query).matches;
  });
  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(query);
    const onChange = () => setReduced(media.matches);
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, []);
  return reduced;
}

/**
 * The walkable workshop (`app/src/components/game/Workshop.tsx`).
 *
 * One room, drawn from CSS layers and two SVGs: the bench at the back with the terminal and H-7,
 * the floor at the front, the arch and the wet street beyond the window. The figure can walk along
 * the floor line and step between the two lanes; the three hotspots are buttons in the room *and*
 * rows in the menu underneath, so a keyboard or screen-reader learner never has to find a coordinate.
 *
 * The room is optional by construction. Continue is a button above it that goes straight to the
 * lesson, the door leaves, and nothing on this page is required to keep studying — which is the
 * plan's rule that walking is atmosphere, never a gate.
 */
export const Workshop: React.FC<WorkshopProps> = (props) => {
  const [pose, setPose] = React.useState<Pose>(START);
  const [robotOpen, setRobotOpen] = React.useState(false);
  const [note, setNote] = React.useState('');
  const reduced = useReducedMotion();
  const sceneRef = React.useRef<HTMLDivElement | null>(null);
  const poseRef = React.useRef(pose);
  poseRef.current = pose;
  const propsRef = React.useRef(props);
  propsRef.current = props;

  const missions = React.useMemo(
    () => missionProgressForAll(props.verifiedLessons),
    [props.verifiedLessons]
  );
  const restored = verifiedMissionCount(props.verifiedLessons);
  const total = missions.length;
  const nextMission = missions.find((mission) => !mission.verified) ?? null;
  const restoredNames = missions.filter((mission) => mission.verified).map((mission) => mission.mission.capabilityShort);

  const active = activeHotspot(pose);
  const status = note || describePose(pose);

  const act = React.useCallback((hotspot: Hotspot) => {
    const current = propsRef.current;
    setNote('');
    if (hotspot.id === 'terminal') {
      current.onOpenLesson(current.continueLesson?.id ?? 'P.1');
      return;
    }
    if (hotspot.id === 'h7') {
      setRobotOpen((open) => !open);
      return;
    }
    current.onLeave();
  }, []);

  const interact = React.useCallback(() => {
    const here = activeHotspot(poseRef.current);
    if (!here) {
      setNote(`Nothing within reach. Walk closer to a hotspot, or use the menu below.`);
      return;
    }
    act(here);
  }, [act]);

  const move = React.useCallback((move: Parameters<typeof applyMove>[1]) => {
    setNote('');
    setPose((current) => applyMove(current, move));
  }, []);

  // One key listener for the room, and nothing global on any other page: the component only exists
  // while the lab is open. Modifiers and typing are left alone, and arrows stop scrolling the page.
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      ) {
        return;
      }
      const action = keyAction(event.key);
      if (!action) return;
      event.preventDefault();
      if (action === 'interact') interact();
      else move(action);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [interact, move]);

  /** A tap on the floor is a walk: the pointer and the keyboard end in the same clamped pose. */
  const onSceneClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;
    const rect = sceneRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    setNote('');
    setPose((current) => walkTo(current, (event.clientX - rect.left) / rect.width));
  };

  /** A hotspot is one click wherever the figure stands: it walks over, then does its job. */
  const onHotspotClick = (hotspot: Hotspot) => {
    setNote('');
    setPose((current) => walkTo(current, hotspot.x));
    act(hotspot);
  };

  const transition = reduced
    ? 'none'
    : 'left 240ms ease-out, bottom 240ms ease-out, transform 240ms ease-out, opacity 200ms ease-out';
  const parallax = (factor: number) => ({ transform: `translateX(${-pose.x * factor}px)` });

  return (
    <div
      className="mx-auto w-full max-w-5xl px-3 pb-10 pt-4 sm:px-5"
      data-testid="workshop-page"
      data-reduced-motion={reduced ? 'true' : 'false'}
    >
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-ink">The workshop</h1>
          <p className="text-xs text-muted">
            Under the rail arch, 2061. Walk with A / D, change lanes with W / S, use a hotspot with E —
            or press Continue and skip the room entirely.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => propsRef.current.onLeave()}
            data-testid="btn-workshop-leave"
            className="btn"
          >
            <DoorOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Leave the lab
          </button>
          <button
            type="button"
            onClick={() => propsRef.current.onOpenLesson(propsRef.current.continueLesson?.id ?? 'P.1')}
            data-testid="btn-workshop-continue"
            className="btn btn-primary"
          >
            <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Continue: {props.continueLesson?.title ?? 'the first lesson'}
          </button>
        </div>
      </div>

      <div
        ref={sceneRef}
        data-testid="workshop"
        data-x={pose.x.toFixed(3)}
        data-lane={pose.lane}
        onClick={onSceneClick}
        className="relative w-full select-none overflow-hidden rounded-xl border"
        style={{
          borderColor: 'var(--border-strong)',
          background:
            'linear-gradient(180deg, #070b12 0%, #0b1220 46%, #0a0f18 100%)',
          height: 'clamp(340px, 56vh, 540px)',
        }}
      >
        {/* The city beyond the window: cold magenta, flat grey, rain. */}
        <div
          aria-hidden="true"
          data-testid="workshop-layer-city"
          className="pointer-events-none absolute inset-x-0 top-0 h-[62%] opacity-80 transition-transform duration-500 ease-out"
          style={{
            ...parallax(10),
            background:
              'radial-gradient(120px 60px at 78% 18%, rgba(236,72,153,0.22), transparent 70%), radial-gradient(90px 40px at 24% 26%, rgba(56,189,248,0.16), transparent 70%)',
          }}
        >
          {[12, 26, 41, 58, 73, 88].map((left, index) => (
            <span
              key={left}
              className="absolute bottom-0 block w-[9%] rounded-t-sm"
              style={{
                left: `${left}%`,
                height: `${28 + ((index * 13) % 34)}%`,
                backgroundColor: index % 2 ? '#0e1524' : '#101a2b',
                borderTop: '1px solid rgba(236,72,153,0.28)',
              }}
            />
          ))}
          {[9, 21, 33, 47, 61, 76, 90].map((left) => (
            <span
              key={`rain-${left}`}
              className="absolute top-0 block h-full w-px"
              style={{
                left: `${left}%`,
                background:
                  'linear-gradient(180deg, transparent, rgba(186,230,253,0.16), transparent)',
              }}
            />
          ))}
          <span
            className="absolute right-[6%] top-[10%] rounded px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.22em]"
            style={{ color: '#f9a8d4', border: '1px solid rgba(236,72,153,0.4)' }}
          >
            EACorp
          </span>
        </div>

        {/* The arch and its hand-painted sign. */}
        <div
          aria-hidden="true"
          data-testid="workshop-layer-arch"
          className="pointer-events-none absolute inset-x-0 top-0 h-full transition-transform duration-500 ease-out"
          style={parallax(18)}
        >
          <div
            className="absolute left-[4%] right-[4%] top-[6%] h-[58%] rounded-t-[45%] border-x-2 border-t-2"
            style={{ borderColor: 'rgba(120,140,170,0.28)' }}
          />
          <div className="absolute left-[6%] top-[13%] space-y-0.5">
            <div className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: '#fcd34d' }}>
              The Last Hands
            </div>
            <div className="text-[8px] uppercase tracking-[0.24em]" style={{ color: 'rgba(252,211,77,0.66)' }}>
              We check the machine
            </div>
          </div>
          <span
            className="absolute right-[7%] top-[15%] h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: 'rgba(252,211,77,0.55)', boxShadow: '0 0 14px rgba(252,211,77,0.55)' }}
          />
        </div>

        {/* The bench, the controller board and H-7's one-armed silhouette. */}
        <div
          aria-hidden="true"
          data-testid="workshop-layer-bench"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[48%]"
        >
          <div
            className="absolute inset-x-0 top-[38%] h-[3px]"
            style={{ backgroundColor: 'rgba(148,163,184,0.35)' }}
          />
          <div
            className="absolute inset-x-0 top-0 h-[38%]"
            style={{
              background:
                'linear-gradient(180deg, rgba(20,28,42,0.15), rgba(16,22,34,0.92))',
              borderTop: '1px solid rgba(120,140,170,0.16)',
            }}
          />
          {/* Blueprint: the arm H-7 is missing. */}
          <svg
            className="absolute left-[57%] top-[4%] h-[46%] w-[26%] opacity-70"
            viewBox="0 0 120 80"
            fill="none"
          >
            <path
              d="M8 70 L34 34 L62 24 L88 30"
              stroke="rgba(56,189,248,0.55)"
              strokeWidth="1.4"
              strokeDasharray="4 4"
            />
            <circle cx="88" cy="30" r="3" stroke="rgba(56,189,248,0.7)" />
            <path d="M88 12 v36 M76 30 h24" stroke="rgba(56,189,248,0.35)" strokeWidth="1" />
            <text x="92" y="16" fill="rgba(56,189,248,0.6)" fontSize="6" fontFamily="monospace">
              R-arm
            </text>
          </svg>
          {/* H-7: torso, head, one shoulder. The missing side is the dashed arm above. */}
          <svg
            className="absolute left-[69%] top-[6%] h-[52%] w-[16%]"
            viewBox="0 0 90 130"
            fill="none"
          >
            <rect x="26" y="74" width="38" height="44" rx="7" fill="#141b27" stroke="#3b4a60" />
            <rect x="32" y="84" width="26" height="4" rx="2" fill="rgba(56,189,248,0.35)" />
            <rect x="32" y="92" width="18" height="3" rx="1.5" fill="rgba(148,163,184,0.35)" />
            <rect x="30" y="46" width="30" height="24" rx="6" fill="#182131" stroke="#3b4a60" />
            <circle cx="38" cy="58" r="2.6" fill="#38bdf8" />
            <circle cx="51" cy="58" r="2.6" fill="#38bdf8" opacity="0.7" />
            <path d="M45 46 V38 M45 38 h8" stroke="#3b4a60" strokeWidth="2" />
            <circle cx="54" cy="37" r="2.4" fill="#fcd34d" />
            <path d="M30 80 L18 92 L14 112" stroke="#3b4a60" strokeWidth="5" strokeLinecap="round" />
            <circle cx="14" cy="112" r="4" fill="#141b27" stroke="#3b4a60" strokeWidth="2" />
            <rect x="40" y="118" width="9" height="10" fill="#141b27" stroke="#3b4a60" />
            <rect x="49" y="118" width="9" height="10" fill="#141b27" stroke="#3b4a60" />
          </svg>
          {/* The bench terminal. */}
          <div className="absolute left-[41%] top-[10%] w-[15%]">
            <div
              className="rounded-sm border px-1.5 py-1"
              style={{ borderColor: 'rgba(56,189,248,0.4)', backgroundColor: 'rgba(8,14,24,0.9)' }}
            >
              {[0, 1, 2].map((row) => (
                <span
                  key={row}
                  className="mt-0.5 block h-px"
                  style={{
                    width: `${80 - row * 18}%`,
                    backgroundColor: 'rgba(56,189,248,0.5)',
                  }}
                />
              ))}
            </div>
            <div className="mx-auto h-2 w-1/3" style={{ backgroundColor: 'rgba(148,163,184,0.3)' }} />
          </div>
          {/* The alley door, at the near wall. */}
          <div
            className="absolute left-[7%] top-[6%] h-[62%] w-[9%] rounded-t-sm border"
            style={{ borderColor: 'rgba(148,163,184,0.28)', backgroundColor: 'rgba(12,18,28,0.9)' }}
          >
            <span
              className="absolute right-1 top-1/2 block h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: 'rgba(252,211,77,0.6)' }}
            />
            <span
              className="absolute -top-4 left-1/2 -translate-x-1/2 text-[7px] uppercase tracking-[0.18em]"
              style={{ color: 'rgba(148,163,184,0.6)' }}
            >
              alley
            </span>
          </div>
        </div>

        {/* The figure: the learner, at their lane and depth. */}
        <div
          data-testid="workshop-figure"
          data-x={pose.x.toFixed(3)}
          data-lane={pose.lane}
          aria-hidden="true"
          className="pointer-events-none absolute z-10 -translate-x-1/2"
          style={{
            left: positionPercent(pose.x),
            bottom: pose.lane === 'floor' ? '14%' : '27%',
            transform: `translateX(-50%) scale(${pose.lane === 'floor' ? 1.06 : 0.9})`,
            transition,
          }}
        >
          <svg width="34" height="66" viewBox="0 0 34 66" fill="none">
            <circle cx="17" cy="9" r="6.5" fill="#1b2534" stroke="#6b7f99" strokeWidth="1.4" />
            <path d="M17 16 L17 20" stroke="#6b7f99" strokeWidth="1.5" />
            <path
              d="M9 22 Q17 18 25 22 L27 46 L7 46 Z"
              fill="#1a2433"
              stroke="#6b7f99"
              strokeWidth="1.3"
            />
            <path d="M9 23 L4 38 M25 23 L30 38" stroke="#6b7f99" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M12 46 L11 62 M22 46 L23 62" stroke="#334155" strokeWidth="3.4" strokeLinecap="round" />
            <rect x="20" y="27" width="4" height="3" rx="1" fill="#38bdf8" opacity="0.85" />
          </svg>
        </div>

        {/* Hotspots: real buttons, placed where they are painted. */}
        {HOTSPOTS.map((hotspot) => {
          const here = active?.id === hotspot.id;
          return (
            <button
              key={hotspot.id}
              type="button"
              onClick={() => onHotspotClick(hotspot)}
              data-testid={`workshop-hotspot-${hotspot.id}`}
              data-active={here ? 'true' : 'false'}
              aria-label={`${hotspot.label} — ${hotspot.hint}`}
              className="absolute z-20 -translate-x-1/2 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors"
              style={{
                left: positionPercent(hotspot.x),
                bottom: hotspot.lane === 'bench' ? '47%' : '30%',
                borderColor: here ? 'var(--accent)' : 'rgba(148,163,184,0.45)',
                backgroundColor: here ? 'var(--accent-soft)' : 'rgba(10,16,26,0.82)',
                color: here ? 'var(--accent)' : '#cbd5e1',
                cursor: 'pointer',
                outlineOffset: '2px',
              }}
            >
              {hotspot.label}
              {here && <span className="ml-1 text-[9px] font-mono">E</span>}
            </button>
          );
        })}

        {/* The lane hint, in the room and not only in the copy. */}
        <div
          className="pointer-events-none absolute bottom-2 left-3 z-20 flex items-center gap-2 text-[10px] font-mono"
          style={{ color: 'rgba(148,163,184,0.72)' }}
          aria-hidden="true"
        >
          <span style={{ color: pose.lane === 'bench' ? '#38bdf8' : 'rgba(148,163,184,0.5)' }}>bench</span>
          <span style={{ color: 'rgba(148,163,184,0.35)' }}>/</span>
          <span style={{ color: pose.lane === 'floor' ? '#38bdf8' : 'rgba(148,163,184,0.5)' }}>floor</span>
          <span className="ml-2">x {pose.x.toFixed(2)}</span>
        </div>
      </div>

      <p role="status" data-testid="workshop-status" className="mt-2 text-xs text-body">
        {status}
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-[1.2fr_1fr]">
        <nav
          aria-label="Room menu"
          data-testid="workshop-menu"
          className="rounded-xl border p-3"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--panel)' }}
        >
          <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
            Every hotspot, from here
          </div>
          <div className="mt-2 grid gap-1.5">
            {HOTSPOTS.map((hotspot) => {
              const Icon = hotspot.id === 'terminal' ? MonitorPlay : hotspot.id === 'h7' ? Bot : DoorOpen;
              return (
                <button
                  key={hotspot.id}
                  type="button"
                  onClick={() => onHotspotClick(hotspot)}
                  data-testid={`workshop-menu-${hotspot.id}`}
                  className="flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs"
                  style={{
                    borderColor: 'var(--border-strong)',
                    backgroundColor: 'var(--bg)',
                    color: 'var(--text)',
                    cursor: 'pointer',
                  }}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--accent)' }} aria-hidden="true" />
                  <span className="font-semibold">{TAB_LABEL[hotspot.id]}</span>
                  <span style={{ color: 'var(--muted)' }}>{hotspot.hint}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px]" style={{ color: 'var(--dim)' }}>
            Tap the floor to walk there. The room never hides a lesson: Continue above is one press
            from the editor, and the door leaves.
          </p>
        </nav>

        <div
          className="rounded-xl border p-3"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--panel)' }}
          data-testid="workshop-rebuild"
        >
          <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
            H-7 · rebuilt
          </div>
          <div className="mt-1 text-sm font-semibold text-ink" data-testid="workshop-restored">
            {restored} of {total} capabilities
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'var(--bg)' }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${total === 0 ? 0 : (restored / total) * 100}%`, backgroundColor: 'var(--accent)' }}
            />
          </div>
          <p className="mt-2 text-[11px]" style={{ color: 'var(--muted)' }}>
            {nextMission
              ? `Next: ${nextMission.mission.capabilityShort} — ${nextMission.mission.name}.`
              : 'Every capability is restored. The arm can hold itself steady.'}
          </p>
          <button
            type="button"
            onClick={() => setRobotOpen((open) => !open)}
            aria-expanded={robotOpen}
            aria-controls="workshop-robot-card"
            data-testid="btn-workshop-robot"
            className="mt-2 text-[11px] font-semibold"
            style={{ color: 'var(--accent)', cursor: 'pointer' }}
          >
            {robotOpen ? 'Hide H-7’s record' : 'Inspect H-7'}
          </button>
        </div>
      </div>

      {robotOpen && (
        <section
          id="workshop-robot-card"
          data-testid="workshop-robot-card"
          className="mt-3 rounded-xl border p-3"
          style={{ borderColor: 'var(--border-strong)', backgroundColor: 'var(--panel)' }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-ink">H-7 · service record</h2>
              <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
                Each verified mission gives something back. Nothing here is bought, timed or random.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRobotOpen(false)}
              data-testid="btn-workshop-robot-close"
              aria-label="Close H-7’s record"
              className="btn px-1.5"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          {restoredNames.length === 0 ? (
            <p className="mt-2 text-xs text-body">
              No capability restored yet. Verify Mission 1 and its status light comes on.
            </p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {restoredNames.map((name) => (
                <li
                  key={name}
                  className="rounded-full border px-2 py-0.5 text-[11px]"
                  style={{ borderColor: 'var(--border-strong)', color: 'var(--text)' }}
                >
                  {name}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 flex items-center gap-1 text-[11px]" style={{ color: 'var(--dim)' }}>
            <ArrowLeft className="h-3 w-3" aria-hidden="true" />
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
            Walk with A / D · W / S changes lane · E uses the hotspot you stand at.
          </p>
        </section>
      )}
    </div>
  );
};
