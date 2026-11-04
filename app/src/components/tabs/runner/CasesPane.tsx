import { CheckCircle2, CircleDashed, ListChecks, XCircle } from 'lucide-react';
import { CASE_STATE_LABEL, caseSummary, lessonCases, type LessonCase } from '../../../lessonCases';
import type { PythonLessonItem } from '../../../data/pythonLessonsData';

/**
 * The Cases tab (`components/tabs/runner/CasesPane.tsx`).
 *
 * The instructor's behavioural checks are a set of substituted inputs, and a run stops at the first
 * one that does not hold. This pane is that set, in the lesson's own order, with the three things a
 * learner can actually do something about: which cases the run proved, which one broke, and which
 * ones it never reached.
 *
 * It is a tab rather than a paragraph under the assessment badges because it is a different
 * question. The badge answers "did it pass"; this answers "what did it try" — and the second one is
 * what a learner needs when the answer is no.
 */

interface CasesPaneProps {
  lesson: PythonLessonItem;
  passStatus: string;
  instructorError: string;
}

function StateIcon({ state }: { state: LessonCase['state'] }) {
  if (state === 'passed') {
    return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald" aria-hidden="true" />;
  }
  if (state === 'failed') {
    return <XCircle className="h-3.5 w-3.5 shrink-0 text-rose" aria-hidden="true" />;
  }
  return <CircleDashed className="h-3.5 w-3.5 shrink-0 text-faint" aria-hidden="true" />;
}

const STATE_TONE: Record<LessonCase['state'], string> = {
  passed: 'text-emerald',
  failed: 'text-rose',
  unchecked: 'text-muted',
  untested: 'text-faint',
};

export function CasesPane({ lesson, passStatus, instructorError }: CasesPaneProps) {
  const cases = lessonCases(lesson, { passStatus, instructorError });
  const failed = cases.filter((entry) => entry.state === 'failed').length;

  return (
    <div
      data-testid="cases-pane"
      className="flex h-full min-h-0 flex-col border-t border-line-soft bg-panel"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-3 py-2">
        <ListChecks className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
        <span className="font-mono text-[11.5px] font-bold uppercase tracking-[0.08em] text-accent">
          Behavioural cases
        </span>
        <span
          data-testid="cases-summary"
          className={`font-mono text-[11px] ${failed ? 'text-rose' : 'text-muted'}`}
        >
          {caseSummary(cases)}
        </span>
        <span className="ml-auto font-mono text-[11px] text-faint">
          Each case replaces the lesson&apos;s numbers with its own
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
        {cases.length === 0 ? (
          <p className="text-[12px] text-muted">This lesson ships no behavioural cases.</p>
        ) : (
          <ul data-testid="cases-list" className="space-y-1">
            {cases.map((entry, index) => (
              <li
                key={entry.id}
                data-testid={`case-${index}`}
                data-state={entry.state}
                title={entry.label}
                className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[11.5px] leading-snug ${
                  entry.state === 'failed'
                    ? 'border-rose/40 bg-rose/[0.06]'
                    : 'border-line-soft bg-canvas/60'
                }`}
              >
                <StateIcon state={entry.state} />
                <span className="min-w-0 flex-1">
                  <span className="block text-body">{entry.label}</span>
                  {entry.values.length > 0 && (
                    <span className="mt-0.5 flex flex-wrap gap-1">
                      {entry.values.map((value) => (
                        <code
                          key={value}
                          className="rounded border border-line-soft bg-canvas px-1 font-mono text-[11px] text-muted"
                        >
                          {value}
                        </code>
                      ))}
                    </span>
                  )}
                </span>
                <span
                  data-testid={`case-state-${index}`}
                  className={`shrink-0 font-mono text-[11px] uppercase tracking-[0.08em] ${STATE_TONE[entry.state]}`}
                >
                  {CASE_STATE_LABEL[entry.state]}
                </span>
              </li>
            ))}
          </ul>
        )}
        {failed > 0 && (
          <p className="mt-2 rounded-lg border border-line-soft bg-canvas/60 px-2.5 py-2 font-mono text-[11px] leading-snug text-muted">
            The check stops at the first case that does not hold, so the cases after it are not run
            yet. Fix this one and run again.
          </p>
        )}
      </div>
    </div>
  );
}
