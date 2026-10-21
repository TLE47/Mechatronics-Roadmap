import React, { useEffect, useRef, useState } from 'react';
import {
  SCOPE_FALLBACKS,
  SCOPE_TOKENS,
  formatScopeNumber,
  scopeBounds,
  scopeLast,
  scopeTableRows,
  type ScopeSeries,
} from '../scopeModel';

/**
 * The Scope: what the learner's own loop produced, drawn.
 *
 * A lesson that prints forty lines of `theta = ...` is asking the reader to plot it in their head.
 * Python calls `scope.stream(name, t, y)` (the worker installs `mechalab.scope`), the worker buffers
 * the points and posts them, and this draws them on the same instrument face the other simulators use.
 *
 * Three constraints, copied from the hero arm's canvas for the same reasons:
 * - the canvas never exceeds 2x device pixels, so it is crisp on retina and cheap on a phone;
 * - it redraws from data, not on a timer: there is no animation loop to leak;
 * - the numbers also exist as a table, because a canvas is invisible to a screen reader and useless to
 *   a reader who cannot separate amber from emerald.
 */
export const ScopePanel: React.FC<{ series: ScopeSeries[]; className?: string }> = ({
  series,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [asTable, setAsTable] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !series.length) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const css = (name: string, fallback: string) => {
      const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return value || fallback;
    };
    const colorFor = (index: number) =>
      css(SCOPE_TOKENS[index % SCOPE_TOKENS.length], SCOPE_FALLBACKS[index % SCOPE_FALLBACKS.length]);

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(240, Math.round(rect.width));
      const height = Math.max(140, Math.round(rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const pad = { left: 46, right: 10, top: 10, bottom: 22 };
      const plotWidth = width - pad.left - pad.right;
      const plotHeight = height - pad.top - pad.bottom;
      const bounds = scopeBounds(series);
      ctx.clearRect(0, 0, width, height);
      if (!bounds || plotWidth <= 0 || plotHeight <= 0) return;

      const x = (t: number) => pad.left + ((t - bounds.tMin) / (bounds.tMax - bounds.tMin)) * plotWidth;
      const y = (value: number) =>
        pad.top + plotHeight - ((value - bounds.yMin) / (bounds.yMax - bounds.yMin)) * plotHeight;

      // Instrument grid, in the plot's own ink so it reads in both themes.
      ctx.strokeStyle = css('--plot-line', '#1e293b');
      ctx.lineWidth = 1;
      for (let line = 0; line <= 4; line += 1) {
        const gy = pad.top + (plotHeight * line) / 4;
        ctx.beginPath();
        ctx.moveTo(pad.left, gy);
        ctx.lineTo(pad.left + plotWidth, gy);
        ctx.stroke();
        const gx = pad.left + (plotWidth * line) / 4;
        ctx.beginPath();
        ctx.moveTo(gx, pad.top);
        ctx.lineTo(gx, pad.top + plotHeight);
        ctx.stroke();
      }

      // Zero, when the data crosses it: a sign error is the common bug this panel is meant to show.
      if (bounds.yMin < 0 && bounds.yMax > 0) {
        ctx.setLineDash([3, 4]);
        ctx.strokeStyle = css('--dim', '#6d7f99');
        ctx.beginPath();
        ctx.moveTo(pad.left, y(0));
        ctx.lineTo(pad.left + plotWidth, y(0));
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
      // The plot face is the dark instrument colour in BOTH themes (`--plot`), so its labels cannot use
      // `--dim`: that token is a dark grey in light mode and would sit at ~3.5:1 on this ink. This is
      // the one place a literal colour is right - it is measured against `--plot`, not against the page.
      ctx.fillStyle = '#8fa3bd';
      ctx.textAlign = 'right';
      ctx.fillText(formatScopeNumber(bounds.yMax), pad.left - 6, pad.top + 8);
      ctx.fillText(formatScopeNumber(bounds.yMin), pad.left - 6, pad.top + plotHeight);
      ctx.textAlign = 'left';
      ctx.fillText(formatScopeNumber(bounds.tMin), pad.left, height - 6);
      ctx.textAlign = 'right';
      ctx.fillText(formatScopeNumber(bounds.tMax), pad.left + plotWidth, height - 6);
      ctx.textAlign = 'left';

      series.forEach((one, index) => {
        ctx.strokeStyle = colorFor(index);
        ctx.lineWidth = 1.8;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < one.t.length; i += 1) {
          const px = x(one.t[i]);
          const py = y(one.y[i]);
          if (!started) {
            ctx.moveTo(px, py);
            started = true;
          } else {
            ctx.lineTo(px, py);
          }
        }
        ctx.stroke();
        // A single sample still shows as a dot rather than as nothing at all.
        if (one.t.length === 1) {
          ctx.fillStyle = colorFor(index);
          ctx.beginPath();
          ctx.arc(x(one.t[0]), y(one.y[0]), 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    // The theme toggle rewrites the tokens; a canvas does not restyle itself.
    const themeObserver = new MutationObserver(draw);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      observer.disconnect();
      themeObserver.disconnect();
    };
    // `asTable` is a dependency, not a detail: switching to the table unmounts the canvas, so coming
    // back mounts a fresh one that no earlier draw has painted.
  }, [series, asTable]);

  if (!series.length) return null;
  const bounds = scopeBounds(series);
  const rows = asTable ? scopeTableRows(series) : [];

  return (
    <section
      data-testid="scope-panel"
      className={`bg-panel border border-line rounded-xl p-4 ${className}`}
      aria-label="Scope"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-mono text-muted">
          SCOPE · what scope.stream() traced this run
        </span>
        <button
          onClick={() => setAsTable((open) => !open)}
          aria-expanded={asTable}
          data-testid="btn-scope-table"
          className="px-2 py-0.5 rounded text-[11px] font-mono text-body hover:text-accent border border-line cursor-pointer"
        >
          {asTable ? 'Show plot' : 'Show as table'}
        </button>
      </div>

      {asTable ? (
        <div className="overflow-x-auto">
          <table data-testid="scope-table" className="w-full text-xs font-mono">
            <thead>
              <tr className="text-muted text-left">
                <th scope="col" className="py-1 pr-3 font-normal">
                  t
                </th>
                {series.map((one) => (
                  <th scope="col" key={one.name} className="py-1 pr-3 font-normal">
                    {one.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.i} className="border-t border-line-soft">
                  <td className="py-1 pr-3 text-body">{formatScopeNumber(row.t)}</td>
                  {row.values.map((value, index) => (
                    <td key={series[index].name} className="py-1 pr-3 text-ink">
                      {value === null ? '—' : formatScopeNumber(value)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-faint mt-2">
            {rows.length} evenly spaced samples of {series[0]?.t.length ?? 0}. The plot has every
            point.
          </p>
        </div>
      ) : (
        <>
          <canvas
            ref={canvasRef}
            data-testid="scope-canvas"
            className="w-full h-[200px] rounded-lg"
            style={{ backgroundColor: 'var(--plot)' }}
            role="img"
            aria-label={
              bounds
                ? `${series.length} traced signal${series.length === 1 ? '' : 's'} from ${formatScopeNumber(
                    bounds.tMin
                  )} to ${formatScopeNumber(bounds.tMax)}, values between ${formatScopeNumber(
                    bounds.yMin
                  )} and ${formatScopeNumber(bounds.yMax)}. Use "Show as table" for the numbers.`
                : 'No traced signal yet.'
            }
          />
          <ul data-testid="scope-legend" className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
            {series.map((one, index) => (
              <li
                key={one.name}
                data-testid={`scope-series-${index}`}
                className="flex items-center gap-1.5 font-mono"
              >
                <span
                  aria-hidden="true"
                  className="inline-block w-2.5 h-2.5 rounded-sm"
                  style={{
                    backgroundColor: `var(${SCOPE_TOKENS[index % SCOPE_TOKENS.length]})`,
                  }}
                />
                <span className="text-body">{one.name}</span>
                <span className="text-ink">
                  {scopeLast(one) === null ? '—' : formatScopeNumber(scopeLast(one) as number)}
                </span>
                {one.truncated && (
                  <span className="text-faint">first {one.t.length} points</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
};
