/**
 * Undo and redo for the workflow canvas (`app/src/workflowHistory.ts`).
 *
 * The panel already has one write path: every edit hands `commit` the whole next document. That is
 * all a history needs — the document before the write is the undo state, and the write is its own
 * redo state — so this module is arithmetic on two stacks, pure and testable without a browser.
 *
 * Two rules make undo feel like an editor rather than a byte recorder:
 *
 * 1. **A run of typing is one step.** The caller says an edit came from a focused text field; while
 *    the previous entry is the same burst and the gap is small, the field's keystrokes extend their
 *    own entry instead of adding one per character. Any structural edit starts a new step.
 * 2. **A new edit clears redo.** Branches are not a tree: after undoing twice, typing once leaves
 *    nothing to redo, which is what every editor does.
 *
 * History is memory, not authored work: it is not saved, it does not travel in the backup, and it
 * starts empty on every visit.
 */

export interface WorkflowHistory<T> {
  /** States to return to, oldest first. The last entry is what one undo restores. */
  past: T[];
  /** States undone out of, newest first. The first entry is what one redo restores. */
  future: T[];
  /** When the last entry was recorded, so a run of keystrokes can extend it. */
  lastAt: number;
  /** Whether the last entry came from a text field and may be extended by the next keystroke. */
  bursting: boolean;
}

/** Enough steps to walk back through a sitting's edits without keeping every document alive. */
export const MAX_HISTORY = 60;
/** A pause longer than this starts a new typing step, so a slow edit is not swallowed whole. */
export const HISTORY_BURST_MS = 900;

export function emptyHistory<T>(): WorkflowHistory<T> {
  return { past: [], future: [], lastAt: 0, bursting: false };
}

/**
 * The history after recording `current` as the state an edit is about to replace.
 *
 * `burst` is the caller's "this came from a text field". A burst extends the previous burst only
 * while the gap stays under `HISTORY_BURST_MS`; anything else — a move, a delete, a route, a pause —
 * is its own step.
 */
export function recordHistory<T>(
  history: WorkflowHistory<T>,
  current: T,
  at: number,
  burst = false
): WorkflowHistory<T> {
  const extend =
    burst && history.bursting && at - history.lastAt <= HISTORY_BURST_MS && history.past.length > 0;
  const past = extend ? history.past : [...history.past.slice(-(MAX_HISTORY - 1)), current];
  return { past, future: [], lastAt: at, bursting: burst };
}

/**
 * One step back or forward, or null when there is nowhere to go.
 *
 * The state being left becomes the other stack's next entry, and `lastAt: 0` stops the restore from
 * being merged into a typing burst: undo is always its own step.
 */
export function stepHistory<T>(
  history: WorkflowHistory<T>,
  current: T,
  back: boolean
): { history: WorkflowHistory<T>; value: T } | null {
  if (back) {
    if (!history.past.length) return null;
    const value = history.past[history.past.length - 1];
    return {
      history: {
        past: history.past.slice(0, -1),
        future: [current, ...history.future].slice(0, MAX_HISTORY),
        lastAt: 0,
        bursting: false,
      },
      value,
    };
  }
  if (!history.future.length) return null;
  const value = history.future[0];
  return {
    history: {
      past: [...history.past, current].slice(-MAX_HISTORY),
      future: history.future.slice(1),
      lastAt: 0,
      bursting: false,
    },
    value,
  };
}
