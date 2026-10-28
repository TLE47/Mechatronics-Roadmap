import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * One sheet for the app's overlays (`components/Sheet.tsx`).
 *
 * A phone has no room for a centred dialog whose edges sit off-screen, and a bottom sheet is the
 * shape a thumb can reach. This is that shape, with the parts a dialog cannot skip: `role=dialog`,
 * `aria-modal`, a labelled title, Escape, a focus trap, focus restored to the control that opened
 * it, a locked page behind it, and `env(safe-area-inset-bottom)` so the last button clears a home
 * indicator.
 *
 * It is one component rather than seven overlays with seven sets of these rules. The sheet is
 * portalled to `<body>` so a transformed ancestor cannot clip it, and it writes
 * `data-sheet-open` on the body: the phone's fixed bottom bar reads that attribute in CSS and steps
 * aside, which is cheaper than threading an "a sheet is open" boolean through every caller.
 *
 * At `sm` and up it becomes the centred dialog the desktop already expects; the phone rules are the
 * same element with a different placement, not a second component to keep in step.
 */

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  /** Read by the dialog's own label; also the sheet's heading. */
  title: string;
  /** Stable test hook for the panel and its close button (`-close`). */
  testId: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** `lg` is for the lesson chooser, whose two columns need the width. */
  size?: 'sm' | 'md' | 'lg';
}

const SIZE: Record<NonNullable<SheetProps['size']>, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-xl',
  lg: 'sm:max-w-3xl',
};

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const Sheet: React.FC<SheetProps> = ({
  open,
  onClose,
  title,
  testId,
  children,
  footer,
  size = 'md',
}) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const restoreRef = useRef<HTMLElement | null>(null);

  // The page behind the sheet stays where it was: locking the body is what stops a scroll gesture
  // on the sheet's header from moving the lesson underneath it.
  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const body = document.body;
    const previousOverflow = body.style.overflow;
    const previousPadding = body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    body.dataset.sheetOpen = '1';
    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPadding;
      delete body.dataset.sheetOpen;
    };
  }, [open]);

  // Focus moves in once, and comes back to whatever opened the sheet. Without the restore, closing
  // the tab chooser on a phone drops focus to the top of the document and a keyboard user is lost.
  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    restoreRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    if (!panel) return;
    const first = panel.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel).focus({ preventScroll: true });
    return () => {
      const target = restoreRef.current;
      if (target && typeof target.focus === 'function') target.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const panel = panelRef.current;
    if (!panel) return;
    const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (item) => item.offsetParent !== null || item === document.activeElement
    );
    if (items.length === 0) {
      event.preventDefault();
      panel.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <>
      <div
        data-testid={`${testId}-scrim`}
        className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-[1px]"
        onMouseDown={onClose}
        aria-hidden="true"
      />
      <div
        className="fixed inset-x-0 bottom-0 z-[81] sm:inset-0 sm:grid sm:place-items-center sm:p-4"
        onMouseDown={(event) => {
          // A click on the placement wrapper is a click on the scrim around the centred dialog.
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          data-testid={testId}
          tabIndex={-1}
          onKeyDown={onKeyDown}
          className={`flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-panel shadow-[var(--shadow-lg)] outline-none sm:max-h-[85dvh] sm:rounded-xl ${SIZE[size]}`}
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-2.5">
            <h2 id={titleId} className="truncate text-sm font-bold text-ink">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              data-testid={`${testId}-close`}
              aria-label={`Close ${title}`}
              className="btn h-10 w-10 shrink-0 px-0"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
          {footer && (
            <footer className="shrink-0 border-t border-line px-4 py-2.5">{footer}</footer>
          )}
        </div>
      </div>
    </>,
    document.body
  );
};
