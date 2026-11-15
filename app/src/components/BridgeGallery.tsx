/**
 * Every Bridge Notes visual on one page (`app/src/components/BridgeGallery.tsx`, `?gallery=bridges`).
 *
 * Thirty-five interactives live under thirty-five different lessons, which is exactly the shape that
 * makes them hard to review: a change to the shared shell (`bridges/bridgeLabShell.tsx`) or to a
 * token has to be seen in all of them, and opening thirty-five lessons to look is not a review
 * anyone does twice. This page renders the same lazy components the lessons do, side by side, at
 * three widths, so one scroll shows every card a learner can meet.
 *
 * It is reachable only by asking for it (`?gallery=bridges`), and its chunk is fetched only then —
 * the app's first paint does not pay for a page nobody opens. It is not a lesson surface: no
 * lesson state, no progress, no store writes, which also makes it safe to open while a lesson is
 * in progress in another tab.
 *
 * The names come from the same table the reader uses (`BRIDGE_VISUAL_NAMES` in
 * `bridges/bridgeNotesVisual.tsx`), so a card added to the table appears here with no second list to
 * update; `scripts/check_registry_joins.py` is what proves every page's declared visual is in that
 * table.
 */
import { useState } from 'react';
import { BRIDGE_VISUAL_NAMES, BridgeVisual } from '../bridges/bridgeNotesVisual';

const WIDTHS = [
  { label: '1280 px', px: 1280 },
  { label: '768 px', px: 768 },
  { label: '380 px', px: 380 },
] as const;

export default function BridgeGallery() {
  const [width, setWidth] = useState<(typeof WIDTHS)[number]['px']>(1280);
  return (
    <div className="mx-auto w-full max-w-[1400px] p-4">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 text-lg font-bold text-ink">Bridge Notes visuals</h1>
          <p className="m-0 mt-1 text-xs text-muted">
            {BRIDGE_VISUAL_NAMES.length} cards, rendered by the same lazy components a lesson mounts.
            This page is not a lesson: nothing here is graded or saved.
          </p>
        </div>
        <div role="group" aria-label="Card width" className="flex items-center gap-1">
          {WIDTHS.map((option) => (
            <button
              key={option.px}
              type="button"
              data-testid={`gallery-width-${option.px}`}
              aria-pressed={width === option.px}
              onClick={() => setWidth(option.px)}
              className={`rounded border px-2.5 py-1 text-xs ${
                width === option.px
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-line bg-panel text-body hover:border-line-strong'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      <div className="grid gap-6">
        {BRIDGE_VISUAL_NAMES.map((name) => (
          <section key={name} data-testid={`gallery-card-${name}`} className="rounded-lg border border-line bg-panel p-3">
            <h2 className="m-0 font-mono text-[11px] uppercase tracking-wide text-faint">{name}</h2>
            <div className="mt-2 max-w-full overflow-x-auto">
              <div style={{ width, maxWidth: '100%' }}>
                <BridgeVisual name={name} />
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
