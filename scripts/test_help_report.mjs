#!/usr/bin/env node
/**
 * The stuck report, without a browser (`scripts/test_help_report.mjs`, `npm run test:help`)
 *
 * An "ask for help" button is a message with a cap on it, and the failures worth pinning are all in
 * the text, not the sheet:
 *
 * 1. **It says what failed, in the panel's words.** The lesson, the verdict, the line, the check's
 *    own detail and the explainer entry — a helper who reads the report should not have to ask which
 *    lesson or which red badge it was.
 * 2. **The ladder stays out.** Hints and the solution are the course's answer; the report prints how
 *    many rungs are open, never their text, so a report cannot be a way to read the answer.
 * 3. **Every cap says how much it dropped.** 120 lines of code, 1,200 characters per output block,
 *    4,000 characters of report — each one names what was left out, because a report that silently
 *    loses the failing line is a report that lies.
 * 4. **The issue door is measured, not assumed.** The URL is GitHub's own `issues/new`, the body
 *    round-trips through `URLSearchParams` (a `<` in a learner's string is data, not markup), and a
 *    report too long for a URL is refused with its size rather than pasted in half.
 *
 * Run: node --experimental-strip-types scripts/test_help_report.mjs
 */

import assert from 'node:assert/strict';
import {
  HELP_BLOCK_CHARS,
  HELP_CODE_LINES,
  HELP_ISSUE_URL_LIMIT,
  HELP_MAX_CHARS,
  HELP_QUESTION_CHARS,
  buildHelpReport,
  helpIssueUrl,
  verdictLabel,
} from '../app/src/helpReport.ts';
import { REPO_ISSUES_URL, REPO_PAGE_BASE } from '../app/src/pageUrl.ts';

let passed = 0;
let failed = 0;

function section(title) {
  console.log(`\n${title}`);
}

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL ${name}\n       ${error.message}`);
  }
}

const LESSON = {
  id: 'P.2',
  title: 'Operators and Expressions',
  path: 'track-p/P.2-operators-and-expressions.md',
};

/** A report input with the failure a runtime error leaves: a traceback and no failing check. */
function runtimeInput(overrides = {}) {
  return {
    lesson: LESSON,
    code: 'x = 1\ny = x / 0\nprint(y)',
    stdout: '',
    stderr:
      'Traceback (most recent call last):\n  File "main.py", line 2, in <module>\n    y = x / 0\nZeroDivisionError: division by zero',
    verdict: 'error',
    failure: {
      summary: 'ZeroDivisionError: division by zero',
      line: 2,
      entry: '#4 · ZeroDivisionError in a rate or average',
    },
    attempts: 2,
    hintsRevealed: 1,
    hintCount: 3,
    question: 'I expected 4.0 and it says division by zero.',
    url: 'https://example.test/?lesson=P.2',
    ...overrides,
  };
}

section('the report names the lesson and the failure');

check('the title is the lesson id and its title, in one line', () => {
  const report = buildHelpReport(runtimeInput());
  assert.equal(report.title, 'Stuck on P.2 · Operators and Expressions');
  assert.ok(report.markdown.startsWith(`# ${report.title}`), 'the heading is the same sentence');
});

check('the verdict, the page and the page URL are all in it', () => {
  const { markdown } = buildHelpReport(runtimeInput());
  assert.ok(markdown.includes('**Verdict:** ERROR · Syntax / Runtime Error'), markdown);
  assert.ok(markdown.includes(`${REPO_PAGE_BASE}${LESSON.path}`), 'the lesson page, on the repo');
  assert.ok(markdown.includes('https://example.test/?lesson=P.2'), 'the page it happened on');
});

check('the error section names the line and the explainer entry', () => {
  const { markdown } = buildHelpReport(runtimeInput());
  assert.ok(markdown.includes('## The error (line 2)'), markdown);
  assert.ok(markdown.includes('ZeroDivisionError: division by zero'));
  assert.ok(markdown.includes('#4 · ZeroDivisionError in a rate or average'));
});

