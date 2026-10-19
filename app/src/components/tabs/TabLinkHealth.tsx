import React, { useMemo, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, CircleSlash, Clock3 } from 'lucide-react';
import {
  HOST_RECURRENCE,
  HOST_RECURRENCE_RUNS,
  LINK_HISTORY,
  LINK_HISTORY_SKIPPED,
  LINK_HISTORY_SOURCE,
  type LinkHistoryPoint,
} from '../../data/linkHistoryData';
import { RiseIssuesPanel } from '../RiseIssuesPanel';

/**
 * Link Health — the one number the nightly citation check cannot fake.
 *
 * `docs/link-check-history.jsonl` gains one line per run. Every link is either served (PASS/FAIL),
 * or not checked: the publisher blocked the bot, the host was unreachable, or it returned a server
 * error. Plotting that gray zone over time shows whether the roadmap's citations are being verified
 * at all — a shrinking *served* count with a flat zero not-checked count would be the suspicious
 * shape, and this page makes both visible side by side.
 *
 * The data module is generated (`scripts/generate_link_history_data.py --check` in CI), so the page
 * reads the same numbers the checker wrote and cannot quietly disagree with it.
 */

const W = 880;
const H = 300;
const PAD = { left: 52, right: 22, top: 18, bottom: 42 };
const INNER_W = W - PAD.left - PAD.right;
const INNER_H = H - PAD.top - PAD.bottom;
const DAY_MS = 86_400_000;

function parseDate(iso: string): number {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? 0 : ms;
}

function formatDay(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function formatStamp(iso: string): string {
  const ms = parseDate(iso);
  if (!ms) return iso;
  return new Date(ms).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });
}

/** Smallest 1/2/2.5/5×10ⁿ step that covers `raw` legibly. */
function niceStep(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 1) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const fraction = raw / magnitude;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return Math.max(1, nice * magnitude);
}

function pct(part: number, total: number): string {
  if (total <= 0) return '—';
  return `${((part / total) * 100).toFixed(1)}%`;
}

function deltaLabel(latest: number, previous: number | null): string {
  if (previous === null) return 'first recorded run';
  const delta = latest - previous;
  if (delta === 0) return 'unchanged from previous run';
  return `${delta > 0 ? '+' : ''}${delta} from previous run`;
}

interface ChartProps {
  rows: LinkHistoryPoint[];
}

