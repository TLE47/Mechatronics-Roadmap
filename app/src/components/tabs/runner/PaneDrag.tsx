import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { GripVertical, X } from 'lucide-react';
import { PaneResize } from './PaneResize';
import { clearClose, closeNotice, recordClose, subscribeClose, type CloseNotice } from './paneUndo';
import {
  closeView,
  EDITOR_VIEW_LABELS,
  swapPanes,
  type EditorPanes,
  type EditorView,
} from '../../../editorPanes';

/** Pixels a press must travel before it becomes a drag rather than a click on the grip. */
const DRAG_THRESHOLD = 4;

interface DragState {
  pointerId: number;
  fromX: number;
  fromY: number;
  started: boolean;
  target: number | null;
  root: HTMLElement;
  source: HTMLElement;
  onKey: (event: KeyboardEvent) => void;
}

/**
 * One pane's header grip (`runner/PaneDrag.tsx`).
 *
 * Press it and drag onto another pane: the pane under the pointer is outlined, and releasing there
 * exchanges the two slots through the same `swapPanes` the menu uses. The menu stays the keyboard
 * path; this handle is the pointer one. Pointer capture keeps the drag alive over the editor inside
 * the target pane, and `elementFromPoint` decides the target rather than the captured handle.
 *
 * The grip is a lazy chunk: a two-pane body pays for it only when a split exists, and every editor
 * body would otherwise carry the pointer work in its entry chunk. It sits at the pane's top-left, so
 * the close keeps the top-right corner and the placement chips start beside it: three controls, three
 * spots, none covering another even in a half-width pane. It is a wide, short pill rather than a
 * square: the pane's first line of content starts right under it, and a shorter control covers less
 * of that line while the wider face keeps the press easy to hit.
 */
interface PaneDragProps {
  slot: number;
  view: EditorView;
  panes: EditorPanes;
  onPanes: (next: EditorPanes) => void;
}

function PaneDrag({ slot, view, panes, onPanes }: PaneDragProps) {
  const drag = useRef<DragState | null>(null);
  const current = useRef({ panes, onPanes });
  current.current = { panes, onPanes };
  const label = EDITOR_VIEW_LABELS[view];

  const paneAt = (state: DragState, target: number | null) =>
    target === null ? null : state.root.querySelector<HTMLElement>(`[data-slot="${target}"]`);

  const mark = (element: HTMLElement | null, on: boolean) => {
    if (!element) return;
    if (on) {
      element.dataset.paneDrop = 'true';
      element.style.outline = '2px solid var(--accent)';
      element.style.outlineOffset = '-2px';
    } else {
      delete element.dataset.paneDrop;
      element.style.outline = '';
      element.style.outlineOffset = '';
    }
  };

  const finish = (commit: boolean) => {
    const state = drag.current;
    if (!state) return;
    drag.current = null;
    window.removeEventListener('keydown', state.onKey);
    mark(paneAt(state, state.target), false);
    state.source.style.opacity = '';
    delete state.source.dataset.paneDragging;
    if (commit && state.started && state.target !== null && state.target !== slot) {
      current.current.onPanes(swapPanes(current.current.panes, slot, state.target));
    }
  };

  // A pane can leave the body mid-drag (Close, a tab press); the marks and the Escape listener go
  // with it rather than outliving the handle.
  useEffect(
    () => () => {
      const state = drag.current;
      if (!state) return;
      drag.current = null;
      window.removeEventListener('keydown', state.onKey);
      const target =
        state.target === null
          ? null
          : state.root.querySelector<HTMLElement>(`[data-slot="${state.target}"]`);
      mark(target, false);
      state.source.style.opacity = '';
      delete state.source.dataset.paneDragging;
    },
    []
  );

  const begin = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const source = event.currentTarget.closest<HTMLElement>('[data-slot]');
    const root = source?.closest<HTMLElement>('[data-testid="editor-panes"]');
    if (!source || !root) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const onKey = (key: KeyboardEvent) => {
      if (key.key === 'Escape') {
        key.preventDefault();
        finish(false);
      }
    };
    window.addEventListener('keydown', onKey);
    drag.current = {
      pointerId: event.pointerId,
      fromX: event.clientX,
      fromY: event.clientY,
      started: false,
      target: null,
      root,
      source,
      onKey,
    };
  };

  const move = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const state = drag.current;
    if (!state || event.pointerId !== state.pointerId) return;
    if (!state.started) {
      if (Math.hypot(event.clientX - state.fromX, event.clientY - state.fromY) < DRAG_THRESHOLD) {
        return;
      }
      state.started = true;
      state.source.style.opacity = '0.55';
      state.source.dataset.paneDragging = 'true';
    }
    // Capture retargets the events to this handle, but hit-testing still names the pane underneath.
    const under = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-pane]');
    const target = under && state.root.contains(under) ? Number(under.dataset.slot) : NaN;
    const next = Number.isInteger(target) && target !== slot ? target : null;
    if (next === state.target) return;
    mark(paneAt(state, state.target), false);
    state.target = next;
    mark(paneAt(state, next), true);
  };

  const end = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag.current) return;
    // Commit before releasing: releasing fires `lostpointercapture`, whose cancel would clear the
    // target first. The browser drops the capture itself when the pointer is lifted.
    finish(true);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <button
      type="button"
      data-testid={`pane-drag-${slot + 1}`}
      aria-label={`Drag pane ${slot + 1} (${label}) onto another pane to swap them`}
      title="Drag onto another pane to swap; the swap menu in the tab row does the same from the keyboard"
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={() => finish(false)}
      onLostPointerCapture={() => finish(false)}
      onClick={(event) => event.stopPropagation()}
      className="absolute left-1 top-1 z-[2] flex h-4 w-7 cursor-grab touch-none select-none items-center justify-center rounded border border-line bg-canvas/95 text-muted hover:text-accent active:cursor-grabbing"
    >
      <GripVertical className="h-3 w-3" aria-hidden="true" />
    </button>
  );
}

