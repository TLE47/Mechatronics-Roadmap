import { useEffect, useLayoutEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react';

/** `useLayoutEffect` on the browser, `useEffect` during SSR: React warns about the former on a server. */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

interface PhoneTypingLayerOptions {
  /** True while the phone's punctuation keys are up over the code face. */
  active: boolean;
  /** True when the OS keyboard, not the custom keys, is the bottom edge. */
  keyboardNative: boolean;
  /** The custom keys' measured height; zero while folded. */
  keyboardHeight: number;
  modeBarRef: RefObject<HTMLDivElement | null>;
  deferPhoneEditor: boolean;
  openHelper: string | null;
  setEditorBand: Dispatch<SetStateAction<number | null>>;
}

/**
 * The phone's code editor is a **band above the keys**, not a page.
 *
 * Left to itself the card is as tall as its document: a forty-line file made a 1048 px editor
 * inside a 3151 px page, so its own scroller never moved, the page's scrollbar did all the
 * work, and the caret sat 660 px *below* the keyboard. Typing then grew the page again for every
 * wrapped line, which is the scrollbar that kept sliding up and down, and the line being typed
 * was hidden under the keys.
 *
 * The band is measured from the mode bar's bottom edge to the top of the Study bar that rides on
 * the keys, so the editor fills exactly what the learner can see. The page no longer changes
 * height while a finger types; the editor's own scroller follows the caret, and `scrollMargins`
 * in `pythonEditorImpl.tsx` keeps a line of air above the keys. It is re-measured for a keyboard
 * that grows, a bar that wraps, a rotation, and over the next few frames for the page clamp the
 * new height can cause.
 *
 * While the keys are up the global header and the tab picker are hidden and the page is locked
 * (`data-phone-typing` in `index.css`). The mode bar becomes the top row, the 153 px the chrome
 * took goes to the code, and no browser scroll can move the page under the band. The OS
 * keyboard's visible viewport is the band's edge too: on iOS `innerHeight` stays full while
 * `visualViewport` shrinks, so the native handoff measures the visual viewport instead.
 *
 * **The lock is the body leaving the document's flow.** `overflow: hidden` does not stop iOS —
 * and code is focused on every key, so iOS 26 (which CodeMirror disables `preventScroll` on)
 * scrolled the layout to reveal the editable: the code slid off the top of the screen while the
 * page's footer rose under the keys. A fixed body, drawn at the offset that put the mode bar at
 * the top, is the lock the browser honours, and the page is put back exactly where it was when
 * the keys close. The layer is also the page's scroll owner for the whole time it is up.
 * Keeping that here leaves `EditorCodePane` the drawing of the two faces, not the page geometry
 * around them.
 */
export function usePhoneTypingLayer({
  active,
  keyboardNative,
  keyboardHeight,
  modeBarRef,
  deferPhoneEditor,
  openHelper,
  setEditorBand,
}: PhoneTypingLayerOptions): void {
  useIsomorphicLayoutEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    if (!active) {
      setEditorBand(null);
      delete body.dataset.phoneTyping;
      delete root.dataset.phoneTyping;
      return;
    }
    const bar = modeBarRef.current;
    if (!bar) return;
    const studyBar = document.querySelector<HTMLElement>('[data-phone-bar]');
    // The scroll the page had when the mode bar was placed at the top, drawn as the fixed body's
    // offset. While the layer is up this — not `window.scrollY` — is where the page is.
    let pageTop = 0;
    let pinned = false;

    /** Put the body back in the document's flow, at the position its content was drawn at. */
    const unpin = () => {
      if (!pinned) return;
      pinned = false;
      const offset = pageTop;
      pageTop = 0;
      body.style.removeProperty('--phone-typing-top');
      delete body.dataset.phoneLock;
      window.scrollTo({ top: Math.max(0, -offset), behavior: 'instant' });
    };

    /** The whole layer, page lock included. */
    const release = () => {
      unpin();
      delete body.dataset.phoneTyping;
      delete root.dataset.phoneTyping;
    };

    const compute = () => {
      // The card is hidden on the Lesson surface; a hidden bar measures zero and has no place to
      // put. Its ResizeObserver fires when Code shows it again. The header and page must come back
      // on a surface that is not being typed on, so a hidden card also releases the typing layer.
      if (bar.getBoundingClientRect().height === 0) {
        release();
        return;
      }
      // The typing layer owns the screen. The global header and the tab picker are not part of it:
      // hiding them gives their 153 px to the code and leaves the mode bar at the top, instead of
      // making the page scroll to put the bar there.
      body.dataset.phoneTyping = '1';
      root.dataset.phoneTyping = '1';
      const viewport = window.visualViewport;
      // The visible top of the screen. At rest it is zero. iOS raises it when it pans the visual
      // viewport — the OS keyboard opening, and also a caret reveal that iOS 26 performs even when
      // `preventScroll` was asked for. Following it is what keeps the mode bar and the code in the
      // screen the learner can actually see; the body is pinned (`pageTop` below), so the window
      // itself has no scroll left to give. A pinch zoom is the learner's own view of the code, and
      // is not pulled back to the layout top.
      const zoomed = viewport ? viewport.scale > 1.01 : false;
      const viewTop = zoomed ? 0 : Math.round(viewport?.offsetTop ?? 0);
      // The visible bottom is the keys on the custom layout, and the visual viewport when the OS
      // keyboard shrinks it. The Study bar is an edge too — on Android the layout viewport shrinks
      // with the OS keyboard, so the bar sits above it, while on iOS the bar is behind the keyboard
      // and its top is below the visible bottom. Taking the nearer of the two covers both; a sheet
      // hides the bar, and then the keys or the viewport are the edge.
      const study = studyBar?.getBoundingClientRect();
      const visibleBottom = keyboardNative
        ? viewTop + Math.round(viewport?.height ?? window.innerHeight)
        : window.innerHeight - keyboardHeight;
      const bottom = Math.min(visibleBottom, study && study.height > 0 ? study.top : Infinity);
      if (!pinned) {
        // Put the mode bar at the top of the typing layer while the page can still scroll. On a
        // custom-keyboard open the header and picker were taking exactly this room, so this is
        // usually already true and does not scroll. `instant`, not `auto`: the page's own
        // scroll-behavior is smooth, and an animated placement measured a band while the page was
        // still travelling.
        const box = bar.getBoundingClientRect();
        if (Math.abs(box.top - viewTop) > 1) {
          window.scrollTo({ top: window.scrollY + box.top - viewTop, behavior: 'instant' });
        }
        // The page cannot scroll any more: pin the body where the bar is at the top. The scroll
        // offset moves into `--phone-typing-top`, which `index.css` reads as the body's top, so
        // the page is drawn in the same place after it leaves the flow.
        pageTop = -window.scrollY;
        body.style.setProperty('--phone-typing-top', `${pageTop}px`);
        body.dataset.phoneLock = '1';
        pinned = true;
        window.scrollTo({ top: 0, behavior: 'instant' });
      } else {
        // The fixed body is where the page is. Move it — not the window — when the visual viewport
        // moves under it (the OS keyboard, a rotation, a browser that still panned the caret).
        const delta = Math.round(viewTop - bar.getBoundingClientRect().top);
        if (Math.abs(delta) > 1) {
          pageTop += delta;
          body.style.setProperty('--phone-typing-top', `${pageTop}px`);
        }
      }
      const top = bar.getBoundingClientRect().bottom;
      // Never taller than the room that exists. A floor overran the Study bar on a short phone: at
      // 360×640 the bar began at 242 px while a 140 px face ended at 293 px, so the last 51 px of
      // code — the line being typed — sat behind the bar while the editor's own scroller still
      // believed the caret was visible. A smaller band is honest; an overlapping one hides the
      // text the learner is writing.
      const next = Math.max(0, Math.round(bottom - top));
      setEditorBand((current) => (Math.abs((current ?? 0) - next) <= 1 ? current : next));
    };
    compute();

    // The page is a still surface while a finger types. A browser can still try to scroll it to
    // reveal a focused contenteditable (iOS 26 does, because it ignores `preventScroll`), so any
    // scroll outside the placement is undone; only the editor's own scroller moves. The listener
    // starts after the first placement so that placement's own instant scroll is not a recoil.
    const guard = () => {
      if (pinned && window.scrollY !== 0) {
        window.scrollTo({ top: 0, behavior: 'instant' });
      }
    };
    window.addEventListener('scroll', guard, { passive: true });

    // Sizing the editor changes the page's height by hundreds of pixels. Settle over a handful of
    // frames so the placement and the band are read from the page the learner actually has; each
    // pass is idempotent, and a pass whose bar is already in place does not scroll.
    let frame = 0;
    let frames = 0;
    const settle = () => {
      compute();
      frames += 1;
      if (frames < 8) frame = requestAnimationFrame(settle);
    };
    frame = requestAnimationFrame(settle);
    const observer = new ResizeObserver(compute);
    observer.observe(bar);
    if (studyBar) observer.observe(studyBar);
    window.addEventListener('resize', compute);
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', compute);
    viewport?.addEventListener('scroll', compute);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('scroll', guard);
      window.removeEventListener('resize', compute);
      viewport?.removeEventListener('resize', compute);
      viewport?.removeEventListener('scroll', compute);
      release();
    };
  }, [active, keyboardNative, keyboardHeight, deferPhoneEditor, openHelper, modeBarRef, setEditorBand]);

  // When the typing layer ends, the header comes back over the page and can cover the mode bar —
  // including the button that brings the Python keys back. Put the bar just under the header, as it
  // sat before the keys took the screen, instead of leaving it behind the sticky chrome.
  const wasActiveRef = useRef(false);
  useIsomorphicLayoutEffect(() => {
    if (active) {
      wasActiveRef.current = true;
      return;
    }
    if (!wasActiveRef.current) return;
    wasActiveRef.current = false;
    const bar = modeBarRef.current;
    if (!bar || !bar.isConnected) return;
    const barBox = bar.getBoundingClientRect();
    // The Lesson surface keeps the card mounted but hidden; its zero-height bar is not a place the
    // page should scroll to.
    if (barBox.height === 0) return;
    // The header and the tab picker both sit over the page. The picker is sticky under the header,
    // so its final bottom is the header's height plus the picker's own height; measuring its
    // transient rect while the page is still settling put the bar back underneath it.
    const header = document.querySelector<HTMLElement>('header[data-chrome="header"]');
    const rail = document.querySelector<HTMLElement>('[data-chrome="rail"]');
    const visible = (element: HTMLElement | null): element is HTMLElement =>
      element !== null && getComputedStyle(element).display !== 'none';
    const headerHeight = visible(header) ? header.getBoundingClientRect().height : 0;
    const railHeight = visible(rail) ? rail.getBoundingClientRect().height : 0;
    if (headerHeight + railHeight === 0) return;
    const target = headerHeight + railHeight + 4;
    if (barBox.top < target - 1) {
      window.scrollTo({
        top: window.scrollY - (target - barBox.top),
        behavior: 'instant',
      });
    }
  }, [active, modeBarRef]);
}
