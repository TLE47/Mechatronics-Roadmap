/**
 * Where the course-level pass is a control, and where it is only a label
 * (`app/src/courseLevels.ts`).
 *
 * The header's four links — Start here, Beginner, Applied, Advanced — are a *preference*: they are
 * stored (`mechalab_active_tier_pass_v1`) and read by two things only, the Start Here roadmap
 * (`TabArchitecture`) and the guide banner on the simulator tabs (`SimulatorTierBanner`, whose text
 * for each tab and each pass is `SIMULATOR_TIER_GUIDES`).
 *
 * On the other nine views nothing in the pane consumes the pass, so pressing one moved the
 * highlight and changed nothing else — a filter that filters a third of the screens, presented as if
 * it filtered all of them. The nav is therefore rendered only where the pass has something to
 * change. This function is the single answer to "is this one of them", and it is derived from the
 * guides rather than written out again: a tab that gains a guide is covered the day its guide
 * exists, and a tab that loses one cannot leave the nav behind claiming to work.
 */

import type { TabId } from './types.ts';
import { SIMULATOR_TIER_GUIDES, type ActiveTierPass } from './curriculumData.ts';

/** The four presses, in the order the header draws them. */
export const COURSE_PASSES: readonly ActiveTierPass[] = ['level0', 'tier1', 'tier2', 'tier3'];

/**
 * A tab whose pane renders a guide for *every* pass. A banner written for `tier1` alone would leave
 * three of the four links doing nothing on that tab, which is the dead button again — so a partial
 * guide does not qualify.
 */
type GuideTable = Record<string, Partial<Record<ActiveTierPass, unknown>>>;
const GUIDES = SIMULATOR_TIER_GUIDES as unknown as GuideTable;

const GUIDE_TABS = new Set<string>(
  Object.keys(SIMULATOR_TIER_GUIDES).filter((tabId) =>
    COURSE_PASSES.every((pass) => Boolean(GUIDES[tabId]?.[pass]))
  )
);

/** True where pressing a course-level pass changes something on screen. */
export function passChangesContent(tabId: TabId): boolean {
  // The roadmap is the other reader: `TabArchitecture` cuts the ten steps by the pass.
  return tabId === 'tab-arch' || GUIDE_TABS.has(tabId);
}

/** The tabs where the nav is shown, for a test that has to enumerate them. */
export function tabsWherePassChangesContent(all: readonly string[]): string[] {
  return all.filter((tabId) => passChangesContent(tabId as TabId));
}
