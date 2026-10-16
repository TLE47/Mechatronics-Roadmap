import React from 'react';
import { Printer, Download } from 'lucide-react';
import { ActiveTierPass } from '../curriculumData';

interface HeaderProps {
  onOpenCheatSheet: () => void;
  onExportPortfolio: () => void;
  activeTierPass: ActiveTierPass;
  onSelectTierPass: (pass: ActiveTierPass) => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenCheatSheet,
  onExportPortfolio,
  activeTierPass,
  onSelectTierPass,
}) => {
  const passLinks: { id: ActiveTierPass; label: string }[] = [
    { id: 'level0', label: 'Stage 0: On-Ramp' },
    { id: 'tier1', label: 'Pass 1: Beginner' },
    { id: 'tier2', label: 'Pass 2: Applied' },
    { id: 'tier3', label: 'Pass 3: Production' },
  ];

  return (
    // Wraps instead of overflowing: at tablet width (~834px) the four nav links stay on the
    // wordmark's row and the action group drops to its own row, right-aligned by `ml-auto`.
    <header className="bg-[#0f172a] border-b border-[#334155] px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-x-6 gap-y-2.5">
      {/* Zone 1: Single-line Brand Wordmark */}
      <a
        href="#top"
        className="text-base font-bold tracking-tight text-[#f1f5f9] whitespace-nowrap shrink-0"
      >
        MechaLab Workbench
      </a>

      {/* Zone 2: 4 concise single-line navigation links */}
      <nav
        aria-label="Learning Pass Navigation"
        className="hidden md:flex flex-wrap items-center gap-x-6 gap-y-1 text-xs font-medium text-[#94a3b8]"
      >
        {passLinks.map((item) => {
          const isActive = activeTierPass === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTierPass(item.id)}
              className={`whitespace-nowrap shrink-0 py-1 transition-colors cursor-pointer border-b-2 ${
                isActive
                  ? 'text-[#38bdf8] border-[#38bdf8] font-semibold'
                  : 'text-[#94a3b8] hover:text-[#f1f5f9] border-transparent'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Primary Action */}
      <div className="flex flex-wrap items-center justify-end gap-2.5 ml-auto">
        <button
          onClick={onExportPortfolio}
          data-testid="btn-export-portfolio"
          className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#0b0f19] hover:bg-[#1e293b] border border-[#334155] text-[#34d399] transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export Progress (.md)</span>
        </button>
        <button
          onClick={onOpenCheatSheet}
          data-testid="btn-open-cheatsheet"
          className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#1e293b] hover:bg-[#334155] border border-[#38bdf8]/50 text-[#38bdf8] transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Printer className="w-3.5 h-3.5" />
          <span>1-Page Cheat Sheet</span>
        </button>
      </div>
    </header>
  );
};
