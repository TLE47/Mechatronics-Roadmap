/**
 * The comparison card beside a micro-learning question (`app/src/micro/questionComparison.ts`).
 *
 * The authored question already has an answer key. This helper works out which variable the
 * learner is being asked about, traces the values the code already knows, and shows the same
 * equation twice: once as authored and once with those values plugged in. Grading still lives in
 * `micro/engine.ts`; this module only prepares the visual comparison.
 */

import type { MicroQuestion } from '../data/microLessons.ts';
import {
  codeRepr,
  display,
  tracePython,
  type PreviewRecord,
} from './pythonPreview.ts';

const ASSIGNMENT = /^\s*([A-Za-z_]\w*)\s*=(?!=)/gm;

function escapeName(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Every variable the authored code assigns. */
function assignedNames(question: Pick<MicroQuestion, 'code'>): string[] {
  return Array.from(
    new Set(Array.from(question.code?.matchAll(ASSIGNMENT) ?? [], (match) => match[1]))
  );
}

/**
 * The variables a question is about, preferring names that appear in its own prompt.
 *
 * A prompt such as "What are x and y at the end?" names both; a print question that never names
 * its variable falls back to the last assignment so the comparison still has a target.
 */
export function questionTargets(question: Pick<MicroQuestion, 'prompt' | 'code'>): string[] {
  const assigned = assignedNames(question);
  if (!assigned.length) return [];
  const named = assigned.filter((name) =>
    new RegExp(`\\b${escapeName(name)}\\b`).test(question.prompt)
  );
  return named.length ? named : [assigned[assigned.length - 1]];
}

/** The first target, for callers that only need a heading. */
export function questionTarget(question: Pick<MicroQuestion, 'prompt' | 'code'>): string | null {
  return questionTargets(question)[0] ?? null;
}

/** The option text the learner picked, not its radio id. */
export function selectedAnswerText(
  question: Pick<MicroQuestion, 'options'>,
  selected: string
): string {
  return question.options?.find((option) => option.id === selected)?.text ?? selected;
}

export interface ComparisonLine {
  original: string;
  plugged: string;
}

export type ComparisonResultKind = 'value' | 'output' | 'error';

export interface ComparisonPreview {
  target: string | null;
  targets: string[];
  selectedText: string;
  lines: ComparisonLine[];
  result: string | null;
  resultKind: ComparisonResultKind | null;
}

function recordResult(record: PreviewRecord): { text: string; kind: ComparisonResultKind } | null {
  if (record.error) return { text: record.error, kind: 'error' };
  if (record.kind === 'print') {
    return record.output === undefined ? null : { text: record.output, kind: 'output' };
  }
  if (record.kind === 'assignment' && record.name && record.value !== undefined) {
    return { text: `${record.name} = ${codeRepr(record.value)}`, kind: 'value' };
  }
  if (record.kind === 'expression' && record.value !== undefined) {
    return { text: display(record.value), kind: 'value' };
  }
  return null;
}

/**
 * The equation to show on each side of the comparison.
 *
 * A final expression or `print()` is the thing being asked about, so it wins over an earlier
 * assignment. Otherwise the last assignment to each named target is the focus.
 */
export function comparisonPreview(
  question: Pick<MicroQuestion, 'prompt' | 'code' | 'options'>,
  selected: string
): ComparisonPreview {
  const selectedText = selectedAnswerText(question, selected);
  const targets = questionTargets(question);
  const target = targets[0] ?? null;
  const code = question.code?.trim() ?? '';
  if (!code) {
    return { target, targets, selectedText, lines: [], result: null, resultKind: null };
  }

  const trace = tracePython(code);
  const wantsPrint = /\b(?:print|printed|prints|output|produce|produces|display|shown)\b/i.test(
    question.prompt
  );
  let focus: PreviewRecord[] = [];
  if (wantsPrint && trace.lastPrint) {
    focus = [trace.lastPrint];
  } else if (trace.last?.kind === 'expression') {
    focus = [trace.last];
  } else if (targets.length) {
    focus = targets
      .map((name) => trace.lastByName[name])
      .filter((record): record is PreviewRecord => Boolean(record));
    if (!focus.length && trace.last) focus = [trace.last];
  } else if (trace.last) {
    focus = [trace.last];
  }

  const unique = Array.from(new Set(focus));
  const lines = unique.map((record) => ({
    original: record.source,
    plugged: record.plugged,
  }));
  const results = unique
    .map(recordResult)
    .filter((entry): entry is { text: string; kind: ComparisonResultKind } => Boolean(entry));
  const result = results.length ? results.map((entry) => entry.text).join(', ') : null;
  const resultKind = results.length
    ? results.some((entry) => entry.kind === 'error')
      ? 'error'
      : results.every((entry) => entry.kind === 'output')
        ? 'output'
        : 'value'
    : null;

  return { target, targets, selectedText, lines, result, resultKind };
}
