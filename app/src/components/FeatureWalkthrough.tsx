import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Check, ChevronLeft, ChevronRight, Compass, RotateCcw, Trophy, X } from 'lucide-react';
import {
  FEATURE_WALKTHROUGH,
  FEATURE_WALKTHROUGH_COUNT,
  FEATURE_WALKTHROUGH_SECTIONS,
  completeWalkthroughStop,
  dismissWalkthroughState,
  nextWalkthroughState,
  previousWalkthroughState,
  readWalkthroughState,
  resetWalkthroughState,
  resumeWalkthroughState,
  walkthroughAction,
  walkthroughAnnouncement,
  walkthroughCheckedCount,
  walkthroughIndicesForTab,
  walkthroughSectionAt,
  writeWalkthroughState,
  type WalkthroughState,
} from '../featureWalkthrough';
import { playCue, playUi } from '../audio/facade';
import { playShortcut } from '../audio/shortcutSound';
import type { TabId } from '../types';

const CARD_GAP = 14;
const CARD_WIDTH = 384;
const CARD_HEIGHT_ESTIMATE = 360;
const SPOT_PAD = 5;
/** How long the control a stop opens is left on screen before the card clears it away. */
const SURFACE_CLEAR_DELAY = 1000;

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

/** The exact control a click landed in, or null when it was a neighbour. */
function clickedActionElement(
  clicked: EventTarget | null,
  selectors: readonly string[]
): HTMLElement | null {
  if (!(clicked instanceof Node)) return null;
  for (const selector of selectors) {
    let nodes: NodeListOf<HTMLElement>;
    try {
      nodes = document.querySelectorAll<HTMLElement>(selector);
    } catch {
      continue;
    }
    for (const node of nodes) {
      if (node.contains(clicked)) return node;
    }
  }
  return null;
}

function sameRect(a: TargetRect | null, b: TargetRect | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
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
 * What the spotlight measures, in order: the control the mission actually names, then the disclosure
 * that reveals it, then the stop's broader anchors. Without the first two a stop like Appearance
 * outlined the sound switch while its card asked for the theme switch.
 */
function spotlightAnchors(stopId: string, anchors: readonly string[]): string[] {
  const action = walkthroughAction(stopId);
  return [...(action?.selectors ?? []), ...(action?.reveal ?? []), ...anchors];
}

/** Every dialog on screen, so a press can tell which window it opened. */
function openDialogRoots(): Element[] {
  return Array.from(
    document.querySelectorAll('[role="dialog"], [role="alertdialog"]')
  ).filter((node) => node.getAttribute('data-testid') !== 'feature-walkthrough');
}

/**
 * Close the windows a press just opened, and only those. A walkthrough stop may demonstrate a tray
 * or a settings sheet, but leaving it on top hides the next stop's control and traps the card's
 * clicks. Escape is the app's own way out of every one of these surfaces.
 */
function clearDialogsOpenedSince(before: readonly Element[]) {
  for (const node of openDialogRoots()) {
    if (before.includes(node)) continue;
    node.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    );
  }
}

/** Everything already expanded when the stop arrived, so moving on closes only what that stop opened. */
interface SurfaceBaseline {
  dialogs: Element[];
  expanded: HTMLElement[];
}

function expandedControls(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[aria-expanded="true"]'));
}

function readSurfaceBaseline(): SurfaceBaseline {
  return { dialogs: openDialogRoots(), expanded: expandedControls() };
}

/**
 * A trigger whose `aria-expanded` belongs to a dialog. Escape already closed that window; pressing
 * the trigger again would only reopen the surface the tour is trying to clear.
 */
function isDialogTrigger(node: HTMLElement): boolean {
  const popup = node.getAttribute('aria-haspopup');
  if (popup && popup !== 'false') return true;
  const controls = node.getAttribute('aria-controls');
  if (!controls) return false;
  return controls
    .split(/\s+/)
    .some((id) => document.getElementById(id)?.matches('[role="dialog"], [role="alertdialog"]'));
}

