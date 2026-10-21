import React, { useState } from 'react';
import { X, Mail, LogOut, CheckCircle2, AlertTriangle } from 'lucide-react';

interface AccountPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** False when the bundle was built without `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. */
  configured: boolean;
  /** The signed-in address, or null when signed out. */
  email: string | null;
  /** Sync status line shown under the account, e.g. "Progress synced". */
  note: string;
  /** A failed sign-in attempt, shown in place of the form. */
  error: string | null;
  busy: boolean;
  onSendLink: (email: string) => void;
  onSignOut: () => void;
}

export const AccountPanel: React.FC<AccountPanelProps> = ({
  isOpen,
  onClose,
  configured,
  email,
  note,
  error,
  busy,
  onSendLink,
  onSignOut,
}) => {
  const [draft, setDraft] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);

  if (!isOpen) return null;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const address = draft.trim();
    if (!address) return;
    setSentTo(address);
    onSendLink(address);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Account and progress sync"
      data-testid="account-panel"
    >
      <div className="bg-canvas border border-line rounded-xl w-full max-w-md p-5 text-ink shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-line pb-3 mb-4">
          <div>
            <h2 className="text-base font-bold tracking-tight">Account &amp; progress sync</h2>
            <p className="text-[11px] text-muted mt-1">
              {configured
                ? 'Sign in with an emailed link — no password. Your progress follows you to any browser.'
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
              Cloud sync is not wired into this deployment yet. Everything still works: milestones,
              verified lessons and the learning log are stored in this browser, and the header's export
              buttons write them out as files.
            </p>
            <p className="text-muted">
              To turn it on, set <code className="text-accent">VITE_SUPABASE_URL</code> and{' '}
              <code className="text-accent">VITE_SUPABASE_ANON_KEY</code> for the build — see{' '}
              <code>docs/ACCOUNTS.md</code>.
            </p>
          </div>
        )}

        {configured && !email && (
          <form onSubmit={submit} className="space-y-3">
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
              className="w-full bg-panel border border-line rounded-lg px-3 py-2 text-sm text-ink placeholder:text-faint focus:outline-none focus:border-accent"
            />
            <button
              type="submit"
              disabled={busy}
              data-testid="btn-send-magic-link"
              className="w-full bg-accent hover:bg-accent/80 disabled:opacity-50 text-inverse font-bold text-sm px-3 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Mail className="w-4 h-4" />
              {busy ? 'Sending…' : 'Email me a sign-in link'}
            </button>
            {sentTo && !error && (
              <p className="text-xs text-emerald flex items-start gap-1.5" data-testid="account-sent">
                <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  Link sent to <strong>{sentTo}</strong>. Open it on this device to finish signing in.
                </span>
              </p>
            )}
            {error && (
              <p className="text-xs text-rose flex items-start gap-1.5" data-testid="account-error">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{error}</span>
              </p>
            )}
          </form>
        )}

        {configured && email && (
          <div className="space-y-3">
            <div className="text-sm text-ink">
              Signed in as <strong data-testid="account-email">{email}</strong>
            </div>
            <p className="text-xs text-muted" data-testid="account-sync-note">
              {note || 'Loading your saved progress…'}
            </p>
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
