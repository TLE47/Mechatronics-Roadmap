/**
 * The scene each micro focus draws, and where it sits (`app/src/micro/visuals.ts`).
 *
 * Every concept has its own named scene, not a family shared with its neighbours. The names are data
 * so a Node test can prove the catalogue and the renderer did not drift; `MicroConceptVisual.tsx`
 * draws each one. Placements still cycle right, left, bottom from the catalogue's own order.
 */

export const CONCEPT_VISUAL_SCENES = {
  variables: 'sticky-note',
  'assignment-order': 'conveyor',
  'int-float': 'two-number-boxes',
  strings: 'character-cells',
  booleans: 'toggle-cards',
  'mixed-types': 'mismatched-pieces',
  'f-strings': 'sentence-slot',
  operators: 'symbol-dial',
  'floor-division': 'grouping-tray',
  'order-of-operations': 'nested-brackets',
  comparisons: 'balance-question',
  clamping: 'clamped-rail',
  logic: 'logic-gate',
  lists: 'indexed-rack',
  'for-loops': 'visit-cycle',
  'index-error': 'out-of-range',
  functions: 'function-machine',
  'while-loops': 'test-cycle',
  none: 'empty-return',
  imports: 'toolbox',
  asserts: 'checkpoint',
  'assert-message': 'failure-note',
  'si-units': 'unit-ruler',
  'metric-prefixes': 'prefix-ladder',
  'unit-cancel': 'cancel-fraction',
  'frequency-period': 'reciprocal-waves',
  'binary-bits': 'bit-radix',
  'place-values': 'place-columns',
  rearranging: 'balance-scale',
  'linear-scaling': 'fraction-bar',
  'scale-output': 'two-ranges',
  radians: 'radian-arc',
  'trig-reach': 'reach-triangle',
  atan2: 'quadrant-arrow',
  'graph-slope': 'slope-line',
  'area-under-curve': 'area-slices',
  'graph-units': 'labelled-axes',
  force: 'force-block',
  weight: 'weight-scale',
  torque: 'lever-arm',
  'datasheet-units': 'unit-table',
  'datasheet-bounds': 'bounds-band',
  'datasheet-conditions': 'min-typ-max',
  'given-unknown': 'given-unknown-board',
  'answer-check': 'answer-checklist',
  'bounds-check': 'limit-gauge',
} as const;

export type ConceptVisualId = keyof typeof CONCEPT_VISUAL_SCENES;

/** Every concept with a specific scene. A new catalogue entry must add one here. */
export function conceptVisualIds(): ConceptVisualId[] {
  return Object.keys(CONCEPT_VISUAL_SCENES) as ConceptVisualId[];
}

/** Whether a micro id has a designed scene, without falling back to another concept's art. */
export function hasConceptVisual(conceptId: string): conceptId is ConceptVisualId {
  return Object.prototype.hasOwnProperty.call(CONCEPT_VISUAL_SCENES, conceptId);
}

/**
 * The placement the reader uses for this concept's inline picture.
 *
 * The scene map is authored in catalogue order, so the reader and the Micro-learning stage give a
 * concept the same side of the text. `pictures cycle…` in `scripts/test_micro.mjs` pins that order.
 */
export function visualPlacementForConcept(conceptId: string): 'left' | 'right' | 'bottom' | null {
  if (!hasConceptVisual(conceptId)) return null;
  return visualPlacement(conceptVisualIds().indexOf(conceptId));
}

/**
 * Where this concept's scene sits at `lg` and up.
 *
 * Three placements, cycling through the catalogue rather than chosen per lesson: right of the
 * explanation, left of it, then across the full width underneath. The cycle is deterministic (the
 * concept's own index in the generated catalogue), so the same lesson always looks the same, and
 * two lessons in a row never open with the picture in the same place.
 */
export function visualPlacement(index: number): 'left' | 'right' | 'bottom' {
  return (['right', 'left', 'bottom'] as const)[Math.abs(index) % 3];
}
