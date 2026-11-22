/**
 * Real touch input for the browser suites (`scripts/touch_input.mjs`).
 *
 * `page.mouse` is a mouse: a drag or a swipe driven with it never meets the browser's own touch
 * gestures — scrolling, the long-press selection and callout, Android's context menu — so a test
 * that uses it cannot prove a phone gesture works. These helpers dispatch the touchscreen's own
 * events through CDP (`Input.dispatchTouchEvent`), which is the path a finger takes in Chromium:
 * the page sees `pointerType: 'touch'` presses, `touchstart` / `touchmove` / `touchend`, and the
 * browser's gesture recogniser gets the same input a device would send.
 *
 * Coordinates are CSS pixels in the viewport, the same space as `boundingBox()`. A gesture is one
 * finger with a stable id; `start`/`move`/`end` are explicit so a test can hold still (a long
 * press) and assert between the steps.
 */

export async function createTouch(page) {
  const cdp = await page.context().newCDPSession(page);
  let x = 0;
  let y = 0;
  let active = false;

  const point = { x: 0, y: 0, id: 1, radiusX: 6, radiusY: 6, force: 1 };
  const send = (type, touchPoints) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints });

  const down = async (px, py) => {
    if (active) throw new Error('touch: a gesture is already down');
    x = px;
    y = py;
    active = true;
    point.x = x;
    point.y = y;
    await send('touchStart', [point]);
  };

  const up = async () => {
    if (!active) return;
    active = false;
    await send('touchEnd', []);
  };

  return {
    get active() {
      return active;
    },
    start: down,
    end: up,
    /**
     * Travel to a point in `steps` dispatches, the way a finger arrives over several frames rather
     * than teleporting. The pause lets React paint between moves, so a test can read a mid-drag
     * state (the ghost's position, the sheet's height) instead of only the release.
     */
    async move(px, py, { steps = 1, pause = 16 } = {}) {
      if (!active) throw new Error('touch: move without a down gesture');
      const fromX = x;
      const fromY = y;
      for (let step = 1; step <= steps; step += 1) {
        x = fromX + ((px - fromX) * step) / steps;
        y = fromY + ((py - fromY) * step) / steps;
        point.x = x;
        point.y = y;
        await send('touchMove', [point]);
        if (pause) await page.waitForTimeout(pause);
      }
    },
    /** A real tap: down and up in place, which is what synthesises the click a phone sends. */
    async tap(px, py) {
      await down(px, py);
      await page.waitForTimeout(40);
      await up();
    },
    async detach() {
      if (active) await up().catch(() => {});
      await cdp.detach().catch(() => {});
    },
  };
}
