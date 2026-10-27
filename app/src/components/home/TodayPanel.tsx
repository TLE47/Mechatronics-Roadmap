import React from 'react';
import { ArrowRight, CalendarClock, Target } from 'lucide-react';
import type { HomeToday } from '../../homeData';

export interface TodayPanelProps {
  today: HomeToday;
  due: number;
  onStart: () => void;
  onReview: () => void;
}

/**
 * The first thing Home answers: what is the smallest next thing? (`components/home/TodayPanel.tsx`)
 *
 * It reads `homeData`'s join rather than recomputing one: the mission is the same mission the
 * dashboard and the roadmap show, and the entry is the first one the mission still asks for. A
 * checklist of ten steps would be a map; this is the one step to take now.
 */
export const TodayPanel: React.FC<TodayPanelProps> = ({ today, due, onStart, onReview }) => (
  <section
    data-testid="home-today"
    className="rounded-xl border border-accent/40 bg-panel p-4 space-y-3"
  >
    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent">
      <Target className="h-3.5 w-3.5" aria-hidden="true" />
      Today
    </div>
    {today.kind === 'mission' ? (
      <>
        <p className="text-[11px] uppercase tracking-wide text-muted">
          Step {today.step} · {today.stepTitle}
        </p>
        <h2 className="text-lg font-bold leading-tight text-ink">{today.missionName}</h2>
        {today.entryTitle && (
          <p className="text-sm text-body">
            Next check: <span className="font-semibold text-ink">{today.entryTitle}</span>
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
          <span data-testid="home-today-checks">{today.label}</span>
          <span aria-hidden="true">·</span>
          <button
            onClick={onReview}
            className="inline-flex items-center gap-1 text-xs text-accent hover:underline cursor-pointer"
            data-testid="home-today-review"
          >
            <CalendarClock className="h-3 w-3" aria-hidden="true" />
            {due === 0 ? 'No cards due' : `${due} card${due === 1 ? '' : 's'} due`}
          </button>
        </div>
        <button
          onClick={onStart}
          data-testid="btn-home-start"
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-bold text-inverse cursor-pointer hover:bg-accent/80"
        >
          {today.entryTitle ? 'Open the next check' : 'Open the runner'}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </>
    ) : (
      <>
        <h2 className="text-lg font-bold leading-tight text-ink">The course is verified</h2>
        <p className="text-sm text-body" data-testid="home-today-checks">
          {today.label}
        </p>
        <button
          onClick={onStart}
          data-testid="btn-home-start"
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-bold text-inverse cursor-pointer hover:bg-accent/80"
        >
          Open the capstone route
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </>
    )}
  </section>
);
