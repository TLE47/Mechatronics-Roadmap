import { useEffect, useState, type RefObject } from 'react';

/**
 * Measured card heights for one canvas (`components/workflow/useNodeHeights.ts`).
 *
 * The four dots sit on the card's own edges, so the anchors need the card's rendered height, not a
 * guess: a measured card is a unit field taller than an unmeasured one. The observer follows the
 * cards, not the document, so typing does not re-measure the canvas on every keystroke.
 */
export function useNodeHeights(
  gridRef: RefObject<HTMLDivElement | null>,
  /** The cards' ids joined: the observer is replaced when the set of cards changes, not on each edit. */
  nodeIds: string
): Record<string, number> {
  const [heights, setHeights] = useState<Record<string, number>>({});

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const next: Record<string, number> = {};
      grid.querySelectorAll<HTMLElement>('[data-node-id]').forEach((card) => {
        const id = card.dataset.nodeId;
        if (id) next[id] = card.offsetHeight;
      });
      setHeights((previous) => {
        const keys = Object.keys(next);
        if (
          keys.length === Object.keys(previous).length &&
          keys.every((key) => previous[key] === next[key])
        ) {
          return previous;
        }
        return next;
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    grid.querySelectorAll<HTMLElement>('[data-node-id]').forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [nodeIds, gridRef]);

  return heights;
}
