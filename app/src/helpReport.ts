/**
 * The report a stuck learner sends (`app/src/helpReport.ts`).
 *
 * `docs/PLAN-2.0-GAP.md` lists *"ask for help"* beside share links, and share is a link to the code,
 * not a description of what went wrong. The moment a learner needs a person is a failed run: they have
 * the lesson, the code they tried, the check that said no and Python's own last line — and all of it is
 * on screen and none of it is in a message. The next thing they do is retype it into a chat, minus the
 * half that mattered.
 *
 * This module turns that screen into one Markdown report, small enough to paste. Three rules:
 *
 * 1. **The report is text, and the app sends nothing.** There is no endpoint here: the sheet either
 *    copies the text or opens a pre-filled issue in a new tab, which the learner files themselves.
 *    The code is in it, so the sheet says where it goes rather than implying privacy it does not have.
 * 2. **The ladder is not in it.** Hints and the full solution are the course's own answer: a learner
 *    who has opened two rungs sends *how many*, never the rungs' text — otherwise the report is a way
 *    to read the answer out of a helper, and the helper's reply quotes it back.
 * 3. **Every cap is printed.** Code over 120 lines, output over 1,200 characters, a report over 4,000:
 *    each one ends with a sentence saying how much was left out, because a report that silently drops
 *    the failing line is worse than no cap at all.
 *
 * The whole thing is pure — no DOM, no clipboard, no `window` — so `npm run test:help` can pin the
 * caps, the sections and the fact that a hint's text never appears.
 */

import { REPO_ISSUES_URL, REPO_WEB_BASE } from './pageUrl.ts';

/** Lines of the learner's file a report carries before it says how many are missing. */
export const HELP_CODE_LINES = 120;
/** Characters of `stdout` and of `stderr` a report carries, each. */
export const HELP_BLOCK_CHARS = 1200;
/** Characters the learner's own question may take. */
export const HELP_QUESTION_CHARS = 500;
/** Characters of Markdown a report may be, before its last section says it was cut. */
export const HELP_MAX_CHARS = 4000;
/**
 * Characters the pre-filled issue URL may be.
 *
 * GitHub's own limit is not documented as a number, but a URL past a few thousand is cut by chat
 * clients and browsers alike, and the report is refused here rather than pasted in half. 7,000 leaves
 * room for the percent-encoding of a fenced code block *and* a title, measured below.
 */
export const HELP_ISSUE_URL_LIMIT = 7000;

export type Verdict =
  | 'untested'
  | 'passed'
  | 'harness_failed'
  | 'behavior_failed'
  | 'mismatch'
  | 'stopped'
  | 'error';

export interface HelpLesson {
  id: string;
  title: string;
  path: string;
}

/** One check that failed, in the panel's own words — never the hint that answers it. */
export interface HelpCheck {
  title: string;
  detail: string;
}

export interface HelpReportInput {
  lesson: HelpLesson;
  /** The text that ran: the editor's own, which is what the failure describes. */
  code: string;
  stdout: string;
  stderr: string;
  verdict: Verdict;
  /** The instructor's failure message, when the run reached the checks. */
  instructorError?: string;
  /** A capstone's metric line per failing metric, and how many were at target. */
  harness?: { met: number; total: number; failures: string[] } | null;
  /** The failure read by `traceback.ts`, and the explainer entry it matched. */
  failure?: { summary: string; line: number | null; entry: string | null } | null;
  /** Behaviour and/or presentation, as the checks panel names them. */
  checks?: HelpCheck[];
  /** How many runs this lesson has had, and how much of the ladder is open. */
  attempts: number;
  hintsRevealed: number;
  hintCount: number;
  /** The learner's own words, if they wrote any. */
  question?: string;
  /** The page this workbench is on, so a helper can open the same lesson. */
  url?: string;
}

export interface HelpReport {
  /** The Markdown to copy, or to paste as an issue's body. */
  markdown: string;
  /** The issue's title: the lesson, in one line. */
  title: string;
  characters: number;
  /** How many lines of code and characters of output were left out, for the sheet to say. */
  omitted: { codeLines: number; blocks: number };
}

/** The verdict as the panel's badge prints it. */
export function verdictLabel(input: Pick<HelpReportInput, 'verdict' | 'harness'>): string {
  switch (input.verdict) {
    case 'error':
      return 'ERROR · Syntax / Runtime Error';
    case 'harness_failed':
      return `HARNESS FAILED · ${input.harness?.met ?? 0} / ${input.harness?.total ?? 0} metrics at target`;
    case 'behavior_failed':
      return 'BEHAVIOR FAILED · Instructor Tests Failed';
    case 'mismatch':
      return 'BEHAVIOR PASSED · Output Format Differs';
    case 'stopped':
      return 'STOPPED · Loop Limit / Cancelled';
    case 'passed':
      return 'PASS · Behaviour and output verified';
    default:
      return 'No run yet';
  }
}

/** The lesson's page on GitHub, for the report's header. */
function lessonPage(lesson: HelpLesson): string {
  return `${REPO_WEB_BASE}blob/main/${lesson.path}`;
}

