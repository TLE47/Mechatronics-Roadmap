/**
 * Where a reading page lives (`app/src/pageUrl.ts`).
 *
 * Pages serves only the built app, not the Markdown pages, so a lesson's reading copy is the
 * identical path on GitHub — the same link the runner prints under "Read this page on GitHub".
 * Both the runner and the prose search build it here, so the two doors cannot point at different
 * repositories, and a rename of the account moves one constant.
 */

/** The repository, with its trailing slash: one constant the page and issue links both start from. */
export const REPO_WEB_BASE = 'https://github.com/TLE47/Mechatronics-Roadmap/';

export const REPO_PAGE_BASE = `${REPO_WEB_BASE}blob/main/`;

/** Where an "ask for help" report is offered as a pre-filled issue (`app/src/helpReport.ts`). */
export const REPO_ISSUES_URL = `${REPO_WEB_BASE}issues/new`;

/** A page's URL, optionally at one of its headings (`#anti-windup`). */
export function pageUrl(path: string, anchor?: string): string {
  const base = `${REPO_PAGE_BASE}${path}`;
  return anchor ? `${base}#${anchor}` : base;
}
