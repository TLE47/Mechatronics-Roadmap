import React from 'react';
import { Printer } from 'lucide-react';

interface HeaderProps {
  onOpenCheatSheet: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenCheatSheet }) => {
  return (
    <header className="bg-[#0f172a] border-b border-[#334155] px-5 py-3.5 flex justify-between items-center flex-wrap gap-3">
      <div>
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-[#38bdf8]"></span>
          <h1 className="text-base font-bold tracking-tight text-[#f1f5f9]">
            MechaLab · Interactive Mechatronics & Robotics Workbench
          </h1>
        </div>
        <div className="text-xs text-[#94a3b8] mt-0.5 flex flex-wrap items-center gap-1.5">
          <span>Software-to-Hardware Scaffolded Curriculum (Level 0 → Tier 1–3)</span>
          <span aria-hidden="true">·</span>
          <span>12 Verified Lab Suites</span>
          <span aria-hidden="true">·</span>
          <span>3D STEP/STL CAD & 48V FOC PCB</span>
        </div>
      </div>

      <div className="flex gap-3 items-center">
        <button
          onClick={onOpenCheatSheet}
          className="px-3.5 py-1.5 rounded-md text-xs font-semibold bg-[#1e293b] hover:bg-[#334155] border border-[#38bdf8]/50 text-[#38bdf8] transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <Printer className="w-3.5 h-3.5" />
          <span>1-Page Printable Cheat Sheet</span>
        </button>
      </div>
    </header>
  );
};
