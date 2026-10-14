import React from 'react';
import { Printer } from 'lucide-react';
import { ActiveTierPass } from '../curriculumData';

interface HeaderProps {
  onOpenCheatSheet: () => void;
  activeTierPass: ActiveTierPass;
  onSelectTierPass: (pass: ActiveTierPass) => void;
  totalCompleted: number;
  totalMilestones: number;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenCheatSheet,
  activeTierPass,
  onSelectTierPass,
  totalCompleted,
  totalMilestones,
}) => {
  const passButtons: { id: ActiveTierPass; label: string }[] = [
    { id: 'level0', label: 'Lvl 0: On-Ramp' },
    { id: 'tier1', label: 'Pass 1: Tier 1 (Beginner)' },
    { id: 'tier2', label: 'Pass 2: Tier 2 (Applied)' },
    { id: 'tier3', label: 'Pass 3: Tier 3 (Production)' },
  ];

  return (
    <header className="bg-[#0f172a] border-b border-[#334155] px-5 py-3 flex justify-between items-center flex-wrap gap-3">
      <div>
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-[#38bdf8]"></span>
          <h1 className="text-base font-bold tracking-tight text-[#f1f5f9]">
            MechaLab · Linear Level-Up Mechatronics & Robotics Workbench
          </h1>
        </div>
        <div className="text-xs text-[#94a3b8] mt-0.5 flex flex-wrap items-center gap-1.5">
          <span>Multi-Pass Spiral Curriculum (Finish Tracks 00→08 in Tier 1, Then Loop to Tier 2 & Tier 3)</span>
          <span aria-hidden="true">·</span>
          <span className="text-[#34d399] font-mono">
            XP Progress: {totalCompleted}/{totalMilestones} Milestones
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2.5 items-center">
        {/* Global Active Tier Pass Selector */}
        <div className="flex flex-wrap items-center gap-1 bg-[#0b0f19] p-1 rounded-lg border border-[#334155]">
          {passButtons.map((btn) => (
            <button
              key={btn.id}
              onClick={() => onSelectTierPass(btn.id)}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                activeTierPass === btn.id
                  ? 'bg-[#38bdf8]/20 text-[#38bdf8] border border-[#38bdf8]/50'
                  : 'text-[#94a3b8] hover:text-[#f1f5f9] border border-transparent'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>

        <button
          onClick={onOpenCheatSheet}
          className="px-3 py-1.5 rounded-md text-xs font-semibold bg-[#1e293b] hover:bg-[#334155] border border-[#38bdf8]/50 text-[#38bdf8] transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <Printer className="w-3.5 h-3.5" />
          <span>1-Page Cheat Sheet</span>
        </button>
      </div>
    </header>
  );
};
