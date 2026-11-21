import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ExternalLink, Loader2, Play, ShieldCheck, WifiOff } from 'lucide-react';
import { safeExternalUrl, type ResolvedPresentation } from './resolver';
import {
  loadResourceSnapshot,
  type LessonResource,
  type ResourceSnapshot,
  type SnapshotBlock,
} from './registry';

const FRAME_TIMEOUT_MS = 12_000;

type FrameState = 'idle' | 'loading' | 'loaded' | 'timeout' | 'offline';

function OpenOriginal({
  href,
  label = 'Open original',
}: {
  href: string;
  label?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      data-testid="resource-open-original"
      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line-soft bg-canvas px-3 font-mono text-[12px] text-accent underline-offset-2 hover:border-accent/60 hover:underline"
    >
      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </a>
  );
}

function FrameStatus({ state, href }: { state: FrameState; href: string }) {
  if (state === 'offline') {
    return (
      <div
        role="status"
        data-testid="resource-offline"
        className="flex items-start gap-2 rounded-lg border border-amber/40 bg-amber/10 px-3 py-2 text-[12.5px] leading-snug text-body"
      >
        <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" aria-hidden="true" />
        <span>
          This resource needs an internet connection. The lesson and its reading guide still work
          offline. <OpenOriginal href={href} label="Try the original" />
        </span>
      </div>
    );
  }
  if (state === 'timeout') {
    return (
      <div
        role="status"
        data-testid="resource-frame-timeout"
        className="flex items-start gap-2 rounded-lg border border-line-soft bg-canvas px-3 py-2 text-[12.5px] leading-snug text-muted"
      >
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" aria-hidden="true" />
        <span>
          Having trouble loading this resource? Open the original website. The provider may be slow,
          may be refusing automated traffic, or may not allow its page in a frame.
        </span>
      </div>
    );
  }
  if (state === 'loading') {
    return (
      <p
        role="status"
        data-testid="resource-frame-loading"
        className="flex items-center gap-1.5 px-1 font-mono text-[11.5px] text-muted"
      >
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> Loading the resource…
      </p>
    );
  }
  if (state === 'loaded') {
    return (
      <p
        className="flex items-center gap-1.5 px-1 font-mono text-[10.5px] text-faint"
        data-testid="resource-frame-loaded"
      >
        <ShieldCheck className="h-3 w-3" aria-hidden="true" />
        Loaded in a sandboxed frame. External content is not cached by MechaLab.
      </p>
    );
  }
  return null;
}

function IframeSurface({
  url,
  title,
  sandbox,
  allow,
  credentialless,
}: {
  url: string;
  title: string;
  sandbox: string;
  allow: string;
  credentialless: boolean;
}) {
  const [state, setState] = useState<FrameState>(() =>
    typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'loading'
  );
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setState('offline');
      return;
    }
    setState('loading');
    const frame = frameRef.current;
    if (frame) {
      // React does not write the `credentialless` content attribute, and the request it governs is
      // started the moment `src` exists. Set the attribute first, then give the frame its URL: a
      // COEP page otherwise receives `ERR_BLOCKED_BY_RESPONSE` from a provider with no CORP.
      if (credentialless) frame.setAttribute('credentialless', '');
      else frame.removeAttribute('credentialless');
      frame.src = url;
    }
    const timer = window.setTimeout(() => {
      // Only a frame that is still waiting may time out. An offline notice stays on screen until
      // the browser comes back online, even if the 12 seconds elapse first.
      setState((current) => (current === 'loading' ? 'timeout' : current));
    }, FRAME_TIMEOUT_MS);
    const offline = () => setState('offline');
    const online = () => {
      // Re-asking for the URL is the one way to be sure a frame that was refused while the network
      // was down gets a fresh request instead of keeping its error document.
      if (frameRef.current) frameRef.current.src = url;
      setState('loading');
    };
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
    };
  }, [url, credentialless]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2" data-testid="resource-frame-surface">
      <FrameStatus state={state} href={url} />
      {state !== 'offline' && (
        <div className="relative min-h-[320px] flex-1 overflow-hidden rounded-lg border border-line-soft bg-white">
          {/* The frame is mounted once for this URL. Resizing, expanding and switching the mobile
              pane are CSS changes on ancestors, so the interactive page keeps its state. */}
          <iframe
            ref={frameRef}
            title={title}
            sandbox={sandbox}
            {...(allow ? { allow } : {})}
            referrerPolicy="no-referrer"
            loading="lazy"
            data-testid="resource-frame"
            data-credentialless={credentialless ? 'true' : 'false'}
            onLoad={() => {
              if (frameRef.current?.getAttribute('src') === url) setState('loaded');
            }}
            className="h-full min-h-[320px] w-full border-0 bg-white"
          />
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[10.5px] leading-snug text-faint">
          {credentialless
            ? 'Credentialless frame: no cookies or shared storage; MechaLab stays cross-origin isolated.'
            : 'Sandboxed frame with the provider’s reviewed permissions.'}
        </p>
        <OpenOriginal href={url} />
      </div>
    </div>
  );
}

