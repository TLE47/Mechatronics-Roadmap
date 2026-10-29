import React from 'react';
import { createPortal } from 'react-dom';
import { Volume2, VolumeX } from 'lucide-react';
import { SOUND_EVENT, previewUi, readSoundMessage, type UiRole } from '../audio/facade.ts';
import {
  DEFAULT_SOUND_PREFS,
  cachedSoundPrefs,
  soundLabel,
  subscribeSoundPrefs,
  writeSoundPrefs,
  type SoundPrefs,
} from '../audio/prefs.ts';
import { FOCUS_EVENT, readFocus } from '../focusMode.ts';
import { SoundSettingsPanel } from './SoundSettingsPanel.tsx';

type Engine = import('../audio/engine.ts').SoundEngine;
type Handle = typeof import('../audio/engine.ts').handleSoundMessage;

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

let resolved: Engine | null = null;
let loading: Promise<Engine> | null = null;
/**
 * The handler, kept beside the engine so a press reaches it **inside the event**.
 *
 * This is not a micro-optimisation. A press is dispatched on `pointerdown` and the control's own
 * `onClick` runs after it; if the message waited on a promise chain, the click would flip a setting
 * (interface clicks off, say) before the tick it caused was scheduled — and that tick would be
 * correctly-but-uselessly dropped, because by then the interface really was silent. Handling the
 * message synchronously is what makes "the press that turns the clicks off is still heard" true.
 */
let handler: Handle | null = null;

/**
 * Load the synthesiser without constructing anything. The chunk is small and fetched at idle, so the
 * click that turns sound on almost always finds it already here — which matters, because the
 * AudioContext must be created inside the gesture, not several microtasks after it.
 */
export function loadSoundEngine(): Promise<Engine> {
  if (!loading) {
    loading = import('../audio/engine.ts').then((module) => {
      const engine = new module.SoundEngine();
      resolved = engine;
      handler = module.handleSoundMessage;
      // A read-only snapshot for the browser suites: no secret, no setter, the same numbers the panel
      // renders. `scripts/e2e_game.mjs` reads it to prove a cue fired and a run ducked the bed.
      (window as unknown as { __mechalabAudio?: () => unknown }).__mechalabAudio = () => engine.debug();
      return engine;
    });
  }
  return loading;
}

