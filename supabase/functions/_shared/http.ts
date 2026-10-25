/**
 * The small shared surface of the three Edge Functions.
 *
 * Everything privileged in MechaLab crosses this file. The pattern is the same each time: read the
 * caller's JWT, ask Supabase who it belongs to (never trust a user id from the body), read that user's
 * role with the service-role client, and require a two-factor session before an admin action. The
 * browser never sees the service key; only these functions do, because only they run on the server.
 */

import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';

/**
 * CORS for the Pages origin.
 *
 * `APP_ORIGIN` is a comma-separated allow-list. When it is unset the function answers `*`, which is
 * fine for a public read but is not what production should run with; the deployment notes set it.
 */
export function corsHeaders(req: Request): Record<string, string> {
  const configured = (Deno.env.get('APP_ORIGIN') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const origin = req.headers.get('Origin') ?? '';
  const allow = configured.length === 0 ? '*' : configured.includes(origin) ? origin : configured[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export function preflight(req: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

function serverConfig(): { url: string; anon: string; service: string } | null {
  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anon || !service) return null;
  return { url, anon, service };
}

/**
 * The `aal` claim of a token `getUser()` has already validated.
 *
 * `auth.mfa.getAuthenticatorAssuranceLevel()` is not usable here: it reads the *stored session* of the
 * client it is called on, and this caller client is deliberately stateless (it carries the header and
 * nothing else), so the SDK would answer `null` for every request and lock every admin out. The claim
 * in the verified token says the same thing, and `getUser()` above has already checked its signature.
 */
function assuranceOf(accessToken: string): string | null {
  const payload = accessToken.split('.')[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof claims.aal === 'string' ? claims.aal : null;
  } catch {
    return null;
  }
}

export interface AdminContext {
  user: User;
  /** Service-role client: bypasses RLS by design, so every query below is scoped explicitly. */
  service: SupabaseClient;
}

/**
 * The caller, if they are a signed-in admin with an acceptable session.
 *
 * Returns a `Response` (401/403/500) instead of throwing, so each function's happy path reads as one
 * `instanceof Response` check.
 */
export async function requireAdmin(req: Request): Promise<AdminContext | Response> {
  const config = serverConfig();
  if (!config) return json(req, 500, { error: 'The server is missing its Supabase configuration.' });

  const authorization = req.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) return json(req, 401, { error: 'Sign in again.' });

  const callerClient = createClient(config.url, config.anon, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  const user = userData.user;
  if (userError || !user) return json(req, 401, { error: 'Sign in again — the session has expired.' });

  const service = createClient(config.url, config.service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: roleRow, error: roleError } = await service
    .from('mechalab_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();
  if (roleError) return json(req, 500, { error: 'Could not read the role table.' });
  if (roleRow?.role !== 'admin') return json(req, 403, { error: 'This account is not an admin.' });

  // Admin actions need a two-factor session. `ADMIN_REQUIRE_MFA=0` exists for a brand-new project
  // before anyone has enrolled a factor; production leaves it unset. Enrolment itself is Supabase's
  // MFA flow in the Auth settings, not something this bundle can bypass.
  if (Deno.env.get('ADMIN_REQUIRE_MFA') !== '0') {
    if (assuranceOf(authorization.slice('Bearer '.length)) !== 'aal2') {
      return json(req, 403, {
        error: 'Admin actions need a two-factor session. Enrol a TOTP factor, sign in again, and retry.',
      });
    }
  }

  return { user, service };
}

/** Write one audit row. Best-effort: a failed log must not turn a completed action into an error. */
export async function audit(
  service: SupabaseClient,
  actor: string | null,
  action: string,
  detail: Record<string, unknown>
): Promise<void> {
  const { error } = await service.from('mechalab_audit').insert({ actor, action, detail });
  if (error) console.error('audit insert failed', action, error.message);
}
