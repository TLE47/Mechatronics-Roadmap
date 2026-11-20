import React, { useEffect, useState } from 'react';
import { BookOpen, Loader2, X } from 'lucide-react';
import { InlineMarkdown as Inline } from '../../components/InlineMarkdown';
import { PYTHON_LESSONS } from '../../data/pythonLessonsData';
import {
  loadLearningResources,
  type LessonResource,
} from './registry';
import { resolveResource } from './resolver';

// The authoritative path map: a relative Markdown link is only a lesson if this build actually
// lists that page. Building it once keeps the resolver pure and testable without the lesson dataset.
const LESSON_ID_BY_PATH = new Map<string, string>();
for (const lesson of PYTHON_LESSONS) {
  for (const path of [lesson.path, lesson.readerPath]) {
    if (path) LESSON_ID_BY_PATH.set(path, lesson.id);
  }
}

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

function ResourceCard({ resource, sourcePath }: { resource: LessonResource; sourcePath: string }) {
  const resolved = resolveResource(resource, { sourcePath, lessonByPath: LESSON_ID_BY_PATH });
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
          className="mt-2 inline-flex items-center gap-1 font-mono text-[12px] text-accent underline underline-offset-2 hover:text-accent-strong"
        >
          {resolved.kind === 'external' ? 'Open resource' : `Open lesson ${resolved.lessonId}`}{' '}
          <span aria-hidden="true">{resolved.kind === 'external' ? '↗' : '→'}</span>
        </a>
      ) : (
        <p data-testid="resource-unavailable" className="mt-2 font-mono text-[12px] leading-snug text-amber">
          Cannot open here. {resolved.reason}
        </p>
      )}
    </li>
  );
}

/**
 * The authored guides for one lesson (`app/src/features/learning-resources/ResourceGuides.tsx`).
 *
 * It is a panel inside the reader, not a second page and not a split view: the lesson stays where it
 * is. External resources open in a new tab; a local link to another lesson uses that lesson's
 * `?lesson=` route. The isolation policy is unchanged, and the authored guide stays visible even
 * when a local file cannot be opened from the app.
 */
export function ResourceGuides({ lessonId, onClose }: { lessonId: string; onClose: () => void }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

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
              Authored guides for this lesson. External resources open in a new tab; lesson links stay
              in MechaLab. MechaLab does not copy or host external content.
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
              <ResourceCard key={resource.id} resource={resource} sourcePath={state.sourcePath} />
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