check('the attempts and how much of the ladder is open are printed', () => {
  const { markdown } = buildHelpReport(runtimeInput());
  assert.ok(markdown.includes('**Attempts on this lesson:** 2 · **Hints opened:** 1 of 3'), markdown);
});

check("the learner's own words open the report, trimmed", () => {
  const { markdown } = buildHelpReport(runtimeInput({ question: '   I expected 4.0   ' }));
  assert.ok(markdown.includes('## What I was trying\n\nI expected 4.0'), markdown);
});

check('a report with no question has no empty section', () => {
  const { markdown } = buildHelpReport(runtimeInput({ question: '   ' }));
  assert.ok(!markdown.includes('## What I was trying'), 'no heading for nothing');
});

check('the question is capped, and says where it stopped', () => {
  const { markdown } = buildHelpReport(runtimeInput({ question: 'x'.repeat(HELP_QUESTION_CHARS + 80) }));
  assert.ok(markdown.includes('x'.repeat(HELP_QUESTION_CHARS)));
  assert.ok(!markdown.includes('x'.repeat(HELP_QUESTION_CHARS + 1)), 'one character past the cap');
});

section('a failed check and a capstone report their own shapes');

check('each failing check is a line in the checks section, with its detail', () => {
  const { markdown } = buildHelpReport(
    runtimeInput({
      verdict: 'behavior_failed',
      failure: null,
      stderr: '',
      instructorError: 'AssertionError: expected 400, got 425',
      checks: [
        { title: 'Behaviour', detail: 'expected 400, got 425' },
        { title: 'Presentation', detail: 'line 6 differs' },
      ],
    })
  );
  assert.ok(markdown.includes('## The check that said no'), markdown);
  assert.ok(markdown.includes('- **Behaviour** — expected 400, got 425'));
  assert.ok(markdown.includes('- **Presentation** — line 6 differs'));
  assert.ok(markdown.includes('the check said:\n```\nAssertionError: expected 400, got 425'), markdown);
});

check('a capstone carries its failing metric lines, not just the count', () => {
  const { markdown } = buildHelpReport(
    runtimeInput({
      verdict: 'harness_failed',
      failure: null,
      stderr: '',
      harness: { met: 3, total: 5, failures: ['settling time 0.8 s (target 0.5)', 'overshoot 12% (target 5%)'] },
    })
  );
  assert.ok(markdown.includes('## Metrics at target: 3 / 5'), markdown);
  assert.ok(markdown.includes('- settling time 0.8 s (target 0.5)'));
  assert.ok(markdown.includes('HARNESS FAILED · 3 / 5 metrics at target'));
});

check('a stop is a verdict with no error section', () => {
  const { markdown } = buildHelpReport(
    runtimeInput({ verdict: 'stopped', failure: null, stderr: '' })
  );
  assert.ok(markdown.includes('STOPPED · Loop Limit / Cancelled'), markdown);
  assert.ok(!markdown.includes('## The error'), 'there is no traceback to report');
});

check('every verdict has a sentence', () => {
  for (const verdict of ['untested', 'passed', 'harness_failed', 'behavior_failed', 'mismatch', 'stopped', 'error']) {
    assert.ok(verdictLabel({ verdict, harness: null }).length > 3, `no label for ${verdict}`);
  }
});

section('the ladder never leaves the page');

check('a hint’s text is not in the report, only how many are open', () => {
  const hint = 'Try the ceiling operator: math.ceil(x / y) rounds up.';
  const lesson = { ...LESSON, hints: [hint] };
  const { markdown } = buildHelpReport(runtimeInput({ lesson, hintsRevealed: 3, hintCount: 3 }));
  assert.ok(!markdown.includes('math.ceil'), 'the hint text must not be copied into a message');
  assert.ok(markdown.includes('3 of 3'), 'the count is the part a helper needs');
});

section('the code and the output are capped, and each cap is printed');

