import React, { Suspense, useEffect, useState } from 'react';
import { BookOpen, Loader2, PanelsTopLeft, X } from 'lucide-react';
import { InlineMarkdown as Inline } from '../../components/InlineMarkdown';
import { Sheet } from '../../components/Sheet';
import {
  loadLearningResources,
  type LessonResource,
} from './registry';
import { readerRightsFor, resolveResource } from './resolver';
import { LESSON_ID_BY_PATH } from './lessonPaths';

// The reader surface lives in the lazy workspace chunk; importing it statically would put the frame
// and snapshot renderer in the initial bundle. A direct Reader action loads it only when pressed.
const LazyReaderSurface = React.lazy(() =>
  import('./ResourceView').then((module) => ({ default: module.ReaderSurface }))
);

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; resources: LessonResource[]; sourcePath: string }
  | { status: 'error'; message: string };

function GuideLine({ label, text }: { label: string; text: string }) {
  if (!text) return null;
  return (
    <div className="mt-2">
      <p className="font-mono text-[10.5px] uppercase tracking-wider text-faint">{label}</p>
      <p className="mt-0.5 text-[12.5px] leading-snug text-body">
        <Inline text={text} />
      </p>
    </div>
  );
}

function ResourceCard({
  resource,
  sourcePath,
  resources,
  onOpenWorkspace,
  onOpenReader,
}: {
  resource: LessonResource;
  sourcePath: string;
  resources: LessonResource[];
  onOpenWorkspace?: (resource: LessonResource, resources: LessonResource[], sourcePath: string) => void;
  onOpenReader?: (resource: LessonResource) => void;
}) {
  const resolved = resolveResource(resource, { sourcePath, lessonByPath: LESSON_ID_BY_PATH });
  const readerAvailable = Boolean(readerRightsFor(resource) && resource.snapshot?.path);
  const idea =
    resource.idea.number === null ? resource.idea.title : `Idea ${resource.idea.number} · ${resource.idea.title}`;
  return (
    <li
      data-testid="resource-card"
      data-resource-id={resource.id}
      className="rounded-lg border border-line-soft bg-panel px-3 py-2.5"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded border px-1.5 py-0.5 font-mono text-[10.5px] uppercase tracking-wide ${
            resource.role === 'primary'
              ? 'border-accent/40 bg-accent/10 text-accent'
              : 'border-line bg-canvas text-muted'
          }`}
        >
          {resource.role}
        </span>
        <span className="min-w-0 text-[11px] text-faint">
          <Inline text={idea} />
        </span>
        <span className="ml-auto shrink-0 font-mono text-[10.5px] text-faint">{resource.provider}</span>
      </div>
      <p className="mt-1 text-[13px] font-medium leading-snug text-ink">{resource.title}</p>
      <div className="mt-1">
        <GuideLine label="Read / complete" text={resource.guide.read} />
        <GuideLine label="Skip" text={resource.guide.skip} />
        <GuideLine label="Key takeaway" text={resource.guide.takeaway} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {resolved.kind !== 'unavailable' ? (
          <a
            href={resolved.url}
            {...(resolved.kind === 'external' ? { target: '_blank', rel: 'noreferrer' } : {})}
            data-testid="resource-open"
            data-resource-kind={resolved.kind}
            aria-label={
              resolved.kind === 'external'
                ? `Open ${resource.title} in a new tab`
                : `Open lesson ${resolved.lessonId} in MechaLab`
            }
            title={resolved.kind === 'external' ? resolved.url : undefined}
            className="inline-flex items-center gap-1 font-mono text-[12px] text-accent underline underline-offset-2 hover:text-accent-strong"
          >
            {resolved.kind === 'external' ? 'Open resource' : `Open lesson ${resolved.lessonId}`}{' '}
            <span aria-hidden="true">{resolved.kind === 'external' ? '↗' : '→'}</span>
          </a>
        ) : (
          <p data-testid="resource-unavailable" className="font-mono text-[12px] leading-snug text-amber">
            Cannot open here. {resolved.reason}
          </p>
        )}
        {onOpenReader && readerAvailable && resource.snapshot?.path && (
          <button
            type="button"
            onClick={() => onOpenReader(resource)}
            data-testid="btn-resource-reader"
            data-resource-id={resource.id}
            title="Read the licence-cleared text snapshot here"
            className="inline-flex min-h-7 items-center gap-1 rounded border border-accent/40 bg-accent/10 px-2 font-mono text-[11px] text-accent hover:border-accent/70"
          >
            <BookOpen className="h-3 w-3" aria-hidden="true" /> Reader
          </button>
        )}
        {onOpenWorkspace && (
          <button
            type="button"
            onClick={() => onOpenWorkspace(resource, resources, sourcePath)}
            data-testid="btn-resource-workspace"
            title="Open this resource in the split learning workspace"
            className="inline-flex min-h-7 items-center gap-1 rounded border border-line-soft bg-canvas px-2 font-mono text-[11px] text-muted hover:border-accent/60 hover:text-accent"
          >
            <PanelsTopLeft className="h-3 w-3" aria-hidden="true" /> Study here
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * The authored guides for one lesson (`app/src/features/learning-resources/ResourceGuides.tsx`).
 *
 * It is the panel opened by the reader's Resources button; Study here hands one card to the split
 * workspace, while the lesson itself stays where it is. A licence-cleared card's direct Reader
 * action opens the same text surface in a sheet, without the workspace, and keeps the external
 * link. External resources open in a new tab; a local link to another lesson uses that lesson's
 * `?lesson=` route. The isolation policy is unchanged, and the authored guide stays visible even when
 * a local file cannot be opened from the app.
 */
export function ResourceGuides({
  lessonId,
  onClose,
  onOpenWorkspace,
}: {
  lessonId: string;
  onClose: () => void;
  onOpenWorkspace?: (resource: LessonResource, resources: LessonResource[], sourcePath: string) => void;
}) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [readerResource, setReaderResource] = useState<LessonResource | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    loadLearningResources()
      .then((registry) => {
        if (cancelled) return;
        const group = registry.lessons[lessonId];
        setState({
          status: 'ready',
          resources: group?.resources ?? [],
          sourcePath: group?.path ?? '',
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'the resource guides could not be loaded',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [lessonId, attempt]);

  return (
    <section
      id="resource-guide-panel"
      data-testid="resource-guide-panel"
      aria-label="Learning resources"
      className="border-b border-line-soft bg-canvas"
    >
      <div className="flex items-start justify-between gap-2 px-3 py-2.5">
        <div className="flex min-w-0 items-start gap-2">
          <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
          <div className="min-w-0">
            <p className="eyebrow">Learning resources</p>
            <p className="mt-0.5 text-[12px] leading-snug text-muted">
              Authored guides for this lesson. Licence-cleared sources can open as an attributed text
              snapshot from the card or in the workspace; every other resource opens in a new tab.
              MechaLab does not rehost unlicensed content.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          data-testid="btn-resources-close"
          aria-label="Close learning resources"
          title="Close learning resources"
          className="shrink-0 rounded border border-line-soft bg-panel p-1 text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      <div className="max-h-[min(55vh,32rem)] overflow-y-auto px-3 pb-3">
        {state.status === 'loading' && (
          <p role="status" className="flex items-center gap-1.5 py-2 font-mono text-[12px] text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Loading resource guides…
          </p>
        )}
        {state.status === 'error' && (
          <div className="space-y-2 py-1.5 text-[12.5px] text-body">
            <p className="font-mono text-[12px] text-amber">Resource guides unavailable</p>
            <p>{state.message}</p>
            <button
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
              data-testid="btn-resources-retry"
              className="btn px-2.5 py-1 text-[12.5px]"
            >
              Try again
            </button>
          </div>
        )}
        {state.status === 'ready' && state.resources.length === 0 && (
          <p className="py-2 text-[12.5px] text-muted">No authored resource guides for this lesson.</p>
        )}
        {state.status === 'ready' && state.resources.length > 0 && (
          <ol className="space-y-2">
            {state.resources.map((resource) => (
              <ResourceCard
                key={resource.id}
                resource={resource}
                resources={state.resources}
                sourcePath={state.sourcePath}
                onOpenWorkspace={onOpenWorkspace}
                onOpenReader={setReaderResource}
              />
            ))}
          </ol>
        )}
      </div>

      <Sheet
        open={readerResource !== null}
        onClose={() => setReaderResource(null)}
        title={readerResource ? `Reader Mode — ${readerResource.title}` : 'Reader Mode'}
        testId="resource-reader-sheet"
        size="lg"
        titleLines={2}
      >
        {readerResource && readerResource.snapshot?.path && (
          <div className="p-3">
            <Suspense
              fallback={
                <p role="status" className="flex items-center gap-1.5 p-3 font-mono text-[12px] text-muted">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" aria-hidden="true" />
                  Loading the text snapshot…
                </p>
              }
            >
              <LazyReaderSurface
                resource={readerResource}
                snapshotPath={readerResource.snapshot.path}
                fallbackUrl={readerResource.url}
              />
            </Suspense>
          </div>
        )}
      </Sheet>
    </section>
  );
}
