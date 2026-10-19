/**
 * Optional accounts: sign in with an emailed link, and nothing else.
 *
 * The workbench is a static bundle on GitHub Pages, so there is no server of our own to authenticate
 * against. Supabase's public `anon` key is designed to ship in the bundle; every row is protected by
 * row-level security keyed on `auth.uid()`, so the key alone reads and writes nothing.
 *
 * With neither `VITE_SUPABASE_URL` nor `VITE_SUPABASE_ANON_KEY` set at build time the module stays
 * inert: `accountsConfigured` is false, the SDK is never imported, no request is made, and the
 * workbench keeps its original local-only behaviour. That is also what `npm run dev` does until you
 * add a `.env.local` (see `docs/ACCOUNTS.md`).
 *
 * The SDK is imported on demand, so it lands in its own chunk: a learner who never signs in does not
 * download it, and the main bundle stays the size it was before accounts existed.
 */

import type { Session, SupabaseClient } from '@supabase/supabase-js';

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
          // The emailed link comes back to this page with the token in the URL fragment.
          detectSessionInUrl: true,
          flowType: 'pkce',
        },
      })
    );
  }
  return clientPromise;
}

/** Where the emailed link returns to: the site root, under the Pages base path when there is one. */
export function signInReturnUrl(): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}`;
}

function readable(message: string): string {
  if (/rate limit|too many/i.test(message)) return 'Too many sign-in emails just now — try again in a minute.';
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return 'Could not reach the sign-in service — check your connection and try again.';
  }
  if (/invalid email|email address/i.test(message)) return 'That does not look like an email address.';
  return message;
}

export async function sendMagicLink(email: string): Promise<string | null> {
  const supabase = await getClient();
  if (!supabase) return 'Cloud sync is not configured for this build.';
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: signInReturnUrl() },
  });
  return error ? readable(error.message) : null;
}

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

/** Subscribe to sign-in/out, including the session a returning magic link creates. */
export async function onSessionChange(callback: (session: Session | null) => void): Promise<() => void> {
  const supabase = await getClient();
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}
