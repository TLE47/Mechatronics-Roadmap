import React from 'react';
import { ArrowRight, Route } from 'lucide-react';
import type { HomeRouteStep } from '../../homeData';

export interface RoutePanelProps {
  route: readonly HomeRouteStep[];
  onOpenRoute: () => void;
}

/**
 * Where the learner is on the ten-step route (`components/home/RoutePanel.tsx`).
 *
 * The roadmap tab is where a step is opened; this is the progress bar across it. The counts are
 * tier-1 verifications — the same entries the missions ask for — so a step that reads `4 of 4`
 * here is a step whose mission can be verified, not a different denominator.
 */
export const RoutePanel: React.FC<RoutePanelProps> = ({ route, onOpenRoute }) => {
  const verified = route.reduce((sum, step) => sum + step.verified, 0);
  const total = route.reduce((sum, step) => sum + step.total, 0);
  return (
    <section data-testid="home-route" className="rounded-xl border border-line bg-panel p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-ink">
          <Route className="h-4 w-4 text-accent" aria-hidden="true" />
          Your route
        </h2>
        <span className="text-[11px] text-muted" data-testid="home-route-total">
          {verified} of {total} checks
        </span>
      </div>
      <ol className="grid gap-1.5 sm:grid-cols-2">
        {route.map((step) => {
          const pct = step.total === 0 ? 0 : Math.round((step.verified / step.total) * 100);
          return (
            <li key={step.number}>
              <button
                onClick={onOpenRoute}
                data-testid={`home-route-step-${step.number}`}
                className="w-full rounded-lg border border-line-soft bg-canvas px-2.5 py-2 text-left cursor-pointer hover:border-accent/60"
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-[12px] font-semibold text-ink">
                    {step.number}. {step.title}
                  </span>
                  <span className="shrink-0 text-[11px] tnum text-muted">
                    {step.verified}/{step.total}
                  </span>
                </span>
                <span
                  className="mt-1.5 block h-1 w-full overflow-hidden rounded-full bg-raise"
                  aria-hidden="true"
                >
                  <span
                    className="block h-full rounded-full bg-accent"
                    style={{ width: `${pct}%` }}
                  />
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <button
        onClick={onOpenRoute}
        data-testid="btn-home-route"
        className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline cursor-pointer"
      >
        Open the roadmap
        <ArrowRight className="h-3 w-3" aria-hidden="true" />
      </button>
    </section>
  );
};
