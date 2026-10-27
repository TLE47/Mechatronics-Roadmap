import React from 'react';
import { createPortal } from 'react-dom';

/**
 * The name of a header control, on hover (`components/HeaderTips.tsx`).
 *
 * The three action trays carry their labels as `hidden 2xl:inline`, so on a laptop the controls are
 * icons: a house, a magnifier, a crescent. An icon with no name is a guess, and the native `title`
 * that used to answer the hover is slow, unstyled, and invisible to anything the page can check. This
 * is one bubble, delegated from the tray row.
 *
 * - **It appears where the labels do not.** `2xl` (1536 px) is the width at which the trays write
 *   their labels, so above it a bubble would repeat the button and never opens; the same check lives
 *   in `index.css` as the place the bubble is drawn.
 * - **Hover and keyboard are the same door.** `pointerover` and `focusin` both open it, so tabbing
 *   through the header names each control too; `Escape`, `pointerdown` or leaving the control close it.
 *   A scroll or a resize moves the bubble with its control and closes it when the control leaves the
 *   window, which is also what keeps a phone's sideways-scrolling tray row from stranding one.
 * - **It is positioned, not inherited.** The bubble is a portal on `document.body`, because the tray
 *   row scrolls sideways on a phone and a tooltip inside it would be clipped by that scroller. Its
 *   own width is measured, so a control at the edge of the window still gets a whole bubble.
 * - **It is not read twice.** The controls already have `aria-label`s, so the bubble is decoration for
 *   the eye: `aria-hidden`, no `aria-describedby`, nothing new in the accessibility tree.
 */

/** The width the trays print their labels at (`hidden 2xl:inline`); above it the bubble is redundant. */
const LABELS_ON_THE_BUTTON = '(min-width: 1536px)';

export const HeaderTips: React.FC<{ scope: React.RefObject<HTMLElement | null> }> = ({ scope }) => {
  const [tip, setTip] = React.useState<{ text: string; x: number; y: number; flip: boolean } | null>(null);
  const bubbleRef = React.useRef<HTMLDivElement | null>(null);
  /** The control the bubble is about, so a scroll can follow it instead of dropping it. */
  const anchorRef = React.useRef<HTMLElement | null>(null);

  // Keep the bubble on screen: a control at either end of a phone's tray row would centre half a
  // bubble outside the window. Measured, not estimated, because the text decides the width.
  React.useLayoutEffect(() => {
    const el = bubbleRef.current;
    if (!el || !tip) return;
    const half = el.getBoundingClientRect().width / 2;
    const left = Math.min(Math.max(tip.x, half + 10), window.innerWidth - half - 10);
    if (Math.abs(left - tip.x) > 0.5) setTip({ ...tip, x: left });
  }, [tip]);

  React.useEffect(() => {
    const root = scope.current;
    if (!root) return;

    /** The control the event is about, if it is one of this row's. */
    const control = (event: Event): HTMLElement | null => {
      const found = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-tip]') : null;
      return found && root.contains(found) ? found : null;
    };

    const show = (node: HTMLElement) => {
      const text = (node.dataset.tip ?? '').trim();
      if (!text || window.matchMedia(LABELS_ON_THE_BUTTON).matches) {
        setTip(null);
        return;
      }
      anchorRef.current = node;
      const rect = node.getBoundingClientRect();
      const below = rect.bottom + 8;
      setTip({
        text,
        x: rect.left + rect.width / 2,
        y: below,
        // A bubble under a control near the bottom of a short window would fall off the screen.
        flip: below + 44 > window.innerHeight && rect.top > 44,
      });
    };

    const hide = () => {
      anchorRef.current = null;
      setTip(null);
    };

    // A scroll or a resize moves the control, so the bubble moves with it, and it goes when the
    // control does. Hiding on every scroll instead lost bubbles to their own arrival: a hover that
    // made the page scroll (Playwright's `scrollIntoViewIfNeeded`, a browser's focus scroll) showed
    // the name and then lost it to the scroll event that followed. Leaving is still `pointerout`'s
    // job, so a pointer that moved on has already closed the bubble by the time a scroll happens.
    const onLayoutChange = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= window.innerHeight) hide();
      else show(anchor);
    };

    const onOver = (event: Event) => {
      const node = control(event);
      if (node) show(node);
    };

    // Moving between a button's own icon and its label is not leaving the button.
    const onOut = (event: Event) => {
      const node = control(event);
      const to = event instanceof PointerEvent && event.relatedTarget instanceof Node ? event.relatedTarget : null;
      if (node && to && node.contains(to)) return;
      hide();
    };

    const onFocusIn = (event: Event) => {
      const node = control(event);
      if (node) show(node);
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide();
    };

    root.addEventListener('pointerover', onOver);
    root.addEventListener('pointerout', onOut);
    root.addEventListener('pointerdown', hide);
    root.addEventListener('focusin', onFocusIn);
    root.addEventListener('focusout', hide);
    window.addEventListener('scroll', onLayoutChange, true);
    window.addEventListener('resize', onLayoutChange);
    window.addEventListener('keydown', onKey);

    return () => {
      root.removeEventListener('pointerover', onOver);
      root.removeEventListener('pointerout', onOut);
      root.removeEventListener('pointerdown', hide);
      root.removeEventListener('focusin', onFocusIn);
      root.removeEventListener('focusout', hide);
      window.removeEventListener('scroll', onLayoutChange, true);
      window.removeEventListener('resize', onLayoutChange);
      window.removeEventListener('keydown', onKey);
    };
  }, [scope]);

  if (!tip) return null;

  return createPortal(
    <div
      ref={bubbleRef}
      className={`header-tip${tip.flip ? ' header-tip-above' : ''}`}
      data-testid="header-tip"
      aria-hidden="true"
      style={{ left: tip.x, top: tip.y }}
    >
      {tip.text}
    </div>,
    document.body
  );
};