type PaneHandlesProps =
  | { resize: true; undo?: false }
  | { undo: true; resize?: false; onPanes: (next: EditorPanes) => void }
  | (PaneDragProps & { resize?: false; undo?: false });

/**
 * The body's offer to take a close back (`runner/PaneDrag.tsx`).
 *
 * It prints what closed and restores the arrangement it replaced, which is what makes the slot come
 * back and not just the view. It rides this chunk rather than the entry, so a body that never closes
 * a pane never pays for it. A close pressed from the keyboard takes its button's focus with it, so
 * the offer takes the focus in turn; a pointer press leaves the focus where the learner had it.
 * Either way ⌥Z undoes the close from the keyboard while the offer is on screen.
 */
function PaneUndo({ onPanes }: { onPanes: (next: EditorPanes) => void }) {
  const [entry, setEntry] = useState<CloseNotice | null>(() => closeNotice());
  const current = useRef(onPanes);
  current.current = onPanes;
  const button = useRef<HTMLButtonElement | null>(null);
  useEffect(() => subscribeClose(() => setEntry(closeNotice())), []);
  useEffect(() => {
    if (entry?.keyboard) button.current?.focus();
  }, [entry?.id, entry?.keyboard]);
  // ⌥Z is the same Undo from the keyboard, for the close that was made with the pointer and left
  // no focus on its own button. The listener exists only while the offer does, so no typing loses a
  // key, and a dialog keeps its chords: the offer never takes a press from one.
  useEffect(() => {
    if (!entry) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (!event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;
      if (event.code !== 'KeyZ') return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[role="dialog"]')) return;
      event.preventDefault();
      current.current(entry.snapshot);
      clearClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [entry]);
  if (!entry) return null;
  return (
    <div
      role="status"
      data-testid="pane-undo"
      style={{ bottom: 16, left: 8 }}
      className="absolute z-[3] flex items-center gap-2 rounded border border-line bg-canvas/95 px-2 py-1 text-[11px] text-muted"
    >
      <span>{entry.label} closed</span>
      <button
        ref={button}
        type="button"
        data-testid="btn-pane-undo"
        aria-label={`Undo closing ${entry.label}`}
        aria-keyshortcuts="Alt+Z"
        onClick={() => {
          current.current(entry.snapshot);
          clearClose();
        }}
        className="cursor-pointer rounded border border-line px-1.5 py-0.5 text-accent hover:bg-raise"
      >
        Undo
      </button>
      <kbd
        aria-hidden="true"
        title="Undo from the keyboard while this offer is on screen"
        className="rounded border border-line-soft px-1 font-mono text-[10px] text-faint"
      >
        ⌥Z
      </kbd>
    </div>
  );
}

/**
 * The pane's pointer chrome (`runner/PaneDrag.tsx`): the header grip and close in each pane, and the
 * one bottom grip that resizes the pane area. One lazy chunk serves all of them, so a one-pane body
 * pays for none of it and the entry above only names this component once.
 *
 * The close is the pane's own: it takes that view off the screen and leaves the others in order
 * (`closeView`), where the tab row's Close goes all the way back to one pane. Every view is legal as
 * the last one, so a pane never closes into an empty card. A close is reversible: it records the
 * arrangement it replaced in `paneUndo.ts` (the split's Close and the prediction gate's own Close do
 * too), and the body renders that notice's Undo from its own `undo` instance of this chunk, which
 * survives the pane the close unmounted.
 */
export default function PaneHandles(props: PaneHandlesProps) {
  if (props.resize) return <PaneResize />;
  if (props.undo) return <PaneUndo onPanes={props.onPanes} />;
  const { slot, view, panes, onPanes } = props;
  return (
    <>
      <PaneDrag slot={slot} view={view} panes={panes} onPanes={onPanes} />
      <button
        type="button"
        data-testid={`pane-close-${view}`}
        aria-label={`Close pane ${slot + 1} (${EDITOR_VIEW_LABELS[view]})`}
        title="Close this pane; the panes beside it stay open"
        onClick={(event) => {
          event.stopPropagation();
          recordClose(panes, EDITOR_VIEW_LABELS[view], event.detail === 0);
          onPanes(closeView(panes, view));
        }}
        className="absolute right-1 top-1 z-[2] flex h-5 w-5 cursor-pointer items-center justify-center rounded border border-line bg-canvas/95 text-muted hover:text-accent"
      >
        <X className="h-3 w-3" aria-hidden="true" />
      </button>
    </>
  );
}
