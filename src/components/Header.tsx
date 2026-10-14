import React from 'react';
import { Printer, CheckCircle2, BookOpen, Layers } from 'lucide-react';

interface HeaderProps {
  onOpenCheatSheet: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenCheatSheet }) => {
  return (
    <header className="bg-gradient-to-r from-[#0f172a] via-[#1e1b4b] to-[#064e3b] border-b border-[#334155] px-4 py-3 flex justify-between items-center flex-wrap gap-2">
      <div>
        <h1 className="text-base font-bold tracking-tight text-[#f1f5f9] flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#38bdf8] animate-pulse"></span>
          MechaLab · Interactive Mechatronics & Robotics Workbench
        </h1>
        <div className="text-xs text-[#94a3b8] mt-0.5">
          Easy-to-Remember Hub (<strong>MechaLab</strong>) · Guided Beginner Walkthrough + Graduate LaTeX (<span className="text-[#38bdf8] font-mono">so(3)</span>, RNEA, FOC, ESKF, CBF-QP), 3D CAD & STM32G474 Firmware
        </div>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <button
          onClick={onOpenCheatSheet}
          className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[#34d399]/15 border border-[#34d399] text-[#34d399] hover:bg-[#34d399]/25 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
        >
          <Printer className="w-3.5 h-3.5" />
          <span>Open 1-Page Printable Cheat Sheet</span>
        </button>
        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[#34d399]/15 border border-[#34d399] text-[#34d399] flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" />
          12/12 Lab, CAD, PCB & Firmware Verified
        </span>
        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[#38bdf8]/15 border border-[#38bdf8] text-[#38bdf8] flex items-center gap-1">
          <BookOpen className="w-3 h-3" />
          8-Step Guided Beginner Tour
        </span>
        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[#38bdf8]/15 border border-[#38bdf8] text-[#38bdf8] flex items-center gap-1">
          <Layers className="w-3 h-3" />
          3D STEP/STL + KiCad Netlist
        </span>
      </div>
    </header>
  );
};
