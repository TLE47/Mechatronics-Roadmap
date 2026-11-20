import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Compass,
  Square,
  Target,
  Trophy,
  X,
} from 'lucide-react';
import {
  FEATURE_WALKTHROUGH,
  FEATURE_WALKTHROUGH_COUNT,
  completeWalkthroughStop,
  dismissWalkthroughState,
  nextWalkthroughState,
  previousWalkthroughState,
  readWalkthroughState,
  resumeWalkthroughState,
  walkthroughAction,
  walkthroughAnnouncement,
  walkthroughCheckedCount,
  writeWalkthroughState,
  type WalkthroughState,
} from '../featureWalkthrough';
import { playCue, playUi } from '../audio/facade';
import { playShortcut } from '../audio/shortcutSound';
import type { TabId } from '../types';

const CARD_GAP = 14;
const CARD_WIDTH = 410;
const CARD_HEIGHT_ESTIMATE = 430;
const SPOT_PAD = 5;

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

/** Whether a click landed inside one of the exact controls the stop asks the learner to use. */
function clickedAction(clicked: EventTarget | null, selectors: readonly string[]): boolean {
  if (!(clicked instanceof Node)) return false;
  for (const selector of selectors) {
    let nodes: NodeListOf<HTMLElement>;
    try {
      nodes = document.querySelectorAll<HTMLElement>(selector);
    } catch {
      continue;
    }
    for (const node of nodes) {
      if (node.contains(clicked)) return true;
    }
  }
  return false;
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
 * A spotlit mission board that walks the actual workbench: each stop navigates to its tab, waits for
 * the anchor, dims everything else and draws the card beside it. It is the detailed half of the
 * new-learner guide — the guide explains the shape, this names every control and the gesture that
 * uses it.
 *
 * **A stop is a task, not a slide.** The highlighted control stays live: clicking it (or pressing
 * the card's *Do it* button, which activates the same control) checks the stop off, sounds the
 * workbench's pass phrase and unlocks Next. The checked ids are stored with the tour position, so a
 * learner can stop midway and come back to the checklist they left.
 *
 * The dimming is four panels around the spotlight rather than one sheet over it: that is what lets
 * the real control take the click. The card owns the keyboard (← →, Tab and Escape), the background
 * scroll is locked, closing never changes a learner's work, and every stop stays reversible.
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
  const [justChecked, setJustChecked] = useState(false);
  const [nudge, setNudge] = useState<'check' | 'missing' | null>(null);
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 1280 : window.innerWidth,
    height: typeof window === 'undefined' ? 800 : window.innerHeight,
  }));
  const cardRef = useRef<HTMLDivElement | null>(null);
  const navigateRef = useRef(onNavigate);
  navigateRef.current = onNavigate;
  const stateRef = useRef(state);
  stateRef.current = state;
  const celebrateTimer = useRef<number | null>(null);
  const nudgeTimer = useRef<number | null>(null);
  const revealTimer = useRef<number | null>(null);

  const stop = FEATURE_WALKTHROUGH[state.index] ?? FEATURE_WALKTHROUGH[0]!;
  const stopRef = useRef(stop);
  stopRef.current = stop;
  const checked = new Set(state.completed);
  const isChecked = checked.has(stop.id);
  const checkedCount = walkthroughCheckedCount(state);
  const isLast = state.index === FEATURE_WALKTHROUGH_COUNT - 1;
  const score = String(checkedCount * 100).padStart(4, '0');
  const action = walkthroughAction(stop.id);

  const commit = (next: WalkthroughState) => {
    writeWalkthroughState(next);
    stateRef.current = next;
    setState(next);
  };

  const close = () => {
    const current = stateRef.current;
    if (current.status !== 'completed') commit(dismissWalkthroughState(current));
    onClose();
  };

  /** Check the current stop off once, with the sound and the ring that says it landed. */
  const completeCurrent = () => {
    const current = stateRef.current;
    const currentStop = stopRef.current;
    if (current.completed.includes(currentStop.id)) return;
    const next = completeWalkthroughStop(current, currentStop.id);
    writeWalkthroughState(next);
    stateRef.current = next;
    setState(next);
    playCue('run-pass');
    setJustChecked(true);
    if (celebrateTimer.current !== null) window.clearTimeout(celebrateTimer.current);
    celebrateTimer.current = window.setTimeout(() => {
      celebrateTimer.current = null;
      setJustChecked(false);
    }, 700);
  };
  const completeRef = useRef(completeCurrent);
  completeRef.current = completeCurrent;

  /** A short shake for a missing action, or for Next pressed before the box is ticked. */
  const flashNudge = (kind: 'check' | 'missing') => {
    setNudge(kind);
    playUi('close');
    if (nudgeTimer.current !== null) window.clearTimeout(nudgeTimer.current);
    nudgeTimer.current = window.setTimeout(() => {
      nudgeTimer.current = null;
      setNudge(null);
    }, 900);
  };

  const advance = () => {
    const current = stateRef.current;
    if (!current.completed.includes(stopRef.current.id)) {
      flashNudge('check');
      return;
    }
    const next = nextWalkthroughState(current);
    writeWalkthroughState(next);
    stateRef.current = next;
    if (next.status === 'completed') {
      playCue('verify');
      onClose();
      return;
    }
    setState(next);
  };

  const back = () => {
    if (state.index === 0) return;
    commit(previousWalkthroughState(stateRef.current));
  };

  /**
   * Do it is a shortcut for the same gesture, not a score button: it presses the stop's exact
   * control. If that control is missing or disabled, the box stays open and the card says why,
   * because a tutorial that ticks itself teaches nothing.
   */
  const tryTarget = () => {
    const currentAction = walkthroughAction(stopRef.current.id);
    if (!currentAction) {
      flashNudge('missing');
      return;
    }
    const node = findVisible(currentAction.selectors);
    if (node) {
      if (node.matches(':disabled, [aria-disabled="true"]')) flashNudge('missing');
      else node.click();
      return;
    }
    // Share and Pair live inside More. Do it opens the disclosure first, then presses the exact
    // action once React has drawn it; a click on More alone still does not score.
    const reveal = currentAction.reveal ? findVisible(currentAction.reveal) : null;
    if (!reveal) {
      flashNudge('missing');
      return;
    }
    reveal.click();
    if (revealTimer.current !== null) window.clearTimeout(revealTimer.current);
    revealTimer.current = window.setTimeout(() => {
      revealTimer.current = null;
      const target = findVisible(currentAction.selectors);
      if (!target || target.matches(':disabled, [aria-disabled="true"]')) {
        flashNudge('missing');
        return;
      }
      target.click();
    }, 80);
  };

  // The page behind the tooltip is a backdrop with a hole in it. Locking the scroll keeps the
  // spotlight aligned, and restoring the previous value leaves an overflow style the app set alone.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(
    () => () => {
      if (celebrateTimer.current !== null) window.clearTimeout(celebrateTimer.current);
      if (nudgeTimer.current !== null) window.clearTimeout(nudgeTimer.current);
      if (revealTimer.current !== null) window.clearTimeout(revealTimer.current);
    },
    []
  );

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
    // A stop whose action is the tab itself must leave the learner that tab to open; anything else
    // navigates first so the control it describes is already on screen.
    if (stop.tab && !walkthroughAction(stop.id)?.opensTab) navigateRef.current(stop.tab);
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

  // The real control is the checklist box. Only a click on the exact action control checks the
  // stop; a click on the surrounding panel or another control does not.
  useEffect(() => {
    const currentAction = walkthroughAction(stop.id);
    if (!currentAction) return;
    const onClick = (event: MouseEvent) => {
      if (!clickedAction(event.target, currentAction.selectors)) return;
      completeRef.current();
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [state.index, stop.id]);

  // Focus moves with the card, never into the page behind it. A new mission also clears the
  // celebration and the nudge from the one before it.
  useEffect(() => {
    setJustChecked(false);
    setNudge(null);
    cardRef.current?.focus({ preventScroll: true });
  }, [state.index]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      playUi('close');
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'ArrowRight') {
      playShortcut('nav', event);
      event.preventDefault();
      advance();
      return;
    }
    if (event.key === 'ArrowLeft') {
      playShortcut('nav', event);
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
  const progressPercent = (checkedCount / FEATURE_WALKTHROUGH_COUNT) * 100;
  const spot = target
    ? {
        top: Math.max(4, target.top - SPOT_PAD),
        left: Math.max(4, target.left - SPOT_PAD),
        width: target.width + SPOT_PAD * 2,
        height: target.height + SPOT_PAD * 2,
      }
    : null;
  const backdrop = spot
    ? [
        { top: 0, left: 0, right: 0, height: Math.max(0, spot.top) },
        {
          top: spot.top,
          left: 0,
          width: Math.max(0, spot.left),
          height: Math.max(0, Math.min(viewport.height, spot.top + spot.height) - spot.top),
        },
        {
          top: spot.top,
          left: Math.min(viewport.width, spot.left + spot.width),
          right: 0,
          height: Math.max(0, Math.min(viewport.height, spot.top + spot.height) - spot.top),
        },
        {
          top: Math.min(viewport.height, spot.top + spot.height),
          left: 0,
          right: 0,
          bottom: 0,
        },
      ]
    : null;

  return (
    <div
      className="fixed inset-0 z-[90]"
      role="dialog"
      aria-labelledby="walkthrough-title"
      data-testid="feature-walkthrough"
      data-index={state.index}
      data-checked={isChecked ? 'true' : 'false'}
    >
      {/* Four panes, not one sheet: the hole is the point. A press on any pane still closes the
          tour, and the spotlit control keeps its own hit area. */}
      {backdrop ? (
        backdrop.map((piece, index) => (
          <button
            key={`walkthrough-backdrop-${index}`}
            type="button"
            aria-label="Close the feature walkthrough"
            tabIndex={-1}
            onClick={close}
            className="fixed cursor-default bg-[rgba(4,8,11,0.62)]"
            style={piece}
          />
        ))
      ) : (
        <button
          type="button"
          aria-label="Close the feature walkthrough"
          tabIndex={-1}
          onClick={close}
          className="absolute inset-0 h-full w-full cursor-default bg-[rgba(4,8,11,0.62)]"
        />
      )}

      {spot && (
        <div
          aria-hidden="true"
          data-testid="walkthrough-spotlight"
          data-checked={isChecked ? 'true' : 'false'}
          className={`pointer-events-none fixed rounded-xl border-2 transition-all duration-200 ${
            justChecked ? 'walkthrough-spot-checked' : ''
          }`}
          style={{
            ...spot,
            borderColor: isChecked ? 'var(--emerald)' : 'var(--accent)',
            boxShadow: `0 0 0 5px ${
              isChecked ? 'color-mix(in srgb, var(--emerald) 18%, transparent)' : 'var(--accent-soft)'
            }, 0 12px 40px -12px rgba(0,0,0,0.6)`,
          }}
        />
      )}

      <div
        ref={cardRef}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        style={cardStyle}
        data-testid="walkthrough-card"
        data-just-checked={justChecked ? 'true' : 'false'}
        className={`fixed overflow-y-auto rounded-2xl border bg-panel text-ink shadow-[var(--shadow-lg)] outline-none ${
          justChecked ? 'walkthrough-card-checked' : ''
        } ${nudge ? 'walkthrough-card-nudge' : ''}`}
      >
        <header className="flex items-center justify-between gap-2 border-b border-line-soft px-3.5 py-2.5">
          <span className="flex min-w-0 items-center gap-2">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                isChecked
                  ? 'border-emerald/50 bg-emerald/15 text-emerald'
                  : 'border-accent/30 bg-accent-soft text-accent'
              }`}
            >
              {isChecked ? (
                <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Compass className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </span>
            <span className="min-w-0">
              <span className="block font-mono text-[9px] uppercase tracking-[0.18em] text-accent">
                Tooltip walkthrough
              </span>
              <span className="block font-mono text-[10px] text-faint">
                <span className="uppercase tracking-[0.1em]">Mission</span>{' '}
                <span data-testid="walkthrough-progress">
                  {progress} · {stop.section} · {checkedCount} checked
                </span>
              </span>
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            <span
              data-testid="walkthrough-score"
              className="rounded-md border border-line-soft bg-canvas px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums text-accent"
              title={`${checkedCount * 100} XP — 100 for every mission checked`}
            >
              ★ {score}
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
          </span>
        </header>

        <div className="px-3.5 pb-2 pt-2.5">
          {/* Thirty-six pips are a map of the whole tour, not a second progress bar: a checked stop
              stays green after the learner walks past it. */}
          <div className="flex gap-[3px]" aria-hidden="true" data-testid="walkthrough-pips">
            {FEATURE_WALKTHROUGH.map((entry, index) => (
              <span
                key={entry.id}
                title={entry.title}
                className={`h-[3px] flex-1 rounded-full transition-colors ${
                  checked.has(entry.id)
                    ? 'bg-emerald'
                    : index === state.index
                      ? 'bg-accent'
                      : 'bg-line-soft'
                }`}
              />
            ))}
          </div>

          <h2
            id="walkthrough-title"
            data-testid="walkthrough-title"
            className="mt-2.5 text-[15px] font-semibold leading-snug tracking-[-0.01em] text-ink"
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

          <div
            data-testid="walkthrough-checklist"
            data-done={isChecked ? 'true' : 'false'}
            data-action={action?.label ?? ''}
            className={`mt-3 rounded-xl border px-2.5 py-2 transition-colors ${
              isChecked
                ? 'border-emerald/45 bg-emerald/10'
                : nudge
                  ? 'border-rose/60 bg-rose/10'
                  : 'border-line-soft bg-canvas'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-faint">
                Mission checklist
              </p>
              <span className="font-mono text-[9.5px] tabular-nums text-muted">
                {isChecked ? '1 / 1' : '0 / 1'}
              </span>
            </div>
            <div className="mt-1 flex items-start gap-2">
              {isChecked ? (
                <Check className="mt-[2px] h-3.5 w-3.5 shrink-0 text-emerald" aria-hidden="true" />
              ) : (
                <Square className="mt-[2px] h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
              )}
              <span className="min-w-0 flex-1 text-[12px] font-semibold leading-snug">
                {isChecked ? (
                  <span className="text-emerald">Checked off — nice work.</span>
                ) : (
                  <>
                    {action?.label ?? 'Use the highlighted control.'}
                    <span className="mt-0.5 block text-[11px] font-normal leading-snug text-muted">
                      Click that control yourself, or press <strong className="text-body">Do it</strong>{' '}
                      to press it for you. Next unlocks when the box is ticked.
                    </span>
                  </>
                )}
              </span>
              <button
                type="button"
                onClick={tryTarget}
                disabled={isChecked}
                title={action?.label ?? 'No action is recorded for this stop'}
                data-testid="walkthrough-do-it"
                className={`inline-flex min-h-8 shrink-0 items-center gap-1 rounded-lg border px-2 font-mono text-[11px] font-bold transition-colors ${
                  isChecked
                    ? 'cursor-default border-emerald/40 text-emerald'
                    : 'cursor-pointer border-accent/50 bg-accent-soft text-accent hover:bg-accent/20'
                }`}
              >
                {isChecked ? (
                  <Check className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <Target className="h-3 w-3" aria-hidden="true" />
                )}
                {isChecked ? 'Done' : 'Do it'}
              </button>
            </div>
            {nudge && !isChecked && (
              <p className="mt-1 font-mono text-[10.5px] text-rose" role="status">
                {nudge === 'missing'
                  ? `${action?.label ?? 'This stop’s control'} is not on screen. Open its panel first.`
                  : 'Check this stop off before moving on.'}
              </p>
            )}
          </div>
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
              aria-label="Walkthrough checklist progress"
              aria-valuemin={0}
              aria-valuemax={FEATURE_WALKTHROUGH_COUNT}
              aria-valuenow={checkedCount}
              className="hidden h-1 min-w-10 max-w-[7rem] flex-1 overflow-hidden rounded-full bg-line-soft sm:block"
            >
              <div
                className="h-full rounded-full bg-emerald transition-[width] duration-200"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <button
              type="button"
              onClick={advance}
              disabled={!isChecked}
              aria-disabled={!isChecked}
              title={isChecked ? 'Next mission' : 'Check the highlighted control off first'}
              data-testid="walkthrough-next"
              className="inline-flex min-h-8 cursor-pointer items-center gap-0.5 rounded-lg bg-accent px-2.5 text-[11px] font-semibold text-inverse transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
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
            {isChecked
              ? '✓ Checked · → next · ← back · Esc to close · your place is kept'
              : 'Do the spotlit control to check the box · ← back · Esc to close'}
          </p>
        </footer>
      </div>

      <p className="sr-only" aria-live="polite">
        {walkthroughAnnouncement(state.index)}
        {isChecked ? ' Checked.' : ' Not checked yet.'}
      </p>
    </div>
  );
}
