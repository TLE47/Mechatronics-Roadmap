/**
 * Optional accounts: Google, email + password, and the emailed sign-in link, all against Supabase.
 *
 * The workbench is a static bundle on GitHub Pages, so there is no server of our own to authenticate
 * against. Supabase's public `anon` key is designed to ship in the bundle; every row is protected by
 * row-level security keyed on `auth.uid()`, so the key alone reads and writes nothing. Anything that
 * needs the service-role key (account deletion, role changes, opening a curriculum pull request)
 * lives in an Edge Function and is called through `accountActions.ts`, never from here.
 *
 * With neither `VITE_SUPABASE_URL` nor `VITE_SUPABASE_ANON_KEY` set at build time the module stays
 * inert: `accountsConfigured` is false, the SDK is never imported, no request is made, and the
 * workbench keeps its original local-only behaviour. That is also what `npm run dev` does until you
 * add a `.env.local` (see `docs/ACCOUNTS.md`).
 *
 * The SDK is imported on demand, so it lands in its own chunk: a learner who never signs in does not
 * download it, and the main bundle stays the size it was before accounts existed.
 */

import type { Session, SupabaseClient, UserIdentity } from '@supabase/supabase-js';
import { buildReturnUrl } from './returnTo';
import { staleTotpFactors } from './accountRules';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim();
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const accountsConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let clientPromise: Promise<SupabaseClient | null> | null = null;

/** The one client for this page, created at most once and only when someone asks for it. */
export function getClient(): Promise<SupabaseClient | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return Promise.resolve(null);
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          // The emailed link, the reset link and the Google callback all return here with a token.
          detectSessionInUrl: true,
          flowType: 'pkce',
        },
      })
    );
  }
  return clientPromise;
}

/**
 * Where a sign-in round trip returns to.
 *
 * `returnTo` is an internal destination (`?lesson=P.1`, `?view=dashboard`). It is reduced to
 * something under this origin and base path by `returnTo.ts`; a URL from anywhere else becomes the
 * plain site root, so this cannot be used as an open redirect. Supabase still has to list the origin
 * and base path in its redirect allow-list — the sanitising here is the second lock, not the only one.
 */
export function signInReturnUrl(returnTo = ''): string {
  return buildReturnUrl(window.location.origin, import.meta.env.BASE_URL, returnTo);
}

/** Supabase error codes and messages are not sentences; this is the one translation table. */
function readable(message: string): string {
  if (/rate limit|too many/i.test(message)) return 'Too many attempts just now — try again in a minute.';
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return 'Could not reach the sign-in service — check your connection and try again.';
  }
  if (/invalid login credentials/i.test(message)) return 'That email and password do not match an account.';
  if (/email not confirmed|not confirmed/i.test(message)) {
    return 'Confirm your email first — the message from the sign-up has the link.';
  }
  if (/already registered|already been registered/i.test(message)) {
    return 'That email already has an account. Sign in instead, or use “Forgot password”.';
  }
  if (/invalid email|email address/i.test(message)) return 'That does not look like an email address.';
  if (/password.*(weak|short)|at least/i.test(message)) return 'That password is too short for this project.';
  if (/provider.*not enabled|unsupported provider/i.test(message)) {
    return 'Google sign-in is not enabled on this project yet — use an email sign-in for now.';
  }
  if (/invalid.*(totp|code)|totp.*invalid/i.test(message)) {
    return 'That code did not match — check the current six digits in your authenticator app.';
  }
  return message;
}

// ── Emailed link (kept from the first version: no password to remember) ───────────────────────────

export async function sendMagicLink(email: string, returnTo = ''): Promise<string | null> {
  const supabase = await getClient();
  if (!supabase) return 'Cloud sync is not configured for this build.';
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: signInReturnUrl(returnTo) },
  });
  return error ? readable(error.message) : null;
}

// ── Email + password ──────────────────────────────────────────────────────────────────────────────

export interface SignUpResult {
  problem: string | null;
  /** True when Supabase accepted the address and is waiting for the confirmation click. */
  needsVerification: boolean;
}

export async function signUpWithPassword(
  email: string,
  password: string,
  returnTo = ''
): Promise<SignUpResult> {
  const supabase = await getClient();
  if (!supabase) return { problem: 'Cloud sync is not configured for this build.', needsVerification: false };
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: signInReturnUrl(returnTo) },
  });
  if (error) return { problem: readable(error.message), needsVerification: false };
  // With confirmations on, Supabase returns a user and no session; with them off, a session.
  return { problem: null, needsVerification: Boolean(data.user && !data.session) };
}

export async function signInWithPassword(email: string, password: string): Promise<string | null> {
  const supabase = await getClient();
  if (!supabase) return 'Cloud sync is not configured for this build.';
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error ? readable(error.message) : null;
}

export async function sendPasswordReset(email: string, returnTo = ''): Promise<string | null> {
  const supabase = await getClient();
  if (!supabase) return 'Cloud sync is not configured for this build.';
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: signInReturnUrl(returnTo),
  });
  return error ? readable(error.message) : null;
}

/** Set a new password for the signed-in (or recovery) session. */
export async function updatePassword(password: string): Promise<string | null> {
  const supabase = await getClient();
  if (!supabase) return 'Cloud sync is not configured for this build.';
  const { error } = await supabase.auth.updateUser({ password });
  return error ? readable(error.message) : null;
}

