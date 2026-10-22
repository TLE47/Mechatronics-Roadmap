/**
 * Predict first: the learner's committed guess about a lesson's output (`app/src/predictGate.ts`).
 *
 * Every page in the course runs the same eight moves, and the third is *Predict* — "commit to a
 * quantitative or directional prediction before running anything" (`docs/SYLLABUS.md`). The pages
 * print it as a paragraph; the workbench, where the running actually happens, asked nothing. A
 * learner could press Run on the starter, read the answer off the screen and never commit to
 * anything, which is the one habit the ladder is built to prevent: a result that was not expected is
 * not remembered, and a result that was guessed and missed is.
 *
 * So the first run of a lesson asks a question instead of starting one: *what will this print?* The
 * answer is judged against the lesson's own `expectedOutput` — which exists before any run, so the
 * verdict costs no interpreter time — and stored with the lesson, so the question is asked once
 * rather than nagged on every run.
 *
 * The rules, because grading a free-text prediction has to be stated rather than felt:
 *
 * - **Lines, not strings.** Each line is trimmed and its inner whitespace collapsed, so `a  =  1`
 *   and `a = 1` are the same prediction; blank lines are dropped, because a trailing newline is not
 *   a claim about anything.
 * - **Case and punctuation count.** `true` is not `True` in Python, and a prediction that says so is
 *   wrong in a way the learner should see; nothing is lowercased.
 * - **Four verdicts, named for what happened**: `match` (every line, in order), `reordered` (every
 *   line but not in that order), `partial` (some lines — the count is reported), `miss` (none).
 * - **No fuzzy distance.** An edit distance on numbers would need a tolerance, and a tolerance is a
 *   judgement the copy cannot show the learner. `1.20` and `1.2` are different predictions here, and
 *   the run that follows is where the learner sees why.
 * - **Skipping is a record too.** A learner with a cold hand can run without predicting — but the
 *   skip is stored with a timestamp, so "predicted" and "skipped" stay distinguishable instead of
 *   the gate quietly counting every run as a prediction. Nothing is ever blocked for good.
 *
 * The store is small and bounded like the other learning stores, and — like the sitting clock and the
 * paint samples — it is not in the backup: it describes the visit as much as the work.
 */

import { bulkStorage } from './bulkStorage.ts';

export type PredictVerdict = 'match' | 'reordered' | 'partial' | 'miss';

export interface PredictionRecord {
  lessonId: string;
  /** What the learner typed, verbatim, so the card can show it back. */
  text: string;
  /** Judged at the moment of commit, against the lesson's `expectedOutput`. */
  verdict: PredictVerdict;
  /** How many of the prediction's lines appear in the expected output (multiplicity counted). */
  matchedLines: number;
  /** How many non-blank lines the prediction had. */
  predictedLines: number;
  /** True when the learner pressed Skip: a record of a decision, not of a prediction. */
  skipped: boolean;
  /** Milliseconds since the epoch, for "you said this before the run". */
  at: number;
}

export interface PredictionCheck {
  verdict: PredictVerdict;
  matchedLines: number;
  predictedLines: number;
  /** The prediction's lines that the expected output does not have, in the order they were written. */
  missing: string[];
}

export const PREDICTIONS_KEY = 'mechalab_predictions_v1';
export const PREDICTIONS_SCHEMA = 'mechalab.predictions/1';
/** Lessons remembered. The course ships ~50 workbench entries; this leaves room to revisit each once. */
export const MAX_PREDICTIONS = 120;
/** A prediction is one or two lines of output, not a file. */
export const MAX_PREDICTION_CHARS = 2_000;

/** The lines a prediction is compared by: trimmed, inner whitespace collapsed, blanks dropped. */
export function predictionLines(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .filter((line) => line.length > 0);
}

function countLines(lines: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const line of lines) counts.set(line, (counts.get(line) ?? 0) + 1);
  return counts;
}

/**
 * Judge a prediction against the expected output.
 *
 * An empty prediction is never judged: the caller refuses to commit one, so `checkPrediction('', …)`
 * answers `miss` with nothing matched rather than inventing a pass.
 */
