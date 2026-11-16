import { createContext, useContext, type ReactNode } from 'react';

/** One simulator tab as the Compact dock draws it: its icon, its name and the press that opens it. */
export interface CompactChromeTab {
  id: string;
  label: string;
  active: boolean;
  icon: ReactNode;
  onSelect: () => void;
}

/**
 * The page's own controls — the Beginner/All labs switch, the three tallies and the simulator tabs —
 * read by the Compact dock instead of by the mode bar and the rail above it (`App.tsx` builds this
 * from the state it already keeps; `runner/CompactPageChrome.tsx` draws it).
 *
 * Null in every other preset, and in any surface that renders the runner on its own: the dock then
 * draws its four lesson modules and nothing else.
 */
export interface CompactChrome {
  mode: 'beginner' | 'advanced';
  onMode: (mode: 'beginner' | 'advanced') => void;
  tabs: CompactChromeTab[];
  counts: { verified: number; lessons: number; marked: number; milestones: number; milestoneTotal: number };
}

export const CompactChromeContext = createContext<CompactChrome | null>(null);

export function useCompactChrome(): CompactChrome | null {
  return useContext(CompactChromeContext);
}