/**
 * Put the workbench back the way it was before a stop expanded it. Moving on or closing the tour
 * dismisses the dialogs it opened with Escape, then clicks inline disclosures that were closed at
 * the start shut. A surface the learner already had open before the tour, and the tour's own card,
 * are left untouched. Without this the next stop is buried under the last one's panel.
 */
function collapseSurfacesSince(baseline: SurfaceBaseline) {
  for (const node of openDialogRoots()) {
    if (baseline.dialogs.includes(node)) continue;
    node.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    );
  }
  window.setTimeout(() => {
    for (const node of expandedControls()) {
      if (baseline.expanded.includes(node)) continue;
      if (node.closest('[data-testid="feature-walkthrough"]')) continue;
      if (node.closest('[role="dialog"], [role="alertdialog"]')) continue;
      if (isDialogTrigger(node)) continue;
      node.click();
    }
  }, 0);
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
  // A phone has no gutter to sit a tooltip in, so the card becomes an edge sheet: it docks opposite
  // the spotlight and leaves the outlined control visible. It keeps the spotlight, the copy and
  // both buttons usable at 360 px where the desktop two-column placement has nowhere to go.
  if (viewport.width < 640) {
    const width = Math.max(0, viewport.width - 16);
    const sheetMax = Math.max(220, Math.min(viewport.height - 24, 520));
    if (!target) {
      return {
        left: 8,
        top: Math.max(8, viewport.height - sheetMax - 8),
        width,
        maxHeight: sheetMax,
      };
    }
    // The card is docked on the side of the viewport the spot is not: below a header control, above
    // a footer one. Either way it stops before the spot rather than growing back over it.
    const targetIsLow = target.top + target.height / 2 > viewport.height / 2;
    if (targetIsLow) {
      return {
        left: 8,
        top: 8,
        width,
        maxHeight: Math.max(180, Math.min(sheetMax, target.top - 20)),
      };
    }
    const top = Math.max(96, target.bottom + 12);
    return {
      left: 8,
      top,
      width,
      maxHeight: Math.max(180, Math.min(sheetMax, viewport.height - top - 8)),
    };
  }

  const width = Math.min(CARD_WIDTH, viewport.width - 24);
  if (!target) {
    return {
      left: Math.max(12, (viewport.width - width) / 2),
      top: Math.max(12, (viewport.height - CARD_HEIGHT_ESTIMATE) / 2),
      width,
      maxHeight: viewport.height - 24,
    };
  }

  // The room on each side is measured against the target itself, and the card is never allowed to
  // grow back over it: a card that covers the outlined control takes the very click it asks for.
  const roomBelow = Math.max(0, viewport.height - 12 - (target.bottom + CARD_GAP));
  const roomAbove = Math.max(0, target.top - CARD_GAP - 12);
  const fitsBelow = roomBelow >= CARD_HEIGHT_ESTIMATE || roomBelow >= roomAbove;
  const top = fitsBelow
    ? target.bottom + CARD_GAP
    : Math.max(12, target.top - CARD_HEIGHT_ESTIMATE - CARD_GAP);
  const room = fitsBelow ? roomBelow : roomAbove;

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
  return { left, top, width, maxHeight: Math.max(140, Math.min(room, viewport.height - 24)) };
}

