import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import {
  ADMIN_CAPABILITIES,
  ADMIN_DENIAL_TEXT,
  adminDenial,
} from '../adminModel';
import {
  assignRole,
  clearSiteSetting,
  openCurriculumPullRequest,
  readAudit,
  readSiteSettings,
  writeSiteSetting,
  type AuditEntry,
  type SiteSetting,
} from '../accountActions';

export interface AdminDashboardProps {
  configured: boolean;
  signedIn: boolean;
  role: string | null;
  version: string;
  onBack: () => void;
  onOpenAccount: () => void;
}

const card = 'rounded-xl border border-line bg-panel p-4 space-y-2.5';
const heading = 'text-[11px] font-semibold uppercase tracking-wide text-muted';
const input =
  'w-full bg-canvas border border-line rounded-lg px-3 py-2 text-xs text-ink placeholder:text-faint focus:outline-none focus:border-accent';
const button =
  'bg-raise hover:bg-elevate disabled:opacity-50 text-ink text-xs font-semibold px-3 py-2 rounded-lg border border-line flex items-center justify-center gap-1.5 cursor-pointer';

/**
 * The admin area.
 *
 * Hidden behind a role, but hiding is not the security: every write below goes through an Edge
 * Function that re-reads the caller's role, refuses an un-enrolled MFA session, and records what it
 * did. The page cannot read another learner's drafts, notes or code at all — the database grants it
 * no access to them.
 */
