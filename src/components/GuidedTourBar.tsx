import React from 'react';
import { ArrowLeft, ArrowRight, Play, Sparkles } from 'lucide-react';
import { TabId } from '../types';

export interface TourStepInfo {
  tab: TabId;
  targetId: string | null;
  title: string;
  desc: string;
}

interface GuidedTourBarProps {
  currentStepIndex: number;
  totalSteps: number;
  stepInfo: TourStepInfo;
  onPrev: () => void;
  onNext: () => void;
  onApplyPreset: () => void;
}

export const GuidedTourBar: React.FC<GuidedTourBarProps> = ({
  currentStepIndex,
  totalSteps,
  stepInfo,
  onPrev,
  onNext,
  onApplyPreset,
}) => {
  return (
    <div className="bg-gradient-to-r from-[#38bdf8]/15 via-[#34d399]/15 to-[#38bdf8]/10 border-b border-[#38bdf8]/40 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-md">
      <div className="text-xs text-[#f1f5f9] flex-1 min-w-[280px]">
        <div className="flex items-center gap-1.5 text-[#34d399] font-bold mb-0.5">
          <Sparkles className="w-3.5 h-3.5 text-[#fbbf24]" />
          <span>Interactive Guided Beginner Walkthrough ({stepInfo.title}):</span>
        </div>
        <p className="text-[#cbd5e1] leading-relaxed text-[0.8rem]">{stepInfo.desc}</p>
      </div>

      <div className="flex gap-2 items-center flex-wrap">
        <button
          onClick={onPrev}
          className="bg-[#1e293b] hover:bg-[#334155] text-[#f1f5f9] border border-[#334155] px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Prev Step</span>
        </button>
        <button
          onClick={onNext}
          className="bg-[#38bdf8]/20 hover:bg-[#38bdf8]/30 text-[#38bdf8] border border-[#38bdf8] px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1 transition-all cursor-pointer shadow-sm"
        >
          <span>Next Step ({currentStepIndex + 1}/{totalSteps})</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onApplyPreset}
          className="bg-[#34d399]/20 hover:bg-[#34d399]/30 text-[#34d399] border border-[#34d399] px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1 transition-all cursor-pointer shadow-sm"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>Apply Demo Preset</span>
        </button>
      </div>
    </div>
  );
};
