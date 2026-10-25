/**
 * The learner's own data: export it, or delete the account.
 *
 * Two things the browser cannot do for itself. Reading both rows is already allowed by RLS, but an
 * export has to be one document assembled the same way every time, and deleting an auth user requires
 * the service-role key. Both actions run as the caller: the identity comes from their JWT, never from
 * the request body, so there is no user id here that could name somebody else.
 *
 * Deployment:
 *   supabase functions deploy account-action
 * No extra secrets: SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { audit, json, preflight } from '../_shared/http.ts';

interface RequestBody {
  action?: string;
  confirmation?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return preflight(req);
  if (req.method !== 'POST') return json(req, 405, { error: 'Use POST.' });

  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anon || !serviceKey) {
    return json(req, 500, { error: 'The server is missing its Supabase configuration.' });
  }

  const authorization = req.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) return json(req, 401, { error: 'Sign in again.' });

  const callerClient = createClient(url, anon, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  const user = userData.user;
  if (userError || !user) return json(req, 401, { error: 'Sign in again — the session has expired.' });

  const service = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return json(req, 400, { error: 'The request body was not JSON.' });
  }

  if (body.action === 'export') {
    const [progress, workspace] = await Promise.all([
      service.from('mechalab_progress').select('snapshot, updated_at').eq('user_id', user.id).maybeSingle(),
      service.from('mechalab_workspace').select('workspace, updated_at').eq('user_id', user.id).maybeSingle(),
    ]);
    return json(req, 200, {
      exportedAt: new Date().toISOString(),
      account: {
        id: user.id,
        email: user.email ?? null,
        createdAt: user.created_at ?? null,
        providers: (user.identities ?? []).map((identity) => identity.provider).filter(Boolean),
      },
      progress: progress.data?.snapshot ?? null,
      workspace: workspace.data?.workspace ?? null,
    });
  }

  if (body.action === 'delete') {
    if (body.confirmation !== 'DELETE') {
      return json(req, 400, { error: 'Type DELETE to confirm account deletion.' });
    }
    // Explicit deletes first, then the auth user: a project that created `mechalab_progress` by hand
    // before the cascade was documented still ends up with no rows left behind.
    await audit(service, user.id, 'account.delete', { email: user.email ?? null });
    const failures: string[] = [];
    for (const table of ['mechalab_workspace', 'mechalab_progress', 'mechalab_roles']) {
      const { error } = await service.from(table).delete().eq('user_id', user.id);
      // A missing table means the project never ran that migration; nothing to delete, not a failure.
      if (error && !/does not exist|schema cache/i.test(error.message)) failures.push(`${table}: ${error.message}`);
    }
    const { error: deleteError } = await service.auth.admin.deleteUser(user.id);
    if (deleteError) failures.push(`auth: ${deleteError.message}`);
    if (failures.length > 0) {
      return json(req, 500, { error: `The account was not fully deleted: ${failures.join('; ')}` });
    }
    return json(req, 200, { deleted: true });
  }

  return json(req, 400, { error: 'Unknown action.' });
});
