/**
 * What a project object reference is (`app/src/projectRef.ts`).
 *
 * One object type has one id, and every surface cites that id: a workflow card, a requirement's
 * part list, a test's requirement link, a picker option, a URL. The reference has no `part:`,
 * `requirement:` or `test:` prefix — the generated project document already names each object
 * once, and a second syntax would be a second thing to keep in step with the first.
 *
 * This module owns only the shape of the reference. `projectKinds.ts` owns what kinds exist and how
 * one is read; `projectPresentation.ts` owns what each is called and where its badge opens;
 * `projectModel.ts` owns the objects themselves, and the generated picker list
 * (`capstoneObjects.ts`) is that data reduced to what a chip prints.
 *
 * A kind id is data, not a closed union: the declaration is the one list of kinds, so a fourth kind
 * must not also edit a type here. An unknown id prints itself and resolves to no door, which is the
 * same fallback a dangling reference gets.
 */

export type ProjectObjectKind = string;

/** The two fields every surface needs: where an id points and what to print for it. */
export interface ProjectObject {
  id: string;
  kind: ProjectObjectKind;
  /** `U1 · STM32G474RET6`, `REQ-THERM-01 · Stay cool at full load`. */
  label: string;
}

/**
 * One sentence, so a card badge, a picker option and a view's banner cannot each invent their own
 * way of saying an id no longer resolves.
 */
export function missingProjectObject(id: string): string {
  return `This project has no object with the id ${id}.`;
}
