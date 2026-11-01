/**
 * The strict read's primitives (`app/src/projectRead.ts`).
 *
 * One `text`, `whole`, `flag` and `amount` per document, not one copy per object kind: a kind
 * declaration says which fields it has, and these say what a value of that shape is. `claim` is
 * the one ownership and duplicate-id rule every kind goes through before its reader parses a
 * field, and `stamp` is its second half: it writes the claimed id onto the parsed fields and
 * refuses a parser that substituted one. The errors name the field they were reading, so a
 * malformed generated document says which line to fix.
 */

import type { ProjectCheck } from './projectModel.ts';

/** A record that has passed the generic ownership claim and has a trimmed id. */
export type ProjectEntry = Record<string, unknown> & { id: string };

/** The project an object must belong to, and the ids already claimed by the read. */
export interface ProjectIdentity {
  projectId: string;
  seen: Set<string>;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function text(value: unknown, where: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`project: ${where} is not text`);
  }
  return value.trim();
}

/**
 * The first rule every kind shares: an object is a record, names one id in this project, and no two
 * objects share that id. `readProject` calls this before a kind's reader; `stamp` then writes the
 * claimed id onto the parsed fields and refuses a parser that returns another. The error names the
 * kind's own word (`noun`), so a requirement's message still says "requirement" while the check
 * itself exists once.
 */
export function claim(
  entry: unknown,
  where: string,
  noun: string,
  identity: ProjectIdentity
): ProjectEntry {
  if (!isRecord(entry)) throw new Error(`project: ${where} is not an object`);
  const id = text(entry.id, `${where}.id`);
  if (!id.startsWith(`${identity.projectId}/`)) {
    throw new Error(`project: ${noun}${id} does not belong to ${identity.projectId}`);
  }
  if (identity.seen.has(id)) throw new Error(`project: two objects share the id ${id}`);
  identity.seen.add(id);
  return { ...entry, id };
}

/**
 * The second half of `claim`: write the claimed id onto the fields the kind's reader parsed, and
 * refuse a reader that substituted an id of its own. Keeping the stamp here means a declaration
 * cannot restate the rule or its sentence.
 */
export function stamp<T extends object>(
  claimed: ProjectEntry,
  parsed: T,
  noun: string
): T & { id: string } {
  if ('id' in parsed && parsed.id !== claimed.id) {
    throw new Error(`project: ${noun}${claimed.id} was read as ${String(parsed.id)}`);
  }
  return { id: claimed.id, ...parsed };
}

export function whole(value: unknown, where: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error(`project: ${where} is not a whole number of at least 1`);
  }
  return value;
}

export function flag(value: unknown, where: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`project: ${where} is not true or false`);
  return value;
}

export function amount(value: unknown, where: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`project: ${where} is not a cost`);
  }
  return round2(value);
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** `Q1,Q2,…` -> `q1`; `R_SH_A,…` -> `r-sh-a`. One object per line, named by its first designation. */
export function refSlug(refDes: string, where: string): string {
  const slug = (refDes.split(',')[0] ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) throw new Error(`project: ${where} has no designation to name an object with`);
  return slug;
}

export function readCheck(entry: unknown, where: string): ProjectCheck {
  if (!isRecord(entry)) throw new Error(`project: ${where}.check is not an object`);
  const direction = entry.direction;
  if (direction !== 'max' && direction !== 'min') {
    throw new Error(`project: ${where}.check.direction must be max or min`);
  }
  const value = entry.value;
  const limit = entry.limit;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`project: ${where}.check.value is not a measured number`);
  }
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit < 0) {
    throw new Error(`project: ${where}.check.limit is not a number`);
  }
  return { value, unit: text(entry.unit, `${where}.check.unit`), limit, direction };
}