/** True while a password-reset link is being completed, in either flow Supabase might use. */
export function isRecoveryLink(): boolean {
  if (typeof window === 'undefined' || !window.location) return false;
  const search = window.location.search ?? '';
  const hash = window.location.hash ?? '';
  return (
    new URLSearchParams(search).get('type') === 'recovery' ||
    new URLSearchParams(hash.replace(/^#/, '')).get('type') === 'recovery'
  );
}

// ── Google ────────────────────────────────────────────────────────────────────────────────────────

export async function signInWithGoogle(returnTo = ''): Promise<string | null> {
  const supabase = await getClient();
  if (!supabase) return 'Cloud sync is not configured for this build.';
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: signInReturnUrl(returnTo),
      // The same button serves a new and a returning learner, so let Google offer the accounts it
      // knows instead of silently reusing whichever session the browser happens to have.
      queryParams: { prompt: 'select_account' },
    },
  });
  return error ? readable(error.message) : null;
}

// ── Two-factor (TOTP), which admin actions require ─────────────────────────────────────────────────

export interface TotpEnrolment {
  factorId: string;
  /** The base32 secret, for an app that takes one by hand. */
  secret: string;
  /** `otpauth://totp/…`, which an authenticator app or password manager opens directly. */
  uri: string;
}

/**
 * Start a TOTP enrolment.
 *
 * Supabase requires an `aal1` session with no verified factor to reach this, so it is only offered
 * from the account panel of a signed-in admin. The secret is shown once here and never stored by
 * this app — it belongs in the learner's authenticator, not in the browser.
 */
export async function enrolTotp(): Promise<{ enrolment: TotpEnrolment | null; problem: string | null }> {
  const supabase = await getClient();
  if (!supabase) return { enrolment: null, problem: 'Cloud sync is not configured for this build.' };
  // A previous attempt that never got its code leaves an `unverified` factor under the same name, and
  // Supabase refuses a second factor with that name — so the account could not enrol again, and the
  // panel had no way out of it. An unverified factor protects nothing (`verifiedTotpFactors` does not
  // return it), so it is cleared here and replaced by the one whose secret this attempt shows.
  const { data: listed } = await supabase.auth.mfa.listFactors();
  for (const factor of staleTotpFactors(listed?.all)) {
    await supabase.auth.mfa.unenroll({ factorId: factor.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'MechaLab admin',
  });
  if (error || !data) {
    return { enrolment: null, problem: readable(error?.message ?? 'Could not start two-factor setup.') };
  }
  return {
    enrolment: { factorId: data.id, secret: data.totp.secret, uri: data.totp.uri },
    problem: null,
  };
}

/** Check a six-digit code. On success the session becomes `aal2`, which admin actions require. */
export async function verifyTotp(factorId: string, code: string): Promise<string | null> {
  const supabase = await getClient();
  if (!supabase) return 'Cloud sync is not configured for this build.';
  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
  if (challengeError || !challenge) {
    return readable(challengeError?.message ?? 'Could not start the code check.');
  }
  const { error } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code: code.trim(),
  });
  return error ? readable(error.message) : null;
}

/**
 * The TOTP factors already verified on this account.
 *
 * A returning admin has one of these, and needs to type a code — not enrol again. `listFactors`
 * returns only verified factors under `totp`, which is exactly the question the panel asks.
 */
export async function verifiedTotpFactors(): Promise<Array<{ id: string; label: string }>> {
  const supabase = await getClient();
  if (!supabase) return [];
  const { data } = await supabase.auth.mfa.listFactors();
  return (data?.totp ?? []).map((factor) => ({
    id: factor.id,
    label: factor.friendly_name ?? 'authenticator app',
  }));
}

/** `aal2` means a second factor was checked in this session; `aal1` means it was not. */
export async function currentAssurance(): Promise<'aal1' | 'aal2' | null> {
  const supabase = await getClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  // The SDK types this as `string & {}` as well, so it is narrowed by hand rather than trusted.
  const level: unknown = data?.currentLevel;
  return level === 'aal1' || level === 'aal2' ? level : null;
}

// ── Session helpers ─────────────────────────────────────────────────────────────────────────────

export async function signOutNow(): Promise<string | null> {
  const supabase = await getClient();
  if (!supabase) return null;
  const { error } = await supabase.auth.signOut();
  return error ? error.message : null;
}

export async function currentSession(): Promise<Session | null> {
  const supabase = await getClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

/**
 * Subscribe to sign-in/out, including the session a returning link creates.
 *
 * The event name is passed through because one of them is not a sign-in: `PASSWORD_RECOVERY` means a
 * reset link was just opened, and that is what puts the panel on "set a new password".
 */
export async function onSessionChange(
  callback: (session: Session | null, event: string) => void
): Promise<() => void> {
  const supabase = await getClient();
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((event, session) => callback(session, event));
  return () => data.subscription.unsubscribe();
}

/** Provider ids from the session's identities — what "connected sign-in methods" lists. */
export function sessionProviders(session: Session | null): string[] {
  const identities: UserIdentity[] = session?.user?.identities ?? [];
  return identities.map((identity) => identity.provider).filter(Boolean);
}

/**
 * This learner's role, read from their own row in `mechalab_roles`.
 *
 * RLS lets an authenticated user select only their own row and grants no write at all, so this cannot
 * be used to grant anything. A missing row, a missing table in an un-migrated project, or an offline
 * browser all mean "learner" — which is the safe answer.
 */
export async function loadMyRole(userId: string): Promise<string | null> {
  const supabase = await getClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('mechalab_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return null;
  const role: unknown = data?.role;
  return typeof role === 'string' ? role : null;
}
