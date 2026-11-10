import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  ROBOT_TOUR_STEP_COUNT,
  robotTourAnnouncement,
  type RobotTourStep,
} from './robotTour';

/**
 * The Robot tab's first-run coach mark (`app/src/robotSim/RobotTour.tsx`).
 *
 * It follows the first-lesson tour's rules: a ring with a shadow instead of a backdrop, no focus
 * trap, and a card that sits beside the thing it names. The learner can press Run, open a chip or
 * start Replay through the ring, because those are the actions the guide is pointing at. On a phone
 * the card becomes a bottom sheet and the ring is omitted; a floating card over the keyboard is the
 * one place a coach mark actively gets in the way.
 *
 * The tour is anchored to `data-robot-tour` values the pane renders, not to pixel positions. That is what
 * keeps the ring on the control when the mission card grows a row, a run changes the status line, or
 * a font swaps in.
 */

interface RobotTourProps {
  step: RobotTourStep;
  index: number;
  onNext: () => void;
  onBack: () => void;
  onDismiss: () => void;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const CARD_WIDTH = 340;
const GAP = 12;
const EDGE = 12;

/** A layout effect before paint, a plain effect where there is no DOM (the workbench can be SSR'd). */
const useMeasuredLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function anchorElement(step: RobotTourStep): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.querySelector<HTMLElement>(`[data-robot-tour="${step.anchor}"]`);
}

/**
 * Below the anchor when there is room, above when there is not, clamped to the viewport with the
 * card's measured height so its buttons can never be pushed off screen.
 */
function placeCard(rect: Rect, viewportWidth: number, viewportHeight: number, cardHeight = 0) {
  const width = Math.min(CARD_WIDTH, viewportWidth - EDGE * 2);
  const left = Math.min(
    Math.max(rect.left + rect.width / 2 - width / 2, EDGE),
    viewportWidth - width - EDGE
  );
  const below = rect.top + rect.height + GAP;
  const above = rect.top - GAP;
  const roomBelow = viewportHeight - below;
  const maxHeight = Math.max(160, Math.min(viewportHeight - EDGE * 2, 320));
  const wanted =
    roomBelow >= Math.min(maxHeight, 240) || rect.top < maxHeight
      ? below
      : above - Math.min(maxHeight, 240);
  const tallest = Math.min(cardHeight > 0 ? cardHeight : 120, viewportHeight - EDGE * 2);
  const top = Math.max(EDGE, Math.min(wanted, viewportHeight - EDGE - tallest));
  return { width, left, top };
}

