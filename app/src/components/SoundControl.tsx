import React from 'react';
import { createPortal } from 'react-dom';
import { cachedSoundPrefs, subscribeSoundPrefs, type SoundPrefs } from '../audio/prefs.ts';
import { change, install, preview, reset, subscribeArmed, togglePlay } from '../audio/musicManager.ts';
import type { UiRole } from '../audio/facade.ts';
import { AudioPlayerWidget } from './AudioPlayerWidget.tsx';
import { SoundSettingsPanel } from './SoundSettingsPanel.tsx';

/** The panel's design width, its gap from the button, and the least it keeps from a window edge. */
const PANEL_WIDTH = 312;
const PANEL_GAP = 8;
const PANEL_EDGE = 12;

/**
 * Where the panel goes, given the button that opened it.
 *
 * It hangs under the button, right-aligned to it and pulled back inside the window, and flips above
 * when there is more room there. `maxHeight` is all the room that side actually has — not a fixed
 * ceiling — so a phone shows as much of the card as it can and scrolls the remainder inside it,
 * rather than ending below the fold the way it used to, with the credit and **Reset** unreachable.
 */
function placePanel(trigger: DOMRect, viewportWidth: number, viewportHeight: number) {
  const width = Math.min(PANEL_WIDTH, viewportWidth - PANEL_EDGE * 2);
  const left = Math.min(
    Math.max(trigger.right - width, PANEL_EDGE),
    viewportWidth - width - PANEL_EDGE
  );
  const below = viewportHeight - trigger.bottom - PANEL_GAP - PANEL_EDGE;
  const above = trigger.top - PANEL_GAP - PANEL_EDGE;
  // Below unless it is clearly worse: the reading order (and the eye) starts under the button.
  const downwards = below >= 240 || below >= above;
  const room = Math.max(160, downwards ? below : above);
  return downwards
    ? { left, width, top: trigger.bottom + PANEL_GAP, maxHeight: room }
    : { left, width, bottom: viewportHeight - trigger.top + PANEL_GAP, maxHeight: room };
}

/**
 * The header's sound control (`app/src/components/SoundControl.tsx`).
 *
 * One button and a small panel. The button is the whole promise — sound on or off in one press, from
 * anywhere, including the focus pill — and the panel is the detail the plan asks for: music, effects,
 * and a sentence saying what will happen. Default is off, and a remembered "on" waits for a gesture
 * rather than autoplaying at load (`prefs.ts`, rule 1).
 *
 * The runtime is not here: `audio/musicManager.ts` owns the engine, the arming gesture, the message
 * bus and the one path from a stored preference to a mix. This component owns where the panel is,
 * how it closes, and which control drew it — nothing about sound.
 *
 * It is deliberately not a modal: it draws under one button, closes on Escape or a click outside, and
 * never covers the work. In focus mode the header is hidden by CSS, so `App` renders the pill variant
 * next to the way out — one press from muted, without a panel in the way.
 *
 * The panel is portalled to `<body>` and placed from the button's rect (`placePanel`). It used to be an
 * `absolute` child of the tray, which on a phone meant a card whose left edge was at -21 px and whose
 * lower half sat inside a sideways scroller's clip box: open, and impossible to use. The wrapper also
 * carries a `max-height`, so a short window scrolls the card rather than hiding its last rows.
 */
export const SoundControl: React.FC<{ variant?: 'header' | 'pill'; testIdSuffix?: string }> = ({
  variant = 'header',
  testIdSuffix,
}) => {
  const tid = (base: string) => (testIdSuffix ? `${base}-${testIdSuffix}` : base);
  const [prefs, setPrefs] = React.useState<SoundPrefs>(() => cachedSoundPrefs());
  const [open, setOpen] = React.useState(false);
  const [armed, setArmed] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  // The panel lives in a portal on `<body>`, so the header's sideways-scrolling tray row cannot clip
  // it; these two refs are how the control still knows it: one to place it, one to leave it alone.
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const popoverRef = React.useRef<HTMLDivElement | null>(null);
  const [box, setBox] = React.useState<{
    left: number;
    width: number;
    top?: number;
    bottom?: number;
    maxHeight: number;
  } | null>(null);
  const panelId = React.useId();
  const pill = variant === 'pill';

  // Install the runtime once, and follow both facts the panel prints: the preference and the arm.
  React.useEffect(() => {
    install();
    const release = subscribeArmed(setArmed);
    const stop = subscribeSoundPrefs(setPrefs);
    return () => {
      release();
      stop();
    };
  }, []);

  // Place the panel from the button's own rect, and keep placing it: the header is sticky, but a phone
  // scrolls the tray row sideways, which moves the button without moving the page.
  React.useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      setBox(placePanel(trigger.getBoundingClientRect(), window.innerWidth, window.innerHeight));
    };
    place();
    window.addEventListener('scroll', place, { passive: true, capture: true });
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  // Close on Escape (unless a dialog already took it) or on a press outside — and "outside" now means
  // outside both the control and the portalled panel, or every fader press would shut the panel.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) setOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (wrapRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  // Focus follows the panel: a keyboard opens it with the button, lands on the first control inside,
  // and gets the button back when it closes. A portalled panel is at the end of the document, so
  // without this the next Tab after opening would leave the header altogether.
  React.useEffect(() => {
    if (!open) return;
    const panel = popoverRef.current;
    const first = panel?.querySelector<HTMLElement>('button, input, a[href]');
    first?.focus({ preventScroll: true });
    return () => {
      // The cleanup runs after the portal has unmounted, so a focus that was inside the panel has
      // already landed on `<body>`: "nothing is focused" is the panel's own case, and the trigger takes
      // it back. A press on something else in the page focused that thing, and is left alone.
      const active = document.activeElement;
      const nothing = !active || active === document.body;
      const inside = panel?.contains(active) ?? false;
      const onTrigger = active === triggerRef.current;
      if (nothing || inside || onTrigger) triggerRef.current?.focus({ preventScroll: true });
    };
  }, [open]);

  const setLevel = (key: 'music' | 'room' | 'sfx', value: number) =>
    change({ [key]: value / 100 } as Partial<SoundPrefs>);

  return (
    <>
      <AudioPlayerWidget
        prefs={prefs}
        pill={pill}
        open={open}
        panelId={panelId}
        testIdSuffix={testIdSuffix}
        wrapRef={wrapRef}
        triggerRef={triggerRef}
        onToggle={() => togglePlay()}
        onOpenPanel={pill ? undefined : () => setOpen((value) => !value)}
      />
      {open &&
        !pill &&
        box &&
        createPortal(
          <div
            ref={popoverRef}
            data-testid={tid('sound-popover')}
            className="z-[60] flex"
            style={{ position: 'fixed', ...box }}
          >
            <SoundSettingsPanel
              id={panelId}
              testIdSuffix={testIdSuffix}
              prefs={prefs}
              armed={armed}
              onToggle={() => togglePlay()}
              onLevel={setLevel}
              onClicks={(on) => change({ clicks: on })}
              onTape={(tape) => change({ tape })}
              onPreview={(role: UiRole) => preview(role)}
              onReset={() => reset()}
            />
          </div>,
          document.body
        )}
    </>
  );
};
