import { Suspense, lazy } from 'react';
import type { ComponentType, ReactElement } from 'react';

/**
 * The Bridge Notes visuals and the one boundary that reaches them
 * (`app/src/bridges/bridgeNotesVisual.tsx`).
 *
 * A Bridge Notes section is where a lesson hands over to the next idea, and the ask is a small
 * interactive under every one of them. At this repository's weight that means the pictures must not
 * be in the entry chunk, so this module is only plumbing: a name-keyed table of `React.lazy`
 * components, each of which becomes its own chunk when Vite splits it. The *names* are not here —
 * a page's payload carries the one it carries (`generate_lesson_pages.py`, `resources/bridge-visuals.json`),
 * so a lesson without a visual costs no bytes and no fetch, and adding the fifty-sixth visual adds
 * nothing to the entry chunk.
 *
 * This module is itself loaded with `React.lazy` from the reader, so the table and the `Suspense`
 * below live in a chunk rather than in the entry: what the entry keeps is one dynamic import. A page
 * with a visual therefore costs two fetches (this table, then the picture) and a page without one
 * costs neither.
 */

const ScalingDials = lazy(() => import('./ScalingDialsVisual'));

const VISUALS: Record<string, ComponentType> = {
  'scaling-dials': ScalingDials,
};

/**
 * The visual the payload named, or nothing.
 *
 * `fallback={null}` is deliberate: the section's own text is already on screen, so a spinner would
 * be a promise to move something the reader has not asked to move yet.
 */
export default function BridgeNotesVisual({ name }: { name: string }): ReactElement | null {
  const Visual = VISUALS[name];
  if (!Visual) return null;
  return (
    <Suspense fallback={null}>
      <div data-testid={`bridge-visual-${name}`}>
        <Visual />
      </div>
    </Suspense>
  );
}
