import React from 'react';
import { CalendarDays, Flame, Sparkles, TrendingUp } from 'lucide-react';
import type { DashboardEvent } from '../../dashboardData';

/**
 * Home's study heatmap (`components/home/StudyHeatmap.tsx`).
 *
 * The learning log already knows every open, run, hint and verdict, so the year's shape is a
 * counting problem, not a second store. Each square is one local day; the colour is how many events
 * landed on it, from a quiet panel tint through cyan, green and violet. The strip is deliberately
 * decorative to a screen reader — one sentence carries the totals — because 371 individually
 * announced squares would bury the page's real content.
 */

const WEEKS = 53;

function startOfDay(time: number): number {
  const date = new Date(time);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function addDays(time: number, days: number): number {
  const date = new Date(time);
  date.setDate(date.getDate() + days);
  return startOfDay(date.getTime());
}

function dayKey(time: number): string {
  const date = new Date(time);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function levelOf(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

function dayLabel(time: number): string {
  return new Date(time).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export const StudyHeatmap: React.FC<{ events: readonly DashboardEvent[] }> = ({ events }) => {
  const today = startOfDay(Date.now());
  const start = addDays(today, -(WEEKS - 1) * 7 - new Date(today).getDay());

  const counts = new Map<string, number>();
  for (const event of events) {
    if (!Number.isFinite(event.t)) continue;
    const at = startOfDay(event.t);
    if (at < start || at > today) continue;
    const key = dayKey(at);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const cells: { at: number; count: number }[] = [];
  for (let at = start; at <= today; at = addDays(at, 1)) {
    cells.push({ at, count: counts.get(dayKey(at)) ?? 0 });
  }
  const weeks = Math.ceil(cells.length / 7);

  let total = 0;
  let activeDays = 0;
  let best = 0;
  let run = 0;
  for (const cell of cells) {
    total += cell.count;
    if (cell.count > 0) {
      activeDays += 1;
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }

  // Today may still be empty; a streak that ran through yesterday is not broken until tomorrow.
  let current = 0;
  let index = cells.length - 1;
  if (index >= 0 && cells[index].count === 0) index -= 1;
  for (; index >= 0; index -= 1) {
    if (cells[index].count === 0) break;
    current += 1;
  }

  const monthLabels: { week: number; label: string }[] = [];
  let lastMonth = -1;
  for (let week = 0; week < weeks; week += 1) {
    const cell = cells[week * 7];
    if (!cell) continue;
    const date = new Date(cell.at);
    if (date.getMonth() !== lastMonth) {
      monthLabels.push({ week, label: date.toLocaleDateString(undefined, { month: 'short' }) });
      lastMonth = date.getMonth();
    }
  }

  const columns = `repeat(${weeks}, minmax(0, 1fr))`;
  const summary =
    total === 0
      ? 'Study heatmap: no study days recorded yet.'
      : `Study heatmap: ${total} study event${total === 1 ? '' : 's'} across ${activeDays} day${
          activeDays === 1 ? '' : 's'
        }. Current streak ${current} day${current === 1 ? '' : 's'}, best ${best}.`;

  return (
    <section
      data-testid="home-heatmap"
      className="home-panel home-heat-card rounded-2xl border border-line bg-panel p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-accent/15 text-accent">
              <Flame className="h-4 w-4" aria-hidden="true" />
            </span>
            Study rhythm
            <span className="rounded-full border border-line-soft bg-canvas px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
              last 12 months
            </span>
          </h2>
          <p className="mt-1 text-[12.5px] text-muted">
            Every square is a day on this browser. Brighter means more opens, runs, hints and verdicts.
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { Icon: Flame, label: 'Streak', value: `${current}d` },
            { Icon: TrendingUp, label: 'Best', value: `${best}d` },
            { Icon: CalendarDays, label: 'Active', value: `${activeDays}` },
            { Icon: Sparkles, label: 'Events', value: `${total}` },
          ].map(({ Icon, label, value }) => (
            <div key={label} className="rounded-xl border border-line-soft bg-canvas/70 px-2.5 py-1.5">
              <dt className="flex items-center gap-1 text-[11px] uppercase tracking-[0.1em] text-faint">
                <Icon className="h-3 w-3" aria-hidden="true" />
                {label}
              </dt>
              <dd className="font-mono text-[15px] font-bold leading-tight tabular-nums text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="study-heat-scroll mt-3" role="img" aria-label={summary}>
        <div className="study-heat-inner" aria-hidden="true">
          <div className="study-heat-months" style={{ gridTemplateColumns: columns }}>
            {monthLabels.map((month, monthIndex) => (
              <span
                key={`${month.label}-${month.week}`}
                style={{
                  gridColumn: `${month.week + 1} / span ${
                    (monthLabels[monthIndex + 1]?.week ?? weeks) - month.week
                  }`,
                }}
              >
                {month.label}
              </span>
            ))}
          </div>
          <div className="study-heat-body">
            <div className="study-heat-weekdays">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((name, weekday) => (
                <span key={name}>{weekday % 2 === 1 ? name : ''}</span>
              ))}
            </div>
            <div
              className="study-heat-grid"
              style={{ gridTemplateColumns: columns, gridTemplateRows: `repeat(7, minmax(0, 1fr))` }}
            >
              {cells.map((cell) => (
                <span
                  key={cell.at}
                  className="study-heat-cell"
                  data-level={levelOf(cell.count)}
                  title={`${dayLabel(cell.at)} — ${cell.count} event${cell.count === 1 ? '' : 's'}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-faint">
          {total === 0
            ? 'No study days yet — open a lesson and the first square lights up.'
            : `${activeDays} study day${activeDays === 1 ? '' : 's'} this year. A day counts once; the shade counts the work.`}
        </p>
        <div className="study-heat-legend" aria-hidden="true">
          <span>Less</span>
          {[0, 1, 2, 3, 4].map((level) => (
            <span key={level} className="study-heat-cell" data-level={level} />
          ))}
          <span>More</span>
        </div>
      </div>
    </section>
  );
};
