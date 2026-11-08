import type { EditorPanes } from '../../../editorPanes';

/** How long a closed pane waits for its Undo before the offer goes away on its own. */
const UNDO_MS = 8000;

export interface CloseNotice {
  /** The arrangement the close replaced: the whole of it, so Undo restores the slot too. */
  snapshot: EditorPanes;
  /** What closed, as the offer prints it. */
  label: string;
  /** A keyboard press takes the focus with its pane; the offer has to hand it back. */
  keyboard: boolean;
  id: number;
}

/**
 * The one close waiting to be undone (`runner/paneUndo.ts`).
 *
 * Module state on purpose: the button that closes a pane is unmounted by its own press, so the offer
 * cannot live in that component, and it is not the tab's state either — the tab is assembly. The
 * notice holds the whole arrangement rather than the view alone, so Undo puts the view back in the
 * slot it left, boundaries and shares included.
 *
 * This store is deliberately small and eager while the offer that draws it rides the lazy
 * pane-chrome chunk (`PaneDrag.tsx`): every close control writes here — the pane's corner ×, the
 * split's Close and the prediction gate's own Close — and only a body that actually closes a pane
 * ever loads the drawing.
 */
let notice: CloseNotice | null = null;
let dismissTimer = 0;
let sequence = 0;
const listeners = new Set<() => void>();

function announce() {
  for (const listener of listeners) listener();
}

/** What the offer is showing, or `null` when nothing is waiting to be undone. */
export function closeNotice(): CloseNotice | null {
  return notice;
}

export function clearClose() {
  window.clearTimeout(dismissTimer);
  notice = null;
  announce();
}

/** Offer a closed arrangement back; a second close replaces the first offer. */
export function recordClose(snapshot: EditorPanes, label: string, keyboard = false) {
  window.clearTimeout(dismissTimer);
  sequence += 1;
  notice = { snapshot, label, keyboard, id: sequence };
  dismissTimer = window.setTimeout(clearClose, UNDO_MS);
  announce();
}

export function subscribeClose(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