/**
 * The feature walkthrough (`components/FeatureWalkthrough.tsx`).
 *
 * A non-modal pointer that walks the actual workbench: each stop navigates to its tab, finds the
 * anchor and draws the card beside it. The page is dimmed just outside the spotlight so the named
 * control is the brightest thing on screen, but nothing is blocked — the dim is a shadow, not an
 * interactive scrim, so the page keeps every click and scroll and a press anywhere but the card
 * changes nothing at all. It is the detailed half of the new-learner guide — the guide explains the
 * shape, this names every control and the gesture that uses it.
 *
 * **A stop is a task, not a gate.** The highlighted control stays live and is outlined, so the
 * learner can try it themselves; clicking it crosses the stop's checklist row off and sounds the
 * workbench's pass phrase. Next is always available — the card never demands a click before it will
 * move on — and *Reset points* clears every tick and returns to the first stop. The checked ids are
 * stored with the tour position, so a learner can stop midway and come back to the checklist they
 * left.
 *
 * The card stays until its own Close button is used (Escape is the keyboard equivalent); a misclick
 * is inert. The control the learner presses stays the focus after it expands, so the outline marks
 * where the click landed rather than snapping to whatever the press popped open. Moving on,
 * stepping back or closing the tour collapses anything the stop expanded. No scroll is locked, so
 * the card can never strand a learner on a page they cannot move.
 */
