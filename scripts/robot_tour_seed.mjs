/**
 * "The Robot guide has been seen" for a browser harness (`scripts/robot_tour_seed.mjs`).
 *
 * A fresh Playwright context is a first visit, so the Robot tab would open its three-step guide over
 * every suite that drives Run, the chips or Replay. Those suites are tools, not first-time learners;
 * they state the browser they want before the app boots, the same way `tour_seed.mjs` does for the
 * six-step lesson tour. The dedicated guide checks deliberately do not call this.
 */

/** The record the pane writes when the guide finishes; read back by `readRobotTour`. */
export const ROBOT_TOUR_SEEN_RECORD = JSON.stringify({
  version: 1,
  status: 'completed',
  stepIndex: 2,
  updatedAt: 0,
});

/** Seed the record on a page or a context, before it navigates. */
export async function seedRobotTourSeen(target) {
  await target.addInitScript((record) => {
    try {
      if (!localStorage.getItem('mechalab_robot_tour_v1')) {
        localStorage.setItem('mechalab_robot_tour_v1', record);
      }
    } catch {
      // Storage refused: the suite still loads; the guide may appear, but nothing here should fail it.
    }
  }, ROBOT_TOUR_SEEN_RECORD);
}
