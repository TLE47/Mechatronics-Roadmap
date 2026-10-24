import * as tabNames from './data/workbenchTabs.json';
import { TabId } from './types';

// One name per tab, in one file (`app/src/data/workbenchTabs.json`). The app renders these labels
// and `scripts/generate_run_callouts.py` writes the same strings into every lesson page, so a page
// cannot name one tab while the strip names another, and a tab cannot be renumbered in one view
// and not the other. Numbers are banned by `scripts/check_tab_names.py`.
export const WORKBENCH_URL = tabNames.workbenchUrl;

export const TAB_NAMES = tabNames.tabs as Record<TabId, string>;

/** The one tab that runs Python; pages and docs name it instead of pointing at a position. */
export const PYTHON_TAB_NAME = TAB_NAMES['tab-pyodide'];

export function tabName(id: TabId): string {
  return TAB_NAMES[id];
}

/** Used by prose that has to name the tab without repeating a hand-typed string. */
export function tabPhrase(id: TabId): string {
  return `the ${TAB_NAMES[id]} tab`;
}

/** What the runner lists: reading lessons and graded exercises, not "exercises" for both. */
export const PYTHON_ENTRY_NOUN = 'lessons & exercises';

/**
 * The view switch's technical label, with the count taken from the registry the rail renders.
 *
 * The label said "All 10 Engineering Labs" while the rail showed twelve; a typed count is a number
 * nobody re-reads when a tab is added. This is exported so a suite can pin the wording without
 * rendering React, and `scripts/check_tab_names.py` fails if App.tsx stops passing the registry count.
 */
export function labsSwitchLabel(count: number): string {
  return `All ${count} Engineering Labs (Technical Names)`;
}
