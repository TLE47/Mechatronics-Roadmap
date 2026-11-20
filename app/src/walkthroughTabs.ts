import type { TabId } from './types';

/**
 * Which tabs the tooltip walkthrough can tour, and how many stops each one has.
 *
 * The header's page-tour button has to know whether the current tab has stops without importing the
 * 36-stop catalogue into the entry chunk (the walkthrough is lazy). That door needs only these
 * numbers. `scripts/test_learner_guide.mjs` derives the same map from `FEATURE_WALKTHROUGH` and
 * fails if the two ever disagree, so a new stop cannot make the button offer an empty tour.
 */
export const WALKTHROUGH_TAB_COUNTS: Readonly<Partial<Record<TabId, number>>> = {
  'tab-arch': 2,
  'tab-pyodide': 11,
  'tab-placement': 1,
  'tab-micro': 1,
  'tab-studio': 1,
  'tab-bode': 1,
  'tab-foc': 1,
  'tab-pend': 1,
  'tab-sysid': 1,
  'tab-eskf': 1,
  'tab-models': 1,
  'tab-cadpcb': 1,
  'tab-project': 1,
  'tab-req': 1,
  'tab-board': 1,
  'tab-links': 1,
};
