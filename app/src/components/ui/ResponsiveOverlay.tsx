import React, { useEffect, useId } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Drawer } from 'vaul';
import { useMediaQuery } from '../../useMediaQuery';

/**
 * One sheet, from two libraries (`components/ui/ResponsiveOverlay.tsx`).
 *
 * The dialog's hard parts are not this file's to write: the portal, the focus trap, the focus
 * returned to whatever opened it, the locked page behind it, Escape, and a labelled title all come
 * from Radix. On a phone the same panel is a bottom drawer, so the shape a thumb can reach and the
 * drag that closes it come from vaul — which is Radix underneath, so the two branches share the
 * same semantics instead of drifting apart.
 *
 * The split is a viewport question, not a product one: below `sm` (640 px, Tailwind's own line,
 * which the rest of the shell already uses) it is a drawer; at and above it, the centred dialog the
 * desktop already expects.
 *
 * What lives here is only the placement and the workbench's clothing: the panel surface, the line,
 * the radius and the shadow are the tokens in `index.css`, so a theme change re-skins a dialog it
 * has never heard of.
 */

export type OverlaySize = 'sm' | 'md' | 'lg' | 'xl';

export interface ResponsiveOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The dialog's accessible name. Rendered for a screen reader, not as a visible heading. */
  label: string;
  /** Stable test hook for the panel. */
  testId: string;
  children: React.ReactNode;
  /** `lg` is for the lesson chooser's two columns; `xl` is the printed reference card. */
  size?: OverlaySize;
  /** The phone's cut: a centred dialog would put its edges off-screen below 640 px. */
  breakpoint?: string;
  /** Extra classes for the scrolling body; a surface that scrolls its own region passes `overflow-hidden`. */
  bodyClassName?: string;
  /** Where focus lands on open. Radix's default is the first focusable control, which is usually the close button. */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  /** The grab bar above a phone drawer's title. Off for a surface that draws its own. */
  showHandle?: boolean;
}

const SIZE: Record<OverlaySize, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-2xl',
  lg: 'sm:max-w-3xl',
  xl: 'sm:max-w-7xl',
};

export const ResponsiveOverlay: React.FC<ResponsiveOverlayProps> = ({
  open,
  onOpenChange,
  label,
  testId,
  children,
  size = 'md',
  breakpoint = '(max-width: 639px)',
  bodyClassName = '',
  initialFocusRef,
  showHandle = true,
}) => {
  const phone = useMediaQuery(breakpoint);
  const titleId = useId();

  // The phone's fixed bottom bar reads this attribute in CSS and steps aside, exactly as the
  // shell's other sheet does: a drawer over a Run button is one the learner cannot press.
  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    document.body.dataset.sheetOpen = '1';
    return () => {
      delete document.body.dataset.sheetOpen;
    };
  }, [open]);

  // The surface itself, so the two branches can never disagree about what a panel is.
  const body = (
    <>
      <Dialog.Title className="sr-only" id={titleId}>
        {label}
      </Dialog.Title>
      <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${bodyClassName}`}>
        {children}
      </div>
    </>
  );

  const focusFirst = (event: Event) => {
    const target = initialFocusRef?.current;
    if (!target) return;
    event.preventDefault();
    target.focus({ preventScroll: true });
  };

  if (phone) {
    return (
      <Drawer.Root open={open} onOpenChange={onOpenChange} dismissible>
        <Drawer.Portal>
          <Drawer.Overlay
            data-overlay-scrim=""
            className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-[1px]"
          />
          <Drawer.Content
            data-overlay-panel=""
            data-testid={testId}
            aria-describedby={undefined}
            onOpenAutoFocus={focusFirst}
            className="fixed inset-x-0 bottom-0 z-[81] flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-line-strong bg-panel shadow-[var(--shadow-lg)] outline-none"
          >
            {showHandle && (
              <div
                data-drawer-handle=""
                aria-hidden="true"
                className="mx-auto mt-2 mb-1 h-1.5 w-10 shrink-0 rounded-full bg-line-strong"
              />
            )}
            {body}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          data-overlay-scrim=""
          className="fixed inset-0 z-[80] bg-black/65 backdrop-blur-[1px]"
        />
        <Dialog.Content
          data-overlay-panel=""
          data-testid={testId}
          aria-describedby={undefined}
          onOpenAutoFocus={focusFirst}
          className={`fixed left-1/2 top-1/2 z-[81] flex max-h-[86vh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[var(--r-lg)] border border-line-strong bg-panel shadow-[var(--shadow-lg)] outline-none ${SIZE[size]}`}
        >
          {body}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
