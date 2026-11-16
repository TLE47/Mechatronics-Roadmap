/**
 * The marker a lazy boundary draws while its chunk is in flight (`app/src/components/LazyPending.tsx`).
 *
 * An empty fallback is the right *look* — the section's own text is already on screen, and a spinner
 * would promise to move something the reader has not asked to move yet — but it is the wrong *state*:
 * "this page has no picture" and "this page's picture has not arrived" become the same DOM, so any
 * comparison of two renders (a test, a screenshot diff, a pair sweep) can read a slow page as a
 * finished one. That is exactly how the same-task pair sweep once decided two arms opened different
 * lessons when both were on the same page and one card had not mounted.
 *
 * So the fallback draws this: hidden, zero-height, and named. Nothing moves; the pending state is
 * observable. A harness that wants to compare finished renders waits for it to disappear, the same
 * way it waits for a lazy tab's own placeholder.
 *
 * Keep the test id stable: `e2e_same_task_pairs.mjs`, `check_label_sizes.mjs` and the reader-route
 * sweep all look for it by that string.
 */
import type { ReactElement } from 'react';

export function LazyPending({ what }: { what: string }): ReactElement {
  return <span data-testid="lazy-pending" data-lazy={what} hidden />;
}