const TrendChart: React.FC<ChartProps> = ({ rows }) => {
  const [hovered, setHovered] = useState<number | null>(null);

  const chart = useMemo(() => {
    const times = rows.map((row) => parseDate(row.date));
    const maxNotChecked = Math.max(0, ...rows.map((row) => row.notChecked));
    const step = niceStep(Math.max(1, maxNotChecked) / 4);
    const top = Math.max(step, Math.ceil(maxNotChecked / step) * step);

    const t0 = times.length ? Math.min(...times) : 0;
    const t1 = times.length ? Math.max(...times) : 0;
    // A single run (or several in the same minute) has no span to spread over: pin it centred.
    const single = t1 - t0 < DAY_MS / 24;
    const xOf = (t: number) => (single ? PAD.left + INNER_W / 2 : PAD.left + ((t - t0) / (t1 - t0)) * INNER_W);
    const yOf = (value: number) => PAD.top + INNER_H - (value / top) * INNER_H;

    const points = rows.map((row, index) => ({
      row,
      x: xOf(times[index]),
      y: yOf(row.notChecked),
      t: times[index],
    }));

    const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const baseline = PAD.top + INNER_H;
    const area =
      points.length === 0
        ? ''
        : `M${points[0].x.toFixed(1)},${baseline} ` +
          points.map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') +
          ` L${points[points.length - 1].x.toFixed(1)},${baseline} Z`;

    const ticks = [];
    for (let value = 0; value <= top + step * 0.001; value += step) ticks.push(value);

    // At most six date labels; always the first and last run so the window is unambiguous.
    const labelCount = Math.min(6, points.length);
    const labelIndices = new Set<number>();
    if (labelCount === 1) labelIndices.add(0);
    else {
      for (let i = 0; i < labelCount; i += 1) {
        labelIndices.add(Math.round((i / (labelCount - 1)) * (points.length - 1)));
      }
    }

    return { points, line, area, ticks, top, single, labelIndices };
  }, [rows]);

  if (rows.length === 0) return null;

  const active = hovered !== null ? chart.points[hovered] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto block"
        role="img"
        aria-label={`Not-checked citation count across ${rows.length} link-check run${rows.length === 1 ? '' : 's'}`}
        data-testid="link-history-chart"
      >
        <defs>
          <linearGradient id="link-history-area-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Horizontal grid + y labels (counts, so whole numbers only) */}
        {chart.ticks.map((value) => {
          const y = PAD.top + INNER_H - (value / chart.top) * INNER_H;
          return (
            <g key={`tick-${value}`}>
              <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="#1e293b" strokeWidth="1" />
              <text x={PAD.left - 10} y={y + 4} textAnchor="end" fontSize="11" fill="#94a3b8" fontFamily="monospace">
                {Math.round(value)}
              </text>
            </g>
          );
        })}

        {/* Plot border */}
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + INNER_H} stroke="#334155" strokeWidth="1" />
        <line
          x1={PAD.left}
          y1={PAD.top + INNER_H}
          x2={W - PAD.right}
          y2={PAD.top + INNER_H}
          stroke="#334155"
          strokeWidth="1"
        />

        <text x={8} y={11} fontSize="10.5" fill="#64748b" fontFamily="monospace">
          links
        </text>

        {chart.area && <path d={chart.area} fill="url(#link-history-area-fill)" />}
        {chart.points.length > 1 && (
          <path d={chart.line} fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinejoin="round" />
        )}

        {/* One run cannot make a line, so read it off a guide to the axis instead of a lone dot. */}
        {chart.single && chart.points.length === 1 && (
          <line
            x1={PAD.left}
            y1={chart.points[0].y}
            x2={chart.points[0].x}
            y2={chart.points[0].y}
            stroke="#fbbf24"
            strokeDasharray="3 4"
            strokeWidth="1"
            opacity="0.55"
          />
        )}

        {/* Markers: the latest run is amber, earlier runs cyan. */}
        {chart.points.map((point, index) => {
          const isLatest = index === chart.points.length - 1;
          return (
            <g key={`${point.row.date}-${index}`}>
              <circle
                cx={point.x}
                cy={point.y}
                r={hovered === index ? 6.5 : 4.5}
                fill={isLatest ? '#fbbf24' : '#38bdf8'}
                stroke="#070a12"
                strokeWidth="1.5"
              />
              <circle
                cx={point.x}
                cy={point.y}
                r="14"
                fill="transparent"
                onMouseEnter={() => setHovered(index)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: 'pointer' }}
              />
              {isLatest && (
                <text
                  x={point.x}
                  y={Math.max(11, point.y - 11)}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="bold"
                  fill="#fbbf24"
                  fontFamily="monospace"
                >
                  {point.row.notChecked}
                </text>
              )}
            </g>
          );
        })}

        {/* Date labels */}
        {chart.points.map((point, index) =>
          chart.labelIndices.has(index) ? (
            <text
              key={`label-${index}`}
              x={point.x}
              y={H - PAD.bottom + 18}
              textAnchor="middle"
              fontSize="11"
              fill="#94a3b8"
              fontFamily="monospace"
            >
              {formatDay(point.t)}
            </text>
          ) : null
        )}
      </svg>

      {active && (
        <div
          className="absolute pointer-events-none -translate-x-1/2 -translate-y-full rounded-lg border border-[#334155] bg-[#070a12]/95 px-2.5 py-2 text-[0.7rem] text-[#cbd5e1] shadow-lg whitespace-nowrap"
          style={{ left: `${(active.x / W) * 100}%`, top: `${(active.y / H) * 100}%` }}
          data-testid="link-history-tooltip"
        >
          <div className="font-mono text-[#fbbf24] font-bold">{active.row.notChecked} not checked</div>
          <div className="text-[#94a3b8]">{formatStamp(active.row.date)}</div>
          <div className="font-mono text-[#94a3b8]">
            {active.row.served}/{active.row.urls} served · {active.row.failed} failed
          </div>
        </div>
      )}
    </div>
  );
};