export function FeatureWalkthrough({
  onClose,
  onNavigate,
  scopeTab,
}: {
  onClose: () => void;
  onNavigate: (tab: TabId) => void;
  /** When set, the tour walks only the stops that belong to this tab (the header's page tour). */
  scopeTab?: TabId;
}) {
  const [state, setState] = useState<WalkthroughState>(() =>
    resumeWalkthroughState(readWalkthroughState())
  );
  const [target, setTarget] = useState<TargetRect | null>(null);
  // The card is not drawn until the new stop's anchor is measured. Without this a stop whose tab
  // is still mounting painted the card centred, then snapped it beside the control a frame later.
  const [placed, setPlaced] = useState(false);
  const [justChecked, setJustChecked] = useState(false);
  // The entrance is a one-shot: it is detached on its own `animationend`, so the checked pulse
  // cannot re-attach it and replay the slide 700 ms after a click.
  const [entering, setEntering] = useState(true);
  // Which button moved the tour decides the entrance direction; the stop chooses the variant.
  const [navDirection, setNavDirection] = useState<'start' | 'next' | 'back'>('start');
  // A page tour is a cursor into the tab's stops, not a second saved position: closing it leaves the
  // learner's place in the full 36-stop walk untouched.
  const [scopeCursor, setScopeCursor] = useState(0);
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
  const surfaceTimer = useRef<number | null>(null);
  // The control just pressed, kept as the spotlight target even if its menu closes under it.
  const pinned = useRef<{ element: HTMLElement; rect: TargetRect } | null>(null);
  const surfaceBaseline = useRef<SurfaceBaseline | null>(null);

  const scopeIndices = useMemo(
    () => (scopeTab ? walkthroughIndicesForTab(scopeTab) : []),
    [scopeTab]
  );
  const scoped = scopeIndices.length > 0;
  const scopePosition = scoped
    ? Math.min(scopeCursor, Math.max(0, scopeIndices.length - 1))
    : 0;
  const activeIndex = scoped ? (scopeIndices[scopePosition] ?? 0) : state.index;
  const stop = FEATURE_WALKTHROUGH[activeIndex] ?? FEATURE_WALKTHROUGH[0]!;
  const stopRef = useRef(stop);
  stopRef.current = stop;
  const checked = new Set(state.completed);
  const isChecked = checked.has(stop.id);
  const checkedCount = walkthroughCheckedCount(state);
  const section = walkthroughSectionAt(activeIndex);
  const sectionIndex = FEATURE_WALKTHROUGH_SECTIONS.indexOf(section);
  const sectionStops = FEATURE_WALKTHROUGH.slice(section.first, section.first + section.count);
  const visibleStops = scoped
    ? scopeIndices.map((index) => FEATURE_WALKTHROUGH[index]!)
    : sectionStops;
  const cursor = scoped ? scopePosition : Math.max(0, activeIndex - section.first);
  const isLast = cursor >= visibleStops.length - 1;
  const atSectionEnd = !scoped && isLast && activeIndex < FEATURE_WALKTHROUGH_COUNT - 1;
  const checkedVisible = visibleStops.filter((entry) => checked.has(entry.id)).length;
  const score = String(checkedCount * 100).padStart(4, '0');
  const action = walkthroughAction(stop.id);

  const commit = (next: WalkthroughState) => {
    writeWalkthroughState(next);
    stateRef.current = next;
    setState(next);
  };

  /** Close what the stop expanded, and cancel the delayed sweep so it cannot reach a later stop. */
  const collapseOpenedSurfaces = () => {
    const baseline = surfaceBaseline.current;
    if (!baseline) return;
    collapseSurfacesSince(baseline);
    if (surfaceTimer.current !== null) {
      window.clearTimeout(surfaceTimer.current);
      surfaceTimer.current = null;
    }
  };

  const close = () => {
    const current = stateRef.current;
    collapseOpenedSurfaces();
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

  /** Moving on never asks whether the box is ticked: the tour points, it does not gate. */
  const advance = () => {
    collapseOpenedSurfaces();
    setNavDirection('next');
    setJustChecked(false);
    // A page tour ends at its own last stop and closes; it never marks the full walk completed.
    if (scoped) {
      if (scopePosition >= scopeIndices.length - 1) {
        playCue('verify');
        onClose();
        return;
      }
      setScopeCursor(scopePosition + 1);
      return;
    }
    const current = stateRef.current;
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
    if (scoped ? scopePosition === 0 : state.index === 0) return;
    collapseOpenedSurfaces();
    setNavDirection('back');
    setJustChecked(false);
    if (scoped) {
      setScopeCursor(scopePosition - 1);
      return;
    }
    commit(previousWalkthroughState(stateRef.current));
  };

  /** Wipe the score and start the walk from its first stop, without leaving the workbench. */
  const resetPoints = () => {
    collapseOpenedSurfaces();
    setNavDirection('back');
    const next = resetWalkthroughState();
    writeWalkthroughState(next);
    stateRef.current = next;
    setState(next);
    setScopeCursor(0);
    setJustChecked(false);
    playUi('close');
  };

  /** Jump to a chapter's first stop without changing what has been checked. */
  const jumpToSection = (nextSection: number) => {
    if (nextSection === sectionIndex) return;
    collapseOpenedSurfaces();
    setNavDirection(nextSection > sectionIndex ? 'next' : 'back');
    setJustChecked(false);
    const next = FEATURE_WALKTHROUGH_SECTIONS[nextSection];
    if (!next) return;
    commit({ ...stateRef.current, status: 'active', index: next.first, updatedAt: Date.now() });
  };

  useEffect(
    () => () => {
      if (celebrateTimer.current !== null) window.clearTimeout(celebrateTimer.current);
      if (surfaceTimer.current !== null) window.clearTimeout(surfaceTimer.current);
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
  // for. A lazy tab can take a moment to arrive, so the search is bounded and retried. The measure
  // runs before paint, so the card is born in its final place instead of appearing centred first.
  useLayoutEffect(() => {
    // A stop whose action is the tab itself must leave the learner that tab to open; anything else
    // navigates first so the control it describes is already on screen.
    if (stop.tab && !walkthroughAction(stop.id)?.opensTab) navigateRef.current(stop.tab);
    // Only what this stop opened may be folded on the next move. A surface that was already open
    // when the stop arrived belongs to the learner, so the baseline is taken per stop.
    surfaceBaseline.current = readSurfaceBaseline();
    setEntering(true);
    pinned.current = null;
    if (surfaceTimer.current !== null) {
      window.clearTimeout(surfaceTimer.current);
      surfaceTimer.current = null;
    }
    let cancelled = false;
    let tries = 0;
    let scrolls = 0;
    let timer = 0;
    setTarget(null);
    setPlaced(false);
    // A stop whose anchor has genuinely gone still gets readable copy, centred, after a beat.
    const fallback = window.setTimeout(() => setPlaced(true), 2200);

    const locate = () => {
      if (cancelled) return;
      const node = findVisible(spotlightAnchors(stop.id, stop.anchors));
      if (!node) {
        if (tries < 24) {
          tries += 1;
          timer = window.setTimeout(locate, 120);
        }
        return;
      }
      const rect = node.getBoundingClientRect();
      // A target under the sticky header or below the fold is scrolled into the comfortable middle
      // before it is measured again. The retry is bounded: a control inside a panel that cannot
      // scroll would otherwise leave the spotlight with no control to point at.
      if ((rect.top < 80 || rect.bottom > window.innerHeight - 80) && scrolls < 2) {
        scrolls += 1;
        node.scrollIntoView({ block: 'center', inline: 'nearest' });
        timer = window.setTimeout(locate, 280);
        return;
      }
      setTarget(readRect(node));
      setPlaced(true);
    };

    const onReflow = () => {
      const pin = pinned.current;
      const next = pin
        ? ((pin.element.isConnected ? readRect(pin.element) : null) ?? pin.rect)
        : readRect(findVisible(spotlightAnchors(stop.id, stop.anchors)));
      setTarget(next);
      if (next) setPlaced(true);
    };

    locate();
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.clearTimeout(fallback);
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [activeIndex, stop]);

  // The anchor can move without a scroll or a resize: a lazy tab finishes loading, a panel folds,
  // an editor changes height, a dialog closes. Following it on a short clock keeps the hole on the
  // control, rather than on where it used to be, while the learner is being asked to press it.
  useEffect(() => {
    const follow = () => {
      // After a press, the control that was clicked is the focus even if its menu or dialog closes.
      const pin = pinned.current;
      if (pin) {
        const measured = pin.element.isConnected ? readRect(pin.element) : null;
        if (measured) pin.rect = measured;
        const next = measured ?? pin.rect;
        setTarget((previous) => (sameRect(previous, next) ? previous : next));
        return;
      }
      const next = readRect(findVisible(spotlightAnchors(stop.id, stop.anchors)));
      setTarget((previous) => (sameRect(previous, next) ? previous : next));
      if (next) setPlaced(true);
    };
    const timer = window.setInterval(follow, 120);
    return () => window.clearInterval(timer);
  }, [activeIndex, stop]);

  // The real control is the checklist box. Only a click on the exact action control checks the
  // stop; a click on the surrounding panel or another control does not. The window that press
  // opened is captured before the app handles the click, then dismissed a beat later, so the next
  // stop is never left behind a settings sheet or a palette.
  useEffect(() => {
    const currentAction = walkthroughAction(stop.id);
    if (!currentAction) return;
    const onClick = (event: MouseEvent) => {
      const control = clickedActionElement(event.target, currentAction.selectors);
      if (!control) return;
      const openedBefore = openDialogRoots();
      // The outline stays on the area that was pressed, not on whatever the press opened. A menu
      // that closes after the click keeps its last measured rectangle, so the focus does not vanish.
      const rect = readRect(control);
      if (rect) {
        pinned.current = { element: control, rect };
        setTarget(rect);
      }
      completeRef.current();
      // Drop the entrance now: the checked pulse is the only animation the card should replay.
      setEntering(false);
      if (surfaceTimer.current !== null) window.clearTimeout(surfaceTimer.current);
      surfaceTimer.current = window.setTimeout(() => {
        surfaceTimer.current = null;
        clearDialogsOpenedSince(openedBefore);
      }, SURFACE_CLEAR_DELAY);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [activeIndex, stop.id]);

  // Focus moves with the card, never into the page behind it. A new mission also clears the
  // celebration from the stop before it.
  useEffect(() => {
    setJustChecked(false);
    if (placed) cardRef.current?.focus({ preventScroll: true });
  }, [activeIndex, placed]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      playUi('close');
      event.preventDefault();
      close();
    }
  };

  // The arrows belong to the tour wherever focus is, not only while the card holds it: pressing a
  // stop's button must not strand the learner on the mouse. Editable fields keep their own arrows,
  // and an open sheet or palette (which owns the keyboard) keeps them too.
  const advanceRef = useRef(advance);
  advanceRef.current = advance;
  const backRef = useRef(back);
  backRef.current = back;
  useEffect(() => {
    const onArrow = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      const targetNode = event.target instanceof HTMLElement ? event.target : null;
      if (targetNode?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (openDialogRoots().length > 0) return;
      playShortcut('nav', event);
      event.preventDefault();
      if (event.key === 'ArrowRight') advanceRef.current();
      else backRef.current();
    };
    document.addEventListener('keydown', onArrow);
    return () => document.removeEventListener('keydown', onArrow);
  }, []);

  // A page tour always begins at its first stop, even if the component survives a scope change.
  useEffect(() => {
    setScopeCursor(0);
  }, [scopeTab]);

  const cardStyle = placeCard(target, viewport);
  const progress = scoped
    ? `${String(scopePosition + 1).padStart(2, '0')} / ${String(scopeIndices.length).padStart(2, '0')}`
    : `${String(activeIndex + 1).padStart(2, '0')} / ${FEATURE_WALKTHROUGH_COUNT}`;
  const progressPercent =
    visibleStops.length > 0 ? (checkedVisible / visibleStops.length) * 100 : 0;
  const nextLabel = isLast ? (atSectionEnd ? 'Next section' : 'Finish') : 'Next';
  const spot = target
    ? {
        top: Math.max(4, target.top - SPOT_PAD),
        left: Math.max(4, target.left - SPOT_PAD),
        width: target.width + SPOT_PAD * 2,
        height: target.height + SPOT_PAD * 2,
      }
    : null;
  // The ghost click travels from the card to the control, so the gesture is shown rather than
  // written down. The offset is measured from the card's centre to the spotlight's centre.
  const cardCenter = {
    x: (Number(cardStyle.left) || 0) + (Number(cardStyle.width) || CARD_WIDTH) / 2,
    y: (Number(cardStyle.top) || 0) + CARD_HEIGHT_ESTIMATE / 2,
  };
  const demo = spot
    ? {
        dx: Math.max(-84, Math.min(84, cardCenter.x - (spot.left + spot.width / 2))),
        dy: Math.max(-84, Math.min(84, cardCenter.y - (spot.top + spot.height / 2))),
      }
    : { dx: 48, dy: 32 };

  // The fixed layer takes no pointer events: the dim is the spotlight's own shadow, not an element,
  // so every press that is not on the card belongs to the learner's page and reaches it untouched.
  return (
    <div
      className={`tour-accent-${sectionIndex} pointer-events-none fixed inset-0 z-[90]`}
      role="dialog"
      aria-labelledby="walkthrough-title"
      data-testid="feature-walkthrough"
      data-index={activeIndex}
      data-checked={isChecked ? 'true' : 'false'}
      data-scope={scoped ? 'page' : 'all'}
    >
      {spot && (
        <div
          key={`spot-${stop.id}`}
          aria-hidden="true"
          data-testid="walkthrough-spotlight"
          data-checked={isChecked ? 'true' : 'false'}
          className={`walkthrough-spot pointer-events-none fixed rounded-xl border-2 transition-all duration-200 ${
            justChecked ? 'walkthrough-spot-checked' : ''
          }`}
          style={spot}
        >
          <span
            className="walkthrough-dot"
            style={{ '--demo-dx': `${demo.dx}px`, '--demo-dy': `${demo.dy}px` } as CSSProperties}
          />
          <span className="walkthrough-ripple" />
        </div>
      )}

      <div
        key={stop.id}
        ref={cardRef}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        style={cardStyle}
        data-testid="walkthrough-card"
        data-placed={placed ? 'true' : 'false'}
        data-just-checked={justChecked ? 'true' : 'false'}
        data-nav={navDirection}
        data-motion={activeIndex % 5}
        onAnimationEnd={(event) => {
          // Detach the entrance when it finishes. Leaving it applied lets the checked pulse re-run
          // the slide on the next paint, which is the second entrance learners were seeing.
          if (event.animationName.startsWith('walkthrough-in-')) setEntering(false);
        }}
        className={`walkthrough-card pointer-events-auto fixed overflow-y-auto overflow-x-hidden rounded-2xl border bg-panel/95 text-ink shadow-[var(--shadow-lg)] outline-none backdrop-blur-xl ${
          placed ? (entering ? 'walkthrough-enter' : '') : 'pointer-events-none opacity-0'
        } ${justChecked ? 'walkthrough-card-checked' : ''}`}
      >
        <span aria-hidden="true" className="walkthrough-beam-clip">
          <span className="walkthrough-beam" />
        </span>
        <header className="flex items-center justify-between gap-2 border-b border-line-soft px-3.5 py-2.5">
          <span className="flex min-w-0 items-center gap-2">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                isChecked ? 'border-emerald/50 bg-emerald/15 text-emerald' : ''
              }`}
              style={
                isChecked
                  ? undefined
                  : {
                      borderColor: 'color-mix(in srgb, var(--tour-accent) 40%, var(--border))',
                      background: 'color-mix(in srgb, var(--tour-accent) 13%, transparent)',
                      color: 'var(--tour-accent-text)',
                    }
              }
            >
              {isChecked ? (
                <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Compass className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </span>
            <span className="min-w-0">
              <span
                className="block font-mono text-[9px] uppercase tracking-[0.18em]"
                style={{ color: 'var(--tour-accent-text)' }}
              >
                {scoped ? 'Page walkthrough' : 'Walkthrough'}
              </span>
              <span className="block font-mono text-[10px] text-faint">
                <span className="uppercase tracking-[0.1em]">Mission</span>{' '}
                <span data-testid="walkthrough-progress">
                  {progress} · {scoped ? 'Page tour' : stop.section}
                </span>
              </span>
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            <span
              data-testid="walkthrough-score"
              className="rounded-md border border-line-soft bg-canvas px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums"
              style={{ color: 'var(--tour-accent-text)' }}
              title={`${checkedCount * 100} XP — 100 for every mission checked`}
            >
              ★ {score}
            </span>
            <button
              type="button"
              onClick={resetPoints}
              data-testid="walkthrough-reset"
              aria-label="Reset walkthrough points"
              title="Reset points and start from the first feature"
              className="flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-line-soft px-1.5 font-mono text-[10px] text-muted transition-colors hover:border-line-strong hover:text-ink"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              <span className="hidden sm:inline">Reset</span>
            </button>
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

        {!scoped && (
          <div
            data-testid="walkthrough-sections"
            aria-label="Walkthrough sections"
            className="flex flex-wrap gap-1 border-b border-line-soft px-3.5 py-1.5"
          >
            {FEATURE_WALKTHROUGH_SECTIONS.map((entry, index) => {
              const current = index === sectionIndex;
              return (
                <button
                  key={entry.name}
                  type="button"
                  onClick={() => jumpToSection(index)}
                  data-testid={`walkthrough-section-${index}`}
                  aria-pressed={current}
                  aria-label={`${entry.name} — ${entry.count} stops`}
                  title={`${entry.name} — ${entry.count} stops`}
                  className="cursor-pointer rounded-md border border-line-soft px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-muted transition-colors hover:border-line-strong hover:text-ink"
                  style={
                    current
                      ? {
                          borderColor: 'color-mix(in srgb, var(--tour-accent) 50%, var(--border))',
                          background: 'color-mix(in srgb, var(--tour-accent) 14%, transparent)',
                          color: 'var(--tour-accent-text)',
                        }
                      : undefined
                  }
                >
                  {entry.short}
                </button>
              );
            })}
          </div>
        )}

        <div className="px-3.5 pb-2 pt-2.5">
          {/* The pips map the section the learner is in, not all 36 stops: a checked stop stays
              green after they walk past it, and the rail above moves between chapters. */}
          <div
            className="flex gap-[3px]"
            aria-hidden="true"
            data-testid="walkthrough-pips"
            data-section={sectionIndex}
          >
            {visibleStops.map((entry) => (
              <span
                key={entry.id}
                title={entry.title}
                className={`h-[3px] rounded-full transition-colors ${
                  visibleStops.length === 1 ? 'w-8' : 'flex-1'
                } ${checked.has(entry.id) ? 'bg-emerald' : entry.id === stop.id ? '' : 'bg-line-soft'}`}
                style={
                  !checked.has(entry.id) && entry.id === stop.id
                    ? { background: 'var(--tour-accent)' }
                    : undefined
                }
              />
            ))}
          </div>

          <p
            className="mt-3 font-mono text-[9px] uppercase tracking-[0.18em]"
            style={{ color: 'var(--tour-accent-text)' }}
          >
            {scoped ? 'This page' : stop.section}
            <span className="text-faint"> · {cursor + 1} of {visibleStops.length}</span>
          </p>
          <h2
            id="walkthrough-title"
            data-testid="walkthrough-title"
            className="mt-1 text-[17px] font-semibold leading-snug tracking-[-0.015em] text-ink"
          >
            {stop.title}
          </h2>
          <p className="mt-1.5 line-clamp-2 text-[12px] leading-[1.55] text-muted">{stop.body}</p>

          <div
            data-testid="walkthrough-checklist"
            data-done={isChecked ? 'true' : 'false'}
            data-action={action?.label ?? ''}
            className={`mt-3 flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-colors ${
              isChecked ? 'border-emerald/45 bg-emerald/10' : 'border-accent/30 bg-accent-soft/40'
            }`}
          >
            <span
              className={`walkthrough-check ${isChecked ? 'walkthrough-check-done' : ''}`}
              aria-hidden="true"
            >
              {isChecked ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <span className="walkthrough-check-dot" />
              )}
            </span>
            <span
              className={`min-w-0 flex-1 text-[12.5px] font-semibold leading-snug ${
                isChecked ? 'text-emerald' : 'text-ink'
              }`}
            >
              {action?.label ?? 'Use the outlined control.'}
            </span>
            <span className="shrink-0 font-mono text-[9px] tabular-nums text-muted">
              {isChecked ? '1 / 1' : '0 / 1'}
            </span>
          </div>
        </div>

        <footer className="sticky bottom-0 z-10 border-t border-line-soft bg-panel/95 px-3.5 py-2.5 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={back}
              disabled={scoped ? scopePosition === 0 : state.index === 0}
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
              aria-valuemax={visibleStops.length}
              aria-valuenow={checkedVisible}
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
              title={
                isLast
                  ? scoped
                    ? 'Finish this page tour'
                    : 'Finish the walkthrough'
                  : atSectionEnd
                    ? 'Next section'
                    : 'Next mission'
              }
              data-testid="walkthrough-next"
              className="inline-flex min-h-8 cursor-pointer items-center gap-0.5 rounded-lg px-2.5 text-[11px] font-semibold shadow-[0_0_18px_-6px_var(--tour-accent)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                background: 'var(--tour-accent)',
                color: 'var(--tour-accent-ink, var(--inverse))',
              }}
            >
              {nextLabel}
              {isLast && !atSectionEnd ? (
                <Check className="h-3 w-3" aria-hidden="true" />
              ) : (
                <ChevronRight className="h-3 w-3" aria-hidden="true" />
              )}
            </button>
          </div>
        </footer>
      </div>

      <p className="sr-only" aria-live="polite">
        {walkthroughAnnouncement(activeIndex)}
        {isChecked ? ' Checked.' : ' Not checked yet.'}
      </p>
    </div>
  );
}
