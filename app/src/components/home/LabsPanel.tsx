import React from 'react';
import { FlaskConical } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { TabId } from '../../types';

export interface LabCard {
  id: TabId;
  label: string;
  blurb: string;
  Icon: LucideIcon;
}

export interface LabsPanelProps {
  labs: readonly LabCard[];
  onOpenTab: (id: TabId) => void;
}

/**
 * The rail, as a launcher (`components/home/LabsPanel.tsx`).
 *
 * Home has no tab strip: it is a whole page. That would make every lab one trip through the
 * workbench unless the page carries the same doors — so it renders the rail's own registry, label
 * and subtitle included, and not a hand-written copy of twelve cards. A tab added to
 * `WORKBENCH_TABS` appears here with no edit to this file.
 */
export const LabsPanel: React.FC<LabsPanelProps> = ({ labs, onOpenTab }) => (
  <section data-testid="home-labs" className="space-y-2.5">
    <div className="flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-1.5 text-sm font-bold text-ink">
        <FlaskConical className="h-4 w-4 text-accent" aria-hidden="true" />
        Your labs
      </h2>
      <span className="text-[11px] text-muted">{labs.length} rooms, one click each</span>
    </div>
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {labs.map(({ id, label, blurb, Icon }) => (
        <button
          key={id}
          onClick={() => onOpenTab(id)}
          data-testid={`home-lab-${id}`}
          className="group flex items-start gap-2.5 rounded-xl border border-line bg-panel p-3 text-left cursor-pointer transition-colors hover:border-accent/60 hover:bg-raise"
        >
          <span className="mt-0.5 rounded-lg border border-line-soft bg-canvas p-1.5 text-accent">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-[12.5px] font-semibold leading-snug text-ink">{label}</span>
            <span className="mt-0.5 block text-[11px] leading-snug text-muted">{blurb}</span>
          </span>
        </button>
      ))}
    </div>
  </section>
);
