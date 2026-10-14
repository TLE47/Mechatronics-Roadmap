import React from 'react';
import { ActiveTierPass, SIMULATOR_TIER_GUIDES } from '../curriculumData';
import { TabId } from '../types';
import { Layers, ArrowUpRight } from 'lucide-react';

interface SimulatorTierBannerProps {
  tabId: Exclude<TabId, 'tab-arch'>;
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
    <div className="bg-[#111827] border border-[#334155] border-l-4 border-l-[#38bdf8] rounded-lg p-3.5 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-[#1e293b]">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#38bdf8]" />
          <span className="font-mono font-bold text-[#38bdf8]">{guide.badge}</span>
          <span aria-hidden="true" className="text-[#475569]">·</span>
          <strong className="text-[#f1f5f9] text-sm">{guide.title}</strong>
        </div>

        {/* Quick Tier Switcher inside Simulator */}
        <div className="flex flex-wrap gap-1 bg-[#0b0f19] p-1 rounded-md border border-[#1e293b]">
          {tierTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelectTierPass(t.id)}
              className={`px-2.5 py-1 rounded text-[0.72rem] font-semibold transition-colors cursor-pointer ${
                activeTierPass === t.id
                  ? 'bg-[#38bdf8]/20 text-[#38bdf8] border border-[#38bdf8]/50'
                  : 'text-[#94a3b8] hover:text-[#f1f5f9] border border-transparent'
              }`}
            >
              {t.shortLabel}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center text-[#cbd5e1] leading-relaxed">
        <div className="lg:col-span-8">
          <span className="text-[#94a3b8] font-semibold mr-1.5">Current Pass Focus:</span>
          {guide.focus}
        </div>
        <div className="lg:col-span-4 bg-[#0b0f19] border border-[#1e293b] rounded-md p-2.5 text-[#34d399] flex items-start gap-1.5">
          <ArrowUpRight className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block text-[0.72rem] uppercase tracking-wider">Hands-On Mission:</span>
            <span className="text-[#cbd5e1] text-[0.76rem]">{guide.actionHint}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
