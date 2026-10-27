import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Ban, ChevronDown, RotateCcw, ShieldCheck, X } from 'lucide-react';
import { prepareBackup } from '../backupBundle';
import {
  RESET_AREAS,
  resetAreas,
  resetEverything,
  resetSummary,
  type ResetAreaId,
  type ResetReport,
} from '../progressReset';
import { areaItems, resetItem } from '../resetItems';

interface ResetProgressDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

/** The two presses have to belong together: a stray click four minutes later is not a confirmation. */
const ARM_MS = 4000;

/** A sentinel for the footer button, so one armed slot covers a row and "everything" alike. */
type Armed = ResetAreaId | 'everything' | `item:${string}`;

/** A test id from a store key, which can hold a slash, a colon or a space. */
function testKey(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]+/g, '-');
}

/** The backup handler, the same one the header's own button runs; a reset should offer it first. */
function downloadBackup(): string {
  const backup = prepareBackup();
  const blob = new Blob([new Uint8Array(backup.bytes)], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = backup.fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return backup.summary;
}

/**
 * Resetting progress, wholly or part by part (`app/src/components/ResetProgressDialog.tsx`).
 *
 * Eleven rows, each showing what is stored right now, because "erase my progress" is only a safe thing
 * to offer when the screen says what progress means: nine lessons and forty milestones is a different
 * decision from three predictions. The rules live in `progressReset.ts`; this is the surface.
 *
 * Two presses, never one. A browser `confirm()` was the alternative and it is worse here: it cannot
 * name the counts, it cannot offer the backup, and it blocks the same thread the stores are read on.
 * The armed state belongs to exactly one target at a time and clears itself after four seconds, so the
 * second press is always `document.activeElement` on the same button the first press started.
 *
 * The backup button is first in the footer on purpose. Erasing is final — the archive is the only way
 * back — so the cheap insurance is offered before the expensive mistake, and the file is the same one
 * the header writes.
 */
export const ResetProgressDialog: React.FC<ResetProgressDialogProps> = ({ isOpen, onClose }) => {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [armed, setArmed] = useState<Armed | null>(null);
  const [note, setNote] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  /** Bumped after a reset so the counts below are re-read from the stores, not from this render. */
  const [nonce, setNonce] = useState(0);
  /** The one part whose items are showing. One at a time keeps the panel short enough for a phone. */
  const [openArea, setOpenArea] = useState<ResetAreaId | null>(null);

  const rows = useMemo(() => RESET_AREAS.map((area) => ({ area, state: area.count() })), [nonce]);
  const openItems = useMemo(() => (openArea ? areaItems(openArea) : []), [openArea, nonce]);

  const disarm = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setArmed(null);
  };

  useEffect(() => {
    if (!isOpen) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === 'Tab') {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (timerRef.current) clearTimeout(timerRef.current);
      returnFocusRef.current?.focus?.();
    };
  }, [isOpen, onClose]);

  // Closing disarms: reopening should not find a button one press from erasing.
  useEffect(() => {
    if (!isOpen) {
      setArmed(null);
      setNote(null);
      setOpenArea(null);
    }
  }, [isOpen]);

  const report = (next: ResetReport) => {
    setNonce((value) => value + 1);
    setNote({ tone: 'ok', text: resetSummary(next) });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setArmed(null);
  };

  const toggle = (id: ResetAreaId) => {
    setOpenArea((current) => (current === id ? null : id));
    disarm();
    setNote(null);
  };

  const press = (target: Armed, run: () => ResetReport) => {
    if (armed !== target) {
      setArmed(target);
      setNote(null);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setArmed(null);
      }, ARM_MS);
      return;
    }
    report(run());
  };

  if (!isOpen) return null;

  const empty = rows.every((row) => row.state.n === 0);

  const panel = (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-[8vh]"
      style={{ backgroundColor: 'color-mix(in srgb, #04060a 72%, transparent)' }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-progress-title"
        aria-describedby="reset-progress-lead"
        data-testid="reset-dialog"
        className="w-full max-w-[46rem] rounded-[var(--r-lg)] border bg-panel shadow-2xl"
        style={{ borderColor: 'var(--border-strong)' }}
      >
        <div
          className="flex items-start justify-between gap-4 border-b px-4 py-3"
          style={{ borderColor: 'var(--border)' }}
        >
          <div>
            <h2
              id="reset-progress-title"
              className="text-[15px] font-bold tracking-tight"
              style={{ color: 'var(--text)' }}
            >
              Reset progress
            </h2>
            <p id="reset-progress-lead" className="mt-1 text-[11.5px] leading-snug" style={{ color: 'var(--muted)' }}>
              Pick what to erase — one part, or all of it. Your theme, sound and layout are not here:
              they are choices about a screen, and each has its own control.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            data-testid="btn-close-reset"
            aria-label="Close the reset panel"
            className="btn shrink-0"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Close</span>
          </button>
        </div>

        <ul
          className="grid max-h-[56vh] gap-1.5 overflow-y-auto px-3 py-2.5 sm:grid-cols-2"
          data-testid="reset-parts"
        >
          {rows.map(({ area, state }) => {
            const isArmed = armed === area.id;
            return (
              <li
                key={area.id}
                data-testid={`reset-row-${area.id}`}
                className="flex flex-col justify-between rounded-[var(--r-md)] border px-2.5 py-2"
                style={{
                  borderColor: isArmed ? 'var(--rose)' : 'var(--border)',
                  backgroundColor: isArmed ? 'color-mix(in srgb, var(--rose) 8%, transparent)' : 'transparent',
                }}
              >
                <div>
                  <p className="text-[12px] font-semibold" style={{ color: 'var(--text)' }}>
                    {area.label}
                  </p>
                  <p
                    data-testid={`reset-count-${area.id}`}
                    className="mt-0.5 text-[11px] font-medium"
                    style={{ color: state.n ? 'var(--accent)' : 'var(--dim)' }}
                  >
                    {state.text}
                  </p>
                  <p className="mt-1 text-[11px] leading-snug" style={{ color: 'var(--muted)' }}>
                    {area.hint}
                  </p>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-1">
                  {/* The part's own list: one lesson, one award, one day. A part whose items the
                      learner can see is a part they can fix in one press instead of ten. */}
                  {state.n > 0 && (
                    <button
                      type="button"
                      data-testid={`btn-expand-${area.id}`}
                      aria-expanded={openArea === area.id}
                      aria-controls={`reset-items-${area.id}`}
                      onClick={() => toggle(area.id)}
                      className="inline-flex cursor-pointer items-center gap-1 rounded border border-transparent px-1 py-1 text-[10.5px] font-medium"
                      style={{ color: openArea === area.id ? 'var(--accent)' : 'var(--muted)' }}
                    >
                      <ChevronDown
                        className="h-3 w-3 transition-transform"
                        style={{ transform: openArea === area.id ? 'rotate(180deg)' : 'none' }}
                        aria-hidden="true"
                      />
                      {openArea === area.id ? 'Hide' : 'Choose'}
                    </button>
                  )}
                  <button
                    type="button"
                    // A part with nothing in it keeps its button, disabled and named: a row that
                    // vanished would read as "this build cannot reset that".
                    disabled={state.n === 0}
                    data-testid={`btn-reset-${area.id}`}
                    aria-label={isArmed ? `Erase ${area.label} now` : `Reset ${area.label}`}
                    onClick={() => press(area.id, () => resetAreas([area.id]))}
                    className="ml-auto inline-flex cursor-pointer items-center gap-1 rounded border px-2 py-1 text-[10.5px] font-semibold"
                    style={{
                      borderColor: isArmed ? 'var(--rose)' : 'var(--border)',
                      color: isArmed ? 'var(--rose)' : state.n ? 'var(--text)' : 'var(--dim)',
                      opacity: state.n === 0 ? 0.55 : 1,
                      cursor: state.n === 0 ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <Ban className="h-3 w-3" aria-hidden="true" />
                    {isArmed ? 'Press again' : state.n === 0 ? 'Nothing yet' : 'Reset all'}
                  </button>
                </div>

                {openArea === area.id && (
                  <ul
                    id={`reset-items-${area.id}`}
                    data-testid={`reset-items-${area.id}`}
                    className="mt-1.5 max-h-[30vh] space-y-0.5 overflow-y-auto border-t pt-1.5"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    {openItems.length === 0 && (
                      <li className="px-1 py-1 text-[11px]" style={{ color: 'var(--dim)' }}>
                        Nothing left in this part.
                      </li>
                    )}
                    {openItems.map((item) => {
                      const key = `item:${area.id}:${item.id}` as const;
                      const armedItem = armed === key;
                      return (
                        <li
                          key={item.id}
                          data-testid={`reset-item-${area.id}-${testKey(item.id)}`}
                          className="flex items-center justify-between gap-2 rounded px-1 py-0.5"
                        >
                          <span className="min-w-0">
                            <span
                              className="block truncate text-[11px] font-medium"
                              title={item.label}
                              style={{ color: 'var(--text)' }}
                            >
                              {item.label}
                            </span>
                            <span
                              className="block truncate text-[10px]"
                              title={item.detail}
                              style={{ color: 'var(--muted)' }}
                            >
                              {item.detail}
                            </span>
                          </span>
                          <button
                            type="button"
                            data-testid={`btn-reset-item-${area.id}-${testKey(item.id)}`}
                            aria-label={armedItem ? `Erase ${item.label} now` : `Erase ${item.label}`}
                            onClick={() => press(key, () => resetItem(area.id, item.id))}
                            className="shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold"
                            style={{
                              borderColor: armedItem ? 'var(--rose)' : 'var(--border)',
                              color: armedItem ? 'var(--rose)' : 'var(--muted)',
                              backgroundColor: armedItem
                                ? 'color-mix(in srgb, var(--rose) 12%, transparent)'
                                : 'transparent',
                              cursor: 'pointer',
                            }}
                          >
                            {armedItem ? 'Again?' : 'Erase'}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>

        <div
          className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2.5"
          style={{ borderColor: 'var(--border)' }}
        >
          {/* Its own line below 640 px: with `flex-1` alone the sentence got whatever the two buttons
              left over — about 70 px on a phone, which stacked it one word per line and pushed a
              250 px footer over the list. */}
          <p
            role="status"
            aria-live="polite"
            data-testid="reset-status"
            className="min-w-0 basis-full text-[11px] leading-snug sm:flex-1 sm:basis-auto"
            style={{ color: note ? (note.tone === 'warn' ? 'var(--rose)' : 'var(--emerald)') : 'var(--dim)' }}
          >
            {note
              ? note.text
              : armed
                ? 'Press the same button again to erase. It is final — the backup is the way back.'
                : empty
                  ? 'Nothing is stored to reset. Every part is already empty.'
                  : 'Nothing is erased until a button is pressed twice.'}
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              data-testid="btn-reset-backup"
              onClick={() => {
                try {
                  setNote({ tone: 'ok', text: downloadBackup() });
                } catch (error) {
                  setNote({
                    tone: 'warn',
                    text: `Backup failed: ${error instanceof Error ? error.message : 'unknown error'}`,
                  });
                }
              }}
              title="Download everything in this browser as one .zip before erasing anything."
              className="btn"
            >
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Back up first</span>
            </button>
            <button
              type="button"
              disabled={empty}
              data-testid="btn-reset-everything"
              aria-label={armed === 'everything' ? 'Erase every part now' : 'Reset everything'}
              onClick={() => press('everything', () => resetEverything())}
              className="inline-flex items-center gap-1.5 rounded-[var(--r-md)] px-2.5 py-1.5 text-[11.5px] font-bold"
              style={{
                border: `1px solid ${armed === 'everything' ? 'var(--rose)' : 'color-mix(in srgb, var(--rose) 55%, var(--border))'}`,
                backgroundColor:
                  armed === 'everything' ? 'var(--rose)' : 'color-mix(in srgb, var(--rose) 12%, transparent)',
                color: armed === 'everything' ? 'var(--inverse)' : 'var(--rose)',
                opacity: empty ? 0.5 : 1,
                cursor: empty ? 'not-allowed' : 'pointer',
              }}
            >
              {armed === 'everything' ? (
                <Ban className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {armed === 'everything' ? 'Press again to erase' : 'Reset everything'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // The header paints a backdrop blur, and a `filter` makes that element the containing block for
  // `position: fixed` descendants — mounting this panel inside the header's tree anchored it to the
  // 88 px tray instead of the viewport, so the panel opened with its top at -486 px: only the last
  // row showed under the bar and the scrim covered nothing. A portal to <body> is the smallest
  // escape, and it is where the header's other surfaces are mounted anyway (`App` renders the cheat
  // sheet and the shortcut sheet at the root).
  return typeof document === 'undefined' ? null : createPortal(panel, document.body);
};
