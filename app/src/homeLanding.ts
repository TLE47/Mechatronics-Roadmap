/**
 * Which whole page a visit opens (`app/src/homeLanding.ts`).
 *
 * Home is a destination, not a gate: a deep link, a first visit and an explicit `?view=workbench`
 * all still open the workbench, and nothing here can stop a learner reaching the editor. The rule is
 * about *returning*: a new sitting opens Home, while a reload inside the same sitting goes back to
 * the page that was on screen — a learner who is mid-lesson should not be walked out to a dashboard
 * by pressing F5.
 *
 * The sitting window is also what keeps the browser suites deterministic. Every suite does its
 * reloads within seconds, so it stays on the workbench; a learner returning the next day opens Home.
 *
 * Precedence, highest first:
 *
 * 1. an explicit `?view=intro` / `admin` / `home` / `dashboard` / `workbench`;
 * 2. `?lesson=` — a link to a lesson is a destination, not a homepage;
 * 3. no progress in this browser — the first visit belongs to the Start Here card;
 * 4. a visit inside `SITTING_MS` — the page they were on (Home stays Home, the workbench stays);
 * 5. otherwise Home.
 *
 * Nothing in this module throws: private mode and a blocked store both make `localStorage` access
 * throw, and a preference that cannot be read must cost a choice, never the page.
 */

import {
  STORAGE_KEY_COMPLETED,
  STORAGE_KEY_MILESTONES,
  STORAGE_KEY_VERIFIED,
  readFlagMap,
} from './progressKeys.ts';

export const STORAGE_KEY_LAST_VISIT = 'mechalab_last_visit_v1';
/** A reload inside this window returns to the page on screen; past it, Home. */
export const SITTING_MS = 45 * 60 * 1000;

export type HomePage = 'workbench' | 'home' | 'admin' | 'intro';

export interface LastVisit {
  at: number;
  page: HomePage;
}

export interface LandingInput {
  /** The raw `?view=` value, or null when absent. */
  view: string | null;
  /** Whether `?lesson=` is present. Its validity is the runner's question, not this one. */
  hasLesson: boolean;
  lastVisit: LastVisit | null;
  /** Any verification, self-mark or milestone in this browser. */
  hasProgress: boolean;
  now?: number;
}

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** The last whole page, or null when nothing usable is stored. */
export function readLastVisit(): LastVisit | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(STORAGE_KEY_LAST_VISIT);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LastVisit> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    if (
      parsed.page !== 'workbench' &&
      parsed.page !== 'home' &&
      parsed.page !== 'admin' &&
      parsed.page !== 'intro'
    )
      return null;
    if (typeof parsed.at !== 'number' || !Number.isFinite(parsed.at)) return null;
    return { at: Math.max(0, Math.round(parsed.at)), page: parsed.page };
  } catch {
    return null;
  }
}

/** Remember the page on screen. Called on arrival and on every page change. */
export function noteVisit(page: HomePage, now: number = Date.now()): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY_LAST_VISIT, JSON.stringify({ at: now, page }));
  } catch {
    // A blocked or full store costs the memory, never the visit.
  }
}

/**
 * Whether this browser has any progress at all.
 *
 * Any one of the three maps counts. A learner who self-marked a lesson but has not passed one is
 * still returning, and telling them they are new would be the kind of small lie that makes a whole
 * dashboard feel untrustworthy.
 */
export function hasLocalProgress(): boolean {
  for (const key of [STORAGE_KEY_VERIFIED, STORAGE_KEY_COMPLETED, STORAGE_KEY_MILESTONES]) {
    if (Object.values(readFlagMap(key)).some(Boolean)) return true;
  }
  return false;
}

/** The page a visit opens, by the precedence above. Pure: the caller supplies the clock and store. */
export function landingPage(input: LandingInput): HomePage {
  const view = (input.view ?? '').trim().toLowerCase();
  if (view === 'intro') return 'intro';
  if (view === 'admin') return 'admin';
  if (view === 'home' || view === 'dashboard') return 'home';
  if (view === 'workbench') return 'workbench';
  if (input.hasLesson) return 'workbench';
  if (!input.hasProgress) return 'workbench';

  const now = input.now ?? Date.now();
  const visit = input.lastVisit;
  if (visit && now - visit.at >= 0 && now - visit.at < SITTING_MS) {
    // An admin session is a detour, not a place to be returned to; the workbench is the safe floor.
    return visit.page === 'home' ? 'home' : 'workbench';
  }
  return 'home';
}
