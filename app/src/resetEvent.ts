/**
 * The reset's contract, small on purpose (`app/src/resetEvent.ts`).
 *
 * `App` has to know three things about a reset — the event it listens for, the watermark its snapshot
 * carries, and the shape of the report — and nothing else. Importing `progressReset.ts` for them would
 * put all twelve stores in the first paint's chunk, which is precisely what the lazy dialog exists to
 * avoid; the measured entry chunk said so (Run 259: +9.6 kB for a button). So the contract lives here,
 * the registry lives there, and this module imports nothing.
 */

/** Fired after a reset writes, so every surface holding a copy of a store re-reads it. */
export const RESET_EVENT = 'mechalab:progress-reset';
/** When the last reset of a cloud-synced part happened, for the merge in `progressMerge.ts`. */
export const STORAGE_KEY_RESET_AT = 'mechalab.progress.resetAt.v1';

export type ResetAreaId =
  | 'lessons'
  | 'checks'
  | 'milestones'
  | 'awards'
  | 'cards'
  | 'notes'
  | 'drafts'
  | 'log'
  | 'sittings'
  | 'predictions'
  | 'onboarding'
  | 'resume';

export interface ResetReport {
  /** The parts that actually held something, in registry order. */
  areas: ResetAreaId[];
  /** How many stored items were erased, by the same counting each row shows. */
  items: number;
  /** True when the cloud progress document has to be rewritten. */
  progress: boolean;
  /** True when the account's workspace row (drafts and notes) has to be emptied. */
  workspace: boolean;
  /** The watermark written, or null when no cloud-synced part was reset. */
  resetAt: number | null;
}

function bucket(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** The watermark the merge reads, or 0 when nothing was ever reset. */
export function readResetAt(): number {
  try {
    const raw = bucket()?.getItem(STORAGE_KEY_RESET_AT);
    const value = raw ? Number(raw) : 0;
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

/** Tell the page what a reset did. Silent outside a browser, where the unit suites run. */
export function announceReset(report: ResetReport): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  try {
    // The page's own constructor: an event built by another realm's `CustomEvent` is not dispatched
    // by every DOM implementation (`sittingClock.ts` and `focusMode.ts` learned this the same way).
    const EventCtor = typeof window.CustomEvent === 'function' ? window.CustomEvent : CustomEvent;
    window.dispatchEvent(new EventCtor(RESET_EVENT, { detail: report }));
  } catch {
    // A screen that cannot be told re-reads on its next mount; the stores are already cleared.
  }
}