type ReaderState =
  | { status: 'loading' }
  | { status: 'ready'; snapshot: ResourceSnapshot }
  | { status: 'error'; message: string };

function SnapshotBlockView({ block }: { block: SnapshotBlock }) {
  if (block.kind === 'heading') {
    // The page's h1 is already the reader title; keep the document outline below it.
    const level = Math.min(5, block.level + 1);
    const Heading = `h${level}` as 'h2' | 'h3' | 'h4' | 'h5';
    return (
      <Heading className="mt-5 break-words text-[15px] font-semibold leading-snug text-ink first:mt-0">
        {block.text}
      </Heading>
    );
  }
  if (block.kind === 'paragraph') {
    return <p className="mt-2 break-words text-[13px] leading-relaxed text-body">{block.text}</p>;
  }
  if (block.kind === 'list') {
    const List: 'ol' | 'ul' = block.ordered ? 'ol' : 'ul';
    return (
      <List className={`mt-2 break-words space-y-1 pl-5 text-[13px] leading-relaxed text-body ${block.ordered ? 'list-decimal' : 'list-disc'}`}>
        {block.items.map((item, index) => (
          <li key={`${index}-${item.slice(0, 24)}`}>{item}</li>
        ))}
      </List>
    );
  }
  if (block.kind === 'code') {
    return (
      <pre className="mt-2 overflow-x-auto rounded-lg border border-line-soft bg-canvas p-3 font-mono text-[11.5px] leading-relaxed text-ink">
        <code>{block.text}</code>
      </pre>
    );
  }
  return (
    <blockquote className="mt-2 break-words border-l-2 border-accent/50 pl-3 text-[13px] italic leading-relaxed text-muted">
      {block.text}
    </blockquote>
  );
}

