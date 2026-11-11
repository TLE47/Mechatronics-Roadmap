/**
 * Searching the course's words for a *term*, not just a lesson title (`app/src/termSearch.ts`).
 *
 * A learner who meets "eight-bit range" in a comment should be able to type those words into the
 * same search box and land on the lesson that explains them. The glossary is prose in `resources/`,
 * which the browser never sees, so the handful of terms a beginner is most likely to look up live
 * here with the lesson that defines each one and a one-sentence answer.
 *
 * These rows are `lesson` items: choosing one opens the lesson that explains the term, exactly as a
 * title hit does. They are put ahead of the lesson-text hits because a term search is a definition
 * search — the learner wants the idea, then the page.
 */
import type { PaletteItem } from './palette.ts';

export interface TermEntry {
  /** What the learner would type, in the words the lessons use. */
  term: string;
  /** One plain sentence: the answer, before the lesson. */
  definition: string;
  /** The lesson that explains it. */
  lessonId: string;
  /** Other spellings and near-synonyms that should find this row. */
  aliases?: string;
  /** The words the lesson actually prints; defaults to the term itself. */
  focus?: string;
  /** A bench lesson the runner does not carry: its source page, already on the right heading. */
  href?: string;
}

export const TERM_ENTRIES: readonly TermEntry[] = [
  {
    term: 'eight-bit range',
    definition: '8 bits hold 256 states, numbered 0 to 255; a command outside that is clamped to the nearest end.',
    lessonId: 'P.6',
    aliases: '8-bit range 8 bit byte 0 255 clamp',
  },
  {
    term: 'hard-coded value',
    definition: 'A number typed straight into the code instead of computed, so it stops being true when the inputs change.',
    lessonId: 'P.6',
    aliases: 'typed-in type-in magic number',
    focus: 'hard-coded final value',
  },
  {
    term: 'clamping',
    definition: 'Pulling a calculated number back inside its safe minimum and maximum instead of letting it overflow.',
    lessonId: 'P.3',
    aliases: 'saturation saturate limit bounds',
  },
  {
    term: 'assertion',
    definition: 'A self-check (`assert condition`) that stops the program when the condition is false.',
    lessonId: 'P.6',
    aliases: 'assert self-check test',
  },
  {
    term: 'zero-based indexing',
    definition: 'Counting list positions from 0, so the first item is `items[0]` and the last is `items[len(items) - 1]`.',
    lessonId: 'P.4',
    aliases: 'index indexing off by one',
  },
  {
    term: 'binary bit',
    definition: 'One digital 0 or 1; N bits hold 2^N values, from 0 to 2^N - 1.',
    lessonId: 'P.8',
    aliases: 'bit byte binary register',
    focus: 'Binary bits',
  },
  {
    term: 'duty cycle',
    definition: 'The fraction of each period a PWM pin is on; 50% is half the supply voltage on average.',
    lessonId: 'S0.9',
    aliases: 'pwm pulse width modulation analogWrite',
    href: 'https://github.com/TLE47/Mechatronics-Roadmap/blob/main/stage-0/S0.9-pwm-duty-cycle-and-analog-write.md#idea-1-pulse-width-modulation-pwm-duty-cycle-and-average-voltage-v_textavg--textduty-times-v_textcc',
  },
  {
    term: 'encoder ticks',
    definition: 'Counts from a shaft encoder; ticks multiplied by degrees-per-tick give the joint angle.',
    lessonId: '03.1',
    aliases: 'quadrature encoder cpr counts',
    focus: 'edge counting',
  },
  {
    term: 'integer',
    definition: 'A whole number with no decimal point, such as 0, 255 or -40.',
    lessonId: 'P.1',
    aliases: 'int whole number',
  },
  {
    term: 'float',
    definition: 'A number with a decimal point, such as 12.6 or 0.005.',
    lessonId: 'P.1',
    aliases: 'floating point decimal',
  },
];

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Rows for the terms whose name, alias or definition contains the query. */
export function termSearchItems(query: string): PaletteItem[] {
  const wanted = normalize(query);
  if (!wanted) return [];
  return TERM_ENTRIES.filter((entry) => {
    const haystack = normalize(`${entry.term} ${entry.aliases ?? ''} ${entry.definition}`);
    return haystack.includes(wanted);
  }).map((entry) => ({
    id: `term-${entry.lessonId}-${normalize(entry.term).replace(/[^a-z0-9]+/g, '-')}`,
    kind: 'lesson',
    label: `Term: ${entry.term}`,
    detail: `${entry.definition} · explained in ${entry.lessonId}`,
    keywords: entry.aliases,
    lessonId: entry.lessonId,
    ...(entry.href ? { href: entry.href } : {}),
    focus: entry.focus ?? entry.term,
  }));
}
