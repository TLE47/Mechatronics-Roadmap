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
    <div className="bg-gradient-to-r from-accent/15 via-emerald/15 to-accent/10 border-b border-accent/40 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-md">
      <div className="text-xs text-ink flex-1 min-w-[280px]">
        <div className="flex items-center gap-1.5 text-emerald font-bold mb-0.5">
          <Sparkles className="w-3.5 h-3.5 text-amber" />
          <span>Interactive Guided Beginner Walkthrough ({stepInfo.title}):</span>
        </div>
        <p className="text-body leading-relaxed text-[0.8rem]">{stepInfo.desc}</p>
      </div>

      <div className="flex gap-2 items-center flex-wrap">
        <button
          onClick={onPrev}
          className="bg-raise hover:bg-elevate text-ink border border-line px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Prev Step</span>
        </button>
        <button
          onClick={onNext}
          className="bg-accent/20 hover:bg-accent/30 text-accent border border-accent px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1 transition-all cursor-pointer shadow-sm"
        >
          <span>Next Step ({currentStepIndex + 1}/{totalSteps})</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onApplyPreset}
          className="bg-emerald/20 hover:bg-emerald/30 text-emerald border border-emerald px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1 transition-all cursor-pointer shadow-sm"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>Apply Demo Preset</span>
        </button>
      </div>
    </div>
  );
};
