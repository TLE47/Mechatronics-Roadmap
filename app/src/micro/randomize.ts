import type {
  MicroConcept,
  MicroQuestion,
  MicroWalkthroughStep,
} from '../data/microLessons.ts';

/**
 * Fresh numbers for the two P.1 concepts that teach primitive values (`micro/randomize.ts`).
 *
 * The authored catalogue stays the source of truth. A learner gets a new sample when they enter a
 * concept, and the sample is substituted through the walkthrough, example, diagnostics, practice,
 * review pool and challenge so the code, the options and the explanations still agree. Only the
 * content fields are rewritten; IDs, anchors, revisions, resources and timing are untouched, and
 * the parent lesson's `sourceFocus` phrases are never altered.
 */
export interface PrimitiveSample {
  intValue: number;
  intText: string;
  /** A float with one decimal place, so `floatText` always ends in a zero like the lesson's 12.60. */
  floatValue: number;
  floatText: string;
  floatShort: string;
}

const NUMBERS = /\b\d+(?:\.\d+)?\b/g;

function integer(random: () => number, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function pythonFloat(value: number): string {
  const text = String(Number(value.toFixed(2)));
  return text.includes('.') ? text : `${text}.0`;
}

function drawSample(random: () => number): PrimitiveSample {
  const intValue = integer(random, 220, 880);
  // 20.1 .. 41.9: one decimal, and never a whole number, so 20.10 prints as 20.1.
  const floatValue = integer(random, 201, 419) / 10;
  return {
    intValue,
    intText: String(intValue),
    floatValue,
    floatText: floatValue.toFixed(2),
    floatShort: floatValue.toFixed(1),
  };
}

/** A sample that differs from the previous visit when the random source allows it. */
export function samplePrimitiveData(
  random: () => number = Math.random,
  previous?: PrimitiveSample
): PrimitiveSample {
  let sample = drawSample(random);
  for (
    let attempt = 0;
    attempt < 8 &&
    previous &&
    sample.intValue === previous.intValue &&
    sample.floatValue === previous.floatValue;
    attempt += 1
  ) {
    sample = drawSample(random);
  }
  return sample;
}

function variableMap(sample: PrimitiveSample, random: () => number): Record<string, string> {
  const step = integer(random, 12, 80);
  const total = sample.intValue + step;
  const less = sample.intValue - step;
  const steps = integer(random, 120, 240);
  const stepsStep = integer(random, 12, 60);
  const drop = integer(random, 10, 90) / 100;
  const newHeight = round2(sample.floatValue - drop);
  return {
    '400': sample.intText,
    '425': String(total),
    '375': String(less),
    '25': String(step),
    '12.60': sample.floatText,
    '12.6': sample.floatShort,
    '12.15': pythonFloat(newHeight),
    '12.05': pythonFloat(newHeight - 0.1),
    '13.05': pythonFloat(sample.floatValue + 0.45),
    '0.45': drop.toFixed(2),
    '100': String(steps),
    '150': String(steps + stepsStep),
    '50': String(stepsStep),
  };
}

function intFloatMap(sample: PrimitiveSample, random: () => number): Record<string, string> {
  const drop = integer(random, 10, 90) / 100;
  const result = round2(sample.floatValue - drop);
  return {
    '400': sample.intText,
    '12.60': sample.floatText,
    '12.0': sample.floatText,
    '0.45': drop.toFixed(2),
    '11.55': pythonFloat(result),
    '12.45': pythonFloat(sample.floatValue + drop),
    '11': String(Math.floor(result)),
  };
}

function substitute(text: string, map: Record<string, string>): string {
  return text.replace(NUMBERS, (token) => map[token] ?? token);
}

function mapStep(
  step: MicroWalkthroughStep,
  map: Record<string, string>
): MicroWalkthroughStep {
  return {
    ...step,
    code: substitute(step.code, map),
    note: substitute(step.note, map),
    ...(step.variable !== undefined ? { variable: substitute(step.variable, map) } : {}),
    ...(step.before !== undefined ? { before: substitute(step.before, map) } : {}),
    ...(step.after !== undefined ? { after: substitute(step.after, map) } : {}),
    ...(step.expression !== undefined ? { expression: substitute(step.expression, map) } : {}),
    ...(step.output !== undefined ? { output: substitute(step.output, map) } : {}),
  };
}

function mapQuestion(question: MicroQuestion, map: Record<string, string>): MicroQuestion {
  return {
    ...question,
    prompt: substitute(question.prompt, map),
    ...(question.code !== undefined ? { code: substitute(question.code, map) } : {}),
    ...(question.options
      ? { options: question.options.map((option) => ({ ...option, text: substitute(option.text, map) })) }
      : {}),
    ...(question.acceptedAnswers
      ? { acceptedAnswers: question.acceptedAnswers.map((answer) => substitute(answer, map)) }
      : {}),
    explanation: substitute(question.explanation, map),
  };
}

/**
 * The concept with this visit's sample substituted through every learner-facing content field.
 * Other concepts are returned untouched, so the authored catalogue remains the only source.
 */
export function randomizeConcept(
  concept: MicroConcept,
  sample: PrimitiveSample,
  random: () => number = Math.random
): MicroConcept {
  const map =
    concept.id === 'variables'
      ? variableMap(sample, random)
      : concept.id === 'int-float'
        ? intFloatMap(sample, random)
        : null;
  if (!map) return concept;

  const copy = JSON.parse(JSON.stringify(concept)) as MicroConcept;
  copy.teaching = copy.teaching.map((text) => substitute(text, map));
  copy.example = {
    code: substitute(copy.example.code, map),
    output: substitute(copy.example.output, map),
  };
  copy.walkthrough = copy.walkthrough.map((step) => mapStep(step, map));
  copy.diagnostics = copy.diagnostics.map((question) => mapQuestion(question, map));
  copy.practice = mapQuestion(copy.practice, map);
  copy.reviewPool = copy.reviewPool.map((question) => mapQuestion(question, map));
  copy.challenge = mapQuestion(copy.challenge, map);
  return copy;
}
