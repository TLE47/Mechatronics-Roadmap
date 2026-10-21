/**
 * "Take this step offline": the page half of the warm button.
 *
 * The service worker already caches the shell on install, every asset as it is requested, and the
 * interpreter as a run loads it - so a learner who has used the workbench is offline-ready by
 * accident. This is the deliberate version: one press caches the URLs this document is actually
 * running, waits for the Python runtime to finish loading (its CDN files are in the worker's scope,
 * so they land in the same cache), and then measures what the caches now hold. The number is the
 * point: "ready offline" without a size is a claim, and a learner about to board wants to know
 * whether it is 2 MB or 25 MB.
 *
 * Nothing here invents a build manifest. The hashed bundle names change every deploy, so the page
 * reads its own `<script>`/`<link>` tags and sends those - the one list that cannot go stale.
 */

export interface OfflineCacheReport {
  entries: number;
  bytes: number;
  /** How many of the entries are the interpreter's own; zero means Python would still need the network. */
  runtimeFiles: number;
}

/** Every cache this app owns; the worker's names all start with `mechalab-`. */
export const OFFLINE_CACHE_PREFIX = 'mechalab-';

/** Link tags worth taking along: the stylesheet, the manifest and the module preloads. */
const WANTED_RELS = ['stylesheet', 'manifest', 'modulepreload', 'preload', 'icon'];

function isSameOrigin(url: URL, base: URL): boolean {
  return url.origin === base.origin;
}

/**
 * The URLs this document is running from, for the worker to cache.
 *
 * Document, script and stylesheet first: those are what an offline reload needs to paint. Anything
 * cross-origin is dropped here rather than in the worker, because the button has no business sending
 * a CDN URL it cannot cache with the isolation headers this origin needs.
 */
export function assetUrlsFromDocument(doc: Document = document): string[] {
  const base = new URL(doc.baseURI);
  const urls: string[] = [];
  const push = (value: string | null) => {
    if (!value) return;
    try {
      const url = new URL(value, base);
      if (!isSameOrigin(url, base)) return;
      url.hash = '';
      if (!urls.includes(url.href)) urls.push(url.href);
    } catch {
      // A malformed href is not worth a failed warm.
    }
  };
  push('./');
  push('./index.html');
  push('./manifest.webmanifest');
  for (const element of Array.from(doc.querySelectorAll('script[src], link[href]'))) {
    const rel = (element.getAttribute('rel') ?? '').toLowerCase();
    const tag = (element.tagName ?? '').toLowerCase();
    if (tag === 'link' && rel && !WANTED_RELS.includes(rel)) continue;
    push(element.getAttribute('src') ?? element.getAttribute('href'));
  }
  return urls;
}

/** A cache size a person can hold in their head: `25.1 MB`, `480 kB`, `12 B`. */
export function formatTakeAlongSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} kB`;
  return `${Math.round(bytes)} B`;
}

/** True on a host where the worker is registered and controlling this page. */
export function offlineWarmSupported(): boolean {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
  return Boolean(navigator.serviceWorker.controller);
}

/** What the worker's own warm covers: the page and its bundle, not the interpreter. */
export interface ShellWarmReport {
  entries: number;
  bytes: number;
}

/**
 * Ask the worker to cache `urls`, and wait for its measured answer.
 *
 * `null` means there was no worker to ask (the dev server and any host that sends the isolation
 * headers itself), or the worker did not answer in time - both are reported as "not available on
 * this host", never as success.
 */
export function warmWithServiceWorker(
  urls: string[],
  timeoutMs = 90_000
): Promise<ShellWarmReport | null> {
  if (!offlineWarmSupported()) return Promise.resolve(null);
  const controller = navigator.serviceWorker.controller;
  if (!controller) return Promise.resolve(null);
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.onmessage = null;
      resolve(null);
    }, timeoutMs);
    channel.port1.onmessage = (event: MessageEvent) => {
      const data = (event.data ?? {}) as { type?: string; entries?: number; bytes?: number };
      if (data.type !== 'warm-done') return;
      clearTimeout(timer);
      resolve({ entries: Number(data.entries) || 0, bytes: Number(data.bytes) || 0 });
    };
    controller.postMessage({ type: 'warm', urls }, [channel.port2]);
  });
}

/**
 * What the app's caches hold now, in entries and bytes.
 *
 * The header is used when it is there and the blob is read when it is not: a cached response keeps
 * its `content-length` often enough to avoid re-reading 25 MB, and falls back rather than reporting
 * a wrong total.
 */
export async function cacheInventory(): Promise<OfflineCacheReport> {
  const totals: OfflineCacheReport = { entries: 0, bytes: 0, runtimeFiles: 0 };
  if (typeof caches === 'undefined') return totals;
  let names: string[] = [];
  try {
    names = (await caches.keys()).filter((name) => name.startsWith(OFFLINE_CACHE_PREFIX));
  } catch {
    return totals;
  }
  for (const name of names) {
    const cache = await caches.open(name);
    for (const request of await cache.keys()) {
      const response = await cache.match(request);
      if (!response) continue;
      totals.entries += 1;
      if (name.includes('pyodide')) totals.runtimeFiles += 1;
      const declared = Number(response.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > 0) {
        totals.bytes += declared;
        continue;
      }
      try {
        totals.bytes += (await response.clone().blob()).size;
      } catch {
        // An opaque or already-consumed body counts as an entry with no known size.
      }
    }
  }
  return totals;
}

/** One line for the button, so the state and the number are never two different stories. */
export function offlineReportLine(report: OfflineCacheReport): string {
  if (!report.entries) return 'nothing cached yet';
  const size = `${formatTakeAlongSize(report.bytes)} · ${report.entries} file${
    report.entries === 1 ? '' : 's'
  }`;
  return report.runtimeFiles > 0 ? size : `${size} · Python still needs the network`;
}
