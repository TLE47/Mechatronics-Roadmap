/**
 * When a surface has stopped changing what it counts
 * (`scripts/surface_settle.mjs`, used by `scripts/snapshot_surfaces.mjs`)
 *
 * The sweep measures a page that is still arriving from three directions at once: a lazy tab chunk, a
 * lesson fetched as JSON, and — on `tab-links` only — the GitHub API. Every one of them can resolve
 * *after* the DOM has gone quiet, which is the shape of the bug this module exists for: silence is not
 * the same as finished. `paper/tab-links` recorded 5 links on one run and 4 on the next because the
 * observer bumped when a node landed but not while a request was still in flight.
 *
 * So the gate watches three things instead of one, and only the last of them is what the snapshot
 * records:
 *
 *   1. the pane's size (`ResizeObserver`) — a late font swap or a chart's first paint;
 *   2. the pane's nodes (`MutationObserver`) — a row that mounts inside a line it does not resize;
 *   3. the counts `measure()` is about to read — sampled, and required to hold still.
 *
 * A `*-loading` panel is treated as unfinished for the whole wait: `tab-loading`, `reader-loading` and
 * `rise-issues-loading` are the app saying that what is on screen is a promise of the surface, and a
 * count taken through one of them is a count of the placeholder. This is why the gate asks for a
 * *stable* number rather than a number that merely stopped changing: an empty list is stable too.
 *
 * The wait is bounded (`limitMs`), because a tab that never stops animating must not hang a sweep of
 * 52 surfaces; a surface that reaches the bound is reported as `settled: false` and measured anyway,
 * which is the same thing the sweep did before, said out loud.
 *
 * `scripts/test_settle_counts.mjs` drives this function against pages whose count lands late, together
 * with a copy of the previous, silence-only gate as the failing control.
 */

/**
 * What one surface is counted by.
 *
 * Shared with the sweep so the gate waits on exactly the numbers the snapshot records: a settle that
 * watched a different set could hand back a surface whose *recorded* count was still moving. The keys
 * are `measure()`'s fields and the order is the one the count vector is built in.
 */
export const SURFACE_COUNTS = {
  buttons: 'button',
  inputs: 'input, textarea, select',
  links: 'a[href]',
  headings: 'h1, h2, h3, h4',
  canvases: 'canvas',
  tables: 'table',
};

/** How the gate samples. 100 ms is fine enough to see a count arrive and coarse enough to cost nothing. */
export const SETTLE = {
  /** How often the counts are read. */
  sampleMs: 100,
  /** How long the counts (and the pane) must hold still before the surface is considered finished. */
  quietMs: 400,
  /** The longest one surface may take. The sweep's own loading waits are 30 s; this is the valve. */
  limitMs: 5000,
};

/**
 * Runs in the page, so it may only use the DOM and `performance` — `page.evaluate` serialises it, and
 * the arguments below are the only outer names it can see.
 */
export function settleSurface({ selectors, sampleMs, quietMs, limitMs }) {
  const ordered = Object.values(selectors);
  const vector = () => ordered.map((selector) => document.querySelectorAll(selector).length).join('|');
  // The app's own word for "not finished yet", and the only signal here that survives a page whose
  // shape has not moved at all: a request in flight changes no node.
  const loading = () => document.querySelector('[data-testid$="-loading"]');

  return new Promise((resolve) => {
    const started = performance.now();
    const target = document.querySelector('#main') ?? document.body;
    let signature = vector();
    let last = started;
    const bump = () => {
      last = performance.now();
    };
    const resizes = new ResizeObserver(bump);
    const mutations = new MutationObserver(bump);
    resizes.observe(target);
    // Attributes are not watched on purpose: a status line or a focus ring that changes an attribute
    // every frame would hold the quiet window open until the bound, on every surface.
    mutations.observe(target, { childList: true, subtree: true, characterData: true });

    const finish = (settled) => {
      resizes.disconnect();
      mutations.disconnect();
      resolve({ settled, waitedMs: Math.round(performance.now() - started), counts: signature });
    };

    const tick = () => {
      const now = performance.now();
      const next = vector();
      if (next !== signature) {
        signature = next;
        last = now;
      }
      if (!loading() && now - last >= quietMs) return finish(true);
      if (now - started >= limitMs) return finish(!loading());
      setTimeout(tick, sampleMs);
    };
    tick();
  });
}