export const TabLinkHealth: React.FC = () => {
  const latest = LINK_HISTORY.length ? LINK_HISTORY[LINK_HISTORY.length - 1] : null;
  const previous = LINK_HISTORY.length > 1 ? LINK_HISTORY[LINK_HISTORY.length - 2] : null;
  const first = LINK_HISTORY.length ? LINK_HISTORY[0] : null;

  if (!latest) {
    return (
      <div className="space-y-4">
        <div className="bg-[#111827] border border-[#334155] rounded-xl p-6">
          <h2 className="text-sm font-bold text-[#38bdf8] mb-2">Link Health — no runs recorded yet</h2>
          <p className="text-xs text-[#94a3b8] leading-relaxed">
            The dashboard plots <span className="font-mono text-[#cbd5e1]">{LINK_HISTORY_SOURCE}</span>, which the nightly
            citation check appends one line to per run. Once the first scheduled run lands, the trend appears here.
          </p>
        </div>
      </div>
    );
  }

  const checkedPct = pct(latest.served, latest.urls);
  const uncheckedPct = pct(latest.notChecked, latest.urls);
  const tableRows = [...LINK_HISTORY].reverse().slice(0, 12);

  return (
    <div className="space-y-4">
      {/* Beginner intuition */}
      <div className="bg-[#38bdf8]/10 border border-[#38bdf8]/30 border-l-4 border-l-[#38bdf8] rounded-lg p-3.5 text-xs text-[#cbd5e1] leading-relaxed">
        <strong className="text-[#38bdf8] text-[0.85rem] block mb-1">
          Why count the links nobody could check?
        </strong>
        A citation that returns <strong>PASS</strong> is verified. A citation that returns <strong>FAIL</strong> is a bug to fix.
        The third case is the quiet one: a publisher answers the bot with <strong>403/429</strong>, or a host is unreachable, and
        the checker cannot say whether the link is still good. Counting those honestly — instead of calling them passes — is what
        keeps a green build meaningful. Watch this line: it should stay small, and <em>served</em> should keep up with <em>scanned</em>.
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-[#111827] border border-[#334155] rounded-xl p-4">
          <div className="flex items-center gap-2 text-[0.72rem] text-[#94a3b8]">
            <CircleSlash size={13} /> Not checked (latest)
          </div>
          <div
            className={`text-2xl font-bold font-mono mt-1 ${latest.notChecked === 0 ? 'text-[#34d399]' : 'text-[#fbbf24]'}`}
            data-testid="link-history-latest-not-checked"
          >
            {latest.notChecked}
            <span className="text-sm text-[#94a3b8] font-normal"> / {latest.urls}</span>
          </div>
          <div className="text-[0.68rem] text-[#94a3b8] mt-1">
            {uncheckedPct} of citations · {deltaLabel(latest.notChecked, previous ? previous.notChecked : null)}
          </div>
        </div>

        <div className="bg-[#111827] border border-[#334155] rounded-xl p-4">
          <div className="flex items-center gap-2 text-[0.72rem] text-[#94a3b8]">
            <CheckCircle2 size={13} /> Served (HTTP 200)
          </div>
          <div className="text-2xl font-bold font-mono text-[#38bdf8] mt-1" data-testid="link-history-latest-served">
            {latest.served}
            <span className="text-sm text-[#94a3b8] font-normal"> / {latest.urls}</span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-[#1e293b] overflow-hidden">
            <div className="h-full bg-[#38bdf8]" style={{ width: checkedPct === '—' ? '0%' : checkedPct }} />
          </div>
          <div className="text-[0.68rem] text-[#94a3b8] mt-1">{checkedPct} of citations verified live</div>
        </div>

        <div className="bg-[#111827] border border-[#334155] rounded-xl p-4">
          <div className="flex items-center gap-2 text-[0.72rem] text-[#94a3b8]">
            <AlertTriangle size={13} /> Failed citations (latest)
          </div>
          <div
            className={`text-2xl font-bold font-mono mt-1 ${latest.failed === 0 ? 'text-[#34d399]' : 'text-[#fb7185]'}`}
            data-testid="link-history-latest-failed"
          >
            {latest.failed}
          </div>
          <div className="text-[0.68rem] text-[#94a3b8] mt-1">
            {latest.blocked} blocked · {latest.unreachable} unreachable · {latest.serverError} server error
          </div>
        </div>

        <div className="bg-[#111827] border border-[#334155] rounded-xl p-4">
          <div className="flex items-center gap-2 text-[0.72rem] text-[#94a3b8]">
            <Activity size={13} /> Runs recorded
          </div>
          <div className="text-2xl font-bold font-mono text-[#cbd5e1] mt-1">{LINK_HISTORY.length}</div>
          <div className="text-[0.68rem] text-[#94a3b8] mt-1">
            {first ? `${formatDay(parseDate(first.date))} → ${formatDay(parseDate(latest.date))}` : '—'}
          </div>
        </div>
      </div>

      <RiseIssuesPanel />

      {LINK_HISTORY_SKIPPED.length > 0 && (
        <div className="bg-[#fbbf24]/10 border border-[#fbbf24]/40 rounded-lg p-3 text-xs text-[#fbbf24]">
          <strong>{LINK_HISTORY_SKIPPED.length} history line(s) could not be plotted.</strong> Fix{' '}
          <span className="font-mono">{LINK_HISTORY_SOURCE}</span> or regenerate the module:
          <ul className="mt-1 space-y-0.5 font-mono text-[0.7rem] text-[#fcd34d]">
            {LINK_HISTORY_SKIPPED.slice(0, 5).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Trend */}
      <div className="bg-[#111827] border border-[#334155] rounded-xl p-4">
        <div className="flex items-baseline justify-between flex-wrap gap-2 mb-3">
          <h2 className="text-sm font-bold text-[#38bdf8]">Not-Checked Citations Over Time</h2>
          <span className="text-[0.7rem] text-[#94a3b8] font-mono">
            source: {LINK_HISTORY_SOURCE} · {LINK_HISTORY.length} run{LINK_HISTORY.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="rounded-lg border border-[#1e293b] bg-[#070a12] p-2">
          <TrendChart rows={LINK_HISTORY} />
        </div>
        {LINK_HISTORY.length === 1 && (
          <p className="text-[0.68rem] text-[#64748b] font-mono mt-1.5">
            One run recorded — each nightly sweep appends a row, and the trend line grows from here.
          </p>
        )}
        <p className="text-[0.7rem] text-[#94a3b8] mt-2 leading-relaxed">
          Amber dot = latest run. Hover a point for that run's served/failed split. <em>Served</em> counts HTTP 200 PASSes, so
          served + not checked + failed = citations, and a run whose <em>not checked</em> count jumps is usually a host starting
          to block the checker rather than new broken links — confirm with{' '}
          <span className="font-mono text-[#cbd5e1]">scripts/check_links.py</span> before editing citations.
        </p>
      </div>

      {/* Recurring hosts: a wall that keeps coming back is a different problem from a one-off. */}
      <div className="bg-[#111827] border border-[#334155] rounded-xl p-4 overflow-x-auto">
        <div className="flex items-baseline justify-between flex-wrap gap-2 mb-2">
          <h2 className="text-sm font-bold text-[#38bdf8]">Recurring unverified hosts</h2>
          <span className="text-[0.7rem] text-[#94a3b8] font-mono">
            {HOST_RECURRENCE_RUNS} run{HOST_RECURRENCE_RUNS === 1 ? '' : 's'} recorded the URL list
          </span>
        </div>
        {HOST_RECURRENCE.length === 0 ? (
          <p className="text-xs text-[#94a3b8] leading-relaxed">
            No run has recorded which URLs it could not verify yet, so there is nothing to count per
            host. The next sweep writes that list; this table fills from it.
          </p>
        ) : (
          <table className="w-full text-left text-xs border-collapse" data-testid="link-history-hosts">
            <thead>
              <tr className="text-[#94a3b8] border-b border-[#334155]">
                <th className="py-1.5 pr-3 font-semibold">Host</th>
                <th className="py-1.5 pr-3 font-semibold text-right">Runs unverified</th>
                <th className="py-1.5 pr-3 font-semibold text-right">URLs now</th>
                <th className="py-1.5 font-semibold text-right">Last seen</th>
              </tr>
            </thead>
            <tbody className="font-mono text-[#cbd5e1]">
              {HOST_RECURRENCE.map((entry) => (
                <tr key={entry.host} className="border-b border-[#1e293b] last:border-0">
                  <td className="py-1.5 pr-3 whitespace-nowrap">{entry.host}</td>
                  <td className={`py-1.5 pr-3 text-right ${entry.runs >= 2 ? 'text-[#fbbf24]' : 'text-[#94a3b8]'}`}>
                    {entry.runs} / {HOST_RECURRENCE_RUNS}
                  </td>
                  <td className="py-1.5 pr-3 text-right">{entry.urls}</td>
                  <td className="py-1.5 text-right text-[#94a3b8]">
                    {entry.lastSeen ? formatDay(parseDate(entry.lastSeen)) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-[0.7rem] text-[#94a3b8] mt-2 leading-relaxed">
          A host that stays on this list across sweeps is a publisher that blocks scripts — keep the
          citation and confirm it in a browser, or find a mirror. A host seen once is usually a
          transient wall or an outage; the rise gate files an issue only for the URLs that are new.
        </p>
      </div>

      {/* Run table */}
      <div className="bg-[#111827] border border-[#334155] rounded-xl p-4 overflow-x-auto">
        <h2 className="text-sm font-bold text-[#38bdf8] mb-2 flex items-center gap-2">
          <Clock3 size={14} /> Recent runs (newest first)
        </h2>
        <table className="w-full text-left text-xs border-collapse" data-testid="link-history-table">
          <thead>
            <tr className="text-[#94a3b8] border-b border-[#334155]">
              <th className="py-1.5 pr-3 font-semibold">Run (UTC)</th>
              <th className="py-1.5 pr-3 font-semibold text-right">Citations</th>
              <th className="py-1.5 pr-3 font-semibold text-right">Served</th>
              <th className="py-1.5 pr-3 font-semibold text-right">Not checked</th>
              <th className="py-1.5 pr-3 font-semibold text-right">Blocked</th>
              <th className="py-1.5 pr-3 font-semibold text-right">Unreachable</th>
              <th className="py-1.5 font-semibold text-right">Failed</th>
            </tr>
          </thead>
          <tbody className="font-mono text-[#cbd5e1]">
            {tableRows.map((row, index) => (
              <tr
                key={row.date}
                className="border-b border-[#1e293b] last:border-0"
                data-testid={`link-history-row-${index}`}
              >
                <td className="py-1.5 pr-3 whitespace-nowrap">{formatStamp(row.date)}</td>
                <td className="py-1.5 pr-3 text-right">{row.urls}</td>
                <td className="py-1.5 pr-3 text-right text-[#38bdf8]">{row.served}</td>
                <td className={`py-1.5 pr-3 text-right ${row.notChecked === 0 ? 'text-[#34d399]' : 'text-[#fbbf24]'}`}>
                  {row.notChecked}
                </td>
                <td className="py-1.5 pr-3 text-right text-[#94a3b8]">{row.blocked}</td>
                <td className="py-1.5 pr-3 text-right text-[#94a3b8]">{row.unreachable}</td>
                <td className={`py-1.5 text-right ${row.failed === 0 ? 'text-[#34d399]' : 'text-[#fb7185]'}`}>
                  {row.failed}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
