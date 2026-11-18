import React, { useEffect, useRef, useState } from 'react';
import { APP_VERSION } from './appVersion';

/**
 * The entry module a document loads, read from its HTML.
 *
 * A deploy changes Vite's hashed entry (`assets/index-<hash>.js`); comparing that one URL is enough
 * to tell a running tab that a newer build is waiting, without downloading or parsing the bundle.
 * The attribute order is Vite's today, but a tag is matched by its `type`, not by position, so the
 * check keeps working if `crossorigin` moves.
 */
export function entryModuleFromHtml(html: string): string | null {
  const tag = /<script\b[^>]*\btype=["']module["'][^>]*>/i.exec(html)?.[0];
  return tag ? (/\bsrc=["']([^"']+)["']/i.exec(tag)?.[1] ?? null) : null;
}

/** The entry this document is already running. */
function runningEntry(): string | null {
  return document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src ?? null;
}

/** One index fetch, resolved against the page's base. Null when offline or blocked. */
async function servedEntry(): Promise<string | null> {
  const index = new URL(import.meta.env.BASE_URL, window.location.origin);
  // A different query is a different cache key for the service worker and the browser; the shell is
  // network-first, but this also keeps a stale asset cache out of the comparison.
  index.searchParams.set('build-check', String(Date.now()));
  try {
    const response = await fetch(index, { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) return null;
    const src = entryModuleFromHtml(await response.text());
    return src ? new URL(src, index).href : null;
  } catch {
    return null;
  }
}

const CHECK_MS = 60_000;

/**
 * A deploy is not visible to a tab that never asks for the document again.
 *
 * GitHub Pages serves the shell with `max-age=600`, and an already-open tab keeps its in-memory
 * bundle indefinitely; the footer names the build, but until this notice there was nothing that
 * told a learner the name was old. This checks the served index once at mount, when the tab becomes
 * visible again, and once a minute while it is visible. It never reloads by itself: the editor may
 * hold unsaved work, so the learner chooses when to take the new build.
 */
export const UpdateNotice: React.FC = () => {
  const [available, setAvailable] = useState<string | null>(null);
  const dismissed = useRef<string | null>(null);

  useEffect(() => {
    // In dev the index points at `/src/main.tsx` for every reload, so there is no build identity to
    // compare. The notice is a production-only concern.
    if (import.meta.env.DEV || typeof window === 'undefined') return;
    let stopped = false;
    let inFlight = false;

    const check = async () => {
      if (stopped || inFlight || document.visibilityState !== 'visible' || !navigator.onLine) return;
      inFlight = true;
      try {
        const served = await servedEntry();
        if (stopped || !served || served === dismissed.current) return;
        const running = runningEntry();
        if (running && served !== running) setAvailable(served);
      } finally {
        inFlight = false;
      }
    };

    void check();
    const timer = window.setInterval(() => void check(), CHECK_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);

  if (!available) return null;
  return (
    <div
      data-testid="update-notice"
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 bottom-3 z-[70] mx-auto flex max-w-xl flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line-soft bg-canvas px-3.5 py-2.5 text-[12.5px] text-ink shadow-lg sm:bottom-5 sm:flex-nowrap"
    >
      <p className="min-w-0 flex-1">
        <span className="font-medium">A newer MechaLab build is ready.</span>{' '}
        <span className="text-muted">
          You are running {APP_VERSION}; reload to pick up the latest.
        </span>
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          data-testid="update-reload"
          onClick={() => window.location.reload()}
          className="rounded border border-line bg-canvas px-2.5 py-1 font-medium text-ink hover:bg-line-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Reload
        </button>
        <button
          type="button"
          data-testid="update-dismiss"
          onClick={() => {
            dismissed.current = available;
            setAvailable(null);
          }}
          className="rounded px-1.5 py-1 text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Later
        </button>
      </div>
    </div>
  );
};
