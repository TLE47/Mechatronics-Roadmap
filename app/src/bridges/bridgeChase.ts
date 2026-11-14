/**
 * The chase behind P.9's dials, and the two preferences it carries
 * (`app/src/bridges/bridgeChase.ts`).
 *
 * The card draws five marks on its arcs, one at a time, and a reader sweeps the needle onto each.
 * That leaves three things a component should not be trusted to keep straight on its own: how far
 * along the chase a visitor is, what their best run was, and whether they asked for sound. So they
 * live here as pure functions over a `Storage`-shaped object, which is what lets
 * `scripts/test_bridge_visuals.mjs` grade them without a browser — including the case that matters
 * most, a store that is missing, blocked or full of someone else's bytes.
 *
 * Nothing here throws on a bad store. A visitor in private mode or behind a blocked-cookie banner
 * gets zeros, a card that still works, and no console noise: progress is a nicety, not a dependency.
 */

/** The five marks of the chase, in the order they are drawn. */
export const MARKS: readonly number[] = [0.375, 0.75, 0.125, 0.5, 0.875];

/** How close counts as landed, and how far away undoes it, in fractions of a dial's top. */
export const LANDED = 0.006;

/** The key the chase is remembered under, and the one the sound preference is. */
export const CHASE_KEY = 'mechalab_bridge_p9_v1';
export const SOUND_KEY = 'mechalab_bridge_sound_v1';

/** How far the count is allowed to climb before it is treated as nonsense rather than progress. */
const CAP = MARKS.length * 20;

/** The part of `localStorage` this module needs, so a test can hand it a fake one. */
export interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Progress through the chase: how many marks are done, and the best run reached. */
export interface Chase {
  marks: number;
  best: number;
}

const BLANK: Chase = { marks: 0, best: 0 };

/** The page's store, or null where there is none (a test, a worker, a blocked context). */
export function store(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

const count = (value: unknown): number => {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? Math.min(CAP, Math.max(0, number)) : 0;
};

/** What this visitor has done so far, or zeros. A corrupt record reads as zeros, not as a crash. */
export function readChase(from: Store | null = store()): Chase {
  if (!from) return { ...BLANK };
  try {
    const raw = JSON.parse(from.getItem(CHASE_KEY) ?? 'null') as Partial<Chase> | null;
    return { marks: count(raw?.marks), best: count(raw?.best) };
  } catch {
    return { ...BLANK };
  }
}

/** Remember progress. A store that refuses (quota, private mode) is not an error here. */
export function writeChase(chase: Chase, to: Store | null = store()): void {
  try {
    to?.setItem(CHASE_KEY, JSON.stringify({ marks: count(chase.marks), best: count(chase.best) }));
  } catch {
    // The card works without it; the next landing tries again.
  }
}

/** Forget progress, for the card's own reset. */
export function clearChase(to: Store | null = store()): void {
  try {
    to?.removeItem(CHASE_KEY);
  } catch {
    // Same as write: a blocked store simply keeps nothing.
  }
}

/** One mark landed: the count advances, and the best run remembers it. */
export function landed(chase: Chase): Chase {
  const marks = count(chase.marks) + 1;
  return { marks, best: Math.max(count(chase.best), marks) };
}

/** The mark on the arcs at this depth of the chase. The five repeat after the fifth. */
export function markAt(marks: number): number {
  return MARKS[count(marks) % MARKS.length];
}

/** Whether a needle at this fraction is on the mark. */
export function isLanded(fraction: number, mark: number): boolean {
  return Math.abs(fraction - mark) < LANDED;
}

/** Sound is a choice, and it starts as "no": a lesson is not a place that makes noise unasked. */
export function readMuted(from: Store | null = store()): boolean {
  if (!from) return true;
  try {
    return from.getItem(SOUND_KEY) !== 'on';
  } catch {
    return true;
  }
}

/** Remember the choice. */
export function writeMuted(muted: boolean, to: Store | null = store()): void {
  try {
    to?.setItem(SOUND_KEY, muted ? 'off' : 'on');
  } catch {
    // A blocked store means the choice lasts this visit, which is still the choice.
  }
}

/**
 * Whether a tick may be heard at all: the reader turned it on, and their system did not ask for
 * reduced motion. Silence under reduced motion is not a preference here — it is the rule.
 */
export function soundAllowed(muted: boolean, reducedMotion: boolean): boolean {
  return !muted && !reducedMotion;
}
