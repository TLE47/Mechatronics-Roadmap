import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  KeyRound,
  LayoutDashboard,
  Loader2,
  LogOut,
  Mail,
  MonitorSmartphone,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { identityLabels, syncScopeLine } from '../accountRules';
import {
  currentAssurance,
  enrolTotp,
  verifiedTotpFactors,
  verifyTotp,
  type TotpEnrolment,
} from '../accounts';
import type { WorkspaceCounts } from '../workspaceMerge';

export interface SignUpOutcome {
  problem: string | null;
  needsVerification: boolean;
}

export interface WorkspacePreviewCounts {
  local: WorkspaceCounts;
  account: WorkspaceCounts;
}

interface AccountPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** False when the bundle was built without `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. */
  configured: boolean;
  /** The signed-in address, or null when signed out. */
  email: string | null;
  /** Sync status line shown under the account, e.g. "Progress synced". */
  note: string;
  /** A failed sign-in attempt owned by the app, shown in place of the form. */
  error: string | null;
  busy: boolean;
  /** Providers from the session's identities: `['email', 'google']`. */
  providers: string[];
  /** True while a password-reset link is being completed. */
  recovery: boolean;
  workspaceSync: boolean;
  workspacePreview: WorkspacePreviewCounts | null;
  /** What the last workspace merge brought in, if one has run in this tab. */
  workspaceReport: string | null;
  /** The learner's role, so the panel can offer the dashboard and (only for admins) the admin page. */
  role: string | null;
  onMagicLink: (email: string) => Promise<string | null>;
  onSignIn: (email: string, password: string) => Promise<string | null>;
  onCreateAccount: (email: string, password: string) => Promise<SignUpOutcome>;
  onPasswordReset: (email: string) => Promise<string | null>;
  onSetPassword: (password: string) => Promise<string | null>;
  onGoogle: () => Promise<string | null>;
  onSignOut: () => void;
  onToggleWorkspaceSync: (on: boolean) => void;
  onExportData: () => Promise<string | null>;
  onDeleteAccount: (confirmation: string) => Promise<string | null>;
  onOpenDashboard: () => void;
  onOpenAdmin: () => void;
}

type Mode = 'signin' | 'create' | 'reset' | 'password';

const inputClass =
  'w-full bg-panel border border-line rounded-lg px-3 py-2 text-sm text-ink placeholder:text-faint focus:outline-none focus:border-accent';

/**
 * One calm account flow: Google, or email with a password, or a sign-in link, or a reset link.
 *
 * Guest use stays the default everywhere else in the app; the panel is the only place that asks for
 * an account, and it always says what an account does and does not sync. The destructive control
 * (delete account) is behind a typed confirmation and explains exactly what it removes.
 */
export const AccountPanel: React.FC<AccountPanelProps> = ({
  isOpen,
  onClose,
  configured,
  email,
  note,
  error,
  busy,
  providers,
  recovery,
  workspaceSync,
  workspacePreview,
  workspaceReport,
  role,
  onMagicLink,
  onSignIn,
  onCreateAccount,
  onPasswordReset,
  onSetPassword,
  onGoogle,
  onSignOut,
  onToggleWorkspaceSync,
  onExportData,
  onDeleteAccount,
  onOpenDashboard,
  onOpenAdmin,
}) => {
  const [mode, setMode] = useState<Mode>('signin');
  const [draft, setDraft] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [assurance, setAssurance] = useState<'aal1' | 'aal2' | null>(null);
  const [enrolment, setEnrolment] = useState<TotpEnrolment | null>(null);
  const [factors, setFactors] = useState<Array<{ id: string; label: string }>>([]);
  const [code, setCode] = useState('');

  useEffect(() => {
    if (recovery) setMode('password');
  }, [recovery]);

  // The assurance level is a property of the session, so it is read when the panel opens and after
  // a code is verified — signing in again on another device starts back at aal1.
  useEffect(() => {
    if (!isOpen || !email) return;
    let live = true;
    void currentAssurance().then((level) => {
      if (live) setAssurance(level);
    });
    void verifiedTotpFactors().then((list) => {
      if (live) setFactors(list);
    });
    return () => {
      live = false;
    };
  }, [isOpen, email]);

  if (!isOpen) return null;

  const working = busy || pending;
  const problem = localError ?? error;
  // A returning admin has a verified factor; a first one has a fresh enrolment. Either way the form
  // is the same six digits, so the panel only needs to know which factor to check them against.
  const pendingFactor = enrolment ? { id: enrolment.factorId } : (factors[0] ?? null);

  const run = async (action: () => Promise<string | null>, success: string) => {
    setLocalError(null);
    setStatus(null);
    setPending(true);
    const failure = await action();
    setPending(false);
    if (failure) setLocalError(failure);
    else setStatus(success);
  };

  const submitForm = async (event: React.FormEvent) => {
    event.preventDefault();
    const address = draft.trim();
    if (mode === 'password') {
      await run(() => onSetPassword(password), 'Password updated. You are signed in.');
      return;
    }
    if (mode === 'reset') {
      await run(() => onPasswordReset(address), `If ${address} has an account, a reset link is on its way.`);
      return;
    }
    if (mode === 'create') {
      setLocalError(null);
      setStatus(null);
      setPending(true);
      const outcome = await onCreateAccount(address, password);
      setPending(false);
      if (outcome.problem) setLocalError(outcome.problem);
      else if (outcome.needsVerification) {
        setStatus(`Check ${address} for the confirmation link, then come back and sign in.`);
      } else {
        setStatus('Account created and signed in.');
      }
      return;
    }
    await run(() => onSignIn(address, password), 'Signed in.');
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 max-sm:items-end max-sm:p-0"
      role="dialog"
      aria-modal="true"
      aria-label="Account and progress sync"
      data-testid="account-panel"
    >
      <div className="bg-canvas border border-line rounded-xl w-full max-w-md p-5 text-ink shadow-2xl max-h-[90vh] overflow-y-auto max-sm:max-h-[92dvh] max-sm:rounded-b-none max-sm:rounded-t-2xl max-sm:border-x-0 max-sm:border-b-0 max-sm:pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <div className="flex items-start justify-between gap-3 border-b border-line pb-3 mb-4">
          <div>
            <h2 className="text-base font-bold tracking-tight">Account &amp; progress sync</h2>
            <p className="text-[11px] text-muted mt-1">
              {configured
                ? 'Learning is always open without an account. An account is for carrying your work between devices.'
                : 'This build keeps progress in this browser only.'}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close account panel"
            data-testid="btn-close-account"
            className="bg-raise hover:bg-elevate text-ink p-1.5 rounded-md border border-line transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!configured && (
          <div className="text-xs text-body space-y-2">
            <p>
              Cloud sync is not wired into this deployment yet. Everything still works: lessons, the
              workbench, drafts, notes, milestones and the learning log are stored in this browser, and
              the header&apos;s export buttons write them out as files.
            </p>
            <p className="text-muted">
              To turn it on, set <code className="text-accent">VITE_SUPABASE_URL</code> and{' '}
              <code className="text-accent">VITE_SUPABASE_ANON_KEY</code> for the build — see{' '}
              <code>docs/ACCOUNTS.md</code>.
            </p>
          </div>
        )}

        {configured && !email && (
          <div className="space-y-4">
            {mode === 'signin' && (
              <>
                <button
                  type="button"
                  disabled={working}
                  data-testid="btn-google-sign-in"
                  onClick={() => void run(onGoogle, '')}
                  className="w-full bg-raise hover:bg-elevate disabled:opacity-50 text-ink font-semibold text-sm px-3 py-2 rounded-lg border border-line flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <GoogleGlyph />
                  Continue with Google
                </button>
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-faint">
                  <span className="h-px flex-1 bg-line" />
                  or
                  <span className="h-px flex-1 bg-line" />
                </div>
              </>
            )}

            <form onSubmit={submitForm} className="space-y-3">
              {mode !== 'password' && (
                <>
                  <label className="block text-xs text-body" htmlFor="account-email">
                    Email address
                  </label>
                  <input
                    id="account-email"
                    data-testid="input-account-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="you@example.com"
                    className={inputClass}
                  />
                </>
              )}

              {(mode === 'signin' || mode === 'create' || mode === 'password') && (
                <>
                  <label className="block text-xs text-body" htmlFor="account-password">
                    {mode === 'password' ? 'New password' : 'Password'}
                  </label>
                  <input
                    id="account-password"
                    data-testid="input-account-password"
                    type="password"
                    required={mode !== 'signin'}
                    minLength={mode === 'signin' ? undefined : 10}
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={mode === 'signin' ? 'Your password (or use a link below)' : 'At least 10 characters'}
                    className={inputClass}
                  />
                </>
              )}

              <button
                type="submit"
                disabled={working}
                data-testid={
                  mode === 'signin'
                    ? 'btn-password-sign-in'
                    : mode === 'create'
                      ? 'btn-create-account'
                      : mode === 'reset'
                        ? 'btn-send-reset'
                        : 'btn-set-password'
                }
                className="w-full bg-accent hover:bg-accent/80 disabled:opacity-50 text-inverse font-bold text-sm px-3 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                {working ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                {mode === 'signin'
                  ? 'Sign in'
                  : mode === 'create'
                    ? 'Create account'
                    : mode === 'reset'
                      ? 'Email me a reset link'
                      : 'Set new password'}
              </button>
            </form>

            {mode === 'signin' && (
              <div className="space-y-2">
                <button
                  type="button"
                  disabled={working}
                  data-testid="btn-send-magic-link"
                  onClick={() => {
                    const address = draft.trim();
                    if (!address) {
                      setLocalError('Enter your email address first, then ask for a link.');
                      return;
                    }
                    void run(() => onMagicLink(address), `A sign-in link is on its way to ${address}.`);
                  }}
                  className="w-full bg-panel hover:bg-raise disabled:opacity-50 text-ink text-sm font-semibold px-3 py-2 rounded-lg border border-line flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Mail className="w-4 h-4" />
                  Email me a sign-in link
                </button>
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() => {
                      setMode('create');
                      setLocalError(null);
                    }}
                    className="text-accent hover:underline cursor-pointer"
                    data-testid="btn-show-create"
                  >
                    Create an account
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('reset');
                      setLocalError(null);
                    }}
                    className="text-muted hover:text-ink cursor-pointer"
                    data-testid="btn-show-reset"
                  >
                    Forgot password?
                  </button>
                </div>
              </div>
            )}

            {(mode === 'create' || mode === 'reset') && (
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setLocalError(null);
                }}
                className="text-[11px] text-muted hover:text-ink cursor-pointer"
              >
                ← Back to sign in
              </button>
            )}

            {status && !problem && (
              <p className="text-xs text-emerald flex items-start gap-1.5" data-testid="account-sent">
                <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{status}</span>
              </p>
            )}
            {problem && (
              <p className="text-xs text-rose flex items-start gap-1.5" data-testid="account-error">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{problem}</span>
              </p>
            )}

            <p className="text-[11px] text-muted leading-relaxed">
              No account is needed to read a lesson, run code or work offline. Signing in syncs progress;
              drafts, notes and checklist ticks only sync if you turn that on below.
            </p>
          </div>
        )}

        {configured && email && (
          <div className="space-y-4">
            <div className="text-sm text-ink">
              Signed in as <strong data-testid="account-email">{email}</strong>
            </div>
            <p className="text-xs text-muted" data-testid="account-sync-note">
              {note || 'Loading your saved progress…'}
            </p>

            <div className="rounded-lg border border-line-soft bg-panel px-3 py-2.5 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                <ShieldCheck className="w-3.5 h-3.5" />
                Sign-in methods
              </div>
              <p className="text-xs text-body" data-testid="account-methods">
                {identityLabels(providers).join(' · ') || 'Email'}
              </p>
              <p className="text-[11px] text-muted">
                Adding Google to an email account links it — sign in either way and the same progress is
                there.
              </p>
            </div>

            <div className="rounded-lg border border-line-soft bg-panel px-3 py-2.5 space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                <MonitorSmartphone className="w-3.5 h-3.5" />
                What syncs
              </div>
              <p className="text-xs text-body" data-testid="account-sync-scope">
                {syncScopeLine({ signedIn: true, workspace: workspaceSync })}
              </p>
              <label className="flex items-start gap-2 text-xs text-body cursor-pointer">
                <input
                  type="checkbox"
                  checked={workspaceSync}
                  disabled={working}
                  data-testid="toggle-workspace-sync"
                  onChange={(event) => onToggleWorkspaceSync(event.target.checked)}
                  className="mt-0.5 accent-[var(--accent)]"
                />
                <span>
                  Sync drafts, notes and checklists with this account
                  <span className="block text-[11px] text-muted">
                    Off by default. When two devices hold different versions, both are kept and listed on
                    your Home.
                  </span>
                </span>
              </label>

              {workspaceSync && workspacePreview && (
                <div className="text-[11px] text-muted space-y-1" data-testid="workspace-preview">
                  <p>
                    This browser: {workspacePreview.local.drafts} draft(s), {workspacePreview.local.notes}{' '}
                    note(s), {workspacePreview.local.highlights} highlight(s),{' '}
                    {workspacePreview.local.checks} checklist tick(s).
                  </p>
                  <p>
                    Account: {workspacePreview.account.drafts} draft(s), {workspacePreview.account.notes}{' '}
                    note(s), {workspacePreview.account.highlights} highlight(s),{' '}
                    {workspacePreview.account.checks} checklist tick(s).
                  </p>
                  {workspacePreview.account.conflicts > 0 && (
                    <p>{workspacePreview.account.conflicts} earlier conflict(s) are also on the account.</p>
                  )}
                </div>
              )}
              {workspaceReport && <p className="text-[11px] text-emerald">{workspaceReport}</p>}
            </div>

            <button
              onClick={onOpenDashboard}
              data-testid="btn-open-dashboard"
              className="w-full bg-raise hover:bg-elevate text-ink text-sm font-semibold px-3 py-2 rounded-lg border border-line flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <LayoutDashboard className="w-4 h-4" />
              Open my Home
            </button>

            {role === 'admin' && (
              <div className="rounded-lg border border-line-soft bg-panel px-3 py-2.5 space-y-2">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Two-factor
                </div>
                {assurance === 'aal2' ? (
                  <p className="text-xs text-emerald" data-testid="two-factor-on">
                    Verified for this session. Admin actions are open until you sign out.
                  </p>
                ) : pendingFactor ? (
                  <div className="space-y-2" data-testid="two-factor-enrol">
                    {enrolment ? (
                      <>
                        <p className="text-xs text-body">
                          Add this to an authenticator app, then type the six digits it shows. The secret
                          is shown once — this app does not keep it.
                        </p>
                        <code
                          className="block break-all bg-canvas border border-line rounded-md px-2 py-1.5 text-[11px] text-accent"
                          data-testid="totp-secret"
                        >
                          {enrolment.secret}
                        </code>
                        <a
                          href={enrolment.uri}
                          className="text-[11px] text-accent hover:underline break-all"
                          data-testid="totp-uri"
                        >
                          Open in an authenticator app
                        </a>
                      </>
                    ) : (
                      <p className="text-xs text-body" data-testid="two-factor-prompt">
                        Two-factor is already set up on this account. Enter the current six digits to
                        unlock admin actions in this session.
                      </p>
                    )}
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={code}
                      onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                      placeholder="123456"
                      aria-label="Six-digit code"
                      data-testid="input-totp-code"
                      className={inputClass}
                    />
                    <button
                      type="button"
                      disabled={working || code.length !== 6}
                      data-testid="btn-verify-totp"
                      onClick={() =>
                        void (async () => {
                          setLocalError(null);
                          setStatus(null);
                          setPending(true);
                          const failure = await verifyTotp(pendingFactor.id, code);
                          setPending(false);
                          if (failure) {
                            setLocalError(failure);
                            return;
                          }
                          setEnrolment(null);
                          setCode('');
                          setAssurance(await currentAssurance());
                          setStatus('Two-factor is on. Admin actions work in this session now.');
                        })()
                      }
                      className="w-full bg-accent hover:bg-accent/80 disabled:opacity-50 text-inverse text-xs font-bold px-3 py-2 rounded-lg cursor-pointer"
                    >
                      Verify code
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-body">
                      Admin actions need a six-digit code from an authenticator app. Set it up once, then
                      verify it each time you sign in.
                    </p>
                    <button
                      type="button"
                      disabled={working}
                      data-testid="btn-enrol-totp"
                      onClick={() =>
                        void (async () => {
                          setLocalError(null);
                          setStatus(null);
                          setPending(true);
                          const result = await enrolTotp();
                          setPending(false);
                          if (result.problem) {
                            setLocalError(result.problem);
                            // An account that already has a factor cannot enrol another; show the
                            // code form for the one it has instead of a dead end.
                            setFactors(await verifiedTotpFactors());
                          } else {
                            setEnrolment(result.enrolment);
                          }
                        })()
                      }
                      className="w-full bg-raise hover:bg-elevate disabled:opacity-50 text-ink text-xs font-semibold px-3 py-2 rounded-lg border border-line flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Set up two-factor
                    </button>
                  </div>
                )}
              </div>
            )}

            {role === 'admin' && (
              <button
                onClick={onOpenAdmin}
                data-testid="btn-open-admin"
                className="w-full bg-panel hover:bg-raise text-ink text-sm font-semibold px-3 py-2 rounded-lg border border-line flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <ExternalLink className="w-4 h-4" />
                Admin area
              </button>
            )}

            <div className="rounded-lg border border-line-soft bg-panel px-3 py-2.5 space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Your data</div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={working}
                  data-testid="btn-export-account"
                  onClick={() => void run(onExportData, 'A copy of your account data was downloaded.')}
                  className="flex-1 min-w-[9rem] bg-raise hover:bg-elevate disabled:opacity-50 text-ink text-xs font-semibold px-3 py-2 rounded-lg border border-line flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export my data
                </button>
                <button
                  type="button"
                  onClick={() => setShowDelete((open) => !open)}
                  data-testid="btn-show-delete"
                  className="flex-1 min-w-[9rem] bg-panel hover:bg-raise text-rose text-xs font-semibold px-3 py-2 rounded-lg border border-line flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete account
                </button>
              </div>
              {showDelete && (
                <div className="space-y-2" data-testid="delete-account-form">
                  <p className="text-[11px] text-muted">
                    This removes the account, its synced progress, draft and note copies, and its role.
                    Work in this browser stays where it is. Type <strong>DELETE</strong> to continue.
                  </p>
                  <input
                    type="text"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    aria-label="Type DELETE to confirm account deletion"
                    className={inputClass}
                  />
                  <button
                    type="button"
                    disabled={working || confirmation.trim() !== 'DELETE'}
                    data-testid="btn-delete-account"
                    onClick={() => void run(() => onDeleteAccount(confirmation.trim()), '')}
                    className="w-full bg-rose/90 hover:bg-rose disabled:opacity-40 text-inverse text-xs font-bold px-3 py-2 rounded-lg cursor-pointer"
                  >
                    Delete this account permanently
                  </button>
                </div>
              )}
            </div>

            {status && !problem && (
              <p className="text-xs text-emerald flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{status}</span>
              </p>
            )}
            {problem && (
              <p className="text-xs text-rose flex items-start gap-1.5" data-testid="account-error">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{problem}</span>
              </p>
            )}

            <button
              onClick={onSignOut}
              data-testid="btn-sign-out"
              className="w-full bg-raise hover:bg-elevate text-ink text-sm font-semibold px-3 py-2 rounded-lg border border-line flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
            <p className="text-[11px] text-muted">
              Signing out stops the sync; what is already in this browser stays.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

/** Google's mark, inline: no third-party request for an icon, and no image in the bundle. */
const GoogleGlyph: React.FC = () => (
  <svg viewBox="0 0 48 48" aria-hidden="true" className="w-4 h-4">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.3 17.6 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-2.8-.4-4.1H24v8.4h12.5c-.3 2.1-1.6 5.2-4.7 7.3l7.6 5.9c4.4-4.1 6.7-10.1 6.7-17.5z" />
    <path fill="#FBBC05" d="M10.4 28.7A14.6 14.6 0 0 1 9.6 24c0-1.6.3-3.2.8-4.7l-7.8-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.8-6.1z" />
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.9l-7.6-5.9c-2 1.4-4.7 2.5-8.3 2.5-6.4 0-11.7-3.8-13.6-9.1l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
  </svg>
);
