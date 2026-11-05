import { inlinePlain } from '../../../readerMarkdown';

/** The lesson's pass conditions, under the goal and above the first line of code. */
export function EditorRequirements({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-1.5" data-testid="editor-requirements">
      <p className="text-muted">
        <span className="font-semibold text-accent"># Requirements:</span>
      </p>
      <ul className="mt-0.5 space-y-0.5 text-[11px] leading-snug text-muted" aria-label="Pass conditions">
        {items.map((item, index) => (
          <li key={`${index}-${item}`} className="flex gap-1.5">
            <span className="text-accent" aria-hidden="true">
              •
            </span>
            <span>{inlinePlain(item)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
