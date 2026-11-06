import { ListChecks } from 'lucide-react';
import { MicroRichText } from '../../micro/MicroText';

/**
 * The lesson's pass conditions (`runner/EditorRequirements.tsx`).
 *
 * These used to sit under the goal as a compact bullet list. They are a tab now, because they are
 * read before a run rather than while typing, and because a list of full sentences in the editor's
 * header pushed the first line of code down. Each condition is a card with the same colourful
 * variable tokens the micro lessons use; the numbered edge is the one thing a checklist adds over
 * prose.
 */
export function EditorRequirements({ items }: { items: string[] }) {
  return (
    <section className="p-3" data-testid="editor-requirements" data-requirement-count={items.length}>
      <header className="flex items-start gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-accent/30 bg-accent/10 text-accent">
          <ListChecks className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
            Requirements
          </p>
          <p className="mt-0.5 text-[11.5px] leading-snug text-muted">
            {items.length} pass condition{items.length === 1 ? '' : 's'} — the grader checks these.
          </p>
        </div>
      </header>
      <ol className="editor-requirement-grid mt-3 grid gap-2 sm:grid-cols-2" aria-label="Pass conditions">
        {items.map((item, index) => (
          <li key={`${index}-${item}`} className="editor-requirement-card">
            <span className="editor-requirement-number" aria-hidden="true">
              {String(index + 1).padStart(2, '0')}
            </span>
            <p className="min-w-0 text-[12px] leading-relaxed text-body">
              <MicroRichText text={item} />
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