export function RobotTour({ step, index, onNext, onBack, onDismiss }: RobotTourProps) {
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardHeight, setCardHeight] = useState(0);
  const [isPhone, setIsPhone] = useState<boolean>(() => {
    try {
      return window.matchMedia('(max-width: 767px)').matches;
    } catch {
      return false;
    }
  });
  const cardRef = useRef<HTMLDivElement | null>(null);
  // Where focus goes when the card leaves: the control it last pointed at, or Run when that one is
  // disabled (Replay is, before the first run).
  const lastAnchorRef = useRef<HTMLElement | null>(null);

  const titleId = 'robot-tour-title';
  const bodyId = 'robot-tour-body';
  const primary = index >= ROBOT_TOUR_STEP_COUNT - 1 ? 'Got it' : 'Next';

  // Measure the anchor and keep measuring while the card is up: the pane scrolls, a reading moves
  // the status line, and on a phone the sheet itself can change the layout.
  useMeasuredLayoutEffect(() => {
    let frame = 0;
    const measure = () => {
      const element = anchorElement(step);
      if (!element) {
        setRect(null);
        return;
      }
      const box = element.getBoundingClientRect();
      setRect((previous) => {
        if (
          previous &&
          Math.abs(previous.top - box.top) < 0.5 &&
          Math.abs(previous.left - box.left) < 0.5 &&
          Math.abs(previous.height - box.height) < 0.5 &&
          Math.abs(previous.width - box.width) < 0.5
        ) {
          return previous;
        }
        return { top: box.top, left: box.left, width: box.width, height: box.height };
      });
    };
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };

    const element = anchorElement(step);
    if (element && !isPhone) {
      const box = element.getBoundingClientRect();
      if (box.top < 48 || box.bottom > window.innerHeight - 48) {
        element.scrollIntoView({
          block: 'center',
          behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        });
      }
    }

    measure();
    window.addEventListener('scroll', schedule, { passive: true, capture: true });
    window.addEventListener('resize', schedule, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    if (element) observer?.observe(element);
    // Content above the anchor can move it without changing the anchor's own box.
    observer?.observe(document.documentElement);
    const poll = window.setInterval(schedule, 250);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      window.clearInterval(poll);
      observer?.disconnect();
    };
  }, [step, isPhone]);

  useEffect(() => {
    let query: MediaQueryList;
    try {
      query = window.matchMedia('(max-width: 767px)');
    } catch {
      return;
    }
    const onChange = () => setIsPhone(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  // The card owns focus while it is open. The ring leaves the page clickable, so the learner can
  // still use Run or a chip; pressing the card's own buttons never has to fight the page for focus.
  useEffect(() => {
    cardRef.current?.focus({ preventScroll: true });
  }, [step.id]);

  useEffect(() => {
    const element = anchorElement(step);
    if (element) lastAnchorRef.current = element;
  }, [step]);

  // A card that disappears should not drop a keyboard user on `body`.
  useEffect(
    () => () => {
      const active = document.activeElement;
      const fromCard = !active || active === document.body || cardRef.current?.contains(active);
      if (!fromCard) return;
      const remembered = lastAnchorRef.current;
      const target =
        remembered?.matches('button:not([disabled]), a, input, [tabindex]') === true
          ? remembered
          : document.querySelector<HTMLElement>('[data-robot-tour="run"]');
      target?.focus?.({ preventScroll: true });
    },
    []
  );

  // Escape skips; arrows move between steps only while focus is inside the card, so they do not
  // steal the editor's arrow keys when the guide is merely pinned beside it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onDismiss();
        return;
      }
      if (!cardRef.current?.contains(event.target as Node | null)) return;
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        onNext();
      }
      if (event.key === 'ArrowLeft' && index > 0) {
        event.preventDefault();
        onBack();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, onNext, onBack, onDismiss]);

  // The card's own height is what the placement clamp needs, not an estimate.
  useMeasuredLayoutEffect(() => {
    const element = cardRef.current;
    if (!element || isPhone) return;
    const measure = () => {
      const next = element.getBoundingClientRect().height;
      setCardHeight((previous) => (Math.abs(previous - next) < 0.5 ? previous : next));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [step, isPhone]);

  const placement = useMemo(() => {
    if (!rect || typeof window === 'undefined') return null;
    return placeCard(rect, window.innerWidth, window.innerHeight, cardHeight);
  }, [rect, cardHeight]);

  return (
    <>
      {rect && !isPhone && (
        <div
          aria-hidden="true"
          data-testid="robot-tour-ring"
          data-robot-tour-anchor={step.anchor}
          className="fixed z-40"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            borderRadius: 14,
            boxShadow: '0 0 0 3px var(--accent), 0 0 0 9999px rgba(6, 8, 12, 0.55)',
            pointerEvents: 'none',
          }}
        />
      )}
      <p aria-live="polite" className="sr-only">
        {robotTourAnnouncement(index)}
      </p>
      <div
        ref={cardRef}
        data-testid="robot-tour"
        data-robot-tour-step={step.id}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        className={
          isPhone
            ? 'fixed z-50 rounded-t-2xl border shadow-2xl p-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] outline-none'
            : 'fixed z-50 rounded-xl border shadow-2xl p-3.5 outline-none'
        }
        style={
          isPhone
            ? {
                left: 8,
                right: 8,
                bottom: 8,
                maxHeight: '45vh',
                overflowY: 'auto',
                borderColor: 'var(--border-strong)',
                backgroundColor: 'var(--panel)',
                color: 'var(--text)',
              }
            : {
                width: placement?.width ?? CARD_WIDTH,
                left: placement?.left ?? EDGE,
                top: placement?.top ?? EDGE,
                maxHeight: `calc(100vh - ${EDGE * 2}px)`,
                overflowY: 'auto',
                borderColor: 'var(--border-strong)',
                backgroundColor: 'var(--panel)',
                color: 'var(--text)',
              }
        }
      >
        <p className="text-[11px] font-mono uppercase tracking-[0.08em]" style={{ color: 'var(--accent)' }}>
          Robot guide · {index + 1} of {ROBOT_TOUR_STEP_COUNT}
        </p>
        <h2 id={titleId} className="mt-1 font-round text-[14px] font-bold">
          {step.title}
        </h2>
        <p id={bodyId} className="mt-1 text-[12.5px] leading-relaxed" style={{ color: 'var(--body)' }}>
          {step.body}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {index > 0 && (
            <button
              type="button"
              onClick={onBack}
              data-testid="robot-tour-back"
              className="min-h-[44px] px-2 py-1 text-[12px] font-mono underline sm:min-h-0"
              style={{ color: 'var(--muted)' }}
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={onNext}
            data-testid="robot-tour-next"
            className="btn btn-primary min-h-[44px] px-3 py-1.5 text-[12.5px] font-bold sm:min-h-0"
          >
            {primary}
          </button>
          <span className="ml-auto text-[11px] font-mono tabular-nums" style={{ color: 'var(--faint)' }}>
            {index + 1} / {ROBOT_TOUR_STEP_COUNT}
          </span>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Skip the Robot guide"
            title="Skip the Robot guide (Esc)"
            data-testid="robot-tour-dismiss"
            className="grid h-11 w-11 place-items-center rounded border sm:h-8 sm:w-8"
            style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </>
  );
}
