import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  SCOPE_FALLBACKS,
  SCOPE_TOKENS,
  cursorReadout,
  formatScopeNumber,
  panWindow,
  scopeBounds,
  scopeBoundsIn,
  scopeLast,
  scopeTableRows,
  scopeTimeRange,
  zoomWindow,
  type ScopeReading,
  type ScopeSeries,
  type ScopeWindow,
} from '../scopeModel';

/**
 * The Scope: what the learner's own loop produced, drawn - and now read.
 *
 * A lesson that prints forty lines of `theta = ...` is asking the reader to plot it in their head.
 * Python calls `scope.stream(name, t, y)` (the worker installs `mechalab.scope`), the worker buffers
 * the points and posts them, and this draws them on the same instrument face the other simulators use.
 *
 * Four constraints, copied from the hero arm's canvas for the same reasons:
 * - the canvas never exceeds 2x device pixels, so it is crisp on retina and cheap on a phone;
 * - it redraws from data, not on a timer: there is no animation loop to leak;
 * - the numbers also exist as a table, because a canvas is invisible to a screen reader and useless to
 *   a reader who cannot separate amber from emerald;
 * - every pointer gesture has a button or a key beside it (zoom in/out/reset, <- and -> for the
 *   cursor), so nothing here is mouse-only.
 *
 * Two runs can share the axes: **Pin as A** keeps the trace on screen while the next run draws over
 * it as B, which is how a change in `Kp` or `ki` is read - one `t`, both values, side by side.
 */
