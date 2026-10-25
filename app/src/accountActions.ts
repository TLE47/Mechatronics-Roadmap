/**
 * The browser's side of the Edge Functions.
 *
 * Everything privileged — deleting an account and its rows, granting a role, writing a site setting,
 * opening a curriculum pull request — happens on the server, where the service-role key and the GitHub
 * App private key live. This module only sends the request with the learner's own session attached
 * (`functions.invoke` adds the JWT) and turns a refusal into a sentence.
 *
 * No key is read here, and none can be: the only environment variables this bundle sees are the
 * publishable URL and anon key.
 */

import { getClient } from './accounts';

export interface FunctionResult<T> {
  data: T | null;
  problem: string | null;
  /** The HTTP status, when there was a response; null for "never got that far". */
  status: number | null;
}

/** A denial the server writes about itself; anything else becomes the generic sentence. */
function describe(status: number | null, message: string): string {
  if (status === 401) return 'Sign in again — the session has expired.';
  if (status === 403) return 'This account is not allowed to do that.';
  if (status === 429) return 'Too many attempts — wait a minute and try again.';
  if (status === 501) return 'That server-side action is not deployed on this project yet.';
  if (message && !/edge function returned a non-2xx/i.test(message)) return message;
  return 'The server-side action did not complete. Try again.';
}

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<FunctionResult<T>> {
  const supabase = await getClient();
  if (!supabase) {
    return { data: null, problem: 'Cloud sync is not configured for this build.', status: null };
  }
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (!error) return { data: data as T, problem: null, status: 200 };

  const status = typeof (error as { context?: { status?: number } }).context?.status === 'number'
    ? (error as { context: { status: number } }).context.status
    : null;
  let message = error.message ?? '';
  const context = (error as { context?: Response }).context;
  if (context && typeof context.json === 'function') {
    try {
      const parsed: unknown = await context.json();
      const serverMessage = (parsed as { error?: unknown })?.error;
      if (typeof serverMessage === 'string' && serverMessage) message = serverMessage;
    } catch {
      // A non-JSON error body (a proxy page, an empty 500) keeps the SDK's message.
    }
  }
  return { data: null, problem: describe(status, message), status };
}

// ── The learner's own data ───────────────────────────────────────────────────────────────────────

export interface AccountExport {
  exportedAt: string;
  account: { id: string; email: string | null; createdAt: string | null; providers: string[] };
  progress: unknown;
  workspace: unknown;
}

/** Everything this account holds, as one JSON document. Safe to keep, print or move. */
export function exportAccountData(): Promise<FunctionResult<AccountExport>> {
  return invoke<AccountExport>('account-action', { action: 'export' });
}

/**
 * Delete the account: the function removes the rows and then the auth user, with the caller's own
 * identity, so there is no way to delete someone else's account. The confirmation word is checked on
 * both sides — the server refuses a request that does not say it.
 */
export function deleteAccount(confirmation: string): Promise<FunctionResult<{ deleted: true }>> {
  return invoke<{ deleted: true }>('account-action', { action: 'delete', confirmation });
}

// ── Admin ────────────────────────────────────────────────────────────────────────────────────────

export interface SiteSetting {
  key: string;
  value: unknown;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface AuditEntry {
  at: string;
  actor: string | null;
  action: string;
  detail: unknown;
}

export function readSiteSettings(): Promise<FunctionResult<{ settings: SiteSetting[] }>> {
  return invoke('admin-action', { action: 'site_settings.list' });
}

export function writeSiteSetting(key: string, value: unknown): Promise<FunctionResult<{ setting: SiteSetting }>> {
  return invoke('admin-action', { action: 'site_setting.set', key, value });
}

export function clearSiteSetting(key: string): Promise<FunctionResult<{ cleared: string }>> {
  return invoke('admin-action', { action: 'site_setting.clear', key });
}

export function readAudit(limit = 50): Promise<FunctionResult<{ entries: AuditEntry[] }>> {
  return invoke('admin-action', { action: 'audit.list', limit });
}

export function assignRole(userId: string, role: 'admin' | 'learner'): Promise<FunctionResult<{ role: string }>> {
  return invoke('admin-action', { action: 'role.assign', userId, role });
}

export interface PullRequestResult {
  url: string;
  number: number;
  branch: string;
}

/** Open a curriculum change as a pull request. CI, not the dashboard, decides whether it ships. */
export function openCurriculumPullRequest(input: {
  lessonPath: string;
  markdown: string;
  summary: string;
}): Promise<FunctionResult<PullRequestResult>> {
  return invoke('curriculum-pr', input);
}
