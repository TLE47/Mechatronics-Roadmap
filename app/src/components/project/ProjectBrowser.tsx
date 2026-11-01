import { collectionOf, type EngineeringProject } from '../../projectModel.ts';
import { projectKind, type ProjectItem } from '../../projectKinds.ts';
import { PROJECT_BROWSE, projectRow, type ProjectRow } from '../../projectRows.ts';
import type { ProjectObjectKind } from '../../projectRef.ts';

/**
 * One project object list, drawn once (`components/project/ProjectBrowser.tsx`).
 *
 * Project Mode and the register used to carry the same search field, count, group headings, empty
 * sentence and row button with different words typed twice. The words belong to the kind
 * declaration now; this component asks it for the copy, the groups and each row's data, then draws
 * the one shape. A fourth kind gets a list by adding its entry, not by copying this markup.
 *
 * Layout only: filtering and selection stay with the view, and the model is read by the view, not
 * here. The row's data attribute and testid are part of the declaration because they are how the
 * browser suite addresses one object among all the kinds.
 */

interface ProjectBrowserProps {
  kind: ProjectObjectKind;
  project: EngineeringProject;
  items: readonly ProjectItem[];
  query: string;
  onQuery: (query: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function ProjectObjectRow({
  row,
  active,
  onSelect,
}: {
  row: ProjectRow;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={row.testId}
      {...row.data}
      aria-pressed={active}
      onClick={onSelect}
      className={`flex w-full items-baseline gap-2 rounded-lg border px-2 py-1.5 text-left ${
        active ? 'border-accent bg-accent-soft' : 'border-transparent hover:border-line hover:bg-raise'
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className={`block truncate ${row.primaryClass}`}>{row.primary}</span>
        <span className={`block truncate ${row.secondaryClass}`}>{row.secondary}</span>
      </span>
      <span className={row.trailingClass}>{row.trailing}</span>
    </button>
  );
}

export function ProjectBrowser({
  kind,
  project,
  items,
  query,
  onQuery,
  selectedId,
  onSelect,
}: ProjectBrowserProps) {
  const spec = projectKind(kind);
  if (!spec) return null;
  const all = collectionOf<ProjectItem>(project, spec);
  const groups = spec.groups(items, project);
  const browse = PROJECT_BROWSE[kind];
  if (!browse) return null;
  return (
    <section className="rounded-xl border border-line bg-panel p-3" aria-label={browse.sectionLabel}>
      <label className="block">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          {browse.findLabel}
        </span>
        <input
          data-testid={browse.countTestId.replace('-count', '-search')}
          type="search"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder={browse.placeholder}
          className="mt-1 min-h-9 w-full rounded border border-line bg-canvas px-2 font-mono text-[12px] text-body outline-none focus-visible:outline-2 focus-visible:outline-accent"
        />
      </label>
      <p className="mt-1.5 font-mono text-[10.5px] text-faint" data-testid={browse.countTestId}>
        {items.length} of {all.length} {browse.noun}
      </p>

      {groups.length === 0 ? (
        <p data-testid={browse.emptyTestId} className="mt-3 text-sm text-muted">
          {browse.empty(query)}
        </p>
      ) : (
        <div
          className="mt-2 max-h-[26rem] space-y-3 overflow-auto pr-1"
          role="region"
          aria-label={browse.listLabel}
          tabIndex={0}
        >
          {groups.map((group) => (
            <section key={group.key} data-testid={`${browse.groupTestId}-${group.key}`}>
              <h2 className="sticky top-0 bg-panel py-1 text-[10.5px] font-semibold uppercase tracking-wide text-accent">
                {group.label}
              </h2>
              <ul className="space-y-1">
                {group.items.map((item) => {
                  const index = all.indexOf(item);
                  const row = projectRow(kind, item, index, project);
                  if (!row) return null;
                  return (
                    <li key={item.id}>
                      <ProjectObjectRow
                        row={row}
                        active={selectedId === item.id}
                        onSelect={() => onSelect(item.id)}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
