import React from 'react';
import { Terminal } from 'lucide-react';
import { offlineReportLine, type OfflineCacheReport } from '../../../offlineTakeAlong';

/**
 * The runtime strip (`runner/RunnerRuntimeStrip.tsx`).
 *
 * The three numbers that move, the interpreter, and one line about what this screen is. It sits
 * above every preset, so a learner can reach the editor a screen sooner than the old long
 * explanation allowed. Nothing here decides anything: the tab hands it the run's state and the
 * offline control's, and it prints them.
 */
export function RunnerRuntimeStrip({
  pyodideStatus,
  runtimeBoot,
  readyMs,
  verifiedCount,
  completedCount,
  lessonCount,
  offline,
  onTakeOffline,
}: {
  pyodideStatus: 'idle' | 'loading' | 'ready' | 'error';
  runtimeBoot: string | null;
  readyMs: number | null;
  verifiedCount: number;
  completedCount: number;
  lessonCount: number;
  offline: { state: string; report: OfflineCacheReport | null };
  onTakeOffline: () => void;
}) {
  return (
    <div
      className="rounded-[var(--r-md)] border"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--panel)' }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--r-sm)] border"
            style={{
              borderColor: 'var(--border)',
              color: 'var(--emerald)',
              backgroundColor: 'var(--bg)',
            }}
            aria-hidden="true"
          >
            <Terminal className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p
              className="flex flex-wrap items-center gap-2 text-[12.5px] font-semibold"
              style={{ color: 'var(--text)' }}
            >
              <span>Python 3.12 in an isolated Web Worker</span>
              <span
                data-testid="runner-runtime-status"
                data-runtime-status={pyodideStatus}
                data-runtime-boot={runtimeBoot ?? undefined}
                className="chip"
                style={{ color: pyodideStatus === 'error' ? 'var(--rose)' : 'var(--accent)' }}
              >
                {pyodideStatus === 'ready'
                  ? readyMs !== null
                    ? `Python ready in ${(readyMs / 1000).toFixed(1)} s`
                    : 'Python ready (Worker WASM)'
                  : pyodideStatus === 'loading'
                    ? 'Loading WASM...'
                    : pyodideStatus === 'error'
                      ? 'WASM Load Error'
                      : // The worker exists and the warm-up is in flight; say so, because "Ready"
                        // here would claim a runtime that has not finished downloading.
                        'Warming Python (once, ~10 MB)…'}
              </span>
            </p>
            <p className="mt-0.5 hidden text-[12px] sm:block" style={{ color: 'var(--dim)' }}>
              {lessonCount} entries · starter code, three hints, behavioural tests
            </p>
          </div>
        </div>

        {/* On a phone the three counters are a second screen of chrome before the lesson. The
            status chip above already says whether Python is ready; the counts are here when there
            is room for them. */}
        <div className="hidden items-center gap-3 font-mono tabular-nums md:flex">
          <div className="text-right">
            <div className="text-[12px]" style={{ color: 'var(--dim)' }}>
              Executed &amp; Passed (WASM)
            </div>
            <div
              className="text-[13px] font-bold"
              data-testid="runner-verified-count"
              style={{ color: 'var(--emerald)' }}
            >
              {`${verifiedCount} / ${lessonCount} Verified`}
            </div>
          </div>
          <div className="h-8 w-px" style={{ backgroundColor: 'var(--border)' }} />
          <div className="text-right">
            <div className="text-[12px]" style={{ color: 'var(--dim)' }}>
              Self-Marked
            </div>
            <div
              className="text-[13px] font-bold"
              data-testid="runner-self-marked-count"
              style={{ color: 'var(--muted)' }}
            >
              {`${completedCount} / ${lessonCount} Marked`}
            </div>
          </div>
          <div className="h-8 w-px" style={{ backgroundColor: 'var(--border)' }} />
          {/* Take this step offline. The size is on the button because "ready offline" without a
              number is a claim; the state is on a data attribute so the browser suite reads the
              same thing a learner does. */}
          <div className="text-right">
            <div className="text-[12px]" style={{ color: 'var(--dim)' }}>
              Offline
            </div>
            <button
              onClick={onTakeOffline}
              data-testid="btn-offline-takealong"
              data-offline-state={offline.state}
              disabled={offline.state === 'working'}
              title={
                offline.state === 'unsupported'
                  ? 'This host sends its own isolation headers (dev server or preview), so it has no service worker to cache with - the built site on Pages does.'
                  : offline.state === 'ready'
                    ? 'The page, its bundle and Python are cached: this step opens and runs with the network off'
                    : 'Cache this page, its bundle and the Python runtime, then report how much that took'
              }
              className="mt-0.5 px-2 py-0.5 rounded text-[12.5px] font-mono border cursor-pointer disabled:cursor-wait"
              style={{
                color:
                  offline.state === 'ready'
                    ? 'var(--emerald)'
                    : offline.state === 'unsupported'
                      ? 'var(--dim)'
                      : 'var(--accent)',
                borderColor: 'var(--border)',
                backgroundColor: 'var(--bg)',
              }}
            >
              {offline.state === 'working'
                ? 'Caching… Python is loading'
                : offline.state === 'unsupported'
                  ? 'Offline: built site only'
                  : offline.state === 'ready'
                    ? `Offline ready · ${offline.report ? offlineReportLine(offline.report) : 'checking'}`
                    : offline.state === 'partial'
                      ? `Take Python offline · ${offline.report ? offlineReportLine(offline.report) : ''}`
                      : 'Take this step offline'}
            </button>
            {offline.state === 'partial' && (
              <div
                data-testid="offline-partial-note"
                className="text-[10px] font-mono"
                style={{ color: 'var(--amber)' }}
              >
                the shell is cached; press again for Python
              </div>
            )}
          </div>
        </div>
      </div>

      {/* One thin bar for the one number a learner is trying to move. */}
      <div
        className="h-1 w-full overflow-hidden rounded-b-[var(--r-md)]"
        style={{ backgroundColor: 'var(--border-soft)' }}
      >
        <div
          className="h-full transition-[width] duration-500"
          style={{
            width: `${lessonCount ? Math.round((verifiedCount / lessonCount) * 100) : 0}%`,
            background: 'linear-gradient(90deg, var(--accent), var(--emerald))',
          }}
        />
      </div>
    </div>
  );
}
