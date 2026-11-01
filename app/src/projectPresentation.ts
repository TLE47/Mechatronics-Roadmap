/**
 * What a project kind is called and where it opens (`app/src/projectPresentation.ts`).
 *
 * This is the part of presentation that rides first paint: a picker optgroup and a badge tooltip
 * need a word and a destination, not a reader, a row or a browse box. The badge's glyph stays on
 * the card that draws it (`components/workflow/WorkflowNodeCard.tsx`), so a picker that only prints
 * `Requirements` does not drag lucide paths into the entry chunk.
 *
 * A kind id is data, not a closed union: the declaration owns which kinds exist, and an id with no
 * words prints itself and opens no door rather than failing a render.
 */

import type { ProjectObjectKind } from './projectRef.ts';

interface ProjectDoors {
  /** Project Mode on a component id. */
  project(id: string): void;
  /** The register on a requirement id; a test id is resolved by the register to its requirement. */
  requirement(id: string): void;
}

interface ProjectKindWords {
  /** One object: `Part`, `Requirement`, `Test`. */
  label: string;
  /** A group of them: `Parts`, `Requirements`, `Tests`. */
  plural: string;
  /** Which existing view answers a badge press for this kind. */
  door: keyof ProjectDoors;
}

export const PROJECT_WORDS: Record<string, ProjectKindWords> = {
  component: { label: 'Part', plural: 'Parts', door: 'project' },
  requirement: { label: 'Requirement', plural: 'Requirements', door: 'requirement' },
  test: { label: 'Test', plural: 'Tests', door: 'requirement' },
};

/** True when the kind had a door; false lets the caller keep its own fallback. */
export function openProjectObject(
  kind: ProjectObjectKind | undefined,
  id: string,
  doors: ProjectDoors
): boolean {
  const door = kind ? PROJECT_WORDS[kind]?.door : undefined;
  if (!door) return false;
  doors[door](id);
  return true;
}
