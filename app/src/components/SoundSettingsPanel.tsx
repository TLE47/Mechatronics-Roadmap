import React from 'react';
import { RotateCcw } from 'lucide-react';
import type { SoundPrefs } from '../audio/prefs.ts';
import { MUSIC_BEDS, bedCredit } from '../audio/musicCatalogue.ts';
import type { UiRole } from '../audio/facade.ts';

/**
 * The audio settings panel (`app/src/components/SoundSettingsPanel.tsx`).
 *
 * Sound v1's panel was three sliders in a popover. This is the same popover grown into a real settings
 * surface, in the order a learner asks the questions:
 *
 * 1. **Sound** — the master, and what "on" actually means (nothing autoplays; a remembered on waits
 *    for the next press).
 * 2. **Music** — the bed's level, and *which* bed: the two recorded lo-fi tracks or the synthesised
 *    drone. The line under it says what the run duck does, because a learner who hears the music step
 *    back deserves to know it was the checks.
 * 3. **Room** — the rain, the floor and the city, as one fader, with what those words mean.
 * 4. **Interface** — the tick level, a switch for whether the interface ticks at all, and previews,
 *    so the decision is made by ear rather than by description.
 * 5. **Credit** — whose music this is and the licence it is used under, always visible.
 *
 * It is deliberately not a dialog: no focus trap, no backdrop, no scroll lock. It draws under the
 * header's button, closes on Escape or a press outside, and every control in it is a plain input, so
 * the keyboard reaches it without any special handling. A learner who never opens it loses nothing —
 * the defaults are the design.
 */
interface Props {
  id: string;
  prefs: SoundPrefs;
  /** True once the engine has actually started in this session (a remembered "on" is armed, not on). */
  armed: boolean;
  onToggle: () => void;
  onLevel: (key: 'music' | 'room' | 'sfx', value: number) => void;
  onClicks: (on: boolean) => void;
  onBeds: (beds: 'lofi' | 'synth') => void;
  onPreview: (role: UiRole) => void;
  onReset: () => void;
}

const LEVELS = [
  { key: 'music', label: 'Music', hint: 'Ducked while a run is active, and quieter in focus.' },
  { key: 'room', label: 'Room', hint: 'Rain on the window, the electrical floor, the city beyond it.' },
  { key: 'sfx', label: 'Cues', hint: 'The relay on Run, the pass pips, the verification stamp.' },
] as const;

const PREVIEWS = [
  { role: 'nav', label: 'A tab' },
  { role: 'primary', label: 'Run' },
  { role: 'close', label: 'Close' },
] as const;

