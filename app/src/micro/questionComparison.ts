/**
 * The small comparison card beside a micro-learning question (`app/src/micro/questionComparison.ts`).
 *
 * The authored question already has an answer key. This helper only works out which variable the
 * learner is being asked about and turns their picked option into a compact, code-shaped preview.
 * It never grades; grading stays in `micro/engine.ts`.
 */

import type { MicroQuestion } from '../data/microLessons.ts';

const ASSIGNMENT = /^\s*([A-Za-z_]\w*)\s*=/gm;
const SIMPLE_VALUE =
  /^([-+]?\d+(?:\.\d+)?|True|False|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')$/;

function escapeName(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The variable a question is about, preferring a name that appears in its own prompt. */
export function questionTarget(question: Pick<MicroQuestion, 'prompt' | 'code'>): string | null {
  const assigned = Array.from(question.code?.matchAll(ASSIGNMENT) ?? [], (match) => match[1]);
  if (!assigned.length) return null;

  const named = assigned.find((name) => new RegExp(`\\b${escapeName(name)}\\b`).test(question.prompt));
  if (named) return named;

  const last = assigned[assigned.length - 1];
  return last ?? null;
}

/** The option text the learner picked, not its radio id. */
export function selectedAnswerText(
  question: Pick<MicroQuestion, 'options'>,
  selected: string
): string {
  return question.options?.find((option) => option.id === selected)?.text ?? selected;
}

/**
 * A compact second code block for the learner's answer.
 *
 * A numeric or quoted option becomes `x = 425`; a sentence answer stays in a comment so the
 * preview never pretends an English sentence is valid Python.
 */
export function comparisonCode(
  question: Pick<MicroQuestion, 'prompt' | 'code' | 'options'>,
  selected: string
): string {
  const text = selectedAnswerText(question, selected);
  const target = questionTarget(question);
  if (!target) return `# your answer\n# ${text}`;
  if (SIMPLE_VALUE.test(text)) return `# your answer\n${target} = ${text}`;
  return `# your answer\n${target}  # ${text}`;
}