check(`code over ${HELP_CODE_LINES} lines keeps the first ${HELP_CODE_LINES} and says how many are missing`, () => {
  const code = Array.from({ length: 200 }, (_, index) => `value_${index + 1} = ${index + 1}`).join('\n');
  const report = buildHelpReport(runtimeInput({ code }));
  assert.ok(report.markdown.includes('value_1 = 1'));
  assert.ok(report.markdown.includes(`value_${HELP_CODE_LINES} = ${HELP_CODE_LINES}`));
  assert.ok(!report.markdown.includes(`value_${HELP_CODE_LINES + 1} =`), 'line 121 is out');
  assert.ok(report.markdown.includes('# … 80 more lines not included'), report.markdown.slice(0, 400));
  assert.equal(report.omitted.codeLines, 80);
});

check(`each output block is capped at ${HELP_BLOCK_CHARS} characters`, () => {
  const report = buildHelpReport(runtimeInput({ stdout: 'a'.repeat(HELP_BLOCK_CHARS + 400), stderr: '' }));
  assert.ok(report.markdown.includes('a'.repeat(HELP_BLOCK_CHARS)));
  assert.ok(!report.markdown.includes('a'.repeat(HELP_BLOCK_CHARS + 1)));
  assert.equal(report.omitted.blocks, 1);
});

check(`the whole report is capped at ${HELP_MAX_CHARS} characters, and says so`, () => {
  // Each section is inside its own cap and the report is still over: 120 long code lines plus two
  // capped output blocks. That is the case the report cap exists for.
  const code = Array.from({ length: 130 }, (_, index) => `value_${index} = "${'p'.repeat(60)}"`).join('\n');
  const report = buildHelpReport(
    runtimeInput({ code, stdout: 'b'.repeat(5000), instructorError: 'c'.repeat(5000) })
  );
  assert.ok(report.characters <= HELP_MAX_CHARS, `report was ${report.characters}`);
  assert.ok(report.markdown.includes('_Report shortened:'), 'a silent cut is not allowed');
});

check('a short report is not marked as shortened', () => {
  const report = buildHelpReport(runtimeInput());
  assert.ok(!report.markdown.includes('Report shortened'));
  assert.equal(report.omitted.codeLines, 0);
  assert.equal(report.omitted.blocks, 0);
});

section('the issue link');

check('it is GitHub’s own new-issue form, for this repository', () => {
  const report = buildHelpReport(runtimeInput());
  const issue = helpIssueUrl(report);
  assert.equal(REPO_ISSUES_URL, 'https://github.com/TLE47/Mechatronics-Roadmap/issues/new');
  assert.ok(issue.ok, `refused at ${issue.characters}`);
  assert.ok(issue.url.startsWith(`${REPO_ISSUES_URL}?`), issue.url.slice(0, 80));
});

check('the title and the whole body round-trip through the query string', () => {
  const report = buildHelpReport(runtimeInput({ question: 'Why does `x < 3` fail?' }));
  const params = new URL(helpIssueUrl(report).url).searchParams;
  assert.equal(params.get('title'), report.title);
  assert.equal(params.get('body'), report.markdown);
  assert.ok(params.get('body').includes('x < 3'), 'a `<` in the learner’s words is data, not markup');
});

check('a report too long for a URL is refused, with its measured size', () => {
  const body = 'c'.repeat(HELP_ISSUE_URL_LIMIT);
  const issue = helpIssueUrl({ title: 'Stuck', markdown: body });
  assert.equal(issue.ok, false);
  assert.ok(issue.characters > HELP_ISSUE_URL_LIMIT, `measured ${issue.characters}`);
  assert.equal(issue.url.length, issue.characters);
});

check('a capped report from the builder always fits the issue limit', () => {
  const worst = buildHelpReport(
    runtimeInput({
      code: Array.from({ length: 400 }, (_, index) => `value_${index} = "päth with spaces and \`ticks\`"`).join('\n'),
      stdout: 'é'.repeat(5000),
      stderr: 'ü'.repeat(5000),
      instructorError: 'ö'.repeat(5000),
      question: 'q'.repeat(HELP_QUESTION_CHARS),
    })
  );
  const issue = helpIssueUrl(worst);
  assert.ok(issue.ok, `the worst encoded report was ${issue.characters} characters`);
});

console.log(`\nhelp report: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
