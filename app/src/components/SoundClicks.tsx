import React from 'react';
import { playUi } from '../audio/facade.ts';
import { CLICK_TARGETS, panFromX, roleForControl, type ControlFacts } from '../audio/clickMap.ts';

/**
 * The interface's own ear (`app/src/components/SoundClicks.tsx`).
 *
 * One delegated listener, not a hook in every button. It reads the control under the pointer (or
 * the one the keyboard just activated), asks `clickMap.ts` what it is, and dispatches a
 * `playUi(role, pan)`. A muted learner pays for this file and nothing else: `playUi` is three lines
 * that dispatch an event, and no listener exists until the engine's chunk arrives.
 *
 * Three rules keep it from becoming a noisemaker:
 *
 * - **The same press is one sound.** A pointer press sounds once; a keyboard activation sounds once;
 *   if both arrive for the same control within a frame, the second is dropped.
 * - **Nothing without a target.** A click on text, the editor, or the page background is silent —
 *   only the selector in `clickMap.ts` counts, and `data-sound="none"` opts a subtree out.
 * - **The position is the sound's.** `pan` comes from the pointer against the viewport, so a click on
 *   the rail leans left and one on the runner leans right; a keyboard press is centred.
 *
 * It renders nothing. It is mounted once in `App`, in every branch, because the header appears on
 * every screen and a second mount would be a second tick.
 */
const DEDUPE_MS = 40;

function factsFor(element: Element): ControlFacts {
  const node = element as HTMLElement;
  const hasAttribute = (name: string) => node.hasAttribute?.(name) === true;
  return {
    tag: node.tagName?.toLowerCase?.() ?? '',
    role: node.getAttribute?.('role') ?? null,
    inputType: (node as HTMLInputElement).type ?? null,
    sound: node.getAttribute?.('data-sound') ?? null,
    disabled: (node as HTMLButtonElement).disabled === true,
    ariaDisabled: node.getAttribute?.('aria-disabled') === 'true',
    ariaExpanded: hasAttribute('aria-expanded') ? node.getAttribute('aria-expanded') === 'true' : null,
    ariaPressed: hasAttribute('aria-pressed') ? node.getAttribute('aria-pressed') === 'true' : null,
    label:
      node.getAttribute?.('aria-label') ??
      node.getAttribute?.('title') ??
      node.textContent?.trim().slice(0, 48) ??
      '',
  };
}

/** The nearest ancestor that opted out of interface sound, or null. */
function optedOut(element: Element | null): boolean {
  return Boolean(element?.closest?.('[data-sound="none"]'));
}

export const SoundClicks: React.FC = () => {
  React.useEffect(() => {
    let lastAt = -Infinity;
    let lastTarget: Element | null = null;

    const fire = (target: Element | null, x: number | null) => {
      if (!target || optedOut(target)) return;
      const role = roleForControl(factsFor(target));
      if (!role) return;
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (target === lastTarget && now - lastAt < DEDUPE_MS) return;
      lastAt = now;
      lastTarget = target;
      const pan = x === null || typeof window === 'undefined' ? 0 : panFromX(x, window.innerWidth);
      playUi(role, pan);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      const target = (event.target as Element | null)?.closest?.(CLICK_TARGETS) ?? null;
      fire(target, event.clientX);
    };

    // Enter and Space activate a focused control without a pointer, and a keyboard learner deserves
    // the same room. `repeat` is a held key typing into the interface, not a press.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const active = document.activeElement;
      if (!active || active === document.body) return;
      const target = active.closest?.(CLICK_TARGETS) ?? null;
      if (!target) return;
      fire(target, null);
    };

    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return null;
};
