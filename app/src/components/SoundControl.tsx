import React from 'react';
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

  // Close on Escape (unless a dialog already took it) or on a click outside.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) setOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
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
      beds: prefsRef.current.beds,
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
        title={soundLabel(prefs.on)}
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
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label="Sound settings"
          data-testid={tid('btn-sound-settings')}
          className="btn ml-1 px-1.5"
          style={{ color: 'var(--muted)' }}
        >
          <span aria-hidden="true">···</span>
        </button>
      )}
      {open && !pill && (
        <SoundSettingsPanel
          id={panelId}
          testIdSuffix={testIdSuffix}
          prefs={prefs}
          armed={armed}
          onToggle={toggle}
          onLevel={setLevel}
          onClicks={(on) => change({ clicks: on })}
          onBeds={(beds) => change({ beds })}
          onPreview={preview}
          onReset={reset}
        />
      )}
    </div>
  );
};
