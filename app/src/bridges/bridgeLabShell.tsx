import { useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  choiceAt,
  numberAt,
  startValues,
  toggleAt,
  type LabReadout,
  type LabScale,
  type LabSpec,
  type LabValues,
} from './bridgeLab';
import { useMarkChase } from './useMarkChase';

/**
 * One Bridge Notes lab, drawn (`app/src/bridges/bridgeLabShell.tsx`).
 *
 * The section supplies the controls, the line of code and the readings
 * (`bridgeLab.ts`); this draws them once so fifty sections cannot drift into fifty different-looking
 * cards, and so every one of them gets the same keyboard and screen-reader behaviour: a range input
 * is a real input (arrows, Home/End, Page Up/Down), a choice is a real radio group (arrows move
 * between the states), and every reading is an `<output>` inside one polite live region, so a learner
 * who cannot see the card still hears the number change.
 *
 * Three things the card can carry besides its readings, all optional and all one machine:
 * - a `pair`, where a section warns about a mistake: the wrong and the right numbers sit side by
 *   side, fed by the same controls;
 * - a `mark`, where the claim is a number: a target from the page's own worked examples, drawn as a
 *   five-rung ladder that tightens as it is hit (`useMarkChase.ts`);
 * - a verdict line, which is the sentence the learner should leave with.
 *
 * No colour is invented here: the card uses the page's own tokens (`bg-panel`, `border-line`,
 * `text-muted`, `--accent`), and the only motion is the existing `.bridge-flash` decoration, which
 * `app/src/visuals.css` already drops under reduced motion.
 */

/** Where a value sits on the scale, as a percentage the track can place. */
function place(scale: LabScale, value: number): number {
  const span = scale.max - scale.min;
  if (!Number.isFinite(span) || span === 0) return 0;
  return Math.min(100, Math.max(0, ((value - scale.min) / span) * 100));
}

/** One reading: label, number and the line that says what it means. */
function Reading({
  spec,
  readout,
  values,
  tag,
}: {
  spec: LabSpec;
  readout: LabReadout;
  values: LabValues;
  tag?: { text: string; wrong: boolean };
}) {
  const note = readout.note?.(values);
  return (
    <p className="m-0 flex flex-wrap items-baseline gap-x-2">
      <span className="min-w-[9.5rem] text-[11.5px] text-muted">{readout.label}</span>
      <output
        data-testid={`${spec.testid}-${readout.id}`}
        className="font-mono text-[12.5px] tabular-nums text-ink"
      >
        {readout.text(values)}
        {readout.unit ? ` ${readout.unit}` : ''}
      </output>
      {tag ? (
        <span
          className={`font-mono text-[11px] uppercase tracking-wide ${
            tag.wrong ? 'text-faint' : 'text-accent'
          }`}
        >
          {tag.text}
        </span>
      ) : null}
      {note ? <span className="text-[11px] text-faint">{note}</span> : null}
    </p>
  );
}

