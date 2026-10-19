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
      <div className="bg-[#0b0f19] border border-[#334155] rounded-xl w-full max-w-md p-5 text-[#f1f5f9] shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-[#334155] pb-3 mb-4">
          <div>
            <h2 className="text-base font-bold tracking-tight">Account &amp; progress sync</h2>
            <p className="text-[11px] text-[#94a3b8] mt-1">
              {configured
                ? 'Sign in with an emailed link — no password. Your progress follows you to any browser.'
                : 'This build keeps progress in this browser only.'}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close account panel"
            data-testid="btn-close-account"
            className="bg-[#1e293b] hover:bg-[#334155] text-[#f1f5f9] p-1.5 rounded-md border border-[#334155] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!configured && (
          <div className="text-xs text-[#cbd5e1] space-y-2">
            <p>
              Cloud sync is not wired into this deployment yet. Everything still works: milestones,
              verified lessons and the learning log are stored in this browser, and the header's export
              buttons write them out as files.
            </p>
            <p className="text-[#94a3b8]">
              To turn it on, set <code className="text-[#38bdf8]">VITE_SUPABASE_URL</code> and{' '}
              <code className="text-[#38bdf8]">VITE_SUPABASE_ANON_KEY</code> for the build — see{' '}
              <code>docs/ACCOUNTS.md</code>.
            </p>
          </div>
        )}

        {configured && !email && (
          <form onSubmit={submit} className="space-y-3">
            <label className="block text-xs text-[#cbd5e1]" htmlFor="account-email">
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
              className="w-full bg-[#111827] border border-[#334155] rounded-lg px-3 py-2 text-sm text-[#f1f5f9] placeholder:text-[#475569] focus:outline-none focus:border-[#38bdf8]"
            />
            <button
              type="submit"
              disabled={busy}
              data-testid="btn-send-magic-link"
              className="w-full bg-[#38bdf8] hover:bg-[#38bdf8]/80 disabled:opacity-50 text-[#090d16] font-bold text-sm px-3 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Mail className="w-4 h-4" />
              {busy ? 'Sending…' : 'Email me a sign-in link'}
            </button>
            {sentTo && !error && (
              <p className="text-xs text-[#34d399] flex items-start gap-1.5" data-testid="account-sent">
                <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  Link sent to <strong>{sentTo}</strong>. Open it on this device to finish signing in.
                </span>
              </p>
            )}
            {error && (
              <p className="text-xs text-[#fca5a5] flex items-start gap-1.5" data-testid="account-error">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{error}</span>
              </p>
            )}
          </form>
        )}

        {configured && email && (
          <div className="space-y-3">
            <div className="text-sm text-[#f1f5f9]">
              Signed in as <strong data-testid="account-email">{email}</strong>
            </div>
            <p className="text-xs text-[#94a3b8]" data-testid="account-sync-note">
              {note || 'Loading your saved progress…'}
            </p>
            <button
              onClick={onSignOut}
              data-testid="btn-sign-out"
              className="w-full bg-[#1e293b] hover:bg-[#334155] text-[#f1f5f9] text-sm font-semibold px-3 py-2 rounded-lg border border-[#334155] flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
            <p className="text-[11px] text-[#94a3b8]">
              Signing out stops the sync; what is already in this browser stays.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
