import React from 'react';
import { ActiveTierPass, SIMULATOR_TIER_GUIDES } from '../curriculumData';
import { TabId } from '../types';
import { Layers, ArrowUpRight } from 'lucide-react';

interface SimulatorTierBannerProps {
  tabId: Exclude<TabId, 'tab-arch' | 'tab-pyodide' | 'tab-placement' | 'tab-links'>;
  activeTierPass: ActiveTierPass;
  onSelectTierPass: (pass: ActiveTierPass) => void;
}

export const SimulatorTierBanner: React.FC<SimulatorTierBannerProps> = ({
  tabId,
  activeTierPass,
  onSelectTierPass,
}) => {
  const guide = SIMULATOR_TIER_GUIDES[tabId][activeTierPass];

  const tierTabs: { id: ActiveTierPass; shortLabel: string }[] = [
    { id: 'level0', shortLabel: 'Level 0: Intuition' },
    { id: 'tier1', shortLabel: 'Tier 1 Pass: Beginner' },
    { id: 'tier2', shortLabel: 'Tier 2 Pass: Applied' },
    { id: 'tier3', shortLabel: 'Tier 3 Pass: Production' },
  ];

  return (
    <div className="bg-panel border border-line border-l-4 border-l-accent rounded-lg p-3.5 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-line-soft">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-accent" />
          <span className="font-mono font-bold text-accent">{guide.badge}</span>
          <span aria-hidden="true" className="text-faint">·</span>
          <strong className="text-ink text-sm">{guide.title}</strong>
        </div>

        {/* Quick Tier Switcher inside Simulator */}
        <div className="flex flex-wrap gap-1 bg-canvas p-1 rounded-md border border-line-soft">
          {tierTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelectTierPass(t.id)}
              className={`px-2.5 py-1 rounded text-[0.72rem] font-semibold transition-colors cursor-pointer ${
                activeTierPass === t.id
                  ? 'bg-accent/20 text-accent border border-accent/50'
                  : 'text-muted hover:text-ink border border-transparent'
              }`}
            >
              {t.shortLabel}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center text-body leading-relaxed">
        <div className="lg:col-span-8">
          <span className="text-muted font-semibold mr-1.5">Current Pass Focus:</span>
          {guide.focus}
        </div>
        <div className="lg:col-span-4 bg-canvas border border-line-soft rounded-md p-2.5 text-emerald flex items-start gap-1.5">
          <ArrowUpRight className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block text-[0.72rem] uppercase tracking-wider">Hands-On Mission:</span>
            <span className="text-body text-[0.76rem]">{guide.actionHint}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
