import React from 'react';
import { RotateCcw } from 'lucide-react';
import {
  RANDOMIZE_INTERVAL_MINUTES,
  isRandomizeMode,
  type InstrumentChoice,
  type RandomizeMode,
  type SoundPrefs,
} from '../audio/prefs.ts';
import {
  DRONE_ID,
  INSTRUMENTS,
  MUSIC_CATEGORIES,
  TAPE_SCRIPT_PAGE,
  categoryOf,
  defaultTapeFor,
  tapesIn,
  tapeById,
  tapeCredit,
} from '../audio/musicCatalogue.ts';
import type { UiRole } from '../audio/facade.ts';

/**
 * The audio settings panel (`app/src/components/SoundSettingsPanel.tsx`).
 *
 * Sound v1's panel was three sliders in a popover. This is the same popover grown into a real settings
 * surface, in the order a learner asks the questions:
 *
 * 1. **Sound** — the master, and what "on" actually means (nothing autoplays; a remembered on waits
 *    for the next press).
 * 2. **Music** — the level, then *which* tape: five genre doors (Lo-fi, J-Pop, Synthwave, Chiptune,
 *    Acoustic) plus the drone, and inside a door the tapes it holds. The rows are chips that wrap,
 *    because a 360 px phone cannot show six side by side and a horizontal scroller would hide three
 *    of them. The line under the picker says what the run duck does, because a learner who hears the
 *    music step back deserves to know it was the checks. A final select chooses whether that tape
 *    stays, changes on a timer, or changes after each verified lesson.
 * 3. **Room** — the rain, the floor and the city, as one fader, with what those words mean.
 * 4. **Interface** — the tick level, a switch for whether the interface ticks at all, and previews,
 *    so the decision is made by ear rather than by description.
 * 5. **Credit** — whose music this is and the licence it is used under, always visible.
 *
 * It is deliberately not a dialog: no focus trap, no backdrop, no scroll lock. It draws under the
 * header's button, closes on Escape or a press outside, and every control in it is a plain input, so
 * the keyboard reaches it without any special handling. A learner who never opens it loses nothing —
 * the defaults are the design.
 *
 * **Where it sits is not this component's business.** The card used to be `absolute right-0` inside
 * the header's tray, which on a phone put its left edge at -21 px and let the tray's sideways scroller
 * clip it — the panel was open and could not be used. `SoundControl` now portals it to `<body>` and
 * hands it a width, a position and a `max-height` through the wrapper; the card fills that box and
 * scrolls inside it, so a short screen loses a row to the scrollbar rather than the credit and the
 * reset button.
 */
interface Props {
  id: string;
  /** Distinguishes Home's copy from the header's when both are mounted; absent keeps today's ids. */
  testIdSuffix?: string;
  prefs: SoundPrefs;
  /** True once the engine has actually started in this session (a remembered "on" is armed, not on). */
  armed: boolean;
  onToggle: () => void;
  onLevel: (key: 'music' | 'room' | 'sfx', value: number) => void;
  onClicks: (on: boolean) => void;
  /** A catalogue tape id, or `drone`. */
  onTape: (tape: string) => void;
  /** Tapes the randomiser must never choose. */
  excluded: string[];
  /** Flip one tape in or out of the shuffle, without changing what is playing. */
  onExclude: (tape: string) => void;
  onRandomize: (mode: RandomizeMode) => void;
  /** The drone's timbre; any instrument also chooses the drone, so the choice is audible at once. */
  onInstrument: (instrument: InstrumentChoice) => void;
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

const RANDOMIZE_CHOICES: readonly { value: RandomizeMode; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'time', label: `Every ${RANDOMIZE_INTERVAL_MINUTES} min` },
  { value: 'lesson', label: 'After each lesson' },
];

