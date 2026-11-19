import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Check, ChevronLeft, ChevronRight, Compass, X } from 'lucide-react';
import {
  FEATURE_WALKTHROUGH,
  FEATURE_WALKTHROUGH_COUNT,
  dismissWalkthroughState,
  nextWalkthroughState,
  previousWalkthroughState,
  readWalkthroughState,
  resumeWalkthroughState,
  walkthroughAnnouncement,
  writeWalkthroughState,
  type WalkthroughState,
} from '../featureWalkthrough';
import type { TabId } from '../types';

const CARD_GAP = 14;
const CARD_WIDTH = 400;
const CARD_HEIGHT_ESTIMATE = 336;

interface TargetRect {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

function findVisible(anchors: readonly string[]): HTMLElement | null {
  for (const selector of anchors) {
    let nodes: NodeListOf<HTMLElement>;
    try {
      nodes = document.querySelectorAll<HTMLElement>(selector);
    } catch {
      continue;
    }
    for (const node of nodes) {
      const rect = node.getBoundingClientRect();
      if (rect.width > 2 && rect.height > 2) return node;
    }
  }
  return null;
}

function readRect(node: HTMLElement | null): TargetRect | null {
  if (!node) return null;
  const rect = node.getBoundingClientRect();
  if (rect.width < 3 || rect.height < 3) return null;
  return {
    top: rect.top,
    left: rect.left,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

/**
 * The tooltip's position. A short control gets the card below it when there is room; a tall panel
 * gets it beside; a control near the bottom gets it above. The card is clamped into the viewport at
 * every step, because the last thing a tour should do is point off-screen.
 */
function placeCard(
  target: TargetRect | null,
  viewport: { width: number; height: number }
): CSSProperties {
  const width = Math.min(CARD_WIDTH, viewport.width - 24);
  if (!target) {
    return {
      left: Math.max(12, (viewport.width - width) / 2),
      top: Math.max(12, (viewport.height - CARD_HEIGHT_ESTIMATE) / 2),
      width,
      maxHeight: viewport.height - 24,
    };
  }

  const fitsBelow = target.bottom + CARD_GAP + CARD_HEIGHT_ESTIMATE < viewport.height - 12;
  let top = fitsBelow
    ? target.bottom + CARD_GAP
    : Math.max(12, target.top - CARD_HEIGHT_ESTIMATE - CARD_GAP);

  // A narrow, tall target — the rail's fold button, a colour dot — is better read beside than
  // above or below, where the card would cover the thing it is describing.
  const narrowAndTall = target.width < 280 && target.height > 180;
  if (narrowAndTall && target.right + CARD_GAP + width < viewport.width - 12) {
    return {
      left: target.right + CARD_GAP,
      top: Math.min(
        Math.max(12, target.top),
        Math.max(12, viewport.height - CARD_HEIGHT_ESTIMATE - 12)
      ),
      width,
      maxHeight: viewport.height - 24,
    };
  }

  const left = Math.min(
    Math.max(12, target.left + target.width / 2 - width / 2),
    viewport.width - width - 12
  );
  return { left, top, width, maxHeight: Math.max(160, viewport.height - top - 12) };
}

/**
 * The feature walkthrough (`components/FeatureWalkthrough.tsx`).
 *
 * A spotlit tooltip that walks the actual workbench: each stop navigates to its tab, waits for the
 * anchor, dims everything else and draws the card beside it. It is the detailed half of the
 * new-learner guide — the guide explains the shape, this names every control and the gesture that
 * uses it.
 *
 * It is a dialog, not a passive overlay: the background is dimmed and inert, the card owns the
 * keyboard (← →, Tab and Escape), and the position is stored so turning it off midway resumes on the
 * same feature. Closing it never changes a learner's work, and every stop is read-only.
 */
export function FeatureWalkthrough({
  onClose,
  onNavigate,
}: {
  onClose: () => void;
  onNavigate: (tab: TabId) => void;
}) {
  const [state, setState] = useState<WalkthroughState>(() =>
    resumeWalkthroughState(readWalkthroughState())
  );
  const [target, setTarget] = useState<TargetRect | null>(null);
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 1280 : window.innerWidth,
    height: typeof window === 'undefined' ? 800 : window.innerHeight,
  }));
  const cardRef = useRef<HTMLDivElement | null>(null);
  const navigateRef = useRef(onNavigate);
  navigateRef.current = onNavigate;

  const stop = FEATURE_WALKTHROUGH[state.index] ?? FEATURE_WALKTHROUGH[0]!;
  const isLast = state.index === FEATURE_WALKTHROUGH_COUNT - 1;

  const commit = (next: WalkthroughState) => {
    writeWalkthroughState(next);
    setState(next);
  };

  const close = () => {
    if (state.status !== 'completed') commit(dismissWalkthroughState(state));
    onClose();
  };

  const advance = () => {
    const next = nextWalkthroughState(state);
    writeWalkthroughState(next);
    if (next.status === 'completed') {
      onClose();
      return;
    }
    setState(next);
  };

  const back = () => {
    if (state.index === 0) return;
    commit(previousWalkthroughState(state));
  };

