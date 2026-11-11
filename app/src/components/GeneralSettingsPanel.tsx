import React from 'react';
import { createPortal } from 'react-dom';
import { Settings2, X } from 'lucide-react';
import { GENERAL_SETTINGS_EVENT, readShowActionLabels, writeShowActionLabels } from '../generalSettings';
import { cachedSoundPrefs, subscribeSoundPrefs, type SoundPrefs } from '../audio/prefs.ts';
import { change, install, preview, reset, subscribeArmed, togglePlay } from '../audio/musicManager.ts';
import type { UiRole } from '../audio/facade.ts';
import { SoundSettingsPanel } from './SoundSettingsPanel';

/** The live sound controls, without the header popover: the same store, the same one apply path. */
const SoundSettingsLive: React.FC<{ id: string }> = ({ id }) => {
  const [prefs, setPrefs] = React.useState<SoundPrefs>(() => cachedSoundPrefs());
  const [armed, setArmed] = React.useState(false);
  React.useEffect(() => {
    install();
    const release = subscribeArmed(setArmed);
    const stop = subscribeSoundPrefs(setPrefs);
    return () => {
      release();
      stop();
    };
  }, []);
  return (
    <SoundSettingsPanel
      id={id}
      prefs={prefs}
      armed={armed}
      onToggle={() => togglePlay()}
      onLevel={(key, value) => change({ [key]: value / 100 } as Partial<SoundPrefs>)}
      onClicks={(on) => change({ clicks: on })}
      onTape={(tape) => change({ tape })}
      onInstrument={(instrument) => change({ instrument })}
      excluded={prefs.excluded}
      onExclude={(tape) =>
        change({
          excluded: prefs.excluded.includes(tape)
            ? prefs.excluded.filter((entry) => entry !== tape)
            : [...prefs.excluded, tape],
        })
      }
      onRandomize={(randomize) => change({ randomize })}
      onPreview={(role: UiRole) => preview(role)}
      onReset={() => reset()}
    />
  );
};

/**
 * General settings (`components/GeneralSettingsPanel.tsx`).
 *
 * One dialog for the preferences that are about the workbench rather than the lesson: the action
 * tray's small text labels, and the whole sound surface, which used to live behind the speaker icon
 * alone. The speaker still mutes in one press; this is where the detail is read and changed.
 */
export const GeneralSettingsPanel: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [labels, setLabels] = React.useState(readShowActionLabels());
  const closeRef = React.useRef<HTMLButtonElement | null>(null);
  // Whoever opened the dialog gets the focus back: the gear, or the speaker's detail button, which
  // is the same door now that sound lives here.
  const returnFocusRef = React.useRef<HTMLElement | null>(null);
  const panelId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const refresh = () => setLabels(readShowActionLabels());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener(GENERAL_SETTINGS_EVENT, refresh);
    window.addEventListener('keydown', onKey);
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener(GENERAL_SETTINGS_EVENT, refresh);
      window.removeEventListener('keydown', onKey);
      returnFocusRef.current?.focus({ preventScroll: true });
    };
  }, [open, onClose]);

  if (!open) return null;
  // Portalled to `body`: the header that opens this dialog is `backdrop-blur`red, and a filtered
  // ancestor is a containing block for `position: fixed`. Rendered in place, `inset-0` resolved to
  // the header's box instead of the window, which put the dialog ~390 px above a phone's screen.
  const dialog = (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-black/60 p-4 pt-[10vh] max-sm:items-end max-sm:p-0"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        id={panelId}
        role="dialog"
        aria-modal="true"
        aria-label="General settings"
        data-testid="general-settings"
        className="w-full max-w-lg overflow-hidden rounded-xl border shadow-2xl max-sm:max-h-[92dvh] max-sm:rounded-b-none"
        style={{ borderColor: 'var(--border-strong)', backgroundColor: 'var(--panel)', color: 'var(--text)' }}
      >
        <div className="flex items-center justify-between gap-2 border-b px-3.5 py-2.5" style={{ borderColor: 'var(--border)' }}>
          <span className="flex items-center gap-2 text-[13px] font-semibold">
            <Settings2 className="h-4 w-4" style={{ color: 'var(--accent)' }} aria-hidden="true" />
            General settings
          </span>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            data-testid="btn-general-settings-close"
            aria-label="Close general settings"
            className="rounded border px-2 py-0.5 text-[12px]"
            style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-3.5">
          <section aria-label="Action tray" data-testid="general-tray">
            <button
              type="button"
              onClick={() => setLabels(writeShowActionLabels(!labels))}
              aria-pressed={labels}
              data-testid="btn-action-labels"
              className="flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left"
              style={{
                borderColor: labels ? 'var(--accent)' : 'var(--border)',
                backgroundColor: labels ? 'var(--accent-soft)' : 'transparent',
              }}
            >
              <span>
                <span className="block text-[12px] font-semibold">Small text on the action buttons</span>
                <span className="block text-[11px]" style={{ color: 'var(--dim)' }}>
                  Keep the words beside the icons in the header trays at compact widths, so every
                  button says what it does instead of waiting for a hover.
                </span>
              </span>
              <span aria-hidden="true" className="font-mono text-[11px]">
                {labels ? 'on' : 'off'}
              </span>
            </button>
          </section>
          <section aria-label="Sound settings" data-testid="general-sound" className="mt-3 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
              Sound
            </p>
            <SoundSettingsLive id={`${panelId}-sound`} />
          </section>
        </div>
      </div>
    </div>
  );
  return typeof document === 'undefined' ? null : createPortal(dialog, document.body);
};
