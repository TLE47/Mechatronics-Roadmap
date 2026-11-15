/**
 * Which picture a micro focus draws, and where it sits (`app/src/micro/visuals.ts`).
 *
 * Kept out of the component file so it can be read by Node with type stripping: the map is data, and
 * a map that cannot be tested without React is a map nobody notices going stale. `MicroFigures.tsx`
 * draws the families this names.
 */

export type MicroFigureKind =
  | 'assert'
  | 'balance'
  | 'bits'
  | 'branch'
  | 'function'
  | 'limits'
  | 'list'
  | 'loop'
  | 'mechanics'
  | 'notes'
  | 'numbers'
  | 'operators'
  | 'plot'
  | 'angle'
  | 'range'
  | 'strings'
  | 'units'
  | 'answer';

const KINDS: Record<string, MicroFigureKind> = {
  variables: 'notes',
  'assignment-order': 'notes',
  'int-float': 'numbers',
  strings: 'strings',
  booleans: 'numbers',
  'mixed-types': 'numbers',
  'f-strings': 'strings',
  operators: 'operators',
  'floor-division': 'operators',
  'order-of-operations': 'operators',
  comparisons: 'range',
  clamping: 'range',
  logic: 'branch',
  lists: 'list',
  'for-loops': 'loop',
  'index-error': 'list',
  functions: 'function',
  'while-loops': 'loop',
  none: 'function',
  imports: 'function',
  asserts: 'assert',
  'assert-message': 'assert',
  'si-units': 'units',
  'metric-prefixes': 'units',
  'unit-cancel': 'units',
  'frequency-period': 'units',
  'binary-bits': 'bits',
  'place-values': 'bits',
  rearranging: 'balance',
  'linear-scaling': 'range',
  'scale-output': 'range',
  radians: 'angle',
  'trig-reach': 'angle',
  atan2: 'angle',
  'graph-slope': 'plot',
  'area-under-curve': 'plot',
  'graph-units': 'plot',
  force: 'mechanics',
  weight: 'mechanics',
  torque: 'mechanics',
  'datasheet-units': 'units',
  'datasheet-bounds': 'limits',
  'datasheet-conditions': 'limits',
  'given-unknown': 'answer',
  'answer-check': 'answer',
  'bounds-check': 'answer',
};

/** Every concept id with a picture family. Unknown ids throw, so a new lesson cannot ship blank. */
export function visualKind(conceptId: string): MicroFigureKind {
  const kind = KINDS[conceptId];
  if (!kind) throw new Error(`micro concept ${conceptId} has no picture family; add it to KINDS`);
  return kind;
}

/** Concept ids the map knows: what a test asks against the generated catalogue. */
export function visualConceptIds(): string[] {
  return Object.keys(KINDS);
}

/** Whether a concept has a family of its own, without throwing for an id that predates this file. */
export function hasVisual(conceptId: string): boolean {
  return Boolean(KINDS[conceptId]);
}

/**
 * Where this concept's picture sits at `lg` and up.
 *
 * Three placements, cycling through the catalogue rather than chosen per lesson: right of the
 * explanation, left of it, then across the full width underneath. The cycle is deterministic (the
 * concept's own index in the generated catalogue), so the same lesson always looks the same, and
 * two lessons in a row never open with the picture in the same place.
 */
export function visualPlacement(index: number): 'left' | 'right' | 'bottom' {
  return (['right', 'left', 'bottom'] as const)[Math.abs(index) % 3];
}
