/**
 * The project citation picker (`components/workflow/ProjectObjectPicker.tsx`).
 *
 * The picker is only visible while a card is selected, and its object list is the largest thing the
 * inspector would otherwise put on the entry chunk. It lives behind `lazy` in the inspector so the
 * generated list and the kind words load on the first selection, not on first paint.
 */

import { Link2 } from 'lucide-react';
import { CAPSTONE_OBJECTS } from '../../capstoneObjects.ts';
import { missingProjectObject } from '../../projectRef.ts';
import { PROJECT_WORDS } from '../../projectPresentation.ts';

interface ProjectObjectPickerProps {
  projectRef: string | undefined;
  ariaLabel: string;
  onObject: (projectRef: string) => void;
}

export function ProjectObjectPicker({
  projectRef,
  ariaLabel,
  onObject,
}: ProjectObjectPickerProps) {
  const known = CAPSTONE_OBJECTS.some((object) => object.id === projectRef);
  return (
    <label className="mt-1.5 flex min-w-0 items-center gap-1.5">
      <Link2 className="h-3 w-3 shrink-0 text-faint" aria-hidden="true" />
      <span className="font-mono text-[10px] text-faint">Project</span>
      <select
        data-testid="workflow-card-project"
        aria-label={ariaLabel}
        value={projectRef ?? ''}
        onChange={(event) => onObject(event.target.value)}
        className="min-h-9 min-w-0 flex-1 rounded border border-line bg-panel px-1.5 font-mono text-[11px] text-body outline-none focus-visible:outline-2 focus-visible:outline-accent"
      >
        <option value="">No project object</option>
        {projectRef && !known && (
          <option value={projectRef}>{missingProjectObject(projectRef)}</option>
        )}
        {Object.entries(PROJECT_WORDS).map(([kind, words]) => {
          const group = CAPSTONE_OBJECTS.filter((object) => object.kind === kind);
          if (!group.length) return null;
          return (
            <optgroup key={kind} label={words.plural}>
              {group.map((object) => (
                <option key={object.id} value={object.id}>
                  {object.label}
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>
    </label>
  );
}
