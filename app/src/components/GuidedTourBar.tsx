import React from 'react';
import { ArrowLeft, ArrowRight, Play } from 'lucide-react';
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
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-panel px-3 py-2 sm:gap-3 sm:px-4 sm:py-2.5">
      <div className="min-w-0 flex-1 text-xs text-ink">
        <div className="flex min-w-0 items-center gap-1.5 font-semibold text-muted">
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-accent">Guided walkthrough</span>
          <span className="shrink-0 text-faint">/</span>
          <span className="truncate">{stepInfo.title}</span>
        </div>
        <p className="mt-0.5 truncate text-[11px] leading-snug text-body sm:mt-0 sm:text-[0.8rem] sm:leading-relaxed">
          {stepInfo.desc}
        </p>
      </div>

      <div className="flex w-full shrink-0 items-center gap-1.5 sm:w-auto sm:gap-2">
        <button
          onClick={onPrev}
          className="flex min-h-8 cursor-pointer items-center gap-1 rounded-[var(--r-sm)] border border-line bg-raise px-2 py-1.5 text-[11px] font-semibold text-ink transition-colors hover:bg-elevate sm:px-3 sm:text-xs"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="sr-only sm:hidden">Prev Step</span>
          <span className="hidden sm:inline">Prev Step</span>
        </button>
        <button
          onClick={onNext}
          className="flex min-h-8 cursor-pointer items-center gap-1 rounded-[var(--r-sm)] border border-accent bg-accent/15 px-2 py-1.5 text-[11px] font-semibold text-accent transition-colors hover:bg-accent/25 sm:px-3 sm:text-xs"
        >
          <span className="sm:hidden">Next {currentStepIndex + 1}/{totalSteps}</span>
          <span className="hidden sm:inline">Next Step ({currentStepIndex + 1}/{totalSteps})</span>
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          onClick={onApplyPreset}
          className="flex min-h-8 cursor-pointer items-center gap-1 rounded-[var(--r-sm)] border border-emerald/60 bg-emerald/10 px-2 py-1.5 text-[11px] font-semibold text-emerald transition-colors hover:bg-emerald/20 sm:px-3 sm:text-xs"
        >
          <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
          <span className="sm:hidden">Demo</span>
          <span className="hidden sm:inline">Apply Demo Preset</span>
        </button>
      </div>
    </div>
  );
};