/**
 * The header's sound control (`app/src/components/SoundControl.tsx`).
 *
 * One button and a small panel. The button is the whole promise — sound on or off in one press, from
 * anywhere, including the focus pill — and the panel is the detail the plan asks for: music, effects,
 * and a sentence saying what will happen. Default is off, and a remembered "on" waits for a gesture
 * rather than autoplaying at load (`prefs.ts`, rule 1).
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
  const prefsRef = React.useRef(prefs);
  prefsRef.current = prefs;
  const pill = variant === 'pill';

  // Every control (header and pill) renders the same fact.
  React.useEffect(() => subscribeSoundPrefs(setPrefs), []);

  // Warm the chunk after first paint, never before it: a learner who keeps sound off downloads no
  // audio code beyond this component.
  React.useEffect(() => {
    const idle = (
      window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }
    ).requestIdleCallback;
    const handle = idle
      ? idle(() => void loadSoundEngine(), { timeout: 2000 })
      : window.setTimeout(() => void loadSoundEngine(), 800);
    return () => {
      if (!idle) window.clearTimeout(handle as number);
    };
  }, []);

  const start = React.useCallback(() => {
    void loadSoundEngine().then((engine) => {
      // A learner who studies in focus keeps it across a reload, and a bed that starts in the lab and
      // waits for a toggle to go quiet is not the room they chose.
      engine.setScene(readFocus() ? 'focus' : 'home');
      return engine.enable(prefsRef.current).then(() => setArmed(true));
    });
  }, []);

  // A remembered "on" is armed, not playing: the first pointer or key press starts it. This is the
  // whole of the autoplay rule, and why the toggle does not simply call `enable()` on mount.
  React.useEffect(() => {
    if (!prefs.on) return;
    const kick = () => start();
    window.addEventListener('pointerdown', kick, { once: true, passive: true });
    window.addEventListener('keydown', kick, { once: true });
    return () => {
      window.removeEventListener('pointerdown', kick);
      window.removeEventListener('keydown', kick);
    };
  }, [prefs.on, start]);

  // The bus: cues from the runner and the scene from focus mode's own event.
  React.useEffect(() => {
    const onSound = (event: Event) => {
      const message = readSoundMessage(event);
      if (!message) return;
      // Synchronous once the engine is here, which is the common case by the time sound is on.
      if (resolved && handler) {
        handler(resolved, message);
        return;
      }
      void loadSoundEngine().then((engine) => {
        if (handler) handler(engine, message);
      });
    };
    const onFocus = (event: Event) => {
      const on = Boolean((event as CustomEvent<{ on?: boolean }>).detail?.on);
      void loadSoundEngine().then((engine) => engine.setScene(on ? 'focus' : 'home'));
    };
    window.addEventListener(SOUND_EVENT, onSound);
    window.addEventListener(FOCUS_EVENT, onFocus);
    return () => {
      window.removeEventListener(SOUND_EVENT, onSound);
      window.removeEventListener(FOCUS_EVENT, onFocus);
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

  const toggle = () => {
    const next = writeSoundPrefs({ on: !prefsRef.current.on });
    setPrefs(next);
    if (next.on) start();
    else {
      setArmed(false);
      void loadSoundEngine().then((engine) => engine.apply(next));
    }
  };

  /** One writer for every control in the panel: store, render, and the engine in the same breath. */
  const change = (patch: Partial<SoundPrefs>) => {
    const next = writeSoundPrefs(patch);
    setPrefs(next);
    void loadSoundEngine().then((engine) => engine.apply(next));
  };

  const setLevel = (key: 'music' | 'room' | 'sfx', value: number) =>
    change({ [key]: value / 100 } as Partial<SoundPrefs>);

  /** A preview is a request to hear one tick, so it plays even with interface clicks switched off. */
  const preview = (role: UiRole) => {
    if (!prefsRef.current.on) return;
    void loadSoundEngine();
    previewUi(role);
  };

  /** Reset the levels and choices, but never switch the learner's sound off behind their back. */
  const reset = () =>
    change({
      ...DEFAULT_SOUND_PREFS,
      on: prefsRef.current.on,
      // A reset that changed the music mid-phrase would be a surprise; it is a level reset first.
      tape: prefsRef.current.tape,
    });

  return (
    <div
      ref={wrapRef}
      data-testid={tid(pill ? 'sound-control-pill' : 'sound-control')}
      className="relative flex items-center"
    >
      <button
        type="button"
        onClick={toggle}
        data-testid={tid(pill ? 'btn-sound-toggle-pill' : 'btn-sound-toggle')}
        aria-label={soundLabel(prefs.on)}
        aria-pressed={prefs.on}
        data-tip={`Sound — ${soundLabel(prefs.on).toLowerCase()}`}
        className={
          pill
            ? 'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] font-semibold shadow-lg'
            : 'btn'
        }
        style={{
          borderColor: pill ? 'var(--border-strong)' : undefined,
          backgroundColor: pill ? 'var(--panel)' : undefined,
          color: prefs.on ? 'var(--accent)' : pill ? 'var(--muted)' : undefined,
        }}
      >
        {prefs.on ? (
          <Volume2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        ) : (
          <VolumeX className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        )}
        {pill ? (
          <span>{prefs.on ? 'Sound' : 'Muted'}</span>
        ) : (
          <span className="hidden 2xl:inline">Sound</span>
        )}
      </button>
      {!pill && (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label="Sound settings"
          data-testid={tid('btn-sound-settings')}
          data-tip="Sound settings — volume, ambience and the click map"
          className="btn ml-1 px-1.5"
          style={{ color: 'var(--muted)' }}
        >
          <span aria-hidden="true">···</span>
        </button>
      )}
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
              onToggle={toggle}
              onLevel={setLevel}
              onClicks={(on) => change({ clicks: on })}
              onTape={(tape) => change({ tape })}
              onPreview={preview}
              onReset={reset}
            />
          </div>,
          document.body
        )}
    </div>
  );
};
