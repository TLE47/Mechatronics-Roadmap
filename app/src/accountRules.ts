/**
 * The account rules that are worth testing without a browser, a network or a Supabase project.
 *
 * `accounts.ts` talks to Supabase; this file only decides what is allowed to be sent, and how the UI
 * should describe what is on. `scripts/test_accounts.mjs` imports it under Node's type stripping, so
 * it has no imports of its own and no `import.meta.env`.
 */

/** Supabase's own floor is six; a course account also holds drafts, so it asks for ten. */
export const MIN_PASSWORD_LENGTH = 10;

/** What the email form is currently trying to do. One form, three verbs. */
export type AuthIntent = 'signin' | 'create' | 'reset';

/**
 * A deliberately loose address check: the only authority on whether an address exists is the mail
 * that arrives in it, and a stricter pattern would reject valid addresses for no benefit.
 */
export function emailProblem(raw: string): string | null {
  const email = raw.trim();
  if (!email) return 'Enter your email address.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'That does not look like an email address.';
  if (email.length > 254) return 'That address is too long.';
  return null;
}

/**
 * Length is the rule, because length is what actually helps a password. Rejected passwords explain
 * what to change rather than just refusing.
 */
export function passwordProblem(raw: string, email = ''): string | null {
  if (!raw) return 'Choose a password.';
  if (raw.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters — a short phrase is easier to remember than a short scramble.`;
  }
  if (raw.length > 200) return 'That password is too long.';
  if (email.trim() && raw.toLowerCase() === email.trim().toLowerCase()) {
    return 'Do not use your email address as the password.';
  }
  if (/^(.)\1+$/.test(raw)) return 'That password is one repeated character.';
  return null;
}

/** What a provider id from Supabase's `identities` looks like in the account panel. */
export function identityLabel(provider: string): string {
  switch (provider) {
    case 'email':
      return 'Email';
    case 'google':
      return 'Google';
    case 'github':
      return 'GitHub';
    default:
      return provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : 'Unknown';
  }
}

/** Distinct sign-in methods, in a stable order, for "connected methods" in account settings. */
export function identityLabels(providers: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const provider of providers) if (provider) seen.add(identityLabel(provider));
  return [...seen].sort((a, b) => a.localeCompare(b));
}

/**
 * The one admin predicate the UI uses. It is not the security boundary — row-level security and the
 * Edge Function are — but it keeps an admin surface from rendering for everyone else.
 */
export function isAdminRole(role: unknown): boolean {
  return role === 'admin';
}

/** The line under the account, saying exactly what leaves this browser. */
export function syncScopeLine(options: { signedIn: boolean; workspace: boolean }): string {
  if (!options.signedIn) return 'This build keeps your work in this browser only.';
  return options.workspace
    ? 'Your account syncs progress, drafts and notes.'
    : 'Your account syncs progress. Drafts and notes stay in this browser.';
}

/**
 * OAuth and emailed links come back with an error in the query string. Those codes are not sentences,
 * so this is where they become one. `null` means "no error to show".
 */
export function authCallbackProblem(error: string | null, description: string | null): string | null {
  if (!error) return null;
  if (/access_denied|cancelled|canceled/i.test(error) || /denied|cancel/i.test(description ?? '')) {
    return 'Sign-in was cancelled — nothing changed.';
  }
  if (/expired/i.test(error) || /expired/i.test(description ?? '')) {
    return 'That link has expired. Send yourself a new one.';
  }
  if (/invalid|not found|missing/i.test(error)) {
    return 'That sign-in link has already been used. Request a fresh one.';
  }
  return description?.trim() || 'Sign-in could not be completed. Try again.';
}

/**
 * Which TOTP factors a fresh enrolment has to clear first.
 *
 * Supabase refuses a second factor with a friendly name that is already in use, and a half-finished
 * attempt — the secret was shown, the code never arrived — leaves exactly that: an `unverified`
 * factor under `MechaLab admin`. Left alone it is a dead end: the panel offers *Set up two-factor*,
 * enrolment is rejected, and `verifiedTotpFactors` stays empty because an unverified factor protects
 * nothing. Those are the ones to remove before enrolling again; a **verified** factor is never in this
 * list, because it is the account's real second lock and replacing it silently would drop a lock the
 * learner set.
 */
export function staleTotpFactors(
  factors: Array<{ id: string; factor_type?: string; status?: string }> | null | undefined
): Array<{ id: string }> {
  return (factors ?? [])
    .filter((factor) => (factor.factor_type ?? 'totp') === 'totp' && factor.status === 'unverified')
    .map((factor) => ({ id: factor.id }));
}

/** True when a session's user has confirmed an address; magic-link accounts count as confirmed. */
export function isVerifiedUser(user: { email_confirmed_at?: string | null; confirmed_at?: string | null } | null): boolean {
  return Boolean(user?.email_confirmed_at || user?.confirmed_at);
}