/** Cut a block to a character cap, returning the text and whether it was cut. */
function capBlock(text: string, limit: number): { text: string; cut: boolean } {
  const trimmed = text.replace(/\s+$/, '');
  if (trimmed.length <= limit) return { text: trimmed, cut: false };
  return { text: trimmed.slice(0, limit), cut: true };
}

/** The learner's code, with the omission sentence when it was too long. */
function codeSection(code: string): { body: string; omitted: number } {
  const lines = code.replace(/\s+$/, '').split('\n');
  if (lines.length <= HELP_CODE_LINES) {
    return { body: `\`\`\`python\n${lines.join('\n')}\n\`\`\``, omitted: 0 };
  }
  const kept = lines.slice(0, HELP_CODE_LINES);
  const omitted = lines.length - HELP_CODE_LINES;
  return {
    body: `\`\`\`python\n${kept.join('\n')}\n# … ${omitted} more line${omitted === 1 ? '' : 's'} not included\n\`\`\``,
    omitted,
  };
}

/**
 * Build the report.
 *
 * The sections that do not apply are left out rather than printed empty: a runtime error has no
 * "checks that failed" list, and a check failure has no traceback. A header, the learner's question,
 * what failed, the code and the output are what every report has.
 */
export function buildHelpReport(input: HelpReportInput): HelpReport {
  const title = `Stuck on ${input.lesson.id} · ${input.lesson.title}`;
  const parts: string[] = [];
  const blocks: string[] = [];

  parts.push(`# ${title}`);
  parts.push(
    [
      `**Verdict:** ${verdictLabel(input)}`,
      `**Lesson:** \`${input.lesson.path}\` · ${lessonPage(input.lesson)}`,
      `**Attempts on this lesson:** ${input.attempts} · **Hints opened:** ${input.hintsRevealed} of ${input.hintCount}`,
      input.url ? `**This page:** ${input.url}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  );

  // The human half. Trimmed, and worth a section of its own: without it the report is a dump, and the
  // person answering has to guess what was being tried.
  const question = String(input.question ?? '').trim().slice(0, HELP_QUESTION_CHARS);
  if (question) parts.push(`## What I was trying\n\n${question}`);

  if (input.failure) {
    const where = input.failure.line ? ` (line ${input.failure.line})` : '';
    const entry = input.failure.entry ? `\n\nExplainer entry: ${input.failure.entry}` : '';
    parts.push(`## The error${where}\n\n\`\`\`\n${input.failure.summary}\n\`\`\`${entry}`);
  }

  if (input.harness && input.harness.failures.length > 0) {
    const lines = input.harness.failures.map((line) => `- ${line}`).join('\n');
    parts.push(
      `## Metrics at target: ${input.harness.met} / ${input.harness.total}\n\n${lines}`
    );
  }

  if (input.checks && input.checks.length > 0) {
    const lines = input.checks.map((check) => `- **${check.title}** — ${check.detail}`).join('\n');
    parts.push(`## The check that said no\n\n${lines}`);
  }

  const code = codeSection(input.code);
  parts.push(`## My code\n\n${code.body}`);

  const out = capBlock(input.stdout, HELP_BLOCK_CHARS);
  const err = capBlock(input.stderr, HELP_BLOCK_CHARS);
  if (out.cut) blocks.push('stdout');
  if (err.cut) blocks.push('stderr');
  const output: string[] = [];
  if (out.text) output.push(`stdout:\n\`\`\`\n${out.text}\n\`\`\``);
  if (err.text) output.push(`stderr:\n\`\`\`\n${err.text}\n\`\`\``);
  if (input.instructorError && input.instructorError.trim()) {
    const instructor = capBlock(input.instructorError, HELP_BLOCK_CHARS);
    if (instructor.cut) blocks.push('the instructor’s message');
    output.push(`the check said:\n\`\`\`\n${instructor.text}\n\`\`\``);
  }
  if (output.length > 0) parts.push(`## Output\n\n${output.join('\n\n')}`);

  let markdown = parts.join('\n\n');
  if (markdown.length > HELP_MAX_CHARS) {
    const note = `\n\n_Report shortened: ${markdown.length - HELP_MAX_CHARS} characters were left out._`;
    markdown = `${markdown.slice(0, HELP_MAX_CHARS - note.length).trimEnd()}${note}`;
  }

  return {
    markdown,
    title,
    characters: markdown.length,
    omitted: { codeLines: code.omitted, blocks: blocks.length },
  };
}

export interface HelpIssue {
  ok: boolean;
  /** The pre-filled issue, when it fits. */
  url: string;
  /** Its length, whether it fits or not — the refusal prints it. */
  characters: number;
}

/**
 * The pre-filled issue, or the refusal.
 *
 * `issues/new` is GitHub's own form: the app opens a tab, and the learner presses the button that
 * files it. Nothing is posted from here, which is why a report can carry code without this app ever
 * being a party to where it ends up.
 */
export function helpIssueUrl(report: Pick<HelpReport, 'title' | 'markdown'>): HelpIssue {
  const params = new URLSearchParams({ title: report.title, body: report.markdown });
  const url = `${REPO_ISSUES_URL}?${params.toString()}`;
  return { ok: url.length <= HELP_ISSUE_URL_LIMIT, url, characters: url.length };
}
