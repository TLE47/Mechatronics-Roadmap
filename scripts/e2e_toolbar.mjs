/**
 * Reaching the runner's folded toolbar from a browser suite (`scripts/e2e_toolbar.mjs`)
 *
 * Run 230's §3 of `docs/PLAN-2.1a.md` folds thirteen runner controls behind **More ⋯**. They stay in the DOM —
 * `hidden` is a visual fold — but Playwright will not click a `display:none` target, so every suite
 * that drives one of them opens the disclosure first. This module is the one place the folded list
 * lives; `scripts/check_label_sizes.mjs` holds the same ids as a rendered contract, and
 * `npm run test:e2e` proves each one is still reachable with a real press.
 *
 * `openMore` is idempotent: suites click several folded controls in a row, and the panel stays open
 * between them, so the second call is a no-op rather than a toggle that closes it.
 */

export const FOLDED_TOOLBAR = new Set([
  'btn-toggle-lesson-complete',
  'btn-reset-starter',
  'btn-reset-runtime',
  'btn-load-solution',
  'btn-format',
  'btn-draft-history',
  'btn-breakpoints',
  'btn-diff',
  'btn-share-attempt',
  'btn-pair-open',
  'btn-predict',
  'btn-vim',
  'btn-watch',
]);

/** Open **More ⋯** if it is closed. Safe to call before every folded click. */
export async function openMore(page) {
  const more = page.getByTestId('btn-more');
  if (!(await more.count())) return;
  const panel = page.getByTestId('toolbar-more');
  // Two presses at most, and only while `aria-expanded` says closed: a re-render between the read
  // and the click can take the open back (the press lands on the previous render's button, the mount
  // that follows starts with `moreOpen` false), and `waitFor` then polls a panel nobody opened for
  // five seconds. That is the shape this failed with once on a loaded machine, at the step after a
  // tab switch - the second press is guarded, so it cannot turn an open panel shut.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if ((await more.getAttribute('aria-expanded')) !== 'true') {
      await more.click({ timeout: 5000 }).catch(() => {});
    }
    if (await panel.isVisible().catch(() => false)) return;
  }
  await panel.waitFor({ state: 'visible', timeout: 5000 });
}

/**
 * Press a runner control, opening More first when the id lives behind it.
 *
 * A visible control is clicked exactly where it is, so a suite that asks for Run or Stop behaves as
 * it always did; only the folded ids pay for the extra press.
 */
export async function clickToolbar(page, testId) {
  if (FOLDED_TOOLBAR.has(testId)) await openMore(page);
  await page.getByTestId(testId).click();
}