export function checkPrediction(prediction: string, expectedOutput: string): PredictionCheck {
  const predicted = predictionLines(prediction);
  if (!predicted.length) return { verdict: 'miss', matchedLines: 0, predictedLines: 0, missing: [] };

  const expected = predictionLines(expectedOutput);
  const remaining = countLines(expected);
  const missing: string[] = [];
  let matchedLines = 0;
  for (const line of predicted) {
    const left = remaining.get(line) ?? 0;
    if (left > 0) {
      matchedLines += 1;
      remaining.set(line, left - 1);
    } else {
      missing.push(line);
    }
  }

  let verdict: PredictVerdict;
  if (matchedLines === predicted.length && predicted.length === expected.length) {
    // Every line accounted for and no line to spare: identical as a sequence, or as a set.
    verdict = predicted.every((line, index) => line === expected[index]) ? 'match' : 'reordered';
  } else if (matchedLines === 0) {
    verdict = 'miss';
  } else {
    verdict = 'partial';
  }
  return { verdict, matchedLines, predictedLines: predicted.length, missing };
}

/** `3 of 3 lines, in order` — the shape the card prints, kept here so the suite pins the wording. */
export function describeCheck(
  check: Pick<PredictionCheck, 'verdict' | 'matchedLines' | 'predictedLines'>
): string {
  if (!check.predictedLines) return 'nothing predicted';
  if (check.verdict === 'match') return 'exact';
  if (check.verdict === 'reordered') return 'the right lines, in a different order';
  return `${check.matchedLines} of ${check.predictedLines} line${check.predictedLines === 1 ? '' : 's'}`;
}

interface PredictionsFile {
  schema: string;
  records: PredictionRecord[];
}

function storage(): Storage | null {
  return bulkStorage();
}

function readAll(): PredictionRecord[] {
  const store = storage();
  if (!store) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(store.getItem(PREDICTIONS_KEY) ?? 'null');
  } catch {
    return [];
  }
  const file = parsed as PredictionsFile | null;
  if (!file || file.schema !== PREDICTIONS_SCHEMA || !Array.isArray(file.records)) return [];
  // A record missing its lesson id or verdict is not readable by anything downstream; drop it rather
  // than letting a corrupt entry stand in for a prediction the learner never made.
  return file.records.filter(
    (record) =>
      record &&
      typeof record.lessonId === 'string' &&
      typeof record.text === 'string' &&
      typeof record.at === 'number' &&
      (record.verdict === 'match' ||
        record.verdict === 'reordered' ||
        record.verdict === 'partial' ||
        record.verdict === 'miss')
  );
}

function writeAll(records: PredictionRecord[]): void {
  const store = storage();
  if (!store) return;
  const trimmed = records.slice(Math.max(0, records.length - MAX_PREDICTIONS));
  const file: PredictionsFile = { schema: PREDICTIONS_SCHEMA, records: trimmed };
  store.setItem(PREDICTIONS_KEY, JSON.stringify(file));
}

/** Every record, oldest first. */
export function readPredictions(): PredictionRecord[] {
  return readAll();
}

/** This lesson's record, or null when it has not been asked (or was cleared). */
export function predictionFor(lessonId: string): PredictionRecord | null {
  const records = readAll();
  for (let index = records.length - 1; index >= 0; index -= 1) {
    if (records[index].lessonId === lessonId) return records[index];
  }
  return null;
}

/**
 * Store a commit for one lesson, replacing any earlier one.
 *
 * Replacing rather than appending is what makes "Predict again" a real second attempt: the card reads
 * one record per lesson, so a learner who revises their guess sees the revision, and the store cannot
 * grow a history of guesses per lesson that nothing reads.
 */
export function savePrediction(record: PredictionRecord): PredictionRecord {
  const text = record.text.slice(0, MAX_PREDICTION_CHARS);
  const stored: PredictionRecord = { ...record, text };
  writeAll([...readAll().filter((entry) => entry.lessonId !== record.lessonId), stored]);
  return stored;
}

/** Forget one lesson's commit, so the question is asked again. */
export function clearPrediction(lessonId: string): void {
  const records = readAll();
  const kept = records.filter((entry) => entry.lessonId !== lessonId);
  if (kept.length === records.length) return;
  writeAll(kept);
}

/** Forget everything — the tests use this, and so does a wiped browser. */
export function clearAllPredictions(): void {
  const store = storage();
  if (!store) return;
  store.removeItem(PREDICTIONS_KEY);
}