export function ReaderSurface({
  resource,
  snapshotPath,
  fallbackUrl,
}: {
  resource: LessonResource;
  snapshotPath: string;
  fallbackUrl: string;
}) {
  const [state, setState] = useState<ReaderState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    loadResourceSnapshot(snapshotPath)
      .then((snapshot) => {
        if (!cancelled) setState({ status: 'ready', snapshot });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : 'the snapshot could not be loaded',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [snapshotPath, attempt]);

  if (state.status === 'loading') {
    return (
      <div
        data-testid="resource-reader-loading"
        className="flex min-h-[260px] items-center justify-center gap-2 rounded-lg border border-line-soft bg-canvas p-5 text-[12.5px] text-muted"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" aria-hidden="true" />
        Loading the text snapshot…
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div
        role="alert"
        data-testid="resource-reader-error"
        className="flex min-h-[260px] flex-col items-center justify-center gap-2 rounded-lg border border-amber/40 bg-amber/10 p-5 text-center"
      >
        <p className="text-[13px] font-semibold text-ink">The snapshot is unavailable</p>
        <p className="max-w-md text-[12px] leading-snug text-body">
          {state.message}. The original stays available; the lesson and its reading guide still work.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
            data-testid="resource-reader-retry"
            className="btn px-3 py-1.5 text-[12px]"
          >
            Try again
          </button>
          <OpenOriginal href={fallbackUrl} />
        </div>
      </div>
    );
  }

  const { snapshot } = state;
  const licenseHref = safeExternalUrl(snapshot.license.url);
  const sourceHref = safeExternalUrl(snapshot.attribution.originalUrl) ?? fallbackUrl;
  return (
    <article
      data-testid="resource-reader"
      data-snapshot-path={snapshotPath}
      aria-label={`Reader Mode: ${resource.title}`}
      className="flex min-h-[320px] flex-1 flex-col rounded-lg border border-line-soft bg-panel"
    >
      <header className="border-b border-line-soft bg-canvas px-4 py-3">
        <p className="eyebrow">Reader Mode · text snapshot</p>
        <h3 className="mt-1 break-words text-[15px] font-semibold leading-snug text-ink">
          {snapshot.title || resource.title}
        </h3>
        <p className="mt-1 text-[11.5px] leading-snug text-muted">
          {snapshot.provider} · retrieved {snapshot.retrievedAt.slice(0, 10)} ·{' '}
          <a
            href={sourceHref}
            target="_blank"
            rel="noreferrer"
            data-testid="reader-snapshot-source"
            className="text-accent underline underline-offset-2"
          >
            original page
          </a>
        </p>
        <div className="mt-2 rounded-md border border-line-soft bg-panel px-3 py-2 text-[11.5px] leading-snug text-body">
          <p data-testid="reader-snapshot-license">
            Licence:{' '}
            {licenseHref ? (
              <a
                href={licenseHref}
                target="_blank"
                rel="noreferrer"
                className="text-accent underline underline-offset-2"
              >
                {snapshot.license.id}
              </a>
            ) : (
              snapshot.license.id
            )}
            {snapshot.license.conditions.length > 0
              ? ` · ${snapshot.license.conditions.join(', ')}`
              : ''}
          </p>
          <p className="mt-1 text-muted">{snapshot.notice}</p>
          {snapshot.truncated && (
            <p className="mt-1 text-amber">This long page is shortened; open the original for the rest.</p>
          )}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3" data-testid="reader-snapshot-body">
        {snapshot.blocks.map((block, index) => (
          <SnapshotBlockView key={`${block.kind}-${index}`} block={block} />
        ))}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft bg-canvas px-4 py-2 text-[11px] leading-snug text-faint">
        <span className="min-w-0 max-w-full break-words">
          Attribution: {snapshot.attribution.publisher} ·{' '}
          <a
            href={sourceHref}
            target="_blank"
            rel="noreferrer"
            className="break-words text-accent underline underline-offset-2"
          >
            {snapshot.sourceUrl}
          </a>
        </span>
        <OpenOriginal href={fallbackUrl} />
      </footer>
    </article>
  );
}

function NativeYouTube({
  resource,
  embedUrl,
  sandbox,
  allow,
}: {
  resource: LessonResource;
  embedUrl: string;
  sandbox: string;
  allow: string;
}) {
  const [requested, setRequested] = useState(false);
  // No thumbnail request either: the facade is the app's own card until the learner presses play.
  // That is the click-to-load promise, not just a lazy iframe.
  if (!requested) {
    return (
      <div
        data-testid="resource-native-facade"
        className="flex min-h-[320px] flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-line-soft bg-canvas p-6 text-center"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full border border-accent/40 bg-accent/10 text-accent">
          <Play className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-[14px] font-semibold text-ink">{resource.title}</p>
          <p className="mt-1 max-w-md text-[12px] leading-snug text-muted">
            The official privacy-enhanced YouTube player loads only when you press play. Nothing is
            requested from YouTube before that press.
          </p>
        </div>
        <button
          type="button"
          data-testid="btn-load-video"
          onClick={() => setRequested(true)}
          className="btn btn-primary min-h-10 gap-1.5 px-4 text-[12.5px]"
        >
          <Play className="h-3.5 w-3.5" aria-hidden="true" /> Load the video
        </button>
        <OpenOriginal href={resource.url} label="Open on YouTube" />
      </div>
    );
  }
  return (
    <IframeSurface
      url={embedUrl}
      title={`${resource.title} (YouTube player)`}
      sandbox={sandbox}
      allow={allow}
      credentialless={false}
    />
  );
}

/**
 * The selected resource's presentation (`ResourceView.tsx`).
 *
 * The external card is a real result, not an error: it keeps the title, provider, attribution and
 * open action in one place. The frame path exists only after the resolver has approved the provider
 * and the build-time report is fresh; a blocked or unknown host never reaches it.
 */
export function ResourceView({
  resource,
  resolved,
}: {
  resource: LessonResource;
  resolved: ResolvedPresentation;
}) {
  if (resolved.kind === 'iframe') {
    // Firefox and Safari do not implement the `credentialless` iframe attribute. Under COEP an
    // ordinary frame to a no-CORP host is an empty box, so those browsers get the same honest card
    // as a blocked provider rather than a spinner that ends in a timeout.
    if (
      resolved.credentialless &&
      typeof HTMLIFrameElement !== 'undefined' &&
      !('credentialless' in HTMLIFrameElement.prototype)
    ) {
      return (
        <div
          data-testid="resource-external-card"
          className="flex min-h-[260px] flex-1 flex-col justify-center gap-3 rounded-lg border border-line-soft bg-canvas p-5"
        >
          <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-faint">
            External learning resource
          </p>
          <div>
            <h3 className="text-[15px] font-semibold leading-snug text-ink">{resource.title}</h3>
            <p className="mt-1 text-[12px] text-muted">{resource.provider} · {resource.role}</p>
          </div>
          <p className="max-w-xl text-[12.5px] leading-relaxed text-body">
            This browser does not support credentialless frames. Open the provider in a new tab; the
            lesson and its reading guide stay here.
          </p>
          <div>
            <OpenOriginal href={resolved.fallbackUrl} label="Open the original resource" />
          </div>
        </div>
      );
    }
    return (
      <IframeSurface
        url={resolved.url}
        title={`${resource.title} — ${resource.provider}`}
        sandbox={resolved.sandbox}
        allow={resolved.allow}
        credentialless={resolved.credentialless}
      />
    );
  }
  if (resolved.kind === 'native-embed') {
    return (
      <NativeYouTube
        resource={resource}
        embedUrl={resolved.embedUrl}
        sandbox={resolved.sandbox}
        allow={resolved.allow}
      />
    );
  }
  if (resolved.kind === 'external') {
    return (
      <div
        data-testid="resource-external-card"
        className="flex min-h-[260px] flex-1 flex-col justify-center gap-3 rounded-lg border border-line-soft bg-canvas p-5"
      >
        <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-faint">
          External learning resource
        </p>
        <div>
          <h3 className="text-[15px] font-semibold leading-snug text-ink">{resource.title}</h3>
          <p className="mt-1 text-[12px] text-muted">
            {resource.provider} · {resource.resourceKind} · {resource.role}
          </p>
        </div>
        <p className="max-w-xl text-[12.5px] leading-relaxed text-body">{resolved.reason}</p>
        <div>
          <OpenOriginal href={resolved.url} label="Open the original resource" />
        </div>
        <p className="text-[11px] leading-snug text-faint">
          MechaLab does not copy or rehost this page. The authored reading guide stays here when you
          come back.
        </p>
      </div>
    );
  }
  if (resolved.kind === 'reader') {
    return (
      <ReaderSurface
        resource={resource}
        snapshotPath={resolved.snapshotPath}
        fallbackUrl={resolved.fallbackUrl}
      />
    );
  }
  if (resolved.kind === 'internal') {
    return (
      <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-lg border border-line-soft bg-canvas p-5 text-center">
        <p className="text-[13px] font-semibold text-ink">This link stays in MechaLab</p>
        <p className="text-[12px] text-muted">{resolved.reason}</p>
        <a
          href={resolved.url}
          data-testid="resource-open-original"
          className="font-mono text-[12px] text-accent underline underline-offset-2"
        >
          Open lesson {resolved.lessonId}
        </a>
      </div>
    );
  }
  return (
    <div
      data-testid="resource-unavailable"
      className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-lg border border-amber/40 bg-amber/10 p-5 text-center"
    >
      <AlertTriangle className="h-4 w-4 text-amber" aria-hidden="true" />
      <p className="text-[13px] font-semibold text-ink">Cannot open here</p>
      <p className="max-w-md text-[12px] leading-snug text-body">{resolved.reason}</p>
    </div>
  );
}
