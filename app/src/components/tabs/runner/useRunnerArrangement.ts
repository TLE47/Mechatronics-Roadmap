import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  dockControl,
  flippedDock,
  layoutArrangement,
  readDock,
  readLayout,
  readSplitRatio,
  splitRatioAt,
  writeDock,
  writeLayout,
  writeSplitRatio,
  type WorkspaceDock,
  type WorkspaceLayout,
} from '../../../workspaceLayout';
import {
  readPanes,
  writePanes,
  type EditorPanes,
} from '../../../editorPanes';

/**
 * The runner's arrangement: which regions the screen gives its width to, which edge the chooser and
 * the results sit on, and how the editor body is split into panes (`runner/useRunnerArrangement.ts`).
 *
 * Every value here is a preference of this browser, read once at mount and written by the one
 * control that changes it. Keeping them together is what lets the tab read as assembly: the run
 * engine, the lesson and the rendered copy do not need to know how a drag becomes a ratio.
 */
export interface RunnerArrangement {
  layout: WorkspaceLayout;
  chooseLayout: (next: WorkspaceLayout) => void;
  layoutToolbarRef: React.RefObject<HTMLDivElement | null>;
  dock: WorkspaceDock;
  dockChoice: ReturnType<typeof dockControl>;
  flipDock: () => void;
  resultsSide: WorkspaceDock['results'];
  splitRatio: number;
  commitSplitRatio: (ratio: number) => void;
  draggingSplit: boolean;
  splitContainerRef: React.RefObject<HTMLDivElement | null>;
  beginSplitDrag: (event: React.PointerEvent<HTMLDivElement>) => void;
  moveSplitDrag: (event: React.PointerEvent<HTMLDivElement>) => void;
  endSplitDrag: (event: React.PointerEvent<HTMLDivElement>) => void;
  panes: EditorPanes;
  commitPanes: (next: EditorPanes) => void;
}

