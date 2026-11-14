import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { numberAt, startValues, toggleAt, type LabScale, type LabSpec, type LabValues } from './bridgeLab';

/**
 * One Bridge Notes lab, drawn (`app/src/bridges/bridgeLabShell.tsx`).
 *
 * The section supplies the controls, the line of code and the readings
 * (`bridgeLab.ts`); this draws them once so four sections cannot drift into four different-looking
 * cards, and so every one of them gets the same keyboard and screen-reader behaviour: a range input
 * is a real input (arrows, Home/End, Page Up/Down), a choice is a real radio group (arrows inside the
 * group), and every reading is an `<output>` inside one polite live region, so a learner who cannot
 * see the card still hears the number change.
 *
 * No colour is invented here: the card uses the page's own tokens (`bg-panel`, `border-line`,
 * `text-muted`, `--accent`), which is what lets it sit in every palette the reader offers.
 */

/** Where a value sits on the scale, as a percentage the track can place. */
function place(scale: LabScale, value: number): number {
  const span = scale.max - scale.min;
  if (!Number.isFinite(span) || span === 0) return 0;
  return Math.min(100, Math.max(0, ((value - scale.min) / span) * 100));
}

export default function BridgeLab({ spec }: { spec: LabSpec }) {
  const [values, setValues] = useState<LabValues>(() => startValues(spec.controls));

  const scale = spec.scale;

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
            {scale.marks.map((mark) => (
              <span
                key={mark.id}
                data-testid={`${spec.testid}-mark-${mark.id}`}
                className="absolute -top-1 h-3 w-0.5 bg-accent"
                style={{ left: `calc(${place(scale, mark.at(values)).toFixed(1)}% - 1px)` }}
              />
            ))}
          </div>
          <p
            data-testid={`${spec.testid}-scale-text`}
            className="m-0 mt-1 font-mono text-[10.5px] text-faint"
          >
            {scale.marks.map((mark) => mark.caption(values)).join(' · ')}
          </p>
        </div>
      ) : null}

      <div className="mt-2 grid gap-1" aria-live="polite">
        {spec.readouts.map((readout) => {
          const note = readout.note?.(values);
          return (
            <p key={readout.id} className="m-0 flex flex-wrap items-baseline gap-x-2">
              <span className="min-w-[9.5rem] text-[11.5px] text-muted">{readout.label}</span>
              <output
                data-testid={`${spec.testid}-${readout.id}`}
                className="font-mono text-[12.5px] tabular-nums text-ink"
              >
                {readout.text(values)}
                {readout.unit ? ` ${readout.unit}` : ''}
              </output>
              {note ? <span className="text-[10.5px] text-faint">{note}</span> : null}
            </p>
          );
        })}
      </div>

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