export const ScopePanel: React.FC<{
  series: ScopeSeries[];
  /** The run pinned as A, if any; drawn under this run's B on the same axes. */
  pinned?: ScopeSeries[] | null;
  onPin?: () => void;
  onUnpin?: () => void;
  className?: string;
}> = ({ series, pinned = null, onPin, onUnpin, className = '' }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [asTable, setAsTable] = useState(false);
  const [timeWindow, setTimeWindow] = useState<ScopeWindow | null>(null);
  const [cursorT, setCursorT] = useState<number | null>(null);
  // Where a drag started, and the view it started from: a pan is measured against that, not against
  // the previous pointer event, so a fast drag cannot drift.
  const dragRef = useRef<{ clientX: number; view: ScopeWindow } | null>(null);

  const overlay = Boolean(pinned && pinned.length);
  const allSeries = useMemo(
    () => (pinned && pinned.length ? [...pinned, ...series] : series),
    [pinned, series]
  );
  const extent = useMemo(() => scopeTimeRange(allSeries), [allSeries]);
  const view: ScopeWindow | null = timeWindow ?? extent;

  // A new run is a new trace: the view it was zoomed to belonged to the old one. Pinning does not
  // reset it, because the point of pinning is to compare the two runs on the same axes.
  useEffect(() => {
    setTimeWindow(null);
    setCursorT(null);
  }, [series]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !allSeries.length || asTable) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const css = (name: string, fallback: string) => {
      const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return value || fallback;
    };
    const colorFor = (index: number) =>
      css(SCOPE_TOKENS[index % SCOPE_TOKENS.length], SCOPE_FALLBACKS[index % SCOPE_FALLBACKS.length]);

    const PAD = { left: 46, right: 10, top: 10, bottom: 22 };
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(240, Math.round(rect.width));
      const height = Math.max(140, Math.round(rect.height));
      const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const plotWidth = width - PAD.left - PAD.right;
      const plotHeight = height - PAD.top - PAD.bottom;
      const bounds = view ? scopeBoundsIn(allSeries, view) : scopeBounds(allSeries);
      ctx.clearRect(0, 0, width, height);
      if (!bounds || plotWidth <= 0 || plotHeight <= 0) return;

      const x = (t: number) =>
        PAD.left + ((t - bounds.tMin) / (bounds.tMax - bounds.tMin)) * plotWidth;
      const y = (value: number) =>
        PAD.top + plotHeight - ((value - bounds.yMin) / (bounds.yMax - bounds.yMin)) * plotHeight;

      // Instrument grid, in the plot's own ink so it reads in both themes.
      ctx.strokeStyle = css('--plot-line', '#1e293b');
      ctx.lineWidth = 1;
      for (let line = 0; line <= 4; line += 1) {
        const gy = PAD.top + (plotHeight * line) / 4;
        ctx.beginPath();
        ctx.moveTo(PAD.left, gy);
        ctx.lineTo(PAD.left + plotWidth, gy);
        ctx.stroke();
        const gx = PAD.left + (plotWidth * line) / 4;
        ctx.beginPath();
        ctx.moveTo(gx, PAD.top);
        ctx.lineTo(gx, PAD.top + plotHeight);
        ctx.stroke();
      }

      // Zero, when the data crosses it: a sign error is the common bug this panel is meant to show.
      if (bounds.yMin < 0 && bounds.yMax > 0) {
        ctx.setLineDash([3, 4]);
        ctx.strokeStyle = css('--dim', '#6d7f99');
        ctx.beginPath();
        ctx.moveTo(PAD.left, y(0));
        ctx.lineTo(PAD.left + plotWidth, y(0));
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
      // The plot face is the dark instrument colour in BOTH themes (`--plot`), so its labels cannot use
      // `--dim`: that token is a dark grey in light mode and would sit at ~3.5:1 on this ink. This is
      // the one place a literal colour is right - it is measured against `--plot`, not against the page.
      ctx.fillStyle = '#8fa3bd';
      ctx.textAlign = 'right';
      ctx.fillText(formatScopeNumber(bounds.yMax), PAD.left - 6, PAD.top + 8);
      ctx.fillText(formatScopeNumber(bounds.yMin), PAD.left - 6, PAD.top + plotHeight);
      ctx.textAlign = 'left';
      ctx.fillText(formatScopeNumber(bounds.tMin), PAD.left, height - 6);
      ctx.textAlign = 'right';
      ctx.fillText(formatScopeNumber(bounds.tMax), PAD.left + plotWidth, height - 6);
      ctx.textAlign = 'left';

      const stroke = (one: ScopeSeries, color: string, dashed: boolean, alpha: number) => {
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = color;
        ctx.lineWidth = dashed ? 1.4 : 1.8;
        ctx.lineJoin = 'round';
        if (dashed) ctx.setLineDash([4, 3]);
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
        if (dashed) ctx.setLineDash([]);
        // A single sample still shows as a dot rather than as nothing at all.
        if (one.t.length === 1) {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(x(one.t[0]), y(one.y[0]), 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      };

      // A is under B, dashed and lighter: when two traces disagree, the newer one is the one the
      // learner just changed and should be the one on top.
      if (overlay) {
        (pinned ?? []).forEach((one, index) => stroke(one, colorFor(index), true, 0.55));
      }
      series.forEach((one, index) => stroke(one, colorFor(index), false, 1));

      if (cursorT !== null && cursorT >= bounds.tMin && cursorT <= bounds.tMax) {
        const cx = x(cursorT);
        ctx.strokeStyle = '#8fa3bd';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(cx, PAD.top);
        ctx.lineTo(cx, PAD.top + plotHeight);
        ctx.stroke();
        ctx.setLineDash([]);
        const drawDot = (one: ScopeSeries, color: string, value: number | null) => {
          if (value === null) return;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(cx, y(value), 3, 0, Math.PI * 2);
          ctx.fill();
        };
        if (overlay) {
          const readings = cursorReadout(pinned ?? [], cursorT);
          (pinned ?? []).forEach((one, index) =>
            drawDot(one, colorFor(index), readings[index]?.value ?? null)
          );
        }
        const current = cursorReadout(series, cursorT);
        series.forEach((one, index) => drawDot(one, colorFor(index), current[index]?.value ?? null));
      }
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
  }, [allSeries, series, pinned, overlay, view, cursorT, asTable]);

  // Wheel zoom needs a non-passive listener to stop the page scrolling under the plot, which a React
  // `onWheel` prop cannot promise.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || asTable || !extent || !view) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const plotWidth = rect.width - 46 - 10;
      if (plotWidth <= 0) return;
      const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left - 46) / plotWidth));
      const anchor = view.tMin + fraction * (view.tMax - view.tMin);
      const factor = event.deltaY > 0 ? 1.2 : 1 / 1.2;
      setTimeWindow(zoomWindow(view, extent, factor, anchor));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [asTable, extent, view]);

  if (!series.length && !overlay) return null;
  const bounds = view ? scopeBoundsIn(allSeries, view) : scopeBounds(allSeries);
  const rows = asTable ? scopeTableRows(series) : [];
  const readings: ScopeReading[] = cursorT === null ? [] : cursorReadout(allSeries, cursorT);
  const label = (name: string, index: number) => {
    if (!overlay) return name;
    return index < (pinned?.length ?? 0) ? `${name} (A)` : `${name} (B)`;
  };

  const pointToTime = (clientX: number): number | null => {
    const canvas = canvasRef.current;
    if (!canvas || !view) return null;
    const rect = canvas.getBoundingClientRect();
    const plotWidth = rect.width - 46 - 10;
    if (plotWidth <= 0) return null;
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left - 46) / plotWidth));
    return view.tMin + fraction * (view.tMax - view.tMin);
  };

  const zoomBy = (factor: number) => {
    if (!extent || !view) return;
    // A button has no pointer under it, so it zooms about the middle of the view - the same place a
    // learner is looking when they press it.
    const anchor = (view.tMin + view.tMax) / 2;
    setTimeWindow(zoomWindow(view, extent, factor, anchor));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (!view) return;
    const span = view.tMax - view.tMin;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const step = span / 50;
      const start = cursorT ?? view.tMin;
      const next = Math.min(view.tMax, Math.max(view.tMin, start + (event.key === 'ArrowRight' ? step : -step)));
      setCursorT(next);
      event.preventDefault();
      return;
    }
    if (event.key === '+' || event.key === '=') {
      zoomBy(1 / 1.4);
      event.preventDefault();
    } else if (event.key === '-') {
      zoomBy(1.4);
      event.preventDefault();
    } else if (event.key === '0') {
      setTimeWindow(null);
      setCursorT(null);
      event.preventDefault();
    }
  };

  return (
    <section
      data-testid="scope-panel"
      className={`bg-panel border border-line rounded-xl p-4 ${className}`}
      aria-label="Scope"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <span className="text-xs font-mono text-muted">
          SCOPE · what scope.stream() traced this run
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {view && (
            <span
              data-testid="scope-window"
              className="text-[11px] font-mono text-faint tabular-nums"
              title="The time axis currently on screen"
            >
              t {formatScopeNumber(view.tMin)} → {formatScopeNumber(view.tMax)}
            </span>
          )}
          {overlay && (
            <span data-testid="scope-pin-label" className="text-[11px] font-mono text-amber">
              A pinned · B is this run
            </span>
          )}
          {series.length > 0 && onPin && !overlay && (
            <button
              onClick={onPin}
              data-testid="btn-scope-pin"
              title="Keep this run on the axes, so the next one draws over it"
              className="px-2 py-0.5 rounded text-[11px] font-mono text-body hover:text-accent border border-line cursor-pointer"
            >
              Pin as A
            </button>
          )}
          {overlay && onUnpin && (
            <button
              onClick={onUnpin}
              data-testid="btn-scope-unpin"
              className="px-2 py-0.5 rounded text-[11px] font-mono text-body hover:text-accent border border-line cursor-pointer"
            >
              Clear A
            </button>
          )}
          <button
            onClick={() => zoomBy(1 / 1.4)}
            data-testid="btn-scope-zoom-in"
            aria-label="Zoom in on the time axis"
            className="px-2 py-0.5 rounded text-[11px] font-mono text-body hover:text-accent border border-line cursor-pointer"
          >
            Zoom +
          </button>
          <button
            onClick={() => zoomBy(1.4)}
            data-testid="btn-scope-zoom-out"
            aria-label="Zoom out on the time axis"
            className="px-2 py-0.5 rounded text-[11px] font-mono text-body hover:text-accent border border-line cursor-pointer"
          >
            Zoom −
          </button>
          <button
            onClick={() => {
              setTimeWindow(null);
              setCursorT(null);
            }}
            data-testid="btn-scope-zoom-reset"
            title="Fit the whole trace again"
            className="px-2 py-0.5 rounded text-[11px] font-mono text-body hover:text-accent border border-line cursor-pointer"
          >
            Fit
          </button>
          <button
            onClick={() => setAsTable((open) => !open)}
            aria-expanded={asTable}
            data-testid="btn-scope-table"
            className="px-2 py-0.5 rounded text-[11px] font-mono text-body hover:text-accent border border-line cursor-pointer"
          >
            {asTable ? 'Show plot' : 'Show as table'}
          </button>
        </div>
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
            tabIndex={0}
            className="w-full h-[200px] rounded-lg cursor-crosshair focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            style={{ backgroundColor: 'var(--plot)', touchAction: 'none' }}
            role="img"
            aria-label={
              bounds
                ? `${allSeries.length} traced signal${
                    allSeries.length === 1 ? '' : 's'
                  } from ${formatScopeNumber(bounds.tMin)} to ${formatScopeNumber(
                    bounds.tMax
                  )}, values between ${formatScopeNumber(bounds.yMin)} and ${formatScopeNumber(
                    bounds.yMax
                  )}. Wheel or the Zoom buttons change the time axis; the arrow keys move a cursor that reads every trace. Use "Show as table" for the numbers.`
                : 'No traced signal yet.'
            }
            onPointerMove={(event) => {
              if (dragRef.current && view && extent) {
                const canvas = canvasRef.current;
                const plotWidth = canvas ? canvas.getBoundingClientRect().width - 56 : 0;
                if (plotWidth > 0) {
                  const dx = event.clientX - dragRef.current.clientX;
                  setTimeWindow(
                    panWindow(dragRef.current.view, extent, -dx / plotWidth)
                  );
                }
                return;
              }
              const t = pointToTime(event.clientX);
              if (t !== null) setCursorT(t);
            }}
            onPointerDown={(event) => {
              if (!view) return;
              dragRef.current = { clientX: event.clientX, view };
              event.currentTarget.setPointerCapture?.(event.pointerId);
            }}
            onPointerUp={() => {
              dragRef.current = null;
            }}
            onPointerLeave={() => {
              dragRef.current = null;
              setCursorT(null);
            }}
            onKeyDown={onKeyDown}
          />
          <div
            data-testid="scope-cursor-readout"
            aria-live="polite"
            className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-mono"
          >
            {cursorT === null ? (
              <span className="text-faint">
                Move over the plot (or focus it and use ← →) to read every trace at one t.
              </span>
            ) : (
              <>
                <span data-testid="scope-cursor-t" className="text-accent">
                  t = {formatScopeNumber(cursorT)}
                </span>
                {readings.map((reading, index) => (
                  <span key={`${reading.name}-${index}`} data-testid={`scope-cursor-value-${index}`}>
                    <span className="text-muted">{label(reading.name, index)}</span>{' '}
                    <span className="text-ink">
                      {reading.value === null ? '—' : formatScopeNumber(reading.value)}
                    </span>
                  </span>
                ))}
              </>
            )}
          </div>
          <ul data-testid="scope-legend" className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
            {/* The pinned run gets its own rows, dashed: a legend that named only B would leave the
                comparison's other half unlabelled, which is the one thing an overlay must not do. */}
            {(overlay ? (pinned ?? []) : []).map((one, index) => (
              <li
                key={`a-${one.name}-${index}`}
                data-testid={`scope-series-pinned-${index}`}
                className="flex items-center gap-1.5 font-mono opacity-80"
              >
                <span
                  aria-hidden="true"
                  className="inline-block w-2.5 h-2.5 rounded-sm border border-dashed"
                  style={{ borderColor: `var(${SCOPE_TOKENS[index % SCOPE_TOKENS.length]})` }}
                />
                <span className="text-body">{one.name} (A)</span>
                <span className="text-ink">
                  {scopeLast(one) === null ? '—' : formatScopeNumber(scopeLast(one) as number)}
                </span>
              </li>
            ))}
            {series.map((one, index) => (
              <li
                key={`b-${one.name}-${index}`}
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
                <span className="text-body">{overlay ? `${one.name} (B)` : one.name}</span>
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
