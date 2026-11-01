/**
 * The project objects a workflow card may cite (`app/src/capstoneObjects.ts`).
 *
 * Generated with the project document (`npm run gen:project`) and read as data: a picker and a
 * card badge need the id, the kind and the label, not the strict BOM reader. This module used to
 * import the whole model, which put every requirement and the summary on the workflow chunk; the
 * generated list is the same objects reduced to what a chip prints, and `npm run test:project`
 * compares it with `projectObjects(readProject(document))` so the two cannot drift.
 */

import objects from './data/capstoneObjects.json';
import type { ProjectObject } from './projectRef.ts';

export const CAPSTONE_OBJECTS = objects as ProjectObject[];
