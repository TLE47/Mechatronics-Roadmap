/**
 * "The tour has been seen" for a browser harness (`scripts/tour_seed.mjs`).
 *
 * The first-run tour opens for someone with nothing saved — which is exactly what a fresh Playwright
 * context is. That makes a coach mark appear over the workbench in every suite that drives it, and a
 * fixed card is a card that can swallow a click aimed at the control underneath it. The suites are not
 * first-time visitors; they are tools. So they seed the record before the app boots.
 *
 * This is the same move the palettes already make (`addInitScript` writing the stored theme): the
 * harness states the browser it wants to measure, rather than dismissing something on every run.
 *
 * `scripts/e2e_tour.mjs` deliberately does **not** call this — it is the suite that measures the tour.
 */

/** The record the app writes when a learner finishes: read back by `tourState.readTour`. */
export const TOUR_SEEN_RECORD = JSON.stringify({
  version: 1,
  status: 'completed',
  stepIndex: 5,
  chipShown: true,
  updatedAt: 0,
});

/**
 * Seed the record on a page or a context, before it navigates.
 *
 * Passed as a function plus an argument rather than a string so the key and the shape live in one
 * place here. The guard keeps a suite that sets its own record (none does today) from being overwritten
 * on the second navigation.
 */
export async function seedTourSeen(target) {
  await target.addInitScript((record) => {
    try {
      if (!localStorage.getItem('mechalab_tour_v1')) {
        localStorage.setItem('mechalab_tour_v1', record);
      }
    } catch {
      // A context that refuses storage still loads; it just cannot be seeded, and the tour stays shut
      // only as long as nothing else breaks. Nothing here should ever fail a suite.
    }
  }, TOUR_SEEN_RECORD);
}
