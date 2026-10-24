import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardCopy, ExternalLink, LifeBuoy, X } from 'lucide-react';
import {
  HELP_BLOCK_CHARS,
  HELP_CODE_LINES,
  HELP_QUESTION_CHARS,
  buildHelpReport,
  helpIssueUrl,
  type HelpReportInput,
} from '../helpReport';

interface HelpSheetProps {
  /** Everything the failed run left on screen; the report is built from it. */
  input: HelpReportInput;
  onClose: () => void;
}

/**
 * Ask for help (`app/src/components/HelpSheet.tsx`).
 *
 * A failed run leaves four things a helper needs — the lesson, the code, what the check said, and
 * Python's own last line — and the learner is expected to retype all four into a chat. This sheet
 * assembles them into one message, and then gets out of the way: **Copy report** puts it on the
 * clipboard, **Open a GitHub issue** opens GitHub's own new-issue form with the text already in it.
 *
 * Three rules, each of them about honesty rather than convenience:
 *
 * 1. **Nothing is sent from here.** There is no endpoint in this app; the learner copies text or files
 *    an issue themselves. The footer says so, and says that the code is in the report.
 * 2. **The preview is the report.** The `<pre>` is the exact string the Copy button writes and the
 *    issue's body, so nobody sends something they have not seen — including the caps' own sentences.
 * 3. **The question comes first.** The textarea is focused on open because the one thing a report
 *    cannot infer is what the learner was trying to do; the rest is a dump without it.
 */
export const HelpSheet: React.FC<HelpSheetProps> = ({ input, onClose }) => {
  const [question, setQuestion] = useState('');
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const questionRef = useRef<HTMLTextAreaElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const report = useMemo(
    () => buildHelpReport({ ...input, question }),
    [input, question]
  );
  const issue = useMemo(() => helpIssueUrl(report), [report]);

  useEffect(() => {
    questionRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report.markdown);
      setStatus('copied');
    } catch {
      // The text is on screen and selectable: a blocked clipboard costs the button, not the report.
      setStatus('failed');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/65 p-4 pt-[8vh]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        data-testid="help-sheet"
        className="flex max-h-[84vh] w-full max-w-2xl flex-col overflow-hidden rounded-[var(--r-lg)] border shadow-2xl"
        style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border-strong)' }}
      >
        <div
          className="flex items-center justify-between gap-3 border-b px-4 py-3"
          style={{ borderColor: 'var(--border)' }}
        >
          <h2
            id="help-title"
            className="flex items-center gap-2 text-[13.5px] font-semibold"
            style={{ color: 'var(--text)' }}
          >
            <LifeBuoy className="h-4 w-4 shrink-0" style={{ color: 'var(--accent)' }} aria-hidden="true" />
            Ask for help
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            data-testid="btn-close-help"
            aria-label="Close the help sheet"
            className="btn"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Close</span>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <label
            htmlFor="help-question"
            className="block text-[11.5px] font-mono"
            style={{ color: 'var(--muted)' }}
          >
            What were you trying to do? ({HELP_QUESTION_CHARS - question.length} characters left)
          </label>
          <textarea
            id="help-question"
            ref={questionRef}
            data-testid="help-question"
            value={question}
            maxLength={HELP_QUESTION_CHARS}
            onChange={(event) => setQuestion(event.target.value)}
            rows={2}
            placeholder="I expected 4.0 and it says division by zero."
            className="mt-1 w-full resize-y rounded border px-2 py-1.5 text-[12px]"
            style={{
              backgroundColor: 'var(--bg)',
              borderColor: 'var(--border)',
              color: 'var(--text)',
            }}
          />

          <p className="mt-2 text-[11px]" style={{ color: 'var(--dim)' }}>
            This is the message, as it will be sent: the lesson, this run&rsquo;s verdict, what the
            check said, your code and its output. Hints and the full solution are never included.
          </p>

          <pre
            data-testid="help-preview"
            className="mt-2 max-h-[34vh] overflow-auto rounded border p-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap"
            style={{
              backgroundColor: 'var(--bg)',
              borderColor: 'var(--border)',
              color: 'var(--text)',
            }}
          >
            {report.markdown}
          </pre>

          {report.omitted.codeLines > 0 || report.omitted.blocks > 0 ? (
            <p className="mt-1.5 text-[11px]" style={{ color: 'var(--amber)' }} data-testid="help-capped">
              {report.omitted.codeLines > 0
                ? `The first ${HELP_CODE_LINES} lines of code are in it; ${report.omitted.codeLines} more are not.`
                : ''}
              {report.omitted.codeLines > 0 && report.omitted.blocks > 0 ? ' ' : ''}
              {report.omitted.blocks > 0
                ? `${report.omitted.blocks} output block${report.omitted.blocks === 1 ? ' was' : 's were'} cut to ${HELP_BLOCK_CHARS.toLocaleString()} characters.`
                : ''}
            </p>
          ) : null}

          <p role="status" data-testid="help-status" className="mt-2 min-h-[1.1rem] text-[11px]">
            {status === 'copied' && (
              <span style={{ color: 'var(--emerald)' }}>
                Copied — {report.characters.toLocaleString()} characters. Paste it wherever you are
                asking.
              </span>
            )}
            {status === 'failed' && (
              <span style={{ color: 'var(--rose)' }}>
                The clipboard refused. Select the text above and copy it by hand — the app cannot
                send it for you.
              </span>
            )}
            {status === 'idle' && !issue.ok && (
              <span style={{ color: 'var(--rose)' }}>
                Too long for a GitHub issue link ({issue.characters.toLocaleString()} characters) —
                copy the report instead.
              </span>
            )}
          </p>
        </div>

        <div
          className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5"
          style={{ borderColor: 'var(--border)' }}
        >
          <p className="max-w-[28rem] text-[11px]" style={{ color: 'var(--dim)' }}>
            Nothing is sent from this app: you copy the report, or you file the issue. It contains
            your code — send it where you would send the file.
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              data-testid="btn-copy-help"
              onClick={() => void copy()}
              className="flex cursor-pointer items-center gap-1.5 rounded border px-2.5 py-1 font-mono text-[11px]"
              style={{ borderColor: 'var(--border-strong)', color: 'var(--text)' }}
            >
              <ClipboardCopy className="h-3.5 w-3.5" aria-hidden="true" />
              Copy report
            </button>
            {issue.ok ? (
              <a
                data-testid="btn-open-help-issue"
                href={issue.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded border px-2.5 py-1 font-mono text-[11px]"
                style={{
                  borderColor: 'var(--accent)',
                  color: 'var(--accent)',
                }}
                title="Open GitHub's new-issue form with this report already in it — you press the button that files it"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                Open a GitHub issue
              </a>
            ) : (
              <span
                aria-disabled="true"
                data-testid="btn-open-help-issue-disabled"
                className="flex items-center gap-1.5 rounded border px-2.5 py-1 font-mono text-[11px]"
                style={{ borderColor: 'var(--border)', color: 'var(--faint)' }}
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                Open a GitHub issue
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
