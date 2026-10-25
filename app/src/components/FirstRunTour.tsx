import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  TOUR_STEP_COUNT,
  primaryLabel,
  stepAnnouncement,
  stepAt,
  type FirstRunStep,
} from '../tour';

/**
 * The coach mark (`app/src/components/FirstRunTour.tsx`).
 *
 * **It must not become a modal.** The two steps that matter ask the learner to type and to press
 * Run, so the only thing drawn over the page is a ring with a shadow behind it — `pointer-events:
 * none`, no backdrop element, nothing to click through. The card sits beside that ring and has focus
 * only on the information steps; on the action steps the app puts focus in the editor and on the Run
 * button instead, because a dialog that keeps focus while asking you to type is a dialog you fight.
 *
 * On a phone the card becomes a bottom sheet: a floating card over a soft keyboard covers the thing
 * it is pointing at, and the keyboard is exactly what step 3 asks for. The sheet is anchored to the
 * bottom of the screen, above the safe area, and the step's own `mobileView` puts the right region
 * behind it (`layoutForStep` in `tour.ts`).
 *
 * Everything visual comes from the app's tokens, so the four palettes and high contrast are not
 * special cases here.
 */

interface FirstRunTourProps {
  index: number;
  step: FirstRunStep;
  /** True when the first run passed, so the last steps can say so instead of talking about red. */
  passedFirstTry: boolean;
  onNext: () => void;
  onSkipStep: () => void;
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

/**
 * `useLayoutEffect` where there is a DOM, `useEffect` where there is not.
 *
 * The measurement has to happen before the browser paints, or the ring is drawn a frame in the wrong
 * place. But the workbench is also rendered to a string by `npm run test:smoke`, and React warns about
 * layout effects on the server — a warning in a smoke run is a warning everyone learns to ignore.
 */
const useMeasuredLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** The element a `data-tour` anchor names, or null when this lesson does not have one. */
function anchorElement(step: FirstRunStep): HTMLElement | null {
  if (!step.anchor || typeof document === 'undefined') return null;
  return document.querySelector<HTMLElement>(`[data-tour="${step.anchor}"]`);
}

/**
 * Where the ring goes and, from that, where the card can go.
 *
 * Below the anchor when there is room, above when there is not, and clamped to the viewport: a card
 * half off the screen is a card whose buttons cannot be pressed.
 */
function placeCard(rect: Rect, viewportWidth: number, viewportHeight: number) {
  const width = Math.min(CARD_WIDTH, viewportWidth - EDGE * 2);
  const left = Math.min(Math.max(rect.left + rect.width / 2 - width / 2, EDGE), viewportWidth - width - EDGE);
  const below = rect.top + rect.height + GAP;
  const above = rect.top - GAP;
  const roomBelow = viewportHeight - below;
  const maxHeight = Math.max(160, Math.min(viewportHeight - EDGE * 2, 320));
  const top = roomBelow >= Math.min(maxHeight, 240) || rect.top < maxHeight
    ? Math.min(below, viewportHeight - EDGE - 120)
    : Math.max(EDGE, above - Math.min(maxHeight, 240));
  return { width, left, top };
}

export const FirstRunTour: React.FC<FirstRunTourProps> = ({
  index,
  step,
  passedFirstTry,
  onNext,
  onSkipStep,
  onDismiss,
}) => {
  const [rect, setRect] = useState<Rect | null>(null);
  const [isPhone, setIsPhone] = useState<boolean>(() => {
    try {
      return window.matchMedia('(max-width: 767px)').matches;
    } catch {
      return false;
    }
  });
  const cardRef = useRef<HTMLDivElement | null>(null);
  // Where focus goes when the card leaves. The last anchor the tour pointed at, remembered by element
  // rather than by name, so a step change cannot leave the cleanup pointing at an earlier one.
  const lastAnchorRef = useRef<HTMLElement | null>(null);

  const titleId = 'first-run-tour-title';
  const bodyId = 'first-run-tour-body';
  const primary = primaryLabel(index);

  // Measure the anchor, and keep measuring: the page scrolls under the card, a result arrives and
  // moves it, and a phone rotates. A ring left behind on the wrong element is the one failure the
  // learner cannot explain away.
  //
  // "A result arrives and moves it" is not hypothetical: on a cold first visit the lesson list and the
  // reader populate *after* the tour mounts, and a brief measured at 6 px was found 4819 px lower by
  // the time the learner read the card — nothing had scrolled and nothing had resized, so scroll,
  // resize and the anchor's own ResizeObserver all stayed silent. The document's height is what
  // changes when content arrives above the anchor, so that is observed too, and a slow poll covers the
  // reflow that leaves the height alone.
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
    // Only scroll when the target is actually off screen: a step whose anchor is already visible must
    // not throw away the position the learner chose.
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
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    if (element) observer?.observe(element);
    // Content arriving above the anchor moves it without touching the anchor's own box.
    observer?.observe(document.documentElement);
    // The backstop for a reflow that changes neither: cheap, and this only runs while the card is up.
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
    const query = (() => {
      try {
        return window.matchMedia('(max-width: 767px)');
      } catch {
        return null;
      }
    })();
    if (!query) return;
    const onChange = () => setIsPhone(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  // Focus follows the kind of step. An information step is the card's; an action step belongs to the
  // control the learner has to use, and the runner focuses that one.
  useEffect(() => {
    if (step.gate === 'next') cardRef.current?.focus({ preventScroll: true });
  }, [step]);

  // The anchor of record, updated as the tour moves.
  useEffect(() => {
    const element = anchorElement(step);
    if (element) lastAnchorRef.current = element;
  }, [step]);

  // …and when the card goes away, focus goes back to something on the page rather than to `body`: a
  // keyboard user whose focus was on a button that no longer exists starts tabbing from the top.
  useEffect(
    () => () => {
      const active = document.activeElement;
      const fromCard = !active || active === document.body || cardRef.current?.contains(active);
      if (!fromCard) return;
      const target =
        lastAnchorRef.current?.matches('button, a, input, [tabindex]')
          ? lastAnchorRef.current
          : document.querySelector<HTMLElement>('[data-tour="run-button"], [data-tour="editor"] .cm-content');
      target?.focus?.({ preventScroll: true });
    },
    []
  );

  const placement = useMemo(() => {
    if (!rect || typeof window === 'undefined') return null;
    return placeCard(rect, window.innerWidth, window.innerHeight);
  }, [rect]);

  const card = (
    <div
      ref={cardRef}
      data-testid="first-run-tour"
      data-tour-step={step.id}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      tabIndex={-1}
      // The phone sheet is a sibling of the page, not an overlay: `pointer-events` is left alone so a
      // learner can still tap the region behind it if they want to ignore the tour entirely.
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
              maxHeight: '40vh',
              overflowY: 'auto',
              borderColor: 'var(--border-strong)',
              backgroundColor: 'var(--panel)',
              color: 'var(--text)',
            }
          : {
              width: placement?.width ?? CARD_WIDTH,
              left: placement?.left ?? EDGE,
              top: placement?.top ?? EDGE,
              // A short window with a long step must scroll the card, not run off the screen: the
              // buttons are at the bottom of it.
              maxHeight: `calc(100vh - ${EDGE * 2}px)`,
              overflowY: 'auto',
              borderColor: 'var(--border-strong)',
              backgroundColor: 'var(--panel)',
              color: 'var(--text)',
            }
      }
    >
      <p
        className="text-[11px] font-mono uppercase tracking-[0.08em]"
        style={{ color: 'var(--accent)' }}
      >
        {stepAnnouncement(index)}
      </p>
      <h2 id={titleId} className="mt-1 text-[13.5px] font-bold">
        {step.title}
      </h2>
      <p id={bodyId} className="mt-1 text-[12.5px] leading-relaxed" style={{ color: 'var(--body)' }}>
        {step.id === 'results' && passedFirstTry
          ? 'You passed on your first run — nice. The checks are there for the next lesson, when the starter needs work.'
          : step.body}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {primary && (
          <button
            type="button"
            onClick={onNext}
            data-testid="btn-tour-next"
            className="btn btn-primary min-h-[44px] px-3 py-1.5 text-[12.5px] font-bold sm:min-h-0"
          >
            {primary}
          </button>
        )}
        {step.skippable && (
          <button
            type="button"
            onClick={onSkipStep}
            data-testid="btn-tour-skip-step"
            className="min-h-[44px] px-2 py-1 text-[12px] font-mono underline sm:min-h-0"
            style={{ color: 'var(--muted)' }}
          >
            I'll do it later
          </button>
        )}
        <span className="ml-auto text-[11px] font-mono tabular-nums" style={{ color: 'var(--faint)' }}>
          {index + 1} / {TOUR_STEP_COUNT}
        </span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Skip the tour"
          title="Skip the tour (Esc)"
          data-testid="btn-tour-dismiss"
          // 44 px on a phone: the sheet is thumb territory, and a 32 px target beside a 44 px one is a
          // miss waiting to happen. The desktop card keeps the slimmer box.
          className="grid h-11 w-11 place-items-center rounded border sm:h-8 sm:w-8"
          style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );

  // A ring with a shadow instead of a backdrop: `pointer-events: none` keeps the highlighted control —
  // and everything around it — clickable, so step 4 can ask for a press the learner can actually make.
  const ring =
    rect && !isPhone ? (
      <div
        aria-hidden="true"
        data-testid="first-run-tour-ring"
        className="fixed z-40"
        style={{
          top: rect.top - 6,
          left: rect.left - 6,
          width: rect.width + 12,
          height: rect.height + 12,
          borderRadius: 12,
          boxShadow: '0 0 0 3px var(--accent), 0 0 0 9999px rgba(6, 8, 12, 0.55)',
          pointerEvents: 'none',
        }}
      />
    ) : null;

  return (
    <>
      {ring}
      {/* One live region for the whole tour: a screen reader hears the step it is on, and the card
          below is what a sighted learner reads. Announced rather than focused, because the action
          steps deliberately move focus to the editor. */}
      <p aria-live="polite" className="sr-only">
        {stepAnnouncement(index)}
      </p>
      {card}
    </>
  );
};
