import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, ExternalLink, Maximize2, Minimize2, X } from 'lucide-react';
import { ReadingGuide } from './ReadingGuide';
import { ResourceView } from './ResourceView';
import { readerRightsFor, resolvePresentation } from './resolver';
import type { LessonResource } from './registry';
import { LESSON_ID_BY_PATH } from './lessonPaths';

/**
 * The resource pane of the learning workspace (`ResourceWorkspace.tsx`).
 *
 * The lesson prose is the other pane; this component owns only the resource: its authored guide,
 * the renderer the resolver chose, the attribution and the way back to the guide list. It never
 * fetches a provider page itself, and it stays mounted while the surrounding layout is resized or
 * expanded — that is what keeps an interactive provider's state alive.
 */
export function ResourceWorkspace({
  lessonId,
  lessonTitle,
  resources,
  sourcePath,
  selectedId,
  onSelect,
  onClose,
  onBackToGuides,
  expanded,
  onExpandedChange,
}: {
  lessonId: string;
  lessonTitle: string;
  resources: LessonResource[];
  sourcePath: string;
  selectedId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  onBackToGuides: () => void;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const selected = resources.find((resource) => resource.id === selectedId) ?? resources[0];
  const rights = useMemo(() => (selected ? readerRightsFor(selected) : null), [selected]);
  const [readerPreferred, setReaderPreferred] = useState(false);

  useEffect(() => {
    // A reader choice belongs to the resource it was made for, not to the next one in the select.
    setReaderPreferred(false);
  }, [selected?.id]);

  const resolveFor = (preferReader: boolean) =>
    selected
      ? resolvePresentation(selected, {
          sourcePath,
          lessonByPath: LESSON_ID_BY_PATH,
          readerEnabled: true,
          ...(rights ? { readerRights: rights } : {}),
          preferReader,
        })
      : null;
  const autoResolved = useMemo(
    () => resolveFor(false),
    // `resolveFor` is a pure local closure over these values.
    [selected, sourcePath, rights]
  );
  const readerResolved = useMemo(
    () => resolveFor(true),
    [selected, sourcePath, rights]
  );
  const readerAvailable = readerResolved?.kind === 'reader';
  // If the next resource has no reader, fall back to its automatic presentation even before the
  // selection-reset effect runs; a stale toggle must never hide a usable frame.
  const resolved = readerPreferred && readerAvailable ? readerResolved : autoResolved;
  const canUseInteractive =
    autoResolved?.kind === 'iframe' || autoResolved?.kind === 'native-embed';

  if (!selected || !resolved) {
    return (
      <section
        data-testid="resource-workspace"
        className="flex min-h-[300px] flex-col items-center justify-center gap-2 border-l border-line-soft bg-panel p-5 text-center"
      >
        <p className="text-[13px] font-semibold text-ink">No resource selected</p>
        <button type="button" onClick={onBackToGuides} className="btn px-3 py-1.5 text-[12px]">
          Back to guides
        </button>
      </section>
    );
  }

  const externalUrl =
    resolved.kind === 'unavailable' ? '' : 'fallbackUrl' in resolved ? resolved.fallbackUrl : '';

  return (
    <section
      data-testid="resource-workspace"
      data-resource-id={selected.id}
      data-presentation={resolved.kind}
      aria-label={`Resource workspace: ${selected.title}`}
      className="flex min-h-[420px] max-h-[760px] min-w-0 flex-col overflow-hidden border-line-soft bg-panel xl:border-l"
    >
      <header className="flex flex-wrap items-center gap-1.5 border-b border-line-soft bg-canvas px-2.5 py-1.5">
        <button
          type="button"
          onClick={onBackToGuides}
          data-testid="btn-workspace-guides"
          title="Back to the authored resource list"
          className="flex min-h-8 items-center gap-1 rounded border border-line-soft bg-panel px-2 font-mono text-[11.5px] text-muted hover:text-ink"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden="true" /> Guides
        </button>
        <span className="flex min-w-0 items-center gap-1.5">
          <BookOpen className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block truncate text-[12px] font-semibold text-ink">{selected.title}</span>
            <span className="block truncate font-mono text-[10px] text-faint">
              {selected.provider} · {selected.role} · {resolved.kind}
            </span>
          </span>
        </span>
        <div className="ml-auto flex items-center gap-1">
          {readerAvailable && resolved.kind !== 'reader' && (
            <button
              type="button"
              onClick={() => setReaderPreferred(true)}
              data-testid="btn-workspace-reader"
              title="Read the licence-cleared text snapshot in MechaLab"
              className="flex min-h-8 items-center gap-1 rounded border border-line-soft bg-panel px-2 font-mono text-[11px] text-accent hover:border-accent/60"
            >
              <BookOpen className="h-3 w-3" aria-hidden="true" />
              <span className="hidden sm:inline">Reader</span>
            </button>
          )}
          {readerPreferred && canUseInteractive && (
            <button
              type="button"
              onClick={() => setReaderPreferred(false)}
              data-testid="btn-workspace-interactive"
              title="Return to the interactive provider page"
              className="flex min-h-8 items-center gap-1 rounded border border-line-soft bg-panel px-2 font-mono text-[11px] text-muted hover:text-ink"
            >
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
              <span className="hidden sm:inline">Interactive</span>
            </button>
          )}
          {resources.length > 1 && (
            <select
              aria-label="Choose another resource for this lesson"
              data-testid="workspace-resource-select"
              value={selected.id}
              onChange={(event) => onSelect(event.target.value)}
              className="max-w-[10rem] rounded border border-line-soft bg-panel px-1.5 py-1 font-mono text-[10.5px] text-muted"
            >
              {resources.map((resource, index) => (
                <option key={resource.id} value={resource.id}>
                  {index + 1}. {resource.role} · {resource.provider}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => onExpandedChange(!expanded)}
            data-testid="btn-workspace-expand"
            aria-pressed={expanded}
            title={expanded ? 'Return to the lesson beside the resource' : 'Give the resource the whole width'}
            className="flex min-h-8 items-center gap-1 rounded border border-line-soft bg-panel px-2 font-mono text-[11px] text-muted hover:text-ink"
          >
            {expanded ? (
              <Minimize2 className="h-3 w-3" aria-hidden="true" />
            ) : (
              <Maximize2 className="h-3 w-3" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">{expanded ? 'Split' : 'Expand'}</span>
          </button>
          {externalUrl && (
            <a
              href={externalUrl}
              target="_blank"
              rel="noreferrer"
              data-testid="btn-workspace-original"
              title="Open the original resource in a new tab"
              className="flex min-h-8 items-center gap-1 rounded border border-line-soft bg-panel px-2 font-mono text-[11px] text-accent hover:border-accent/60"
            >
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
              <span className="hidden sm:inline">Original</span>
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            data-testid="btn-workspace-close"
            aria-label="Close the resource workspace"
            title="Close the resource workspace"
            className="flex h-8 w-8 items-center justify-center rounded border border-line-soft bg-panel text-muted hover:text-ink"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3" data-testid="resource-workspace-body">
        <div className="mb-3 rounded-lg border border-line-soft bg-canvas p-3">
          <p className="eyebrow">From {lessonId} · {lessonTitle}</p>
          <ReadingGuide resource={selected} compact />
        </div>
        {readerAvailable && (
          <p className="mb-2 text-[11px] leading-snug text-muted">
            {resolved.kind === 'reader'
              ? 'Reader Mode is a text-only snapshot checked into this build; the original is one click away.'
              : 'A licence-cleared text snapshot is available; the interactive page stays the default.'}
          </p>
        )}
        <ResourceView resource={selected} resolved={resolved} />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line-soft pt-2 font-mono text-[10px] text-faint">
          <span>
            {selected.license
              ? `License: ${selected.license.id}`
              : 'License not recorded; link-only.'}
          </span>
          <span>
            {selected.embed.checkedAt
              ? `Embed verdict checked ${selected.embed.checkedAt.slice(0, 10)}`
              : 'No embed verdict'}
          </span>
        </div>
      </div>
    </section>
  );
}