export default function BridgeLab({ spec }: { spec: LabSpec }) {
  const [values, setValues] = useState<LabValues>(() => startValues(spec.controls));

  const scale = spec.scale;
  const pair = spec.pair;
  const mark = useMarkChase(spec.mark, spec.mark ? spec.mark.value(values) : Number.NaN);
  const inPair = (id: string) => Boolean(pair && (pair.wrong === id || pair.right === id));
  const readoutOf = (id: string) => spec.readouts.find((readout) => readout.id === id);

  const set = (id: string, value: number | string | boolean) =>
    setValues((previous) => ({ ...previous, [id]: value }));

  return (
    <section
      data-testid={spec.testid}
      className="mt-3 rounded-lg border border-line bg-panel p-3 text-[12.5px] leading-snug"
    >
      <h4 className="m-0 font-mono text-[11px] uppercase tracking-wide text-faint">{spec.title}</h4>
      <p className="mt-1 text-muted">{spec.prompt}</p>

      <div className="mt-2 grid gap-x-4 gap-y-2 sm:grid-cols-2">
        {spec.controls.map((control) => {
          if (control.kind === 'range') {
            const value = numberAt(values, control.id, control.start);
            return (
              <label key={control.id} className="block min-w-0">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-[11.5px] text-muted">{control.label}</span>
                  <span
                    data-testid={`${spec.testid}-${control.id}-value`}
                    className="font-mono text-[11.5px] tabular-nums text-ink"
                  >
                    {value} {control.unit}
                  </span>
                </span>
                <input
                  type="range"
                  data-testid={`${spec.testid}-${control.id}`}
                  aria-label={control.label}
                  min={control.min}
                  max={control.max}
                  step={control.step}
                  value={value}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    set(control.id, Number(event.target.value))
                  }
                  className="mt-1 h-5 w-full cursor-pointer"
                  style={{ accentColor: 'var(--accent)' }}
                />
              </label>
            );
          }

          if (control.kind === 'choice') {
            const value = choiceAt(values, control.id, control.start);
            return (
              <fieldset
                key={control.id}
                aria-label={control.label}
                data-testid={`${spec.testid}-${control.id}`}
                className="m-0 min-w-0 border-0 p-0"
              >
                <legend className="p-0 text-[11.5px] text-muted">{control.label}</legend>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  {control.options.map((option) => (
                    <label key={option.value} className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        name={`${spec.testid}-${control.id}`}
                        value={option.value}
                        checked={value === option.value}
                        onChange={() => set(control.id, option.value)}
                        className="h-3.5 w-3.5 cursor-pointer"
                        style={{ accentColor: 'var(--accent)' }}
                      />
                      <span className="text-[11.5px] text-muted">{option.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          }

          const on = toggleAt(values, control.id);
          return (
            <label key={control.id} className="flex items-center gap-2 self-end pb-1">
              <input
                type="checkbox"
                data-testid={`${spec.testid}-${control.id}`}
                checked={on}
                onChange={(event) => set(control.id, event.target.checked)}
                className="h-3.5 w-3.5 cursor-pointer"
                style={{ accentColor: 'var(--accent)' }}
              />
              <span className="text-[11.5px] text-muted">{control.label}</span>
            </label>
          );
        })}
      </div>

      {scale ? (
        <div data-testid={`${spec.testid}-scale`} className="mt-2">
          <span className="text-[11px] text-muted">{scale.label}</span>
          <div className="relative mt-1 h-1 rounded bg-line">
            {scale.marks.map((markItem) => (
              <span
                key={markItem.id}
                data-testid={`${spec.testid}-mark-${markItem.id}`}
                className="absolute -top-1 h-3 w-0.5 bg-accent"
                style={{ left: `calc(${place(scale, markItem.at(values)).toFixed(1)}% - 1px)` }}
              />
            ))}
          </div>
          <p
            data-testid={`${spec.testid}-scale-text`}
            className="m-0 mt-1 font-mono text-[11px] text-faint"
          >
            {scale.marks.map((markItem) => markItem.caption(values)).join(' · ')}
          </p>
        </div>
      ) : null}

      {pair ? (
        <div
          data-testid={`${spec.testid}-pair`}
          className="mt-2 grid gap-x-4 gap-y-1 rounded border border-line bg-panel-2 p-2 sm:grid-cols-2"
        >
          {[pair.wrong, pair.right].map((id) => {
            const readout = readoutOf(id);
            if (!readout) return null;
            const wrong = id === pair.wrong;
            return (
              <Reading
                key={id}
                spec={spec}
                readout={readout}
                values={values}
                tag={{
                  text: wrong ? pair.wrongLabel ?? 'wrong' : pair.rightLabel ?? 'right',
                  wrong,
                }}
              />
            );
          })}
        </div>
      ) : null}

      <div className="mt-2 grid gap-1" aria-live="polite">
        {spec.readouts
          .filter((readout) => !inPair(readout.id))
          .map((readout) => (
            <Reading key={readout.id} spec={spec} readout={readout} values={values} />
          ))}
      </div>

      {spec.mark ? (
        <div
          data-testid={`${spec.testid}-mark`}
          className={mark.announcement.startsWith('landed') ? 'bridge-flash mt-2' : 'mt-2'}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-[11px] text-muted">
              Land on{' '}
              <span className="font-mono tabular-nums text-ink">{mark.format(mark.target)}</span>
              <span className="text-faint"> — {mark.step + 1} of {spec.mark.ladder.length}</span>
            </span>
            <span className="flex items-center gap-2">
              <span
                data-testid={`${spec.testid}-mark-dots`}
                className="flex items-center gap-1"
                aria-hidden="true"
              >
                {spec.mark.ladder.map((_, index) => (
                  <span
                    key={index}
                    className={`h-1.5 w-1.5 rounded-full ${
                      index < mark.step ? 'bg-accent' : 'bg-line'
                    }`}
                  />
                ))}
              </span>
              <label className="flex items-center gap-1 text-[12px] text-faint">
                <input
                  type="checkbox"
                  data-testid={`${spec.testid}-mark-sound`}
                  checked={!mark.muted}
                  onChange={mark.toggleSound}
                  className="h-3 w-3 cursor-pointer"
                  style={{ accentColor: 'var(--accent)' }}
                />
                sound
              </label>
              <button
                type="button"
                data-testid={`${spec.testid}-mark-reset`}
                onClick={mark.reset}
                className="border-0 bg-transparent p-0 text-[12px] text-faint underline"
              >
                reset
              </button>
            </span>
          </div>
          <p
            data-testid={`${spec.testid}-mark-announce`}
            aria-live="polite"
            className="m-0 mt-1 min-h-[1em] font-mono text-[11px] text-faint"
          >
            {mark.announcement}
          </p>
        </div>
      ) : null}

      {spec.verdict ? (
        <p
          data-testid={`${spec.testid}-verdict`}
          className="mt-2 border-t border-line pt-2 text-[11.5px] text-muted"
        >
          {spec.verdict(values)}
        </p>
      ) : null}
    </section>
  );
}
