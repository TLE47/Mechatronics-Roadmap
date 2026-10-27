/**
 * A lesson figure, moving (`app/src/visuals/liveFigure.ts`).
 *
 * The drawings stay still in the library because a still is what a lesson needs while it is being
 * read. When a figure *is* being read, though, the one thing a picture of a process cannot show is
 * the process: a chain is boxes in a row, not a signal crossing them. This module adds exactly one
 * moving mark per figure — a packet riding each connector, or a cursor riding the curve — and
 * nothing else. No glow, no state cycling, no chrome: the paragraph beside the figure stays the
 * loudest thing on the page.
 *
 * The rules, all of which are about not being a nuisance:
 *
 * - **Only a figure that depicts a process moves.** `chain`, `loop`, `graph` and `states` get their
 *   connectors fed; `timing` and `plot` get a cursor on their longest solid curve. A matrix, a
 *   register, a schematic or a reach dial is a reference — a number moving through it would be
 *   noise, so those stay still.
 * - **Only while it is on screen.** An `IntersectionObserver` starts the frame loop and removes the
 *   marks when the figure leaves. A long lesson spends most of its scroll with every figure
 *   off-screen; a page that animates them anyway is a page that costs battery for nothing.
 * - **Nothing is added to the document's meaning.** The marks are SVG decoration inside an
 *   `role="img"` drawing whose name is unchanged, and stopping removes every node that was added.
 * - **The caller owns the preference.** Whether this runs at all is decided by `useFigureMotion()`
 *   in `Diagram`, which is the same switch as the header's Motion button.
 */

import type { DiagramKind } from './scenes';

const NS = 'http://www.w3.org/2000/svg';

/** Kinds whose drawing is a process; everything else is a reference and stays still. */
const MOVING: ReadonlySet<DiagramKind> = new Set<DiagramKind>(['chain', 'loop', 'graph', 'states', 'timing', 'plot']);

/**
 * Start the figure when it comes on screen, and stop it when it leaves.
 *
 * The returned function is idempotent: it disconnects the observer, cancels every frame request and
 * removes the marks, whether or not the figure was ever visible.
 */
export function attachQuietMotion(svg: SVGSVGElement, kind: DiagramKind): () => void {
  if (!MOVING.has(kind)) return () => {};
  const run = kind === 'timing' || kind === 'plot' ? runCursor : runPackets;

  let stop: (() => void) | null = null;
  const begin = () => {
    if (!stop) stop = run(svg);
  };
  const end = () => {
    stop?.();
    stop = null;
  };

  if (typeof IntersectionObserver === 'undefined') {
    begin();
    return end;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) begin();
      else end();
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.05 }
  );
  observer.observe(svg);
  return () => {
    observer.disconnect();
    end();
  };
}

/**
 * A packet per connector, travelling the arrow the figure already draws.
 *
 * Reading the endpoints off the line rather than re-deriving them means the packet cannot point
 * somewhere the arrow does not; a figure whose layout changes needs no change here. The marks are
 * inserted first in the SVG, behind the boxes: a packet crosses a box's border, never its words.
 */
function runPackets(svg: SVGSVGElement): () => void {
  const edges = [...svg.querySelectorAll('line[marker-end]')] as SVGLineElement[];
  if (!edges.length) return () => {};
  const packets = edges.map((edge, index) => {
    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('r', '2.2');
    dot.setAttribute('fill', 'var(--accent)');
    dot.setAttribute('fill-opacity', '0.72');
    dot.setAttribute('data-figure-motion', 'packet');
    svg.insertBefore(dot, svg.firstChild);
    return {
      dot,
      x1: Number(edge.getAttribute('x1') ?? 0),
      y1: Number(edge.getAttribute('y1') ?? 0),
      x2: Number(edge.getAttribute('x2') ?? 0),
      y2: Number(edge.getAttribute('y2') ?? 0),
      // Staggered so a five-stage chain reads left to right rather than five dots in lockstep.
      offset: (index * 0.37) % 1,
    };
  });

  let raf = 0;
  const CYCLE = 5600;
  const tick = (now: number) => {
    for (const packet of packets) {
      const fraction = ((now / CYCLE + packet.offset) % 1 + 1) % 1;
      packet.dot.setAttribute('cx', (packet.x1 + (packet.x2 - packet.x1) * fraction).toFixed(2));
      packet.dot.setAttribute('cy', (packet.y1 + (packet.y2 - packet.y1) * fraction).toFixed(2));
      // Gone at both ends, so a wrap reads as the next signal rather than a dot jumping back.
      packet.dot.style.opacity = fraction < 0.1 || fraction > 0.9 ? '0' : '1';
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return () => {
    if (raf) cancelAnimationFrame(raf);
    packets.forEach((packet) => packet.dot.remove());
  };
}

/**
 * One cursor on the longest solid curve, like a measurement being taken.
 *
 * No comet tail and no scan line: those are the introduction's, where the figure is the subject.
 * Here the figure is evidence beside a paragraph, and a slow point on the line is the whole claim —
 * this is a signal, and it goes somewhere.
 */
function runCursor(svg: SVGSVGElement): () => void {
  const solid = ([...svg.querySelectorAll('path[fill="none"]')] as SVGPathElement[]).filter(
    (path) => !path.getAttribute('stroke-dasharray')
  );
  if (!solid.length) return () => {};
  const lengths = solid.map((path) => path.getTotalLength());
  const lead = solid.reduce((best, path, index) => (lengths[index] > lengths[best] ? index : best), 0);
  const path = solid[lead];
  const length = path.getTotalLength();
  if (!length) return () => {};

  const dot = document.createElementNS(NS, 'circle');
  dot.setAttribute('r', '2.8');
  dot.setAttribute('fill', 'var(--accent)');
  dot.setAttribute('data-figure-motion', 'cursor');
  svg.append(dot);

  let raf = 0;
  const CYCLE = 8200;
  const tick = (now: number) => {
    const fraction = (now % CYCLE) / CYCLE;
    const point = path.getPointAtLength(length * fraction);
    dot.setAttribute('cx', point.x.toFixed(2));
    dot.setAttribute('cy', point.y.toFixed(2));
    // Hidden while it travels back to the start: there is no line there to travel along.
    dot.style.opacity = fraction > 0.96 ? '0' : '1';
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return () => {
    if (raf) cancelAnimationFrame(raf);
    dot.remove();
  };
}
