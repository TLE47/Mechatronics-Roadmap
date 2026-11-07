import { useRef, type PointerEvent as ReactPointerEvent } from 'react';

const MIN_HEIGHT = 200;
const MAX_HEIGHT = 1200;

interface DragState {
  fromY: number;
  fromHeight: number;
}

/**
 * The pane area's bottom edge (`runner/PaneResize.tsx`).
 *
 * A bounded split body has a fixed floor, and the last pane in a column can still be taller than
 * anything it draws. The divider between two panes cannot trim that: it only moves the boundary
 * between them. This grip resizes the whole pane area instead, so the same drag that moves a cross
 * divider can also take a stack's unused bottom space away. Reset restores the body's default floor.
 *
 * Rendered by a bounded desktop body; the bar is a lazy chunk, and it sits on the body's bottom
 * edge rather than adding a row, so it costs no height when it is not in use.
 */
export function PaneResize() {
  const barRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<DragState | null>(null);

  const body = () => barRef.current?.parentElement ?? null;

  const apply = (height: number) => {
    const element = body();
    if (!element) return;
    const next = Math.round(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, height)));
    element.dataset.paneResized = 'true';
    element.style.setProperty('--pane-body-h', `${next}px`);
  };

  const clear = () => {
    const element = body();
    if (!element) return;
    delete element.dataset.paneResized;
    element.style.removeProperty('--pane-body-h');
  };

  const begin = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const element = body();
    if (!element) return;
    drag.current = { fromY: event.clientY, fromHeight: element.getBoundingClientRect().height };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state) return;
    const delta = event.clientY - state.fromY;
    if (Math.abs(delta) < 2) return;
    apply(state.fromHeight + delta);
  };

  // The browser releases the capture itself on pointerup; `lostpointercapture` re-enters here and
  // finds nothing to do.
  const end = () => {
    drag.current = null;
  };

  const reset = () => clear();

  return (
    <div ref={barRef} className="absolute inset-x-0 bottom-0 z-[3] flex h-3 items-end">
      <div
        role="separator"
        aria-label="Resize the pane area"
        data-testid="pane-divider-bottom"
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
        className="flex h-full flex-1 cursor-row-resize touch-none items-end justify-center"
      >
        <span aria-hidden="true" className="mb-0.5 h-1 w-10 rounded-full bg-line-soft" />
      </div>
      <button
        type="button"
        data-testid="btn-pane-reset"
        onClick={reset}
        className="mb-0.5 mr-1 flex h-4 cursor-pointer items-center rounded border border-line bg-canvas px-1 text-xs text-muted"
      >
        Reset size
      </button>
    </div>
  );
}