export function useRunnerArrangement(): RunnerArrangement {
  // Which of the three regions the screen gives its width to (`workspaceLayout.ts`). Read once at
  // mount: it is a preference, and a reload is the only thing that changes it from outside.
  const [layout, setLayout] = useState<WorkspaceLayout>(() => readLayout());
  // The toolbar is the control the preset is pressed on, so it is the one thing that must not move
  // when the preset changes which regions are mounted. Capture where it sat, put it back there.
  const layoutToolbarRef = useRef<HTMLDivElement>(null);
  const keepLayoutTop = useRef<number | null>(null);
  const chooseLayout = (next: WorkspaceLayout) => {
    const bar = layoutToolbarRef.current;
    keepLayoutTop.current = bar ? bar.getBoundingClientRect().top : null;
    setLayout(writeLayout(next));
  };
  useLayoutEffect(() => {
    const top = keepLayoutTop.current;
    keepLayoutTop.current = null;
    if (top === null || !layoutToolbarRef.current) return;
    const settle = () => {
      const bar = layoutToolbarRef.current;
      if (!bar) return;
      const delta = bar.getBoundingClientRect().top - top;
      if (Math.abs(delta) > 1) window.scrollBy(0, delta);
    };
    settle();
    // The lesson reader mounts at once but its Markdown arrives a moment later and grows the page
    // above the toolbar. Keep putting the toolbar back while that settles, and stop the moment the
    // learner takes over the scroll — a correction that fights a wheel is worse than a small jump.
    let active = true;
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(settle) : null;
    observer?.observe(document.body);
    let timer = 0;
    const cleanup = () => {
      if (!active) return;
      active = false;
      observer?.disconnect();
      window.clearTimeout(timer);
      window.removeEventListener('wheel', cleanup);
      window.removeEventListener('touchstart', cleanup);
      window.removeEventListener('keydown', cleanup);
    };
    timer = window.setTimeout(cleanup, 2500);
    window.addEventListener('wheel', cleanup, { passive: true });
    window.addEventListener('touchstart', cleanup, { passive: true });
    window.addEventListener('keydown', cleanup);
    return cleanup;
  }, [layout]);

  // Which edge the chooser (Study) and the results (Split) sit on (`workspaceLayout.ts`). Read once
  // at mount, like the preset: it is the same kind of preference, and only this screen changes it.
  const [dock, setDock] = useState<WorkspaceDock>(() => readDock());
  const dockChoice = dockControl(dock, layout);
  const resultsSide = dock.results;
  const flipDock = () => setDock(writeDock(flippedDock(dock, layout)));

  // Split's divider, as the share of the work area the editor gets (`workspaceLayout.ts`). Read once
  // at mount like the preset itself: a drag is the only thing that changes it from outside storage.
  const [splitRatio, setSplitRatio] = useState<number>(() => readSplitRatio());
  const splitRatioRef = useRef<number>(splitRatio);
  splitRatioRef.current = splitRatio;
  const [draggingSplit, setDraggingSplit] = useState(false);
  /** The pointer whose drag is in flight, so a second finger on a trackpad cannot drag both ways. */
  const splitDragRef = useRef<number | null>(null);
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const commitSplitRatio = (ratio: number) => setSplitRatio(writeSplitRatio(ratio));

  const beginSplitDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    // The primary button only: a right click on the handle must not capture the pointer.
    if (event.button !== 0) return;
    splitDragRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingSplit(true);
    event.preventDefault();
  };

  const moveSplitDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (splitDragRef.current !== event.pointerId) return;
    const container = splitContainerRef.current;
    const box = container?.getBoundingClientRect();
    if (!container || !box) return;
    // The tracks share what the gap leaves, so the boundary is at `left + free * ratio`. Measuring
    // against the full width would leave the divider half a gap behind the pointer.
    const gap = Number.parseFloat(getComputedStyle(container).columnGap) || 0;
    const next = splitRatioAt(event.clientX, box.left, box.width - gap, resultsSide);
    // No write while dragging: a pointer emits a move per pixel, and a stored key per pixel is a
    // write per pixel. The drag ends with one.
    if (next !== null) setSplitRatio(next);
  };

  const endSplitDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (splitDragRef.current !== event.pointerId) return;
    splitDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDraggingSplit(false);
    // The release position, not the last ratio that was rendered. A pointermove is a continuous
    // event, so its setState can still be queued when the release arrives (the browser coalesces
    // moves under load); committing the ref then writes one move behind where the learner let go,
    // and the boundary stays a step off — CI caught exactly that, 39% after a drag to 35%. The
    // pointerup carries the position the drag ended at, so it is authoritative. A cancel carries
    // none, and commits what it has.
    const container = splitContainerRef.current;
    const box = container?.getBoundingClientRect();
    const gap = container ? Number.parseFloat(getComputedStyle(container).columnGap) || 0 : 0;
    const released =
      event.type === 'pointerup' && box
        ? splitRatioAt(event.clientX, box.left, box.width - gap, resultsSide)
        : null;
    setSplitRatio(writeSplitRatio(released ?? splitRatioRef.current));
  };

  // A preset change can unmount the handle mid-drag (⌥1 while holding it). Pointer capture dies with
  // the element, so the release never arrives and the "dragging" branch would stay on.
  useEffect(() => {
    if (layoutArrangement(layout) !== 'columns') setDraggingSplit(false);
  }, [layout]);

  // Which views the editor's tabs show, and whether the body is split into two panes
  // (`editorPanes.ts`). Read once at mount for the same reason the preset is: this screen is the
  // only one that changes it, and the arrangement belongs to this browser.
  const [panes, setPanes] = useState<EditorPanes>(() => readPanes());
  const commitPanes = (next: EditorPanes) => setPanes(writePanes(next));

  return {
    layout,
    chooseLayout,
    layoutToolbarRef,
    dock,
    dockChoice,
    flipDock,
    resultsSide,
    splitRatio,
    commitSplitRatio,
    draggingSplit,
    splitContainerRef,
    beginSplitDrag,
    moveSplitDrag,
    endSplitDrag,
    panes,
    commitPanes,
  };
}