export const AdminDashboard: React.FC<AdminDashboardProps> = (props) => {
  const denial = adminDenial({ configured: props.configured, signedIn: props.signedIn, role: props.role });
  const [settings, setSettings] = useState<SiteSetting[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [announcement, setAnnouncement] = useState('');
  const [target, setTarget] = useState('');
  const [targetRole, setTargetRole] = useState<'admin' | 'learner'>('learner');
  const [lessonPath, setLessonPath] = useState('');
  const [summary, setSummary] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (denial) return;
    let live = true;
    readSiteSettings()
      .then((result) => {
        if (!live) return;
        if (result.problem) setError(result.problem);
        else setSettings(result.data?.settings ?? []);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [denial]);

  const act = async (work: () => Promise<string | null>, success: string) => {
    setError(null);
    setDone(null);
    setBusy(true);
    const problem = await work();
    setBusy(false);
    if (problem) setError(problem);
    else setDone(success);
  };

  const saveAnnouncement = () =>
    act(async () => {
      const result = await writeSiteSetting('announcement', announcement.trim());
      if (result.problem) return result.problem;
      setSettings((current) => [
        ...current.filter((setting) => setting.key !== 'announcement'),
        { key: 'announcement', value: announcement.trim(), updatedAt: new Date().toISOString(), updatedBy: null },
      ]);
      return null;
    }, 'Announcement saved. It appears on the next visit.');

  const removeAnnouncement = () =>
    act(async () => {
      const result = await clearSiteSetting('announcement');
      if (result.problem) return result.problem;
      setSettings((current) => current.filter((setting) => setting.key !== 'announcement'));
      setAnnouncement('');
      return null;
    }, 'Announcement cleared.');

  const grant = () =>
    act(async () => {
      const result = await assignRole(target.trim(), targetRole);
      if (result.problem) return result.problem;
      setTarget('');
      return null;
    }, `Role set. The change is recorded in the audit log.`);

  const loadAudit = () =>
    act(async () => {
      const result = await readAudit(50);
      if (result.problem) return result.problem;
      setAudit(result.data?.entries ?? []);
      return null;
    }, 'Audit log loaded.');

  const openPullRequest = () =>
    act(async () => {
      const result = await openCurriculumPullRequest({
        lessonPath: lessonPath.trim(),
        markdown,
        summary: summary.trim(),
      });
      if (result.problem) return result.problem;
      setDone(
        result.data?.url
          ? `Pull request #${result.data.number} opened: ${result.data.url}`
          : 'Pull request opened.'
      );
      return null;
    }, '');

  if (denial) {
    return (
      <div className="max-w-lg mx-auto px-4 py-10" data-testid="admin-denied">
        <div className={`${card} items-start`}>
          <div className="flex items-center gap-2 text-amber">
            <ShieldAlert className="w-4 h-4" />
            <h1 className="text-base font-bold text-ink">Admin area</h1>
          </div>
          <p className="text-xs text-body" data-testid="admin-denied-text">
            {ADMIN_DENIAL_TEXT[denial]}
          </p>
          <p className="text-[11px] text-muted">
            Admin access is a role stored on the server. It cannot be granted from this page, from a
            profile field or from the browser console.
          </p>
          <div className="flex gap-2">
            <button onClick={props.onBack} className={button} data-testid="btn-admin-back">
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to the workbench
            </button>
            <button onClick={props.onOpenAccount} className={button}>
              Account
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-4" data-testid="admin-dashboard">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <button
            onClick={props.onBack}
            className="text-[11px] text-muted hover:text-ink flex items-center gap-1 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to the workbench
          </button>
          <h1 className="text-xl font-bold text-ink flex items-center gap-2 mt-1">
            <ShieldCheck className="w-5 h-5 text-accent" />
            Site administration
          </h1>
          <p className="text-xs text-muted mt-1">
            MechaLab {props.version} · every action below is re-checked server-side and logged.
          </p>
        </div>
      </div>

      {(error || done) && (
        <div
          className={`text-xs rounded-lg border px-3 py-2 flex items-start gap-1.5 ${
            error ? 'border-rose/40 text-rose' : 'border-emerald/40 text-emerald'
          }`}
          data-testid={error ? 'admin-error' : 'admin-done'}
        >
          {error ? <AlertTriangle className="w-3.5 h-3.5 mt-0.5" /> : <CheckCircle2 className="w-3.5 h-3.5 mt-0.5" />}
          <span>{error ?? done}</span>
        </div>
      )}

      <section className={card} data-testid="admin-overview">
        <div className={heading}>Overview</div>
        <ul className="grid gap-2 sm:grid-cols-3 text-xs text-body">
          {ADMIN_CAPABILITIES.map((capability) => (
            <li key={capability.id} className="rounded-lg border border-line-soft bg-canvas px-3 py-2">
              <div className="font-semibold text-ink">{capability.title}</div>
              <div className="text-[11px] text-muted">{capability.detail}</div>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={card} data-testid="admin-settings">
          <div className={heading}>Announcement banner</div>
          <p className="text-[11px] text-muted">
            Public: every visitor reads this key. Keep it to one sentence, or leave it empty.
          </p>
          <textarea
            value={announcement}
            onChange={(event) => setAnnouncement(event.target.value)}
            rows={3}
            maxLength={280}
            aria-label="Announcement text"
            className={input}
            placeholder="Maintenance on Sunday 09:00–10:00 UTC."
          />
          <div className="flex flex-wrap gap-2">
            <button onClick={saveAnnouncement} disabled={busy} className={button} data-testid="btn-save-announcement">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Save announcement
            </button>
            <button onClick={removeAnnouncement} disabled={busy} className={button}>
              Clear
            </button>
          </div>
          {settings.length > 0 && (
            <p className="text-[11px] text-muted">
              Stored keys: {settings.map((setting) => setting.key).join(', ')}
            </p>
          )}
        </section>

        <section className={card} data-testid="admin-roles">
          <div className={heading}>Roles</div>
          <p className="text-[11px] text-muted">
            Paste an account&apos;s user id (Supabase → Authentication → Users). The first admin is
            assigned in the SQL editor, out of band; no account can grant itself a role.
          </p>
          <input
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
            aria-label="Account user id"
            className={input}
          />
          <div className="flex gap-2">
            <select
              value={targetRole}
              onChange={(event) => setTargetRole(event.target.value === 'admin' ? 'admin' : 'learner')}
              aria-label="Role"
              className={input}
            >
              <option value="learner">learner</option>
              <option value="admin">admin</option>
            </select>
            <button onClick={grant} disabled={busy || !target.trim()} className={button} data-testid="btn-assign-role">
              Set role
            </button>
          </div>
        </section>

        <section className={card} data-testid="admin-audit">
          <div className={heading}>Audit log</div>
          <button onClick={loadAudit} disabled={busy} className={button} data-testid="btn-load-audit">
            Load the last 50 actions
          </button>
          {audit.length === 0 ? (
            <p className="text-[11px] text-muted">Nothing loaded yet.</p>
          ) : (
            <ul className="text-[11px] text-body space-y-1 max-h-52 overflow-y-auto">
              {audit.map((entry, index) => (
                <li key={`${entry.at}-${index}`} className="border-b border-line-soft pb-1">
                  <span className="text-ink font-semibold">{entry.action}</span> ·{' '}
                  {new Date(entry.at).toLocaleString()} · {entry.actor ? entry.actor.slice(0, 8) : 'unknown'}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={card} data-testid="admin-curriculum">
          <div className={heading}>Curriculum change → pull request</div>
          <p className="text-[11px] text-muted">
            The lesson files stay the source of truth. This opens a PR with your edit; CI and the
            generators decide whether it publishes.
          </p>
          <input
            value={lessonPath}
            onChange={(event) => setLessonPath(event.target.value)}
            placeholder="modules/05-control.T2.05a.md"
            aria-label="Lesson path"
            className={input}
          />
          <input
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            placeholder="Tighten the anti-windup derivation"
            aria-label="Pull request summary"
            className={input}
          />
          <textarea
            value={markdown}
            onChange={(event) => setMarkdown(event.target.value)}
            rows={5}
            aria-label="Proposed lesson markdown"
            placeholder="The file's new contents…"
            className={`${input} font-mono`}
          />
          <button
            onClick={openPullRequest}
            disabled={busy || !lessonPath.trim() || !summary.trim() || !markdown.trim()}
            className={button}
            data-testid="btn-open-pr"
          >
            Open pull request
          </button>
        </section>
      </div>
    </div>
  );
};