export const SoundSettingsPanel: React.FC<Props> = ({
  id,
  prefs,
  armed,
  onToggle,
  onLevel,
  onClicks,
  onBeds,
  onPreview,
  onReset,
}) => (
  <div
    id={id}
    role="group"
    aria-label="Audio settings"
    data-testid="sound-settings"
    className="absolute right-0 z-50 mt-2 w-[19.5rem] rounded-lg border p-3 shadow-xl"
    style={{ top: '100%', borderColor: 'var(--border-strong)', backgroundColor: 'var(--panel)', color: 'var(--text)' }}
  >
    {/* ---- Sound: the master, and the one rule that shapes everything else ---- */}
    <section aria-label="Sound" data-testid="sound-section-master">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-semibold">Sound</span>
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={prefs.on}
          aria-label={prefs.on ? 'Turn sound off' : 'Turn sound on'}
          data-testid="btn-sound-master"
          className="rounded-full border px-2.5 py-1 text-[11px] font-semibold"
          style={{
            borderColor: 'var(--border-strong)',
            backgroundColor: prefs.on ? 'var(--accent-soft)' : 'transparent',
            color: prefs.on ? 'var(--accent)' : 'var(--muted)',
          }}
        >
          {prefs.on ? 'On' : 'Off'}
        </button>
      </div>
      <p className="mt-1 text-[11px] leading-snug" style={{ color: 'var(--dim)' }} data-testid="sound-hint">
        {prefs.on
          ? armed
            ? 'On. Focus quiets it, a run ducks it, and this button is the only mute you need.'
            : 'Armed: nothing plays until your next click or key press.'
          : 'Off until you ask. Nothing autoplays, and the choice is remembered.'}
      </p>
    </section>

    {/* ---- Music: how loud, and which one ---- */}
    <section aria-label="Music" className="mt-3 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide">Music</span>
        <span className="font-mono text-[11px] tabular-nums" style={{ color: 'var(--muted)' }}>
          {Math.round(prefs.music * 100)}%
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(prefs.music * 100)}
        disabled={!prefs.on}
        onChange={(event) => onLevel('music', Number(event.target.value))}
        aria-label="Music volume"
        data-testid="sound-music"
        className="mt-1 w-full cursor-pointer"
        style={{ accentColor: 'var(--accent)' }}
      />
      <div className="mt-2 flex gap-1.5" role="group" aria-label="Music source">
        {(['lofi', 'synth'] as const).map((choice) => {
          const active = prefs.beds === choice;
          return (
            <button
              key={choice}
              type="button"
              disabled={!prefs.on}
              aria-pressed={active}
              onClick={() => onBeds(choice)}
              data-testid={`sound-bed-${choice}`}
              className="flex-1 rounded-md border px-2 py-1 text-[11px] font-semibold disabled:opacity-50"
              style={{
                borderColor: active ? 'var(--accent)' : 'var(--border)',
                backgroundColor: active ? 'var(--accent-soft)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--muted)',
              }}
            >
              {choice === 'lofi' ? 'Lo-fi tapes' : 'Drone'}
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-[11px] leading-snug" style={{ color: 'var(--dim)' }}>
        {prefs.beds === 'lofi'
          ? `${MUSIC_BEDS[0].title} at the bench, ${MUSIC_BEDS[1].title} in focus.`
          : 'Two detuned oscillators — a texture rather than a song.'}
      </p>
    </section>

    {/* ---- Room and cues ---- */}
    {LEVELS.slice(1).map(({ key, label, hint }) => (
      <section
        key={key}
        aria-label={label}
        className="mt-3 border-t pt-3"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex items-baseline justify-between">
          <label htmlFor={`${id}-${key}`} className="text-[11px] font-semibold uppercase tracking-wide">
            {label}
          </label>
          <span className="font-mono text-[11px] tabular-nums" style={{ color: 'var(--muted)' }}>
            {Math.round(prefs[key] * 100)}%
          </span>
        </div>
        <input
          id={`${id}-${key}`}
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(prefs[key] * 100)}
          disabled={!prefs.on}
          onChange={(event) => onLevel(key, Number(event.target.value))}
          aria-label={`${label} volume`}
          data-testid={`sound-${key}`}
          className="mt-1 w-full cursor-pointer"
          style={{ accentColor: 'var(--accent)' }}
        />
        <p className="mt-1 text-[11px] leading-snug" style={{ color: 'var(--dim)' }}>
          {hint}
        </p>
      </section>
    ))}

    {/* ---- The interface's own switch, and three previews ---- */}
    <section aria-label="Interface" className="mt-3 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
      <button
        type="button"
        onClick={() => onClicks(!prefs.clicks)}
        aria-pressed={prefs.clicks}
        disabled={!prefs.on}
        data-testid="sound-clicks"
        className="flex w-full items-center justify-between rounded-md border px-2 py-1.5 text-[11px] font-semibold disabled:opacity-50"
        style={{
          borderColor: 'var(--border)',
          backgroundColor: prefs.clicks ? 'var(--accent-soft)' : 'transparent',
          color: prefs.clicks ? 'var(--accent)' : 'var(--muted)',
        }}
      >
        <span>Interface clicks</span>
        <span aria-hidden="true">{prefs.clicks ? 'on' : 'off'}</span>
      </button>
      <div className="mt-2 flex gap-1.5" role="group" aria-label="Preview a click">
        {PREVIEWS.map(({ role, label }) => (
          <button
            key={role}
            type="button"
            onClick={() => onPreview(role)}
            disabled={!prefs.on}
            data-testid={`btn-sound-preview-${role}`}
            className="flex-1 rounded-md border px-1.5 py-1 text-[11px] disabled:opacity-50"
            style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
          >
            {label}
          </button>
        ))}
      </div>
    </section>

    {/* ---- Whose music this is ---- */}
    <section aria-label="Credits" className="mt-3 border-t pt-2" style={{ borderColor: 'var(--border)' }}>
      <p className="text-[10.5px] leading-snug" style={{ color: 'var(--dim)' }} data-testid="sound-credits">
        {bedCredit()} · public domain, cut into 60-second loops by this repository.
      </p>
      <div className="mt-2 flex items-center justify-between">
        <a
          href="https://freemusicarchive.org/music/holiznacc0/winter-lofi/"
          target="_blank"
          rel="noreferrer noopener"
          className="text-[10.5px] underline"
          style={{ color: 'var(--muted)' }}
        >
          Winter Lofi on Free Music Archive
        </a>
        <button
          type="button"
          onClick={onReset}
          data-testid="btn-sound-reset"
          className="flex items-center gap-1 text-[10.5px]"
          style={{ color: 'var(--muted)' }}
        >
          <RotateCcw className="h-3 w-3" aria-hidden="true" />
          Reset
        </button>
      </div>
    </section>
  </div>
);
