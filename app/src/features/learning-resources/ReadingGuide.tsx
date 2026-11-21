import React from 'react';
import { InlineMarkdown as Inline } from '../../components/InlineMarkdown';
import type { LessonResource } from './registry';

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

/**
 * The authored reading assignment for one occurrence (`ReadingGuide.tsx`).
 *
 * It is deliberately independent of the renderer: this is what a learner does with the resource,
 * whether the resource is framed, shown through the official player, or opened in a new tab. It
 * never copies the provider's prose.
 */
export function ReadingGuide({
  resource,
  compact = false,
}: {
  resource: LessonResource;
  compact?: boolean;
}) {
  const idea =
    resource.idea.number === null
      ? resource.idea.title
      : `Idea ${resource.idea.number} · ${resource.idea.title}`;
  return (
    <section data-testid="reading-guide" className={compact ? 'space-y-1' : 'space-y-1.5'}>
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
        <span className="ml-auto shrink-0 font-mono text-[10.5px] text-faint">
          {resource.provider}
        </span>
      </div>
      <GuideLine label="Read / complete" text={resource.guide.read} />
      <GuideLine label="Skip" text={resource.guide.skip} />
      <GuideLine label="Key takeaway" text={resource.guide.takeaway} />
    </section>
  );
}