export const SoundSettingsPanel: React.FC<Props> = ({
  id,
  testIdSuffix,
  prefs,
  armed,
  onToggle,
  onLevel,
  onClicks,
  onTape,
  excluded,
  onExclude,
  onRandomize,
  onInstrument,
  onPreview,
  onReset,
}) => {
  const tid = (base: string) => (testIdSuffix ? `${base}-${testIdSuffix}` : base);
  const tape = tapeById(prefs.tape);
  const openCategory = categoryOf(prefs.tape);
  const openCategoryHint = MUSIC_CATEGORIES.find((entry) => entry.id === openCategory)?.hint ?? null;
  return (
  <div
    id={id}
    role="group"
    aria-label="Audio settings"
    data-testid={tid('sound-settings')}
    className="w-full rounded-lg border p-3 shadow-xl"
    style={{
      // The wrapper owns the box: its width and its `max-height` (including the phone's clamped
      // one). Inheriting it here is what makes the card scroll instead of running off the screen.
      maxHeight: 'inherit',
      overflowY: 'auto',
      // And it must be allowed to be *narrower* than its own longest row: on a 320 px phone the
      // credit line's min-content width is 312 px, and a flex item's default `min-width: auto`
      // would keep the card that wide however small a width the wrapper asked for.
      minWidth: 0,
      overflowWrap: 'anywhere',
      borderColor: 'var(--border-strong)',
      backgroundColor: 'var(--panel)',
      color: 'var(--text)',
    }}
  >
    {/* ---- Sound: the master, and the one rule that shapes everything else ---- */}
    <section aria-label="Sound" data-testid={tid('sound-section-master')}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-semibold">Sound</span>
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={prefs.on}
          aria-label={prefs.on ? 'Turn sound off' : 'Turn sound on'}
          data-testid={tid('btn-sound-master')}
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
      <p className="mt-1 text-[11px] leading-snug" style={{ color: 'var(--dim)' }}          data-testid={tid('sound-hint')}>
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
        data-testid={tid('sound-music')}
        className="mt-1 w-full cursor-pointer"
        style={{ accentColor: 'var(--accent)' }}
      />
      {/* Five doors wrap to two rows on a phone; the drone is the last chip, not a sixth door,
          because it is the one choice that is not a song. */}
      <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Music category">
        {MUSIC_CATEGORIES.map((entry) => {
          const active = openCategory === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              disabled={!prefs.on}
              aria-pressed={active}
              onClick={() => onTape(defaultTapeFor(entry.id).id)}
              data-testid={tid(`sound-category-${entry.id}`)}
              className="min-h-[32px] rounded-full border px-2.5 py-0.5 text-[11px] font-semibold disabled:opacity-50"
              style={{
                borderColor: active ? 'var(--accent)' : 'var(--border)',
                backgroundColor: active ? 'var(--accent-soft)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--muted)',
              }}
            >
              {entry.label}
            </button>
          );
        })}
        <button
          type="button"
          disabled={!prefs.on}
          aria-pressed={prefs.tape === DRONE_ID}
          onClick={() => onTape(DRONE_ID)}
          data-testid={tid('sound-tape-drone')}
          className="min-h-[32px] rounded-full border px-2.5 py-0.5 text-[11px] font-semibold disabled:opacity-50"
          style={{
            borderColor: prefs.tape === DRONE_ID ? 'var(--accent)' : 'var(--border)',
            backgroundColor: prefs.tape === DRONE_ID ? 'var(--accent-soft)' : 'transparent',
            color: prefs.tape === DRONE_ID ? 'var(--accent)' : 'var(--muted)',
          }}
        >
          Drone
        </button>
      </div>

      {/* The tapes inside the open category. One row per tape, full width, so the whole row is a
          thumb target and a title never has to be truncated into an ellipsis. */}
      {openCategory ? (
        <div className="mt-1.5 flex flex-col gap-1" role="group" aria-label="Music tape">
          {tapesIn(openCategory).map((entry) => {
            const active = prefs.tape === entry.id;
            const shuffled = !excluded.includes(entry.id);
            return (
              <div
                key={entry.id}
                className="flex items-stretch gap-1 rounded-md border text-[11px]"
                style={{
                  borderColor: active ? 'var(--accent)' : 'var(--border)',
                  backgroundColor: active ? 'var(--accent-soft)' : 'transparent',
                }}
              >
                <button
                  type="button"
                  disabled={!prefs.on}
                  aria-pressed={active}
                  onClick={() => onTape(entry.id)}
                  data-testid={tid(`sound-tape-${entry.id}`)}
                  className="flex min-h-[34px] min-w-0 flex-1 items-center justify-between gap-2 rounded-l-md px-2 py-1 text-left disabled:opacity-50"
                  style={{ color: active ? 'var(--accent)' : 'var(--text)' }}
                >
                  <span className="truncate font-semibold">{entry.title}</span>
                  <span className="shrink-0 font-mono text-[10px] tabular-nums" style={{ color: 'var(--muted)' }}>
                    {entry.seconds}s
                  </span>
                </button>
                {/* A tape stays in the catalogue whether or not the shuffle may choose it: this is
                    the difference between "not for me right now" and "delete this". */}
                <button
                  type="button"
                  disabled={!prefs.on}
                  onClick={() => onExclude(entry.id)}
                  aria-pressed={shuffled}
                  aria-label={`${shuffled ? 'Exclude' : 'Include'} ${entry.title} in the random shuffle`}
                  title={
                    shuffled
                      ? 'Let the randomiser choose this tape. Press to keep it out of the shuffle.'
                      : 'Kept out of the shuffle. Press to let the randomiser choose it again.'
                  }
                  data-testid={tid(`sound-tape-exclude-${entry.id}`)}
                  className="flex min-h-[34px] min-w-[34px] items-center justify-center rounded-r-md border-l px-1.5 disabled:opacity-50"
                  style={{
                    borderColor: 'var(--border)',
                    color: shuffled ? 'var(--accent)' : 'var(--muted)',
                    backgroundColor: shuffled ? 'transparent' : 'var(--panel-2)',
                  }}
                >
                  <span aria-hidden="true" className="font-mono text-[12px]">
                    {shuffled ? '↻' : '✕'}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      <p className="mt-1 text-[11px] leading-snug" style={{ color: 'var(--dim)' }}>
        {openCategoryHint ?? 'Two detuned oscillators — a texture rather than a song.'}{' '}
        The arrow on a row keeps that tape in the random shuffle; the cross leaves it in the list but
        out of the draw.
      </p>

      {/* The instrument beds are not tapes: they are the drone's harmonic recipe, so they only
          sound with the Drone chip. Pressing one selects the drone as well, because choosing a
          timbre that then stays silent under a song would look broken. */}
      <div className="mt-2" role="group" aria-label="Instrument bed">
        <span className="text-[11px] font-semibold uppercase tracking-wide">Instrument bed</span>
        <p className="mt-0.5 text-[11px] leading-snug" style={{ color: 'var(--dim)' }}>
          {prefs.instrument === 'off'
            ? 'The drone\u2019s plain two-sine texture. Pick an instrument to hear the same held chord as a piano, guitar, flute or violin.'
            : INSTRUMENTS.find((entry) => entry.id === prefs.instrument)?.hint ?? ''}
        </p>
        <div className="mt-1 flex flex-wrap gap-1">
          <button
            type="button"
            disabled={!prefs.on}
            aria-pressed={prefs.instrument === 'off'}
            onClick={() => onInstrument('off')}
            data-testid={tid('sound-instrument-off')}
            className="min-h-[32px] rounded-full border px-2.5 py-0.5 text-[11px] font-semibold disabled:opacity-50"
            style={{
              borderColor: prefs.instrument === 'off' ? 'var(--accent)' : 'var(--border)',
              backgroundColor: prefs.instrument === 'off' ? 'var(--accent-soft)' : 'transparent',
              color: prefs.instrument === 'off' ? 'var(--accent)' : 'var(--muted)',
            }}
          >
            Plain
          </button>
          {INSTRUMENTS.map((entry) => {
            const active = prefs.instrument === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                disabled={!prefs.on}
                aria-pressed={active}
                onClick={() => {
                  onInstrument(entry.id);
                  // Audible at once: the bed only plays with the drone.
                  onTape(DRONE_ID);
                }}
                data-testid={tid(`sound-instrument-${entry.id}`)}
                className="min-h-[32px] rounded-full border px-2.5 py-0.5 text-[11px] font-semibold disabled:opacity-50"
                style={{
                  borderColor: active ? 'var(--accent)' : 'var(--border)',
                  backgroundColor: active ? 'var(--accent-soft)' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--muted)',
                }}
              >
                {entry.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <label
          htmlFor={`${id}-randomize`}
          className="text-[11px] font-semibold uppercase tracking-wide"
        >
          Randomize
        </label>
        <select
          id={`${id}-randomize`}
          value={prefs.randomize}
          disabled={!prefs.on}
          onChange={(event) => {
            if (isRandomizeMode(event.target.value)) onRandomize(event.target.value);
          }}
          data-testid={tid('sound-randomize')}
          className="min-h-[32px] rounded-md border px-1.5 py-0.5 text-[11px] font-semibold disabled:opacity-50"
          style={{
            borderColor: 'var(--border)',
            backgroundColor: 'var(--panel)',
            color: 'var(--text)',
          }}
        >
          {RANDOMIZE_CHOICES.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
      </div>
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
          data-testid={tid(`sound-${key}`)}
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
        data-testid={tid('sound-clicks')}
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
            data-testid={tid(`btn-sound-preview-${role}`)}
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
      <p className="text-[10.5px] leading-snug" style={{ color: 'var(--dim)' }}        data-testid={tid('sound-credits')}>
        {prefs.tape === DRONE_ID
          ? 'The drone is generated live by the sound engine — no recording, no licence.'
          : `${tapeCredit(tape)}.`}
      </p>
      <div className="mt-2 flex items-center justify-between">
        <a
          href={prefs.tape === DRONE_ID ? TAPE_SCRIPT_PAGE : tape.page}
          target="_blank"
          rel="noreferrer noopener"
          className="text-[10.5px] underline"
          style={{ color: 'var(--muted)' }}
        >
          {prefs.tape === DRONE_ID
            ? 'The build script'
            : tape.composed
              ? 'How it is rendered'
              : 'This track on Free Music Archive'}
        </a>
        <button
          type="button"
          onClick={onReset}
          data-testid={tid('btn-sound-reset')}
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
};
