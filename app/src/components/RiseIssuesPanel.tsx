import React, { useEffect, useState } from 'react';
import { ExternalLink, GitPullRequest } from 'lucide-react';

/**
 * Open `link-rise` issues, read live from the GitHub API.
 *
 * The weekly sweep files one issue per distinct set of newly unverified URLs and closes it once
 * those URLs verify again (`scripts/file_rise_issue.py`). That lifecycle lives on GitHub, not in
 * the repository, so this panel fetches it instead of plotting a committed snapshot that would be
 * wrong the moment someone closed an issue. The URL is public and read-only; no token is involved.
 *
 * Failure is a state, not a crash: a rate limit, an offline browser or a blocked API call renders
 * a link to the same filter on GitHub, because the tab still has history to show.
 */

const REPO = 'TLE47/Mechatronics-Roadmap';
const ISSUES_API = `https://api.github.com/repos/${REPO}/issues?state=open&labels=link-rise&per_page=30`;
const LABEL_URL = `https://github.com/${REPO}/issues?q=is%3Aissue+is%3Aopen+label%3Alink-rise`;

interface RiseIssue {
  number: number;
  title: string;
  htmlUrl: string;
  createdAt: string;
}

type PanelState =
  | { status: 'loading'; issues: RiseIssue[]; error?: undefined }
  | { status: 'ready'; issues: RiseIssue[]; error?: undefined }
  | { status: 'error'; issues: RiseIssue[]; error: string };

function ageLabel(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  const days = Math.max(0, Math.floor((Date.now() - ms) / 86_400_000));
  if (days === 0) return 'today';
  return days === 1 ? '1 day old' : `${days} days old`;
}

export const RiseIssuesPanel: React.FC = () => {
  const [state, setState] = useState<PanelState>({ status: 'loading', issues: [] });

  useEffect(() => {
    const controller = new AbortController();
    fetch(ISSUES_API, {
      signal: controller.signal,
      headers: { Accept: 'application/vnd.github+json' },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
        const payload: unknown = await response.json();
        if (!Array.isArray(payload)) throw new Error('GitHub returned an unexpected payload');
        // Pull requests share the issues endpoint; a PR is not a rise issue.
        const issues: RiseIssue[] = payload
          .filter((item: any) => item && !item.pull_request && typeof item.number === 'number')
          .map((item: any) => ({
            number: item.number,
            title: String(item.title ?? ''),
            htmlUrl: String(item.html_url ?? LABEL_URL),
            createdAt: String(item.created_at ?? ''),
          }));
        setState({ status: 'ready', issues });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: 'error',
          issues: [],
          error: error instanceof Error ? error.message : String(error),
        });
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="bg-[#111827] border border-[#334155] rounded-xl p-4" data-testid="rise-issues-panel">
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-2">
        <h2 className="text-sm font-bold text-[#38bdf8] flex items-center gap-2">
          <GitPullRequest size={14} /> Open rise issues
          {state.status === 'ready' && (
            <span className="font-mono text-[0.72rem] text-[#94a3b8] font-normal">({state.issues.length})</span>
          )}
        </h2>
        <a
          href={LABEL_URL}
          target="_blank"
          rel="noreferrer"
          className="text-[0.7rem] text-[#38bdf8] hover:underline flex items-center gap-1"
        >
          label: link-rise <ExternalLink size={11} />
        </a>
      </div>

      {state.status === 'loading' && (
        <p className="text-xs text-[#94a3b8]" data-testid="rise-issues-loading">
          Reading open issues from GitHub…
        </p>
      )}

      {state.status === 'error' && (
        <p className="text-xs text-[#fbbf24] leading-relaxed" data-testid="rise-issues-error">
          Could not reach the GitHub API ({state.error}).{' '}
          <a href={LABEL_URL} target="_blank" rel="noreferrer" className="underline">
            Open the label on GitHub
          </a>
          .
        </p>
      )}

      {state.status === 'ready' && state.issues.length === 0 && (
        <p className="text-xs text-[#34d399] leading-relaxed" data-testid="rise-issues-empty">
          None open. A sweep that finds newly unverified URLs files one here; a later sweep closes
          it once those URLs verify again.
        </p>
      )}

      {state.status === 'ready' && state.issues.length > 0 && (
        <ul className="space-y-1.5">
          {state.issues.map((issue) => (
            <li key={issue.number} className="text-xs flex items-baseline gap-2">
              <a
                href={issue.htmlUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[#cbd5e1] hover:text-[#38bdf8] hover:underline"
              >
                <span className="font-mono text-[#64748b]">#{issue.number}</span> {issue.title}
              </a>
              {issue.createdAt && (
                <span className="text-[0.68rem] text-[#64748b] font-mono shrink-0">
                  {ageLabel(issue.createdAt)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