  // The page behind the tooltip is not a second place to work: it is a backdrop. Locking the scroll
  // keeps the spotlight aligned, and restoring the previous value leaves an overflow style the app
  // set alone.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // The viewport is read rather than assumed: a phone rotation changes where the card may sit.
  useEffect(() => {
    const measure = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Opening a stop is also a navigation: the target tab is chosen first, then the anchor is looked
  // for. A lazy tab can take a moment to arrive, so the search is bounded and retried; a target that
  // never appears leaves the card centred, with the copy still readable.
  useEffect(() => {
    if (stop.tab) navigateRef.current(stop.tab);
    let cancelled = false;
    let tries = 0;
    let timer = 0;
    setTarget(null);

    const locate = () => {
      if (cancelled) return;
      const node = findVisible(stop.anchors);
      if (!node) {
        if (tries < 24) {
          tries += 1;
          timer = window.setTimeout(locate, 120);
        }
        return;
      }
      const rect = node.getBoundingClientRect();
      // A target under the sticky header or below the fold is scrolled into the comfortable middle
      // before it is measured again.
      if (rect.top < 80 || rect.bottom > window.innerHeight - 80) {
        node.scrollIntoView({ block: 'center', inline: 'nearest' });
        timer = window.setTimeout(locate, 280);
        return;
      }
      setTarget(readRect(node));
    };

    const onReflow = () => setTarget(readRect(findVisible(stop.anchors)));

    locate();
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [state.index, stop]);

  // Focus moves with the card, never into the page behind it.
  useEffect(() => {
    cardRef.current?.focus({ preventScroll: true });
  }, [state.index]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      advance();
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      back();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      cardRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? []
    );
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const cardStyle = placeCard(target, viewport);
  const progress = `${String(state.index + 1).padStart(2, '0')} / ${FEATURE_WALKTHROUGH_COUNT}`;
  const progressPercent = ((state.index + 1) / FEATURE_WALKTHROUGH_COUNT) * 100;

  return (
    <div
      className="fixed inset-0 z-[90]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="walkthrough-title"
      data-testid="feature-walkthrough"
      data-index={state.index}
    >
      <button
        type="button"
        aria-label="Close the feature walkthrough"
        tabIndex={-1}
        onClick={close}
        className="absolute inset-0 h-full w-full cursor-default bg-[rgba(4,8,11,0.62)]"
      />

      {target && (
        <div
          aria-hidden="true"
          data-testid="walkthrough-spotlight"
          className="pointer-events-none fixed rounded-xl border-2 transition-all duration-200"
          style={{
            top: Math.max(4, target.top - 5),
            left: Math.max(4, target.left - 5),
            width: target.width + 10,
            height: target.height + 10,
            borderColor: 'var(--accent)',
            boxShadow:
              '0 0 0 9999px rgba(4, 8, 11, 0.62), 0 0 0 5px var(--accent-soft), 0 12px 40px -12px rgba(0,0,0,0.6)',
          }}
        />
      )}

      <div
        ref={cardRef}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        style={cardStyle}
        className="fixed overflow-y-auto rounded-2xl border bg-panel text-ink shadow-[var(--shadow-lg)] outline-none"
      >
        <header className="flex items-center justify-between gap-2 border-b border-line-soft px-3.5 py-2.5">
          <span className="flex min-w-0 items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-accent/30 bg-accent-soft text-accent">
              <Compass className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block font-mono text-[9px] uppercase tracking-[0.18em] text-accent">
                Tooltip walkthrough
              </span>
              <span
                data-testid="walkthrough-progress"
                className="block font-mono text-[10px] text-faint"
              >
                {progress} · {stop.section}
              </span>
            </span>
          </span>
          <button
            type="button"
            onClick={close}
            data-testid="walkthrough-close"
            aria-label="Close the feature walkthrough"
            className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-line-soft text-muted transition-colors hover:border-line-strong hover:text-ink"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </header>

        <div className="px-3.5 pb-2 pt-3">
          <h2
            id="walkthrough-title"
            data-testid="walkthrough-title"
            className="text-[15px] font-semibold leading-snug tracking-[-0.01em] text-ink"
          >
            {stop.title}
          </h2>
          <p className="mt-1.5 text-[12px] leading-5 text-muted">{stop.body}</p>

          <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.16em] text-faint">
            Features and gestures
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {stop.features.map((feature) => (
              <li key={feature} className="flex gap-2 text-[11.5px] leading-[1.45] text-body">
                <Check
                  className="mt-[3px] h-3 w-3 shrink-0 text-accent"
                  aria-hidden="true"
                />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        <footer className="border-t border-line-soft bg-panel/95 px-3.5 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={back}
              disabled={state.index === 0}
              data-testid="walkthrough-prev"
              className="inline-flex min-h-8 cursor-pointer items-center gap-0.5 rounded-lg border border-line-soft px-2 text-[11px] font-semibold text-muted transition-colors hover:border-line-strong hover:text-ink disabled:cursor-default disabled:opacity-40"
            >
              <ChevronLeft className="h-3 w-3" aria-hidden="true" />
              Back
            </button>

            <div
              role="progressbar"
              aria-label="Walkthrough progress"
              aria-valuemin={1}
              aria-valuemax={FEATURE_WALKTHROUGH_COUNT}
              aria-valuenow={state.index + 1}
              className="hidden h-1 min-w-10 max-w-[7rem] flex-1 overflow-hidden rounded-full bg-line-soft sm:block"
            >
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-200"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <button
              type="button"
              onClick={advance}
              data-testid="walkthrough-next"
              className="inline-flex min-h-8 cursor-pointer items-center gap-0.5 rounded-lg bg-accent px-2.5 text-[11px] font-semibold text-inverse transition-opacity hover:opacity-90"
            >
              {isLast ? 'Finish' : 'Next'}
              {isLast ? (
                <Check className="h-3 w-3" aria-hidden="true" />
              ) : (
                <ChevronRight className="h-3 w-3" aria-hidden="true" />
              )}
            </button>
          </div>
          <p className="mt-1.5 hidden font-mono text-[9px] text-faint sm:block">
            ← → to move · Esc to close · your place is kept
          </p>
        </footer>
      </div>

      <p className="sr-only" aria-live="polite">
        {walkthroughAnnouncement(state.index)}
      </p>
    </div>
  );
}
